import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { books, reviews, addReview } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const typeDefs = readFileSync(path.join(__dirname, 'schema.graphql'), 'utf8');

const resolvers = {
  Query: {
    book: (_, { id }) => books.get(id) ?? null,
    books: () => [...books.values()],
  },
  Mutation: {
    addReview: (_, { bookId, rating, comment }) => {
      if (!books.has(bookId)) {
        throw new Error(`Book ${bookId} not found`);
      }
      if (rating < 1 || rating > 5) {
        throw new Error('rating must be between 1 and 5');
      }
      return addReview(bookId, rating, comment);
    },
  },
  Book: {
    reviews: (parent) => reviews.filter((r) => r.bookId === parent.id),
  },
};

const server = new ApolloServer({ typeDefs, resolvers });
const { url } = await startStandaloneServer(server, { listen: { port: 4400 } });
console.log(`NovaShelf GraphQL at ${url}`);
