/* En qué negocio está parado el cotizador.
 *
 * EL DEFECTO DEL 23-SEP-2026. Mike: «desapareció mi info de quote».
 *
 * No se había perdido nada. La suite guarda clientes, proyectos y cotizaciones
 * POR NEGOCIO, y una empresa puede tener varios —Forespot tiene tres—. El
 * cotizador abría SIEMPRE el primero de la lista, que viene ordenada por
 * nombre, sin recordar nada y sin manera de cambiarlo. El día que aparece un
 * negocio cuyo nombre queda antes en el abecedario, el cotizador se cambia
 * solo y todo se ve vacío.
 *
 * El síntoma es raro y por eso vale reconocerlo: **los precios y la
 * configuración siguen ahí**, porque `ajustes` no se guarda por negocio. Sólo
 * desaparecen los clientes.
 *
 * Y había una segunda cosa, peor: si la lectura de la lista fallaba, el
 * cotizador lo leía como «esta empresa no tiene negocios» y CREABA UNO. Una
 * lectura que falla no puede terminar en una escritura que nadie pidió.
 *
 *     node --test pruebas/el-negocio.spec.mjs
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

/* Dos negocios, y un cliente distinto en cada uno. «Alfa» va primero por
 * nombre; los datos de la prueba viven en «Zeta», que es justo el caso que se
 * rompía: el que abre solo no es donde está el trabajo. */
const ALFA = { id: 'n-alfa', nombre: 'Alfa Muebles' };
const ZETA = { id: 'n-zeta', nombre: 'Zeta Carpintería' };
const CLIENTES = {
  'n-alfa': [{ id: 'cl-a', nombre: 'Cliente de Alfa', negocio_id: 'n-alfa' }],
  'n-zeta': [{ id: 'cl-z', nombre: 'Cliente de Zeta', negocio_id: 'n-zeta' }],
};

/** Abre la app con la suite de mentiras. `negociosFallan` devuelve 500 en la
 *  lista, para medir que eso NO termine creando un negocio. */
async function abrirApp({ negociosFallan = false, almacen = null } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, storageState: almacen ?? undefined });
  const p = await ctx.newPage();
  const errores = [];
  const escrituras = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  await p.route('**/s101/**', (route) => {
    const u = new URL(route.request().url());
    const r = u.pathname.replace(/^\/s101/, '');
    const metodo = route.request().method();
    if (metodo !== 'GET') escrituras.push(`${metodo} ${r}`);
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Forespot' }] }));
    if (r === '/orgs/org-1/negocios') {
      if (negociosFallan) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'se_cayo' }) });
      return route.fulfill(ok({ filas: [ALFA, ZETA] }));
    }
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: CLIENTES[u.searchParams.get('negocio_id')] ?? [] }));
    if (r === '/orgs/org-1/proyectos' || r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [] }));
    if (r === '/orgs/org-1/ajustes') return route.fulfill(ok({ filas: [] }));
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  return { ctx, p, errores, escrituras };
}

const pintada = (p) => p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });

test('con varios negocios se puede escoger, y el escogido se recuerda', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    await pintada(p);
    // Abre el primero por nombre, como siempre; lo que cambia es que ahora se ve cuál.
    const sel = p.locator('select[title*="negocio"]');
    assert.equal(await sel.count(), 1, 'con dos negocios, la barra ofrece cambiarlo');
    assert.equal(await sel.inputValue(), ALFA.id, 'arranca en el primero por nombre');
    assert.ok(/Cliente de Alfa/.test(await p.locator('#root').innerText()), 'y enseña los clientes de ése');

    await sel.selectOption(ZETA.id);
    await p.waitForFunction(() => /Cliente de Zeta/.test(document.querySelector('#root').innerText), null, { timeout: 15000 });
    assert.ok(!/Cliente de Alfa/.test(await p.locator('#root').innerText()), 'cambiar de negocio trae el otro árbol completo, no los dos mezclados');

    // Lo que importa: al volver a entrar se queda donde lo dejaron. Sin esto,
    // quien tiene su trabajo en el segundo negocio lo «pierde» en cada visita.
    const almacen = await ctx.storageState();
    const otra = await abrirApp({ almacen });
    try {
      await pintada(otra.p);
      assert.equal(await otra.p.locator('select[title*="negocio"]').inputValue(), ZETA.id, 'recuerda el negocio escogido');
      assert.ok(/Cliente de Zeta/.test(await otra.p.locator('#root').innerText()), 'y abre con sus datos');
    } finally { await otra.ctx.close(); }

    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('si la lista de negocios falla, NO se crea un negocio', async () => {
  /* Ésta es la que muerde callado: una lectura caída se leía como «no hay
   * negocios» y el cotizador daba de alta uno. Ese negocio nuevo se queda en
   * la empresa para siempre y, si su nombre queda antes en el abecedario, se
   * vuelve el que la app abre sola. */
  const { ctx, p, errores, escrituras } = await abrirApp({ negociosFallan: true });
  try {
    await p.waitForTimeout(2500);
    assert.deepEqual(
      escrituras.filter((e) => e.includes('/negocios')), [],
      'no se da de alta ningún negocio a partir de una lectura que falló',
    );
    assert.ok(!errores.some((e) => /Cannot read|undefined is not/.test(e)), 'y no truena de una manera que nadie pueda leer');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
