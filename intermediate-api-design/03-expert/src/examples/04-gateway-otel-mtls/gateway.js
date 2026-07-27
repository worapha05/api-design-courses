/**
 * Edge Gateway: REST + GraphQL → internal gRPC OrderService
 * พร้อม trace id propagation และ optional mTLS client certs
 *
 * รัน: node 03-expert/examples/04-gateway-otel-mtls/gateway.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OrderService = loadProto(path.join(__dirname, 'orders.proto')).orders.v1.OrderService;

const certDir = path.join(__dirname, 'certs');
const useMtls =
  fs.existsSync(path.join(certDir, 'client.crt')) &&
  fs.existsSync(path.join(certDir, 'client.key')) &&
  fs.existsSync(path.join(certDir, 'ca.crt'));

const channelCreds = useMtls
  ? grpc.credentials.createSsl(
      fs.readFileSync(path.join(certDir, 'ca.crt')),
      fs.readFileSync(path.join(certDir, 'client.key')),
      fs.readFileSync(path.join(certDir, 'client.crt')),
    )
  : grpc.credentials.createInsecure();

const stub = new OrderService('localhost:50056', channelCreds);

function rpc(method, request, traceId) {
  return new Promise((resolve, reject) => {
    const md = new grpc.Metadata();
    md.set('x-trace-id', traceId);
    stub[method](request, md, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

function mapGrpcError(err, res) {
  const code = err.code;
  if (code === grpc.status.NOT_FOUND) return res.status(404).json({ error: err.details });
  if (code === grpc.status.INVALID_ARGUMENT) return res.status(400).json({ error: err.details });
  return res.status(502).json({ error: err.details || 'upstream error' });
}

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  req.traceId = req.header('x-trace-id') || randomUUID();
  res.setHeader('x-trace-id', req.traceId);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, mtls: useMtls });
});

app.get('/orders/:id', async (req, res) => {
  try {
    const order = await rpc('getOrder', { id: req.params.id }, req.traceId);
    res.json(order);
  } catch (err) {
    mapGrpcError(err, res);
  }
});

app.post('/orders', async (req, res) => {
  try {
    const order = await rpc(
      'createOrder',
      { customer: req.body.customer, total: req.body.total },
      req.traceId,
    );
    res.status(201).json(order);
  } catch (err) {
    mapGrpcError(err, res);
  }
});

const typeDefs = `#graphql
  type Order {
    id: ID!
    customer: String!
    total: Float!
    status: String!
  }
  type Query {
    order(id: ID!): Order
  }
  type Mutation {
    createOrder(customer: String!, total: Float!): Order!
  }
`;

const resolvers = {
  Query: {
    order: async (_, { id }, ctx) => {
      try {
        return await rpc('getOrder', { id }, ctx.traceId);
      } catch (err) {
        if (err.code === grpc.status.NOT_FOUND) return null;
        throw err;
      }
    },
  },
  Mutation: {
    createOrder: (_, args, ctx) => rpc('createOrder', args, ctx.traceId),
  },
};

const apollo = new ApolloServer({ typeDefs, resolvers });
await apollo.start();

app.use(
  '/graphql',
  expressMiddleware(apollo, {
    context: async ({ req }) => ({ traceId: req.traceId }),
  }),
);

app.listen(8088, () => {
  console.log(`Gateway http://localhost:8088 (mTLS client=${useMtls})`);
  console.log('REST GET /orders/:id POST /orders');
  console.log('GQL POST /graphql');
});
