/**
 * API Gateway JWT validation (HS256 demo) + identity propagation
 *
 * Production: use RS256/ES256 + JWKS from issuer, validate aud/iss/exp
 * Internal services trust X-User-Id only from mesh/mTLS network
 */
import express, { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';

const PORT = Number(process.env.PORT) || 8088;
const JWT_SECRET = process.env.JWT_SECRET || 'bootcamp-demo-secret-change-me';
const EXPECTED_ISS = 'https://auth.example.com';
const EXPECTED_AUD = 'api-gateway';

interface JwtPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  scope?: string;
}

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64url');
}

function signDemoToken(payload: object): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyJwt(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('bad signature');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('expired');
  if (payload.iss !== EXPECTED_ISS) throw new Error('bad iss');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(EXPECTED_AUD)) throw new Error('bad aud');
  return payload;
}

function requireJwt(req: Request, res: Response, next: NextFunction) {
  const auth = req.header('authorization');
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ title: 'Unauthorized', detail: 'missing bearer token' });
  }
  try {
    const payload = verifyJwt(auth.slice(7));
    (req as Request & { user?: JwtPayload }).user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ title: 'Unauthorized', detail: String((e as Error).message) });
  }
}

const app = express();

app.get('/.well-known/demo-token', (_req, res) => {
  const token = signDemoToken({
    sub: 'user_42',
    iss: EXPECTED_ISS,
    aud: EXPECTED_AUD,
    exp: Math.floor(Date.now() / 1000) + 3600,
    scope: 'orders:read',
  });
  res.json({ token, usage: `Authorization: Bearer ${token}` });
});

app.get('/v1/secure-orders', requireJwt, (req, res) => {
  const user = (req as Request & { user?: JwtPayload }).user!;
  // Downstream call would use mTLS + these headers (not the JWT)
  res.json({
    data: [{ id: 'ord_1', status: 'paid' }],
    gateway: {
      userId: user.sub,
      scope: user.scope,
      note: 'JWT validated at edge; internals would see X-User-Id only over mTLS',
    },
  });
});

app.listen(PORT, () => {
  console.log(`JWT Gateway demo on :${PORT}`);
  console.log(`Get token: GET http://localhost:${PORT}/.well-known/demo-token`);
});
