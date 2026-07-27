/**
 * gRPC Streaming server — TelemetryService
 * รัน: node 02-intermediate/examples/02-grpc-streaming/server.js
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Telemetry = loadProto(path.join(__dirname, 'telemetry.proto')).telemetry.v1.TelemetryService;

function watchMetrics(call) {
  const deviceId = call.request.deviceId || 'dev-1';
  const max = call.request.maxPoints > 0 ? call.request.maxPoints : 5;
  let i = 0;

  const timer = setInterval(() => {
    if (i >= max) {
      clearInterval(timer);
      call.end();
      return;
    }
    call.write({
      deviceId,
      cpu: 20 + Math.random() * 60,
      memory: 40 + Math.random() * 40,
      ts: Date.now().toString(),
    });
    i += 1;
  }, 400);

  call.on('cancelled', () => {
    clearInterval(timer);
    console.log('WatchMetrics cancelled by client');
  });
}

function uploadSamples(call, callback) {
  let count = 0;
  let sum = 0;

  call.on('data', (sample) => {
    count += 1;
    sum += sample.value;
  });
  call.on('end', () => {
    callback(null, { count, average: count ? sum / count : 0 });
  });
  call.on('error', (err) => console.error('UploadSamples error', err));
}

function chat(call) {
  call.on('data', (msg) => {
    console.log(`← ${msg.user}: ${msg.text}`);
    call.write({ user: 'server', text: `ack: ${msg.text}` });
  });
  call.on('end', () => call.end());
}

const server = new grpc.Server();
server.addService(Telemetry.service, { watchMetrics, uploadSamples, chat });

server.bindAsync('0.0.0.0:50052', grpc.ServerCredentials.createInsecure(), (err) => {
  if (err) throw err;
  console.log('TelemetryService (streaming) on :50052');
});
