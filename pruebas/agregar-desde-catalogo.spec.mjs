/* «Agregar desde catálogo» en un renglón (Mike, 11-oct-2026, con captura del
 * requerimiento RQ-13 «Mesa de Sala en "U"»): «en ese espacio necesito que
 * aparezca la opción "agregar desde catálogo" y que sea buscar en el catálogo
 * de la empresa (gestionado por cost). Se agrega la info al concepto, pero no
 * se sobreescribe el nombre ni la descripción, aparecen los 2 y un checkbox
 * para seleccionar cuál se dejará. Y si el nombre y/o descripción están
 * vacíos, en automático se desaparece el campo de nombre y descripción para
 * editar, al menos que le pongas en "escribir nombre" y "escribir
 * descripción"».
 *
 *     npm run armar && node --test pruebas/agregar-desde-catalogo.spec.mjs
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
const REQ = { id: 'm-rq', manual: true, item_id: 'it-13', tipo: 'mueble', codigo: 'RQ-13', nombre: 'Mesa de Sala en "U"', descripcion: 'Mesa de juntas modular en herradura, 18 personas', qty: 1, precio: 0, total: 0, componentes: [], imagenes: [] };
const VACIO = { id: 'm-vacio', manual: true, tipo: 'mueble', codigo: '', nombre: '', descripcion: '', qty: 1, precio: 0, total: 0, componentes: [], imagenes: [] };
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


test('en el renglón del requerimiento: «agregar desde catálogo» toma el precio y deja escoger nombre y descripción', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp({ muebles: [REQ, VACIO] });
  try {
    const liga = p.locator('[data-desde-catalogo="0"]');
    assert.equal(await liga.count(), 1, 'la liga está junto a «armar por componentes»');
    await liga.click();
    await p.locator('[data-catalogo-pestanas]').waitFor();
    assert.match(await p.locator('[data-catalogo-destino]').innerText(), /Agregar desde catálogo a «Mesa de Sala en "U"»/);
    await p.locator('[data-producto="PTA-A"]').getByRole('button', { name: 'Usar' }).click();
    await p.waitForTimeout(250);
    assert.equal(await p.locator('[data-renglon]').count(), 2, 'no se agregó un renglón: se aplicó a ése');
    assert.equal(await p.locator('[data-campo="precio-0"]').inputValue(), '9500', 'toma el precio del catálogo');
    assert.equal(await p.locator('[data-campo="codigo-0"]').inputValue(), 'RQ-13', 'el código del requerimiento se queda');
    // Los dos nombres, con su casilla; se queda el de la obra hasta que se escoja otro.
    assert.equal(await p.locator('[data-campo="nombre-0"]').count(), 0, 'no hay campo: hay que escoger');
    assert.ok(await p.locator('[data-elige="nombre-propio-0"]').isChecked(), 'el de la obra viene escogido');
    assert.ok(!(await p.locator('[data-elige="nombre-catalogo-0"]').isChecked()));
    assert.match(await p.locator('[data-elegir="nombre-0"]').innerText(), /Mesa de Sala en "U"[\s\S]*de la obra[\s\S]*Puerta modelo A[\s\S]*del catálogo/);
    assert.match(await p.locator('[data-elegir="descripcion-0"]').innerText(), /herradura[\s\S]*Tambor MDF/, 'y las dos descripciones');
    await p.locator('[data-elige="nombre-catalogo-0"]').check();
    await p.waitForTimeout(150);
    assert.ok(await p.locator('[data-elige="nombre-catalogo-0"]').isChecked());
    assert.ok(!(await p.locator('[data-elige="nombre-propio-0"]').isChecked()), 'una u otra, no las dos');

    await p.getByRole('button', { name: /^Guardar/ }).first().click();
    await p.waitForTimeout(800);
    const r = ultimaVersion(escrituras)?.muebles[0];
    assert.ok(r, 'se guardó');
    assert.equal(r.nombre, 'Puerta modelo A', 'el nombre que se escogió');
    assert.equal(r.descripcion, 'Mesa de juntas modular en herradura, 18 personas', 'la descripción de la obra, que no se tocó');
    assert.equal(r.item_id, 'it-13', 'sigue siendo el requerimiento de la obra');
    assert.equal(r.producto_id, 'p-puerta');
    assert.equal(r.precio, 9500);
    assert.equal(r.del_catalogo.nombre_propio, 'Mesa de Sala en "U"', 'lo de la obra se guarda, para volver a escoger');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('con nombre y descripción vacíos el campo se va; «escribir nombre» lo regresa; y se puede quitar lo del catálogo', async () => {
  const { ctx, p, errores } = await abrirApp({ muebles: [REQ, VACIO] });
  try {
    await p.locator('[data-desde-catalogo="1"]').click();
    await p.locator('[data-catalogo-pestanas]').waitFor();
    await p.locator('[data-producto="PAR-302"]').getByRole('button', { name: 'Usar' }).click();
    await p.waitForTimeout(250);
    assert.equal(await p.locator('[data-campo="nombre-1"]').count(), 0, 'sin campo de nombre');
    assert.equal(await p.locator('[data-campo="descripcion-1"]').count(), 0, 'ni de descripción');
    assert.equal(await p.locator('[data-texto="nombre-1"]').innerText(), 'Muro de tablaroca 2 caras', 'sale el nombre del catálogo');
    assert.equal(await p.locator('[data-elige^="nombre-"][data-elige$="-1"]').count(), 0, 'sin casillas: no hay de dónde escoger');
    assert.equal(await p.locator('[data-campo="precio-1"]').inputValue(), '761.63');
    assert.match(await p.locator('[data-cost101="1"]').innerText(), /cost101/, 'y sigue a cost101 como lo agregado del catálogo');

    await p.locator('[data-escribir="nombre-1"]').click();
    await p.waitForTimeout(150);
    assert.equal(await p.locator('[data-campo="nombre-1"]').inputValue(), 'Muro de tablaroca 2 caras', '«escribir nombre» trae el campo, con lo que había');
    await p.locator('[data-campo="nombre-1"]').fill('Muro divisorio de la sala');
    await p.locator('[data-volver-escoger="nombre-1"]').click();
    await p.waitForTimeout(150);
    assert.match(await p.locator('[data-elegir="nombre-1"]').innerText(), /Muro divisorio de la sala[\s\S]*Muro de tablaroca 2 caras/, 'lo escrito queda como lo propio, junto al del catálogo');
    assert.ok(await p.locator('[data-elige="nombre-propio-1"]').isChecked());
    assert.equal(await p.locator('[data-campo="descripcion-1"]').count(), 0, 'la descripción sigue sin campo');
    await p.locator('[data-escribir="descripcion-1"]').click();
    assert.equal(await p.locator('[data-campo="descripcion-1"]').count(), 1, '«escribir descripción» la trae');

    await p.locator('[data-quitar-catalogo="1"]').click();
    await p.waitForTimeout(150);
    assert.equal(await p.locator('[data-campo="precio-1"]').inputValue(), '0', 'quitar lo del catálogo regresa el precio');
    assert.equal(await p.locator('[data-campo="nombre-1"]').inputValue(), 'Muro divisorio de la sala', 'y deja el nombre propio');
    assert.equal(await p.locator('[data-cost101="1"]').count(), 0, 'y ya no sigue a cost101');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('«Buscar en catálogo» de la barra sigue agregando un renglón nuevo', async () => {
  const { ctx, p, errores } = await abrirApp({ muebles: [REQ] });
  try {
    await abrirCatalogo(p);
    assert.match(await p.locator('[data-catalogo-destino]').innerText(), /^Catálogo$/);
    await p.locator('[data-producto="PAR-302"]').getByRole('button', { name: 'Agregar' }).click();
    await p.waitForTimeout(250);
    assert.equal(await p.locator('[data-renglon]').count(), 2, 'un renglón más');
    assert.equal(await p.locator('[data-campo="nombre-0"]').inputValue(), 'Mesa de Sala en "U"', 'el del requerimiento no se tocó');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
