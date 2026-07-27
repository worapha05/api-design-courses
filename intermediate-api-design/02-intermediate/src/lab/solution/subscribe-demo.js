/**
 * สมัคร subscription แล้วรอ event (รันพร้อม bridge)
 * ใช้ graphql-ws client Minimal
 */
import { createClient } from 'graphql-ws';
import WebSocket from 'ws';

const client = createClient({
  url: 'ws://localhost:4002/graphql',
  webSocketImpl: WebSocket,
});

const deviceId = process.argv[2] || 'd1';

console.log(`Subscribing metricUpdated(${deviceId}) ...`);

await new Promise((resolve, reject) => {
  let count = 0;
  const unsub = client.subscribe(
    {
      query: `subscription($id: ID!) { metricUpdated(deviceId: $id) { deviceId cpu memory ts } }`,
      variables: { id: deviceId },
    },
    {
      next: (data) => {
        console.log('event', JSON.stringify(data));
        count += 1;
        if (count >= 3) {
          unsub();
          resolve();
        }
      },
      error: reject,
      complete: resolve,
    },
  );
});

console.log('done');
process.exit(0);
