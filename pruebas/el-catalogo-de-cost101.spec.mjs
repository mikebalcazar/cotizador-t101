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
 * Mike, 8-oct-2026: «cuando se agregan productos de catálogo, también deben
 * sumar las comisiones adicionales de indirectos, flete, comisión
 * profesionista, comisión tdc» y «si un precio se actualiza en cost101 (…)
 * se deben actualizar en quote, pero sólo en costos no autorizados aún».
 *
 * Lo que se mide:
 *   · un producto de cost101 entra sin IVA y como BASE: lleva indirectos,
 *     comisiones y flete, igual que lo escrito a mano;
 *   · al abrir para editar una cotización no aprobada, lo de cost101 toma el
 *     precio de hoy y lo que había entrado como precio final pasa a llevar
 *     cargos; una aprobada no se mueve;
 *   · un precio base entra CON IVA (Mike, 8-oct) y como base: lleva los cargos de la
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
const cotizacion = (muebles, aprobacion = null) => ({ id: 'q-1', folio: 'C-0037', cliente_id: 'cl-1', negocio_id: 'n-1', total: 0, ...(aprobacion ? { estado: 'aceptada' } : {}),
  datos: { nombre: 'CC37 - Muros', proyecto_id: 'pr-1', ...(aprobacion ? { aprobacion } : {}), versiones: [{ muebles, usaFlete: true, usaArq: true, usaTDC: true, cargosAMano: true, descuento: 0, desglosar: true, fecha: '2026-10-07T12:00:00Z' }] } });

async function abrirApp({ muebles = [A_MANO], sinCost101 = false, aprobacion = null, editar = true } = {}) {
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
    if (r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [cotizacion(muebles, aprobacion)] }));
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
  if (editar) await editarCotizacion(p);
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
    // Mike, 8-oct: los precios base van CON IVA, tal como están en cost101.
    assert.equal(await leer(p, '[data-precio-base="MAT-001"] .num'), 245, 'el precio base se enseña con IVA, como en cost101');
    assert.match(await p.locator('[data-precio-base="MO-003"]').innerText(), /Mano de obra · Tablaroca · por h/);
    assert.match(await p.locator('[data-catalogo-regla]').innerText(), /Entran como base/);
    // Buscar filtra dentro de la pestaña.
    await p.getByPlaceholder(/Buscar por clave/).fill('oficial');
    assert.equal(await p.locator('[data-precio-base]').count(), 1);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('un producto de cost101 entra sin IVA y como base: lleva indirectos, comisiones y flete (Mike, 8-oct)', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    await abrirCatalogo(p);
    assert.match(await p.locator('[data-catalogo-regla]').innerText(), /como base: la hoja les pone indirectos, flete y comisiones/);
    await p.locator('[data-producto="PAR-302"]').getByRole('button', { name: 'Agregar' }).click();
    await p.waitForTimeout(250);
    assert.equal(await p.locator('[data-campo="precio-1"]').inputValue(), '656.57', 'entra con el precio de cost101 sin IVA');
    assert.equal(await p.locator('[data-sin-cargos="1"]').count(), 0, 'ya no es precio final');
    assert.match(await p.locator('[data-cost101="1"]').innerText(), /cost101 · al día/, 'y dice que sigue a cost101');

    await p.locator('[data-campo="cantidad-1"]').fill('10');
    await p.waitForTimeout(200);
    const [aMano, catalogo] = preciosEsperados([{ base: 1000, qty: 1 }, { base: 656.57, qty: 10 }]);
    assert.equal(await leer(p, '[data-precio-cliente="1"]'), catalogo, 'al cliente con indirectos, comisiones y su parte del flete');
    assert.equal(await leer(p, '[data-precio-cliente="0"]'), aMano, 'el flete se reparte entre los dos');
    assert.equal(await p.locator('[data-cargo="catalogo"]').count(), 0, 'no hay renglón «sin cargos» en la caja');
    assert.equal(await leer(p, '[data-cargo="amano"]'), 1000 + 6565.7, 'los dos son base');
    assert.equal(await leer(p, '[data-cargo="indirectos"]'), Math.round((1000 + 6565.7) * IND * 100) / 100, 'los indirectos van sobre los dos');
    const suma = await p.locator('[data-cargos-suma]').innerText();
    assert.ok(suma.includes((await p.locator('[data-hoja="subtotal"]').innerText()).trim()), 'y la caja cierra en el mismo subtotal: ' + suma);

    // Apagar las comisiones baja también el de catálogo.
    const casilla = (clave) => p.locator(`[data-cargo="${clave}"]`).locator('xpath=..').locator('input[type=checkbox]');
    await casilla('arq').uncheck(); await casilla('tdc').uncheck(); await p.waitForTimeout(200);
    assert.ok(await leer(p, '[data-precio-cliente="1"]') < catalogo, 'sin comisiones, el de catálogo baja');
    await casilla('arq').check(); await casilla('tdc').check(); await p.waitForTimeout(200);

    await p.getByRole('button', { name: /^Guardar/ }).first().click();
    await p.waitForTimeout(800);
    const r = ultimaVersion(escrituras)?.muebles[1];
    assert.ok(r, 'se guardó una versión');
    assert.equal(r.sinCargos, undefined, 'no viaja marcado como precio final');
    assert.equal(r.origen_catalogo, 'cost101');
    assert.equal(r.producto_id, 'p-muro', 'con su producto del catálogo');
    assert.equal(r.codigo, 'PAR-302');
    assert.equal(r.unidad, 'm²');
    assert.equal(r.qty, 10);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

/* Una cotización de antes del 8-oct, todavía sin aprobar: un producto que
 * entró como precio final a $600 (hoy vale $656.57 en cost101) y un precio
 * base que entró a $230 (hoy $245). */
const VIEJOS = [
  A_MANO,
  { id: 'm-2', manual: true, producto_id: 'p-muro', origen_catalogo: 'cost101', sinCargos: true, codigo: 'PAR-302', nombre: 'Muro de tablaroca 2 caras', descripcion: 'Precio por m²', qty: 2, precio: 600, total: 600, unidad: 'm²', tipo: 'servicio', componentes: [], imagenes: [] },
  { id: 'm-3', manual: true, costo_base_id: 'c-yeso', origen_catalogo: 'cost101-base', codigo: 'MAT-001', nombre: 'Panel de yeso 1/2"', descripcion: 'Por pza', qty: 1, precio: 230, total: 230, unidad: 'pza', tipo: 'otro', componentes: [], imagenes: [] },
];

test('una cotización sin aprobar se pone al día con cost101 al editarla, y lo de catálogo pasa a llevar cargos', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp({ muebles: VIEJOS });
  try {
    await p.locator('[data-al-dia]').waitFor({ timeout: 5000 });
    assert.match(await p.locator('[data-al-dia]').innerText(), /Se pusieron al día 2 precios de cost101, y 1 renglón del catálogo ahora lleva indirectos, flete y comisiones/);
    assert.equal(await p.locator('[data-campo="precio-1"]').inputValue(), '656.57', 'el producto toma el precio de hoy');
    assert.equal(await p.locator('[data-campo="precio-2"]').inputValue(), '245', 'y el precio base también');
    assert.equal(await p.locator('[data-sin-cargos="1"]').count(), 0, 'ya no es precio final');
    const esperados = preciosEsperados([{ base: 1000, qty: 1 }, { base: 656.57, qty: 2 }, { base: 245, qty: 1 }]);
    assert.equal(await leer(p, '[data-precio-cliente="1"]'), esperados[1], 'con sus cargos');
    assert.equal(await leer(p, '[data-precio-cliente="0"]'), esperados[0], 'el escrito a mano no cambia de precio, sólo comparte el flete');
    await p.getByRole('button', { name: /^Guardar/ }).first().click();
    await p.waitForTimeout(800);
    const v = ultimaVersion(escrituras);
    assert.equal(v?.muebles[1].precio, 656.57);
    assert.equal(v?.muebles[1].sinCargos, undefined);
    assert.equal(v?.muebles[2].precio, 245);
    assert.deepEqual(errores, []);
  } finally { await ctx.close(); }
});

test('una cotización aprobada no se mueve: sus precios quedan congelados', async () => {
  const aprobacion = { at: '2026-10-07T18:00:00Z', items: 4 };
  const { ctx, p, errores } = await abrirApp({ muebles: VIEJOS, aprobacion, editar: false });
  try {
    await p.waitForTimeout(1200);
    assert.equal(await p.locator('[data-hoja="aprobada"]').count(), 1, 'se ve aprobada');
    assert.equal(await p.locator('[data-al-dia]').count(), 0, 'no se pone al día');
    assert.equal(await p.locator('[data-campo="precio-1"]').inputValue(), '600', 'el producto sigue a $600');
    assert.equal(await p.locator('[data-campo="precio-2"]').inputValue(), '230', 'el precio base sigue a $230');
    assert.equal(await p.locator('[data-sin-cargos="1"]').count(), 1, 'y lo que se aprobó como precio final, así se queda');
    assert.match(await p.locator('[data-cost101="2"]').innerText(), /congelado/);
    assert.deepEqual(errores, []);
  } finally { await ctx.close(); }
});

/* Mike, 8-oct-2026, con botones: «Entra $245, con IVA al pie». Se le dijo
 * antes que así ese renglón paga IVA dos veces (~16 % más). */
test('un precio base entra CON IVA y como base: la hoja le pone sus cargos y el IVA al pie', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp({ muebles: [] });
  try {
    await abrirCatalogo(p);
    await p.locator('[data-catalogo="base"]').click();
    await p.locator('[data-precio-base="MAT-001"]').getByRole('button', { name: 'Agregar' }).click();
    await p.waitForTimeout(250);
    assert.equal(await p.locator('[data-campo="precio-0"]').inputValue(), '245', 'entra con $245.00, tal como está en cost101');
    assert.equal(await p.locator('[data-sin-cargos="0"]').count(), 0, 'no es precio final');
    const [esperado] = preciosEsperados([{ base: 245, qty: 1 }]);
    assert.equal(await leer(p, '[data-precio-cliente="0"]'), esperado, 'al cliente va con indirectos, comisiones y flete, como lo escrito a mano');
    assert.equal(await leer(p, '[data-cargo="amano"]'), 245);
    // Y el IVA al pie se le suma también a ese renglón.
    const subtotal = await leer(p, '[data-hoja="subtotal"]');
    assert.ok(Math.abs(await leer(p, '[data-hoja="total"]') - subtotal * 1.16) < 0.011, 'el total es el subtotal más IVA');
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
