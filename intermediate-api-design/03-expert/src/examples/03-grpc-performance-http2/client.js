/**
 * เปรียบเทียบ: สร้าง client ใหม่ทุกครั้ง vs reuse channel
 * รันหลัง server: node 03-expert/examples/03-grpc-performance-http2/client.js
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';
import { performance } from 'node:perf_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Perf = loadProto(path.join(__dirname, 'perf.proto')).perf.v1.PerfService;
const N = 200;

function callOnce(client, i) {
  return new Promise((resolve, reject) => {
    const md = new grpc.Metadata();
    md.set('x-trace-id', `trace-${i}`);
    client.echo({ payload: `msg-${i}` }, md, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

console.log(`Benchmark N=${N}`);

// ❌ สร้าง connection ใหม่ทุกครั้ง (ช้า)
let t0 = performance.now();
for (let i = 0; i < N; i++) {
  const c = new Perf('localhost:50055', grpc.credentials.createInsecure());
  await callOnce(c, i);
  c.close();
}
console.log(`new client each call: ${(performance.now() - t0).toFixed(1)} ms`);

// ✅ reuse channel เดียว + multiplex บน HTTP/2
const shared = new Perf('localhost:50055', grpc.credentials.createInsecure());
t0 = performance.now();
const jobs = [];
for (let i = 0; i < N; i++) jobs.push(callOnce(shared, i));
await Promise.all(jobs);
console.log(`reuse + parallel: ${(performance.now() - t0).toFixed(1)} ms`);
shared.close();

console.log('สรุป: reuse channel + parallel RPC ใช้ multiplexing ของ HTTP/2 ได้เต็มที่');
