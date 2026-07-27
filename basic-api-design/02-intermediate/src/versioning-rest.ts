/**
 * REST Versioning Strategies Demo
 * A) URL /v1 vs /v2
 * B) Header X-API-Version
 * C) Media Type Accept: application/vnd.bookstore.vN+json
 */
import express, { Request, Response } from 'express';
import cors from 'cors';
import { books } from './data';

const app = express();
app.use(cors());
app.use(express.json());

type BookV1 = {
  id: string;
  title: string;
  /** legacy float baht */
  price: number;
  authorId: string;
};

type BookV2 = {
  id: string;
  title: string;
  priceCents: number;
  authorId: string;
  genre: string;
};

function toV1(b: (typeof books)[0]): BookV1 {
  return {
    id: b.id,
    title: b.title,
    price: b.priceCents / 100,
    authorId: b.authorId,
  };
}

function toV2(b: (typeof books)[0]): BookV2 {
  return {
    id: b.id,
    title: b.title,
    priceCents: b.priceCents,
    authorId: b.authorId,
    genre: b.genre,
  };
}

function problem(res: Response, status: number, detail: string) {
  return res.status(status).type('application/problem+json').json({
    type: 'https://api.example.com/errors/versioning',
    title: 'Error',
    status,
    detail,
  });
}

/* ---------- A) URL Versioning ---------- */

app.get('/v1/books/:id', (req, res) => {
  const book = books.find((b) => b.id === req.params.id);
  if (!book) return problem(res, 404, 'not found');
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Sat, 31 Dec 2026 23:59:59 GMT');
  res.setHeader('Link', '</v2/books/' + book.id + '>; rel="successor-version"');
  res.status(200).json(toV1(book));
});

app.get('/v2/books/:id', (req, res) => {
  const book = books.find((b) => b.id === req.params.id);
  if (!book) return problem(res, 404, 'not found');
  res.status(200).json(toV2(book));
});

/* ---------- B) Custom Header Versioning ---------- */

app.get('/books/:id', (req: Request, res: Response) => {
  const book = books.find((b) => b.id === req.params.id);
  if (!book) return problem(res, 404, 'not found');

  const version = String(req.header('X-API-Version') ?? '2');
  if (version === '1') {
    res.setHeader('X-API-Version', '1');
    return res.status(200).json(toV1(book));
  }
  if (version === '2') {
    res.setHeader('X-API-Version', '2');
    return res.status(200).json(toV2(book));
  }
  return problem(res, 400, `Unsupported X-API-Version: ${version}`);
});

/* ---------- C) Media Type Versioning ---------- */

app.get('/catalog/books/:id', (req, res) => {
  const book = books.find((b) => b.id === req.params.id);
  if (!book) return problem(res, 404, 'not found');

  const accept = req.header('Accept') ?? '';
  if (accept.includes('application/vnd.bookstore.v1+json')) {
    res.type('application/vnd.bookstore.v1+json');
    return res.status(200).json(toV1(book));
  }
  if (
    accept.includes('application/vnd.bookstore.v2+json') ||
    accept.includes('application/json') ||
    accept.includes('*/*')
  ) {
    res.type('application/vnd.bookstore.v2+json');
    return res.status(200).json(toV2(book));
  }
  return res.status(406).type('application/problem+json').json({
    type: 'https://api.example.com/errors/not-acceptable',
    title: 'Not Acceptable',
    status: 406,
    detail: 'Supported: application/vnd.bookstore.v1+json, v2+json',
  });
});

app.get('/', (_req, res) => {
  res.json({
    demos: {
      urlV1: 'GET /v1/books/b1',
      urlV2: 'GET /v2/books/b1',
      header: 'GET /books/b1 + header X-API-Version: 1|2',
      mediaType: 'GET /catalog/books/b1 + Accept: application/vnd.bookstore.v1+json',
    },
  });
});

const PORT = Number(process.env.PORT) || 3200;
app.listen(PORT, () => {
  console.log(`Versioning demo → http://localhost:${PORT}`);
  console.log(`curl http://localhost:${PORT}/v1/books/b1`);
  console.log(`curl http://localhost:${PORT}/v2/books/b1`);
  console.log(`curl -H 'X-API-Version: 1' http://localhost:${PORT}/books/b1`);
  console.log(
    `curl -H 'Accept: application/vnd.bookstore.v1+json' http://localhost:${PORT}/catalog/books/b1`,
  );
});
