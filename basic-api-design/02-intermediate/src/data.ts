export type Genre = 'SCIENCE_FICTION' | 'FANTASY' | 'NON_FICTION' | 'MYSTERY';

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
  priceCents: number;
  genre: Genre;
  tags: string[];
}

export interface Magazine {
  id: string;
  title: string;
  priceCents: number;
  issueNumber: number;
  publishedMonth: string;
}

export const authors: Author[] = [
  { id: 'a1', name: 'Frank Herbert', bio: 'Author of Dune' },
  { id: 'a2', name: 'Ursula K. Le Guin' },
];

export const books: Book[] = [
  {
    id: 'b1',
    title: 'Dune',
    isbn: '9780441172719',
    authorId: 'a1',
    priceCents: 45000,
    genre: 'SCIENCE_FICTION',
    tags: ['classic', 'space'],
  },
  {
    id: 'b2',
    title: 'A Wizard of Earthsea',
    isbn: '9780547773742',
    authorId: 'a2',
    priceCents: 38000,
    genre: 'FANTASY',
    tags: ['classic'],
  },
];

export const magazines: Magazine[] = [
  {
    id: 'm1',
    title: 'Analog Science Fiction',
    priceCents: 12000,
    issueNumber: 742,
    publishedMonth: '2026-07',
  },
];

let seq = 10;
export function nextId(prefix: string): string {
  return `${prefix}${seq++}`;
}
