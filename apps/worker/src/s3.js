import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

export function createS3() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "us-east-1";
  const accessKeyId = process.env.S3_KEY;
  const secretAccessKey = process.env.S3_SECRET;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("S3 env incomplete");
  }
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return {
    bucket,
    client,
    async put(key, body, contentType = "application/pdf") {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
      return key;
    },
    async getBuffer(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const chunks = [];
      for await (const c of res.Body) chunks.push(c);
      return Buffer.concat(chunks);
    },
    async remove(key) {
      try { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch {}
    },
  };
}
