import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';
import { books, adjustStock } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const proto = loadProto(path.join(__dirname, 'inventory.proto'));
const InventoryService = proto.novashelf.v1.InventoryService;

function getStock(call, callback) {
  const book = books.get(call.request.bookId);
  if (!book) {
    return callback({
      code: grpc.status.NOT_FOUND,
      message: `book ${call.request.bookId} not found`,
    });
  }
  callback(null, { bookId: book.id, quantity: book.stock });
}

function adjustStockRpc(call, callback) {
  const result = adjustStock(call.request.bookId, call.request.delta);
  if (result.error === 'NOT_FOUND') {
    return callback({
      code: grpc.status.NOT_FOUND,
      message: `book ${call.request.bookId} not found`,
    });
  }
  if (result.error === 'NEGATIVE_STOCK') {
    return callback({
      code: grpc.status.FAILED_PRECONDITION,
      message: 'stock cannot be negative',
    });
  }
  callback(null, { bookId: result.book.id, quantity: result.book.stock });
}

const server = new grpc.Server();
server.addService(InventoryService.service, {
  getStock,
  adjustStock: adjustStockRpc,
});

server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), (err) => {
  if (err) throw err;
  console.log('NovaShelf InventoryService on :50051');
});
