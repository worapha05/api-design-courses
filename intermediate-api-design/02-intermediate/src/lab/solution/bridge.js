/**
 * อ่าน gRPC WatchMetrics แล้ว push เข้า GraphQL mutation
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deviceId = process.argv[2] || 'd1';

const client = new (loadProto(path.join(__dirname, 'pulse.proto')).pulse.v1.PulseTelemetry)(
  'localhost:50054',
  grpc.credentials.createInsecure(),
);

const call = client.watchMetrics({ deviceId, maxPoints: 8 });

call.on('data', async (m) => {
  console.log('stream ←', m);
  const res = await fetch('http://localhost:4002/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `mutation($d: ID!, $c: Float!, $m: Float!) {
        pushMetric(deviceId: $d, cpu: $c, memory: $m) { deviceId cpu ts }
      }`,
      variables: { d: m.deviceId, c: m.cpu, m: m.memory },
    }),
  });
  console.log('graphql →', await res.json());
});

call.on('end', () => console.log('stream ended'));
call.on('error', (e) => console.error(e));
