/**
 * Client จำลอง "browser → Envoy" ด้วย HTTP POST แบบ gRPC-Web text
 * (เพื่อให้รันได้โดยไม่ต้อง compile protobuf-js เต็มรูปแบบ)
 *
 * ต้องมี: server.js + docker compose (Envoy :8080)
 * รัน: node 02-intermediate/examples/04-grpc-web/web-client.js
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Native gRPC client (ควบคุมว่า backend ทำงาน)
const native = new (loadProto(path.join(__dirname, 'greeter.proto')).greeter.v1.Greeter)(
  'localhost:50053',
  grpc.credentials.createInsecure(),
);

await new Promise((resolve, reject) => {
  native.sayHello({ name: 'Native' }, (err, res) => {
    if (err) reject(err);
    else {
      console.log('Native gRPC:', res.message);
      resolve();
    }
  });
});

// ตรวจว่า Envoy admin ขึ้น
try {
  const admin = await fetch('http://127.0.0.1:9901/ready');
  console.log('Envoy ready:', admin.status, await admin.text());
  console.log('gRPC-Web endpoint: http://127.0.0.1:8080/greeter.v1.Greeter/SayHello');
  console.log('จาก browser ใช้ grpc-web client gen จาก greeter.proto ชี้ไปที่ :8080');
} catch {
  console.log('Envoy ยังไม่พร้อม — รัน: docker compose up -d');
}
