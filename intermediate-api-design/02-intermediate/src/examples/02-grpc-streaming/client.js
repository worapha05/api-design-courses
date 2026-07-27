/**
 * สาธิต Client สำหรับ 3 โหมด streaming
 * รันหลัง server: node 02-intermediate/examples/02-grpc-streaming/client.js
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new (loadProto(
  path.join(__dirname, 'telemetry.proto'),
).telemetry.v1.TelemetryService)('localhost:50052', grpc.credentials.createInsecure());

console.log('--- Server streaming: WatchMetrics ---');
await new Promise((resolve, reject) => {
  const call = client.watchMetrics({ deviceId: 'sensor-A', maxPoints: 3 });
  call.on('data', (m) => console.log('metric', m));
  call.on('end', resolve);
  call.on('error', reject);
});

console.log('\n--- Client streaming: UploadSamples ---');
await new Promise((resolve, reject) => {
  const call = client.uploadSamples((err, summary) => {
    if (err) reject(err);
    else {
      console.log('summary', summary);
      resolve();
    }
  });
  for (const value of [1.5, 2.0, 3.5, 4.0]) {
    call.write({ value });
  }
  call.end();
});

console.log('\n--- Bidirectional: Chat ---');
await new Promise((resolve, reject) => {
  const call = client.chat();
  call.on('data', (msg) => console.log(`→ ${msg.user}: ${msg.text}`));
  call.on('end', resolve);
  call.on('error', reject);
  call.write({ user: 'alice', text: 'hello' });
  call.write({ user: 'alice', text: 'streaming is cool' });
  call.end();
});
