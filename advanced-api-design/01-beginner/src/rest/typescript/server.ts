/**
 * Richardson Maturity Model Level 2–3 REST API
 * Resources: Orders — GET/POST/PUT/PATCH/DELETE + HATEOAS links
 * Supports: filtering, sorting, offset pagination
 */
import express, { Request, Response, NextFunction } from 'express';

const app = express();
app.use(express.json());

type OrderStatus = 'pending' | 'paid' | 'shipped' | 'cancelled';

interface Order {
  id: string;
  customerId: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
}

const orders = new Map<string, Order>([
  [
    'ord_1',
    {
      id: 'ord_1',
      customerId: 'cus_a',
      status: 'pending',
      total: 1200,
      createdAt: '2026-07-01T10:00:00Z',
    },
  ],
  [
    'ord_2',
    {
      id: 'ord_2',
      customerId: 'cus_b',
      status: 'paid',
      total: 450,
      createdAt: '2026-07-02T11:00:00Z',
    },
  ],
  [
    'ord_3',
    {
      id: 'ord_3',
      customerId: 'cus_a',
      status: 'shipped',
      total: 890,
      createdAt: '2026-07-03T09:30:00Z',
    },
  ],
]);

let seq = 4;

function baseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

/** HATEOAS links ตามสถานะปัจจุบันของ order (RMM Level 3) */
function orderLinks(req: Request, order: Order) {
  const root = `${baseUrl(req)}/orders/${order.id}`;
  const links: Record<string, { href: string; method?: string }> = {
    self: { href: root },
    collection: { href: `${baseUrl(req)}/orders` },
  };

  if (order.status === 'pending') {
    links.pay = { href: `${root}/payments`, method: 'POST' };
    links.cancel = { href: root, method: 'DELETE' };
  }
  if (order.status === 'paid') {
    links.ship = { href: `${root}`, method: 'PATCH' };
  }

  return links;
}

function withHateoas(req: Request, order: Order) {
  return { ...order, _links: orderLinks(req, order) };
}

function problem(
  res: Response,
  status: number,
  title: string,
  detail: string,
  extra: Record<string, unknown> = {},
) {
  return res
    .status(status)
    .type('application/problem+json')
    .json({
      type: `https://api.example.com/errors/${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      status,
      detail,
      ...extra,
    });
}

// GET /orders?status=&customerId=&sort=&page=&limit=
app.get('/orders', (req, res) => {
  let list = [...orders.values()];

  const { status, customerId } = req.query;
  if (typeof status === 'string') {
    list = list.filter((o) => o.status === status);
  }
  if (typeof customerId === 'string') {
    list = list.filter((o) => o.customerId === customerId);
  }

  // sort=-createdAt,total (prefix - = descending)
  const sort = typeof req.query.sort === 'string' ? req.query.sort : '-createdAt';
  const fields = sort.split(',').filter(Boolean);
  list.sort((a, b) => {
    for (const f of fields) {
      const desc = f.startsWith('-');
      const key = (desc ? f.slice(1) : f) as keyof Order;
      const av = a[key];
      const bv = b[key];
      if (av === bv) continue;
      if (av! < bv!) return desc ? 1 : -1;
      return desc ? -1 : 1;
    }
    return 0;
  });

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const data = list.slice(start, start + limit).map((o) => withHateoas(req, o));

  const q = new URLSearchParams();
  if (typeof status === 'string') q.set('status', status);
  if (typeof customerId === 'string') q.set('customerId', customerId);
  q.set('sort', sort);
  q.set('limit', String(limit));

  const link = (p: number) => {
    const params = new URLSearchParams(q);
    params.set('page', String(p));
    return `${baseUrl(req)}/orders?${params}`;
  };

  res.json({
    data,
    meta: { page, limit, total, totalPages },
    links: {
      self: link(page),
      next: page < totalPages ? link(page + 1) : null,
      prev: page > 1 ? link(page - 1) : null,
    },
  });
});

// GET /orders/:id
app.get('/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return problem(res, 404, 'Not Found', `Order ${req.params.id} not found`);
  return res.json(withHateoas(req, order));
});

// POST /orders → 201 + Location
app.post('/orders', (req, res) => {
  const { customerId, total } = req.body ?? {};
  if (!customerId || typeof total !== 'number' || total < 0) {
    return problem(
      res,
      422,
      'Validation Failed',
      'customerId and non-negative total are required',
      {
        errors: [
          { field: 'customerId', code: 'REQUIRED' },
          { field: 'total', code: 'NON_NEGATIVE' },
        ],
      },
    );
  }

  const id = `ord_${seq++}`;
  const order: Order = {
    id,
    customerId,
    status: 'pending',
    total,
    createdAt: new Date().toISOString(),
  };
  orders.set(id, order);

  res.status(201).location(`/orders/${id}`).json(withHateoas(req, order));
});

// PUT /orders/:id — full replace (idempotent)
app.put('/orders/:id', (req, res) => {
  const existing = orders.get(req.params.id);
  if (!existing) return problem(res, 404, 'Not Found', `Order ${req.params.id} not found`);

  const { customerId, status, total } = req.body ?? {};
  const allowed: OrderStatus[] = ['pending', 'paid', 'shipped', 'cancelled'];
  if (!customerId || !allowed.includes(status) || typeof total !== 'number') {
    return problem(res, 422, 'Validation Failed', 'customerId, status, total required for PUT');
  }

  const updated: Order = {
    id: existing.id,
    customerId,
    status,
    total,
    createdAt: existing.createdAt,
  };
  orders.set(updated.id, updated);
  return res.json(withHateoas(req, updated));
});

// PATCH /orders/:id — partial update
app.patch('/orders/:id', (req, res) => {
  const existing = orders.get(req.params.id);
  if (!existing) return problem(res, 404, 'Not Found', `Order ${req.params.id} not found`);

  const body = req.body ?? {};
  if (body.status !== undefined) {
    const allowed: OrderStatus[] = ['pending', 'paid', 'shipped', 'cancelled'];
    if (!allowed.includes(body.status)) {
      return problem(res, 422, 'Validation Failed', 'invalid status');
    }
    // business rule: cannot ship if not paid
    if (body.status === 'shipped' && existing.status !== 'paid' && existing.status !== 'shipped') {
      return problem(res, 409, 'Conflict', 'order must be paid before shipping');
    }
    existing.status = body.status;
  }
  if (body.total !== undefined) {
    if (typeof body.total !== 'number' || body.total < 0) {
      return problem(res, 422, 'Validation Failed', 'total must be non-negative number');
    }
    existing.total = body.total;
  }

  orders.set(existing.id, existing);
  return res.json(withHateoas(req, existing));
});

// DELETE /orders/:id — soft cancel when pending, else 409
app.delete('/orders/:id', (req, res) => {
  const existing = orders.get(req.params.id);
  if (!existing) return problem(res, 404, 'Not Found', `Order ${req.params.id} not found`);
  if (existing.status !== 'pending') {
    return problem(res, 409, 'Conflict', 'only pending orders can be cancelled');
  }
  existing.status = 'cancelled';
  orders.set(existing.id, existing);
  return res.status(204).send();
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  problem(res, 500, 'Internal Server Error', 'unexpected error');
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`REST Orders API (RMM L2–L3) on http://localhost:${PORT}`);
  console.log(`Try: GET /orders?status=pending&sort=-total&page=1&limit=10`);
});
