# 03 — GraphQL Server

```bash
# จาก root ของ bootcamp
npm install
node 01-beginner/examples/03-graphql-server/server.js
```

เปิด http://localhost:4400 แล้วลอง:

```graphql
{
  books {
    id
    title
    author
    price
  }
}
```

```graphql
mutation {
  createOrder(bookId: "b1", quantity: 2) {
    id
    totalPrice
    status
    book {
      title
    }
  }
}
```
