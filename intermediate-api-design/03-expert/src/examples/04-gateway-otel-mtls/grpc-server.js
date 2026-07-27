/**
 * Internal OrderService — รองรับ insecure และ mTLS (ถ้ามี certs)
 * รัน: node 03-expert/examples/04-gateway-otel-mtls/grpc-server.js
 * สร้าง cert ก่อน (optional): bash generate-certs.sh
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OrderService = loadProto(path.join(__dirname, 'orders.proto')).orders.v1.OrderService;

const orders = new Map([
  ['ord-100', { id: 'ord-100', customer: 'Ann', total: 1500, status: 'PAID' }],
]);

let seq = 101;

function getOrder(call, callback) {
  const trace = call.metadata.get('x-trace-id')[0]?.toString();
  console.log(`[GetOrder] trace=${trace} id=${call.request.id}`);
  const order = orders.get(call.request.id);
  if (!order) {
    return callback({ code: grpc.status.NOT_FOUND, message: 'not found' });
  }
  callback(null, order);
}

function createOrder(call, callback) {
  const trace = call.metadata.get('x-trace-id')[0]?.toString();
  const id = `ord-${seq++}`;
  const order = {
    id,
    customer: call.request.customer,
    total: call.request.total,
    status: 'PENDING',
  };
  orders.set(id, order);
  console.log(`[CreateOrder] trace=${trace}`, order);
  callback(null, order);
}

const server = new grpc.Server();
server.addService(OrderService.service, { getOrder, createOrder });

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

const PORT = 50056;
server.bindAsync(`0.0.0.0:${PORT}`, creds, (err) => {
  if (err) throw err;
  console.log(`OrderService on :${PORT} (${useMtls ? 'mTLS' : 'insecure'})`);
});
