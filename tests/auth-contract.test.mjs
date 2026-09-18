import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual modules with explicit dependency doubles, never a real
// database. Full svelte-check verifies the real configured Better Auth types.
async function loadModule(path, dependencies) {
  const source = await readFile(path, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    console: { log() {}, error() {} },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    }
  }, { filename: path });
  return exports;
}

const environment = { GOOGLE_CLIENT_ID: 'fixture-client', GOOGLE_CLIENT_SECRET: 'fixture-secret', BETTER_AUTH_SECRET: 'fixture-session-secret' };
async function authFactory() {
  const created = [];
  const module = await loadModule('src/lib/server/better-auth.ts', {
    'better-auth': { betterAuth(options) { const instance = { options, api: { signInAnonymous() {} } }; created.push(instance); return instance; } },
    'better-auth/plugins': { anonymous: options => ({ id: 'anonymous', options }) },
    'drizzle-orm/d1': { drizzle: db => db },
    'better-auth/adapters/drizzle': { drizzleAdapter: db => db },
    './db/schema': {},
    './random-name': { generateRandomName: () => 'Fixture Name' }
  });
  return { ...module, created };
}

test('configured auth instance is reused only for its existing origin key', async () => {
  const { createAuth, created } = await authFactory();
  const db = {};
  const first = createAuth(db, environment, 'https://one.example');
  assert.equal(createAuth(db, environment, 'https://one.example'), first);
  assert.notEqual(createAuth(db, environment, 'https://two.example'), first);
  assert.equal(created.length, 2);
  assert.equal(typeof first.api.signInAnonymous, 'function');
});
test('factory retains session, provider and anonymous-link settings', async () => {
  const { createAuth } = await authFactory();
  const { options } = createAuth({}, environment, 'https://one.example');
  assert.equal(options.secret, environment.BETTER_AUTH_SECRET);
  assert.equal(options.socialProviders.google.redirectURI, 'https://one.example/api/auth/callback/google');
  assert.equal(options.session.expiresIn, 60 * 60 * 24 * 30);
  assert.equal(options.session.cookieCache.maxAge, 300);
  assert.equal(options.advanced.crossSubDomainCookies.enabled, false);
  assert.equal(options.plugins[0].id, 'anonymous');
  assert.equal(options.plugins[0].options.generateName(), 'Fixture Name');
  assert.equal(typeof options.plugins[0].options.onLinkAccount, 'function');
});

async function anonymousRoute(createAuth) {
  return loadModule('src/routes/api/auth/anonymous/+server.ts', {
    '$lib/server/better-auth': { createAuth },
    '@sveltejs/kit': { error: (status, message) => Object.assign(new Error(message), { status }) }
  });
}
test('anonymous route requests and forwards the actual Response with cookies', async () => {
  const request = new Request('https://one.example/api/auth/anonymous', { method: 'POST', headers: { cookie: 'existing=fixture' } });
  const response = new Response('{"ok":true}', { status: 201, headers: { 'set-cookie': 'fixture=session; HttpOnly; Secure' } });
  let calls = 0;
  const { POST } = await anonymousRoute(() => ({ api: { async signInAnonymous(options) {
    calls++;
    assert.equal(options.headers, request.headers);
    assert.equal(options.asResponse, true);
    return response;
  } } }));
  const result = await POST({ request, platform: { env: { ...environment, DB: {} } } });
  assert.equal(result, response);
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('set-cookie'), 'fixture=session; HttpOnly; Secure');
  assert.equal(calls, 1);
});
test('anonymous route fails closed when no database is available', async () => {
  const { POST } = await anonymousRoute(() => { throw new Error('Must not construct auth'); });
  await assert.rejects(POST({ request: new Request('https://one.example'), platform: undefined }), { status: 500, message: 'Database not available' });
});
test('anonymous route does not report success after an auth failure', async () => {
  const { POST } = await anonymousRoute(() => ({ api: { async signInAnonymous() { throw new Error('fixture failure'); } } }));
  await assert.rejects(POST({ request: new Request('https://one.example'), platform: { env: { ...environment, DB: {} } } }), { status: 500, message: 'Failed to create anonymous session' });
});
