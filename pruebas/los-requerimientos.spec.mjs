/* Los requerimientos que la obra deja en el borrador, y cómo se aprueban.
 *
 * Mike, 29-sep-2026: «los requerimientos generados me deberían generar un
 * borrador en quote dentro del proyecto para poder enviarla al cliente a que
 * me autorice», y «al aprobarse los requerimientos cambia su código a alguno
 * de mueble, puerta etc.».
 *
 * La suite (contrato 0.49.0) mete cada requerimiento como renglón «a mano»
 * con `item_id` en el borrador «Requerimientos» del proyecto. Aquí se cuida
 * lo que le toca a esta pantalla: que ese renglón se reconozca, que se le
 * pueda escoger el tipo, y que al aprobar viaje `item_id` y `tipo` en su
 * línea —sin eso la suite crearía una pieza nueva y el requerimiento se
 * quedaría pendiente para siempre—.
 *
 *     npm run armar && node --test pruebas/los-requerimientos.spec.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { editarCotizacion } from './editar.mjs';

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

/* El renglón tal como lo escribe la suite al levantar el requerimiento, y
 * uno escrito a mano aquí, para ver que los dos viajan bien. */
const REQUERIMIENTO = { id: 'it-1', manual: true, item_id: 'it-1', tipo: 'mueble', codigo: 'RQ-01', nombre: 'Barra de la cocina', descripcion: '', qty: 1, precio: 0, total: 0, componentes: [], imagenes: [] };
const A_MANO = { id: 'm-2', manual: true, codigo: '', nombre: 'Instalación en sitio', descripcion: '', qty: 1, precio: 800, total: 800, componentes: [], imagenes: [] };
const VERSION = { muebles: [REQUERIMIENTO, A_MANO], usaFlete: true, usaArq: true, usaTDC: true, descuento: 0, fecha: '2026-09-29T12:00:00Z' };
const CLIENTE = { id: 'cl-1', nombre: 'Casa Muestra', negocio_id: 'n-1' };
const PROYECTO = { id: 'pr-1', nombre: 'Departamento Lomas', cliente_id: 'cl-1', negocio_id: 'n-1' };
const BORRADOR = { id: 'q-1', folio: 'C-0007', cliente_id: 'cl-1', negocio_id: 'n-1', total: 0, estado: 'borrador', datos: { nombre: 'Requerimientos', proyecto_id: 'pr-1', de_requerimientos: true, versiones: [VERSION] } };

async function abrirApp() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errores = [], escrituras = [], dialogos = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  p.on('dialog', (d) => { dialogos.push(d.message()); d.accept(); });
  p.on('request', (r) => {
    if (r.method() === 'GET' || !r.url().includes('/s101/')) return;
    let cuerpo = null; try { cuerpo = r.postDataJSON(); } catch { /* sin JSON */ }
    escrituras.push({ metodo: r.method(), ruta: new URL(r.url()).pathname.replace(/^\/s101/, ''), cuerpo });
  });
  await p.route('**/s101/**', (route) => {
    const r = new URL(route.request().url()).pathname.replace(/^\/s101/, '');
    const metodo = route.request().method();
    if (metodo !== 'GET') {
      if (/\/aprobar$/.test(r)) {
        const cuerpo = route.request().postDataJSON();
        const piezas = cuerpo.lineas.reduce((s, l) => s + l.cantidad, 0);
        return route.fulfill({ ...ok({ cotizacion: { id: 'q-1', estado: 'aceptada', datos: { aprobacion: { at: '2026-09-29T18:00:00Z', items: piezas } } }, items: piezas, productos_nuevos: 0 }), status: 201 });
      }
      return route.fulfill({ ...ok({ id: 'q-1', folio: 'C-0007' }), status: metodo === 'POST' ? 201 : 200 });
    }
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
    if (r === '/orgs/org-1/negocios') return route.fulfill(ok({ filas: [{ id: 'n-1', nombre: 'Taller', moneda: 'MXN' }] }));
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: [CLIENTE] }));
    if (r === '/orgs/org-1/proyectos') return route.fulfill(ok({ filas: [PROYECTO] }));
    if (r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [BORRADOR] }));
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  await p.getByText('Casa Muestra').first().click(); await p.waitForTimeout(400);
  await p.getByText('Departamento Lomas').first().click(); await p.waitForTimeout(400);
  await p.getByText('Requerimientos').first().click();
  await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
  return { ctx, p, errores, escrituras, dialogos };
}

test('el borrador de la obra se abre como cualquier cotización, y el requerimiento se reconoce', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    const aviso = p.locator('[data-requerimiento="it-1"]');
    assert.equal(await aviso.count(), 1, 'el renglón que vino de la obra lo dice');
    assert.match(await aviso.innerText(), /Requerimiento de la obra · RQ-01/, 'con su código de requerimiento');
    assert.equal(await p.locator('[data-requerimiento]').count(), 1, 'y el escrito a mano aquí no');
    assert.equal(await p.locator('[data-campo="tipo-0"]').count(), 1, 'trae su selector de tipo');
    assert.equal(await p.locator('[data-campo="tipo-0"]').inputValue(), 'mueble', 'que empieza en mueble');
    assert.equal(await p.locator('[data-campo="tipo-1"]').count(), 1, 'el renglón a mano también escoge tipo');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('al aprobar, el requerimiento viaja con su item_id, su tipo y su precio: se aprueba ése, no nace otro', async () => {
  const { ctx, p, errores, escrituras, dialogos } = await abrirApp();
  try {
    await editarCotizacion(p);
    await p.locator('[data-campo="precio-0"]').fill('1500');
    await p.locator('[data-campo="tipo-0"]').selectOption('puerta');
    await p.locator('[data-campo="tipo-1"]').selectOption('servicio');
    await p.waitForTimeout(700);

    await p.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await p.waitForSelector('[data-hoja="aprobada"]', { timeout: 10000 });
    assert.ok(/Se crean 1 pieza vendida y se aprueba 1 requerimiento de la obra/.test(dialogos.join('\n')), 'la confirmación distingue lo que nace de lo que se aprueba: ' + dialogos.join(' | '));

    const envio = escrituras.find((e) => /\/cotizaciones\/q-1\/aprobar$/.test(e.ruta));
    assert.ok(envio, 'se pidió aprobar a la suite');
    const [req, mano] = envio.cuerpo.lineas;
    assert.equal(req.item_id, 'it-1', 'la línea del requerimiento dice qué ítem es');
    assert.equal(req.tipo, 'puerta', 'con el tipo que se le escogió');
    assert.equal(req.precio, 150000, 'y su precio en centavos');
    assert.equal(req.cantidad, 1);
    assert.equal(mano.item_id, null, 'el escrito a mano no es de ningún ítem: nace nuevo');
    assert.equal(mano.tipo, 'servicio', 'con su tipo');
    assert.equal(mano.precio, 80000);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('el tipo escogido se guarda con la cotización', async () => {
  const { ctx, p, escrituras } = await abrirApp();
  try {
    await editarCotizacion(p);
    await p.locator('[data-campo="tipo-1"]').selectOption('acabado');
    await p.waitForTimeout(900);
    const guardado = [...escrituras].reverse().find((e) => e.metodo === 'PATCH' && /\/cotizaciones\/q-1$/.test(e.ruta));
    assert.ok(guardado, 'se guardó solo');
    const muebles = guardado.cuerpo.datos.versiones[0].muebles;
    assert.equal(muebles[1].tipo, 'acabado', 'y el tipo viaja en el renglón');
    assert.equal(muebles[0].item_id, 'it-1', 'sin perder el item_id del requerimiento');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
