/**
 * gRPC Unary server — BookService
 * รัน: node 01-beginner/examples/04-grpc-unary/server.js
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const proto = loadProto(path.join(__dirname, 'bookstore.proto'));
const BookService = proto.bookstore.v1.BookService;

const books = new Map([
  [
    'b1',
    {
      id: 'b1',
      title: 'Designing Data-Intensive Applications',
      author: 'Martin Kleppmann',
      price: 1890,
      inStock: true,
    },
  ],
  [
    'b2',
    {
      id: 'b2',
      title: 'gRPC: Up and Running',
      author: 'Kasun Indrasiri',
      price: 1290,
      inStock: true,
    },
  ],
]);

let seq = 3;

function getBook(call, callback) {
  const book = books.get(call.request.id);
  if (!book) {
    return callback({
      code: grpc.status.NOT_FOUND,
      message: `Book ${call.request.id} not found`,
    });
  }
  callback(null, book);
}

function listBooks(call, callback) {
  let list = [...books.values()];
  const size = call.request.pageSize || 0;
  if (size > 0) list = list.slice(0, size);
  callback(null, { books: list });
}

function createBook(call, callback) {
  const { title, author, price } = call.request;
  if (!title || !author) {
    return callback({
      code: grpc.status.INVALID_ARGUMENT,
      message: 'title and author are required',
    });
  }
  const id = `b${seq++}`;
  const book = { id, title, author, price: price || 0, inStock: true };
  books.set(id, book);
  callback(null, book);
}

const server = new grpc.Server();
server.addService(BookService.service, {
  getBook,
  listBooks,
  createBook,
});

const addr = '0.0.0.0:50051';
server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`gRPC BookService listening on ${addr} (port ${port})`);
});
