import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));

const ALLOWED_PERMISSIONS = ['activeTab', 'alarms', 'notifications', 'storage'];

test('usa Manifest V3', () => {
  assert.equal(manifest.manifest_version, 3);
});

test('permissões são exatamente a allowlist (alterar exige revisão consciente)', () => {
  assert.deepEqual([...manifest.permissions].sort(), ALLOWED_PERMISSIONS);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.optional_host_permissions, undefined);
});

test('CSP restritiva', () => {
  const csp = manifest.content_security_policy?.extension_pages ?? '';
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /unsafe-|https?:|\*/);
});

test('service worker é módulo', () => {
  assert.equal(manifest.background.type, 'module');
});

test('content scripts rodam no mundo isolado', () => {
  for (const script of manifest.content_scripts) {
    assert.notEqual(script.world, 'MAIN');
  }
});

test('não expõe recursos para páginas web', () => {
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(manifest.externally_connectable, undefined);
});

test('todos os arquivos referenciados existem e são locais', () => {
  const paths = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((s) => [...(s.js ?? []), ...(s.css ?? [])]),
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];
  for (const path of paths) {
    assert.doesNotMatch(path, /^[a-z]+:/i, path);
    assert.ok(existsSync(join(root, path)), `arquivo ausente: ${path}`);
  }
});
