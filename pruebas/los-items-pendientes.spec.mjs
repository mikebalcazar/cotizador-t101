/* Los ítems pendientes del proyecto, y agrupar renglones arrastrando.
 *
 * Mike, 2-oct-2026: «Cuando en un proyecto hay ítems fuera de alcance, en
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
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  await p.getByText('Casa Muestra').first().click(); await p.waitForTimeout(400);
  return { ctx, p, errores, escrituras, dialogos, lecturas };
}

test('la liga «Ítems pendientes» sale sólo en el proyecto que los tiene, con su conteo', async () => {
  const { ctx, p, errores, lecturas } = await abrirApp();
  try {
    await p.getByText('Departamento Lomas').first().click();
    const liga = p.locator('[data-items-pendientes="pr-1"]');
    await liga.waitFor({ state: 'visible', timeout: 10000 });
    assert.match(await liga.innerText(), /Ítems pendientes \(3\)/, 'dice cuántos hay');
    assert.ok(lecturas.some((l) => l.startsWith('/orgs/org-1/items?') && l.includes('proyecto_id=pr-1') && l.includes('estado=cotizado') && l.includes('limite=5000')),
      'se preguntan a la suite los fuera del alcance del proyecto, sin tope de 500: ' + lecturas.join(' | '));

    await p.getByText('Oficina Centro').first().click(); await p.waitForTimeout(700);
    assert.equal(await p.locator('[data-items-pendientes="pr-2"]').count(), 0, 'un proyecto sin pendientes no enseña la liga');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('la lista completa, se escogen varios y caen en una cotización nueva con su item_id', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    await p.getByText('Departamento Lomas').first().click();
    await p.locator('[data-items-pendientes="pr-1"]').click();
    const modal = p.locator('[data-modal="items-pendientes"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    assert.equal(await modal.locator('[data-pendiente]').count(), 3, 'la lista trae los tres fuera del alcance');
    assert.match(await modal.locator('[data-pendiente="it-a"]').innerText(), /Se sacó del alcance · «El cliente la quitó»/, 'dice que lo sacaron, y por qué');
    assert.match(await modal.locator('[data-pendiente="it-c"]').innerText(), /Requerimiento sin aprobar/, 'y qué es un requerimiento sin decidir');

    await modal.locator('[data-pendiente="it-a"] input').check();
    await modal.locator('[data-pendiente="it-b"] input').check();
    assert.equal(await modal.locator('[data-destino="cotizacion"]').inputValue(), 'nueva', 'por omisión, una cotización nueva');
    await modal.getByRole('button', { name: /Agregar 2 ítems a la cotización/ }).click();

    await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
    assert.equal(await p.locator('[data-renglon]').count(), 2, 'dos renglones, uno por ítem');
    assert.equal(await p.locator('[data-campo="nombre-0"]').inputValue(), 'Puerta de nogal');
    assert.equal(await p.locator('[data-campo="codigo-0"]').inputValue(), 'PT-01');
    assert.equal(await p.locator('[data-campo="precio-0"]').inputValue(), '18000', 'el precio en pesos por pieza');
    assert.equal(await p.locator('[data-campo="tipo-0"]').inputValue(), 'puerta', 'con su tipo');
    assert.equal(await p.locator('[data-requerimiento="it-a"]').count(), 1, 'y cada renglón sabe de qué ítem es');
    assert.equal(await p.locator('[data-requerimiento="it-b"]').count(), 1);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('arrastrar un renglón sobre otro los agrupa: un concepto, cantidad 2, los dos ítems adentro; y al aprobar viaja una línea por ítem', async () => {
  const { ctx, p, errores, escrituras, dialogos } = await abrirApp();
  try {
    await p.getByText('Departamento Lomas').first().click();
    await p.locator('[data-items-pendientes="pr-1"]').click();
    const modal = p.locator('[data-modal="items-pendientes"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await modal.locator('[data-pendiente="it-a"] input').check();
    await modal.locator('[data-pendiente="it-b"] input').check();
    await modal.getByRole('button', { name: /Agregar 2 ítems/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });

    assert.equal(await p.locator('[data-renglon="0"]').getAttribute('draggable'), 'true', 'los renglones se pueden arrastrar');
    await p.locator('[data-renglon="1"]').dragTo(p.locator('[data-renglon="0"]'));
    await p.waitForTimeout(300);
    assert.equal(await p.locator('[data-renglon]').count(), 1, 'quedó UN renglón');
    assert.equal(await p.locator('[data-campo="cantidad-0"]').inputValue(), '2', 'con la cantidad sumada');
    assert.equal(await p.locator('[data-renglon="0"]').getAttribute('data-agrupados'), '2', 'y los dos ítems adentro');
    assert.match(await p.locator('[data-requerimiento="it-a it-b"]').innerText(), /2 ítems de la obra agrupados/, 'lo dice en el renglón');
    assert.equal(await p.locator('[data-campo="precio-0"]').inputValue(), '18000', 'el precio se edita una sola vez');

    await p.locator('[data-campo="descripcion-0"]').fill('Nogal natural, bisagras ocultas');
    await p.waitForTimeout(300);
    await p.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await p.waitForSelector('[data-hoja="aprobada"]', { timeout: 10000 });
    assert.ok(/aprueban 2 requerimientos de la obra/.test(dialogos.join('\n')), 'la confirmación cuenta los dos ítems: ' + dialogos.join(' | '));
    const envio = escrituras.find((e) => /\/cotizaciones\/[^/]+\/aprobar$/.test(e.ruta));
    assert.ok(envio, 'se pidió aprobar a la suite');
    assert.equal(envio.cuerpo.lineas.length, 2, 'una línea por ítem');
    assert.deepEqual(envio.cuerpo.lineas.map((l) => l.item_id), ['it-a', 'it-b']);
    assert.ok(envio.cuerpo.lineas.every((l) => l.cantidad === 1 && l.precio === 1800000 && l.descripcion === 'Nogal natural, bisagras ocultas' && l.tipo === 'puerta'),
      'las dos con el mismo precio, la misma descripción y el mismo tipo: ' + JSON.stringify(envio.cuerpo.lineas));
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('agrupar no borra piezas sin ítem: la cantidad que sobra nace como piezas nuevas', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    await p.getByText('Departamento Lomas').first().click();
    await p.locator('[data-items-pendientes="pr-1"]').click();
    const modal = p.locator('[data-modal="items-pendientes"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await modal.locator('[data-pendiente="it-a"] input').check();
    await modal.getByRole('button', { name: /Agregar 1 ítem a la cotización/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
    // Un renglón escrito a mano, sin ítem, se arrastra sobre el del ítem.
    await p.getByRole('button', { name: '+ A mano' }).click();
    await p.locator('[data-campo="nombre-1"]').fill('Puerta extra');
    await p.locator('[data-campo="cantidad-1"]').fill('2');
    await p.waitForTimeout(200);
    await p.locator('[data-renglon="1"]').dragTo(p.locator('[data-renglon="0"]'));
    await p.waitForTimeout(300);
    assert.equal(await p.locator('[data-renglon]').count(), 1);
    assert.equal(await p.locator('[data-campo="cantidad-0"]').inputValue(), '3', '1 del ítem + 2 a mano');
    assert.equal(await p.locator('[data-requerimiento="it-a"]').count(), 1, 'sigue siendo el ítem de la obra');

    await p.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await p.waitForSelector('[data-hoja="aprobada"]', { timeout: 10000 });
    const envio = escrituras.find((e) => /\/cotizaciones\/[^/]+\/aprobar$/.test(e.ruta));
    assert.deepEqual(envio.cuerpo.lineas.map((l) => [l.item_id, l.cantidad]), [['it-a', 1], [null, 2]], 'el ítem se aprueba y las dos de más nacen nuevas');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
