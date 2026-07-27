/**
 * เปรียบเทียบ REST / GraphQL / gRPC ในมุมของ "สัญญาข้อมูล" และ "การดึงข้อมูล"
 * รัน: node 01-beginner/examples/01-api-paradigms/compare.js
 */

const catalog = {
  users: [
    { id: 'u1', name: 'Ann', email: 'ann@example.com', role: 'admin' },
    { id: 'u2', name: 'Bee', email: 'bee@example.com', role: 'user' },
  ],
  orders: [
    { id: 'o1', userId: 'u1', total: 1200, status: 'PAID', items: 3 },
    { id: 'o2', userId: 'u1', total: 450, status: 'SHIPPED', items: 1 },
    { id: 'o3', userId: 'u2', total: 890, status: 'PENDING', items: 2 },
  ],
};

/** REST: ต้องเรียกหลาย endpoint หรือได้ข้อมูลเกินความต้องการ */
function restGetUser(id) {
  const user = catalog.users.find((u) => u.id === id);
  return user;
}

function restGetOrdersByUser(userId) {
  return catalog.orders.filter((o) => o.userId === userId);
}

/** GraphQL-style: client เลือก field (จำลองด้วย projection) */
function graphqlUser(id, fields) {
  const user = catalog.users.find((u) => u.id === id);
  if (!user) return null;

  const result = {};
  for (const field of fields) {
    if (field === 'orders') {
      result.orders = catalog.orders
        .filter((o) => o.userId === id)
        .map((o) => ({ id: o.id, total: o.total }));
    } else if (field in user) {
      result[field] = user[field];
    }
  }
  return result;
}

/**
 * gRPC-style: procedure ชัดเจน + payload แคบ (จำลอง message)
 * ในของจริงจะเป็น binary protobuf บน HTTP/2
 */
function grpcGetUser(request) {
  const user = catalog.users.find((u) => u.id === request.id);
  if (!user) {
    return { ok: false, code: 'NOT_FOUND' };
  }
  return {
    ok: true,
    message: { id: user.id, name: user.name, email: user.email },
  };
}

console.log('=== REST ===');
console.log('GET /users/u1 →', restGetUser('u1'));
console.log('GET /users/u1/orders →', restGetOrdersByUser('u1'));
console.log('(2 round-trips, และ user payload มี field ที่อาจไม่ใช้)\n');

console.log('=== GraphQL (จำลอง field selection) ===');
console.log(
  'query { user(id:"u1") { name orders { id total } } } →',
  graphqlUser('u1', ['name', 'orders']),
);
console.log('(1 round-trip, ได้เฉพาะ field ที่ขอ)\n');

console.log('=== gRPC Unary (จำลอง) ===');
console.log("UserService.GetUser({ id: 'u1' }) →", grpcGetUser({ id: 'u1' }));
console.log("UserService.GetUser({ id: 'missing' }) →", grpcGetUser({ id: 'missing' }));
console.log('(typed procedure + explicit status; ในของจริงเป็น binary + HTTP/2)');
