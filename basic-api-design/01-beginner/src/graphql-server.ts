/**
 * GraphQL Bookstore Server — Beginner
 * Single endpoint, schema-driven queries & mutations
 */
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './graphql-schema';
import { resolvers } from './resolvers';

async function main() {
  const server = new ApolloServer({ typeDefs, resolvers });
  const { url } = await startStandaloneServer(server, {
    listen: { port: Number(process.env.PORT) || 4000 },
  });
  console.log(`GraphQL Bookstore → ${url}`);
  console.log(
    `Example query:\n` +
      ` query {\n` +
      `  books(genre: "science-fiction", limit: 2) {\n` +
      `    title\n` +
      `    author { name }\n` +
      `    reviews { rating body }\n` +
      `  }\n` +
      ` }`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
