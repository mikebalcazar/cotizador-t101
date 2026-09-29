/* La X que borra un componente pregunta antes.
 *
 * Mike, 29-sep-2026: «cuando le pongo X (para eliminar) a un componente, abre
 * un cuadro de diálogo para confirmar. No sólo lo elimines sin preguntar.»
 *
 * Por qué importa más de lo que parece: la X está pegada al lápiz de editar,
 * y en el armador NO hay deshacer. Un clic de más se llevaba el componente con
 * su precio, su lugar en el plano y lo que se le hubiera configurado, y la
 * única salida era rearmarlo a mano.
 *
 * Las dos que cuentan: que al decir QUE NO no se borre nada —un aviso que
 * borra igual es peor que no tenerlo— y que el aviso diga CUÁL componente,
 * porque con ocho en la lista «¿borrar el componente?» no ayuda a nadie.
 *
 *     npm run armar && node --test pruebas/borrar-componente.spec.mjs
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

/* Dos componentes con nombre distinto: así se puede comprobar que el aviso
 * nombra al que se picó y que se borra ese y no el otro. */
const MUEBLE = {
  id: 'm-1', nombre: 'Cocina integral', qty: 1, total: 10000,
  componentes: [
    { id: 'c-1', modulo: 'Gabinete', desc: 'Base 60', tags: [], extras: [], unitario: 7000, qty: 1, subtotal: 7000 },
    { id: 'c-2', modulo: 'Alacena', desc: 'Alta 90', tags: [], extras: [], unitario: 3000, qty: 1, subtotal: 3000 },
  ],
  perfil: { int: { formato: '18mm', acabado: 'laminado', chapa: null }, fre: { formato: '18mm', acabado: 'laminado', chapa: null } },
  imagenes: [],
};
const VERSION = { muebles: [MUEBLE], usaFlete: true, usaArq: true, usaTDC: true, descuento: 0, fecha: '2026-09-20T12:00:00Z' };
const CLIENTE = { id: 'cl-1', nombre: 'Casa Muestra', negocio_id: 'n-1' };
const PROYECTO = { id: 'pr-1', nombre: 'Departamento Lomas', cliente_id: 'cl-1', negocio_id: 'n-1' };
const COTIZACION = {
  id: 'q-1', folio: 'C-0007', cliente_id: 'cl-1', negocio_id: 'n-1', total: 1000000,
  datos: { nombre: 'Corrida 1', proyecto_id: 'pr-1', versiones: [VERSION] },
};

async function abrirApp() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  let n = 0;
  await p.route('**/s101/**', (route) => {
    const u = new URL(route.request().url());
    const r = u.pathname.replace(/^\/s101/, '');
    const metodo = route.request().method();
    if (metodo !== 'GET') {
      const cuerpo = route.request().postDataJSON?.() ?? null;
      return route.fulfill({ ...ok({ id: 'nuevo-' + (++n), folio: 'C-0099', ...(cuerpo || {}) }), status: metodo === 'POST' ? 201 : 200 });
    }
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
    if (r === '/orgs/org-1/negocios') return route.fulfill(ok({ filas: [{ id: 'n-1', nombre: 'Taller', moneda: 'MXN' }] }));
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: [CLIENTE] }));
    if (r === '/orgs/org-1/proyectos') return route.fulfill(ok({ filas: [PROYECTO] }));
    if (r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [COTIZACION] }));
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  return { ctx, p, errores };
}

/** Deja abierto el armador del mueble, con sus dos componentes a la vista. */
async function enElArmador(p) {
  await p.getByText('Casa Muestra').first().click();
  await p.waitForTimeout(400);
  await p.getByText('Departamento Lomas').first().click();
  await p.waitForTimeout(400);
  await p.getByText('Corrida 1').first().click();
  await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
  await editarCotizacion(p);
  await p.getByRole('button', { name: 'abrir el armador' }).first().click();
  await p.waitForTimeout(600);
}

/** Las X rojas DE LA LISTA DE COMPONENTES.
 *
 * Se acota a `[data-componente]` a propósito: el menú lateral tiene sus
 * propias X —«Eliminar proyecto», «Eliminar cotización»— y sin acotar, la
 * primera X de la página es la del proyecto. La prueba fallaba por picar la
 * que no era, no por la app. */
const equis = (p) => p.locator('[data-componente] button', { hasText: '✕' });

test('la X pregunta antes de borrar, y si dices que no, no borra', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    await enElArmador(p);
    const antes = await equis(p).count();
    assert.ok(antes >= 2, `los dos componentes están en la lista, cada uno con su X (había ${antes})`);

    // Que diga que NO: no se borra nada. Es la mitad que de verdad importa.
    let dicho = null;
    p.once('dialog', (d) => { dicho = d.message(); d.dismiss(); });
    await equis(p).first().click();
    await p.waitForTimeout(500);
    assert.ok(dicho, 'picar la X abre un cuadro de diálogo, no borra de una');
    assert.ok(/Gabinete|Base 60/.test(dicho), `el aviso dice CUÁL componente, no «el componente» a secas (dijo: ${dicho})`);
    assert.equal(await equis(p).count(), antes, 'al decir que no, el componente sigue ahí');
    assert.equal(await p.locator('[data-componente]').count(), 2, 'los dos renglones siguen en la lista');

    // Que diga que sí: ahora sí se va, y se va EL QUE SE PICÓ.
    p.once('dialog', (d) => d.accept());
    await equis(p).first().click();
    await p.waitForTimeout(600);
    assert.equal(await equis(p).count(), antes - 1, 'al aceptar, se borra uno');
    assert.equal(await p.locator('[data-componente]').count(), 1, 'queda un solo renglón');
    const queda = await p.locator('[data-componente]').first().innerText();
    assert.ok(/Alacena|Alta 90/.test(queda),
      `el que se queda es el OTRO: se borró el que se picó, no el primero de la lista (quedó: ${queda.replace(/\s+/g, ' ').slice(0, 120)})`);

    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
