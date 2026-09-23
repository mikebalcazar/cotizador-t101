/* La hoja de cotización: la pantalla que Mike diseñó en Claude Design.
 *
 * Mike, 23-sep-2026: «Necesitamos reestructurar por completo la UI del
 * cotizador. Primero, ocultar el historial de versiones de cotizaciones.
 * Luego, ese menú principal está bien. Después, una vez creada una cotización
 * nueva, es donde comienzan los cambios».
 *
 * Y cómo se arma: «cada renglón es un ítem que se va agregando con su
 * producto, su descripción y su cantidad, su precio unitario y su total. La
 * manera de crearlo son 2 formas: 1) como se hace hoy en día, "agregar
 * mueble"; 2) escribir a mano el producto, descripción, cantidad, precio. Pero
 * aquí debe haber una opción de "buscar en catálogo"».
 *
 * Lo que más importa medir es lo que no se ve: que el precio de un mueble en
 * la hoja sea EXACTAMENTE el que el cliente veía en el PDF de siempre, y que un
 * renglón escrito a mano NO lleve cargos encima. Un peso de diferencia entre
 * la pantalla y el PDF es una cotización que no se puede defender.
 *
 *     node --test pruebas/la-hoja.spec.mjs
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
      const cuerpo = route.request().postDataJSON?.() ?? null;
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
    // El catálogo tarda a propósito: así llega la suite en un día cargado.
    if (r === '/orgs/org-1/productos') return new Promise((f) => setTimeout(f, 600)).then(() => route.fulfill(ok({ filas: [PRODUCTO] })));
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

test('el menú ya no ofrece el historial de versiones, y dice el folio', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    await alProyecto(p);
    const texto = await p.locator('#root').innerText();
    assert.ok(/Corrida 1/.test(texto), 'la cotización sigue en el menú');
    assert.ok(!/historial/i.test(texto), 'sin «ver historial» ni «Historial — N anteriores»');
    assert.ok(!/3 versiones/.test(texto), 'ni el conteo de versiones');
    assert.ok(/Folio C-0007/i.test(texto), 'en su lugar, el folio que dio la suite');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('una cotización se abre en la hoja, y el mueble vale lo mismo que en el PDF cliente', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    await abrirCotizacion(p);
    const hoja = p.locator('[data-pantalla="hoja"]');
    assert.ok(/COTIZACIÓN/.test(await hoja.innerText()), 'el encabezado de la hoja');
    assert.equal(await p.locator('[data-hoja="folio"]').innerText(), 'C-0007', 'con el folio de la suite');
    assert.equal(await p.locator('[data-hoja="cliente"]').innerText(), 'Casa Muestra');
    assert.equal(await p.locator('[data-hoja="proyecto"]').innerText(), 'Departamento Lomas');
    assert.equal(await p.locator('[data-campo="titulo"]').inputValue(), 'Corrida 1', 'el nombre de la cotización es el título de la corrida');
    assert.equal(await p.locator('[data-renglon]').count(), 1, 'un renglón por mueble');
    assert.equal(await p.locator('[data-campo="nombre-0"]').inputValue(), 'Cocina integral');
    assert.equal(await p.locator('[data-campo="cantidad-0"]').inputValue(), '2');
    assert.ok(/Armado: Gabinete Base 60/.test(await p.locator('[data-renglon="0"]').innerText()), 'dice qué lleva el mueble sin abrirlo');

    const unit = await leer(p, '[data-precio="0"]');
    assert.ok(unit > 10000, `al cliente no se le cotiza el costo ($${unit})`);
    assert.equal(unit % 50, 0, 'redondeado de $50 en $50 (Mike, 23-sep)');
    assert.equal(await leer(p, '[data-total="0"]'), unit * 2, 'total del renglón = unitario × cantidad');
    const subtotal = await leer(p, '[data-hoja="subtotal"]');
    const total = await leer(p, '[data-hoja="total"]');
    assert.equal(subtotal, unit * 2);
    assert.equal(Math.round(total * 100), Math.round(subtotal * 1.16 * 100), 'gran total = subtotal + IVA 16%');

    // El PDF de siempre, el que lleva las condiciones, tiene que dar lo mismo.
    const [pdf] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'PDF cliente con condiciones' }).click()]);
    await pdf.waitForLoadState('domcontentloaded');
    const textoPdf = await pdf.locator('body').innerText();
    const enPdf = (n) => textoPdf.includes('$' + Math.round(n).toLocaleString('es-MX'));
    assert.ok(enPdf(unit), `el PDF cliente trae el mismo unitario (${unit})`);
    assert.ok(enPdf(total), `y el mismo total con IVA (${total})`);
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('un renglón a mano se cobra tal cual: sin cargos, sin flete, y se guarda', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    await abrirCotizacion(p);
    // Se abre para ver; para cambiar hay que pedirlo, como antes.
    assert.equal(await p.locator('[data-campo="nombre-0"]').getAttribute('readonly'), '', 'se abre en modo ver');
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    await p.waitForTimeout(300);
    const antes = await leer(p, '[data-hoja="subtotal"]');
    const unitMueble = await leer(p, '[data-precio="0"]');

    await p.getByRole('button', { name: '+ A mano' }).click();
    await p.locator('[data-campo="nombre-1"]').fill('Instalación en sitio');
    await p.locator('[data-campo="descripcion-1"]').fill('Cuadrilla de 3, una jornada');
    await p.locator('[data-campo="cantidad-1"]').fill('3');
    await p.locator('[data-campo="precio-1"]').fill('1000');
    await p.locator('[data-campo="contacto"]').fill('Ana Ruiz · 55 1234 5678');
    await p.waitForTimeout(900);

    assert.equal(await leer(p, '[data-total="1"]'), 3000, '3 × $1,000');
    assert.equal(await leer(p, '[data-hoja="subtotal"]'), antes + 3000, 'el subtotal sube exactamente lo escrito: nada de cargos encima');
    assert.equal(await leer(p, '[data-precio="0"]'), unitMueble, 'y el mueble no cambió de precio (el flete no se reparte en lo escrito a mano)');

    const v = ultimaVersion(escrituras);
    assert.ok(v, 'la hoja se guardó sola en la suite');
    const r = v.muebles[1];
    assert.equal(r.manual, true);
    assert.equal(r.nombre, 'Instalación en sitio');
    assert.equal(r.descripcion, 'Cuadrilla de 3, una jornada');
    assert.equal(r.qty, 3);
    assert.equal(r.precio, 1000);
    assert.equal(v.hoja?.contacto, 'Ana Ruiz · 55 1234 5678', 'lo de la hoja viaja con la versión');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('«Buscar en catálogo» trae los productos de la suite con su precio', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    await abrirCotizacion(p);
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    await p.getByRole('button', { name: 'Buscar en catálogo' }).first().click();
    await p.locator('.hoja-velo input').fill('tambor');
    /* El catálogo llega de la suite cuando llega: con un reloj fijo de 200 ms
     * esta prueba tumbó el despliegue de G88 (run 35829997931). Se espera a
     * que aparezca; si la búsqueda no mirara la descripción, diría «Nada
     * coincide» y la espera se vence igual. */
    const puerta = p.locator('.hoja-velo').getByText('Puerta estándar');
    await puerta.waitFor({ timeout: 10000 }).catch(() => {});
    assert.ok(await puerta.count() > 0, 'busca también en la descripción');
    await p.locator('.hoja-velo').getByRole('button', { name: 'Agregar' }).click();
    await p.locator('.hoja-velo').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    assert.equal(await p.locator('.hoja-velo').count(), 0, 'el catálogo se cierra al agregar');
    for (let t = Date.now(); !ultimaVersion(escrituras)?.muebles[1] && Date.now() - t < 10000;) await p.waitForTimeout(100);
    assert.equal(await p.locator('[data-campo="nombre-1"]').inputValue(), 'Puerta estándar');
    assert.equal(await p.locator('[data-campo="codigo-1"]').inputValue(), 'PT-STD');
    assert.equal(await p.locator('[data-campo="precio-1"]').inputValue(), '2500', 'los centavos de la suite se vuelven pesos');
    const v = ultimaVersion(escrituras);
    assert.equal(v?.muebles[1]?.producto_id, 'pd-1', 'el renglón queda ligado a su producto');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('«Nueva cotización» abre la hoja en blanco, y se imprime sin botones', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    await alProyecto(p);
    await p.getByText(/Nueva cotizaci[oó]n/).first().click();
    await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
    assert.ok(/Sin renglones todavía/.test(await p.locator('[data-pantalla="hoja"]').innerText()), 'hoja en blanco');
    assert.ok(/se asigna al guardar/.test(await p.locator('[data-hoja="folio"]').innerText()), 'el folio lo da la suite al guardar');

    await p.getByRole('button', { name: '+ A mano' }).click();
    await p.locator('[data-campo="nombre-0"]').fill('Closet vestidor');
    await p.locator('[data-campo="precio-0"]').fill('45000');
    const [imp] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'Imprimir / PDF' }).click()]);
    await imp.waitForLoadState('domcontentloaded');
    const t = await imp.locator('body').innerText();
    assert.ok(/GRAN TOTAL/.test(t) && /Closet vestidor/.test(t), 'imprime la hoja con lo escrito');
    assert.ok(/52,200/.test(t), 'con su total con IVA');
    assert.equal(await imp.locator('button, input, textarea').count(), 0, 'sin botones ni cajas de texto');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('una cotización nueva se da de alta UNA vez, aunque se guarde muchas', async () => {
  /* El defecto que salió al medir la hoja: la suite le pone su id a la nueva
   * y el cotizador seguía buscándola con el inventado, así que cada guardado
   * automático la daba de alta otra vez, con otro folio. */
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    await alProyecto(p);
    await p.getByText(/Nueva cotizaci[oó]n/).first().click();
    await p.waitForSelector('[data-pantalla="hoja"]');
    await p.getByRole('button', { name: '+ A mano' }).click();
    await p.waitForTimeout(1000);
    await p.locator('[data-campo="nombre-0"]').fill('Closet');
    await p.waitForTimeout(1000);
    await p.locator('[data-campo="precio-0"]').fill('45000');
    await p.waitForTimeout(150);
    await p.locator('[data-campo="cantidad-0"]').fill('2');
    await p.waitForTimeout(1500);
    const altas = escrituras.filter((e) => e.metodo === 'POST' && e.ruta === '/orgs/org-1/cotizaciones');
    const cambios = escrituras.filter((e) => e.metodo === 'PATCH' && e.ruta.startsWith('/orgs/org-1/cotizaciones/'));
    assert.equal(altas.length, 1, 'una sola alta');
    assert.ok(cambios.length >= 1, 'lo demás son cambios a esa misma');
    assert.ok(cambios.every((e) => e.ruta === '/orgs/org-1/cotizaciones/nuevo-1'), 'con el id que dio la suite');
    assert.equal(escrituras.filter((e) => e.metodo === 'DELETE').length, 0, 'y nada se borra');
    assert.equal(await p.locator('[data-hoja="folio"]').innerText(), 'C-0099', 'la hoja ya dice el folio que le dio la suite');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('«Aprobar» manda cada renglón con su cantidad y su precio con descuento, y la deja cerrada', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp();
  const dialogos = [];
  p.on('dialog', (d) => { dialogos.push(d.message()); d.accept(); });
  try {
    await abrirCotizacion(p);
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    await p.getByRole('button', { name: '+ A mano' }).click();
    await p.locator('[data-campo="nombre-1"]').fill('Instalación en sitio');
    await p.locator('[data-campo="precio-1"]').fill('1000');
    await p.locator('[data-campo="descuento"]').fill('10');
    await p.waitForTimeout(900);
    const unit = await leer(p, '[data-precio="0"]');

    await p.getByRole('button', { name: 'Aprobar', exact: true }).click();
    await p.waitForSelector('[data-hoja="aprobada"]', { timeout: 10000 });
    assert.ok(/Se crean 3 piezas vendidas en el proyecto «Departamento Lomas»/.test(dialogos.join('\n')), 'antes pregunta, y dice cuántas piezas y dónde');

    const i = escrituras.findIndex((e) => /\/cotizaciones\/q-1\/aprobar$/.test(e.ruta));
    assert.ok(i >= 0, 'le pidió a la suite aprobarla');
    const ultimoGuardado = escrituras.map((e, k) => (e.metodo === 'PATCH' && /cotizaciones\/q-1$/.test(e.ruta) ? k : -1)).filter((k) => k >= 0);
    assert.ok(ultimoGuardado.some((k) => k < i), 'guardó lo último escrito ANTES de aprobar');
    const { proyecto_id, lineas } = escrituras[i].cuerpo;
    assert.equal(proyecto_id, 'pr-1');
    assert.equal(lineas.length, 2, 'un renglón, una línea');
    assert.deepEqual(
      { nombre: lineas[0].nombre, cantidad: lineas[0].cantidad, precio: lineas[0].precio, descripcion: lineas[0].descripcion },
      { nombre: 'Cocina integral', cantidad: 2, precio: Math.round(unit * 0.9 * 100), descripcion: 'Gabinete Base 60' },
      'el mueble: su cantidad, su precio de la hoja con el 10% repartido, en centavos, y lo que lleva',
    );
    assert.deepEqual({ nombre: lineas[1].nombre, cantidad: lineas[1].cantidad, precio: lineas[1].precio }, { nombre: 'Instalación en sitio', cantidad: 1, precio: 90000 });

    assert.ok(/Aprobada el 23 de septiembre de 2026 · 3 piezas en el proyecto/.test(await p.locator('[data-hoja="aprobada"]').innerText()));
    assert.equal(await p.getByRole('button', { name: 'Aprobar', exact: true }).count(), 0, 'no se aprueba dos veces');
    assert.equal(await p.locator('[data-campo="nombre-0"]').getAttribute('readonly'), '', 'y ya no se edita');
    const antes = escrituras.length;
    await p.waitForTimeout(900);
    assert.equal(escrituras.slice(antes).filter((e) => e.metodo === 'PATCH').length, 0, 'ni se sigue guardando sola');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('una cotización aprobada se ve aprobada, en el menú y en la hoja, y no se puede editar', async () => {
  const aprobada = { ...COTIZACION, estado: 'aceptada', datos: { ...COTIZACION.datos, aprobacion: { at: '2026-09-22T18:00:00Z', items: 2 } } };
  const { ctx, p, errores, escrituras } = await abrirApp({ cotizacion: aprobada });
  try {
    await alProyecto(p);
    assert.ok(/Folio C-0007 · aprobada/i.test(await p.locator('#root').innerText()), 'el menú dice que está aprobada');
    await p.getByText('Corrida 1').first().click();
    await p.waitForSelector('[data-hoja="aprobada"]', { timeout: 10000 });
    assert.equal(await p.getByRole('button', { name: /Editar cotización/ }).count(), 0, 'sin «Editar»');
    assert.equal(await p.getByRole('button', { name: 'Aprobar', exact: true }).count(), 0, 'ni «Aprobar»');
    assert.equal(await p.getByRole('button', { name: 'Imprimir / PDF' }).count(), 1, 'pero se sigue imprimiendo');
    await p.waitForTimeout(800);
    assert.equal(escrituras.length, 0, 'abrirla no escribe nada');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('debajo de cada cargo, su monto: los indirectos y los demás suman el precio de los armados', async () => {
  /* Mike, 23-sep: «Quitaste el monto de los indirectos de la suma al final
   * […] necesito ese monto. Y en el flete, la comisión profesionista y la
   * comisión TDC me pongas abajo qué monto representa». Los porcentajes son
   * los de ⚙ (aquí, los de fábrica: 7.5, 3.5, 2, 10 y 4.5). */
  const { ctx, p, errores } = await abrirApp();
  try {
    await abrirCotizacion(p);
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    const cargo = (k) => leer(p, `[data-cargo="${k}"]`);
    await p.locator('[data-cargo="indirectos"]').waitFor({ timeout: 10000 }).catch(() => {});
    assert.equal(await p.locator('[data-cargo="indirectos"]').count(), 1, 'el monto de los indirectos se ve en la hoja');
    // Costo: $10,000 × 2 piezas.
    assert.equal(await cargo('costo'), 20000);
    assert.equal(await cargo('indirectos'), 1500, 'indirectos 7.5% del costo');
    assert.equal(await cargo('ingenieria'), 700);
    assert.equal(await cargo('embalaje'), 400);
    assert.equal(await cargo('arq'), 2260, 'comisión profesionista 10% sobre costo con cargos');
    assert.equal(await cargo('tdc'), 1118.7, 'comisión TDC 4.5% sobre lo anterior');
    assert.equal(await cargo('flete'), 1500, 'el flete mínimo');
    const partes = ['costo', 'indirectos', 'ingenieria', 'embalaje', 'arq', 'tdc', 'flete', 'redondeo'];
    const suma = async () => { let t = 0; for (const k of partes) t += (await p.locator(`[data-cargo="${k}"]`).innerText()) === '—' ? 0 : await cargo(k); return Math.round(t * 100) / 100; };
    assert.equal(await suma(), await cargo('armados'), 'las partes suman el precio de los armados');
    assert.equal(await cargo('armados'), await leer(p, '[data-hoja="subtotal"]'), 'que es lo que dice la hoja');
    const red = await cargo('redondeo');
    assert.ok(red >= 0 && red < 50 * 2, `el redondeo es hacia arriba y de menos de $50 por pieza (${red})`);

    // Apagar el flete: su monto se va y el resto sigue cuadrando.
    await p.locator('[data-hoja="cargos"] label', { hasText: 'Flete' }).locator('input').uncheck();
    await p.waitForFunction(() => document.querySelector('[data-cargo="flete"]').innerText === '—', null, { timeout: 5000 });
    assert.equal(await suma(), await cargo('armados'));
    assert.equal(await cargo('armados'), await leer(p, '[data-hoja="subtotal"]'));
    assert.equal(await p.locator('[data-hoja="cargos"]').evaluate((e) => e.classList.contains('no-print')), true, 'no sale impreso');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

/* Un plano gris de 200×100 para la cotización: basta con que sea una imagen. */
const PLANO_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAIAAABM5OhcAAAAx0lEQVR42u3SMQ0AAAzDsPIHWwxFMWmHDSFKCgciAcbCWBgLjIWxMBYYC2NhLDAWxsJYYCyMhbHAWBgLY4GxMBbGAmNhLIwFxsJYGAuMhbEwFhgLY2EsMBbGwlhgLIyFscBYGAtjgbEwFsYCY2EsjAXGwlgYC4yFsTAWGAtjYSwwFsbCWGAsjIWxwFgYC2OBsTAWxgJjYSyMBcbCWBgLjIWxMBYYC2NhLDAWxsJYYCyMhbEwFhgLY2EsMBbGwlhgLIyFscBY/Dbu6fH4+vPYCgAAAABJRU5ErkJggg==';

test('el PDF cliente: cada componente con su número, precio unitario de $50 en $50, cantidad y subtotal', async () => {
  /* Mike, 23-sep: «necesito que en el PDF del cliente venga el costo
   * unitario y la cantidad por componente y luego el subtotal. Y hay que
   * redondear de $50 en $50 hacia arriba […] En la lista debe estar el número
   * del componente». Y que la hoja dé lo mismo (lo escogió él). */
  const mueble = { ...MUEBLE, componentes: [
    { id: 'c-1', marca: 1, modulo: 'Gabinete', desc: 'Base 60', tags: [], extras: [], unitario: 3500, qty: 2, subtotal: 7000 },
    { id: 'c-2', marca: 3, modulo: 'Cubierta', desc: 'Cuarzo', tags: [], extras: [], unitario: 3000, qty: 1, subtotal: 3000 },
  ] };
  const aMano = { id: 'm-2', manual: true, nombre: 'Instalación', qty: 1, precio: 1234, total: 1234, componentes: [], imagenes: [] };
  const cot = { ...COTIZACION, datos: { ...COTIZACION.datos, versiones: [{ ...VERSION, muebles: [mueble, aMano] }] } };
  const { ctx, p, errores } = await abrirApp({ cotizacion: cot });
  try {
    await abrirCotizacion(p);
    const unit = await leer(p, '[data-precio="0"]');
    assert.equal(await leer(p, '[data-total="1"]'), 1234, 'lo escrito a mano no se redondea');
    const subtotalHoja = await leer(p, '[data-hoja="subtotal"]');
    const [pdf] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'PDF cliente con condiciones' }).click()]);
    await pdf.waitForLoadState('domcontentloaded');
    const filas = await pdf.locator('tr[data-comp]').evaluateAll((trs) => trs.map((tr) => ({
      num: tr.querySelector('[data-comp-num]').innerText.trim(),
      unit: Number(tr.querySelector('[data-comp-unit]').innerText.replace(/[^0-9.]/g, '')),
      cant: Number(tr.querySelector('[data-comp-cant]').innerText.replace(/[^0-9.]/g, '')),
      sub: Number(tr.querySelector('[data-comp-sub]').innerText.replace(/[^0-9.]/g, '')),
    }))).catch(() => []);
    assert.equal(filas.length, 2, 'un renglón por componente');
    assert.deepEqual(filas.map((f) => f.num), ['1', '3'], 'con el número del componente (el del plano)');
    assert.deepEqual(filas.map((f) => f.cant), [2, 1], 'y su cantidad');
    for (const f of filas) {
      assert.equal(f.unit % 50, 0, `precio unitario de $50 en $50 (${f.unit})`);
      assert.equal(f.sub, f.unit * f.cant, 'subtotal = unitario × cantidad');
    }
    assert.equal(filas[0].sub + filas[1].sub, unit, `los componentes suman el unitario del mueble en la hoja (${unit})`);
    // Proporción: el gabinete cuesta 70% del mueble; su precio, lo mismo (± el redondeo).
    assert.ok(Math.abs(filas[0].sub / unit - 0.7) < 0.02, 'repartido según su costo');
    const texto = await pdf.locator('body').innerText();
    assert.ok(!/\$3,500|\$7,000|\$3,000\b/.test(texto), 'el costo no se le enseña al cliente');
    assert.ok(texto.includes('$' + subtotalHoja.toLocaleString('es-MX')), `el subtotal del PDF es el de la hoja (${subtotalHoja})`);
    assert.ok(/Instalación/.test(texto), 'el renglón a mano también sale');
    assert.equal(await pdf.locator('[data-plano-cliente]').count(), 0, 'sin plano, no hay página de plano');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('al final del PDF cliente, el plano con los círculos numerados en su lugar', async () => {
  /* Mike, 23-sep: «incluye al final de la propuesta el plano con los íconos
   * numerados para que el cliente pueda relacionar lo que se está cobrando y
   * su ubicación». */
  const mueble = { ...MUEBLE, plano: { src: PLANO_PNG, ancho: 200, alto: 100, nombre: 'cocina.png' }, componentes: [
    { id: 'c-1', marca: 1, pos: { x: 0.25, y: 0.5 }, modulo: 'Gabinete', desc: 'Base 60', tags: [], extras: [], unitario: 7000, qty: 1, subtotal: 7000 },
    { id: 'c-2', marca: 2, pos: { x: 0.75, y: 0.2 }, modulo: 'Alacena', desc: 'Alta 90', tags: [], extras: [], unitario: 3000, qty: 1, subtotal: 3000 },
  ] };
  const cot = { ...COTIZACION, datos: { ...COTIZACION.datos, versiones: [{ ...VERSION, muebles: [mueble] }] } };
  const { ctx, p, errores } = await abrirApp({ cotizacion: cot });
  try {
    await abrirCotizacion(p);
    const [pdf] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'PDF cliente con condiciones' }).click()]);
    await pdf.waitForLoadState('load');
    const plano = pdf.locator('[data-plano-cliente]');
    assert.equal(await plano.count(), 1, 'una página con el plano del mueble');
    const img = await plano.locator('img').boundingBox();
    const pines = await plano.locator('.pin').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { n: e.innerText.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
    assert.deepEqual(pines.map((q) => q.n), ['1', '2'], 'un círculo por componente, con su número');
    const donde = pines.map((q) => [(q.x - img.x) / img.width, (q.y - img.y) / img.height]);
    assert.ok(Math.abs(donde[0][0] - 0.25) < 0.01 && Math.abs(donde[0][1] - 0.5) < 0.02, `el 1 donde se puso en el plano (${donde[0]})`);
    assert.ok(Math.abs(donde[1][0] - 0.75) < 0.01 && Math.abs(donde[1][1] - 0.2) < 0.02, `el 2 también (${donde[1]})`);
    const orden = await pdf.evaluate(() => {
      const t = document.body.textContent; // innerText sale en mayúsculas por el CSS
      return [t.indexOf('Ubicación de los componentes'), t.indexOf('Anexo de T\u00e9rminos')];
    });
    assert.ok(orden[0] > 0 && orden[0] < orden[1], 'al final de la propuesta, antes de las condiciones');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
