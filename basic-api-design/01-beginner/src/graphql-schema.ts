import gql from 'graphql-tag';

/** GraphQL SDL as a document node (Beginner) */
export const typeDefs = gql`
  type Author {
    id: ID!
    name: String!
    bio: String
    books: [Book!]!
  }

  type Book {
    id: ID!
    title: String!
    isbn: String!
    price: Float!
    genre: String!
    publishedAt: String
    author: Author!
    reviews: [Review!]!
  }

  type Review {
    id: ID!
    rating: Int!
    body: String
    book: Book!
  }

  type Query {
    book(id: ID!): Book
    books(limit: Int = 20, genre: String): [Book!]!
    author(id: ID!): Author
    authors: [Author!]!
  }

  type Mutation {
    createBook(title: String!, isbn: String!, authorId: ID!, price: Float!, genre: String!): Book!
    addReview(bookId: ID!, rating: Int!, body: String): Review!
  }
`;
