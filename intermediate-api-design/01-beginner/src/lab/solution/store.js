export const books = new Map([
  [
    'b1',
    { id: 'b1', title: 'Clean Architecture', author: 'Robert C. Martin', price: 850, stock: 10 },
  ],
  ['b2', { id: 'b2', title: 'GraphQL in Action', author: 'Samer Buna', price: 720, stock: 5 }],
  ['b3', { id: 'b3', title: 'API Design Patterns', author: 'JJ Geewax', price: 990, stock: 8 }],
]);

export const reviews = [
  { id: 'r1', bookId: 'b1', rating: 5, comment: 'ควรอ่านสำหรับทุกคนที่ออกแบบระบบ' },
  { id: 'r2', bookId: 'b2', rating: 4, comment: 'ตัวอย่างชัด อ่านง่าย' },
];

let reviewSeq = 3;

export function addReview(bookId, rating, comment) {
  const review = { id: `r${reviewSeq++}`, bookId, rating, comment };
  reviews.push(review);
  return review;
}

export function adjustStock(bookId, delta) {
  const book = books.get(bookId);
  if (!book) return { error: 'NOT_FOUND' };
  const next = book.stock + delta;
  if (next < 0) return { error: 'NEGATIVE_STOCK' };
  book.stock = next;
  return { book };
}
