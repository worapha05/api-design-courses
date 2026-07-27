/**
 * Products subgraph (จำลอง Federation entity Product @key(id))
 * รัน: node 03-expert/examples/01-federation-subgraphs/products.js
 */
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';

const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@shareable"])

  type Product @key(fields: "id") {
    id: ID!
    name: String!
    price: Float!
  }

  type Query {
    products: [Product!]!
    product(id: ID!): Product
  }
`;

const products = [
  { id: 'p1', name: 'Mechanical Keyboard', price: 3200 },
  { id: 'p2', name: 'USB-C Hub', price: 1490 },
];

const resolvers = {
  Query: {
    products: () => products,
    product: (_, { id }) => products.find((p) => p.id === id) ?? null,
  },
  Product: {
    __resolveReference(ref) {
      return products.find((p) => p.id === ref.id) ?? null;
    },
  },
};

const server = new ApolloServer({
  schema: buildSubgraphSchema({ typeDefs, resolvers }),
});

const { url } = await startStandaloneServer(server, { listen: { port: 4003 } });
console.log(`Products subgraph ${url}`);
