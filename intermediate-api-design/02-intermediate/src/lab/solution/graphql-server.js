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
import DataLoader from 'dataloader';
import { devices, setMetric, getMetricsByDeviceIds } from './store.js';

const pubsub = new PubSub();
const METRIC_UPDATED = 'METRIC_UPDATED';

const typeDefs = `#graphql
  type Device {
    id: ID!
    name: String!
    latestMetric: Metric
  }

  type Metric {
    deviceId: ID!
    cpu: Float!
    memory: Float!
    ts: String!
  }

  type Query {
    devices: [Device!]!
    device(id: ID!): Device
    debugDbCalls: Int!
  }

  type Mutation {
    pushMetric(deviceId: ID!, cpu: Float!, memory: Float!): Metric!
  }

  type Subscription {
    metricUpdated(deviceId: ID!): Metric!
  }
`;

const resolvers = {
  Query: {
    devices: () => devices,
    device: (_, { id }) => devices.find((d) => d.id === id) ?? null,
    debugDbCalls: (_, __, ctx) => ctx.counter.dbCalls,
  },
  Mutation: {
    pushMetric: async (_, { deviceId, cpu, memory }) => {
      if (!devices.some((d) => d.id === deviceId)) {
        throw new Error(`unknown device ${deviceId}`);
      }
      const metric = setMetric({
        deviceId,
        cpu,
        memory,
        ts: new Date().toISOString(),
      });
      await pubsub.publish(METRIC_UPDATED, { metricUpdated: metric });
      return metric;
    },
  },
  Device: {
    latestMetric: (device, _, ctx) => ctx.metricsLoader.load(device.id),
  },
  Subscription: {
    metricUpdated: {
      subscribe: withFilter(
        () => pubsub.asyncIterableIterator(METRIC_UPDATED),
        (payload, vars) => payload.metricUpdated.deviceId === vars.deviceId,
      ),
    },
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });
const app = express();
const httpServer = createServer(app);
const apollo = new ApolloServer({ schema });
await apollo.start();

app.use(
  '/graphql',
  cors(),
  bodyParser.json(),
  expressMiddleware(apollo, {
    context: async () => {
      const counter = { dbCalls: 0 };
      return {
        counter,
        metricsLoader: new DataLoader(async (ids) => getMetricsByDeviceIds(ids, counter)),
      };
    },
  }),
);

const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
useServer({ schema }, wsServer);

httpServer.listen(4002, () => {
  console.log('PulseBoard GraphQL http://localhost:4002/graphql');
  console.log('WS ws://localhost:4002/graphql');
});
