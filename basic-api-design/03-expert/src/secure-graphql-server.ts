/**
 * Secure + Hardened GraphQL Server
 * - DataLoader per request
 * - Depth limiting
 * - Simple query complexity guard
 * - Field-level authorization
 * - In-memory rate limiting
 */
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import {
  GraphQLError,
  GraphQLSchema,
  separateOperations,
  TypeInfo,
  visit,
  visitWithTypeInfo,
  Kind,
  FieldNode,
  DocumentNode,
} from 'graphql';
import gql from 'graphql-tag';
import depthLimit from 'graphql-depth-limit';
import { books, users, User } from './data';
import { createLoaders, Loaders } from './loaders';

const typeDefs = gql`
  type Author {
    id: ID!
    name: String!
  }

  type Book {
    id: ID!
    title: String!
    priceCents: Int!
    author: Author!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    salaryCents: Int
  }

  type Query {
    books(limit: Int = 10): [Book!]!
    book(id: ID!): Book
    user(id: ID!): User
    node: Book
  }
`;

type Ctx = {
  user: User | null;
  loaders: Loaders;
  clientKey: string;
};

const resolvers = {
  Query: {
    books: (_: unknown, { limit }: { limit: number }) => books.slice(0, Math.min(limit, 50)),
    book: (_: unknown, { id }: { id: string }) => books.find((b) => b.id === id) ?? null,
    user: (_: unknown, { id }: { id: string }, ctx: Ctx) => {
      if (!ctx.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      return users.find((u) => u.id === id) ?? null;
    },
    node: () => books[0],
  },
  Book: {
    author: (book: { authorId: string }, _: unknown, ctx: Ctx) =>
      ctx.loaders.authorLoader.load(book.authorId),
  },
  User: {
    email: (user: User, _: unknown, ctx: Ctx) => {
      if (!ctx.user) {
        throw new GraphQLError('Authentication required', {
          extensions: { code: 'UNAUTHENTICATED' },
        });
      }
      if (ctx.user.id !== user.id && ctx.user.role !== 'ADMIN') {
        throw new GraphQLError('Forbidden: email is private', {
          extensions: { code: 'FORBIDDEN' },
        });
      }
      return user.email;
    },
    salaryCents: (user: User, _: unknown, ctx: Ctx) => {
      if (!ctx.user || ctx.user.role !== 'ADMIN') {
        throw new GraphQLError('Forbidden: admin only', {
          extensions: { code: 'FORBIDDEN' },
        });
      }
      return user.salaryCents ?? null;
    },
  },
};

/** Estimate complexity: each field +1, books(limit) contributes limit */
function estimateComplexity(document: DocumentNode, schema: GraphQLSchema): number {
  const typeInfo = new TypeInfo(schema);
  let complexity = 0;
  visit(
    document,
    visitWithTypeInfo(typeInfo, {
      Field(node: FieldNode) {
        complexity += 1;
        if (node.name.value === 'books' && node.arguments) {
          const lim = node.arguments.find((a) => a.name.value === 'limit');
          if (lim?.value.kind === Kind.INT) {
            complexity += Number(lim.value.value);
          } else {
            complexity += 10;
          }
        }
        if (node.name.value === 'author') complexity += 2;
      },
    }),
  );
  return complexity;
}

function complexityLimit(max: number) {
  return function complexityValidationRule(context: {
    getDocument: () => DocumentNode;
    getSchema: () => GraphQLSchema;
    reportError: (e: GraphQLError) => void;
  }) {
    return {
      Document: {
        leave() {
          const document = context.getDocument();
          const ops = separateOperations(document);
          for (const op of Object.values(ops)) {
            const c = estimateComplexity(op, context.getSchema());
            if (c > max) {
              context.reportError(
                new GraphQLError(`Query too complex: ${c}. Maximum allowed complexity: ${max}`, {
                  extensions: { code: 'COMPLEXITY_LIMIT' },
                }),
              );
            }
          }
        },
      },
    };
  };
}

const buckets = new Map<string, { tokens: number; updatedAt: number }>();
const RATE = 30;
const WINDOW_MS = 60_000;

function takeToken(key: string): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.updatedAt > WINDOW_MS) {
    b = { tokens: RATE, updatedAt: now };
    buckets.set(key, b);
  }
  if (b.tokens <= 0) return false;
  b.tokens -= 1;
  return true;
}

async function main() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: process.env.NODE_ENV !== 'production',
    validationRules: [depthLimit(5), complexityLimit(80)],
  });

  const { url } = await startStandaloneServer(server, {
    listen: { port: Number(process.env.PORT) || 4002 },
    context: async ({ req }) => {
      const clientKey =
        (req.headers['x-api-key'] as string) || req.socket.remoteAddress || 'anonymous';

      if (!takeToken(clientKey)) {
        throw new GraphQLError('Rate limit exceeded', {
          extensions: { code: 'RATE_LIMITED', http: { status: 429 } },
        });
      }

      const raw = req.headers.authorization;
      let user: User | null = null;
      if (raw?.startsWith('Bearer ')) {
        const token = raw.slice(7);
        if (token === 'user:u1') user = users[0];
        if (token === 'admin:u2') user = users[1];
      }

      return {
        user,
        loaders: createLoaders(),
        clientKey,
      } satisfies Ctx;
    },
  });

  console.log(`Secure GraphQL → ${url}`);
  console.log(
    `Auth demos:\n` +
      ` Authorization: Bearer user:u1\n` +
      ` Authorization: Bearer admin:u2\n` +
      `\n` +
      `curl -s ${url} -H 'content-type: application/json' ` +
      `-d '{"query":"{ books(limit:10){ title author { name } } }"}'\n` +
      `\n` +
      `curl -s ${url} -H 'content-type: application/json' ` +
      `-H 'Authorization: Bearer user:u1' ` +
      `-d '{"query":"{ user(id:\\"u2\\"){ name email } }"}'\n` +
      `\n` +
      `curl -s ${url} -H 'content-type: application/json' ` +
      `-H 'Authorization: Bearer admin:u2' ` +
      `-d '{"query":"{ user(id:\\"u1\\"){ name salaryCents } }"}'`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
