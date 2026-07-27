# 01 — Federation & Subgraphs

```bash
node 03-expert/examples/01-federation-subgraphs/products.js # :4003
node 03-expert/examples/01-federation-subgraphs/reviews.js  # :4004
node 03-expert/examples/01-federation-subgraphs/gateway.js  # :4005
```

แนวคิด:

- `products` เป็นเจ้าของ `Product.name/price` และประกาศ `@key(id)`
- `reviews` extend `Product` ด้วย `reviews`
- `gateway` รวมเป็น supergraph แบบ didactic (production ใช้ Apollo Router / Hive Gateway)
