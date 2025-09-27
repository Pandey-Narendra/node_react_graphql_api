require('dotenv').config();
const path = require('path');
const fs = require('fs');

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const { graphqlHTTP } = require('express-graphql');
const cors = require('cors');

const graphqlSchema = require('./graphql/schema');
const graphqlResolver = require('./graphql/resolvers');
const auth = require('./middleware/auth');
const { clearImage } = require('./util/file');

const app = express();

// Ensure images folder exists
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);

// Multer setup
const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'images'),
  filename: (req, file, cb) => {
    const safeName = new Date().toISOString().replace(/:/g, '-') + '-' + file.originalname;
    cb(null, safeName);
  },
});
const fileFilter = (req, file, cb) => {
  if (['image/png', 'image/jpg', 'image/jpeg'].includes(file.mimetype)) cb(null, true);
  else cb(null, false);
};

// Middlewares
app.use(bodyParser.json());
app.use(multer({ storage: fileStorage, fileFilter }).single('image'));
app.use('/images', express.static(imagesDir));

// CORS
app.use((req, res, next) => {
  const frontendUrl = process.env.FRONTEND_URL || '*';
  res.setHeader('Access-Control-Allow-Origin', frontendUrl);
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(auth);

// Image upload route
app.put('/post-image', (req, res, next) => {
  if (!req.isAuth) {
    const error = new Error('Not authenticated!');
    error.statusCode = 401;
    throw error;
  }
  if (!req.file) return res.status(200).json({ message: 'No file provided!' });
  if (req.body.oldPath) clearImage(req.body.oldPath);
  res.status(201).json({ message: 'File stored.', filePath: req.file.path });
});

// GraphQL endpoint
app.use(
  '/graphql',
  graphqlHTTP({
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
  })
);

// Error handling
app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ message: error.message, data: error.data });
});

// MongoDB connection & start server
mongoose
  .connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(process.env.PORT || 8080, () => {
      console.log(`Server running on port ${process.env.PORT || 8080}`);
    });
  })
  .catch(err => console.error('Failed to connect to MongoDB', err));
