import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processPhoto } from "@/lib/photos";

describe("processPhoto", () => {
  it("re-encodes to WEBP, fits 1600px, and strips metadata such as GPS", async () => {
    const input = await sharp({ create: { width: 3200, height: 2000, channels: 3, background: "#7a8" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret-location" } })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await processPhoto(input, "image/jpeg");
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(out.width, out.height)).toBe(1600);
    expect(meta.exif).toBeUndefined();
  });

  it("never enlarges small photos", async () => {
    const input = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#fff" } }).png().toBuffer();
    const out = await processPhoto(input, "image/png");
    expect([out.width, out.height]).toEqual([400, 300]);
  });

  it("rejects a PDF renamed to .jpg", async () => {
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
    await expect(processPhoto(pdf, "image/jpeg")).rejects.toThrow(/bukan gambar/);
  });

  it("rejects files over 8 MB before decoding", async () => {
    const big = Buffer.alloc(8 * 1024 * 1024 + 1, 0xff);
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
    await expect(processPhoto(big, "image/jpeg")).rejects.toThrow(/8 MB/);
  });

  it("rejects absurd pixel counts (decompression bombs)", async () => {
    // 48 megapixels: over the 40 MP cap, small enough to build quickly in a test.
    const huge = await sharp({ create: { width: 8_000, height: 6_000, channels: 3, background: "#000" } }).png().toBuffer();
    await expect(processPhoto(huge, "image/png")).rejects.toThrow();
  });
});
