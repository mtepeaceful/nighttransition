import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { buildZip } from './scripts/pack.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8').replace(/^﻿/, ''));
const { buffer } = buildZip(root);

function readZipEntries(zip) {
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50, 'fim do diretório central ausente');
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);

  return Array.from({ length: count }, () => {
    assert.equal(zip.readUInt32LE(cursor), 0x02014b50, 'entrada do diretório central inválida');
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    assert.equal(zip.readUInt32LE(localOffset), 0x04034b50, `cabeçalho local inválido: ${name}`);
    const size = zip.readUInt32LE(localOffset + 18);
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    return { name, data: inflateRawSync(zip.subarray(dataStart, dataStart + size)) };
  });
}

const entries = readZipEntries(buffer);
const names = entries.map((entry) => entry.name);

test('zip tem o manifest.json na raiz', () => {
  assert.ok(names.includes('manifest.json'));
});

test('zip leva só manifest.json, src/ e assets/', () => {
  for (const name of names) {
    assert.match(name, /^(manifest\.json|src\/.+|assets\/.+)$/, `arquivo fora do pacote: ${name}`);
  }
});

test('zip inclui todos os arquivos que o manifest referencia', () => {
  const referenced = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((s) => [...(s.js ?? []), ...(s.css ?? [])]),
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const path of referenced) assert.ok(names.includes(path), `ausente no zip: ${path}`);
});

test('conteúdo descompactado é idêntico ao do disco', () => {
  for (const { name, data } of entries) {
    assert.ok(data.equals(readFileSync(join(root, name))), `conteúdo diferente: ${name}`);
  }
});

test('zip é reproduzível', () => {
  assert.ok(buildZip(root).buffer.equals(buffer));
});
