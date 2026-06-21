// Shared AWS S3 client + helpers. Replaces the old Cloudinary integration.
//
// Required env vars:
//   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME
//
// Note on public access: objects are served via the standard virtual-hosted URL
// (https://<bucket>.s3.<region>.amazonaws.com/<key>). For those URLs to be
// publicly readable (WhatsApp media links, profile pictures, PDFs) the bucket
// needs a public-read bucket policy on s3:GetObject. We do NOT set per-object
// ACLs because modern buckets have ACLs disabled (Object Ownership = Bucket
// owner enforced), which would make `acl: 'public-read'` throw.

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.AWS_S3_BUCKET_NAME;

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Build the public URL for a stored object key.
function publicUrl(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

// Upload an in-memory buffer (e.g. a generated PDF) and return its public URL.
// Used by the programmatic PDF generators (statements, receipts, salary, quotes).
async function uploadBufferToS3(buffer, key, contentType = 'application/pdf') {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return publicUrl(key);
}

module.exports = { s3, BUCKET, publicUrl, uploadBufferToS3 };
