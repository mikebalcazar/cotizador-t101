/* La puerta de quote101, en una mesa de trabajo.
 *
 * El Worker es un módulo con `export default { fetch }`, así que se llama aquí
 * mismo con un `env` de mentiras: una suite que contesta lo que se le diga y
 * unos archivos que dicen su nombre. Lo que se prueba es lo que trajo la fase
 * 2 —que la app no se entregue sin sesión— y se prueba sobre todo lo que NO
 * debe pasar: eso es lo que un despliegue no enseña hasta que ya es tarde.
 *
 *   node --test pruebas/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

/* ─────────── el mundo de mentiras ─────────── */

const SUITE = {
  duena: { usuario: { correo: 'mike@forespot.com' }, superadmin: true, orgs: [] },
  // Como la guarda la suite de verdad: llaves cortas, no nombres de app.
  cotiza: { usuario: { correo: 'fer@forespot.com' }, superadmin: false, orgs: [{ id: 'forespot', apps: ['cotizador', 'dash'] }] },
  todas: { usuario: { correo: 'socia@forespot.mx' }, superadmin: false, orgs: [{ id: 'forespot', apps: [] }] },
  nombre_largo: { usuario: { correo: 'otra@forespot.mx' }, superadmin: false, orgs: [{ id: 'forespot', apps: ['cotizador101'] }] },
  sin_quote: { usuario: { correo: 'obra@forespot.mx' }, superadmin: false, orgs: [{ id: 'forespot', apps: ['quell'] }] },
};

function mundo() {
  const pedidas = [];
  const env = {
    pedidas,
    API: {
      async fetch(req) {
        const u = new URL(req.url);
        pedidas.push({ ruta: u.pathname, app: req.headers.get('X-App'), metodo: req.method });
        if (u.pathname !== '/yo') return new Response(JSON.stringify({ ok: true, data: { eco: u.pathname } }), { status: 200 });
        const galleta = /(?:^|;\s*)s101=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];
        const quien = SUITE[galleta ?? ''] ?? null;
        if (!quien) return new Response(JSON.stringify({ ok: false, error: 'sin_sesion' }), { status: 401 });
        return new Response(JSON.stringify({ ok: true, data: quien }), { status: 200 });
      },
    },
    ASSETS: { async fetch(req) { return new Response('archivo: ' + new URL(req.url).pathname, { status: 200 }); } },
  };
  return env;
}

const pide = (ruta, cabeceras = {}, env = mundo()) =>
  worker.fetch(new Request('https://quote101.mike-929.workers.dev' + ruta, { headers: cabeceras }), env);
const como = (galleta) => ({ Cookie: `s101=${galleta}` });

/* ─────────── lo que se prueba ─────────── */

test('sin sesión, la app no se entrega: manda a la pantalla de entrada', async () => {
  for (const ruta of ['/', '/index.html', '/loquesea']) {
    const r = await pide(ruta);
    assert.equal(r.status, 302, `${ruta} debería mandar a entrar`);
    assert.ok(r.headers.get('location').endsWith('/entrar.html'), `${ruta} → ${r.headers.get('location')}`);
  }
});

test('una galleta que la suite no reconoce tampoco abre', async () => {
  const r = await pide('/', como('inventada'));
  assert.equal(r.status, 302);
});

test('la pantalla de entrada y sus piezas SÍ son públicas', async () => {
  for (const ruta of ['/entrar.html', '/entrar.js', '/fonts/raleway-400.woff2', '/no-publicado.html', '/huella.txt']) {
    const r = await pide(ruta);
    assert.equal(r.status, 200, `${ruta} debería servirse sin sesión`);
  }
});

test('con sesión y con quote101 entre sus apps, la app se entrega', async () => {
  for (const galleta of ['duena', 'cotiza', 'todas', 'nombre_largo']) {
    const r = await pide('/', como(galleta));
    assert.equal(r.status, 200, `${galleta} debería entrar`);
    assert.equal(await r.text(), 'archivo: /');
  }
});

test('con sesión pero sin quote101 entre sus apps, NO se entrega', async () => {
  const r = await pide('/', como('sin_quote'));
  assert.equal(r.status, 302);
});

test('la lista de apps se compara con la llave corta, que es como la guarda la suite', async () => {
  // El 16-sep esto mismo, escrito contra el nombre largo, dejó fuera a un
  // contratista en quell101 y a cualquiera con lista propia en roster101.
  const conLlave = await pide('/', como('cotiza'));
  assert.equal(conLlave.status, 200, 'apps: ["cotizador"] debería abrir');
});

test('la puerta a la suite sigue funcionando, y el Worker pone X-App', async () => {
  const env = mundo();
  const r = await worker.fetch(new Request('https://quote101.mike-929.workers.dev/s101/auth/codigo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App': 'me-quiero-hacer-pasar-por-otro' },
    body: '{"correo":"x@y.mx"}',
  }), env);
  assert.equal(r.status, 200);
  assert.equal(env.pedidas[0].ruta, '/auth/codigo', 'el prefijo se quita');
  assert.equal(env.pedidas[0].app, 'cotizador101', 'X-App lo pone el Worker y pisa lo que mandó la app');
  assert.equal(env.pedidas[0].metodo, 'POST');
});

test('/s101 pelón va a la raíz de la API, y /s101cosas NO se desvía', async () => {
  const env = mundo();
  await worker.fetch(new Request('https://quote101.mike-929.workers.dev/s101'), env);
  assert.equal(env.pedidas[0].ruta, '/');

  const otro = mundo();
  const r = await worker.fetch(new Request('https://quote101.mike-929.workers.dev/s101cosas'), otro);
  assert.equal(otro.pedidas.length, 0, '/s101cosas no debería tocar la API');
  assert.equal(r.status, 302, 'y sin sesión se queda en la puerta');
});

test('pedir /yo a la suite no cuesta una llamada cuando no hay cookie', async () => {
  // Sin cookie no hay nada que preguntar: preguntarlo sería una llamada por
  // cada visita anónima, y la respuesta se sabe de antemano.
  const env = mundo();
  await worker.fetch(new Request('https://quote101.mike-929.workers.dev/'), env);
  assert.equal(env.pedidas.length, 0);
});
