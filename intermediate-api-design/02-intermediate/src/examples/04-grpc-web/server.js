/**
 * Backend gRPC สำหรับ gRPC-Web (ผ่าน Envoy)
 * รัน: node 02-intermediate/examples/04-grpc-web/server.js
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Greeter = loadProto(path.join(__dirname, 'greeter.proto')).greeter.v1.Greeter;

function sayHello(call, callback) {
  callback(null, { message: `Hello, ${call.request.name || 'world'}!` });
}

const server = new grpc.Server();
server.addService(Greeter.service, { sayHello });

server.bindAsync('0.0.0.0:50053', grpc.ServerCredentials.createInsecure(), (err) => {
  if (err) throw err;
  console.log('Greeter gRPC on :50053 (point Envoy here)');
  console.log('Start proxy: docker compose up -d (from bootcamp root)');
});
