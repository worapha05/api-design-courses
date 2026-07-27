/**
 * Strict RESTful Bookstore API — Beginner
 * Plural nouns, correct methods/status codes, pagination & filters
 */
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { authors, books, reviews, nextBookId, nextReviewId, Book } from './data';

const app = express();
app.use(cors());
app.use(express.json());

type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: { field: string; message: string }[];
};

function problem(
  res: Response,
  status: number,
  title: string,
  detail: string,
  instance: string,
  errors?: Problem['errors'],
) {
  const body: Problem = {
    type: `https://api.example.com/errors/${title.toLowerCase().replace(/\s+/g, '-')}`,
    title,
    status,
    detail,
    instance,
    ...(errors ? { errors } : {}),
  };
  return res.status(status).type('application/problem+json').json(body);
}

function parsePage(req: Request): { page: number; pageSize: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  return { page, pageSize };
}

/** GET /books — collection with pagination, sort, filters */
app.get('/books', (req, res) => {
  const { page, pageSize } = parsePage(req);
  let result = [...books];

  if (typeof req.query.genre === 'string') {
    result = result.filter((b) => b.genre === req.query.genre);
  }
  if (req.query.minPrice !== undefined) {
    const min = Number(req.query.minPrice);
    if (Number.isNaN(min)) {
      return problem(res, 400, 'Validation Failed', 'minPrice must be a number', '/books');
    }
    result = result.filter((b) => b.price >= min);
  }
  if (req.query.maxPrice !== undefined) {
    const max = Number(req.query.maxPrice);
    if (Number.isNaN(max)) {
      return problem(res, 400, 'Validation Failed', 'maxPrice must be a number', '/books');
    }
    result = result.filter((b) => b.price <= max);
  }

  if (typeof req.query.sort === 'string') {
    const fields = req.query.sort.split(',');
    result.sort((a, b) => {
      for (const raw of fields) {
        const desc = raw.startsWith('-');
        const key = (desc ? raw.slice(1) : raw) as keyof Book;
        const av = a[key];
        const bv = b[key];
        if (av === bv) continue;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = av < bv ? -1 : 1;
        return desc ? -cmp : cmp;
      }
      return 0;
    });
  }

  const totalItems = result.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = (page - 1) * pageSize;
  const data = result.slice(start, start + pageSize);

  const qs = new URLSearchParams();
  qs.set('pageSize', String(pageSize));
  if (typeof req.query.genre === 'string') qs.set('genre', req.query.genre);
  if (typeof req.query.sort === 'string') qs.set('sort', req.query.sort);

  const link = (p: number) => `/books?page=${p}&${qs.toString()}`;

  res.status(200).json({
    data,
    meta: { page, pageSize, totalItems, totalPages },
    links: {
      self: link(page),
      next: page < totalPages ? link(page + 1) : null,
      prev: page > 1 ? link(page - 1) : null,
    },
  });
});

/** POST /books — create */
app.post('/books', (req, res) => {
  const { title, isbn, authorId, price, genre, publishedAt } = req.body ?? {};
  const errors: { field: string; message: string }[] = [];

  if (!title) errors.push({ field: 'title', message: 'required' });
  if (!isbn || !/^[0-9]{13}$/.test(isbn)) {
    errors.push({ field: 'isbn', message: 'must be 13 digits' });
  }
  if (!authorId || !authors.find((a) => a.id === authorId)) {
    errors.push({ field: 'authorId', message: 'must reference an existing author' });
  }
  if (typeof price !== 'number' || price < 0) {
    errors.push({ field: 'price', message: 'must be a non-negative number' });
  }
  if (!genre) errors.push({ field: 'genre', message: 'required' });

  if (errors.length) {
    return problem(res, 400, 'Validation Failed', 'Request body is invalid', '/books', errors);
  }
  if (books.some((b) => b.isbn === isbn)) {
    return problem(res, 409, 'Conflict', `ISBN ${isbn} already exists`, '/books');
  }

  const book: Book = {
    id: nextBookId(),
    title,
    isbn,
    authorId,
    price,
    genre,
    publishedAt,
  };
  books.push(book);
  res.status(201).location(`/books/${book.id}`).json(book);
});

/** GET /books/:bookId */
app.get('/books/:bookId', (req, res) => {
  const book = books.find((b) => b.id === req.params.bookId);
  if (!book) {
    return problem(res, 404, 'Not Found', `Book ${req.params.bookId} not found`, req.path);
  }
  res.status(200).json(book);
});

/** PUT /books/:bookId — full replace */
app.put('/books/:bookId', (req, res) => {
  const idx = books.findIndex((b) => b.id === req.params.bookId);
  if (idx < 0) {
    return problem(res, 404, 'Not Found', `Book ${req.params.bookId} not found`, req.path);
  }
  const { title, isbn, authorId, price, genre, publishedAt } = req.body ?? {};
  if (!title || !isbn || !authorId || typeof price !== 'number' || !genre) {
    return problem(res, 400, 'Validation Failed', 'PUT requires full representation', req.path);
  }
  const updated: Book = {
    id: req.params.bookId,
    title,
    isbn,
    authorId,
    price,
    genre,
    publishedAt,
  };
  books[idx] = updated;
  res.status(200).json(updated);
});

/** PATCH /books/:bookId — partial update */
app.patch('/books/:bookId', (req, res) => {
  const book = books.find((b) => b.id === req.params.bookId);
  if (!book) {
    return problem(res, 404, 'Not Found', `Book ${req.params.bookId} not found`, req.path);
  }
  const { title, price, genre, publishedAt } = req.body ?? {};
  if (title !== undefined) book.title = title;
  if (price !== undefined) book.price = price;
  if (genre !== undefined) book.genre = genre;
  if (publishedAt !== undefined) book.publishedAt = publishedAt;
  res.status(200).json(book);
});

/** DELETE /books/:bookId */
app.delete('/books/:bookId', (req, res) => {
  const idx = books.findIndex((b) => b.id === req.params.bookId);
  if (idx < 0) {
    return problem(res, 404, 'Not Found', `Book ${req.params.bookId} not found`, req.path);
  }
  books.splice(idx, 1);
  res.status(204).send();
});

/** GET|POST /books/:bookId/reviews */
app.get('/books/:bookId/reviews', (req, res) => {
  if (!books.find((b) => b.id === req.params.bookId)) {
    return problem(res, 404, 'Not Found', `Book ${req.params.bookId} not found`, req.path);
  }
  const data = reviews.filter((r) => r.bookId === req.params.bookId);
  res.status(200).json({ data });
});

app.post('/books/:bookId/reviews', (req, res) => {
  if (!books.find((b) => b.id === req.params.bookId)) {
    return problem(res, 404, 'Not Found', `Book ${req.params.bookId} not found`, req.path);
  }
  const { rating, body } = req.body ?? {};
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    return problem(res, 400, 'Validation Failed', 'rating must be 1–5', req.path);
  }
  const review = {
    id: nextReviewId(),
    bookId: req.params.bookId,
    rating,
    body,
  };
  reviews.push(review);
  res.status(201).location(`/books/${req.params.bookId}/reviews/${review.id}`).json(review);
});

app.get('/authors', (_req, res) => {
  res.status(200).json({ data: authors });
});

app.get('/authors/:authorId/books', (req, res) => {
  if (!authors.find((a) => a.id === req.params.authorId)) {
    return problem(res, 404, 'Not Found', `Author ${req.params.authorId} not found`, req.path);
  }
  const data = books.filter((b) => b.authorId === req.params.authorId);
  res.status(200).json({
    data,
    meta: { page: 1, pageSize: data.length, totalItems: data.length, totalPages: 1 },
    links: { self: req.path, next: null, prev: null },
  });
});

app.use((_req, res) => {
  problem(res, 404, 'Not Found', 'No route matched', _req.path);
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  problem(res, 500, 'Internal Server Error', 'Unexpected error', req.path);
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`REST Bookstore API → http://localhost:${PORT}`);
  console.log(`Try: curl 'http://localhost:${PORT}/books?genre=fantasy&sort=-price'`);
});
