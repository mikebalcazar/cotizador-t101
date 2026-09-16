/* Fase 1: ¿la versión de Cloudflare hace lo mismo que la de Netlify?
 *
 * El coordinador lo pidió así: «contado por Playwright a 390 × 844 y a 1440
 * (número de elementos y flujo de una cotización de punta a punta), sin
 * errores de JavaScript y sin peticiones a Google Fonts».
 *
 * Se cumple, pero repartido en dos mediciones distintas y por una razón:
 *
 *   1. **Que sea la misma app** se comprueba comparando los BYTES, no
 *      contando elementos en dos navegadores. Es una afirmación más fuerte
 *      —idéntico byte a byte no admite matices— y no depende de que el
 *      navegador salga a internet.
 *   2. **Que funcione** se comprueba con el navegador contra el Worker: que
 *      pinte a los dos tamaños, sin errores de JavaScript, sin Google Fonts y
 *      sin scroll horizontal. Eso es lo que la mudanza podría romper.
 *
 * ── 16-sep-2026, fase 2 ──────────────────────────────────────────────────
 * La comparación contra Netlify se retiró: medía que la mudanza NO cambiara
 * nada, y la fase 2 cambia algo a propósito —la app ya no se entrega sin
 * sesión—. En su lugar se comprueba que la puerta esté puesta y que lo que se
 * entrega CON sesión siga siendo, byte a byte, el `index.html` armado.
 *
 * Y para llegar a la app, estas pruebas ahora entran de verdad: el banco habla
 * con la API de PRUEBAS, donde `/auth/codigo` devuelve el código en la
 * respuesta, así que se puede abrir sesión sin buzón de correo. Nada de esto
 * toca producción.
 *
 * ── 16-sep-2026, la app deja Firebase ────────────────────────────────────
 * El aviso de «NADA DE ESCRIBIR» que estaba aquí ya no aplica, y por la mejor
 * de las razones: existía porque la app le pegaba a Firestore de PRODUCCIÓN,
 * con los clientes de verdad adentro, y una escritura desde una prueba les
 * habría escrito encima. Ahora la app guarda en la suite de PRUEBAS, por
 * `/s101/*` y con la sesión de esta prueba.
 *
 * Lo que sí se comprueba ahora es lo contrario: que no salga **ni una**
 * petición a Firebase. Mientras salga una, apagarlo rompe la app. El detalle
 * de cómo guarda —qué se crea, qué se actualiza, qué se borra y cómo se
 * convierte el dinero— se prueba sin navegador en `guardado.spec.mjs`, que es
 * donde se puede mirar de cerca.
 *
 *   node --test pruebas/paridad.spec.mjs
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

import { arrancar, cerrar } from './banco.mjs';

const PUERTO = 8793;
const NUEVO = `http://127.0.0.1:${PUERTO}`;

let nav;
let galleta = '';   // la sesión con la que el navegador abre la app
let galletaSuper = '';  // la del superadmin, sólo para armar y desarmar la empresa
const EMPRESA = `banco-${process.env.GITHUB_RUN_ID || Date.now()}`.slice(0, 40);
const SOCIA = `banco-${process.env.GITHUB_RUN_ID || Date.now()}@ejemplo.mx`.slice(0, 60);

/** Abre sesión contra la API de PRUEBAS, por el mismo `/s101/*` del Worker.
 *
 *  Fuera de producción `/auth/codigo` devuelve el código en la respuesta: es
 *  justo lo que permite que una prueba entre sola. En producción eso no pasa
 *  nunca, y la prueba de humo de la API lo comprueba. */
async function entrar(correo = process.env.CORREO_SUPERADMIN || 'mike@forespot.com') {
  const pide = (ruta, cuerpo) => fetch(NUEVO + ruta, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), redirect: 'manual',
  });
  const cod = await pide('/s101/auth/codigo', { correo }).then((r) => r.json());
  const codigo = cod?.data?.codigo_prueba;
  assert.ok(codigo, `la API de pruebas tiene que devolver el código para poder entrar (dijo: ${JSON.stringify(cod).slice(0, 160)})`);
  const ent = await pide('/s101/auth/entrar', { correo, codigo });
  assert.equal(ent.status, 200, 'entrar a la suite de pruebas');
  const puesta = ent.headers.getSetCookie?.() ?? [ent.headers.get('set-cookie')];
  const s101 = puesta.filter(Boolean).map((c) => c.split(';')[0]).find((c) => c.startsWith('s101='));
  assert.ok(s101, 'la API tiene que dejar la galleta de sesión');
  return s101;
}

/** Una petición a la suite de pruebas con una galleta dada. */
const conSesion = (ruta, opciones = {}, cookie = galletaSuper) => fetch(NUEVO + ruta, {
  method: opciones.method || 'GET',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined,
  redirect: 'manual',
}).then(async (r) => ({ estado: r.status, ...(await r.json().catch(() => ({}))) }));

/* La prueba se arma su propia empresa y entra como MIEMBRO de ella.
 *
 * No es ceremonia: hasta hoy entraba como superadmin, y un superadmin **no es
 * miembro de ninguna empresa**. Puede alcanzar cualquiera —para eso es—, pero
 * `/yo` le devuelve `orgs: []`, porque esa lista es de membresías. La app
 * necesita saber en qué empresa está, y con la lista vacía no hay respuesta
 * posible: se queda sin nada que enseñar.
 *
 * Eso tumbó esta corrida y fue una falla de verdad, no del banco: la prueba
 * estaba entrando con una cuenta que ninguna persona usa así. Mike y Fer sí son
 * miembros de Taller 101, y es su caso el que hay que medir.
 *
 * La empresa se borra al final. Lleva el número de la corrida en el nombre para
 * que dos corridas a la vez no se estorben. */
before(async () => {
  await arrancar(PUERTO);
  nav = await chromium.launch();

  galletaSuper = await entrar();
  const creada = await conSesion('/s101/admin/orgs', { method: 'POST', cuerpo: { id: EMPRESA, nombre: 'Banco de pruebas' } });
  assert.ok(creada.estado === 201 || creada.estado === 409, `crear la empresa de pruebas: ${creada.estado} ${creada.error || ''}`);
  const miembro = await conSesion(`/s101/admin/orgs/${EMPRESA}/miembros`, {
    method: 'POST', cuerpo: { correo: SOCIA, rol: 'owner', nombre: 'Socia del banco' },
  });
  assert.ok(miembro.estado === 201 || miembro.estado === 409, `dar de alta a la socia: ${miembro.estado} ${miembro.error || ''}`);

  galleta = await entrar(SOCIA);
  const yo = await conSesion('/s101/yo', {}, galleta);
  assert.deepEqual((yo.data?.orgs || []).map((o) => o.id), [EMPRESA],
    'la cuenta con la que se mide tiene que ser miembro de UNA empresa: es el caso de Mike y de Fer');
});

after(async () => {
  await nav?.close();
  // La empresa de pruebas se va con todo lo que la app haya escrito adentro.
  if (galletaSuper) {
    const r = await conSesion(`/s101/admin/orgs/${EMPRESA}`, { method: 'DELETE' });
    console.log(`    empresa de pruebas ${EMPRESA}: ${r.estado === 200 ? 'borrada' : 'NO se pudo borrar (' + r.estado + ')'}`);
  }
  await cerrar();
});

const huella = (b) => createHash('sha256').update(Buffer.from(b)).digest('hex');

/* ─────────────── 1. la puerta, y la app byte a byte ─────────────── */

test('sin sesión, la app no se entrega: manda a la pantalla de entrada', async () => {
  for (const ruta of ['/', '/index.html']) {
    const r = await fetch(NUEVO + ruta, { redirect: 'manual' });
    assert.equal(r.status, 302, `${ruta} debería mandar a entrar`);
    assert.ok(String(r.headers.get('location')).endsWith('/entrar.html'), `${ruta} → ${r.headers.get('location')}`);
  }
  const entrada = await fetch(NUEVO + '/entrar.html');
  assert.equal(entrada.status, 200, 'la pantalla de entrada sí es pública');
});

test('con sesión, el Worker entrega exactamente el index.html que se armó', async () => {
  const rutas = ['/', '/fonts/raleway-400.woff2', '/fonts/fira-cifras-400.woff2'];
  for (const ruta of rutas) {
    const servido = await fetch(NUEVO + ruta, { headers: { Cookie: galleta } })
      .then(async (r) => ({ codigo: r.status, cuerpo: Buffer.from(await r.arrayBuffer()) }));
    assert.equal(servido.codigo, 200, `el Worker contesta 200 en ${ruta}`);
    const local = await readFile(new URL('../publicar' + (ruta === '/' ? '/index.html' : ruta), import.meta.url));
    const ha = huella(servido.cuerpo), hb = huella(local);
    assert.equal(ha, hb,
      `${ruta}: el Worker sirve ${servido.cuerpo.length} bytes (${ha.slice(0, 12)}…) ` +
      `y lo armado son ${local.length} (${hb.slice(0, 12)}…)`);
    console.log(`    ${ruta}: ${servido.cuerpo.length} bytes, idénticos (${ha.slice(0, 12)}…)`);
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
  // Con la sesión de la suite puesta: sin ella, el Worker manda a la pantalla
  // de entrada y la app no se carga nunca.
  // El valor de la galleta puede traer `=` adentro (es una firma). Con
  // `split('=')` a secas se partía en el primero y el valor llegaba cortado al
  // navegador.
  const corte = galleta.indexOf('=');
  const nombre = galleta.slice(0, corte);
  const valor = galleta.slice(corte + 1);
  const ctx = await nav.newContext({ viewport, locale: 'es-MX' });
  await ctx.addCookies([{ name: nombre, value: valor, url: NUEVO }]);
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
  // marco, y después, cuando le contesta la suite, cambia «Cargando
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
    // Las dos librerías de cdnjs llegan con `integrity`: si el navegador las
    // aceptó, existen como globales; si la huella no cuadrara, las bloquearía
    // (y además saldría un error de consola).
    librerias: { exceljs: typeof window.ExcelJS !== 'undefined', jspdf: typeof window.jspdf !== 'undefined' },
  }));

  await ctx.close();
  // ¿Este navegador pudo salir a internet? Si no, la app cargó sin datos y
  // eso cambia qué se puede afirmar.
  // ¿El camino de datos se pudo medir? Ya no depende de internet: la app le
  // habla a la suite por su propio origen, y el banco la tiene enfrente.
  const hayInternet = !fallidas.includes(soloHost(NUEVO));
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
      assert.deepEqual(m.librerias, { exceljs: true, jspdf: true },
        'el navegador aceptó las huellas (integrity) de exceljs y jspdf y las dejó correr');
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

/* ─────────────── 3. a quién le habla la app ───────────────
 *
 * Aquí estaban las dos pruebas de la fase 1, y las dos decían lo contrario de
 * lo que hay que decir hoy:
 *
 *   · «cargar la app no escribe nada» existía porque la app le pegaba a
 *     Firestore de PRODUCCIÓN, donde estaban los clientes de verdad: un POST
 *     desde una prueba les habría escrito encima. Ahora la app le habla a la
 *     suite de pruebas, y un POST no es un peligro — al contrario, el primer
 *     arranque de una empresa sin negocio crea el suyo, y eso es correcto.
 *   · «sigue hablándole a Firestore» dejaba anotado el punto de partida para
 *     saber qué tenía que dejar de salir. Ya dejó de salir; lo que queda es
 *     comprobarlo.
 *
 * Lo que sí importa medir es a qué HOST sale, nunca la URL completa: la de
 * Firestore llevaba la llave. */

test('el navegador ve la misma empresa que la sesión con la que se armó', async () => {
  /* Esta prueba existe porque sin ella la falla se ve dos pantallas después y
   * no dice nada: la app se queda en blanco y el error que sale es «esta cuenta
   * no es miembro de ninguna empresa», que manda a revisar membresías cuando lo
   * que estaba mal era la galleta que el navegador llevaba.
   *
   * Se pregunta desde DENTRO de la página, por el mismo `/s101/*` que usa la
   * app, y se compara contra lo que ve node con la misma sesión. Si las dos no
   * coinciden, el problema es el transporte, no los datos. */
  const [corte] = [galleta.indexOf('=')];
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-MX' });
  await ctx.addCookies([{ name: galleta.slice(0, corte), value: galleta.slice(corte + 1), url: NUEVO }]);
  const pag = await ctx.newPage();
  await pag.goto(NUEVO, { waitUntil: 'domcontentloaded' });
  const visto = await pag.evaluate(async () => {
    const r = await fetch('/s101/yo', { credentials: 'same-origin' });
    const j = await r.json().catch(() => ({}));
    return { estado: r.status, orgs: (j?.data?.orgs || []).map((o) => o.id), superadmin: !!j?.data?.superadmin };
  });
  await ctx.close();
  console.log(`    el navegador ve: ${visto.estado} · orgs ${JSON.stringify(visto.orgs)} · superadmin ${visto.superadmin}`);
  assert.equal(visto.estado, 200, 'la página tiene que poder preguntar quién es');
  assert.deepEqual(visto.orgs, [EMPRESA],
    'el navegador tiene que ver la misma empresa que node con esta sesión');
});

test('la app ya NO le habla a Firebase: ni una petición', async () => {
  // Es la prueba de esta entrega. Mientras salga una sola petición a Firebase,
  // apagarlo rompe la app.
  const m = await mirar({ width: 1440, height: 900 });
  const hosts = [...new Set(m.peticiones
    .filter((p) => !p.url.startsWith(NUEVO) && !p.url.startsWith('data:') && !p.url.startsWith('blob:'))
    .map((p) => soloHost(p.url)))];
  console.log('    la app sale a:', hosts.join(', ') || '(a ningún tercero)');
  const firebase = hosts.filter((h) => /firebase|firestore|googleapis/.test(h));
  assert.deepEqual(firebase, [], 'cero peticiones a Firebase: es lo que permite apagarlo');
});

test('y lo que escribe lo escribe en su propio origen, por /s101', async () => {
  // No se exige cero escrituras: el primer arranque de una empresa sin negocio
  // crea el suyo, y eso está bien. Lo que no puede pasar es que una escritura
  // salga a un tercero.
  const m = await mirar({ width: 1440, height: 900 });
  const afuera = m.peticiones
    .filter((p) => p.metodo !== 'GET' && p.metodo !== 'HEAD')
    .filter((p) => !p.url.startsWith(NUEVO));
  assert.deepEqual(afuera.map((p) => `${p.metodo} ${soloHost(p.url)}`), [],
    'ninguna escritura sale del origen de la app');
  for (const e of m.peticiones.filter((p) => p.metodo !== 'GET' && p.metodo !== 'HEAD')) {
    assert.ok(new URL(e.url).pathname.startsWith('/s101/'),
      `una escritura fuera de /s101: ${e.metodo} ${new URL(e.url).pathname}`);
  }
});

test('las librerías de terceros siguen siendo las dos de cdnjs, y nada más', async () => {
  const m = await mirar({ width: 1440, height: 900 });
  const terceros = [...new Set(m.peticiones
    .filter((p) => !p.url.startsWith(NUEVO) && !p.url.startsWith('data:') && !p.url.startsWith('blob:'))
    .map((p) => soloHost(p.url)))];
  assert.deepEqual(terceros, ['cdnjs.cloudflare.com'],
    'la app sólo sale a cdnjs (exceljs y jspdf, con integrity). Cualquier otro host es nuevo y hay que mirarlo');
});

/* ─────────────── 3b. lo que viene de cdnjs viaja con huella ─────────────── */

// Huellas oficiales de cdnjs (api.cdnjs.com/libraries/<lib>/<versión>?fields=sri),
// comprobadas el 15-sep-2026 contra los archivos bajados: la misma huella. Si
// cdnjs sirviera otra cosa, el navegador la rechaza en vez de correrla.
const HUELLAS = {
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js':
    'sha512-dlPw+ytv/6JyepmelABrgeYgHI0O+frEwgfnPdXDTOIZz+eDgfW07QXG02/O8COfivBdGNINy+Vex+lYmJ5rxw==',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js':
    'sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==',
};

test('cada <script> de un tercero lleva integrity y crossorigin', async () => {
  // Con sesión: desde la fase 2 la app no se entrega sin ella.
  const html = await fetch(NUEVO + '/', { headers: { Cookie: galleta } }).then((r) => r.text());
  const externos = [...html.matchAll(/<script\b[^>]*\bsrc="(https?:\/\/[^"]+)"[^>]*>/g)];
  assert.equal(externos.length, Object.keys(HUELLAS).length,
    `hay ${externos.length} <script> externos; se esperaban ${Object.keys(HUELLAS).length} (los de la lista de huellas)`);
  for (const m of externos) {
    const [etiqueta, src] = m;
    assert.ok(HUELLAS[src], `${src} está en la lista de huellas`);
    assert.ok(etiqueta.includes(`integrity="${HUELLAS[src]}"`), `${src} lleva su integrity exacto`);
    assert.ok(/\bcrossorigin="anonymous"/.test(etiqueta), `${src} lleva crossorigin="anonymous" (sin él, integrity no aplica a un origen ajeno)`);
  }
  console.log(`    ${externos.length} scripts de cdnjs, los dos con huella sha512`);
});

/* ─────────────── 4. el reparto de rutas del Worker ─────────────── */

test('las notas de trabajo no se publican, y /s101cosas no se desvía', async () => {
  // Se pide CON sesión a propósito. Sin ella todo contesta 302 y la prueba
  // pasaría por la puerta, no por lo que se quiere medir: que estos archivos
  // no estén en lo que se publica. La puerta tapa el síntoma; esto mira la
  // causa.
  const conSesion = { headers: { Cookie: galleta } };
  const notas = await fetch(`${NUEVO}/claude/continuar.md`, conSesion);
  assert.equal(notas.status, 404, 'claude/ no está en lo que se publica, ni para quien entró');

  const operar = await fetch(`${NUEVO}/OPERAR.md`, conSesion);
  assert.equal(operar.status, 404, 'ni el contrato: sólo se publica lo de la lista');

  // Con `startsWith('/s101')` a secas, esto se le mandaría a la API
  // convertido en `cosas`.
  const casi = await fetch(`${NUEVO}/s101cosas`, conSesion);
  assert.equal(casi.status, 404, '/s101cosas es un archivo que no existe, no una ruta de la API');

  const salud = await fetch(`${NUEVO}/s101/salud`);
  assert.equal(salud.status, 200, '/s101/salud sí llega a la API');
  const cuerpo = await salud.json();
  assert.equal(cuerpo.ok, true);
  assert.equal(cuerpo.data.servicio, 'suite101-api');
  console.log(`    /s101/salud → contrato ${cuerpo.data.contrato}, entorno ${cuerpo.data.entorno}`);
});
