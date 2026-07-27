# 04 — gRPC Unary

```bash
# terminal 1
node 01-beginner/examples/04-grpc-unary/server.js

# terminal 2
node 01-beginner/examples/04-grpc-unary/client.js
```

ไฟล์สำคัญ:

- `bookstore.proto` — contract (messages + service)
- `server.js` — implement Unary handlers + gRPC status codes
- `client.js` — stub เรียก GetBook / ListBooks / CreateBook
