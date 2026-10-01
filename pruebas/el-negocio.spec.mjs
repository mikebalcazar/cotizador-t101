/* El cotizador no sabe qué es un «negocio».
 *
 * Mike, 1-oct-2026: «Ya no existe la opción de negocios en dash. Sólo es una
 * empresa/negocio todo. Elimina todas las lógicas que involucran el concepto
 * de "negocio"». Desde el contrato 0.61.0 la API cuelga sola cada cliente,
 * proyecto y cotización del registro de la empresa.
 *
 * Lo que se mide: al arrancar no se pide la lista de negocios, las listas se
 * piden sin `negocio_id`, y una empresa recién hecha NO hace que el cotizador
 * cree un negocio (hasta el 1-oct lo creaba él). Las dos cosas que había que
 * cuidar antes —no cambiarse solo de negocio, no crear uno a partir de una
 * lectura caída— dejan de existir con el concepto.
 *
 *     node --test pruebas/el-negocio.spec.mjs
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

const CLIENTES = [{ id: 'cl-1', nombre: 'Cliente de la empresa' }];

/** Abre la app con la suite de mentiras y anota cada petición que sale. */
async function abrirApp() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errores = [];
  const peticiones = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  await p.route('**/s101/**', (route) => {
    const u = new URL(route.request().url());
    const r = u.pathname.replace(/^\/s101/, '');
    const metodo = route.request().method();
    peticiones.push(`${metodo} ${r}${u.search}`);
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Forespot' }] }));
    /* Si alguien pide negocios, se le contesta vacío a propósito: lo que se
     * mide es que nadie lo pida y que nadie cree uno a raíz de eso. */
    if (r === '/orgs/org-1/negocios') return route.fulfill(ok({ filas: [] }));
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: CLIENTES }));
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  return { ctx, p, errores, peticiones };
}

const pintada = (p) => p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });

test('arranca sin pedir negocios, lista sin negocio_id y no crea ninguno', async () => {
  const { ctx, p, errores, peticiones } = await abrirApp();
  try {
    await pintada(p);
    await p.waitForFunction(() => /Cliente de la empresa/.test(document.querySelector('#root').innerText), null, { timeout: 15000 });
    assert.deepEqual(peticiones.filter((x) => x.includes('/negocios')), [], 'no pide ni crea negocios');
    const clientes = peticiones.find((x) => x.startsWith('GET /orgs/org-1/clientes'));
    assert.ok(clientes, 'pidió los clientes');
    assert.ok(!/negocio_id/.test(clientes), `y sin negocio_id: ${clientes}`);
    assert.deepEqual(peticiones.filter((x) => /negocio_id/.test(x)), [], 'ninguna petición lleva negocio_id');
    assert.equal(await p.locator('select[title*="negocio"]').count(), 0, 'sin desplegable de negocio');
    assert.ok(!/[Nn]egocio/.test(await p.locator('#root').innerText()), 'y la pantalla no habla de negocios');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
