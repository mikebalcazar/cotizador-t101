/* El armador sobre plano.
 *
 * Mike, 23-sep-2026: «Cuando le des en agregar mueble, ahora te va a dar la
 * opción de subir plano/imagen. Al subirlo, vamos a usar un sistema similar al
 * de quell para agregar items, pero en este caso vamos a agregar los
 * componentes sobre el plano/foto. Y a la derecha se va a desplegar el menú de
 * los diferentes componentes para poder configurarlo».
 *
 * Lo que se mide: que el componente quede donde se tocó (y se guarde así),
 * que lo agregado sin tocar no invente un lugar, que el plano suba a la suite
 * como las fotos —en `datos` sólo su dirección—, y que al volver a abrir un
 * mueble estén todos sus componentes, en su lugar, y se puedan quitar.
 *
 *     node --test pruebas/el-plano.spec.mjs
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
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
    res.end(cuerpo);
  } catch { res.writeHead(404).end('no está'); }
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });

/* Un mueble armado de $10,000 de costo, dos piezas, con los tres cargos
 * prendidos: el caso de todos los días. Y tres versiones guardadas, para ver
 * que el historial ya no se ofrece. */
const MUEBLE = {
  id: 'm-1', nombre: 'Cocina integral', qty: 2, total: 10000,
  componentes: [{ id: 'c-1', modulo: 'Gabinete', desc: 'Base 60', tags: [], extras: [], unitario: 10000, qty: 1, subtotal: 10000 }],
  perfil: { int: { formato: '18mm', acabado: 'laminado', chapa: null }, fre: { formato: '18mm', acabado: 'laminado', chapa: null } },
  imagenes: [],
};
const VERSION = { muebles: [MUEBLE], usaFlete: true, usaArq: true, usaTDC: true, descuento: 0, fecha: '2026-09-20T12:00:00Z' };
const CLIENTE = { id: 'cl-1', nombre: 'Casa Muestra', negocio_id: 'n-1' };
const PROYECTO = { id: 'pr-1', nombre: 'Departamento Lomas', cliente_id: 'cl-1', negocio_id: 'n-1' };
const COTIZACION = {
  id: 'q-1', folio: 'C-0007', cliente_id: 'cl-1', negocio_id: 'n-1', total: 2000000,
  datos: { nombre: 'Corrida 1', proyecto_id: 'pr-1', versiones: [VERSION, { ...VERSION, fecha: '2026-09-19T12:00:00Z' }, { ...VERSION, fecha: '2026-09-18T12:00:00Z' }] },
};
const PRODUCTO = { id: 'pd-1', negocio_id: 'n-1', codigo: 'PT-STD', nombre: 'Puerta estándar', descripcion: 'Tambor 90×210, chapa de encino', precio: 250000, moneda: 'MXN' };

async function abrirApp({ cotizacion = COTIZACION } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errores = [];
  const escrituras = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  let n = 0;
  await p.route('**/s101/**', (route) => {
    const u = new URL(route.request().url());
    const r = u.pathname.replace(/^\/s101/, '');
    const metodo = route.request().method();
    if (metodo !== 'GET') {
      let cuerpo = null;
      try { cuerpo = route.request().postDataJSON(); } catch { /* multipart: una foto o un plano */ }
      escrituras.push({ metodo, ruta: r, cuerpo });
      if (/\/aprobar$/.test(r)) {
        const piezas = cuerpo.lineas.reduce((s, l) => s + l.cantidad, 0);
        return route.fulfill({ ...ok({ cotizacion: { id: 'q-1', estado: 'aceptada', datos: { aprobacion: { at: '2026-09-23T18:00:00Z', items: piezas } } }, items: piezas, productos_nuevos: 1 }), status: 201 });
      }
      return route.fulfill({ ...ok({ id: 'nuevo-' + (++n), folio: 'C-0099', ...(cuerpo || {}) }), status: metodo === 'POST' ? 201 : 200 });
    }
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
    if (r === '/orgs/org-1/negocios') return route.fulfill(ok({ filas: [{ id: 'n-1', nombre: 'Taller', moneda: 'MXN' }] }));
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: [CLIENTE] }));
    if (r === '/orgs/org-1/proyectos') return route.fulfill(ok({ filas: [PROYECTO] }));
    if (r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [cotizacion] }));
    if (r === '/orgs/org-1/productos') return route.fulfill(ok({ filas: [PRODUCTO] }));
    // Lo que se subió (un plano, una foto) se vuelve a pedir como imagen.
    if (/\/archivos\//.test(r)) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PLANO_GRIS.split(',')[1], 'base64') });
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  return { ctx, p, errores, escrituras };
}

async function alProyecto(p) {
  await p.getByText('Casa Muestra').first().click();
  await p.waitForTimeout(400);
  await p.getByText('Departamento Lomas').first().click();
  await p.waitForTimeout(400);
}
async function abrirCotizacion(p) {
  await alProyecto(p);
  await p.getByText('Corrida 1').first().click();
  await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
}
const pesos = (t) => Number(String(t).replace(/[^0-9.\-]/g, ''));
const leer = (p, sel) => p.locator(sel).first().innerText().then(pesos);
/** La última versión guardada de la cotización, tal como se mandó a la suite. */
const ultimaVersion = (escrituras) => {
  const w = escrituras.filter((e) => /\/cotizaciones/.test(e.ruta) && e.cuerpo?.datos?.versiones).pop();
  return w?.cuerpo.datos.versiones[0];
};


const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');
const PLANO_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

/** Recorre el perfil del mueble con lo más común: 18 mm, prelaminado. */
async function perfilComun(p, nombre) {
  if (nombre) {
    await p.locator('input[placeholder^="ej: Closet"]').fill(nombre);
    await p.locator('input[placeholder^="ej: Closet"]').press('Enter');
  }
  await p.getByRole('button', { name: '18mm', exact: true }).first().click();
  await p.getByRole('button', { name: 'Prelaminado', exact: true }).first().click();
  await p.waitForTimeout(150);
  await p.getByRole('button', { name: 'Prelaminado', exact: true }).last().click();
  await p.getByRole('button', { name: /Continuar a componentes/ }).click();
}
async function especial(p, nombre, costo) {
  if (!(await p.locator('input[placeholder^="ej: Herraje"]').count())) await p.getByRole('button', { name: 'Especial', exact: true }).click();
  await p.locator('input[placeholder^="ej: Herraje"]').fill(nombre);
  await p.locator('input[placeholder^="ej: Herraje"]').locator('xpath=ancestor::div[1]').locator('input[type=number]').first().fill(String(costo));
  await p.getByRole('button', { name: '+ Agregar concepto' }).click();
  await p.waitForTimeout(150);
}
/** Espera a que la suite reciba el guardado que cumple `listo`, en vez de
 *  contar segundos. El 23-sep, en la máquina de publicar, 1.2 s no alcanzaron
 *  para subir el plano y guardar la cotización, y la prueba tronó sin que la
 *  app hiciera nada mal. */
async function esperarMueble(escrituras, i, listo = () => true, ms = 20000) {
  const fin = Date.now() + ms;
  for (;;) {
    const m = ultimaVersion(escrituras)?.muebles?.[i];
    if (m && listo(m)) return m;
    if (Date.now() > fin) assert.fail(`la suite no recibió el guardado esperado del mueble ${i}; lo último: ${JSON.stringify(m ?? null).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}
const pct = (estilo) => Number(/([\d.]+)%/.exec(estilo || '')?.[1]);

test('agregar mueble: se sube el plano y cada componente queda donde se tocó', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    await abrirCotizacion(p);
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    await p.getByRole('button', { name: '+ Agregar mueble' }).first().click();
    await p.locator('[data-armador="subir-plano"]').waitFor({ state: 'attached' });
    assert.ok(/Plano o imagen del mueble/i.test(await p.locator('body').innerText()), 'lo primero es ofrecer el plano');
    await p.locator('[data-armador="subir-plano"]').setInputFiles({ name: 'closet.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForSelector('[data-armador="vista-previa"]');
    await p.getByRole('button', { name: /Continuar con este plano/ }).click();
    await perfilComun(p, 'Closet recámara');

    await p.waitForSelector('[data-armador="con-plano"]');
    assert.ok(/Toca el plano/.test(await p.locator('[data-armador="aviso"]').innerText()));
    const img = p.locator('[data-armador="lienzo"] img');
    const caja = await img.boundingBox();
    await img.click({ position: { x: caja.width * 0.3, y: caja.height * 0.4 } });
    assert.ok(/Configurando el componente 1/.test(await p.locator('[data-armador="aviso"]').innerText()), 'el plano dice que ahora toca escoger el componente');
    assert.equal(await p.locator('[data-marca="1"]').count(), 1);

    await especial(p, 'Jaladera de piso', 500);
    const pin = p.locator('[data-pin="1"]');
    assert.equal(await pin.count(), 1, 'el componente quedó como punto 1');
    const estilo = await pin.getAttribute('style');
    assert.ok(Math.abs(pct(/left:\s*([\d.]+%)/.exec(estilo)[1]) - 30) < 1.5, 'en el 30% del ancho: ' + estilo);
    assert.ok(Math.abs(pct(/top:\s*([\d.]+%)/.exec(estilo)[1]) - 40) < 1.5, 'y el 40% del alto');
    assert.equal(await p.locator('[data-marca]').count(), 0, 'el marcador ya se volvió componente');

    await especial(p, 'Tornillería', 100);
    assert.equal(await p.locator('[data-pin="2"]').count(), 0, 'lo que se agrega sin tocar no inventa un lugar');
    assert.equal(await p.locator('[data-componente]').count(), 2, 'pero sí queda en la lista');

    await p.getByRole('button', { name: /Agregar mueble →/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    assert.equal(await p.locator('[data-campo="nombre-1"]').inputValue(), 'Closet recámara');
    const m = await esperarMueble(escrituras, 1, (x) => x.plano);
    assert.ok(escrituras.some((e) => e.metodo === 'POST' && e.ruta === '/orgs/org-1/archivos'), 'el plano se subió a la suite');
    assert.ok(m.plano && !String(m.plano.src).startsWith('data:'), 'en datos sólo va la dirección del plano');
    assert.equal(m.plano.nombre, 'closet.png');
    assert.ok(Math.abs(m.componentes[0].pos.x - 0.3) < 0.015 && Math.abs(m.componentes[0].pos.y - 0.4) < 0.015, 'la posición se guarda como fracción');
    assert.equal(m.componentes[1].pos, undefined);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('al volver a abrir un mueble están todos sus componentes, en su lugar, y se pueden quitar', async () => {
  const conPlano = {
    ...MUEBLE, nombre: 'Closet con plano', qty: 1, total: 600, plano: { src: PLANO_URL, ancho: 1, alto: 1, nombre: 'closet.png' },
    componentes: [
      { id: 'c-a', modulo: 'Especial', desc: 'Jaladera', tags: [], extras: [], unitario: 500, qty: 1, subtotal: 500, pos: { x: 0.25, y: 0.5 } },
      { id: 'c-b', modulo: 'Especial', desc: 'Tornillería', tags: [], extras: [], unitario: 100, qty: 1, subtotal: 100 },
    ],
  };
  const cot = { ...COTIZACION, datos: { ...COTIZACION.datos, versiones: [{ ...VERSION, muebles: [conPlano] }] } };
  const { ctx, p, errores, escrituras } = await abrirApp({ cotizacion: cot });
  try {
    await abrirCotizacion(p);
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    await p.getByRole('button', { name: 'abrir el armador' }).click();
    await perfilComun(p, null);
    await p.waitForSelector('[data-armador="con-plano"]');
    assert.equal(await p.locator('[data-componente]').count(), 2, 'los dos componentes que ya tenía');
    assert.equal(await p.locator('[data-pin="1"]').count(), 1, 'el ubicado, en el plano');
    await p.locator('[data-pin="1"]').click();
    assert.equal(await p.locator('[data-componente="1"].arm-sel').count(), 1, 'tocar el punto señala su componente');

    await p.locator('[data-componente="2"]').getByRole('button', { name: '\u2715' }).click();
    await p.getByRole('button', { name: /Guardar mueble →/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    const m = await esperarMueble(escrituras, 0, (x) => x.componentes.length === 1);
    assert.equal(m.componentes.length, 1, 'se quitó, no se duplicó lo que ya había');
    assert.equal(m.componentes[0].desc, 'Jaladera');
    assert.equal(m.total, 500, 'y el costo del mueble es el de lo que quedó');
    assert.deepEqual(m.componentes[0].pos, { x: 0.25, y: 0.5 });
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('sin plano, el armador es el de siempre y el plano se puede subir después', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    await abrirCotizacion(p);
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    await p.getByRole('button', { name: '+ Agregar mueble' }).first().click();
    await p.getByRole('button', { name: /Seguir sin plano/ }).click();
    await perfilComun(p, 'Repisa');
    assert.equal(await p.locator('[data-armador="con-plano"]').count(), 0, 'sin plano no hay visor');
    await especial(p, 'Repisa flotante', 800);
    await p.locator('[data-armador="subir-plano"]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForSelector('[data-armador="con-plano"]');
    assert.equal(await p.locator('[data-componente]').count(), 1, 'lo ya agregado sigue ahí');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('se ponen todos los componentes primero y se configuran al final: rojo sin configurar, azul confirmado', async () => {
  /* Mike, 23-sep: «Quiero poder agregar todos los marcadores de los
   * componentes sin necesidad de irlos configurando, y ya al final
   * configurarlos». Y: «el ícono que sea un circulito con el número de
   * componente. Y que se ponga en rojo si no tiene información y en azul si
   * ya está confirmado». */
  const { ctx, p, errores, escrituras } = await abrirApp();
  const dialogos = [];
  p.on('dialog', (d) => { dialogos.push(d.message()); d.accept(); });
  try {
    await abrirCotizacion(p);
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    await p.getByRole('button', { name: '+ Agregar mueble' }).first().click();
    await p.locator('[data-armador="subir-plano"]').setInputFiles({ name: 'cocina.png', mimeType: 'image/png', buffer: PNG });
    await p.getByRole('button', { name: /Continuar con este plano/ }).click();
    await perfilComun(p, 'Cocina');
    const img = p.locator('[data-armador="lienzo"] img');
    const caja = await img.boundingBox();
    for (const [x, y] of [[0.2, 0.2], [0.5, 0.5], [0.8, 0.3], [0.9, 0.9]]) await img.click({ position: { x: caja.width * x, y: caja.height * y } });
    assert.deepEqual(await p.locator('[data-marca]').evaluateAll((e) => e.map((x) => x.textContent)), ['1', '2', '3', '4'], 'cuatro circulitos numerados, sin configurar nada');
    assert.equal(await p.locator('[data-componente]').count(), 0, 'y ningún componente todavía');
    const color = (sel) => p.locator(sel).evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).borderRadius]);
    assert.deepEqual(await color('[data-marca="2"]'), ['rgb(217, 48, 37)', '50%'], 'rojo y redondo mientras no tiene información');
    assert.ok(/4 componentes sin configurar/.test(await p.locator('[data-armador="por-configurar"]').innerText()));

    // Uno sobraba: se quita.
    await p.locator('[data-marca-lista="4"]').getByRole('button').click();
    assert.equal(await p.locator('[data-marca]').count(), 3);

    // Se configuran en orden: el 1, y luego pasa solo al 2.
    assert.ok(/componente 1/.test(await p.locator('[data-armador="aviso"]').innerText()), 'arranca por el primero');
    await especial(p, 'Gabinete alto', 900);
    assert.equal(await p.locator('[data-marca="1"]').count(), 0, 'el 1 ya no está pendiente');
    assert.deepEqual(await color('[data-pin="1"]'), ['rgb(0, 128, 193)', '50%'], 'se volvió azul, con el mismo número');
    assert.ok(/componente 2/.test(await p.locator('[data-armador="aviso"]').innerText()), 'y pasa solo al siguiente');
    // Pero se puede escoger cualquiera: el 3 antes que el 2.
    await p.locator('[data-marca="3"]').click();
    assert.ok(/componente 3/.test(await p.locator('[data-armador="aviso"]').innerText()));
    await especial(p, 'Alacena', 700);
    assert.equal(await p.locator('[data-pin="3"]').count(), 1, 'la alacena es el 3, no el 2: el número es del lugar, no del orden en que se configura');
    assert.deepEqual(await p.locator('[data-marca]').evaluateAll((e) => e.map((x) => x.textContent)), ['2'], 'queda el 2 en rojo');
    const estiloAlacena = await p.locator('[data-pin="3"]').getAttribute('style');
    const lugar = (k) => Number(new RegExp(k + ':\\s*([\\d.]+)%').exec(estiloAlacena)[1]);
    assert.ok(Math.abs(lugar('left') - 80) < 1.5 && Math.abs(lugar('top') - 30) < 1.5, 'donde estaba el 3: ' + estiloAlacena);
    assert.ok(/\b3\b/.test(await p.locator('[data-componente="2"] .arm-num').innerText()), 'y en la lista dice 3');

    // El 2 se queda sin configurar: guardar lo avisa y lo descarta.
    await p.getByRole('button', { name: /Agregar mueble →/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    assert.ok(dialogos.some((d) => /Quedan 1 componente sin configurar en el plano \(2\)/.test(d)), 'avisó del que faltaba');
    const m = await esperarMueble(escrituras, 1);
    assert.deepEqual(m.componentes.map((c) => [c.desc, c.marca]), [['Gabinete alto', 1], ['Alacena', 3]], 'cada uno con su número');
    assert.ok(Math.abs(m.componentes[1].pos.x - 0.8) < 0.015 && Math.abs(m.componentes[1].pos.y - 0.3) < 0.015);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('si se publica una versión nueva con la pestaña abierta, el cotizador lo avisa', async () => {
  /* Lo que le pasó a Mike con G87: probó en una pestaña abierta desde antes
   * y le funcionaba como la versión anterior. Se revisa al volver a la
   * pestaña (visibilitychange) y cada 2 minutos. */
  const { ctx, p, errores } = await abrirApp();
  try {
    // Se cuenta cuántas veces pregunta la app, para no depender del reloj:
    // bajo carga, la primera pregunta puede tardar más que cualquier espera fija.
    let huella = 'a'.repeat(64), preguntas = 0;
    await p.route('**/huella.txt', (r) => { preguntas++; return r.fulfill({ status: 200, contentType: 'text/plain', body: huella + '\n' }); });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10);
    // Recargar corta lo que la página de antes seguía pidiendo, y eso sale
    // como «Failed to fetch». No es de esta prueba: se cuentan los errores
    // de la página nueva, hasta antes de que «Recargar» la cambie otra vez.
    errores.length = 0;
    const hasta = async (cond, ms = 15000) => { const fin = Date.now() + ms; while (!(await cond())) { if (Date.now() > fin) assert.fail('no pasó a tiempo'); await p.waitForTimeout(50); } };
    await hasta(() => preguntas >= 1);
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await hasta(() => preguntas >= 2);
    await p.waitForTimeout(200);
    assert.equal(await p.locator('[data-version-nueva]').count(), 0, 'con la misma versión, nada');
    huella = 'b'.repeat(64);
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await p.waitForSelector('[data-version-nueva]', { timeout: 10000 });
    assert.ok(/versión nueva/.test(await p.locator('[data-version-nueva]').innerText()));
    const erroresAntes = [...errores];
    await Promise.all([p.waitForEvent('load'), p.getByRole('button', { name: 'Recargar' }).click()]);
    assert.deepEqual(erroresAntes, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('la rueda acerca donde está el cursor, y el botón central mueve el plano', async () => {
  /* Mike, 23-sep: «en el plano, necesito poder hacer zoom con el scroll y
   * panear con click central». */
  const { ctx, p, errores } = await abrirApp();
  try {
    await abrirCotizacion(p);
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    await p.getByRole('button', { name: '+ Agregar mueble' }).first().click();
    await p.locator('[data-armador="subir-plano"]').setInputFiles({ name: 'cocina.png', mimeType: 'image/png', buffer: PNG });
    await p.getByRole('button', { name: /Continuar con este plano/ }).click();
    await perfilComun(p, 'Cocina');
    const visor = p.locator('[data-armador="visor"]');
    const img = p.locator('[data-armador="lienzo"] img');
    const v = await visor.boundingBox();
    // Un punto del plano, a un cuarto del ancho y a un tercio del alto visible.
    const cx = v.x + v.width * 0.25, cy = v.y + Math.min(v.height, (await img.boundingBox()).height) * 0.33;
    const fraccion = async () => { const b = await img.boundingBox(); return [(cx - b.x) / b.width, (cy - b.y) / b.height]; };
    const antes = await fraccion();
    const yAntes = await p.evaluate(() => window.scrollY);
    await p.mouse.move(cx, cy);
    for (let k = 0; k < 4; k++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(60); }
    await p.waitForTimeout(200);
    const zoom = Number(await p.locator('[data-armador="lienzo"]').getAttribute('data-zoom'));
    assert.ok(zoom > 2, 'la rueda hacia arriba acerca (zoom ' + zoom + ')');
    const despues = await fraccion();
    assert.ok(Math.abs(despues[0] - antes[0]) < 0.02 && Math.abs(despues[1] - antes[1]) < 0.02, 'el punto bajo el cursor se queda quieto: ' + antes + ' → ' + despues);
    assert.equal(await p.evaluate(() => window.scrollY), yAntes, 'y la página no se desplazó');

    const scroll = () => visor.evaluate((e) => [e.scrollLeft, e.scrollTop]);
    const s0 = await scroll();
    await p.mouse.down({ button: 'middle' });
    await p.mouse.move(cx - 120, cy - 60, { steps: 6 });
    await p.mouse.up({ button: 'middle' });
    const s1 = await scroll();
    assert.ok(s1[0] - s0[0] > 100 && s1[1] - s0[1] > 40, 'arrastrar con el botón central mueve el plano: ' + s0 + ' → ' + s1);
    assert.equal(await p.locator('[data-marca]').count(), 0, 'y no pone marcadores');

    for (let k = 0; k < 10; k++) await p.mouse.wheel(0, 400);
    await p.waitForTimeout(200);
    assert.equal(await p.locator('[data-armador="lienzo"]').getAttribute('data-zoom'), '1.000', 'alejar no pasa de ver el plano completo');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

/* Mike, 24-sep: «Cuando ya tengo un mueble terminado, si quiero editar un
 * componente no puedo. Quería quitarle el led a un entrepaño y no hay
 * manera. Y de hecho me sobreescribe el ícono que coloqué». */
/* Un plano gris de 400×300 que sí carga: medir sobre una imagen rota es
 * medir sobre nada. */
const PLANO_GRIS = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAZAAAAEsCAIAAABi1XKVAAAC8UlEQVR42u3UQREAAAzCMPyLRQM6tksk9NEU4IhIABgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFmBYAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWYFgSAIYFYFiAYQEYFoBhAYYFYFgAhgUYFoBhARgWYFgAhgVgWIBhARgWgGEBhgVgWACGBRgWgGEBGBZgWACGBWBYgGEBGBZgWACGBWBYgGEBGBaAYQGGBWBYAIYFGBaAYQEYFvDZADrBrBbpJi6LAAAAAElFTkSuQmCC';
const ARMADO = {
  ...MUEBLE, nombre: 'Closet con LED', qty: 1, plano: { src: PLANO_GRIS, ancho: 400, alto: 300, nombre: 'closet.png' },
  componentes: [
    { id: 'c-j', marca: 1, modulo: 'Especial', desc: 'Jaladera', tags: [], extras: [], unitario: 500, qty: 1, subtotal: 500, pos: { x: 0.2, y: 0.5 } },
    { id: 'c-e', marca: 2, modulo: 'Entrepaño', desc: 'Fondo 40cm · 18mm · 1.2ml × 2', tags: ['Prelaminado'], extras: ['💡 LED'], unitario: 1000, ledUnitario: 1800, ledSubtotal: 4320, qty: 2.4, subtotal: 6720, pos: { x: 0.7, y: 0.4 } },
  ],
};
ARMADO.total = 500 + 6720;
async function alArmadorDe(p, mueble) {
  await abrirCotizacion(p);
  await p.getByRole('button', { name: /Editar cotización/ }).click();
  await p.getByRole('button', { name: 'abrir el armador' }).click();
  await perfilComun(p, null);
  await p.waitForSelector('[data-armador="con-plano"]');
  await p.waitForFunction(() => { const i = document.querySelector('[data-armador="lienzo"] img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 });
}
const cotCon = (mueble) => ({ ...COTIZACION, datos: { ...COTIZACION.datos, versiones: [{ ...VERSION, muebles: [mueble] }] } });

test('se le quita el LED a un entrepaño ya puesto, tocando su círculo', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp({ cotizacion: cotCon(ARMADO) });
  try {
    await alArmadorDe(p, ARMADO);
    await p.locator('[data-pin="2"]').click();
    const editor = p.locator('[data-editor-componente="2"]');
    await editor.waitFor({ timeout: 5000 }).catch(() => {});
    assert.equal(await editor.count(), 1, 'tocar el círculo abre su editor');
    const led = editor.locator('[data-editor="led"]');
    assert.equal(await led.isChecked(), true, 'dice que lleva LED');
    // Primero una pieza más: el LED sigue a la cantidad (antes se perdía su costo).
    await p.locator('[data-componente="2"]').getByRole('button', { name: '+' }).click();
    assert.ok((await p.locator('[data-componente="2"]').innerText()).includes('$9,520'), '3.4 m × ($1,000 + $1,800 de LED)');
    await led.uncheck();
    assert.ok((await p.locator('[data-componente="2"]').innerText()).includes('$3,400'), 'sin LED: 3.4 m × $1,000');
    await editor.locator('[data-editor="listo"]').click();
    await p.getByRole('button', { name: /Guardar mueble →/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    const m = await esperarMueble(escrituras, 0, (x) => x.componentes[1] && !x.componentes[1].extras.length);
    const e = m.componentes[1];
    assert.deepEqual(e.extras, [], 'ya no dice LED');
    assert.equal(e.ledSubtotal, 0);
    assert.equal(e.subtotal, 3400);
    assert.deepEqual([e.marca, e.pos], [2, { x: 0.7, y: 0.4 }], 'sigue en su lugar, con su número');
    assert.equal(m.componentes.length, 2, 'no se agregó nada');
    assert.equal(m.total, 3900, 'y el mueble cuesta lo que quedó');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('un componente se reemplaza por otro y conserva su lugar y su número', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp({ cotizacion: cotCon(ARMADO) });
  try {
    await alArmadorDe(p, ARMADO);
    await p.locator('[data-editar="1"]').click();
    await p.locator('[data-editor-componente="1"] [data-editor="reemplazar"]').click();
    await p.waitForSelector('[data-reemplazando="1"]', { timeout: 5000 });
    await especial(p, 'Jaladera negra', 650);
    assert.equal(await p.locator('[data-reemplazando]').count(), 0, 'el aviso se va al agregar');
    assert.equal(await p.locator('[data-componente]').count(), 2, 'reemplazó: no agregó otro');
    assert.equal(await p.locator('[data-pin]').count(), 2, 'ni otro círculo');
    await p.getByRole('button', { name: /Guardar mueble →/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    const m = await esperarMueble(escrituras, 0, (x) => x.componentes[0]?.desc?.includes('negra'));
    assert.equal(m.componentes.length, 2);
    assert.equal(m.componentes[0].subtotal, 650);
    assert.deepEqual([m.componentes[0].marca, m.componentes[0].pos], [1, { x: 0.2, y: 0.5 }], 'en el lugar y con el número del que reemplazó');
    assert.equal(m.componentes[1].desc, ARMADO.componentes[1].desc, 'el otro no se toca');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('tocar junto a un círculo lo abre, no pone otro encima', async () => {
  const { ctx, p, errores } = await abrirApp({ cotizacion: cotCon(ARMADO) });
  try {
    await alArmadorDe(p, ARMADO);
    const pin = await p.locator('[data-pin="2"]').boundingBox();
    // 17 px a la derecha del centro: fuera del círculo (mide 28), pero junto a él.
    assert.ok(pin.width <= 30, `el círculo mide lo que se cree (${pin.width})`);
    assert.equal(await p.evaluate(({ x, y }) => !!document.elementFromPoint(x, y).closest('.arm-pin'), { x: pin.x + pin.width / 2 + 17, y: pin.y + pin.height / 2 }), false, 'el toque cae fuera del círculo');
    await p.mouse.click(pin.x + pin.width / 2 + 17, pin.y + pin.height / 2);
    assert.equal(await p.locator('[data-marca]').count(), 0, 'no dejó un marcador rojo encima');
    assert.equal(await p.locator('[data-editor-componente="2"]').count(), 1, 'abrió el del círculo');
    // Lejos de todo, sí pone uno nuevo, con el número que sigue.
    const lienzo = await p.locator('[data-armador="lienzo"] img').boundingBox();
    await p.mouse.click(lienzo.x + lienzo.width * 0.45, lienzo.y + lienzo.height * 0.85);
    assert.equal(await p.locator('[data-marca="3"]').count(), 1);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('«Guardar cambios» guarda el plano nuevo y los componentes, y el PDF enseña el plano nuevo', async () => {
  /* Mike, 24-sep: «cuando cambio el plano donde se ubican los componentes por
   * uno más actual no se cambia en el PDF que exporta». «✓ Guardar cambios»
   * guardaba sólo nombre, fotos y perfil. */
  const { ctx, p, errores, escrituras } = await abrirApp({ cotizacion: cotCon(ARMADO) });
  try {
    await alArmadorDe(p, ARMADO);
    const antes = await p.locator('[data-armador="lienzo"] img').getAttribute('src');
    await p.locator('[data-armador="subir-plano"]').setInputFiles({ name: 'plano-nuevo.png', mimeType: 'image/png', buffer: Buffer.from(PLANO_GRIS.split(',')[1], 'base64') });
    await p.waitForFunction((a) => document.querySelector('[data-armador="lienzo"] img').getAttribute('src') !== a, antes, { timeout: 10000 });
    // Y de paso un cambio de componente, que también se perdía: el LED fuera.
    await p.locator('[data-pin="2"]').click();
    await p.locator('[data-editor-componente="2"] [data-editor="led"]').uncheck();
    await p.getByRole('button', { name: /Guardar cambios/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    const m = await esperarMueble(escrituras, 0, (x) => x.plano?.nombre === 'plano-nuevo.png');
    assert.equal(m.plano.nombre, 'plano-nuevo.png', 'se guardó el plano nuevo');
    assert.notEqual(m.plano.src, antes, 'con su propia dirección');
    assert.deepEqual(m.componentes[1].extras, [], 'y el LED quitado');
    assert.equal(m.componentes.length, 2);
    const [pdf] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'PDF cliente con condiciones' }).click()]);
    await pdf.waitForLoadState('domcontentloaded');
    const enPdf = await pdf.locator('[data-plano-cliente] img').getAttribute('src');
    assert.notEqual(enPdf, antes, 'el PDF ya no enseña el plano viejo');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('los círculos se arrastran a otro lugar del plano', async () => {
  /* Mike, 24-sep: «quiero poder mover los iconos de número de los
   * componentes de ubicación». */
  const { ctx, p, errores, escrituras } = await abrirApp({ cotizacion: cotCon(ARMADO) });
  try {
    await alArmadorDe(p, ARMADO);
    const img = await p.locator('[data-armador="lienzo"] img').boundingBox();
    const pin = await p.locator('[data-pin="2"]').boundingBox();
    const a = [img.x + img.width * 0.3, img.y + img.height * 0.6];
    await p.mouse.move(pin.x + pin.width / 2, pin.y + pin.height / 2);
    await p.mouse.down();
    await p.mouse.move(a[0], a[1], { steps: 8 });
    await p.mouse.up();
    assert.equal(await p.locator('[data-marca]').count(), 0, 'arrastrar no deja un marcador');
    assert.equal(await p.locator('[data-editor-componente]').count(), 0, 'ni abre el editor');
    const ahora = await p.locator('[data-pin="2"]').boundingBox();
    assert.ok(Math.abs(ahora.x + ahora.width / 2 - a[0]) < 3 && Math.abs(ahora.y + ahora.height / 2 - a[1]) < 3, 'el círculo quedó donde se soltó');
    // Un toque sigue abriendo el editor.
    await p.locator('[data-pin="2"]').click();
    assert.equal(await p.locator('[data-editor-componente="2"]').count(), 1, 'un toque sin mover abre el editor como siempre');
    // Un marcador rojo también se mueve.
    await p.mouse.click(img.x + img.width * 0.9, img.y + img.height * 0.9);
    const rojo = await p.locator('[data-marca="3"]').boundingBox();
    const b = [img.x + img.width * 0.5, img.y + img.height * 0.2];
    await p.mouse.move(rojo.x + rojo.width / 2, rojo.y + rojo.height / 2);
    await p.mouse.down();
    await p.mouse.move(b[0], b[1], { steps: 8 });
    await p.mouse.up();
    const rojo2 = await p.locator('[data-marca="3"]').boundingBox();
    assert.ok(Math.abs(rojo2.x + rojo2.width / 2 - b[0]) < 3 && Math.abs(rojo2.y + rojo2.height / 2 - b[1]) < 3, 'el marcador rojo también');
    assert.equal(await p.locator('[data-marca]').count(), 1, 'sin marcadores de más');
    p.on('dialog', (d) => d.accept());
    await p.getByRole('button', { name: /Guardar mueble →/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    const m = await esperarMueble(escrituras, 0, (x) => Math.abs(x.componentes[1].pos.x - 0.3) < 0.02);
    assert.ok(Math.abs(m.componentes[1].pos.x - 0.3) < 0.02 && Math.abs(m.componentes[1].pos.y - 0.6) < 0.02, `se guardó el lugar nuevo (${JSON.stringify(m.componentes[1].pos)})`);
    assert.equal(m.componentes[1].marca, 2, 'con su mismo número');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

/* Mike, 25-sep: «si quiero cambiar el material de los interiores o el
 * material de los frentes, NO me lo cambia y queda el mismo costo. Debería
 * poder configurar eso hasta arriba de la pantalla de componentes […] y que
 * se actualicen en automático en cada componente y sus costos». */
test('recalcular con otros materiales da lo mismo que agregarlo de nuevo con ellos, también en los viejos', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    const r = await p.evaluate(() => {
      const A = { int: { formato: '18mm', acabado: 'laminado', chapa: null }, fre: { formato: '18mm', acabado: 'laminado', chapa: null } };
      const B = { int: { formato: '15mm', acabado: 'chapa', chapa: 'encino' }, fre: { formato: '18mm', acabado: 'chapa', chapa: 'premium' } };
      const C = { int: { formato: '18mm', acabado: 'formaica', chapa: null }, fre: { formato: '18mm', acabado: 'traceless', chapa: null } };
      const casos = [
        ['gabinete', { tipo: '2puertas', jaladera: 'push', etp: 'doble', etpQty: 2, qty: 3 }],
        ['gabinete', { tipo: 'nicho', jaladera: 'ninguna', etp: 'ninguno', qty: 1 }],
        ['cajones', { num: 4, jaladera: 'unero' }],
        ['puerta_gabinete', { jaladera: 'normal', qty: 2 }],
        ['puerta', { tipo: 'corrediza', jaladera: 'ninguna', qty: 2 }],
        ['puerta', { tipo: 'abatible', jaladera: 'push', qty: 1 }],
        ['entrepano', { fondo: '40cm', formato: '18mm', grupos: [{ ml: 1.2, cant: 2, led: true }] }],
        ['poste', { fondo: 'mas60cm', formato: 'tambor4', grupos: [{ ml: 0.9, cant: 1, led: false }] }],
      ];
      const campos = (c) => JSON.stringify([c.modulo, c.desc, c.tags, c.extras, c.unitario, c.qty, c.subtotal, c.ledUnitario || 0]);
      const fallas = [];
      let distintos = 0;
      for (const [tipo, data] of casos) {
        for (const [de, a] of [[A, B], [B, C], [C, A]]) {
          const directo = armarComponentes(tipo, data, a.int, a.fre)[0];
          const conReceta = conMateriales(armarComponentes(tipo, data, de.int, de.fre)[0], a.int, a.fre);
          const { receta, ...sinReceta } = armarComponentes(tipo, data, de.int, de.fre)[0];
          const viejo = conMateriales(sinReceta, a.int, a.fre);
          if (campos(conReceta) !== campos(directo)) fallas.push(['con receta', tipo, campos(conReceta), campos(directo)]);
          if (campos(viejo) !== campos(directo)) fallas.push(['viejo', tipo, campos(viejo), campos(directo)]);
          if (campos(armarComponentes(tipo, data, de.int, de.fre)[0]) !== campos(directo)) distintos++;
        }
      }
      // Lo que no depende de los materiales no se toca.
      const cub = armarComponentes('cubierta', { material: 'laminado', tipo: 'formaica', fondo: '50-60cm', qty: 2 }, A.int, A.fre)[0];
      const cubB = conMateriales(cub, B.int, B.fre);
      return { fallas, distintos, cubierta: campos(cub) === campos(cubB) };
    });
    assert.deepEqual(r.fallas, [], 'recalculado = agregado de nuevo');
    assert.ok(r.distintos >= 10, `y los materiales sí mueven el precio (${r.distintos} casos distintos)`);
    assert.ok(r.cubierta, 'la cubierta no depende de los materiales del mueble');
    assert.deepEqual(errores, []);
  } finally { await ctx.close(); }
});

test('arriba de los componentes se cambian los materiales y cada costo se actualiza', async () => {
  // Un gabinete de antes (sin receta) con un costo viejo, y la jaladera de siempre.
  const gab = { id: 'c-g', marca: 1, modulo: 'Gabinete', desc: 'Gabinete 1 puerta', tags: ['Interior 18mm Prelaminado', 'Frentes 18mm Prelaminado'], extras: ['Jaladera ×1'], unitario: 999, qty: 2, subtotal: 1998, pos: { x: 0.3, y: 0.3 } };
  const mueble = { ...ARMADO, componentes: [gab, ARMADO.componentes[1]] };
  const { ctx, p, errores, escrituras } = await abrirApp({ cotizacion: cotCon(mueble) });
  try {
    await alArmadorDe(p, mueble);
    assert.equal(await p.locator('[data-armador="materiales"]').count(), 1, 'los materiales están arriba de los componentes');
    assert.ok((await p.locator('[data-componente="1"]').innerText()).includes('$1,998'), 'pasar por el perfil sin cambiar nada no mueve precios');
    await p.locator('[data-material="fre-acabado"]').selectOption('chapa');
    await p.locator('[data-material="fre-chapa"]').selectOption('premium');
    const esperado = await p.evaluate(() => {
      const pi = { formato: '18mm', acabado: 'laminado', chapa: null }, pf = { formato: '18mm', acabado: 'chapa', chapa: 'premium' };
      return armarComponentes('gabinete', { tipo: '1puerta', jaladera: 'normal', etp: 'ninguno', etpQty: 1, qty: 2 }, pi, pf)[0];
    });
    // Se espera a que el renglón lo diga, no al reloj: bajo carga el
    // repintado llega después de que el selector cambió.
    const dice = '$' + Math.round(esperado.subtotal).toLocaleString('es-MX');
    await p.waitForFunction((t) => (document.querySelector('[data-componente="1"]')?.innerText || '').includes(t), dice, { timeout: 10000 }).catch(() => {});
    const renglon = await p.locator('[data-componente="1"]').innerText();
    assert.ok(renglon.includes(dice), `el gabinete ya vale con frentes de chapa premium (${esperado.subtotal}): ${renglon}`);
    // Interior también.
    await p.locator('[data-material="int-acabado"]').selectOption('formaica');
    await p.getByRole('button', { name: /Guardar mueble →/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    const m = await esperarMueble(escrituras, 0, (x) => x.perfil?.int?.acabado === 'formaica');
    assert.deepEqual([m.perfil.int.acabado, m.perfil.fre.acabado, m.perfil.fre.chapa], ['formaica', 'chapa', 'premium'], 'se guardan los materiales del mueble');
    const g = m.componentes[0];
    const final = await p.evaluate(() => armarComponentes('gabinete', { tipo: '1puerta', jaladera: 'normal', etp: 'ninguno', etpQty: 1, qty: 2 },
      { formato: '18mm', acabado: 'formaica', chapa: null }, { formato: '18mm', acabado: 'chapa', chapa: 'premium' })[0]);
    assert.equal(g.subtotal, final.subtotal, 'y el gabinete se guarda con su costo nuevo');
    assert.deepEqual(g.tags, final.tags, 'y sus materiales escritos');
    assert.deepEqual([g.marca, g.pos], [1, { x: 0.3, y: 0.3 }], 'en su lugar, con su número');
    const e = m.componentes[1];
    assert.ok(e.unitario !== 1000 && e.ledSubtotal > 0, 'el entrepaño también se recalculó, y conservó su LED');
    assert.equal(m.total, m.componentes.reduce((s, c) => s + c.subtotal, 0), 'el costo del mueble es la suma');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

/** Suelta o pega un archivo en la página como lo haría el navegador. */
async function soltar(p, sel, { nombre, tipo, base64 }) {
  await p.locator(sel).evaluate((el, a) => {
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0))], a.nombre, { type: a.tipo }));
    el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, { nombre, tipo, base64 });
}
async function pegar(p, { nombre, tipo, base64, texto }) {
  await p.evaluate((a) => {
    const dt = new DataTransfer();
    if (a.texto) dt.setData('text/plain', a.texto);
    else dt.items.add(new File([Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0))], a.nombre, { type: a.tipo }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
  }, { nombre, tipo, base64, texto });
}
async function alPasoPlano(p) {
  await abrirCotizacion(p);
  await p.getByRole('button', { name: /Editar cotización/ }).click();
  await p.getByRole('button', { name: '+ Agregar mueble' }).first().click();
  await p.locator('[data-armador="zona-plano"]').waitFor({ timeout: 10000 }).catch(() => {});
}

test('el plano se puede arrastrar a «Agregar mueble»', async () => {
  /* Mike, 24-sep: «Quiero poder arrastrar la imagen o plano para agregarlo
   * al mueble que se va a trabajar». */
  const { ctx, p, errores } = await abrirApp();
  try {
    await alPasoPlano(p);
    assert.equal(await p.locator('[data-armador="zona-plano"]').count(), 1, 'el paso del plano recibe lo que se suelte');
    // Algo que no es plano: se dice, y no se usa.
    await soltar(p, '[data-armador="zona-plano"]', { nombre: 'notas.txt', tipo: 'text/plain', base64: btoa('hola') });
    await p.waitForSelector('[data-armador="aviso-plano"]', { timeout: 5000 });
    assert.equal(await p.locator('[data-armador="vista-previa"]').count(), 0);
    // El plano sí.
    // Se suelta encima del texto de la tarjeta, no en su borde: como cae en la vida real.
    await soltar(p, '[data-armador="zona-plano"] b', { nombre: 'cocina.png', tipo: 'image/png', base64: PNG.toString('base64') });
    await p.waitForSelector('[data-armador="vista-previa"]', { timeout: 10000 });
    assert.equal(await p.locator('[data-armador="aviso-plano"]').count(), 0, 'el aviso se va');
    assert.equal(await p.locator('[data-armador="zona-plano"]').getAttribute('data-arrastrando'), null, 'y el recuadro de «suéltalo aquí» también');
    await p.getByRole('button', { name: /Continuar con este plano/ }).click();
    await perfilComun(p, 'Cocina');
    await p.waitForSelector('[data-armador="con-plano"]', { timeout: 10000 });
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('el plano se puede pegar del portapapeles (Ctrl-V)', async () => {
  /* Mike, 24-sep: «O pegar la imagen o plano que está en el portapapeles». */
  const { ctx, p, errores } = await abrirApp();
  try {
    await alPasoPlano(p);
    // Pegar texto no es asunto del plano.
    await pegar(p, { texto: 'nada que ver' });
    await p.waitForTimeout(300);
    assert.equal(await p.locator('[data-armador="vista-previa"]').count(), 0);
    assert.equal(await p.locator('[data-armador="aviso-plano"]').count(), 0, 'ni se queja');
    await pegar(p, { nombre: 'image.png', tipo: 'image/png', base64: PNG.toString('base64') });
    await p.waitForSelector('[data-armador="vista-previa"]', { timeout: 10000 });
    await p.getByRole('button', { name: /Continuar con este plano/ }).click();
    await perfilComun(p, 'Closet');
    await p.waitForSelector('[data-armador="con-plano"]', { timeout: 10000 });
    /* Ya en el armador, pegar CAMBIA el plano, igual que «Cambiar» (Mike,
     * 25-sep: «si quiero cambiar de plano en los componentes […] quiero que
     * funcione igual que cuando lo agrego por primera vez»). */
    const antes = await p.locator('[data-armador="lienzo"] img').getAttribute('src');
    await pegar(p, { nombre: 'otra.png', tipo: 'image/png', base64: PLANO_GRIS.split(',')[1] });
    await p.waitForFunction((a) => document.querySelector('[data-armador="lienzo"] img').getAttribute('src') !== a, antes, { timeout: 10000 });
    assert.ok(/otra\.png/.test(await p.locator('[data-armador="con-plano"] .arm-cab b').innerText()), 'el armador ya tiene el plano pegado');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('en el armador, el plano se cambia arrastrando el nuevo encima, sin ir a la carpeta', async () => {
  /* Mike, 25-sep: «Si quiero cambiar de plano en los componentes, le pongo
   * cambiar, pero a fuerzas necesito seleccionarlo de la carpeta». */
  const { ctx, p, errores, escrituras } = await abrirApp({ cotizacion: cotCon(ARMADO) });
  try {
    await alArmadorDe(p, ARMADO);
    const antes = await p.locator('[data-armador="lienzo"] img').getAttribute('src');
    assert.equal(await p.locator('[data-armador="con-plano"] [data-armador="zona-plano"]').count(), 1, 'el lado del plano recibe lo que se suelte');
    // Algo que no es plano: se avisa y el plano se queda.
    await soltar(p, '[data-armador="con-plano"] .arm-cab b', { nombre: 'notas.txt', tipo: 'text/plain', base64: btoa('hola') });
    await p.waitForSelector('[data-armador="aviso-plano"]', { timeout: 5000 });
    assert.equal(await p.locator('[data-armador="lienzo"] img').getAttribute('src'), antes);
    // El plano nuevo, soltado encima del viejo.
    await soltar(p, '[data-armador="lienzo"] img', { nombre: 'plano-v2.png', tipo: 'image/png', base64: PLANO_GRIS.split(',')[1] });
    await p.waitForFunction((a) => document.querySelector('[data-armador="lienzo"] img').getAttribute('src') !== a, antes, { timeout: 10000 });
    assert.equal(await p.locator('[data-armador="aviso-plano"]').count(), 0, 'el aviso se va');
    assert.equal(await p.locator('[data-pin]').count(), 2, 'los componentes siguen en el plano, en su lugar');
    await p.getByRole('button', { name: /Guardar mueble →/ }).click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    const m = await esperarMueble(escrituras, 0, (x) => x.plano?.nombre === 'plano-v2.png');
    assert.equal(m.plano.nombre, 'plano-v2.png');
    assert.equal(m.componentes.length, 2);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('un plano en PDF se lee de su primera página', async () => {
  /* El lector de PDF se baja de internet la primera vez que se usa. Donde el
   * navegador no sale (la máquina del chat) esto no se puede medir y se dice;
   * en la de publicar, `EXIGIR_INTERNET=1` lo vuelve obligatorio. */
  const PDF = Buffer.from('JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MDAgMzAwXSAvQ29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAzMyA+PgpzdHJlYW0KMCAwIDEgUkcgMjAgdyA1MCA1MCBtIDU1MCAyNTAgbCBTCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAowMDAwMDAwMjAyIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNSAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKMjg1CiUlRU9GCg==', 'base64');
  const { ctx, p, errores } = await abrirApp();
  try {
    await abrirCotizacion(p);
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    await p.getByRole('button', { name: '+ Agregar mueble' }).first().click();
    await p.locator('[data-armador="subir-plano"]').setInputFiles({ name: 'plano.pdf', mimeType: 'application/pdf', buffer: PDF });
    const resultado = await Promise.race([
      p.waitForSelector('[data-armador="vista-previa"]', { timeout: 20000 }).then(() => 'leido'),
      p.waitForFunction(() => /no se pudo cargar el lector de PDF/.test(document.body.innerText), null, { timeout: 20000 }).then(() => 'sin-lector'),
    ]);
    if (resultado === 'sin-lector') {
      assert.notEqual(process.env.EXIGIR_INTERNET, '1', 'se exigió medir el PDF y el navegador no alcanzó el lector');
      console.log('    plano en PDF: NO se pudo medir aquí (el navegador no sale a internet); lo mide la publicación');
      return;
    }
    const dim = await p.locator('[data-armador="vista-previa"]').evaluate((img) => [img.naturalWidth, img.naturalHeight, img.src.slice(0, 23)]);
    assert.deepEqual(dim, [2400, 1200, 'data:image/jpeg;base64,'], 'la página a 2400 px por el lado largo, en JPEG');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
