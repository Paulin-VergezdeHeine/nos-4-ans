/*
 * Génère les icônes PNG de l'app (un échiquier encadré) sans dépendance externe.
 * Encodeur PNG minimal (RVB, filtre 0) + zlib de Node.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePNG(size, px) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filtre "none"
    for (let x = 0; x < size; x++) {
      const c = px(x, y);
      raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // color type RVB
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Palette (cohérente avec l'app).
const FRAME = [42, 32, 23];     // #2a2017
const LIGHT = [233, 217, 184];  // #e9d9b8
const DARK = [154, 111, 67];    // #9a6f43
const BG = [31, 29, 24];        // #1f1d18

function boardPixel(size) {
  const pad = Math.round(size * 0.10);     // marge "safe zone" pour icône maskable
  const inner = size - 2 * pad;
  const frame = Math.max(2, Math.round(size * 0.02));
  const boardStart = pad + frame;
  const boardSize = inner - 2 * frame;
  const cell = boardSize / 8;
  return (x, y) => {
    if (x < pad || y < pad || x >= size - pad || y >= size - pad) return BG;
    if (x < boardStart || y < boardStart || x >= boardStart + boardSize || y >= boardStart + boardSize) return FRAME;
    const col = Math.floor((x - boardStart) / cell);
    const row = Math.floor((y - boardStart) / cell);
    return ((col + row) % 2 === 0) ? LIGHT : DARK;
  };
}

const root = path.join(__dirname, '..');
[[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']].forEach(([s, name]) => {
  const buf = makePNG(s, boardPixel(s));
  fs.writeFileSync(path.join(root, name), buf);
  console.log('écrit ' + name + ' (' + s + 'px, ' + buf.length + ' octets)');
});
