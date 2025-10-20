const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

/**
 * ✅ S3 Client configuration
 * In AWS Lambda, credentials are automatically provided by IAM role.
 * You only need to specify the region.
 */
const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-south-1', // fallback for local testing
});

/**
 * 🚀 Uploads a file to S3
 * @param {Object} file - { filename, mimetype, base64 }
 * @param {string} bucketName - Target S3 bucket name
 * @returns {string} - Public URL of the uploaded file
 */
const uploadToS3 = async (file, bucketName) => {
  const { filename, mimetype, base64 } = file;

  // Convert base64 string back to binary buffer
  const buffer = Buffer.from(base64, 'base64');
  const Key = `uploads/${Date.now()}-${filename}`;

  const params = {
    Bucket: bucketName,
    Key,
    Body: buffer,
    ContentType: mimetype,
  };

  await s3.send(new PutObjectCommand(params));

  // Return public S3 URL
  return `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${Key}`;
};

/**
 * 🗑 Deletes a file from S3
 * @param {string} fileUrl - Full public URL of the file
 */
const deleteFromS3 = async (fileUrl) => {
  const Key = fileUrl.split('.com/')[1];

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key,
  };

  await s3.send(new DeleteObjectCommand(params));
};

module.exports = { uploadToS3, deleteFromS3 };
