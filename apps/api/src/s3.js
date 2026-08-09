import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export function createS3() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "us-east-1";
  const accessKeyId = process.env.S3_KEY;
  const secretAccessKey = process.env.S3_SECRET;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("S3 env incomplete (S3_ENDPOINT/S3_KEY/S3_SECRET/S3_BUCKET)");
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
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );
      return key;
    },
    async getBuffer(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const chunks = [];
      for await (const c of res.Body) chunks.push(c);
      return Buffer.concat(chunks);
    },
    async signedGet(key, expiresIn = 3600) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn }
      );
    },
    async remove(key) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {}
    },
  };
}
