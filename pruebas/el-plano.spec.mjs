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
