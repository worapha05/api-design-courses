import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Perf = loadProto(path.join(__dirname, 'perf.proto')).perf.v1.PerfService;

function echo(call, callback) {
  const traceId = call.metadata.get('x-trace-id')[0]?.toString() || `srv-${Date.now()}`;
  callback(null, { payload: call.request.payload, traceId });
}

const server = new grpc.Server();
server.addService(Perf.service, { echo });

server.bindAsync('0.0.0.0:50055', grpc.ServerCredentials.createInsecure(), (err) => {
  if (err) throw err;
  console.log('PerfService on :50055');
});
