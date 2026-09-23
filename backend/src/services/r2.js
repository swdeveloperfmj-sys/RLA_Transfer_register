import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_URL'];
export const r2Configured = () => required.every(name => Boolean(process.env[name]));

let client;
const r2 = () => {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
    });
  }
  return client;
};

const publicUrlFor = key => `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;

export const uploadInvoiceToR2 = async ({ key, body, contentType }) => {
  await r2().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, Body: body, ContentType: contentType }));
  return publicUrlFor(key);
};

export const deleteInvoiceFromR2 = key => r2().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
