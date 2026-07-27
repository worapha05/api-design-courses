export interface Author {
  id: string;
  name: string;
}

export interface Book {
  id: string;
  title: string;
  authorId: string;
  priceCents: number;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  salaryCents?: number;
}

export const authors: Author[] = Array.from({ length: 20 }, (_, i) => ({
  id: `a${i + 1}`,
  name: `Author ${i + 1}`,
}));

export const books: Book[] = Array.from({ length: 50 }, (_, i) => ({
  id: `b${i + 1}`,
  title: `Book ${i + 1}`,
  authorId: `a${(i % 20) + 1}`,
  priceCents: 10000 + i * 100,
  updatedAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
}));

export const users: User[] = [
  {
    id: 'u1',
    name: 'Ada',
    email: 'ada@example.com',
    role: 'USER',
    salaryCents: 18000000,
  },
  {
    id: 'u2',
    name: 'Admin',
    email: 'admin@example.com',
    role: 'ADMIN',
    salaryCents: 25000000,
  },
];

/** Simulated DB counters for demos */
export const dbStats = {
  authorFindByIdCalls: 0,
  authorFindByIdsCalls: 0,
  reset() {
    this.authorFindByIdCalls = 0;
    this.authorFindByIdsCalls = 0;
  },
};

export async function findAuthorById(id: string): Promise<Author | null> {
  dbStats.authorFindByIdCalls += 1;
  await delay(5);
  return authors.find((a) => a.id === id) ?? null;
}

export async function findAuthorsByIds(ids: readonly string[]): Promise<Author[]> {
  dbStats.authorFindByIdsCalls += 1;
  await delay(10);
  const set = new Set(ids);
  return authors.filter((a) => set.has(a.id));
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
