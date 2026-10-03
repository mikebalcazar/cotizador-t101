/* Las comisiones siempre se pueden prender o apagar, y los indirectos van
 * siempre, también en lo escrito a mano.
 *
 * Mike, 3-oct-2026, en la cotización «Sanje CC37 - Chapeado Cantos de Puertas
 * Duela» (puros renglones a mano, requerimientos de la obra): «otra vez no me
 * aparece la opción de agregar la comisión del arquitecto ni la comisión de
 * TDC. Quiero siempre poder activar o desactivar eso. Y considera los
 * indirectos siempre en la cotización. Desglósalo para mí, para verlo, pero
 * en el PDF no se exportan nunca. Se distribuye proporcionalmente entre
 * todos.»
 *
 * Lo que pasaba: la caja «Cómo se forma el precio» (con las casillas) sólo
 * se pintaba con muebles del armador, y lo escrito a mano iba sin cargos.
 *
 *     npm run armar && node --test pruebas/los-cargos-siempre.spec.mjs
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
import { preciosEsperados, fleteDe, IND, ARQ, TDC } from './cargos.mjs';

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

// Porcentajes de fábrica (CONFIG_DEFAULT) y la cuenta esperada, en pruebas/cargos.mjs.
const RENGLONES = [{ base: 1000, qty: 2 }, { base: 700, qty: 1 }];
const esperados = (opts) => preciosEsperados(RENGLONES, opts);

// Puros renglones a mano, como los requerimientos que la obra deja en quote101.
const CHAPEADO = { id: 'it-1', manual: true, item_id: 'it-1', tipo: 'puerta', codigo: 'RQ-01', nombre: 'Chapeado de cantos de puertas', descripcion: 'Duela, 12 puertas', qty: 2, precio: 1000, total: 1000, componentes: [], imagenes: [] };
const INSTALACION = { id: 'm-2', manual: true, codigo: '', nombre: 'Instalación', descripcion: '', qty: 1, precio: 700, total: 700, componentes: [], imagenes: [] };
const version = (extra) => ({ muebles: [CHAPEADO, INSTALACION], usaFlete: true, usaArq: true, usaTDC: true, descuento: 0, desglosar: true, fecha: '2026-10-03T12:00:00Z', ...extra });
const CLIENTE = { id: 'cl-1', nombre: 'Sanje', negocio_id: 'n-1' };
const PROYECTO = { id: 'pr-1', nombre: 'Casa Sanje', cliente_id: 'cl-1', negocio_id: 'n-1' };
const cotizacionCon = (v) => ({ id: 'q-1', folio: 'C-0037', cliente_id: 'cl-1', negocio_id: 'n-1', total: 0, datos: { nombre: 'CC37 - Chapeado', proyecto_id: 'pr-1', versiones: [v] } });

async function abrirApp({ cotizacion }) {
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
    const r = new URL(route.request().url()).pathname.replace(/^\/s101/, '');
    const metodo = route.request().method();
    if (metodo !== 'GET') return route.fulfill({ ...ok({ id: 'q-1', folio: 'C-0037' }), status: metodo === 'POST' ? 201 : 200 });
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: [CLIENTE] }));
    if (r === '/orgs/org-1/proyectos') return route.fulfill(ok({ filas: [PROYECTO] }));
    if (r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [cotizacion] }));
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  await p.getByText('Sanje').first().click(); await p.waitForTimeout(400);
  await p.getByText('Casa Sanje').first().click(); await p.waitForTimeout(400);
  await p.getByText('CC37 - Chapeado').first().click();
  await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
  return { ctx, p, errores, escrituras };
}
const pesos = (t) => Number(String(t).replace(/[^0-9.\-]/g, ''));
const leer = (p, sel) => p.locator(sel).first().innerText().then(pesos);
const casilla = (p, clave) => p.locator(`[data-cargo="${clave}"]`).locator('xpath=..').locator('input[type=checkbox]');
const ultimaVersion = (escrituras) => escrituras.filter((e) => /\/cotizaciones/.test(e.ruta) && e.cuerpo?.datos?.versiones).pop()?.cuerpo.datos.versiones[0];

test('con puros renglones a mano, la caja «Cómo se forma el precio» está, con las dos comisiones para prender o apagar', async () => {
  const { ctx, p, errores } = await abrirApp({ cotizacion: cotizacionCon(version({ cargosAMano: true })) });
  try {
    await editarCotizacion(p);
    assert.equal(await p.locator('[data-hoja="cargos"]').count(), 1, 'la caja sale aunque no haya muebles del armador');
    assert.equal(await casilla(p, 'arq').count(), 1, 'con la casilla de la comisión profesionista');
    assert.equal(await casilla(p, 'tdc').count(), 1, 'y la de la comisión TDC');
    assert.equal(await casilla(p, 'arq').isChecked(), true);
    assert.equal(await casilla(p, 'tdc').isChecked(), true);
    assert.equal(await casilla(p, 'flete').count(), 1, 'y la del flete (Mike, 3-oct: «no veo el desglose del flete»)');
    assert.equal(await casilla(p, 'flete').isChecked(), true, 'prendida');
    assert.equal(await p.locator('[data-cargo="ingenieria"]').count(), 0, 'ingeniería y embalaje no: son del armador');
    assert.equal(await p.locator('[data-hoja="cargos"]').evaluate((e) => e.classList.contains('no-print')), true, 'y no se imprime');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('los indirectos van siempre y se reparten en cada renglón; las comisiones suben y bajan el precio al prenderlas y apagarlas', async () => {
  const { ctx, p } = await abrirApp({ cotizacion: cotizacionCon(version({ cargosAMano: true })) });
  try {
    await editarCotizacion(p);
    // Base: 2 × 1000 + 1 × 700 = 2700. Indirectos 7.5 % de la base. Flete mínimo, repartido.
    assert.equal(await leer(p, '[data-cargo="amano"]'), 2700, 'la base es lo escrito');
    assert.equal(await leer(p, '[data-cargo="indirectos"]'), 2700 * IND, 'los indirectos sobre toda la base');
    assert.equal(await leer(p, '[data-cargo="flete"]'), fleteDe(2700 * (1 + IND) * (1 + ARQ) * (1 + TDC)), 'el flete, con su monto (el mínimo aquí)');
    assert.equal(await p.locator('[data-campo="precio-0"]').inputValue(), '1000', 'lo escrito no se toca');
    const [u0, u1] = esperados();
    assert.equal(await leer(p, '[data-precio-cliente="0"]'), u0, 'debajo se ve lo que paga el cliente: indirectos, las dos comisiones y su parte del flete');
    assert.equal(await leer(p, '[data-total="0"]'), 2 * u0, 'el total del renglón es al cliente × cantidad');
    assert.equal(await leer(p, '[data-hoja="subtotal"]'), 2 * u0 + u1, 'y el subtotal es la suma');

    await casilla(p, 'tdc').uncheck(); await p.waitForTimeout(200);
    assert.equal(await leer(p, '[data-precio-cliente="0"]'), esperados({ tdc: false })[0], 'sin TDC baja');
    assert.equal(await p.locator('[data-cargo="tdc"]').innerText(), '—', 'y el renglón de la comisión queda en «—»');
    await casilla(p, 'arq').uncheck(); await p.waitForTimeout(200);
    assert.equal(await leer(p, '[data-precio-cliente="0"]'), esperados({ tdc: false, arq: false })[0], 'sin ninguna comisión quedan indirectos y flete');
    await casilla(p, 'flete').uncheck(); await p.waitForTimeout(200);
    assert.equal(await leer(p, '[data-precio-cliente="0"]'), Math.round(1000 * (1 + IND)), 'sin flete quedan sólo los indirectos: $1,075');
    assert.equal(await p.locator('[data-cargo="flete"]').innerText(), '—', 'y el flete queda en «—»');
    const [v0, v1] = esperados({ tdc: false, arq: false, flete: false });
    assert.equal(await leer(p, '[data-hoja="subtotal"]'), 2 * v0 + v1, 'y el subtotal lo sigue');
    await casilla(p, 'arq').check(); await casilla(p, 'tdc').check(); await casilla(p, 'flete').check(); await p.waitForTimeout(200);
    assert.equal(await leer(p, '[data-precio-cliente="0"]'), u0, 'prendidas otra vez, vuelve');
  } finally { await ctx.close(); }
});

test('el PDF del cliente trae los precios con todo repartido y NUNCA los renglones de indirectos, flete ni comisiones', async () => {
  const { ctx, p } = await abrirApp({ cotizacion: cotizacionCon(version({ cargosAMano: true })) });
  try {
    const [w] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'PDF cliente con condiciones' }).click()]);
    await w.waitForLoadState('domcontentloaded');
    const texto = await w.locator('body').innerText();
    const resumen = await w.locator('.res').innerText();
    await w.close();
    assert.ok(!/Indirectos/i.test(texto), 'sin «Indirectos»');
    assert.ok(!/Comisi/i.test(texto), 'sin «Comisión»');
    // «Flete» sí aparece en las condiciones de contratación (la cláusula de logística); en el resumen económico, no.
    assert.ok(!/Flete/i.test(resumen), 'sin renglón de «Flete» en el resumen');
    assert.ok(/Subtotal/.test(resumen) && /IVA/.test(resumen) && /Total/.test(resumen), 'el resumen trae subtotal, IVA y total');
    assert.ok(texto.includes('$' + esperados()[0].toLocaleString('es-MX')), 'el precio del renglón ya trae los cargos (' + esperados()[0] + ')');
    assert.ok(!/\$1,000\.00/.test(texto), 'y la base escrita no se le enseña al cliente');
  } finally { await ctx.close(); }
});

test('una cotización guardada antes de la regla se VE como se mandó, y al EDITARLA entra a la regla y se guarda marcada', async () => {
  const { ctx, p, escrituras } = await abrirApp({ cotizacion: cotizacionCon(version({ cargosAMano: undefined })) });
  try {
    assert.equal(await leer(p, '[data-total="0"]'), 2000, 'vista: 2 × $1,000, sin cargos, como se mandó');
    assert.equal(await p.locator('[data-cargos-de-antes]').count(), 1, 'y la caja avisa que es de antes');
    await editarCotizacion(p); await p.waitForTimeout(900);
    assert.equal(await leer(p, '[data-total="0"]'), 2 * esperados()[0], 'editando, lo escrito a mano ya lleva sus cargos');
    assert.equal(await p.locator('[data-cargos-de-antes]').count(), 0, 'y el aviso se va');
    // Se guarda sola al cambiar algo, como siempre; entrar a editar no escribe.
    await p.locator('[data-campo="descripcion-1"]').fill('Cuadrilla de 2'); await p.waitForTimeout(900);
    const v = ultimaVersion(escrituras);
    assert.ok(v, 'se guardó sola');
    assert.equal(v.cargosAMano, true, 'marcada con la regla de hoy');
    assert.equal(v.muebles[0].precio, 1000, 'y lo escrito sigue siendo la base');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
