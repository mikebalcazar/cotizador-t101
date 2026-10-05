/* El ítem de la obra, a la derecha (la barra de quell101 de sólo lectura).
 *
 * Mike, 5-oct-2026: «cuando estoy en quote viendo la lista de requerimientos
 * nuevos, quiero que si le doy click, a la derecha me abra la barra de quell
 * de los detalles del ítem, así puedo revisar qué es el requerimiento y
 * decidir si lo agrego o no a la cotización. Y ya una vez en el formato de
 * cotización quiero poder otra vez dar click sobre el requerimiento o en un
 * iconito de info que haya para abrir de nuevo la barra».
 *
 * Lo que se cuida: que desde la lista de pendientes se abra el panel con lo
 * que el motor manda (nombre, bitácora con su foto servida por el motor,
 * punchlist, archivos); que no marque la casilla; que se cierre con ✕ y con
 * Escape; que desde la hoja el renglón del requerimiento lo vuelva a abrir;
 * y que un ítem sin pieza en el plano lo diga con palabras.
 *
 *     npm run armar && node --test pruebas/el-panel-del-item.spec.mjs
 *
 * (La historia de origen, 2-oct: «Cuando en un proyecto hay ítems fuera de alcance, en
 * quote debe aparecer dentro del proyecto, abajo de nueva cotización, un
 * botón que diga "ítems pendientes", y al darle click haya una lista completa
 * de los ítems que están fuera de alcance, y que se puedan seleccionar varios
 * para agregar a una cotización. Y dentro de la cotización, poder arrastrar
 * un ítem sobre otro para agruparlos en un producto, para que solo se edite
 * la descripción y el precio una vez. Sólo van sumando la cantidad de piezas
 * (ítems) iguales en el mismo concepto de la cotización.»
 *
 * Lo que se cuida: que la liga sólo salga cuando HAY pendientes; que los
 * escogidos caigan como renglones con su `item_id` (al aprobar se aprueba ESE
 * ítem, no nace otro); que arrastrar uno sobre otro deje UN renglón con la
 * cantidad sumada y los dos ítems adentro; y que al aprobar viaje una línea
 * por ítem, con el mismo precio y la misma descripción.
 *
 *     npm run armar && node --test pruebas/los-items-pendientes.spec.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preciosEsperados } from './cargos.mjs';

const PUBLICAR = fileURLToPath(new URL('../publicar/', import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json' };
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

const CLIENTE = { id: 'cl-1', nombre: 'Casa Muestra' };
const CON = { id: 'pr-1', nombre: 'Departamento Lomas', cliente_id: 'cl-1' };
const SIN = { id: 'pr-2', nombre: 'Oficina Centro', cliente_id: 'cl-1' };
/* Dos puertas iguales sacadas del alcance y un requerimiento sin aprobar, en
 * centavos, como los manda la suite. */
const FUERA = [
  { id: 'it-a', proyecto_id: 'pr-1', clave: 'PT-01', nombre: 'Puerta de nogal', descripcion: '0.90 × 2.40', tipo: 'puerta', monto: 1800000, cantidad: 1, estado: 'cotizado', alcance: 'fuera', cancelado_at: '2026-10-01T10:00:00Z', cancelado_motivo: 'El cliente la quitó' },
  { id: 'it-b', proyecto_id: 'pr-1', clave: 'PT-02', nombre: 'Puerta de nogal', descripcion: '0.90 × 2.40', tipo: 'puerta', monto: 1800000, cantidad: 1, estado: 'cotizado', alcance: 'fuera', cancelado_at: '2026-10-01T10:00:00Z', cancelado_motivo: null },
  { id: 'it-c', proyecto_id: 'pr-1', clave: 'RQ-03', nombre: 'Repisa del baño', descripcion: '', tipo: 'requerimiento', monto: 0, cantidad: 1, estado: 'cotizado', alcance: 'fuera', cancelado_at: null },
];

const PIEZA = { element_id: 'el-3', project_id: 'ob-1', project_name: 'Depto Lomas (obra)', plan_id: 'pl-1', plan_name: 'Planta baja', code: 'RQ-03', name: 'Repisa del baño', type: 'Requerimiento', fase: 'produccion', padre_id: null };
const DETALLE = {
  element: { id: 'el-3', code: 'RQ-03', name: 'Repisa del baño', type: 'Requerimiento', fase: 'produccion', alcance: 'fuera', plan_name: 'Planta baja', item_id: 'it-c', item_descripcion: 'Repisa flotante de 90 cm, nogal', item_monto: null, item_fecha_entrega: null, item_entrega_falta: null },
  log: [{ id: 'lg-1', kind: 'nota', text: 'El cliente la quiere arriba del lavabo, a 1.20 m', created_at: '2026-09-28T15:53:00Z', user_name: 'Fer Balcázar', photos: [{ id: 'ph-1', r2_key: 'orgs/org-1/quell/photos/log/lg-1/ph-1.png', file_name: 'repisa.png' }] }],
  punch: [{ id: 'pk-1', title: 'Confirmar medida', description: 'medir el hueco', status: 'pend', resp: 'Fer', due_date: '2026-10-10', photos: [] }],
  etapas: [], hechas: [], contratistas: [{ id: 'u-7', name: 'Carpintería Ruiz', company: 'Ruiz y Hnos' }],
};
const DOCS = { ok: true, principal: { id: 'dc-1', nombre: 'repisa-plano.pdf', r2_key: 'orgs/org-1/quell/docs/dc-1.pdf', rol: 'principal' }, soporte: [], marcas: [] };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function abrirApp() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errores = [], escrituras = [], dialogos = [], lecturas = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  p.on('dialog', (d) => { dialogos.push(d.message()); d.accept(); });
  p.on('request', (r) => {
    if (!r.url().includes('/s101/')) return;
    const ruta = new URL(r.url()).pathname.replace(/^\/s101/, '') + new URL(r.url()).search;
    if (r.method() === 'GET') { lecturas.push(ruta); return; }
    let cuerpo = null; try { cuerpo = r.postDataJSON(); } catch { /* sin JSON */ }
    escrituras.push({ metodo: r.method(), ruta: new URL(r.url()).pathname.replace(/^\/s101/, ''), cuerpo });
  });
  await p.route('**/s101/**', (route) => {
    const u = new URL(route.request().url());
    const r = u.pathname.replace(/^\/s101/, '');
    const metodo = route.request().method();
    if (metodo !== 'GET') {
      if (/\/aprobar$/.test(r)) {
        const cuerpo = route.request().postDataJSON();
        const piezas = cuerpo.lineas.reduce((s, l) => s + l.cantidad, 0);
        return route.fulfill({ ...ok({ cotizacion: { id: 'q-9', estado: 'aceptada', datos: { aprobacion: { at: '2026-10-02T18:00:00Z', items: piezas } } }, items: piezas, productos_nuevos: 0 }), status: 201 });
      }
      return route.fulfill({ ...ok({ id: 'q-9', folio: 'C-0009' }), status: metodo === 'POST' ? 201 : 200 });
    }
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: [CLIENTE] }));
    if (r === '/orgs/org-1/proyectos') return route.fulfill(ok({ filas: [CON, SIN] }));
    if (r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [] }));
    if (r === '/orgs/org-1/items') {
      const pid = u.searchParams.get('proyecto_id');
      return route.fulfill(ok({ filas: pid === 'pr-1' ? FUERA : [] }));
    }
    /* El motor de obra contesta sin envolver ({ok, …} pegado). */
    if (r === '/orgs/org-1/quell/items/it-c/pieza') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, pieza: PIEZA }) });
    if (r === '/orgs/org-1/quell/items/it-a/pieza') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Este ítem no está en ningún plano.' }) });
    if (r === '/orgs/org-1/quell/elements/el-3') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DETALLE) });
    if (r === '/orgs/org-1/quell/elements/el-3/docs') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DOCS) });
    if (r.startsWith('/orgs/org-1/quell/files/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  await p.getByText('Casa Muestra').first().click(); await p.waitForTimeout(400);
  return { ctx, p, errores, escrituras, dialogos, lecturas };
}

test('desde la lista de pendientes, «ver en la obra» abre el panel con lo que manda el motor, sin marcar la casilla', async () => {
  const { ctx, p, errores, lecturas } = await abrirApp();
  try {
    await p.getByText('Departamento Lomas').first().click();
    await p.locator('[data-items-pendientes="pr-1"]').click();
    const modal = p.locator('[data-modal="items-pendientes"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await modal.locator('[data-pendiente="it-c"] [data-ver-pieza="it-c"]').click();
    const panel = p.locator('[data-panel-pieza="it-c"]');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await panel.locator('[data-pieza-nombre="el-3"]').waitFor({ timeout: 10000 });
    const dice = await panel.innerText();
    assert.match(dice, /Requerimiento · RQ-03/i, "tipo y código (en mayúsculas por CSS)");
    assert.match(dice, /Repisa del baño/, 'el nombre');
    assert.match(dice, /Depto Lomas \(obra\) · Planta baja/, 'la obra y el plano');
    assert.match(dice, /Producción/, 'la fase'); assert.match(dice, /Fuera de alcance/, 'y el alcance');
    assert.match(dice, /Repisa flotante de 90 cm, nogal/, 'la descripción del ítem');
    assert.match(dice, /Contratistas: Carpintería Ruiz \(Ruiz y Hnos\)/, 'los contratistas');
    assert.match(dice, /Plano: repisa-plano\.pdf/, 'el archivo principal');
    assert.match(dice, /Punchlist · 1\/1/i, "el punchlist con su cuenta (título en mayúsculas por CSS)"); assert.match(dice, /Confirmar medida/);
    assert.match(dice, /Bitácora · 1/i, "la bitácora"); assert.match(dice, /El cliente la quiere arriba del lavabo/, 'con su texto'); assert.match(dice, /Fer Balcázar/, 'y quién');
    const foto = panel.locator('[data-bitacora="lg-1"] img');
    assert.equal(await foto.count(), 1, 'la foto de la bitácora');
    assert.match(await foto.getAttribute('src'), /\/s101\/orgs\/org-1\/quell\/files\/orgs\/org-1\/quell\/photos\/log\/lg-1\/ph-1\.png$/, 'servida por el motor, la llave codificada tramo por tramo');
    assert.ok(lecturas.some((l) => l === '/orgs/org-1/quell/items/it-c/pieza'), 'se preguntó la pieza del ítem');
    assert.ok(lecturas.some((l) => l === '/orgs/org-1/quell/elements/el-3') && lecturas.some((l) => l === '/orgs/org-1/quell/elements/el-3/docs'), 'y el detalle y los archivos');
    assert.equal(await modal.locator('[data-pendiente="it-c"] input').isChecked(), false, 'abrir el panel no marca la casilla');

    await panel.getByRole('button', { name: 'Cerrar' }).click();
    assert.equal(await p.locator('[data-panel-pieza]').count(), 0, 'se cierra con ✕');
    await modal.locator('[data-pendiente="it-c"] [data-ver-pieza="it-c"]').click();
    await p.locator('[data-panel-pieza="it-c"]').waitFor({ state: 'visible', timeout: 10000 });
    await p.keyboard.press('Escape');
    await p.waitForTimeout(200);
    assert.equal(await p.locator('[data-panel-pieza]').count(), 0, 'y con Escape');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('en la hoja, el renglón del requerimiento vuelve a abrir el panel; un ítem sin pieza lo dice con palabras', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    await p.getByText('Departamento Lomas').first().click();
    await p.locator('[data-items-pendientes="pr-1"]').click();
    const modal = p.locator('[data-modal="items-pendientes"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await modal.locator('[data-pendiente="it-a"] input').check();
    await modal.locator('[data-pendiente="it-c"] input').check();
    await modal.getByRole('button', { name: /Agregar 2 ítems a la cotización/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
    assert.equal(await p.locator('[data-renglon] [data-ver-pieza]').count(), 2, 'cada renglón de la obra trae su ícono de info');

    await p.locator('[data-requerimiento="it-c"] [data-ver-pieza="it-c"]').click();
    const panel = p.locator('[data-panel-pieza="it-c"]');
    await panel.waitFor({ state: 'visible', timeout: 10000 });
    await panel.locator('[data-pieza-nombre="el-3"]').waitFor({ timeout: 10000 });
    assert.match(await panel.innerText(), /Repisa del baño/, 'el mismo panel, desde la hoja');
    await panel.getByRole('button', { name: 'Cerrar' }).click();
    // La hoja sigue editable: el precio se define con el panel ya visto.
    await p.locator('[data-campo="precio-1"]').fill('2500');
    assert.equal(await p.locator('[data-campo="precio-1"]').inputValue(), '2500');

    await p.locator('[data-requerimiento="it-a"] [data-ver-pieza="it-a"]').click();
    const sin = p.locator('[data-panel-pieza="it-a"]');
    await sin.waitFor({ state: 'visible', timeout: 10000 });
    await sin.getByText('Este ítem no está en ningún plano de la obra.').waitFor({ timeout: 10000 });
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
