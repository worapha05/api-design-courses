import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Inventory = loadProto(path.join(__dirname, 'inventory.proto')).aether.v1.Inventory;

const items = new Map([
  ['sku-1', { sku: 'sku-1', name: 'Aether Sensor', quantity: 20 }],
  ['sku-2', { sku: 'sku-2', name: 'Edge Gateway Kit', quantity: 8 }],
  ['sku-3', { sku: 'sku-3', name: 'Fiber SFP Module', quantity: 50 }],
]);

function getItem(call, callback) {
  const trace = call.metadata.get('x-trace-id')[0]?.toString();
  console.log(`[GetItem] trace=${trace} sku=${call.request.sku}`);
  const item = items.get(call.request.sku);
  if (!item) {
    return callback({ code: grpc.status.NOT_FOUND, message: 'sku not found' });
  }
  callback(null, item);
}

function reserve(call, callback) {
  const trace = call.metadata.get('x-trace-id')[0]?.toString();
  const item = items.get(call.request.sku);
  console.log(`[Reserve] trace=${trace} sku=${call.request.sku} qty=${call.request.qty}`);

  if (!item) {
    return callback({ code: grpc.status.NOT_FOUND, message: 'sku not found' });
  }
  if (call.request.qty < 1) {
    return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'qty must be >= 1' });
  }
  if (item.quantity < call.request.qty) {
    return callback({
      code: grpc.status.FAILED_PRECONDITION,
      message: 'insufficient quantity',
    });
  }

  item.quantity -= call.request.qty;
  callback(null, item);
}

const certDir = path.join(__dirname, 'certs');
const useMtls =
  fs.existsSync(path.join(certDir, 'server.crt')) &&
  fs.existsSync(path.join(certDir, 'server.key')) &&
  fs.existsSync(path.join(certDir, 'ca.crt'));

const creds = useMtls
  ? grpc.ServerCredentials.createSsl(
      fs.readFileSync(path.join(certDir, 'ca.crt')),
      [
        {
          cert_chain: fs.readFileSync(path.join(certDir, 'server.crt')),
          private_key: fs.readFileSync(path.join(certDir, 'server.key')),
        },
      ],
      true,
    )
  : grpc.ServerCredentials.createInsecure();

const server = new grpc.Server();
server.addService(Inventory.service, { getItem, reserve });

server.bindAsync('0.0.0.0:50057', creds, (err) => {
  if (err) throw err;
  console.log(`Aether Inventory on :50057 (${useMtls ? 'mTLS' : 'insecure'})`);
});
