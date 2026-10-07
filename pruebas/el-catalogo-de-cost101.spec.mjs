/* «Agregar del catálogo»: productos y precios base de cost101.
 *
 * Mike, 7-oct-2026: «los generadores se alimentan de la base de datos de
 * costos base, y de ahí se generan los productos (…) los cuales van a
 * alimentar los precios de los productos para quote. Quote debe poder leer
 * los precios base y el catálogo de productos. Hay que implementar en quote la
 * opción de agregar del catálogo, ya sea de productos o de precios base.»
 *
 * Y con botones, el mismo día, sobre qué precio llega: «Precio cost101 sin
 * IVA» — con los indirectos y la utilidad de cost101 adentro, y quote101 sólo
 * le suma IVA: no sus indirectos ni sus comisiones.
 *
 * Lo que se mide:
 *   · un producto de cost101 entra como PRECIO FINAL: no sube con indirectos,
 *     comisiones ni flete, y el subtotal lo cuenta tal cual;
 *   · un precio base entra SIN IVA y como base: sí lleva los cargos de la
 *     hoja, igual que lo escrito a mano;
 *   · un producto de siempre (dash101, sin receta) sigue como hasta hoy;
 *   · los borradores de cost101 no se ofrecen;
 *   · la marca viaja en lo que se guarda, y el `producto_id` también.
 *
 *     npm run armar && node --test pruebas/el-catalogo-de-cost101.spec.mjs
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
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
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

/* Lo que contesta la suite (contrato 0.81.0). Los números son los de la
 * semilla de cost101: el muro de tablaroca vale $761.63 con IVA, y lo que la
 * API deja en `precio` es eso sin IVA: 65657 centavos. */
const PRODUCTOS = [
  { id: 'p-muro', codigo: 'PAR-302', nombre: 'Muro de tablaroca 2 caras', descripcion: null, tipo: 'servicio', unidad: 'm²', categoria: 'Muros', estado: 'aprobado', precio: 65657, apu: { comps: [] }, desglose: { pu: 76163 } },
  { id: 'p-borr', codigo: 'PAR-402', nombre: 'Plafón en borrador', tipo: 'servicio', unidad: 'm²', estado: 'borrador', precio: 34515, apu: { comps: [] } },
  { id: 'p-puerta', codigo: 'PTA-A', nombre: 'Puerta modelo A', descripcion: 'Tambor MDF', tipo: 'puerta', estado: null, precio: 950000, apu: null },
];
const COSTOS = [
  { id: 'c-yeso', clave: 'MAT-001', nombre: 'Panel de yeso 1/2"', tipo: 'material', unidad: 'pza', categoria: 'Tableros', precio: 24500 },
  { id: 'c-of', clave: 'MO-003', nombre: 'Oficial tablaroquero', tipo: 'mo', unidad: 'h', categoria: 'Tablaroca', precio: 10500 },
];
const A_MANO = { id: 'm-1', manual: true, codigo: '', nombre: 'Instalación', descripcion: '', qty: 1, precio: 1000, total: 1000, componentes: [], imagenes: [] };
const CLIENTE = { id: 'cl-1', nombre: 'Sanje', negocio_id: 'n-1' };
const PROYECTO = { id: 'pr-1', nombre: 'Casa Sanje', cliente_id: 'cl-1', negocio_id: 'n-1' };
const cotizacion = (muebles) => ({ id: 'q-1', folio: 'C-0037', cliente_id: 'cl-1', negocio_id: 'n-1', total: 0,
  datos: { nombre: 'CC37 - Muros', proyecto_id: 'pr-1', versiones: [{ muebles, usaFlete: true, usaArq: true, usaTDC: true, cargosAMano: true, descuento: 0, desglosar: true, fecha: '2026-10-07T12:00:00Z' }] } });

async function abrirApp({ muebles = [A_MANO], sinCost101 = false } = {}) {
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
    if (r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [cotizacion(muebles)] }));
    if (r === '/orgs/org-1/productos') return route.fulfill(ok({ total: PRODUCTOS.length, filas: PRODUCTOS }));
    if (r === '/orgs/org-1/costos_base') {
      // Una empresa sin cost101: la suite contesta 403 app/permiso, no una lista.
      if (sinCost101) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'sin_permiso' }) });
      return route.fulfill(ok({ total: COSTOS.length, filas: COSTOS }));
    }
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  await p.getByText('Sanje').first().click(); await p.waitForTimeout(400);
  await p.getByText('Casa Sanje').first().click(); await p.waitForTimeout(400);
  await p.getByText('CC37 - Muros').first().click();
  await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
  await editarCotizacion(p);
  return { ctx, p, errores, escrituras };
}
const pesos = (t) => Number(String(t).replace(/[^0-9.\-]/g, ''));
const leer = (p, sel) => p.locator(sel).first().innerText().then(pesos);
const abrirCatalogo = async (p) => { await p.getByRole('button', { name: 'Buscar en catálogo' }).last().click(); await p.locator('[data-catalogo-pestanas]').waitFor(); await p.waitForTimeout(250); };
const ultimaVersion = (escrituras) => escrituras.filter((e) => /\/cotizaciones/.test(e.ruta) && e.cuerpo?.datos?.versiones).pop()?.cuerpo.datos.versiones[0];

test('el catálogo tiene dos pestañas —productos y precios base— y no ofrece los borradores de cost101', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    await abrirCatalogo(p);
    assert.match(await p.locator('[data-catalogo="productos"]').innerText(), /Productos · 2/, 'dos productos: el aprobado de cost101 y el de siempre');
    assert.match(await p.locator('[data-catalogo="base"]').innerText(), /Precios base · 2/);
    assert.equal(await p.locator('[data-producto="PAR-302"]').count(), 1, 'el aprobado está');
    assert.equal(await p.locator('[data-producto="PAR-402"]').count(), 0, 'el borrador no se ofrece');
    assert.equal(await p.locator('[data-producto="PTA-A"]').count(), 1, 'el de siempre sigue');
    assert.match(await p.locator('[data-producto="PAR-302"]').innerText(), /cost101 · por m²/, 'el de cost101 se dice, con su unidad');
    assert.equal(await leer(p, '[data-producto="PAR-302"] .num'), 656.57, 'con su precio sin IVA');
    await p.locator('[data-catalogo="base"]').click();
    assert.equal(await p.locator('[data-precio-base]').count(), 2);
    // $245.00 con IVA en cost101 → $211.21 sin IVA.
    assert.equal(await leer(p, '[data-precio-base="MAT-001"] .num'), 211.21, 'el precio base se enseña sin IVA');
    assert.match(await p.locator('[data-precio-base="MO-003"]').innerText(), /Mano de obra · Tablaroca · por h/);
    assert.match(await p.locator('[data-catalogo-regla]').innerText(), /Entran como base/);
    // Buscar filtra dentro de la pestaña.
    await p.getByPlaceholder(/Buscar por clave/).fill('oficial');
    assert.equal(await p.locator('[data-precio-base]').count(), 1);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('un producto de cost101 entra como precio final: sin indirectos, comisiones ni flete; sólo IVA al pie', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    const [soloAMano] = preciosEsperados([{ base: 1000, qty: 1 }]);
    assert.equal(await leer(p, '[data-hoja="subtotal"]'), soloAMano, 'antes: un renglón a mano de $1,000 con sus cargos');

    await abrirCatalogo(p);
    await p.locator('[data-producto="PAR-302"]').getByRole('button', { name: 'Agregar' }).click();
    await p.waitForTimeout(250);
    assert.equal(await p.locator('[data-campo="precio-1"]').inputValue(), '656.57', 'entra con el precio de cost101 sin IVA');
    assert.equal(await p.locator('[data-sin-cargos="1"]').count(), 1, 'y la hoja dice que es precio final');
    assert.equal(await p.locator('[data-precio-cliente="1"]').count(), 0, 'no hay un «al cliente» distinto: es el mismo');
    assert.equal(await leer(p, '[data-total="1"]'), 656.57);

    // 10 m²: el total del renglón es 10 × el precio, sin nada encima.
    await p.locator('[data-campo="cantidad-1"]').fill('10');
    await p.waitForTimeout(200);
    assert.equal(await leer(p, '[data-total="1"]'), 6565.7);
    // El renglón a mano NO cambió por haber metido el de catálogo: el flete
    // se reparte sólo entre lo que lleva cargos.
    assert.equal(await leer(p, '[data-precio-cliente="0"]'), soloAMano, 'el renglón a mano paga lo mismo que antes');
    assert.equal(await leer(p, '[data-hoja="subtotal"]'), Math.round((soloAMano + 6565.7) * 100) / 100, 'el subtotal es la suma de los dos');

    // La caja de «Cómo se forma el precio»: lo de catálogo aparte, y los
    // indirectos sólo sobre lo escrito a mano.
    assert.equal(await leer(p, '[data-cargo="catalogo"]'), 6565.7);
    assert.equal(await leer(p, '[data-cargo="amano"]'), 1000);
    assert.equal(await leer(p, '[data-cargo="indirectos"]'), 1000 * IND, 'los indirectos no tocan lo de catálogo');
    assert.equal(await leer(p, '[data-cargo="flete"]'), fleteDe(1000 * (1 + IND) * (1 + ARQ) * (1 + TDC)), 'ni el flete');
    const suma = await p.locator('[data-cargos-suma]').innerText();
    assert.ok(suma.includes((await p.locator('[data-hoja="subtotal"]').innerText()).trim()), 'y la caja cierra en el mismo subtotal: ' + suma);

    // Apagar las comisiones baja lo escrito a mano y deja igual lo de catálogo.
    const casilla = (clave) => p.locator(`[data-cargo="${clave}"]`).locator('xpath=..').locator('input[type=checkbox]');
    await casilla('arq').uncheck(); await casilla('tdc').uncheck(); await p.waitForTimeout(200);
    assert.equal(await leer(p, '[data-total="1"]'), 6565.7, 'sin comisiones, el de catálogo sigue igual');
    assert.ok(await leer(p, '[data-precio-cliente="0"]') < soloAMano, 'y el escrito a mano bajó');
    await casilla('arq').check(); await casilla('tdc').check(); await p.waitForTimeout(200);

    // El IVA al pie es sobre todo el subtotal.
    const subtotal = await leer(p, '[data-hoja="subtotal"]');
    const total = await leer(p, '[data-hoja="total"]');
    assert.ok(Math.abs(total - subtotal * 1.16) < 0.011, `el total es el subtotal más IVA: ${total} vs ${subtotal * 1.16}`);

    // Lo que se guarda: la marca y el producto viajan en el renglón.
    await p.getByRole('button', { name: /^Guardar/ }).first().click();
    await p.waitForTimeout(800);
    const v = ultimaVersion(escrituras);
    assert.ok(v, 'se guardó una versión');
    const r = v.muebles[1];
    assert.equal(r.sinCargos, true, 'el renglón viaja marcado como precio final');
    assert.equal(r.producto_id, 'p-muro', 'con su producto del catálogo');
    assert.equal(r.codigo, 'PAR-302');
    assert.equal(r.tipo, 'servicio');
    assert.equal(r.unidad, 'm²');
    assert.equal(r.qty, 10);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('un precio base entra sin IVA y como base: la hoja sí le pone sus cargos', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp({ muebles: [] });
  try {
    await abrirCatalogo(p);
    await p.locator('[data-catalogo="base"]').click();
    await p.locator('[data-precio-base="MAT-001"]').getByRole('button', { name: 'Agregar' }).click();
    await p.waitForTimeout(250);
    assert.equal(await p.locator('[data-campo="precio-0"]').inputValue(), '211.21', '$245.00 con IVA es $211.21 sin IVA');
    assert.equal(await p.locator('[data-sin-cargos="0"]').count(), 0, 'no es precio final');
    const [esperado] = preciosEsperados([{ base: 211.21, qty: 1 }]);
    assert.equal(await leer(p, '[data-precio-cliente="0"]'), esperado, 'al cliente va con indirectos, comisiones y flete, como lo escrito a mano');
    assert.equal(await leer(p, '[data-cargo="amano"]'), 211.21);
    assert.equal(await p.locator('[data-cargo="catalogo"]').count(), 0);
    await p.getByRole('button', { name: /^Guardar/ }).first().click();
    await p.waitForTimeout(800);
    const r = ultimaVersion(escrituras)?.muebles[0];
    assert.equal(r.costo_base_id, 'c-yeso');
    assert.equal(r.codigo, 'MAT-001');
    assert.equal(r.sinCargos, undefined);
    assert.deepEqual(errores, []);
  } finally { await ctx.close(); }
});

test('un producto de siempre (dash101, sin receta) entra como hasta hoy: es la base y lleva cargos', async () => {
  const { ctx, p } = await abrirApp({ muebles: [] });
  try {
    await abrirCatalogo(p);
    await p.locator('[data-producto="PTA-A"]').getByRole('button', { name: 'Agregar' }).click();
    await p.waitForTimeout(250);
    assert.equal(await p.locator('[data-campo="precio-0"]').inputValue(), '9500');
    assert.equal(await p.locator('[data-sin-cargos="0"]').count(), 0);
    const [esperado] = preciosEsperados([{ base: 9500, qty: 1 }]);
    assert.equal(await leer(p, '[data-precio-cliente="0"]'), esperado);
  } finally { await ctx.close(); }
});

test('una empresa sin cost101 sigue viendo su catálogo de productos; los precios base salen vacíos, no rotos', async () => {
  const { ctx, p, errores } = await abrirApp({ muebles: [], sinCost101: true });
  try {
    await abrirCatalogo(p);
    assert.equal(await p.locator('[data-producto]').count(), 2, 'los productos están');
    await p.locator('[data-catalogo="base"]').click();
    assert.match(await p.locator('.h-cat').innerText(), /No hay precios base/);
    assert.deepEqual(errores, []);
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
