const fs = require("fs");
const path = require("path");

const SIZES = [16, 32, 48, 192, 512];
const COLOR = "#1565d8";
const BG_COLOR = "#1565d8";

function createPNG(size) {
  const width = size;
  const height = size;
  const channels = 4;

  const rawData = Buffer.alloc(width * height * channels, 0);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.38;
  const strokeW = Math.max(2, Math.ceil(width * 0.12));

  function drawCircle(cx, cy, r, color) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = x - cx + 0.5;
        const dy = y - cy + 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= r && dist >= r - strokeW) {
          const idx = (y * width + x) * 4;
          rawData[idx] = color[0];
          rawData[idx + 1] = color[1];
          rawData[idx + 2] = color[2];
          rawData[idx + 3] = 255;
        }
      }
    }
  }

  const r = parseInt(COLOR.slice(1, 3), 16);
  const g = parseInt(COLOR.slice(3, 5), 16);
  const b = parseInt(COLOR.slice(5, 7), 16);
  drawCircle(cx, cy, radius, [r, g, b]);

  return rawData;
}

function crc32(buf) {
  let crc = -1;
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function makePNG(size, rawData) {
  const width = size;
  const height = size;
  const channels = 4;

  const scanlineLen = width * channels + 1;
  const rawLen = scanlineLen * height;
  const raw = Buffer.alloc(rawLen, 0);

  for (let y = 0; y < height; y++) {
    const offset = y * scanlineLen;
    raw[offset] = 0;
    const srcOff = y * width * channels;
    for (let x = 0; x < width * channels; x++) {
      raw[offset + 1 + x] = rawData[srcOff + x];
    }
  }

  const zlib = require("zlib");
  const compressed = zlib.deflateSync(raw);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crcData = Buffer.concat([t, data]);
    const crcVal = crc32(crcData);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal, 0);
    return Buffer.concat([len, t, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = chunk("IHDR", ihdr);
  const idatChunk = chunk("IDAT", compressed);
  const iendChunk = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createICO(sizes) {
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0);
  iconDir.writeUInt16LE(1, 2);
  iconDir.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = [];

  for (const size of sizes) {
    const rawData = createPNG(size);
    const pngData = makePNG(size, rawData);

    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0);
    entry.writeUInt8(size === 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(pngData.length, 8);
    entry.writeUInt32LE(offset, 12);

    entries.push({ entry, pngData });
    offset += pngData.length;
  }

  return Buffer.concat([iconDir, ...entries.flatMap(e => [e.entry, e.pngData])]);
}

const publicDir = path.join(__dirname, "..", "public");

const icoData = createICO([16, 32, 48]);
fs.writeFileSync(path.join(publicDir, "favicon.ico"), icoData);
console.log("Generated favicon.ico");

for (const size of [192, 512]) {
  const rawData = createPNG(size);
  const pngData = makePNG(size, rawData);
  fs.writeFileSync(path.join(publicDir, `logo${size}.png`), pngData);
  console.log(`Generated logo${size}.png`);
}

console.log("All logos generated successfully!");
