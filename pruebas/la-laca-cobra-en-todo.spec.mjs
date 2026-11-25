/* La laca 2K cobra en todo lo que lleva frente.
 *
 * Mike, 25-nov-2026, con captura de quote: «estoy colocando puertas de closet
 * con laca 2k y salen solo $150. Revisa que lleve los mismos escalones de lo
 * demás. Y revisa todos los acabados con laca 2k». Lo que pasaba: las tablas
 * de puertas de closet (PP), puertas de gabinete (PPG), entrepaños (PE) y
 * postes (PPO) no tenían renglón de laca. La puerta de closet salía en $0 (los
 * $150 eran la jaladera), la de gabinete al precio de prelaminado, y
 * entrepaños y postes en $0. Decisión de Mike, con botones: «Como frentes de
 * gabinete»: laca = chapa premium × (laca / premium de la tabla de frentes).
 *
 * Mide contra las tablas de la app, no contra números escritos aquí.
 *
 *     npm run armar && node --test pruebas/la-laca-cobra-en-todo.spec.mjs
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
const LACA = { formato: '18mm', acabado: 'laca2k', chapa: null };
const PREMIUM = { formato: '18mm', acabado: 'chapa', chapa: 'premium' };
const unitario = (tipo, data, fre) => p.evaluate(([tipo, data, INT, fre]) => armarComponentes(tipo, data, INT, fre)[0].unitario, [tipo, data, INT, fre]);
const factor = () => p.evaluate(() => PF['1puerta'].laca2k / PF['1puerta'].chapa.premium);
const redondo = (n) => Math.round(n / 10) * 10;

test('la puerta de closet abatible en laca cobra el escalón de los frentes, no sólo la jaladera', async () => {
  const d = { tipo: 'abatible', jaladera: 'normal', qty: 1 };
  const [laca, premium, jal, f] = [await unitario('puerta', d, LACA), await unitario('puerta', d, PREMIUM), await p.evaluate(() => JALADERAS.normal), await factor()];
  assert.ok(laca > 1000, `ya no sale en ${laca}`);
  assert.equal(laca - jal, redondo((premium - jal) * f), 'premium por la proporción de los frentes');
});

test('corrediza y plegable también', async () => {
  for (const tipo of ['corrediza', 'plegable']) {
    const laca = await p.evaluate((t) => getP(t, '18mm', 'laca2k', null), tipo);
    const prem = await p.evaluate((t) => getP(t, '18mm', 'chapa', 'premium'), tipo);
    assert.equal(laca, redondo(prem * await factor()), tipo);
  }
});

test('la puerta de gabinete en laca ya no cobra como prelaminado', async () => {
  const r = await p.evaluate(() => ({ laca: getPPG('laca2k', null), lam: getPPG('laminado', null), prem: getPPG('chapa', 'premium') }));
  assert.notEqual(r.laca, r.lam);
  assert.equal(r.laca, redondo(r.prem * await factor()));
});

test('entrepaños y postes en laca ya no salen en $0', async () => {
  const r = await p.evaluate(() => ({ e: getE('50-60cm', '18mm', 'laca2k', null), ep: getE('50-60cm', '18mm', 'chapa', 'premium'), po: getPO('50-60cm', '18mm', 'laca2k', null), pop: getPO('50-60cm', '18mm', 'chapa', 'premium') }));
  const f = await factor();
  assert.ok(r.e > 0 && r.po > 0, JSON.stringify(r));
  assert.equal(r.e, redondo(r.ep * f));
  assert.equal(r.po, redondo(r.pop * f));
});

test('si cambia la tabla de frentes, la laca se mueve con ella', async () => {
  const r = await p.evaluate(() => {
    const antes = getP('abatible', '18mm', 'laca2k', null);
    const viejo = PF['1puerta'].laca2k; PF['1puerta'].laca2k = PF['1puerta'].chapa.premium * 1.2;
    const despues = getP('abatible', '18mm', 'laca2k', null);
    PF['1puerta'].laca2k = viejo;
    return { antes, despues, premium: getP('abatible', '18mm', 'chapa', 'premium') };
  });
  assert.equal(r.despues, Math.round(r.premium * 1.2 / 10) * 10);
  assert.ok(r.despues > r.antes);
});

test('lo que ya cobraba laca sigue igual: frentes de gabinete y lambrín', async () => {
  const r = await p.evaluate(() => ({ fr: getPFAcabado('1puerta', 'laca2k', null), pfr: PF['1puerta'].laca2k, cj: getPFAcabado('frenteCajon', 'laca2k', null), pcj: PF.frenteCajon.laca2k }));
  assert.equal(r.fr, r.pfr);
  assert.equal(r.cj, r.pcj);
});

test.after(async () => { await navegador.close(); servidor.close(); });
