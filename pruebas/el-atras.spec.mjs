/* El «atrás» del navegador en el cotizador.
 *
 * Mike, 22-sep-2026: «en todas las apps, cuando picas el botón de back en el
 * navegador te saca hasta la página anterior (…). Queremos que cuando picas
 * back te regrese a la función anterior. Hay funciones que son 3 o 4 clicks
 * para llegar y si le picas back al navegador te saca y pierdes la ruta de
 * navegación que habías hecho».
 *
 * Aquí lo hondo son las cosas que se abren ENCIMA y tapan todo: el cotizador
 * de una cotización, la configuración y el recibo. Hasta hoy, «atrás» con
 * cualquiera de esas abierta se llevaba la app entera y había que volver a
 * entrar por la puerta de la suite.
 *
 * CÓMO SE MIDE
 *
 * Con un navegador de verdad, contra `publicar/` servido aquí mismo. La suite
 * no se alcanza desde el chat, así que se contesta por ella con un árbol de
 * mentiras: un cliente, un proyecto y una cotización. Lo que se mide no son
 * los datos, es lo que el navegador hace con el historial.
 *
 *     node --test pruebas/el-atras.spec.mjs
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
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
    res.end(cuerpo);
  } catch { res.writeHead(404).end('no está'); }
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});

const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });

/* Un taller de mentiras con un cliente, un proyecto y una cotización: lo
 * mínimo para que haya algo que abrir. */
const CLIENTE = { id: 'cl-1', nombre: 'Casa Muestra', negocio_id: 'n-1' };
const PROYECTO = { id: 'pr-1', nombre: 'Cocina', cliente_id: 'cl-1', negocio_id: 'n-1' };
const COTIZACION = { id: 'q-1', folio: 'C-1', cliente_id: 'cl-1', proyecto_id: 'pr-1', total: 0, datos: { nombre: 'Cotización de prueba', proyecto_id: 'pr-1', versiones: [] } };

async function abrirApp() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  await p.route('**/s101/**', (route) => {
    const u = new URL(route.request().url());
    const r = u.pathname.replace(/^\/s101/, '');
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
    if (r === '/orgs/org-1/negocios') return route.fulfill(ok({ filas: [{ id: 'n-1', nombre: 'Taller', moneda: 'MXN' }] }));
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: [CLIENTE] }));
    if (r === '/orgs/org-1/proyectos') return route.fulfill(ok({ filas: [PROYECTO] }));
    if (r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [COTIZACION] }));
    if (r === '/orgs/org-1/ajustes') return route.fulfill(ok({ filas: [] }));
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  return { ctx, p, errores };
}

test('«atrás» cierra la configuración en vez de sacar de la app', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    const antes = await p.evaluate(() => history.length);
    // El botón de la configuración es el engrane de la barra de arriba.
    await p.locator('button', { hasText: '\u2699' }).first().click();
    await p.waitForTimeout(600);
    const conConfig = await p.evaluate(() => history.length);
    assert.equal(conConfig, antes + 1, 'abrir la configuración deja una entrada en el historial');

    await p.goBack();
    await p.waitForTimeout(400);
    assert.equal(new URL(p.url()).pathname, '/', 'no salió de la app');
    assert.ok(await p.evaluate(() => document.querySelectorAll('#root *').length > 10), 'la app sigue pintada');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('«atrás» cierra el cotizador y regresa a la lista de clientes', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    await p.getByText('Casa Muestra').first().click();
    await p.waitForTimeout(500);
    await p.getByText('Cocina').first().click();
    await p.waitForTimeout(500);
    const antes = await p.evaluate(() => history.length);
    await p.getByText(/Cotizaci[oó]n de prueba/i).first().click();
    await p.waitForFunction(() => history.length > 0 && /Volver|VOLVER/.test(document.body.innerText), null, { timeout: 10000 });
    const conCotizador = await p.evaluate(() => history.length);
    assert.equal(conCotizador, antes + 1, 'abrir una cotización deja una entrada en el historial');

    await p.goBack();
    await p.waitForTimeout(900);          // el cotizador se cierra con animación
    assert.equal(new URL(p.url()).pathname, '/', 'no salió de la app');
    assert.ok(/Casa Muestra/.test(await p.locator('#root').innerText()), 'regresó a la lista de clientes');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
