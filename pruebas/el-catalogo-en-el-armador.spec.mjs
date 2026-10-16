/* El catálogo DENTRO del armador de componentes (Mike, 15-oct-2026):
 * «necesito en quote poder agregar desde el catálogo de precios / de
 * catálogo dentro del armador de componentes». Decidido con botones: las dos
 * pestañas (Productos y Precios base), la cantidad a mano en la unidad de
 * cada cosa, y el componente lleva los cargos de la hoja como cualquier
 * otro. Lo que se cuida sin preguntar: el precio entra igual que en el
 * renglón, el componente guarda su origen, la puesta al día con cost101
 * baja a los componentes (sólo en cotizaciones no aprobadas) y una empresa
 * sin cost101 no rompe nada.
 *
 *     npm run armar && node --test pruebas/el-catalogo-en-el-armador.spec.mjs
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
const REQ = { id: 'm-rq', manual: true, item_id: 'it-13', tipo: 'mueble', codigo: 'RQ-13', nombre: 'Muro del estudio', descripcion: 'Muro divisorio con repisa', qty: 1, precio: 0, total: 0, componentes: [], imagenes: [] };
const PERFIL = { int: { formato: '18mm', acabado: 'laminado', chapa: null }, fre: { formato: '18mm', acabado: 'laminado', chapa: null } };
/* Un mueble ya armado con un precio base jalado del catálogo a $200 la pieza:
 * en cost101 hoy vale $245. */
const ARMADO_VIEJO = { id: 'm-arm', nombre: 'Muro con repisa', qty: 1, perfil: PERFIL, imagenes: [],
  componentes: [
    { id: 'k-1', modulo: 'Precio base', desc: 'Panel de yeso 1/2"', tags: ['MAT-001 · por pza'], extras: [], unitario: 200, qty: 6, subtotal: 1200,
      costo_base_id: 'c-yeso', origen_catalogo: 'cost101-base', unidad: 'pza', receta: { tipo: 'catalogo', data: { costo_base_id: 'c-yeso', origen_catalogo: 'cost101-base', nombre: 'Panel de yeso 1/2"', codigo: 'MAT-001', unidad: 'pza', precio: 200, qty: 6 } } },
    { id: 'k-2', modulo: 'Especial', desc: 'Repisa flotante', tags: [], extras: [], unitario: 900, qty: 1, subtotal: 900 },
  ],
  total: 2100 };
const CLIENTE = { id: 'cl-1', nombre: 'Sanje', negocio_id: 'n-1' };
const PROYECTO = { id: 'pr-1', nombre: 'Casa Sanje', cliente_id: 'cl-1', negocio_id: 'n-1' };
const cotizacion = (muebles, aprobacion = null) => ({ id: 'q-1', folio: 'C-0037', cliente_id: 'cl-1', negocio_id: 'n-1', total: 0, ...(aprobacion ? { estado: 'aceptada' } : {}),
  datos: { nombre: 'CC37 - Muros', proyecto_id: 'pr-1', ...(aprobacion ? { aprobacion } : {}), versiones: [{ muebles, usaFlete: true, usaArq: true, usaTDC: true, cargosAMano: true, descuento: 0, desglosar: true, fecha: '2026-10-07T12:00:00Z' }] } });

async function abrirApp({ muebles = [REQ], sinCost101 = false, aprobacion = null, editar = true } = {}) {
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
const guardado = (escrituras) => [...escrituras].reverse().find((e) => /\/cotizaciones/.test(e.ruta) && e.cuerpo?.datos?.versiones)?.cuerpo.datos.versiones[0];
const abrirModulo = async (p) => {
  await p.locator('[data-armar-requerimiento="0"]').click();
  await p.getByRole('button', { name: 'Del catálogo', exact: true }).click();
  await p.locator('[data-armador="catalogo"] [data-catalogo-pestanas]').waitFor();
  await p.waitForTimeout(250);
};

test('del catálogo al mueble: un precio base y un producto, con la cantidad escrita a mano', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    await abrirModulo(p);
    const caja = p.locator('[data-armador="catalogo"]');
    assert.match(await caja.locator('[data-catalogo-pestanas]').innerText(), /Productos · 2[\s\S]*Precios base · 2/, 'las dos pestañas; el borrador de cost101 no se ofrece');
    assert.equal(await caja.locator('[data-armador="agregar-del-catalogo"]').isDisabled(), true, 'sin escoger no se agrega nada');

    // Precio base: $245 la pieza, con IVA como en el renglón; 6 piezas.
    await caja.locator('[data-catalogo="base"]').click();
    await caja.locator('[data-armador="buscar-catalogo"]').fill('yeso');
    assert.equal(await caja.locator('[data-precio-base]').count(), 1, 'la búsqueda filtra');
    await caja.locator('[data-precio-base="MAT-001"]').click();
    assert.match(await caja.locator('[data-armador="catalogo-elegido"]').innerText(), /Panel de yeso[\s\S]*\$245\.00 por pza[\s\S]*Cantidad \(pza\)/);
    await caja.locator('[data-armador="catalogo-elegido"] input[type=number]').fill('6');
    await caja.locator('[data-armador="agregar-del-catalogo"]').click();
    await p.waitForTimeout(200);

    // Producto de cost101: su precio unitario con IVA ($761.63) por m²; 2.5 m².
    await p.getByRole('button', { name: 'Del catálogo', exact: true }).click();
    await p.locator('[data-armador="catalogo"]').waitFor();
    await p.waitForTimeout(250);
    await p.locator('[data-armador="catalogo"] [data-producto="PAR-302"]').click();
    await p.locator('[data-armador="catalogo-elegido"] input[type=number]').fill('2.5');
    await p.locator('[data-armador="agregar-del-catalogo"]').click();
    await p.waitForTimeout(200);

    assert.equal(await p.locator('[data-componente]').count(), 2, 'dos componentes en el mueble');
    assert.match(await p.locator('[data-componente="1"]').innerText(), /Precio base[\s\S]*Panel de yeso/i);
    assert.match(await p.locator('[data-componente="2"]').innerText(), /Catálogo[\s\S]*Muro de tablaroca/i);

    await p.getByRole('button', { name: /Guardar mueble →/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    // Los cargos de la hoja le caen encima como a cualquier componente.
    const unit = Number((await p.locator('[data-precio="0"]').innerText()).replace(/[^\d.]/g, ''));
    assert.ok(unit > 1470 + 1904.08, `el precio al cliente lleva los cargos de la hoja: ${unit}`);
    await p.getByRole('button', { name: /^Guardar/ }).first().click();
    await p.waitForTimeout(900);
    const m0 = guardado(escrituras)?.muebles[0];
    assert.ok(m0, 'se guardó');
    assert.equal(m0.componentes.length, 2);
    const [yeso, muro] = m0.componentes;
    assert.deepEqual({ id: yeso.costo_base_id, o: yeso.origen_catalogo, u: yeso.unidad, pu: yeso.unitario, q: yeso.qty, s: yeso.subtotal },
      { id: 'c-yeso', o: 'cost101-base', u: 'pza', pu: 245, q: 6, s: 1470 }, 'el precio base guarda su origen y su cantidad');
    assert.deepEqual({ id: muro.producto_id, o: muro.origen_catalogo, u: muro.unidad, pu: muro.unitario, q: muro.qty },
      { id: 'p-muro', o: 'cost101', u: 'm²', pu: 761.63, q: 2.5 }, 'el producto, igual');
    assert.equal(yeso.sinCargos, undefined, 'sin marca de precio final');
    assert.ok(Math.abs(m0.total - (1470 + 761.63 * 2.5)) < 0.01, `el costo del mueble es la suma: ${m0.total}`);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('una empresa sin cost101: «Precios base» vacío y los productos siguen', async () => {
  const { ctx, p, errores } = await abrirApp({ sinCost101: true });
  try {
    await abrirModulo(p);
    const caja = p.locator('[data-armador="catalogo"]');
    assert.match(await caja.locator('[data-catalogo-pestanas]').innerText(), /Productos · 2[\s\S]*Precios base · 0/);
    await caja.locator('[data-catalogo="base"]').click();
    assert.match(await caja.innerText(), /No hay precios base\. Se capturan en cost101\./);
    await caja.locator('[data-catalogo="productos"]').click();
    assert.equal(await caja.locator('[data-producto="PTA-A"]').count(), 1);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('la puesta al día con cost101 baja a los componentes del armador, y una aprobada no se toca', async () => {
  const abierta = await abrirApp({ muebles: [ARMADO_VIEJO] });
  try {
    const { p, errores, escrituras } = abierta;
    await p.locator('[data-al-dia]').waitFor({ timeout: 5000 });
    assert.match(await p.locator('[data-al-dia]').innerText(), /Se puso al día 1 precio de cost101/);
    await p.getByRole('button', { name: /^Guardar/ }).first().click();
    await p.waitForTimeout(900);
    const m0 = guardado(escrituras)?.muebles[0];
    const yeso = m0.componentes[0];
    assert.equal(yeso.unitario, 245, 'el precio de hoy');
    assert.equal(yeso.subtotal, 1470, 'por su cantidad');
    assert.equal(yeso.receta.data.precio, 245, 'y la receta, para que rearmarlo no lo regrese');
    assert.equal(m0.componentes[1].unitario, 900, 'el componente especial no se toca');
    assert.equal(m0.total, 2370, 'el mueble vuelve a ser la suma');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await abierta.ctx.close(); }

  const aprobada = await abrirApp({ muebles: [ARMADO_VIEJO], aprobacion: { fecha: '2026-10-08T12:00:00Z', por: 'mike@ejemplo.mx' }, editar: false });
  try {
    const { p, escrituras } = aprobada;
    await p.waitForTimeout(1200);
    assert.equal(await p.locator('[data-al-dia]').count(), 0, 'en una aprobada no hay aviso: no se puso nada al día');
    assert.equal(escrituras.filter((e) => /\/cotizaciones/.test(e.ruta)).length, 0, 'ni se escribió');
  } finally { await aprobada.ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
