/**
 * End-to-end demo กับ combined-server.js (shared memory)
 * รันหลัง: node 01-beginner/lab/solution/combined-server.js
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProto, grpc } from '../../lib/loadProto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function graphql(query) {
  const res = await fetch('http://localhost:4400/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

const client = new (loadProto(
  path.join(__dirname, 'inventory.proto'),
).novashelf.v1.InventoryService)('localhost:50051', grpc.credentials.createInsecure());

function adjust(bookId, delta) {
  return new Promise((resolve, reject) => {
    client.adjustStock({ bookId, delta }, (err, res) => (err ? reject(err) : resolve(res)));
  });
}

console.log('=== ก่อน AdjustStock ===');
console.log(
  JSON.stringify(
    await graphql(`
      {
        book(id: "b1") {
          title
          stock
          reviews {
            rating
          }
        }
      }
    `),
    null,
    2,
  ),
);

console.log('\n=== gRPC AdjustStock b1 -3 ===');
console.log(await adjust('b1', -3));

console.log('\n=== หลัง AdjustStock (GraphQL เห็น stock ใหม่) ===');
console.log(
  JSON.stringify(
    await graphql(`
      {
        book(id: "b1") {
          title
          stock
        }
      }
    `),
    null,
    2,
  ),
);

console.log('\n=== Mutation addReview ===');
console.log(
  JSON.stringify(
    await graphql(`
      mutation {
        addReview(bookId: "b1", rating: 5, comment: "ยอดเยี่ยม") {
          id
          rating
        }
      }
    `),
    null,
    2,
  ),
);
