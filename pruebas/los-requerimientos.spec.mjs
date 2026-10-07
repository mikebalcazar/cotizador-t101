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
import { preciosEsperados } from './cargos.mjs';

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
    // Lo escrito es la base; al cliente va con indirectos, comisiones y flete repartido (3-oct-2026).
    const [reqEsp, manoEsp] = preciosEsperados([{ base: 1500, qty: 1 }, { base: 800, qty: 1 }]);
    assert.equal(req.precio, reqEsp * 100, 'y su precio al cliente en centavos');
    assert.equal(req.cantidad, 1);
    assert.equal(mano.item_id, null, 'el escrito a mano no es de ningún ítem: nace nuevo');
    assert.equal(mano.tipo, 'servicio', 'con su tipo');
    assert.equal(mano.precio, manoEsp * 100, 'también con sus cargos encima');
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

test('el requerimiento se arma por componentes: sale su costo y al aprobar sigue siendo ese ítem', async () => {
  /* Mike, 7-oct-2026: «Quiero poder editar un requerimiento para sacar su
   * costo y generarlo con el cotizador por componentes». */
  const { ctx, p, errores, escrituras, dialogos } = await abrirApp();
  try {
    await editarCotizacion(p);
    const boton = p.locator('[data-armar-requerimiento="0"]');
    assert.equal(await boton.count(), 1, 'el requerimiento trae «armar por componentes»');
    assert.equal(await p.locator('[data-armar-requerimiento="1"]').count(), 0, 'el renglón a mano que no es de la obra, no');

    // Abrirlo y salir sin componentes no le cambia nada: sigue a mano, con su precio.
    await p.locator('[data-campo="precio-0"]').fill('1500');
    await boton.click();
    await p.getByRole('button', { name: '\u2713 Guardar cambios' }).first().click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    assert.equal(await p.locator('[data-renglon="0"]').getAttribute('data-tipo'), 'manual', 'sin componentes se queda a mano');
    assert.equal(await p.locator('[data-campo="precio-0"]').inputValue(), '1500', 'con el precio que tenía');

    // Ahora sí: un componente de $4,000.
    await p.locator('[data-armar-requerimiento="0"]').click();
    if (!(await p.locator('input[placeholder^="ej: Herraje"]').count())) await p.getByRole('button', { name: 'Especial', exact: true }).click();
    await p.locator('input[placeholder^="ej: Herraje"]').fill('Barra de granito');
    await p.locator('input[placeholder^="ej: Herraje"]').locator('xpath=ancestor::div[1]').locator('input[type=number]').first().fill('4000');
    await p.getByRole('button', { name: '+ Agregar concepto' }).click();
    await p.waitForTimeout(150);
    await p.getByRole('button', { name: /Guardar mueble →/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]');

    const fila = p.locator('[data-renglon="0"]');
    assert.equal(await fila.getAttribute('data-tipo'), 'mueble', 'ya no es a mano: es un mueble armado');
    assert.equal(await p.locator('[data-requerimiento="it-1"]').count(), 1, 'y sigue diciendo que es el requerimiento de la obra');
    assert.match(await fila.innerText(), /Armado: .*Barra de granito/, 'con su armado');
    assert.equal(await p.locator('[data-campo="nombre-0"]').inputValue(), 'Barra de la cocina', 'sin perder su nombre');
    assert.equal(await p.locator('[data-campo="codigo-0"]').inputValue(), 'RQ-01', 'ni su código');
    const unit = Number((await p.locator('[data-precio="0"]').innerText()).replace(/[^\d.]/g, ''));
    assert.ok(unit > 4000, `el precio al cliente sale del costo de $4,000 con los cargos encima: ${unit}`);
    assert.equal(await p.locator('[data-campo="tipo-0"]').count(), 1, 'el tipo se sigue escogiendo');
    await p.locator('[data-campo="tipo-0"]').selectOption('acabado');
    await p.waitForTimeout(900);

    const guardado = [...escrituras].reverse().find((e) => e.metodo === 'PATCH' && /\/cotizaciones\/q-1$/.test(e.ruta));
    const m0 = guardado.cuerpo.datos.versiones[0].muebles[0];
    assert.equal(m0.item_id, 'it-1', 'se guarda con su item_id');
    assert.equal(m0.manual, undefined, 'ya sin la marca de «a mano»');
    assert.equal(m0.total, 4000, 'su total es el costo de los componentes');
    assert.equal(m0.componentes.length, 1);

    await p.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await p.waitForSelector('[data-hoja="aprobada"]', { timeout: 10000 });
    assert.ok(/se aprueba 1 requerimiento de la obra/.test(dialogos.join('\n')), dialogos.join(' | '));
    const envio = escrituras.find((e) => /\/cotizaciones\/q-1\/aprobar$/.test(e.ruta));
    const req = envio.cuerpo.lineas.find((l) => l.item_id === 'it-1');
    assert.ok(req, 'la línea del requerimiento viaja con su item_id: se aprueba ése, no nace otro');
    assert.equal(req.tipo, 'acabado', 'con el tipo escogido, aunque ya sea armado');
    assert.equal(req.precio, Math.round(unit * 100), 'y el precio que se ve en la hoja');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

/* Un PNG de 1×1: basta con que sea una imagen. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('al requerimiento o concepto escrito a mano se le agrega una imagen, se guarda y se quita', async () => {
  /* Mike, 7-oct-2026: «quiero poder agregar una imagen al requerimiento o
   * concepto en caso de que no sea generado desde el cotizador». */
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    await editarCotizacion(p);
    assert.equal(await p.locator('[data-campo="imagen-0"]').count(), 1, 'el requerimiento trae «+ imagen»');
    assert.equal(await p.locator('[data-campo="imagen-1"]').count(), 1, 'y el concepto escrito a mano también');
    await p.locator('[data-campo="imagen-0"]').setInputFiles({ name: 'barra.png', mimeType: 'image/png', buffer: PNG });
    await p.locator('[data-imagen-renglon="0-0"]').waitFor({ timeout: 5000 });
    // Arrastrada sobre el renglón también entra, y no agrupa renglones.
    await p.locator('[data-renglon="1"]').evaluate((el, b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'foto.png', { type: 'image/png' }));
      for (const tipo of ['dragover', 'drop']) el.dispatchEvent(new DragEvent(tipo, { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, PNG.toString('base64'));
    await p.locator('[data-imagen-renglon="1-0"]').waitFor({ timeout: 5000 });
    assert.equal(await p.locator('[data-renglon]').count(), 2, 'soltar una foto no junta renglones');
    await p.waitForTimeout(900);

    const guardado = () => [...escrituras].reverse().find((e) => e.metodo === 'PATCH' && /\/cotizaciones\/q-1$/.test(e.ruta));
    const [m0, m1] = guardado().cuerpo.datos.versiones[0].muebles;
    assert.equal(m0.imagenes.length, 1, 'la imagen del requerimiento se guarda en su renglón');
    assert.equal(m0.item_id, 'it-1', 'sin perder el item_id');
    assert.equal(m1.imagenes.length, 1, 'y la del concepto en el suyo');

    await p.locator('[data-quitar-imagen="0-0"]').click();
    await p.waitForTimeout(900);
    assert.equal(await p.locator('[data-imagen-renglon="0-0"]').count(), 0, 'se quita');
    assert.equal(guardado().cuerpo.datos.versiones[0].muebles[0].imagenes.length, 0, 'y se guarda sin ella');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('las notas internas: se guardan, salen en el PDF interno, nunca en lo del cliente, y viajan al aprobar', async () => {
  /* Mike, 7-oct-2026: «un campo para agregar notas locales (no se presentan
   * al cliente) que aparezcan cuando revisamos las cotizaciones o cuando
   * exportamos el PDF para interno. Esas mismas notas aparecen en quell
   * cuando se autoriza el requerimiento». */
  const { ctx, p, errores, escrituras } = await abrirApp();
  const NOTA = 'Usar la chapa que sobró de la cocina';
  try {
    await editarCotizacion(p);
    assert.equal(await p.locator('[data-campo="notas-internas-0"]').count(), 1, 'el requerimiento trae su campo de notas internas');
    assert.equal(await p.locator('[data-campo="notas-internas-1"]').count(), 1, 'y el concepto a mano también');
    await p.locator('[data-campo="precio-0"]').fill('1500');
    await p.locator('[data-campo="notas-internas-0"]').fill(NOTA);
    await p.waitForTimeout(900);
    const guardado = [...escrituras].reverse().find((e) => e.metodo === 'PATCH' && /\/cotizaciones\/q-1$/.test(e.ruta));
    assert.equal(guardado.cuerpo.datos.versiones[0].muebles[0].notas_internas, NOTA, 'se guarda en su renglón');

    const [interno] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'PDF interno' }).click()]);
    await interno.waitForLoadState();
    assert.ok((await interno.content()).includes(NOTA), 'el PDF interno la trae');
    await interno.close();

    const [cliente] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'PDF cliente con condiciones' }).click()]);
    await cliente.waitForLoadState();
    assert.ok(!(await cliente.content()).includes(NOTA), 'el PDF del cliente no');
    await cliente.close();
    const [hoja] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'Imprimir / PDF' }).click()]);
    await hoja.waitForLoadState();
    assert.ok(!(await hoja.content()).includes(NOTA), 'ni la hoja impresa');
    await hoja.close();

    await p.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await p.waitForSelector('[data-hoja="aprobada"]', { timeout: 10000 });
    const envio = escrituras.find((e) => /\/cotizaciones\/q-1\/aprobar$/.test(e.ruta));
    const [req, mano] = envio.cuerpo.lineas;
    assert.equal(req.notas_internas, NOTA, 'al aprobar viaja con la línea del requerimiento: la suite la escribe en su bitácora');
    assert.equal(mano.notas_internas, null, 'sin nota, nada');
    assert.ok(!String(req.descripcion || '').includes(NOTA), 'y no se mezcla con la descripción, que ve el cliente');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
