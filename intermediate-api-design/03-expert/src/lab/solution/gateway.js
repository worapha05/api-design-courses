import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import depthLimit from 'graphql-depth-limit';
import { GraphQLError } from 'graphql';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Inventory = loadProto(path.join(__dirname, 'inventory.proto')).aether.v1.Inventory;
const MAX_COST = 40;

const certDir = path.join(__dirname, 'certs');
const useMtls =
  fs.existsSync(path.join(certDir, 'client.crt')) &&
  fs.existsSync(path.join(certDir, 'client.key')) &&
  fs.existsSync(path.join(certDir, 'ca.crt'));

const creds = useMtls
  ? grpc.credentials.createSsl(
      fs.readFileSync(path.join(certDir, 'ca.crt')),
      fs.readFileSync(path.join(certDir, 'client.key')),
      fs.readFileSync(path.join(certDir, 'client.crt')),
    )
  : grpc.credentials.createInsecure();

/** Reuse หนึ่ง channel ตลอดอายุ process — สำคัญต่อ HTTP/2 multiplexing */
const inventory = new Inventory('localhost:50057', creds);

function rpc(method, request, traceId) {
  return new Promise((resolve, reject) => {
    const md = new grpc.Metadata();
    md.set('x-trace-id', traceId);
    inventory[method](request, md, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

function estimateCost(document) {
  let cost = 0;

  const walk = (selections, mult = 1) => {
    for (const sel of selections || []) {
      if (sel.kind !== 'Field') continue;
      cost += (sel.name.value === 'item' || sel.name.value === 'reserve' ? 5 : 1) * mult;
      if (sel.selectionSet) walk(sel.selectionSet.selections, mult);
    }
  };

  for (const def of document.definitions) {
    if (def.kind === 'OperationDefinition') walk(def.selectionSet.selections);
  }

  return cost;
}

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  req.traceId = req.header('x-trace-id') || randomUUID();
  res.setHeader('x-trace-id', req.traceId);
  next();
});

app.get('/items/:sku', async (req, res) => {
  try {
    res.json(await rpc('getItem', { sku: req.params.sku }, req.traceId));
  } catch (err) {
    const status = err.code === grpc.status.NOT_FOUND ? 404 : 502;
    res.status(status).json({ error: err.details });
  }
});

app.post('/items/:sku/reserve', async (req, res) => {
  try {
    res.json(
      await rpc('reserve', { sku: req.params.sku, qty: Number(req.body.qty) || 1 }, req.traceId),
    );
  } catch (err) {
    let status = 502;
    if (err.code === grpc.status.NOT_FOUND) status = 404;
    if (err.code === grpc.status.FAILED_PRECONDITION) status = 409;
    if (err.code === grpc.status.INVALID_ARGUMENT) status = 400;
    res.status(status).json({ error: err.details });
  }
});

const typeDefs = `#graphql
  type Item {
    sku: ID!
    name: String!
    quantity: Int!
  }
  type Query {
    item(sku: ID!): Item
  }
  type Mutation {
    reserve(sku: ID!, qty: Int!): Item!
  }
`;

const resolvers = {
  Query: {
    item: async (_, { sku }, ctx) => {
      try {
        return await rpc('getItem', { sku }, ctx.traceId);
      } catch (err) {
        if (err.code === grpc.status.NOT_FOUND) return null;
        throw err;
      }
    },
  },
  Mutation: {
    reserve: (_, { sku, qty }, ctx) => rpc('reserve', { sku, qty }, ctx.traceId),
  },
};

const apollo = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [depthLimit(5)],
  plugins: [
    {
      async requestDidStart() {
        return {
          async didResolveOperation(requestContext) {
            const cost = estimateCost(requestContext.document);
            if (cost > MAX_COST) {
              throw new GraphQLError(`Query cost ${cost} > ${MAX_COST}`, {
                extensions: { code: 'QUERY_TOO_EXPENSIVE', cost },
              });
            }
          },
        };
      },
    },
  ],
});

await apollo.start();

app.use(
  '/graphql',
  expressMiddleware(apollo, {
    context: async ({ req }) => ({ traceId: req.traceId }),
  }),
);

app.listen(8088, () => {
  console.log(`AetherEdge gateway :8088 (mTLS=${useMtls})`);
});
