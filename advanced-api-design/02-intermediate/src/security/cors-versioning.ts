/**
 * Secure CORS + API Versioning demos
 *
 * Strategies shown:
 * 1) URL versioning: /v1/products
 * 2) Header versioning: Accept-Version: 2
 * 3) Media type: Accept: application/vnd.shop.v1+json
 */
import express, { Request, Response, NextFunction } from 'express';

const app = express();
const ALLOWED_ORIGINS = new Set(['https://app.example.com', 'http://localhost:5173']);

function corsSecure(req: Request, res: Response, next: NextFunction) {
  const origin = req.header('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  // ถ้า origin ไม่อยู่ใน whitelist — ไม่ใส่ ACAO (browser จะบล็อก)

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Idempotency-Key, Accept-Version',
  );
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    return res.status(204).send();
  }
  next();
}

app.use(corsSecure);
app.use(express.json());

const productsV1 = [{ id: 'p1', name: 'Widget', price: 100 }];
const productsV2 = [{ id: 'p1', title: 'Widget', amount: { value: 100, currency: 'THB' } }];

// --- URL versioning ---
app.get('/v1/products', (_req, res) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Sat, 01 Jan 2028 00:00:00 GMT');
  res.json({ version: 1, data: productsV1 });
});

app.get('/v2/products', (_req, res) => {
  res.json({ version: 2, data: productsV2 });
});

// --- Header versioning ---
app.get('/products', (req, res) => {
  const ver = req.header('Accept-Version') || '1';
  if (ver === '2') return res.json({ version: 2, data: productsV2 });
  return res.json({ version: 1, data: productsV1 });
});

// --- Media type versioning ---
app.get('/catalog', (req, res) => {
  const accept = req.header('Accept') || '';
  if (accept.includes('application/vnd.shop.v2+json')) {
    res.type('application/vnd.shop.v2+json');
    return res.json({ version: 2, data: productsV2 });
  }
  res.type('application/vnd.shop.v1+json');
  return res.json({ version: 1, data: productsV1 });
});

/** Sparse fieldsets — ลดขนาด payload */
app.get('/v2/products/:id', (req, res) => {
  const full = productsV2.find((p) => p.id === req.params.id) ?? productsV2[0];
  const fields = typeof req.query.fields === 'string' ? req.query.fields.split(',') : null;
  if (!fields) return res.json(full);
  const sparse: Record<string, unknown> = {};
  for (const f of fields) {
    if (f in full) sparse[f] = (full as Record<string, unknown>)[f];
  }
  return res.json(sparse);
});

const PORT = Number(process.env.PORT) || 8090;
app.listen(PORT, () => {
  console.log(`CORS + Versioning demo on :${PORT}`);
  console.log('Try Origin: http://localhost:5173');
});
