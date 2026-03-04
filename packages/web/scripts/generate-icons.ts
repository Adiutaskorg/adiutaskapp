/**
 * Generate PWA PNG icons from the favicon SVG.
 * Run: bun packages/web/scripts/generate-icons.ts
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const PUBLIC_DIR = join(import.meta.dir, "../public");

// Colors from favicon.svg
const BG_R = 0x1a, BG_G = 0x1a, BG_B = 0x2e;
const FG_R = 0x40, FG_G = 0x60, FG_B = 0xf7;

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

function drawU(pixels: Uint8Array, size: number) {
  // Draw a rounded rect background (already filled) and a "U" letter
  const cx = size / 2;
  const cy = size * 0.6;
  const letterH = size * 0.45;
  const letterW = size * 0.35;
  const thickness = size * 0.09;
  const radius = letterW / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const topY = cy - letterH / 2;
      const bottomY = cy + letterH / 2 - radius;
      const leftX = cx - letterW / 2;
      const rightX = cx + letterW / 2;

      let inside = false;

      // Left vertical bar
      if (x >= leftX && x <= leftX + thickness && y >= topY && y <= bottomY + radius) {
        inside = true;
      }
      // Right vertical bar
      if (x >= rightX - thickness && x <= rightX && y >= topY && y <= bottomY + radius) {
        inside = true;
      }
      // Bottom curve (semicircle)
      if (y >= bottomY) {
        const dist = Math.sqrt((x - cx) ** 2 + (y - bottomY) ** 2);
        if (dist <= radius && dist >= radius - thickness) {
          if (y >= bottomY) inside = true;
        }
        // Fill between bars at bottom
        if (dist <= radius - thickness) inside = false;
      }

      if (inside) {
        const idx = (y * size + x) * 3;
        pixels[idx] = FG_R;
        pixels[idx + 1] = FG_G;
        pixels[idx + 2] = FG_B;
      }
    }
  }
}

function createPNG(size: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // RGB
  const ihdr = createChunk("IHDR", ihdrData);

  // Pixel data (RGB, with filter byte per row)
  const pixels = new Uint8Array(size * size * 3);
  // Fill background
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3] = BG_R;
    pixels[i * 3 + 1] = BG_G;
    pixels[i * 3 + 2] = BG_B;
  }

  // Draw the "U" letter
  drawU(pixels, size);

  // Add filter bytes (0 = None for each row)
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowOffset = y * (1 + size * 3);
    raw[rowOffset] = 0; // filter: None
    pixels.subarray(y * size * 3, (y + 1) * size * 3).forEach((v, i) => {
      raw[rowOffset + 1 + i] = v;
    });
  }

  const compressed = deflateSync(raw);
  const idat = createChunk("IDAT", compressed);
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// Generate icons
for (const size of [192, 512]) {
  const png = createPNG(size);
  const path = join(PUBLIC_DIR, `pwa-${size}x${size}.png`);
  writeFileSync(path, png);
  console.log(`Created ${path} (${png.length} bytes)`);
}

// Also create apple-touch-icon (180x180)
const applePng = createPNG(180);
writeFileSync(join(PUBLIC_DIR, "apple-touch-icon.png"), applePng);
console.log(`Created apple-touch-icon.png (${applePng.length} bytes)`);
