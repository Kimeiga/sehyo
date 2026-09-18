import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compile } from 'svelte/compiler';

const paths = [
  'src/lib/components/Navbar.svelte',
  'src/lib/components/Menu.svelte',
  'src/routes/prototype/personality/+page.svelte'
];
for (const path of paths) {
  for (const generate of ['client', 'server']) {
    test(`${path} compiles for ${generate} without accessibility warnings`, async () => {
      const source = await readFile(path, 'utf8');
      const result = compile(source, { filename: path, generate });
      assert.deepEqual(result.warnings.filter(w => w.code.startsWith('a11y')).map(w => w.message), []);
    });
  }
}
test('preview is explicitly illustrative and is not a replacement test', async () => {
  const source = await readFile(paths[2], 'utf8');
  assert.match(source, /noindex, nofollow/);
  assert.match(source, /not a live personality test/);
  assert.match(source, /not generated from your answers/);
  assert.match(source, /still need to be located and connected/);
  assert.doesNotMatch(source, /\b(fetch|localStorage|sessionStorage|sendBeacon)\b|<form\b|<input\b/);
});
test('navigation destinations exist and the dialog is connected to its trigger', async () => {
  for (const route of ['', 'about', 'messages']) {
    await readFile(`src/routes/${route ? `${route}/` : ''}+page.svelte`, 'utf8');
  }
  const navbar = await readFile(paths[0], 'utf8');
  const menu = await readFile(paths[1], 'utf8');
  assert.match(navbar, /aria-controls="sehyo-menu"/);
  assert.match(menu, /id="sehyo-menu"/);
  assert.match(menu, /dialog\.showModal\(\)/);
  assert.match(menu, /href="\/messages"/);
  assert.doesNotMatch(menu, /\balert\(/);
});
