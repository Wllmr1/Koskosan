import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/env";

/**
 * Private object storage for KTP photos, signatures and signed contracts.
 * Nothing here is ever served from a public URL — reads go through an
 * authenticated route so access is logged.
 *
 * driver "local": a directory on the server (back up the volume!)
 * driver "s3":    any S3-compatible bucket, set to PRIVATE access
 */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const e = env();
  if (e.STORAGE_DRIVER === "s3") {
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      endpoint: e.S3_ENDPOINT || undefined,
      region: e.S3_REGION || "auto",
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
    await client.send(
      new PutObjectCommand({ Bucket: e.S3_BUCKET, Key: key, Body: body, ContentType: contentType })
    );
    return key;
  }
  const full = safeLocalPath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body, { mode: 0o600 });
  return key;
}

export async function getObject(key: string): Promise<Buffer> {
  const e = env();
  if (e.STORAGE_DRIVER === "s3") {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      endpoint: e.S3_ENDPOINT || undefined,
      region: e.S3_REGION || "auto",
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
    const res = await client.send(new GetObjectCommand({ Bucket: e.S3_BUCKET, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  return fs.readFile(safeLocalPath(key));
}

export async function deleteObject(key: string): Promise<void> {
  const e = env();
  if (e.STORAGE_DRIVER === "s3") {
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      endpoint: e.S3_ENDPOINT || undefined,
      region: e.S3_REGION || "auto",
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
    await client.send(new DeleteObjectCommand({ Bucket: e.S3_BUCKET, Key: key }));
    return;
  }
  await fs.rm(safeLocalPath(key), { force: true });
}

/** Blocks path traversal — a key is always relative and segment-safe. */
function safeLocalPath(key: string) {
  const root = path.resolve(env().STORAGE_LOCAL_DIR);
  const full = path.resolve(root, key);
  if (full !== root && !full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/** Validates an uploaded KTP photo by magic bytes, not by the filename. */
export function validateImage(buf: Buffer, declaredType: string) {
  if (buf.byteLength > MAX_UPLOAD_BYTES) throw new Error("Ukuran file maksimal 6 MB.");
  if (!ALLOWED_IMAGE.has(declaredType)) throw new Error("Format harus JPG, PNG, atau WEBP.");
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  if (!isJpeg && !isPng && !isWebp) throw new Error("File bukan gambar yang valid.");
  return isJpeg ? "image/jpeg" : isPng ? "image/png" : "image/webp";
}
