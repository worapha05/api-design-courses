/**
 * GraphQL server — Bookstore (Beginner)
 * รัน: node 01-beginner/examples/03-graphql-server/server.js
 * เปิด: http://localhost:4400
 */
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';

const typeDefs = `#graphql
  type Book {
    id: ID!
    title: String!
    author: String!
    price: Float!
    inStock: Boolean!
  }

  enum OrderStatus {
    PENDING
    PAID
    CANCELLED
  }

  type Order {
    id: ID!
    book: Book!
    quantity: Int!
    status: OrderStatus!
    totalPrice: Float!
  }

  type Query {
    book(id: ID!): Book
    books: [Book!]!
    booksByAuthor(author: String!): [Book!]!
  }

  type Mutation {
    createOrder(bookId: ID!, quantity: Int!): Order!
    updateOrderStatus(orderId: ID!, status: OrderStatus!): Order
  }
`;

const books = [
  {
    id: 'b1',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    price: 1890,
    inStock: true,
  },
  {
    id: 'b2',
    title: 'gRPC: Up and Running',
    author: 'Kasun Indrasiri',
    price: 1290,
    inStock: true,
  },
  {
    id: 'b3',
    title: 'Learning GraphQL',
    author: 'Eve Porcello',
    price: 990,
    inStock: false,
  },
];

const orders = [];
let orderSeq = 1;

const resolvers = {
  Query: {
    book: (_, { id }) => books.find((b) => b.id === id) ?? null,
    books: () => books,
    booksByAuthor: (_, { author }) =>
      books.filter((b) => b.author.toLowerCase().includes(author.toLowerCase())),
  },
  Mutation: {
    createOrder: (_, { bookId, quantity }) => {
      const book = books.find((b) => b.id === bookId);
      if (!book) {
        throw new Error(`Book ${bookId} not found`);
      }
      if (quantity < 1) {
        throw new Error('quantity must be >= 1');
      }
      const order = {
        id: `ord-${orderSeq++}`,
        bookId: book.id,
        quantity,
        status: 'PENDING',
        totalPrice: book.price * quantity,
      };
      orders.push(order);
      return order;
    },
    updateOrderStatus: (_, { orderId, status }) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return null;
      order.status = status;
      return order;
    },
  },
  Order: {
    book: (parent) => books.find((b) => b.id === parent.bookId),
  },
};

const server = new ApolloServer({ typeDefs, resolvers });
const { url } = await startStandaloneServer(server, { listen: { port: 4400 } });

console.log(`GraphQL ready at ${url}`);
console.log('ลอง query:');
console.log(` { books { id title price } }`);
console.log(` mutation { createOrder(bookId: "b1", quantity: 2) { id totalPrice status } }`);
