/**
 * NovaShelf combined server — GraphQL :4400 + gRPC :50051 ใน process เดียว
 * เพื่อให้ shared in-memory store ทำงานตามโจทย์ lab
 *
 * รัน: node 01-beginner/lab/solution/combined-server.js
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { loadProto, grpc } from '../../lib/loadProto.js';
import { books, reviews, addReview, adjustStock } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const typeDefs = readFileSync(path.join(__dirname, 'schema.graphql'), 'utf8');

const resolvers = {
  Query: {
    book: (_, { id }) => books.get(id) ?? null,
    books: () => [...books.values()],
  },
  Mutation: {
    addReview: (_, { bookId, rating, comment }) => {
      if (!books.has(bookId)) throw new Error(`Book ${bookId} not found`);
      if (rating < 1 || rating > 5) throw new Error('rating must be between 1 and 5');
      return addReview(bookId, rating, comment);
    },
  },
  Book: {
    reviews: (parent) => reviews.filter((r) => r.bookId === parent.id),
  },
};

const proto = loadProto(path.join(__dirname, 'inventory.proto'));
const InventoryService = proto.novashelf.v1.InventoryService;

const grpcServer = new grpc.Server();
grpcServer.addService(InventoryService.service, {
  getStock(call, callback) {
    const book = books.get(call.request.bookId);
    if (!book) {
      return callback({ code: grpc.status.NOT_FOUND, message: 'not found' });
    }
    callback(null, { bookId: book.id, quantity: book.stock });
  },
  adjustStock(call, callback) {
    const result = adjustStock(call.request.bookId, call.request.delta);
    if (result.error === 'NOT_FOUND') {
      return callback({ code: grpc.status.NOT_FOUND, message: 'not found' });
    }
    if (result.error === 'NEGATIVE_STOCK') {
      return callback({
        code: grpc.status.FAILED_PRECONDITION,
        message: 'stock cannot be negative',
      });
    }
    callback(null, { bookId: result.book.id, quantity: result.book.stock });
  },
});

await new Promise((resolve, reject) => {
  grpcServer.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), (err) => {
    if (err) reject(err);
    else resolve();
  });
});
console.log('gRPC InventoryService on :50051');

const gql = new ApolloServer({ typeDefs, resolvers });
const { url } = await startStandaloneServer(gql, { listen: { port: 4400 } });
console.log(`GraphQL at ${url}`);
