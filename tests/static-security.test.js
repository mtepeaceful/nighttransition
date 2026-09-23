import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const srcDir = fileURLToPath(new URL('../src', import.meta.url));

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

const files = listFiles(srcDir).map((path) => ({
  path: relative(srcDir, path),
  ext: path.split('.').pop(),
  content: readFileSync(path, 'utf8'),
}));

const JS_FORBIDDEN = [
  [/\beval\s*\(/, 'eval()'],
  [/new\s+Function\s*\(/, 'new Function()'],
  [/set(Timeout|Interval)\s*\(\s*['"`]/, 'setTimeout/setInterval com string'],
  [/\.(innerHTML|outerHTML)\s*[+]?=/, 'innerHTML/outerHTML'],
  [/insertAdjacentHTML\s*\(/, 'insertAdjacentHTML'],
  [/document\.write(ln)?\s*\(/, 'document.write'],
  [/\b(localStorage|sessionStorage)\b/, 'localStorage/sessionStorage'],
  [/\bimportScripts\s*\(/, 'importScripts'],
  [/import\s*\(\s*['"`]https?:/, 'import remoto'],
];

const SECRET_PATTERNS = [
  [/api[_-]?key\s*[:=]\s*['"`][^'"`]+/i, 'API key hardcoded'],
  [/(secret|password|token)\s*[:=]\s*['"`][^'"`]{8,}/i, 'segredo hardcoded'],
];

const REMOTE_URL = /https?:\/\/(?!www\.w3\.org\/2000\/svg)/;

test('JS sem sinks perigosos nem execução dinâmica', () => {
  for (const file of files.filter((f) => f.ext === 'js')) {
    for (const [pattern, label] of JS_FORBIDDEN) {
      assert.doesNotMatch(file.content, pattern, `${label} em ${file.path}`);
    }
  }
});

test('nenhum segredo hardcoded', () => {
  for (const file of files) {
    for (const [pattern, label] of SECRET_PATTERNS) {
      assert.doesNotMatch(file.content, pattern, `${label} em ${file.path}`);
    }
  }
});

test('nenhuma URL remota nem http inseguro', () => {
  for (const file of files.filter((f) => ['js', 'html', 'css'].includes(f.ext))) {
    assert.doesNotMatch(file.content, REMOTE_URL, `URL remota em ${file.path}`);
  }
});

test('HTML sem script inline nem handlers inline', () => {
  for (const file of files.filter((f) => f.ext === 'html')) {
    for (const tag of file.content.match(/<script\b[^>]*>/gi) ?? []) {
      assert.match(tag, /\bsrc=/, `script inline em ${file.path}`);
    }
    assert.doesNotMatch(file.content, /\son[a-z]+\s*=/i, `handler inline em ${file.path}`);
    assert.doesNotMatch(file.content, /javascript:/i, `javascript: em ${file.path}`);
  }
});
