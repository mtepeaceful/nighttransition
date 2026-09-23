import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

export const PACKAGE_ROOTS = ['manifest.json', 'src', 'assets'];
const IGNORED_NAMES = new Set(['Thumbs.db', 'desktop.ini']);

const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function listFiles(root, path) {
  if (!statSync(join(root, path)).isDirectory()) return [path];
  return readdirSync(join(root, path), { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && !IGNORED_NAMES.has(entry.name))
    .flatMap((entry) => listFiles(root, join(path, entry.name)));
}

export function collectPackageFiles(root) {
  return PACKAGE_ROOTS.flatMap((path) => listFiles(root, path))
    .map((path) => path.split(sep).join('/'))
    .sort();
}

export function buildZip(root) {
  const files = collectPackageFiles(root);
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const name of files) {
    const data = readFileSync(join(root, name));
    const compressed = deflateRawSync(data, { level: 9 });
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);

  return { files, buffer: Buffer.concat([...locals, centralDir, end]) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const { version } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8').replace(/^﻿/, ''));
  const { files, buffer } = buildZip(root);
  const outDir = join(root, 'dist');
  const outFile = join(outDir, `night-transition-${version}.zip`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, buffer);
  console.log(`${relative(root, outFile)}: ${files.length} arquivos, ${(buffer.length / 1024).toFixed(1)} KB`);
}
