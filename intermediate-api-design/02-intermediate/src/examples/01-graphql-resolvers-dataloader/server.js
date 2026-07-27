/**
 * GraphQL + DataLoader — เปรียบเทียบ N+1 กับ batched loading
 * รัน: node 02-intermediate/examples/01-graphql-resolvers-dataloader/server.js
 */
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { GraphQLScalarType, Kind } from 'graphql';
import DataLoader from 'dataloader';

const DateTime = new GraphQLScalarType({
  name: 'DateTime',
  serialize: (v) => (v instanceof Date ? v.toISOString() : v),
  parseValue: (v) => new Date(v),
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? new Date(ast.value) : null),
});

const typeDefs = `#graphql
  scalar DateTime

  type User {
    id: ID!
    name: String!
    orders: [Order!]!
  }

  type Order {
    id: ID!
    total: Float!
    createdAt: DateTime!
  }

  input PlaceOrderInput {
    userId: ID!
    total: Float!
  }

  type Query {
    users: [User!]!
    """นับจำนวนครั้งที่ 'DB' ถูกเรียกใน request นี้ (ผ่าน context counters)"""
    dbCalls: Int!
  }

  type Mutation {
    placeOrder(input: PlaceOrderInput!): Order!
  }
`;

const users = [
  { id: 'u1', name: 'Ann' },
  { id: 'u2', name: 'Bee' },
  { id: 'u3', name: 'Cam' },
];

const orders = [
  { id: 'o1', userId: 'u1', total: 100, createdAt: new Date('2026-01-01') },
  { id: 'o2', userId: 'u1', total: 250, createdAt: new Date('2026-02-01') },
  { id: 'o3', userId: 'u2', total: 80, createdAt: new Date('2026-03-01') },
  { id: 'o4', userId: 'u3', total: 400, createdAt: new Date('2026-04-01') },
];

let orderSeq = 5;

/** จำลอง DB query — นับทุกครั้งที่ถูกเรียก */
function dbFindOrdersByUserIds(userIds, counter) {
  counter.dbCalls += 1;
  console.log(`[DB] findOrdersByUserIds(${userIds.join(',')}) — call #${counter.dbCalls}`);
  const set = new Set(userIds);
  return orders.filter((o) => set.has(o.userId));
}

function createOrdersLoader(counter) {
  return new DataLoader(async (userIds) => {
    const rows = dbFindOrdersByUserIds(userIds, counter);
    return userIds.map((id) => rows.filter((o) => o.userId === id));
  });
}

const resolvers = {
  DateTime,
  Query: {
    users: () => users,
    dbCalls: async (_, __, ctx) => {
      await new Promise((r) => setImmediate(r));
      return ctx.counter.dbCalls;
    },
  },
  Mutation: {
    placeOrder: (_, { input }) => {
      const order = {
        id: `o${orderSeq++}`,
        userId: input.userId,
        total: input.total,
        createdAt: new Date(),
      };
      orders.push(order);
      return order;
    },
  },
  User: {
    orders: (user, _, ctx) => ctx.ordersLoader.load(user.id),
  },
};

const server = new ApolloServer({ typeDefs, resolvers });

const { url } = await startStandaloneServer(server, {
  listen: { port: 4401 },
  context: async () => {
    const counter = { dbCalls: 0 };
    return {
      counter,
      ordersLoader: createOrdersLoader(counter),
    };
  },
});

console.log(`DataLoader demo at ${url}`);
console.log('Query: { users { name orders { id total } } dbCalls }');
console.log('สังเกต log [DB] — ควรเห็นประมาณ 1 ครั้งต่อ request ไม่ใช่ 3');
