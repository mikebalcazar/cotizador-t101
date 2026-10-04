/* Un cliente nuevo con el correo de otro que ya existe: avisa, enseña quién
 * es, y «Sí, es ése» lo abre en vez de crear otro.
 *
 * Mike, 4-oct-2026: «en caso de querer generar un nuevo cliente con el email
 * de otro que ya existe, avisar que ya existe un cliente, presentar su info y
 * preguntar si es ese cliente el que estás buscando y ya usarlo o si quieres
 * crear uno nuevo con otro email».
 *
 * La regla la contesta la suite (contrato 0.65.0); aquí se mide la pantalla
 * de inicio con una suite de mentiras: que pregunte por el correo antes de
 * crear, que enseñe nombre y teléfono del que lo tiene, y que ninguna de las
 * dos salidas cree un cliente con ese correo.
 *
 *     npm run armar && node --test pruebas/el-correo-del-cliente.spec.mjs
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

const DUENO = { id: 'cl-1', nombre: 'Muebles Luna SA de CV', correo: 'compras@luna.mx', telefono: '5555555555', rfc: null, portal_activo: true };

async function abrirApp() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errores = [], escrituras = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  p.on('request', (r) => {
    if (r.method() === 'GET' || !r.url().includes('/s101/')) return;
    let cuerpo = null; try { cuerpo = r.postDataJSON(); } catch { /* sin JSON */ }
    escrituras.push({ metodo: r.method(), ruta: new URL(r.url()).pathname.replace(/^\/s101/, ''), cuerpo });
  });
  await p.route('**/s101/**', (route) => {
    const u = new URL(route.request().url());
    const r = u.pathname.replace(/^\/s101/, '');
    const metodo = route.request().method();
    if (metodo !== 'GET') return route.fulfill({ ...ok({ id: 'nuevo-1' }), status: 201 });
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: [DUENO] }));
    if (r === '/orgs/org-1/clientes/parecidos') {
      const correo = (u.searchParams.get('correo') || '').toLowerCase();
      return route.fulfill(ok({ parecidos: [], por_correo: correo === DUENO.correo ? DUENO : null }));
    }
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  return { ctx, p, errores, escrituras };
}
const altas = (escrituras) => escrituras.filter((e) => e.metodo === 'POST' && /\/clientes$/.test(e.ruta));

test('con el correo de un cliente que ya existe: avisa, dice quién es, y «Sí, es ése» lo abre sin crear otro', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    await p.getByRole('button', { name: '+ Nuevo cliente' }).click();
    await p.getByPlaceholder('ej: Desarrolladora Norte S.A.').fill('Luna del Sur');
    await p.locator('[data-campo="correo-cliente-nuevo"]').fill('COMPRAS@luna.mx');
    await p.getByRole('button', { name: 'Guardar' }).click();
    const aviso = p.locator('[data-con-ese-correo]');
    await aviso.waitFor({ timeout: 10000 });
    const texto = await aviso.innerText();
    assert.match(texto, /Ya hay un cliente con el correo compras@luna\.mx/, 'avisa que el correo ya es de alguien');
    assert.match(texto, /Muebles Luna SA de CV/, 'y dice quién es');
    assert.match(texto, /5555555555/, 'con su teléfono');
    assert.match(texto, /con portal/, 'y que ya tiene portal');
    await p.getByRole('button', { name: 'Sí, es ése: abrirlo' }).click();
    await p.waitForTimeout(500);
    assert.equal(await p.locator('[data-campo="correo-cliente-nuevo"]').count(), 0, 'el formulario se cierra');
    assert.deepEqual(altas(escrituras), [], 'y no se creó ningún cliente');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('«No, es otro»: se queda en el formulario para cambiar el correo, y con otro correo sí se crea con su correo', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    await p.getByRole('button', { name: '+ Nuevo cliente' }).click();
    await p.getByPlaceholder('ej: Desarrolladora Norte S.A.').fill('Luna del Sur');
    await p.locator('[data-campo="correo-cliente-nuevo"]').fill('compras@luna.mx');
    await p.getByRole('button', { name: 'Guardar' }).click();
    await p.locator('[data-con-ese-correo]').waitFor({ timeout: 10000 });
    await p.getByRole('button', { name: 'No, es otro: lo creo con otro correo' }).click();
    assert.equal(await p.locator('[data-con-ese-correo]').count(), 0, 'el aviso se va');
    assert.equal(await p.locator('[data-campo="correo-cliente-nuevo"]').inputValue(), 'compras@luna.mx', 'y el correo sigue ahí para cambiarlo');
    await p.locator('[data-campo="correo-cliente-nuevo"]').fill('sur@luna.mx');
    await p.getByRole('button', { name: 'Guardar' }).click();
    await p.waitForTimeout(1500);
    const creados = altas(escrituras);
    assert.equal(creados.length, 1, 'se creó un cliente');
    assert.deepEqual(creados[0].cuerpo, { nombre: 'Luna del Sur', correo: 'sur@luna.mx' }, 'con su nombre y su correo');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
