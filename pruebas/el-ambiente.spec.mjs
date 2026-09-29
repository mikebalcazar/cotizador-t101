/* El ambiente de la pantalla se fue: sólo quedan las animaciones de interfaz.
 *
 * Mike, 29-sep-2026: «Hay que reducir el consumo de recursos de las apps en
 * MÓVIL. Es crítico. Empezando por quote. Hay que quitar los efectos del
 * fondo y las animaciones de ambiente. Solo dejar las animaciones de la
 * interfase.»
 *
 * Hasta G102 la app traía, detrás de todo y para siempre: una aurora
 * (body::before, 30 s, infinita, con `filter`), dos capas de partículas
 * (body::after y .fg-particles, 60 gradientes cada una, 10 s, infinitas),
 * tres orbes con `blur(40px)` y `mix-blend-mode`, y cristal esmerilado
 * (`backdrop-filter: blur`) en tarjetas, botones, cabeceras y velos. En un
 * teléfono eso es la GPU pintando pantalla completa cada cuadro, aunque nadie
 * toque nada.
 *
 * Esta prueba mide que nada de eso vuelva. Lo que sí puede seguir animado es
 * lo que responde a la persona: el indicador neón del cliente abierto, el pin
 * activo del armador, los despliegues cortos.
 *
 *     node --test pruebas/el-ambiente.spec.mjs
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

const NEGOCIO = { id: 'n-1', nombre: 'Taller Demo' };
const CLIENTES = [{ id: 'cl-1', nombre: 'Cliente Uno', negocio_id: 'n-1' }, { id: 'cl-2', nombre: 'Cliente Dos', negocio_id: 'n-1' }];

/** La app con una suite de mentiras y un cliente abierto: así hay un
 *  indicador neón activo, que es una animación de interfaz y debe quedarse. */
async function abrirApp() {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  await p.route('**/s101/**', (route) => {
    const r = new URL(route.request().url()).pathname.replace(/^\/s101/, '');
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Demo' }] }));
    if (r === '/orgs/org-1/negocios') return route.fulfill(ok({ filas: [NEGOCIO] }));
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: CLIENTES }));
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => /Cliente Uno/.test(document.querySelector('#root')?.innerText ?? ''), null, { timeout: 20000 });
  await p.waitForFunction(() => !document.getElementById('splash101'), null, { timeout: 10000 });
  return { ctx, p, errores };
}

test('sin aurora, partículas ni orbes: el fondo se pinta una vez y no hay capas de ambiente', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    const ambiente = await p.evaluate(() => {
      const anim = (el, pseudo) => getComputedStyle(el, pseudo).animationName;
      return {
        antes: anim(document.body, '::before'),
        despues: anim(document.body, '::after'),
        cuerpo: anim(document.body, null),
        orbes: document.querySelectorAll('.float-orb').length,
        particulas: document.querySelectorAll('.fg-particles').length,
        filtroCuerpo: getComputedStyle(document.body, '::before').filter,
      };
    });
    assert.equal(ambiente.antes, 'none', 'body::before ya no tiene la aurora animada');
    assert.equal(ambiente.despues, 'none', 'body::after ya no tiene partículas animadas');
    assert.equal(ambiente.cuerpo, 'none', 'el cuerpo no se anima');
    assert.equal(ambiente.orbes, 0, 'sin orbes flotantes');
    assert.equal(ambiente.particulas, 0, 'sin partículas en primer plano');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('sin cristal esmerilado: ningún elemento pintado lleva backdrop-filter', async () => {
  const { ctx, p } = await abrirApp();
  try {
    // Abrimos un cliente para que aparezcan tarjetas, botones y cabeceras.
    await p.locator('.cliente-block').first().click();
    await p.waitForTimeout(600);
    const conCristal = await p.evaluate(() => {
      const malos = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        const v = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
        if (v !== 'none') malos.push((el.className && String(el.className).slice(0, 40)) || el.tagName);
      }
      return malos;
    });
    assert.deepEqual(conCristal, [], 'nada lleva backdrop-filter');
    // Y lo que antes era translúcido se lee: la tarjeta del cliente es casi opaca.
    const fondo = await p.evaluate(() => getComputedStyle(document.querySelector('.cliente-block')).backgroundColor);
    const alfa = Number((fondo.match(/rgba?\([^)]*,\s*([\d.]+)\)/) || [])[1] ?? 1);
    assert.ok(alfa >= 0.85, `la tarjeta del cliente es casi opaca (${fondo})`);
  } finally { await ctx.close(); }
});

test('lo único que sigue animado sin parar es de interfaz (indicadores), no de ambiente', async () => {
  const { ctx, p } = await abrirApp();
  try {
    await p.locator('.cliente-block').first().click();
    await p.waitForTimeout(800);
    const infinitas = await p.evaluate(() => document.getAnimations()
      .filter((a) => a.effect?.getTiming?.().iterations === Infinity)
      .map((a) => {
        const t = a.effect.target;
        const pseudo = a.effect.pseudoElement || '';
        return (t === document.body ? 'body' : (t.className && String(t.className).trim()) || t.tagName) + pseudo;
      }));
    const deInterfaz = (n) => /neon-circle|arm-pin/.test(n);
    assert.deepEqual(infinitas.filter((n) => !deInterfaz(n)), [], `sin animaciones infinitas de ambiente (hay: ${infinitas.join(', ') || 'ninguna'})`);
    assert.ok(infinitas.some(deInterfaz), 'y el indicador neón del cliente abierto sí sigue latiendo');
  } finally { await ctx.close(); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
