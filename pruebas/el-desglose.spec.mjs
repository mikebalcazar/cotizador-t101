/* El PDF del cliente, con o sin el desglose de componentes.
 *
 * Mike, 28-sep-2026: poder mandarle al cliente el PDF de siempre
 * (desglosado) o sólo la lista de ítems con su precio, subtotal, IVA y total.
 *
 * La casilla «Desglosar componentes» va pegada al botón del PDF, no en
 * Configuración: es una decisión por cliente y se toma al momento de mandarlo.
 * Viene marcada, que es lo de siempre, y viaja CON la cotización.
 *
 * Dos de estas cinco importan más que las otras: que el resumen económico
 * salga IDÉNTICO con y sin desglose (se quita el detalle, no el dinero), y
 * que una cotización guardada antes de que existiera la opción se siga
 * imprimiendo desglosada. Si saliera apagada por omisión, cada cotización
 * vieja que se reimprima saldría distinta a como se mandó.
 *
 *     npm run armar && node --test pruebas/el-desglose.spec.mjs
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
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
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

// Un plano de un píxel: lo justo para que el PDF desglosado traiga su página.
const PLANO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const MUEBLE = {
  id: 'm-1', nombre: 'Cocina integral', qty: 2, total: 10000,
  componentes: [{ id: 'c-1', modulo: 'Gabinete', desc: 'Base 60', tags: [], extras: [], unitario: 10000, qty: 1, subtotal: 10000, pos: { x: 0.5, y: 0.5 } }],
  perfil: { int: { formato: '18mm', acabado: 'laminado', chapa: null }, fre: { formato: '18mm', acabado: 'laminado', chapa: null } },
  imagenes: [], plano: { src: PLANO },
};
const VERSION = { muebles: [MUEBLE], usaFlete: true, usaArq: true, usaTDC: true, descuento: 0, fecha: '2026-09-20T12:00:00Z' };
const CLIENTE = { id: 'cl-1', nombre: 'Casa Muestra', negocio_id: 'n-1' };
const PROYECTO = { id: 'pr-1', nombre: 'Departamento Lomas', cliente_id: 'cl-1', negocio_id: 'n-1' };
const cotizacionCon = (version) => ({ id: 'q-1', folio: 'C-0007', cliente_id: 'cl-1', negocio_id: 'n-1', total: 2000000, datos: { nombre: 'Corrida 1', proyecto_id: 'pr-1', versiones: [version] } });

async function abrirApp({ cotizacion }) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errores = [], escrituras = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  // Lo que la pantalla ESCRIBE, leído del navegador mismo (no de la
  // respuesta falsa): método, ruta y cuerpo de cada POST/PATCH a la suite.
  p.on('request', (r) => {
    if (r.method() === 'GET' || !r.url().includes('/s101/')) return;
    let cuerpo = null; try { cuerpo = r.postDataJSON(); } catch { /* sin JSON */ }
    escrituras.push({ metodo: r.method(), ruta: new URL(r.url()).pathname.replace(/^\/s101/, ''), cuerpo });
  });
  await p.route('**/s101/**', (route) => {
    const r = new URL(route.request().url()).pathname.replace(/^\/s101/, '');
    const metodo = route.request().method();
    if (metodo !== 'GET') return route.fulfill({ ...ok({ id: 'q-1', folio: 'C-0007' }), status: metodo === 'POST' ? 201 : 200 });
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
    if (r === '/orgs/org-1/negocios') return route.fulfill(ok({ filas: [{ id: 'n-1', nombre: 'Taller', moneda: 'MXN' }] }));
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: [CLIENTE] }));
    if (r === '/orgs/org-1/proyectos') return route.fulfill(ok({ filas: [PROYECTO] }));
    if (r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [cotizacion] }));
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  await p.getByText('Casa Muestra').first().click(); await p.waitForTimeout(400);
  await p.getByText('Departamento Lomas').first().click(); await p.waitForTimeout(400);
  await p.getByText('Corrida 1').first().click();
  await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
  return { ctx, p, errores, escrituras };
}
const casilla = (p) => p.locator('[data-campo="desglosar"]');
async function pdf(ctx, p) {
  const [w] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'PDF cliente con condiciones' }).click()]);
  await w.waitForLoadState('domcontentloaded');
  const texto = await w.locator('body').innerText();
  const tablas = await w.locator('tr[data-comp]').count();
  const planos = await w.locator('[data-plano-cliente]').count();
  const resumen = await w.locator('.res').innerText();
  await w.close();
  return { texto, tablas, planos, resumen };
}

test('la casilla «Desglosar componentes» está junto al PDF y viene marcada', async () => {
  const { ctx, p, errores } = await abrirApp({ cotizacion: cotizacionCon(VERSION) });
  try {
    assert.equal(await casilla(p).count(), 1, 'hay una casilla');
    assert.equal(await casilla(p).isChecked(), true, 'marcada por omisión: es lo de siempre');
    const d = await pdf(ctx, p);
    assert.ok(d.tablas >= 1, 'desglosado, el PDF trae la tabla de componentes con su precio unitario');
    assert.equal(d.planos, 1, 'y la página del plano con los componentes numerados');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('sin la palomita, el PDF trae los muebles con su precio pero ni tabla ni planos', async () => {
  const { ctx, p, errores } = await abrirApp({ cotizacion: cotizacionCon(VERSION) });
  try {
    await casilla(p).uncheck();
    const d = await pdf(ctx, p);
    assert.equal(d.tablas, 0, 'sin tabla de componentes');
    assert.equal(d.planos, 0, 'sin páginas de plano');
    assert.ok(/Cocina integral/.test(d.texto), 'el mueble sigue');
    assert.ok(/Subtotal/.test(d.resumen) && /IVA/.test(d.resumen) && /Total/.test(d.resumen), 'con subtotal, IVA y total');
    assert.ok(/Condiciones de Contrataci/.test(d.texto), 'y las condiciones y la firma siguen');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('el resumen económico es IDÉNTICO con y sin desglose: se quita el detalle, no el dinero', async () => {
  const { ctx, p } = await abrirApp({ cotizacion: cotizacionCon(VERSION) });
  try {
    const con = await pdf(ctx, p);
    await casilla(p).uncheck();
    const sin = await pdf(ctx, p);
    assert.equal(sin.resumen, con.resumen, 'mismo subtotal, mismo IVA, mismo total');
    assert.ok(con.tablas > 0 && sin.tablas === 0, 'y lo único que cambió fue el detalle');
  } finally { await ctx.close(); }
});

test('la opción viaja con la cotización: se guarda al cambiarla', async () => {
  const { ctx, p, escrituras } = await abrirApp({ cotizacion: cotizacionCon(VERSION) });
  try {
    // Se abre para ver; para cambiar hay que pedirlo, como con todo lo demás.
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    await p.waitForTimeout(300);
    // El primer cambio tras abrir no se guarda solo (así está pensado el
    // autoguardado); se toca dos veces, como quien duda, y se deja sin marcar.
    await casilla(p).uncheck(); await p.waitForTimeout(500);
    await casilla(p).check(); await p.waitForTimeout(500);
    await casilla(p).uncheck();
    await p.waitForTimeout(900); // el autoguardado espera 400 ms
    const guardada = escrituras.filter((e) => /\/cotizaciones/.test(e.ruta) && e.cuerpo?.datos?.versiones).pop();
    assert.ok(guardada, 'se guardó');
    assert.equal(guardada.cuerpo.datos.versiones[0].desglosar, false, 'con desglosar: false en la versión');
  } finally { await ctx.close(); }
});

test('una cotización guardada ANTES de que existiera la opción se sigue imprimiendo desglosada', async () => {
  // La versión no trae `desglosar` (ni true ni false): es de antes del 28-sep.
  const { ctx, p } = await abrirApp({ cotizacion: cotizacionCon({ ...VERSION }) });
  try {
    assert.equal(await casilla(p).isChecked(), true, 'la casilla amanece marcada');
    const d = await pdf(ctx, p);
    assert.ok(d.tablas >= 1 && d.planos === 1, 'y el PDF sale desglosado, como se mandó en su momento');
  } finally { await ctx.close(); }
  // Y una guardada con la opción apagada, apagada se queda.
  const b = await abrirApp({ cotizacion: cotizacionCon({ ...VERSION, desglosar: false }) });
  try {
    assert.equal(await casilla(b.p).isChecked(), false, 'guardada sin desglose, abre sin desglose');
  } finally { await b.ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
