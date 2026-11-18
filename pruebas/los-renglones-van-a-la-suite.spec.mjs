/* Los renglones van a la suite con su precio (contrato 0.105.0).
 *
 * Mike, 18-nov-2026: «Vamos a separar la contabilidad. Ya no va a ir ligada
 * a los ítems.» Con botones: «Conceptos de cobro con opción a importar de las
 * cotizaciones del proyecto de quote» y «Un concepto por renglón». dash101
 * importa con el precio que quote101 deja escrito en la cotización
 * (`datos.renglones`), porque sólo quote sabe calcularlo: depende de ⚙.
 *
 * Lo que mide: que ese precio sea EL MISMO con el que se aprueba (la hoja,
 * por pieza, sin IVA, con el descuento repartido), y que viaje al guardar.
 *
 *     npm run armar && node --test pruebas/los-renglones-van-a-la-suite.spec.mjs
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
const ok = (data, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });

/* Una cotización con un renglón escrito a mano (dos piezas) y un mueble
 * armado con dos componentes, con 10 % de descuento y todo prendido. */
const VERSION = {
  fecha: '2026-11-18T12:00:00.000Z', usaFlete: true, usaArq: true, usaTDC: true, cargosAMano: true, descuento: 10, desglosar: true,
  muebles: [
    { nombre: 'Instalación en sitio', manual: true, precio: 4000, total: 4000, qty: 2 },
    { nombre: 'Cocina integral', total: 50000, qty: 1, componentes: [{ subtotal: 30000, qty: 1 }, { subtotal: 20000, qty: 2 }] },
  ],
};
const COT = { id: 'q1', cliente_id: 'c1', folio: 'COT-000007', estado: 'borrador', total: 0, datos: { nombre: 'Cocina', proyecto_id: 'p1', versiones: [VERSION] } };

const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const parches = [];
await p.route('**/s101/**', (route) => {
  const req = route.request();
  const r = new URL(req.url()).pathname.replace(/^\/s101/, '');
  if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
  if (req.method() === 'PATCH' && r.includes('/cotizaciones/')) { parches.push(JSON.parse(req.postData() || '{}')); return route.fulfill(ok({ id: 'q1' })); }
  if (req.method() !== 'GET') return route.fulfill(ok({ id: 'x' }));
  if (r.endsWith('/clientes')) return route.fulfill(ok({ filas: [{ id: 'c1', nombre: 'Familia Ruiz' }] }));
  if (r.endsWith('/proyectos')) return route.fulfill(ok({ filas: [{ id: 'p1', nombre: 'Casa Ruiz', cliente_id: 'c1' }] }));
  if (r.endsWith('/cotizaciones')) return route.fulfill(ok({ filas: [COT] }));
  return route.fulfill(ok({ filas: [] }));
});
await p.goto(base, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof renglonesParaLaSuite === 'function' && typeof preciosHoja === 'function', null, { timeout: 20000 });

test('un renglón por mueble, con el precio con el que se aprueba', async () => {
  const r = await p.evaluate((v) => {
    const q = { versiones: [v] };
    const precios = preciosHoja(v.muebles, { usaF: true, usaA: true, usaT: true, cargosAMano: true });
    const aprobar = lineasParaAprobar(v.muebles, (i) => Math.round((precios.unitarios[i] || 0) * (1 - 10 / 100) * 100));
    return { renglones: renglonesParaLaSuite(q), aprobar: aprobar.map((l) => [l.nombre, l.cantidad, l.precio]) };
  }, VERSION);
  assert.equal(r.renglones.length, 2);
  assert.deepEqual(r.renglones.map((x) => [x.nombre, x.cantidad, x.precio_unitario]), r.aprobar,
    'el mismo nombre, la misma cantidad y el mismo precio por pieza que al aprobar');
  assert.deepEqual(r.renglones.map((x) => x.linea), [1, 2]);
  for (const x of r.renglones) assert.ok(Number.isInteger(x.precio_unitario) && x.precio_unitario > 0, 'centavos enteros y con precio');
});

test('el descuento se reparte: sin él, cada pieza vale más', async () => {
  const r = await p.evaluate((v) => [renglonesParaLaSuite({ versiones: [v] }), renglonesParaLaSuite({ versiones: [{ ...v, descuento: 0 }] })], VERSION);
  for (let i = 0; i < 2; i++) assert.equal(r[0][i].precio_unitario, Math.round(r[1][i].precio_unitario * 0.9), `renglón ${i + 1}`);
});

test('una cotización vacía no trae renglones, y una rota no detiene el guardado', async () => {
  const r = await p.evaluate(() => [renglonesParaLaSuite({ versiones: [] }), renglonesParaLaSuite({ versiones: [{ muebles: [] }] }), renglonesParaLaSuite(null)]);
  assert.deepEqual(r, [[], [], []]);
});

test('al guardar la cotización, los renglones viajan en `datos`', async () => {
  const cuerpo = await p.evaluate(async () => {
    const arbol = (await window.suiteDB.cargar()).clientes;
    arbol[0].proyectos[0].cotizaciones[0].nombre = 'Cocina y barra';
    return window.suiteDB.guardar(arbol);
  });
  assert.equal(cuerpo, true, 'guardó');
  const ultimo = parches[parches.length - 1];
  assert.ok(ultimo, 'mandó el PATCH de la cotización');
  assert.equal(ultimo.datos.nombre, 'Cocina y barra');
  assert.equal(ultimo.datos.renglones.length, 2);
  assert.equal(ultimo.datos.renglones[1].nombre, 'Cocina integral');
});

test.after(async () => { await navegador.close(); servidor.close(); });
