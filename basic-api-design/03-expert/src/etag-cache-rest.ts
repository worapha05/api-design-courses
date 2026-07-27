/**
 * REST Performance: ETag / If-None-Match + Cache-Control + gzip
 */
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import crypto from 'crypto';
import { books } from './data';

const app = express();
app.use(cors());
app.use(compression()); // Content-Encoding: gzip when client accepts it
app.use(express.json());

function weakEtag(payload: string): string {
  const hash = crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
  return `W/"${hash}"`;
}

/** Version-based ETag from updatedAt — cheaper than hashing body */
function bookEtag(book: (typeof books)[0]): string {
  return `W/"${book.id}-${book.updatedAt}"`;
}

app.get('/books/:id', (req, res) => {
  const book = books.find((b) => b.id === req.params.id);
  if (!book) {
    return res.status(404).type('application/problem+json').json({
      title: 'Not Found',
      status: 404,
      detail: 'Book not found',
    });
  }

  const etag = bookEtag(book);
  const inm = req.header('If-None-Match');
  if (inm && inm === etag) {
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, must-revalidate');
    return res.status(304).end();
  }

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'private, max-age=30, must-revalidate');
  res.setHeader('Vary', 'Accept-Encoding');
  return res.status(200).json(book);
});

/** Public catalog — CDN-friendly */
app.get('/catalog/books', (_req, res) => {
  const body = JSON.stringify({
    data: books.slice(0, 20).map((b) => ({
      id: b.id,
      title: b.title,
      priceCents: b.priceCents,
    })),
  });
  const etag = weakEtag(body);
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.setHeader('Vary', 'Accept-Encoding');
  if (_req.header('If-None-Match') === etag) {
    return res.status(304).end();
  }
  res.type('application/json').send(body);
});

/** Sensitive — never store in shared caches */
app.get('/me/secret', (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({ pan: '****-****-****-4242' });
});

const PORT = Number(process.env.PORT) || 3300;
app.listen(PORT, () => {
  console.log(`ETag/Cache REST → http://localhost:${PORT}`);
  console.log(
    `\n# First fetch\n` +
      `curl -i http://localhost:${PORT}/books/b1\n` +
      `\n# Revalidate (expect 304)\n` +
      `curl -i -H 'If-None-Match: W/"b1-2026-01-01T00:00:00Z"' http://localhost:${PORT}/books/b1\n` +
      `\n# Compression\n` +
      `curl -i -H 'Accept-Encoding: gzip' --compressed http://localhost:${PORT}/catalog/books`,
  );
});
