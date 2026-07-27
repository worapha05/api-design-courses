/** In-memory Bookstore data for Beginner demos */

export interface Author {
  id: string;
  name: string;
  bio?: string;
}

export interface Book {
  id: string;
  title: string;
  isbn: string;
  authorId: string;
  price: number;
  genre: string;
  publishedAt?: string;
}

export interface Review {
  id: string;
  bookId: string;
  rating: number;
  body?: string;
}

export const authors: Author[] = [
  { id: 'a1', name: 'Frank Herbert', bio: 'Author of Dune' },
  { id: 'a2', name: 'Ursula K. Le Guin', bio: 'Earthsea & Hainish Cycle' },
  { id: 'a3', name: 'Ted Chiang', bio: 'Speculative short fiction' },
];

export const books: Book[] = [
  {
    id: 'b1',
    title: 'Dune',
    isbn: '9780441172719',
    authorId: 'a1',
    price: 450,
    genre: 'science-fiction',
    publishedAt: '1965-08-01',
  },
  {
    id: 'b2',
    title: 'A Wizard of Earthsea',
    isbn: '9780547773742',
    authorId: 'a2',
    price: 380,
    genre: 'fantasy',
    publishedAt: '1968-01-01',
  },
  {
    id: 'b3',
    title: 'Stories of Your Life',
    isbn: '9781101972120',
    authorId: 'a3',
    price: 420,
    genre: 'science-fiction',
    publishedAt: '2002-01-01',
  },
  {
    id: 'b4',
    title: 'The Left Hand of Darkness',
    isbn: '9780441478125',
    authorId: 'a2',
    price: 390,
    genre: 'science-fiction',
    publishedAt: '1969-03-01',
  },
];

export const reviews: Review[] = [
  { id: 'r1', bookId: 'b1', rating: 5, body: 'Epic world-building' },
  { id: 'r2', bookId: 'b1', rating: 4, body: 'Dense but rewarding' },
  { id: 'r3', bookId: 'b2', rating: 5, body: 'A classic of fantasy' },
  { id: 'r4', bookId: 'b3', rating: 5, body: 'Mind-bending precision' },
];

let bookSeq = 5;
let reviewSeq = 5;

export function nextBookId(): string {
  return `b${bookSeq++}`;
}

export function nextReviewId(): string {
  return `r${reviewSeq++}`;
}
