/**
 * Advanced GraphQL Server — Intermediate
 * Interfaces, Unions, Input types, Mutation payloads
 */
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs, resolvers } from './advanced-resolvers';

async function main() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });
  const { url } = await startStandaloneServer(server, {
    listen: { port: Number(process.env.PORT) || 4001 },
  });
  console.log(`Advanced GraphQL → ${url}`);
  console.log(
    `Try:\n` +
      ` query {\n` +
      `  search(q: "Dune") {\n` +
      `    ... on Book { title priceCents genre }\n` +
      `    ... on Author { name }\n` +
      `    ... on Magazine { title issueNumber }\n` +
      `  }\n` +
      ` }\n` +
      `\n` +
      ` mutation {\n` +
      `  createBook(input: {\n` +
      `    title: "Hyperion"\n` +
      `    isbn: "9780553283686"\n` +
      `    authorId: "a1"\n` +
      `    priceCents: 39900\n` +
      `    genre: SCIENCE_FICTION\n` +
      `    clientMutationId: "ui-1"\n` +
      `  }) {\n` +
      `    book { id title }\n` +
      `    userErrors { field message code }\n` +
      `    clientMutationId\n` +
      `  }\n` +
      ` }`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
