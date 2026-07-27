import gql from 'graphql-tag';
import { authors, books, magazines, nextId, Book, Author, Magazine, Genre } from './data';

export const typeDefs = gql`
  enum Genre {
    SCIENCE_FICTION
    FANTASY
    NON_FICTION
    MYSTERY
  }

  interface Node {
    id: ID!
  }

  interface CatalogItem {
    id: ID!
    title: String!
    priceCents: Int!
  }

  type Author implements Node {
    id: ID!
    name: String!
    bio: String
    books: [Book!]!
  }

  type Book implements Node & CatalogItem {
    id: ID!
    title: String!
    isbn: String!
    price: Float @deprecated(reason: "Use priceCents for precision")
    priceCents: Int!
    genre: Genre!
    author: Author!
    tags: [String!]!
  }

  type Magazine implements Node & CatalogItem {
    id: ID!
    title: String!
    priceCents: Int!
    issueNumber: Int!
    publishedMonth: String!
  }

  union SearchResult = Book | Author | Magazine

  input CreateBookInput {
    title: String!
    isbn: String!
    authorId: ID!
    priceCents: Int!
    genre: Genre!
    tags: [String!]
    clientMutationId: String
  }

  input UpdateBookInput {
    id: ID!
    title: String
    priceCents: Int
    genre: Genre
    tags: [String!]
    clientMutationId: String
  }

  type UserError {
    field: [String!]
    message: String!
    code: String
  }

  type CreateBookPayload {
    book: Book
    userErrors: [UserError!]!
    clientMutationId: String
  }

  type UpdateBookPayload {
    book: Book
    userErrors: [UserError!]!
    clientMutationId: String
  }

  type Query {
    node(id: ID!): Node
    book(id: ID!): Book
    books(genre: Genre, limit: Int = 20): [Book!]!
    search(q: String!): [SearchResult!]!
    catalog(limit: Int = 20): [CatalogItem!]!
  }

  type Mutation {
    createBook(input: CreateBookInput!): CreateBookPayload!
    updateBook(input: UpdateBookInput!): UpdateBookPayload!
  }
`;

type UserError = { field?: string[]; message: string; code?: string };

function validateIsbn(isbn: string): UserError | null {
  if (!/^[0-9]{13}$/.test(isbn)) {
    return { field: ['isbn'], message: 'ISBN must be 13 digits', code: 'INVALID_ISBN' };
  }
  return null;
}

export const resolvers = {
  Query: {
    node: (_: unknown, { id }: { id: string }) => {
      return (
        books.find((b) => b.id === id) ??
        authors.find((a) => a.id === id) ??
        magazines.find((m) => m.id === id) ??
        null
      );
    },
    book: (_: unknown, { id }: { id: string }) => books.find((b) => b.id === id) ?? null,
    books: (_: unknown, args: { genre?: Genre; limit?: number }) => {
      let result = [...books];
      if (args.genre) result = result.filter((b) => b.genre === args.genre);
      return result.slice(0, args.limit ?? 20);
    },
    search: (_: unknown, { q }: { q: string }) => {
      const needle = q.toLowerCase();
      const foundBooks = books.filter((b) => b.title.toLowerCase().includes(needle));
      const foundAuthors = authors.filter((a) => a.name.toLowerCase().includes(needle));
      const foundMags = magazines.filter((m) => m.title.toLowerCase().includes(needle));
      return [...foundBooks, ...foundAuthors, ...foundMags];
    },
    catalog: (_: unknown, { limit }: { limit: number }) => [...books, ...magazines].slice(0, limit),
  },

  Mutation: {
    createBook: (
      _: unknown,
      {
        input,
      }: {
        input: {
          title: string;
          isbn: string;
          authorId: string;
          priceCents: number;
          genre: Genre;
          tags?: string[];
          clientMutationId?: string;
        };
      },
    ) => {
      const userErrors: UserError[] = [];
      const isbnErr = validateIsbn(input.isbn);
      if (isbnErr) userErrors.push(isbnErr);
      if (!authors.find((a) => a.id === input.authorId)) {
        userErrors.push({
          field: ['authorId'],
          message: 'Author not found',
          code: 'AUTHOR_NOT_FOUND',
        });
      }
      if (input.priceCents < 0) {
        userErrors.push({
          field: ['priceCents'],
          message: 'must be >= 0',
          code: 'INVALID_PRICE',
        });
      }
      if (books.some((b) => b.isbn === input.isbn)) {
        userErrors.push({
          field: ['isbn'],
          message: 'ISBN already exists',
          code: 'DUPLICATE_ISBN',
        });
      }
      if (userErrors.length) {
        return { book: null, userErrors, clientMutationId: input.clientMutationId };
      }
      const book: Book = {
        id: nextId('b'),
        title: input.title,
        isbn: input.isbn,
        authorId: input.authorId,
        priceCents: input.priceCents,
        genre: input.genre,
        tags: input.tags ?? [],
      };
      books.push(book);
      return { book, userErrors: [], clientMutationId: input.clientMutationId };
    },

    updateBook: (
      _: unknown,
      {
        input,
      }: {
        input: {
          id: string;
          title?: string;
          priceCents?: number;
          genre?: Genre;
          tags?: string[];
          clientMutationId?: string;
        };
      },
    ) => {
      const book = books.find((b) => b.id === input.id);
      if (!book) {
        return {
          book: null,
          userErrors: [{ field: ['id'], message: 'Book not found', code: 'NOT_FOUND' }],
          clientMutationId: input.clientMutationId,
        };
      }
      if (input.title !== undefined) book.title = input.title;
      if (input.priceCents !== undefined) book.priceCents = input.priceCents;
      if (input.genre !== undefined) book.genre = input.genre;
      if (input.tags !== undefined) book.tags = input.tags;
      return { book, userErrors: [], clientMutationId: input.clientMutationId };
    },
  },

  Book: {
    price: (book: Book) => book.priceCents / 100,
    author: (book: Book) => {
      const a = authors.find((x) => x.id === book.authorId);
      if (!a) throw new Error('author missing');
      return a;
    },
  },

  Author: {
    books: (author: Author) => books.filter((b) => b.authorId === author.id),
  },

  Node: {
    __resolveType(obj: { isbn?: string; issueNumber?: number; name?: string }) {
      if ('isbn' in obj && obj.isbn) return 'Book';
      if ('issueNumber' in obj) return 'Magazine';
      if ('name' in obj) return 'Author';
      return null;
    },
  },

  CatalogItem: {
    __resolveType(obj: { isbn?: string; issueNumber?: number }) {
      if (obj.isbn) return 'Book';
      if (obj.issueNumber !== undefined) return 'Magazine';
      return null;
    },
  },

  SearchResult: {
    __resolveType(obj: { isbn?: string; issueNumber?: number; name?: string }) {
      if (obj.isbn) return 'Book';
      if (obj.issueNumber !== undefined) return 'Magazine';
      if (obj.name) return 'Author';
      return null;
    },
  },
};

// type-only silence
export type Entities = Book | Author | Magazine;
