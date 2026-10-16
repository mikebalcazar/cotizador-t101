/* La caja del cajón sigue a INTERIORES; el frente, a FRENTES.
 *
 * Mike, 15-oct-2026, con captura de «EXPO BAÑO A»: «Están mal los costos del
 * traceless y la laca. Al menos cuando los cambio aquí no funcionan».
 *
 * Lo que pasaba: la caja del cajón se cotizaba con el acabado del FRENTE
 * (`getPC(pf.acabado, …)`). La tabla de cajas, PC, sólo tiene prelaminado,
 * formaica y las tres chapas —una caja no se hace de Traceless ni de Laca 2K—,
 * así que al poner uno de esos dos la caja no se encarecía: valía CERO, sin
 * ningún aviso. Un cajón de dos piezas con uñero salía en $1,900 en vez de
 * $7,300. Y de paso el campo «Interiores» del cajón no movía nada.
 *
 * Decisión de Mike el mismo día, por botones: los precios de las tablas se
 * quedan como están; lo que se arregla es que la caja siga a Interiores.
 *
 *     npm run armar && node --test pruebas/el-cajon-y-sus-materiales.spec.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PUBLICAR = fileURLToPath(new URL('../publicar/', import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const servidor = createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const archivo = join(PUBLICAR, ruta === '/' ? 'index.html' : ruta);
  try { const cuerpo = await readFile(archivo); res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' }); res.end(cuerpo); }
  catch { res.writeHead(404).end('no está'); }
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });

async function abrirApp() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  await p.route('**/s101/**', (route) => {
    const r = new URL(route.request().url()).pathname.replace(/^\/s101/, '');
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof armarComponentes === 'function', null, { timeout: 20000 });
  return { ctx, p, errores };
}

/* Un cajón, cuatro piezas con uñero, armado con los materiales que se le den.
 * Se devuelve también lo que valen las tablas por su cuenta, para medir contra
 * los precios de hoy y no contra números escritos a mano aquí: si Mike cambia
 * una tabla, esta prueba sigue diciendo la verdad. */
const caso = (p, int, fre) => p.evaluate(([int, fre]) => {
  const c = armarComponentes('cajones', { num: 4, jaladera: 'unero' }, int, fre)[0];
  return {
    unitario: c.unitario, subtotal: c.subtotal, tags: c.tags,
    caja: getPC(int.acabado, int.chapa),
    frente: getPFAcabado('frenteCajon', fre.acabado, fre.chapa),
    unero: JALADERAS.unero,
  };
}, [int, fre]);

const M = (acabado, chapa = null) => ({ formato: '18mm', acabado, chapa });

test('con Traceless o Laca 2K en el frente, la caja ya NO se cobra gratis', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    for (const acabado of ['traceless', 'laca2k']) {
      const r = await caso(p, M('formaica'), M(acabado));
      assert.ok(r.caja > 0, `la caja de formaica vale algo con frente ${acabado} (valía ${r.caja})`);
      assert.equal(r.unitario, r.caja + r.frente + r.unero, `el cajón ${acabado} suma caja + frente + uñero`);
      assert.equal(r.subtotal, (r.caja + r.frente) * 4 + r.unero * 4, 'y por cuatro piezas');
    }
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('cambiar INTERIORES mueve el precio del cajón: es la caja', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    const barato = await caso(p, M('formaica'), M('traceless'));
    const caro = await caso(p, M('chapa', 'premium'), M('traceless'));
    assert.ok(caro.unitario > barato.unitario, 'interiores de chapa premium cuestan más que formaica');
    assert.equal(caro.unitario - barato.unitario, caro.caja - barato.caja, 'y la diferencia es exactamente la de la caja');
    assert.equal(caro.frente, barato.frente, 'el frente no se movió: no se tocó');
    assert.deepEqual(errores, []);
  } finally { await ctx.close(); }
});

test('cambiar FRENTES mueve el frente y deja la caja quieta', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    const a = await caso(p, M('formaica'), M('formaica'));
    const b = await caso(p, M('formaica'), M('traceless'));
    assert.equal(a.caja, b.caja, 'misma caja: los interiores son los mismos');
    assert.ok(b.frente > a.frente, 'el frente de traceless cuesta más que el de formaica');
    assert.equal(b.unitario - a.unitario, b.frente - a.frente, 'y es lo único que subió');
    assert.deepEqual(errores, []);
  } finally { await ctx.close(); }
});

test('la etiqueta del cajón dice de qué es la caja y de qué el frente', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    const r = await caso(p, M('formaica'), M('traceless'));
    assert.equal(r.tags.length, 1, 'una sola etiqueta');
    assert.match(r.tags[0], /^Caja Formaica · Frente Traceless/, `dice las dos cosas (decía «${r.tags[0]}»)`);
    const conChapa = await caso(p, M('chapa', 'encino'), M('chapa', 'premium'));
    assert.match(conChapa.tags[0], /^Caja Chapa.*comercial · Frente Chapa.*premium$/i, `y con chapa, cuál chapa de cada lado (decía «${conChapa.tags[0]}»)`);
    assert.deepEqual(errores, []);
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
