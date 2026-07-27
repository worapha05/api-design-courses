import { authors, books, reviews, nextBookId, nextReviewId, Book, Author, Review } from './data';

export const resolvers = {
  Query: {
    book: (_: unknown, args: { id: string }) => books.find((b) => b.id === args.id) ?? null,

    books: (_: unknown, args: { limit?: number; genre?: string }) => {
      let result = [...books];
      if (args.genre) result = result.filter((b) => b.genre === args.genre);
      return result.slice(0, args.limit ?? 20);
    },

    author: (_: unknown, args: { id: string }) => authors.find((a) => a.id === args.id) ?? null,

    authors: () => authors,
  },

  Mutation: {
    createBook: (
      _: unknown,
      args: {
        title: string;
        isbn: string;
        authorId: string;
        price: number;
        genre: string;
      },
    ) => {
      if (!authors.find((a) => a.id === args.authorId)) {
        throw new Error(`Author ${args.authorId} not found`);
      }
      if (books.some((b) => b.isbn === args.isbn)) {
        throw new Error(`ISBN ${args.isbn} already exists`);
      }
      const book: Book = {
        id: nextBookId(),
        title: args.title,
        isbn: args.isbn,
        authorId: args.authorId,
        price: args.price,
        genre: args.genre,
      };
      books.push(book);
      return book;
    },

    addReview: (_: unknown, args: { bookId: string; rating: number; body?: string }) => {
      if (!books.find((b) => b.id === args.bookId)) {
        throw new Error(`Book ${args.bookId} not found`);
      }
      if (args.rating < 1 || args.rating > 5) {
        throw new Error('rating must be between 1 and 5');
      }
      const review: Review = {
        id: nextReviewId(),
        bookId: args.bookId,
        rating: args.rating,
        body: args.body,
      };
      reviews.push(review);
      return review;
    },
  },

  Book: {
    author: (book: Book) => {
      const author = authors.find((a) => a.id === book.authorId);
      if (!author) throw new Error(`Author ${book.authorId} missing`);
      return author;
    },
    reviews: (book: Book) => reviews.filter((r) => r.bookId === book.id),
  },

  Author: {
    books: (author: Author) => books.filter((b) => b.authorId === author.id),
  },

  Review: {
    book: (review: Review) => {
      const book = books.find((b) => b.id === review.bookId);
      if (!book) throw new Error(`Book ${review.bookId} missing`);
      return book;
    },
  },
};
