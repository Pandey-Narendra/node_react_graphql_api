require('dotenv').config();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { ApolloServer } = require('apollo-server-lambda');
const { typeDefs } = require('./graphql/aws/schema');
const resolvers = require('./graphql/aws/resolvers');
const { S3Client } = require('@aws-sdk/client-s3');

// ✅ S3 Client: Use Lambda IAM Role for credentials
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1',
});

// ✅ MongoDB connection caching
let conn = null;
const MONGO_URI = `mongodb+srv://${encodeURIComponent(
  process.env.MONGODB_USERNAME
)}:${encodeURIComponent(process.env.MONGODB_PASSWORD)}@${
  process.env.MONGODB_CLUSTER
}/${process.env.MONGODB_DB_NAME}?retryWrites=true&w=majority`;

// ✅ Apollo Server
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ event, context }) => {
    let authUserId = null;
    let isAuth = false;

    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1]; // Bearer TOKEN
      if (token) {
        try {
          const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
          authUserId = decodedToken.userId;
          isAuth = true;
        } catch (err) {
          isAuth = false;
        }
      }
    }

    return { s3, event, context, authUserId, isAuth };
  },
  formatError: (err) => {
    if (!err.originalError) return err;
    return {
      message: err.message,
      status: err.originalError.code || 500,
      data: err.originalError.data,
    };
  },
  introspection: true, // ✅ Enable GraphQL Playground / Apollo Studio
  playground: true,
});

// ✅ Lambda Handler
exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  // Maintain DB connection between Lambda invocations
  if (!conn) {
    conn = mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await conn;
    console.log('✅ MongoDB connected');
  }

  const handler = server.createHandler({
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      credentials: true,
    },
  });

  return handler(event, context);
};
