require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');
const { graphqlHTTP } = require('express-graphql');
const cors = require('cors');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');

const graphqlSchema = require('./graphql/schema');
const graphqlResolver = require('./graphql/resolvers');
const auth = require('./middleware/auth');
const { clearImage } = require('./util/file');

const app = express();

// --------------------------------------------------------------------------------------------------------------------------------
// ✅ AWS SDK v3 Configuration

const s3 = new S3Client({
	region: process.env.AWS_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
	},
});

// --------------------------------------------------------------------------------------------------------------------------------
// ✅ Multer local storage (temporary)

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
	fs.mkdirSync(uploadDir);
}

const fileStorage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, uploadDir);
	},
	filename: (req, file, cb) => {
		const safeName = Date.now() + '-' + file.originalname;
		cb(null, safeName);
	}
});

const fileFilter = (req, file, cb) => {
	if (
		file.mimetype === 'image/png' ||
		file.mimetype === 'image/jpg' ||
		file.mimetype === 'image/jpeg'
	) {
		cb(null, true);
	} else {
		cb(null, false);
	}
};

app.use(multer({ storage: fileStorage, fileFilter: fileFilter }).single('image'));

// --------------------------------------------------------------------------------------------------------------------------------
// ✅ CORS Middleware

app.use((req, res, next) => {
	const frontendUrl = process.env.FRONTEND_URL || '*';
	res.setHeader('Access-Control-Allow-Origin', frontendUrl);
	res.setHeader(
		'Access-Control-Allow-Methods',
		'OPTIONS, GET, POST, PUT, PATCH, DELETE'
	);
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	if (req.method === 'OPTIONS') {
		return res.sendStatus(200);
	}
	next();
});

app.use(bodyParser.json());
app.use(auth);

// --------------------------------------------------------------------------------------------------------------------------------
// ✅ Image Upload Route → S3 using v3

app.put('/post-image', async (req, res, next) => {
	try {
		if (!req.isAuth) {
			const error = new Error('Not authenticated!');
			error.statusCode = 401;
			throw error;
		}

		if (!req.file) {
			return res.status(200).json({ message: 'No file provided!' });
		}

		const filePath = req.file.path;
		const fileStream = fs.createReadStream(filePath);
		const s3Key = `uploads/${Date.now()}-${req.file.originalname}`;

		// ACL: 'public-read',
		const uploadParams = {
			Bucket: process.env.AWS_BUCKET_NAME,
			Key: s3Key,
			Body: fileStream,
			ContentType: req.file.mimetype
		};

		// Perform S3 upload
		const parallelUpload = new Upload({
			client: s3,
			params: uploadParams,
		});

		const result = await parallelUpload.done();

		// Clean up local file after upload
		fs.unlinkSync(filePath);

		if (req.body.oldPath) {
			clearImage(req.body.oldPath);
		}

		console.log('s3 bucket image path', `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`);
		res.status(201).json({
			message: 'File uploaded to S3 successfully',
			fileUrl: `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`
		});
	} catch (error) {
		console.error('Upload error:', error);
		next(error);
	}
});

// --------------------------------------------------------------------------------------------------------------------------------
// ✅ GraphQL Endpoint

app.use(
	'/graphql',
	graphqlHTTP({
		schema: graphqlSchema,
		rootValue: graphqlResolver,
		graphiql: true,
		customFormatErrorFn(err) {
			if (!err.originalError) {
				return err;
			}
			const data = err.originalError.data;
			const message = err.message || 'An error occurred.';
			const code = err.originalError.code || 500;
			return { message, status: code, data };
		}
	})
);

// --------------------------------------------------------------------------------------------------------------------------------
// ✅ Error handling

app.use((error, req, res, next) => {
	console.error(error);
	const status = error.statusCode || 500;
	const message = error.message;
	const data = error.data;
	res.status(status).json({ message, data });
});

// --------------------------------------------------------------------------------------------------------------------------------
// ✅ MongoDB Connection

const username = encodeURIComponent(process.env.MONGODB_USERNAME);
const password = encodeURIComponent(process.env.MONGODB_PASSWORD);
const cluster = process.env.MONGODB_CLUSTER;
const dbName = process.env.MONGODB_DB_NAME;

const MONGODB_URI = `mongodb+srv://${username}:${password}@${cluster}/${dbName}`;

mongoose
	.connect(MONGODB_URI, {
		useNewUrlParser: true,
		useUnifiedTopology: true,
	})
	.then(() => {
		console.log('Connected to MongoDB');
		app.listen(process.env.PORT || 8080, () => {
			console.log(`🚀 Server running on port ${process.env.PORT || 8080}`);
		});
	})
	.catch(err => {
		console.error('Failed to connect to MongoDB', err);
	});
