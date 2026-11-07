import {
  S3Client,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';

const endpoint = process.env.MINIO_ENDPOINT || 'http://minio:9000';
const region = process.env.MINIO_REGION || 'us-east-1';

export const BUCKET = process.env.MINIO_BUCKET || 'livre-files';
export const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB || '25', 10);

export const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER || '',
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD || '',
  },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Garante que o bucket exista. Tenta novamente por alguns segundos,
 * pois o admin-api pode iniciar logo após o MinIO.
 */
export async function ensureBucket(retries = 15) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
      return;
    } catch (err: any) {
      lastError = err;
      const status = err?.$metadata?.httpStatusCode;
      const code = err?.name;

      if (status === 404 || code === 'NotFound' || code === 'NoSuchBucket') {
        try {
          await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
          return;
        } catch (createErr) {
          lastError = createErr;
        }
      }

      if (attempt < retries - 1) await sleep(2000);
    }
  }

  throw lastError;
}

export const ALLOWED_MIME_PREFIXES = ['image/', 'text/'];
export const ALLOWED_MIME_EXACT = new Set([
  'application/pdf',
  'application/json',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
]);

export function isAllowedMime(mime: string): boolean {
  if (!mime) return false;
  if (ALLOWED_MIME_EXACT.has(mime)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}
