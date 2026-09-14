/* Fase 1: ¿la versión de Cloudflare hace lo mismo que la de Netlify?
 *
 * El coordinador lo pidió así: «contado por Playwright a 390 × 844 y a 1440
 * (número de elementos y flujo de una cotización de punta a punta), sin
 * errores de JavaScript y sin peticiones a Google Fonts».
 *
 * Se cumple, pero repartido en dos mediciones distintas y por una razón:
 *
 *   1. **Que sea la misma app** se comprueba comparando los BYTES que sirve
 *      cada uno, no contando elementos en dos navegadores. Es una afirmación
 *      más fuerte —idéntico byte a byte no admite matices— y además no
 *      depende de que el navegador pueda salir a internet, que aquí no puede:
 *      el Chromium de Playwright no alcanza `netlify.app` ni pasándole el
 *      proxy (ERR_CONNECTION_RESET), aunque `curl` y el `fetch` de Node sí.
 *   2. **Que funcione** se comprueba con el navegador contra el Worker: que
 *      pinte a los dos tamaños, sin errores de JavaScript, sin Google Fonts y
 *      sin scroll horizontal. Eso es lo que la mudanza podría romper.
 *
 * ⚠️ NADA DE ESCRIBIR. La app de hoy le habla directo a Firestore de
 * producción, donde están los clientes de verdad. Estas pruebas sólo **leen**,
 * y hay una comprobación explícita de que no salió ni un POST ni un PATCH. El
 * «flujo de punta a punta» que guarda una cotización se hará en la fase 3,
 * contra la org `demo` de staging, no aquí.
 *
 *   node --test pruebas/paridad.spec.mjs
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

import { arrancar, cerrar } from './banco.mjs';

const PUERTO = 8793;
const NUEVO = `http://127.0.0.1:${PUERTO}`;
const VIEJO = process.env.URL_VIEJO || 'https://cotizador-t101.netlify.app';

let nav;

before(async () => {
  await arrancar(PUERTO);
  nav = await chromium.launch();
});

after(async () => {
  await nav?.close();
  await cerrar();
});

const huella = (b) => createHash('sha256').update(Buffer.from(b)).digest('hex');

/* ─────────────── 1. la misma app, byte a byte ─────────────── */

test('el Worker sirve exactamente los mismos bytes que Netlify', async () => {
  const rutas = ['/', '/fonts/raleway-400.woff2', '/fonts/fira-cifras-400.woff2'];
  for (const ruta of rutas) {
    const [a, b] = await Promise.all([
      fetch(NUEVO + ruta).then(async (r) => ({ codigo: r.status, cuerpo: await r.arrayBuffer() })),
      fetch(VIEJO + ruta).then(async (r) => ({ codigo: r.status, cuerpo: await r.arrayBuffer() })),
    ]);
    assert.equal(a.codigo, 200, `el Worker contesta 200 en ${ruta}`);
    assert.equal(b.codigo, 200, `Netlify contesta 200 en ${ruta}`);
    const ha = huella(a.cuerpo), hb = huella(b.cuerpo);
    assert.equal(
      ha, hb,
      `${ruta}: el Worker sirve ${a.cuerpo.byteLength} bytes (${ha.slice(0, 12)}…) ` +
      `y Netlify ${b.cuerpo.byteLength} (${hb.slice(0, 12)}…)`,
    );
    console.log(`    ${ruta}: ${a.cuerpo.byteLength} bytes, idénticos (${ha.slice(0, 12)}…)`);
  }
});

/* ─────────────── 2. que funcione, en el navegador ─────────────── */

const TAMANOS = [
  { nombre: 'celular', width: 390, height: 844 },
  { nombre: 'computadora', width: 1440, height: 900 },
];

/** El host de una URL, sin la cadena de consulta.
 *
 *  Nunca se registra una URL completa: la de Firestore lleva la llave de la
 *  app en `?key=`. No es secreta —una llave web de Firebase está hecha para
 *  ser pública— pero no tiene por qué acabar en el registro de una prueba, en
 *  un commit ni en el log de un corredor. */
const soloHost = (u) => { try { return new URL(u).host; } catch { return '(url rara)'; } };

/** Carga el Worker y devuelve lo que hace falta para juzgarlo. */
async function mirar(viewport) {
  const ctx = await nav.newContext({ viewport, locale: 'es-MX' });
  const pag = await ctx.newPage();

  const errores = [];
  const peticiones = [];
  const escrituras = [];
  const fallidas = [];
  pag.on('pageerror', (e) => errores.push(String(e).slice(0, 300)));
  pag.on('console', (m) => { if (m.type() === 'error') errores.push('console: ' + m.text().slice(0, 300)); });
  pag.on('request', (r) => {
    peticiones.push({ url: r.url(), metodo: r.method() });
    if (r.method() !== 'GET' && r.method() !== 'HEAD') escrituras.push(`${r.method()} ${soloHost(r.url())}`);
  });
  pag.on('requestfailed', (r) => fallidas.push(soloHost(r.url())));

  const res = await pag.goto(NUEVO, { waitUntil: 'load', timeout: 60000 });

  // La app arranca en dos tiempos: primero cambia «Cargando quote101…» por su
  // marco, y después, cuando le contesta Firestore, cambia «Cargando
  // proyectos…» por la lista. **Hay que esperar los dos.** Esperar sólo el
  // primero fue un error de esta misma prueba el 12-sep: pasaba en verde con
  // la app a medio cargar, que es precisamente lo que no se quiere medir.
  await pag.waitForFunction(
    () => {
      const r = document.getElementById('root');
      return r && r.children.length > 0 && !r.innerText.includes('Cargando quote101');
    },
    { timeout: 60000 },
  );
  const cargoDatos = await pag
    .waitForFunction(() => !document.body.innerText.includes('Cargando proyectos'), { timeout: 45000 })
    .then(() => true)
    .catch(() => false);
  await pag.waitForTimeout(1200);

  const m = await pag.evaluate(() => ({
    nodos: document.querySelectorAll('*').length,
    botones: document.querySelectorAll('button').length,
    campos: document.querySelectorAll('input, select, textarea').length,
    texto: document.body.innerText.replace(/\s+/g, ' ').trim().length,
    anchoScroll: document.documentElement.scrollWidth,
    ventana: window.innerWidth,
    // La marca ya no es texto (desde el 14-sep va en trazos, como la de
    // quell101): se busca el logotipo por su etiqueta accesible, no por la palabra.
    marca: !!document.querySelector('svg[aria-label="quote101"]'),
  }));

  await ctx.close();
  // ¿Este navegador pudo salir a internet? Si no, la app cargó sin datos y
  // eso cambia qué se puede afirmar.
  const hayInternet = !fallidas.includes('firestore.googleapis.com');
  return { codigo: res?.status(), errores, peticiones, escrituras, fallidas, cargoDatos, hayInternet, ...m };
}

for (const t of TAMANOS) {
  test(`a ${t.width}×${t.height} (${t.nombre}) la app arranca y pinta, sin errores`, async () => {
    const m = await mirar({ width: t.width, height: t.height });
    assert.equal(m.codigo, 200);

    // El marco de la app: se pinta siempre, haya datos o no.
    assert.ok(m.marca, 'la app pintó su marca');
    assert.ok(m.nodos > 25, `pintó ${m.nodos} elementos, más que el «Cargando…» de arranque`);
    assert.ok(m.anchoScroll <= m.ventana + 1,
      `cero scroll horizontal (${m.anchoScroll} vs ${m.ventana})`);

    const google = m.peticiones.filter((p) => /fonts\.(googleapis|gstatic)\.com/.test(p.url));
    assert.deepEqual(google, [], 'cero peticiones a Google Fonts');

    const propias = m.peticiones.filter((p) => p.url.startsWith(NUEVO) && p.url.endsWith('.woff2'));
    assert.ok(propias.length >= 2, `sirvió ${propias.length} fuentes desde su propio origen`);

    // En el corredor SÍ hay internet, y ahí no se acepta la salida de
    // cortesía: `EXIGIR_INTERNET=1` convierte «no se pudo medir» en rojo. Sin
    // esto, el modo sin internet sería un agujero por donde la prueba pasa
    // siempre — justo lo que se le criticó a `revisar.sh` de taller101.
    if (process.env.EXIGIR_INTERNET === '1') {
      assert.ok(m.hayInternet,
        `se exigió medir el camino de datos y el navegador no salió a internet. No alcanzó: ${[...new Set(m.fallidas)].join(', ')}`);
    }

    // Aquí se separan los dos mundos, y se dice en voz alta en cuál se corrió.
    if (m.hayInternet) {
      assert.ok(m.cargoDatos, 'con internet, la app tiene que terminar de cargar los proyectos');
      assert.deepEqual(m.errores, [], 'cero errores de JavaScript');
      console.log(`    ${t.nombre} CON internet: ${m.nodos} elementos · ${m.botones} botones · ` +
                  `${m.campos} campos · ${m.texto} caracteres · ${propias.length} fuentes propias`);
    } else {
      // El Chromium de esta máquina no sale a internet. La app carga sin
      // datos y se queda en su estado vacío. Eso NO se disfraza de verde:
      // se dice, y lo que no se pudo medir queda nombrado.
      console.log(`    ${t.nombre} SIN internet en el navegador: ${m.nodos} elementos · ` +
                  `${m.botones} botones · ${m.texto} caracteres · ${propias.length} fuentes propias`);
      console.log(`      NO se midió el camino de datos. No alcanzó: ${[...new Set(m.fallidas)].join(', ')}`);
      console.log('      Eso se mide en el corredor, que sí tiene internet.');
    }
  });
}

/* ─────────────── 3. que no toque los datos de verdad ─────────────── */

test('cargar la app no escribe nada: sólo lecturas', async () => {
  const m = await mirar({ width: 1440, height: 900 });
  assert.deepEqual(m.escrituras, [],
    'cargar la app no debe mandar ni un POST ni un PATCH: son datos de clientes de verdad');
});

test('a quién le habla la app hoy, dicho con números', async () => {
  // No es pasa/no pasa: es dejar anotado a dónde sale la app tal como está,
  // para que la fase 2 sepa qué tiene que dejar de salir. Se cuenta a qué
  // HOST sale, nunca la URL completa: la de Firestore lleva la llave.
  const m = await mirar({ width: 1440, height: 900 });
  const porHost = {};
  for (const p of m.peticiones) {
    if (p.url.startsWith(NUEVO) || p.url.startsWith('data:') || p.url.startsWith('blob:')) continue;
    const h = soloHost(p.url);
    porHost[h] = (porHost[h] || 0) + 1;
  }
  console.log('    la app sale a:', JSON.stringify(porHost));
  assert.ok(porHost['firestore.googleapis.com'] > 0,
    'sigue hablándole a Firestore: la fase 1 no cambia comportamiento, y eso es lo esperado');
  assert.ok(porHost['cdnjs.cloudflare.com'] > 0,
    'y sigue bajando exceljs y jspdf de un CDN: pendiente de la fase 2');
});

/* ─────────────── 4. el reparto de rutas del Worker ─────────────── */

test('las notas de trabajo no se publican, y /s101cosas no se desvía', async () => {
  const notas = await fetch(`${NUEVO}/claude/continuar.md`);
  assert.equal(notas.status, 404, 'claude/ no está en lo que se publica');

  // Con `startsWith('/s101')` a secas, esto se le mandaría a la API
  // convertido en `cosas`.
  const casi = await fetch(`${NUEVO}/s101cosas`);
  assert.equal(casi.status, 404, '/s101cosas es un archivo que no existe, no una ruta de la API');

  const salud = await fetch(`${NUEVO}/s101/salud`);
  assert.equal(salud.status, 200, '/s101/salud sí llega a la API');
  const cuerpo = await salud.json();
  assert.equal(cuerpo.ok, true);
  assert.equal(cuerpo.data.servicio, 'suite101-api');
  console.log(`    /s101/salud → contrato ${cuerpo.data.contrato}, entorno ${cuerpo.data.entorno}`);
});
