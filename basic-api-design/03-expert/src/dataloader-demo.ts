/**
 * Demonstrates N+1 vs DataLoader batching for Book → Author
 * Run: npx ts-node dataloader-demo.ts
 */
import { books, dbStats, findAuthorById } from './data';
import { createLoaders } from './loaders';

async function naiveNPlusOne() {
  dbStats.reset();
  const t0 = Date.now();
  const result = [];
  for (const book of books.slice(0, 30)) {
    const author = await findAuthorById(book.authorId);
    result.push({ title: book.title, author: author?.name });
  }
  return {
    mode: 'N+1 (findAuthorById per book)',
    items: result.length,
    authorFindByIdCalls: dbStats.authorFindByIdCalls,
    authorFindByIdsCalls: dbStats.authorFindByIdsCalls,
    ms: Date.now() - t0,
  };
}

async function withDataLoader() {
  dbStats.reset();
  const t0 = Date.now();
  const { authorLoader } = createLoaders();
  const slice = books.slice(0, 30);
  const result = await Promise.all(
    slice.map(async (book) => {
      const author = await authorLoader.load(book.authorId);
      return { title: book.title, author: author?.name };
    }),
  );
  return {
    mode: 'DataLoader (batched IN query)',
    items: result.length,
    authorFindByIdCalls: dbStats.authorFindByIdCalls,
    authorFindByIdsCalls: dbStats.authorFindByIdsCalls,
    ms: Date.now() - t0,
  };
}

async function main() {
  console.log('=== GraphQL-style field resolution simulation ===\n');
  const a = await naiveNPlusOne();
  console.log(a);
  console.log('');
  const b = await withDataLoader();
  console.log(b);
  console.log(
    `\nInsight:\n` +
      ` N+1 → authorFindByIdCalls ≈ number of books (${a.authorFindByIdCalls})\n` +
      ` DataLoader → authorFindByIdsCalls ≈ 1 batch (${b.authorFindByIdsCalls})\n` +
      ` Unique authors among 30 books ≤ 20, so one IN (...) is enough.\n`,
  );
}

main().catch(console.error);
