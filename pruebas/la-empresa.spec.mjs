/* La empresa firma sus documentos (API 0.80.0).
 *
 * Mike, 7-oct-2026, con la hoja de quote101 enfrente y tres cosas marcadas:
 *
 *   · verde: «debería ser el logotipo del negocio que cotiza (…) yo debo subir
 *     en la configuración de la empresa (en director) el logotipo en PNG (…)
 *     y que ese sea el que se ocupe para todos los documentos»;
 *   · rojo: el nombre y el contacto, «info que se configura desde
 *     director101, no debería poder editarse aquí»;
 *   · azul: «el nombre del usuario que está generando la cotización».
 *
 * Lo que mide: que la hoja y CADA documento (PDF cliente, PDF interno,
 * presupuesto) traigan el logotipo, el nombre y el contacto que contesta la
 * suite —y ya no «Taller 101», su correo y su teléfono escritos a mano—; que
 * en la hoja no se puedan editar; y que el responsable sea quien la hizo, y
 * se guarde con la cotización.
 *
 *     node --test pruebas/la-empresa.spec.mjs
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
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };
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

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const EMPRESA = {
  id: 'empresa', nombre: 'Carpintería Fina', rfc: 'CFI010101AA1', moneda: 'MXN', dia_conciliacion: 1,
  correo: 'hola@carpinteriafina.mx', telefono: '+52 55-1234-5678', sitio_web: 'carpinteriafina.mx', direccion: 'Coyoacán, CDMX',
  logo_ruta: '/orgs/org-1/empresa/logo?v=1',
};
const MUEBLE = {
  id: 'm-1', nombre: 'Cocina integral', qty: 1, total: 10000,
  componentes: [{ id: 'c-1', modulo: 'Gabinete', desc: 'Base 60', tags: [], extras: [], unitario: 10000, qty: 1, subtotal: 10000 }],
  perfil: { int: { formato: '18mm', acabado: 'laminado', chapa: null }, fre: { formato: '18mm', acabado: 'laminado', chapa: null } },
  imagenes: [],
};
const COTIZACION = {
  id: 'q-1', folio: 'C-0007', cliente_id: 'cl-1', total: 2000000,
  datos: { nombre: 'Corrida 1', proyecto_id: 'pr-1', versiones: [{ muebles: [MUEBLE], usaFlete: true, usaArq: true, usaTDC: true, descuento: 0, fecha: '2026-10-07T12:00:00Z' }] },
};

async function abrirApp({ empresa = EMPRESA } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errores = [];
  const escrituras = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  await p.route('**/s101/**', (route) => {
    const r = new URL(route.request().url()).pathname.replace(/^\/s101/, '');
    const metodo = route.request().method();
    if (metodo !== 'GET') {
      const cuerpo = route.request().postDataJSON?.() ?? null;
      escrituras.push({ metodo, ruta: r, cuerpo });
      return route.fulfill({ ...ok({ id: 'q-1', folio: 'C-0007', ...(cuerpo || {}) }), status: metodo === 'POST' ? 201 : 200 });
    }
    if (r === '/yo') return route.fulfill(ok({ usuario: { id: 'u-1', correo: 'mike@forespot.com', nombre: 'Mike Balcázar' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
    if (r === '/orgs/org-1/empresa') return route.fulfill(ok(empresa));
    if (r === '/orgs/org-1/empresa/logo') return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: [{ id: 'cl-1', nombre: 'Casa Muestra' }] }));
    if (r === '/orgs/org-1/proyectos') return route.fulfill(ok({ filas: [{ id: 'pr-1', nombre: 'Departamento Lomas', cliente_id: 'cl-1' }] }));
    if (r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [COTIZACION] }));
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  await p.getByText('Casa Muestra').first().click();
  await p.waitForTimeout(300);
  await p.getByText('Departamento Lomas').first().click();
  await p.waitForTimeout(300);
  await p.getByText('Corrida 1').first().click();
  await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
  return { ctx, p, errores, escrituras };
}

const VIEJO = /Taller 101|taller101\.com|2951-7900/;

test('la hoja trae el logotipo, el nombre y el contacto de la empresa, sin poder editarlos, y el responsable es quien cotiza', async () => {
  const { ctx, p, errores, escrituras } = await abrirApp();
  try {
    await p.waitForFunction(() => document.querySelector('[data-hoja="logo"] img')?.naturalWidth > 0, null, { timeout: 10000 });
    assert.match(await p.locator('[data-hoja="logo"] img').getAttribute('src'), /^data:image\/png;base64,/, 'el logotipo de la suite, ya como data: (sirve igual en los PDF y el Excel)');
    assert.equal(await p.locator('[data-hoja="empresa"]').innerText(), 'Carpintería Fina');
    const datos = await p.locator('[data-hoja="empresa-datos"]').innerText();
    for (const t of ['RFC CFI010101AA1', 'Coyoacán, CDMX', '+52 55-1234-5678', 'hola@carpinteriafina.mx', 'carpinteriafina.mx']) assert.ok(datos.includes(t), `el contacto trae ${t}`);
    assert.equal(await p.locator('[data-pantalla="hoja"] input[data-campo="empresa"], [data-pantalla="hoja"] input[data-campo="empresaDatos"], [data-pantalla="hoja"] input[data-campo="revision"]').count(), 0, 'ni el nombre, ni el contacto, ni el responsable se escriben en la hoja');
    assert.equal(await p.locator('[data-hoja="responsable"]').innerText(), 'Responsable: Mike Balcázar', 'el responsable es quien entró');
    assert.ok(!VIEJO.test(await p.locator('[data-pantalla="hoja"]').innerText()), 'ya no dice Taller 101 ni su contacto');

    // Una cotización vieja se abre para VER: el responsable se apunta al editarla.
    await editarCotizacion(p);
    await p.getByRole('button', { name: 'Guardar', exact: true }).first().click();
    await p.waitForTimeout(800);
    const guardada = escrituras.filter((e) => /\/cotizaciones/.test(e.ruta) && e.cuerpo?.datos?.versiones).pop();
    assert.equal(guardada?.cuerpo.datos.versiones[0].hoja?.responsable, 'Mike Balcázar', 'y se guarda con la cotización');
    assert.deepEqual(errores, []);
  } finally { await ctx.close(); }
});

test('los tres documentos llevan el logotipo, el nombre y el contacto de la empresa', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    await p.waitForFunction(() => document.querySelector('[data-hoja="logo"] img')?.naturalWidth > 0, null, { timeout: 10000 });
    for (const boton of ['PDF cliente con condiciones', 'PDF interno', 'Presupuesto']) {
      const [doc] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: boton, exact: true }).click()]);
      await doc.waitForLoadState('domcontentloaded');
      const html = await doc.content();
      const texto = await doc.locator('body').innerText();
      assert.ok(/<img[^>]+src="data:image\/png;base64,/.test(html), `${boton}: con el logotipo de la empresa`);
      assert.ok((await doc.title()).includes('Carpintería Fina') || texto.includes('Carpintería Fina'), `${boton}: con el nombre de la empresa`);
      assert.ok(!VIEJO.test(html.replace(/data:image\/[a-z]+;base64,[^"']+/g, '')), `${boton}: sin Taller 101 ni su contacto escritos a mano`);
      if (boton !== 'PDF interno') assert.ok(texto.includes('hola@carpinteriafina.mx'), `${boton}: con el correo de la empresa`);
      await doc.close();
    }
    assert.deepEqual(errores, []);
  } finally { await ctx.close(); }
});

test('sin logotipo subido, la hoja dice dónde se sube y los documentos van sin logotipo', async () => {
  const { ctx, p, errores } = await abrirApp({ empresa: { ...EMPRESA, logo_ruta: null } });
  try {
    await p.waitForFunction(() => /workshop101/.test(document.querySelector('[data-hoja="logo"]')?.innerText || ''), null, { timeout: 10000 });
    assert.equal(await p.locator('[data-hoja="logo"] img').count(), 0);
    const [doc] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'PDF interno', exact: true }).click()]);
    await doc.waitForLoadState('domcontentloaded');
    assert.equal(await doc.locator('.hdr img').count(), 0, 'el PDF no inventa un logotipo');
    await doc.close();
    assert.deepEqual(errores, []);
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
