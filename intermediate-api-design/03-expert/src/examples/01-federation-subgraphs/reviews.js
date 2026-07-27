/**
 * Reviews subgraph — extend Product ด้วย reviews
 * รัน: node 03-expert/examples/01-federation-subgraphs/reviews.js
 */
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';

const typeDefs = gql`
  extend schema
    @link(url: "https://specs.apollo.dev/federation/v2.0", import: ["@key", "@external"])

  type Review {
    id: ID!
    rating: Int!
    body: String!
  }

  type Product @key(fields: "id") {
    id: ID! @external
    reviews: [Review!]!
  }
`;

const reviews = [
  { id: 'r1', productId: 'p1', rating: 5, body: 'เยี่ยมมาก' },
  { id: 'r2', productId: 'p1', rating: 4, body: 'คุ้มราคา' },
  { id: 'r3', productId: 'p2', rating: 3, body: 'ใช้งานได้' },
];

const resolvers = {
  Product: {
    __resolveReference(ref) {
      return { id: ref.id };
    },
    reviews(product) {
      return reviews
        .filter((r) => r.productId === product.id)
        .map(({ id, rating, body }) => ({ id, rating, body }));
    },
  },
};

const server = new ApolloServer({
  schema: buildSubgraphSchema({ typeDefs, resolvers }),
});

const { url } = await startStandaloneServer(server, { listen: { port: 4004 } });
console.log(`Reviews subgraph ${url}`);
