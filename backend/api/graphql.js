require('dotenv').config();
const { graphqlHTTP } = require('express-graphql');
const mongoose = require('mongoose');

const graphqlSchema = require('../graphql/schema');
const graphqlResolver = require('../graphql/resolvers');

// For Vercel serverless, we export a function
module.exports = async (req, res) => {
  // Connect to MongoDB per request (serverless)
  try {
    if (!mongoose.connection.readyState) {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
  } catch (err) {
    console.error('MongoDB connection failed', err);
    res.status(500).json({ message: 'Database connection error' });
    return;
  }

  // Run GraphQL
  return graphqlHTTP({
    schema: graphqlSchema,
    rootValue: graphqlResolver,
    graphiql: true,
    customFormatErrorFn(err) {
      if (!err.originalError) return err;
      const data = err.originalError.data;
      const message = err.message || 'An error occurred';
      const code = err.originalError.code || 500;
      return { message, status: code, data };
    },
  })(req, res);
};
