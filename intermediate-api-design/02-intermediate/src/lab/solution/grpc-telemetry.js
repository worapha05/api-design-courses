import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Pulse = loadProto(path.join(__dirname, 'pulse.proto')).pulse.v1.PulseTelemetry;

function watchMetrics(call) {
  const deviceId = call.request.deviceId || 'd1';
  const max = call.request.maxPoints > 0 ? call.request.maxPoints : 20;
  let i = 0;

  const timer = setInterval(() => {
    if (i >= max) {
      clearInterval(timer);
      call.end();
      return;
    }
    call.write({
      deviceId,
      cpu: 10 + Math.random() * 80,
      memory: 20 + Math.random() * 70,
      ts: new Date().toISOString(),
    });
    i += 1;
  }, 400);

  call.on('cancelled', () => clearInterval(timer));
}

const server = new grpc.Server();
server.addService(Pulse.service, { watchMetrics });

server.bindAsync('0.0.0.0:50054', grpc.ServerCredentials.createInsecure(), (err) => {
  if (err) throw err;
  console.log('PulseTelemetry on :50054');
});
