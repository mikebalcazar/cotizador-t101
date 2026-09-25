// La dirección de workers.dev manda al dominio propio; el dominio y staging sirven.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const ASSETS = { fetch: async () => new Response('sitio') };
const API = { fetch: async () => new Response('api') };
const prod = { DOMINIO_PROPIO: 'quote101.taller101.com', ASSETS, API };
const staging = { ASSETS, API };
const pide = (url, env, init) => worker.fetch(new Request(url, init), env);

test('una lectura en workers.dev manda al dominio con 301, con ruta y consulta', async () => {
  const r = await pide('https://quote101.mike-929.workers.dev/entrar.html?x=1', prod);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://quote101.taller101.com/entrar.html?x=1');
});
test('en el dominio se sirve como siempre (lo abierto, sin sesión)', async () => {
  const r = await pide('https://quote101.taller101.com/entrar.html', prod);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'sitio');
});
test('la puerta a la suite y lo que no es lectura no se redirigen', async () => {
  assert.equal((await pide('https://quote101.mike-929.workers.dev/s101/yo', prod)).status, 200);
  assert.equal((await pide('https://quote101.mike-929.workers.dev/s101/auth/salir', prod, { method: 'POST' })).status, 200);
});
test('staging, sin DOMINIO_PROPIO, sirve tal cual', async () => {
  const r = await pide('https://quote101-staging.mike-929.workers.dev/entrar.html', staging);
  assert.equal(r.status, 200);
});
