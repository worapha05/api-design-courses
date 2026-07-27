import { createServer } from 'node:http';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { PubSub, withFilter } from 'graphql-subscriptions';
import { useServer } from 'graphql-ws/lib/use/ws';
import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

const pubsub = new PubSub();
const ORDER_UPDATED = 'ORDER_UPDATED';

const typeDefs = `#graphql
  enum OrderStatus { PENDING PAID SHIPPED }

  type Order {
    id: ID!
    status: OrderStatus!
  }

  type Query {
    order(id: ID!): Order
  }

  type Mutation {
    updateOrderStatus(orderId: ID!, status: OrderStatus!): Order!
  }

  type Subscription {
    orderUpdated(orderId: ID!): Order!
  }
`;

const orders = new Map([['ord-1', { id: 'ord-1', status: 'PENDING' }]]);

const resolvers = {
  Query: {
    order: (_, { id }) => orders.get(id) ?? null,
  },
  Mutation: {
    updateOrderStatus: async (_, { orderId, status }) => {
      const order = orders.get(orderId) ?? { id: orderId, status: 'PENDING' };
      order.status = status;
      orders.set(orderId, order);
      await pubsub.publish(ORDER_UPDATED, { orderUpdated: order });
      return order;
    },
  },
  Subscription: {
    orderUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator(ORDER_UPDATED),
        (payload, variables) => payload.orderUpdated.id === variables.orderId,
      ),
    },
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });
const app = express();
const httpServer = createServer(app);

const apollo = new ApolloServer({ schema });
await apollo.start();

app.use('/graphql', cors(), bodyParser.json(), expressMiddleware(apollo));

const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
useServer({ schema }, wsServer);

const PORT = 4001;
httpServer.listen(PORT, () => {
  console.log(`HTTP http://localhost:${PORT}/graphql`);
  console.log(`WS ws://localhost:${PORT}/graphql`);
  console.log('Subscribe: subscription { orderUpdated(orderId: "ord-1") { id status } }');
  console.log(
    'Mutate: mutation { updateOrderStatus(orderId: "ord-1", status: PAID) { id status } }',
  );
});
