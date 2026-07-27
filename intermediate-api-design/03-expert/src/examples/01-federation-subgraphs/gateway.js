/**
 * Gateway จำลอง — รวมข้อมูลจาก products + reviews subgraphs ด้วยมือ
 * (เพื่อให้เห็นแนวคิด composition โดยไม่ต้องใช้ Apollo Router binary)
 *
 * ต้องรัน products.js และ reviews.js ก่อน
 * รัน: node 03-expert/examples/01-federation-subgraphs/gateway.js
 */
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

async function gql(url, query, variables) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const typeDefs = `#graphql
  type Review {
    id: ID!
    rating: Int!
    body: String!
  }

  type Product {
    id: ID!
    name: String!
    price: Float!
    reviews: [Review!]!
  }

  type Query {
    products: [Product!]!
    product(id: ID!): Product
  }
`;

const resolvers = {
  Query: {
    products: async () => {
      const data = await gql('http://localhost:4003/', `{ products { id name price } }`);
      return data.products;
    },
    product: async (_, { id }) => {
      const data = await gql(
        'http://localhost:4003/',
        `query($id: ID!) { product(id: $id) { id name price } }`,
        { id },
      );
      return data.product;
    },
  },
  Product: {
    reviews: async (product) => {
      const data = await gql(
        'http://localhost:4004/',
        `query($reps: [_Any!]!) {
          _entities(representations: $reps) {
            ... on Product { reviews { id rating body } }
          }
        }`,
        { reps: [{ __typename: 'Product', id: product.id }] },
      );
      return data._entities[0]?.reviews ?? [];
    },
  },
};

const server = new ApolloServer({ typeDefs, resolvers });
const { url } = await startStandaloneServer(server, { listen: { port: 4005 } });
console.log(`Federation-style gateway ${url}`);
console.log('Query: { products { name price reviews { rating body } } }');
