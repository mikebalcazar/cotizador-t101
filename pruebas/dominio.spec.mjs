// La dirección de workers.dev manda al dominio propio; el dominio y staging sirven.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const ASSETS = { fetch: async () => new Response('sitio') };
const API = { fetch: async () => new Response('api') };
const prod = { DOMINIO_PROPIO: 'quote.suite101.app', DOMINIO_ANTERIOR: 'quote101.taller101.com', ASSETS, API };
const staging = { ASSETS, API };
const pide = (url, env, init) => worker.fetch(new Request(url, init), env);

test('una lectura en workers.dev manda al dominio con 301, con ruta y consulta', async () => {
  const r = await pide('https://quote101.mike-929.workers.dev/entrar.html?x=1', prod);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://quote.suite101.app/entrar.html?x=1');
});
test('en el dominio se sirve como siempre (lo abierto, sin sesión)', async () => {
  const r = await pide('https://quote.suite101.app/entrar.html', prod);
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
test('sin la «s»: http en el dominio propio manda a https con 301 (30-sep-2026)', async () => {
  const r = await pide('http://quote.suite101.app/?x=1', prod);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://quote.suite101.app/?x=1');
  assert.notEqual((await pide('http://quote.suite101.app/', prod, { method: 'POST' })).status, 301);
  assert.notEqual((await pide('http://quote101-staging.mike-929.workers.dev/', staging)).status, 301);
});
test('la dirección vieja (taller101.com) manda a suite101.app con 301, con ruta y consulta (11-oct-2026)', async () => {
  const r = await pide('https://quote101.taller101.com/cotizacion/7?x=1&y=2', prod);
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://quote.suite101.app/cotizacion/7?x=1&y=2');
  const h = await pide('http://quote101.taller101.com/entrar.html', prod, { method: 'HEAD' });
  assert.equal(h.status, 301);
  assert.equal(h.headers.get('location'), 'https://quote.suite101.app/entrar.html');
  assert.notEqual((await pide('https://quote101.taller101.com/', prod, { method: 'POST' })).status, 301, 'un POST no se convierte en GET');
});
test('desde la dirección vieja, la puerta a la suite no se redirige', async () => {
  const r = await pide('https://quote101.taller101.com/s101/yo', prod);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'api');
  assert.equal((await pide('https://quote101.taller101.com/s101', prod)).status, 200);
});
test('DOMINIO_ANTERIOR acepta varios, separados por comas', async () => {
  const env = { ...prod, DOMINIO_ANTERIOR: ' otro.ejemplo.com , quote101.taller101.com ,' };
  assert.equal((await pide('https://quote101.taller101.com/', env)).headers.get('location'), 'https://quote.suite101.app/');
  assert.equal((await pide('https://otro.ejemplo.com/a', env)).headers.get('location'), 'https://quote.suite101.app/a');
});
test('el dominio de una empresa no se redirige', async () => {
  const r = await pide('https://quote.acme.com/entrar.html', prod);
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'sitio');
});
