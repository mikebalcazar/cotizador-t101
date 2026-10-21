/* El overhead cobra su puerta, y su frente mueve el precio.
 *
 * Mike, 21-oct-2026, con captura de una cocina: «cuando cambio el frente
 * (material) de esos componentes, no me cambia el precio». Eran overheads de
 * una puerta con SUS materiales. Lo que pasaba: `FRENTES_POR_TIPO` decía 0
 * frentes para «oh1» y «oh2», así que su precio salía sólo del interior y el
 * frente no se cobraba nunca. Decisión de Mike, con botones: «Sumar su
 * puerta», igual que el Gabinete 1 puerta.
 *
 * Mide contra las tablas de la app (PG, PF), no contra números escritos aquí.
 *
 *     npm run armar && node --test pruebas/el-overhead-cobra-su-puerta.spec.mjs
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
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
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

const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
await p.route('**/s101/**', (route) => {
  const r = new URL(route.request().url()).pathname.replace(/^\/s101/, '');
  if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
  return route.fulfill(ok({ filas: [] }));
});
await p.goto(base, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => typeof armarComponentes === 'function', null, { timeout: 20000 });

const INT = { formato: '18mm', acabado: 'laminado', chapa: null };
const FORMAICA = { formato: '18mm', acabado: 'formaica', chapa: null };
const NOGAL = { formato: '18mm', acabado: 'chapa', chapa: 'premium' };

/* Un gabinete de ese tipo, sin jaladera ni entrepaños, con esos materiales; y
 * lo que valen por su cuenta el interior y una puerta en las tablas de hoy. */
const caso = (tipo, fre) => p.evaluate(([tipo, INT, fre]) => {
  const c = armarComponentes('gabinete', { tipo, qty: 1, jaladera: 'ninguna', etp: 'ninguno' }, INT, fre)[0];
  return { unitario: c.unitario, interior: getPGAcabado(tipo, INT.formato, INT.acabado, INT.chapa), puerta: getPFAcabado('1puerta', fre.acabado, fre.chapa) };
}, [tipo, INT, fre]);

test('el overhead de 1 puerta cobra su interior más una puerta', async () => {
  const r = await caso('oh1', FORMAICA);
  assert.ok(r.puerta > 0, 'la tabla de frentes tiene precio para formaica');
  assert.equal(r.unitario, r.interior + r.puerta, 'interior + 1 puerta');
});

test('el overhead de 2 puertas cobra dos puertas', async () => {
  const r = await caso('oh2', FORMAICA);
  assert.equal(r.unitario, r.interior + 2 * r.puerta, 'interior + 2 puertas');
});

test('cambiar el frente de un overhead mueve su precio lo que cambia la puerta', async () => {
  const a = await caso('oh1', FORMAICA);
  const b = await caso('oh1', NOGAL);
  assert.notEqual(a.unitario, b.unitario, 'el precio se movió');
  assert.equal(b.unitario - a.unitario, b.puerta - a.puerta, 'exactamente lo que cambió la puerta');
});

test('una pieza con SUS materiales se recalcula con su frente (el caso de la captura)', async () => {
  const r = await p.evaluate(([INT, FORMAICA, NOGAL]) => {
    const c = armarComponentes('gabinete', { tipo: 'oh1', qty: 1, jaladera: 'ninguna', etp: 'ninguno' }, INT, FORMAICA)[0];
    const suyo = conMateriales({ ...c, materiales: { int: INT, fre: NOGAL } }, INT, FORMAICA);
    return { antes: c.unitario, despues: suyo.unitario };
  }, [INT, FORMAICA, NOGAL]);
  assert.ok(r.despues > r.antes, `con frente de nogal sube: ${r.antes} → ${r.despues}`);
});

test('el nicho abierto sigue sin puerta', async () => {
  const r = await caso('nicho', NOGAL);
  assert.equal(r.unitario, r.interior, 'sólo el interior');
});

test.after(async () => { await navegador.close(); servidor.close(); });
