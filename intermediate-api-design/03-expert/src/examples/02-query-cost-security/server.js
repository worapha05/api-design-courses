/**
 * Query Depth Limiting + Cost Analysis
 * รัน: node 03-expert/examples/02-query-cost-security/server.js
 */
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import depthLimit from 'graphql-depth-limit';
import { GraphQLError } from 'graphql';

const MAX_COST = 50;

const typeDefs = `#graphql
  type Comment { id: ID! body: String! }
  type Post {
    id: ID!
    title: String!
    comments: [Comment!]!
  }
  type User {
    id: ID!
    name: String!
    posts: [Post!]!
  }
  """ใช้สาธิต depth limit — nested child ได้ไม่จำกัดใน schema"""
  type TreeNode {
    id: ID!
    child: TreeNode
  }
  type Query {
    users: [User!]!
    expensiveList(limit: Int! = 10): [User!]!
    root: TreeNode!
  }
`;

const comments = [
  { id: 'c1', body: 'hi', postId: 'post1' },
  { id: 'c2', body: 'yo', postId: 'post1' },
];
const posts = [{ id: 'post1', title: 'Hello', userId: 'u1' }];
const users = [{ id: 'u1', name: 'Ann' }];
const rootNode = { id: 'n0' };

/** ประมาณการ cost แบบง่ายจาก AST */
function estimateCost(document) {
  let cost = 0;

  const visit = (selections, multiplier = 1) => {
    for (const sel of selections || []) {
      if (sel.kind !== 'Field') continue;
      const name = sel.name.value;
      let fieldCost = 1;

      if (name === 'posts' || name === 'comments' || name === 'users' || name === 'expensiveList') {
        fieldCost = 5;
      }

      let listFactor = multiplier;
      const limitArg = sel.arguments?.find((a) => a.name.value === 'limit');
      if (limitArg?.value?.kind === 'IntValue') {
        listFactor *= Math.min(Number(limitArg.value.value), 100);
      }

      cost += fieldCost * listFactor;

      if (sel.selectionSet) visit(sel.selectionSet.selections, listFactor);
    }
  };

  for (const def of document.definitions) {
    if (def.kind === 'OperationDefinition') visit(def.selectionSet.selections);
  }

  return cost;
}

const costLimitPlugin = {
  async requestDidStart() {
    return {
      async didResolveOperation(ctx) {
        const cost = estimateCost(ctx.document);
        ctx.contextValue.cost = cost;
        if (cost > MAX_COST) {
          throw new GraphQLError(`Query cost ${cost} exceeds max ${MAX_COST}`, {
            extensions: { code: 'QUERY_TOO_EXPENSIVE', cost, max: MAX_COST },
          });
        }
      },
    };
  },
};

const resolvers = {
  Query: {
    users: () => users,
    expensiveList: (_, { limit }) =>
      Array.from({ length: Math.min(limit, 100) }, (_, i) => ({
        id: `u${i}`,
        name: `User${i}`,
      })),
    root: () => rootNode,
  },
  User: {
    posts: (u) => posts.filter((p) => p.userId === u.id),
  },
  Post: {
    comments: (p) => comments.filter((c) => c.postId === p.id),
  },
  TreeNode: {
    child: (n) => ({ id: `${n.id}.c` }),
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  validationRules: [depthLimit(5)],
  plugins: [costLimitPlugin],
});

const { url } = await startStandaloneServer(server, {
  listen: { port: 4006 },
  context: async () => ({}),
});

console.log(`Security demo at ${url}`);
console.log(`Depth max=5, cost max=${MAX_COST}`);
console.log('Cost reject: { expensiveList(limit: 20) { name posts { comments { id } } } }');
console.log('Depth reject: { root { child { child { child { child { child { id } } } } } } }');
