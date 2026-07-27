/**
 * gRPC Unary client — เรียก GetBook / ListBooks / CreateBook
 * รัน (หลัง server): node 01-beginner/examples/04-grpc-unary/client.js
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const proto = loadProto(path.join(__dirname, 'bookstore.proto'));
const BookService = proto.bookstore.v1.BookService;

const client = new BookService('localhost:50051', grpc.credentials.createInsecure());

function promisify(method, request) {
  return new Promise((resolve, reject) => {
    client[method](request, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

const book = await promisify('getBook', { id: 'b1' });
console.log('GetBook:', book);

const list = await promisify('listBooks', { pageSize: 10 });
console.log(
  'ListBooks:',
  list.books.map((b) => b.title),
);

const created = await promisify('createBook', {
  title: 'Protocol Buffers Handbook',
  author: 'Bootcamp Author',
  price: 790,
});
console.log('CreateBook:', created);

try {
  await promisify('getBook', { id: 'missing' });
} catch (err) {
  console.log('GetBook missing →', err.code, err.details);
}
