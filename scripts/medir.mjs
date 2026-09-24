/* Mide un quote101 ya publicado. Se corre desde el corredor, que sí tiene
 * internet y sí alcanza `*.workers.dev`.
 *
 *   node scripts/medir.mjs https://quote101-staging.mike-929.workers.dev staging
 *   node scripts/medir.mjs https://quote101.mike-929.workers.dev produccion
 *
 * Qué comprueba, y por qué cada cosa:
 *
 *   · la app NO se entrega sin sesión: `/` manda a `entrar.html` (fase 2).
 *     Es la comprobación que más importa de esta medición;
 *   · `huella.txt` es **byte a byte** la huella del `index.html` de este
 *     commit. Antes se bajaba la app entera y se comparaba; desde que la app
 *     pide sesión eso ya no se puede, y la huella conserva la misma garantía:
 *     que lo publicado es lo que se armó, y no una copia vieja que el borde
 *     todavía sirve;
 *   · la pantalla de entrada sí es pública, y trae su marca;
 *   · las fuentes salen del propio origen;
 *   · `/s101/salud` llega a la API y contesta el entorno que toca. Si eso
 *     falla, el *service binding* no está puesto y la fase 2 no podría ni
 *     empezar;
 *   · `/s101cosas` NO se desvía a la API;
 *   · `claude/` no está publicado. Esto no es paranoia: el 12-sep las notas
 *     de trabajo del chat acabaron en internet por servir la raíz del
 *     repositorio en Netlify;
 *   · y, midiendo producción, que la dirección VIEJA de Netlify ya no sirva
 *     el cotizador sin puerta. El 16-sep el candado se saltaba con sólo usar
 *     esa liga, y estuvo a punto de quedar reportado como cerrado.
 *
 * Sale con 1 si algo no cuadra. Una medición que no puede fallar no prueba
 * nada.
 */

import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] || '').replace(/\/$/, '');
const ENTORNO = process.argv[3] || 'staging';
if (!BASE) {
  console.error('uso: node scripts/medir.mjs <url> [staging|produccion]');
  process.exit(1);
}

const huella = (b) => createHash('sha256').update(Buffer.from(b)).digest('hex');
let fallas = 0;

const ok = (t) => console.log(`  ok    ${t}`);
const mal = (t) => { console.log(`  FALLA ${t}`); fallas += 1; };
const rev = (cond, t) => (cond ? ok(t) : mal(t));

/** Un estado que NO tumba el despliegue, porque no lo puede arreglar este
 *  repositorio.
 *
 *  Se usa para `cotizador-t101-old`: es un sitio de Netlify que Mike va a
 *  borrar a mano. Contarlo como falla dejaría el despliegue en rojo por algo
 *  que ningún commit puede cerrar. Se reporta en cada medición, con la palabra
 *  PENDIENTE, hasta que esté cerrado; entonces se convierte en un `rev` de
 *  verdad. */
const aviso = (cond, t) => console.log(`  ${cond ? 'ok   ' : 'PENDIENTE'} ${t}`);

/** Trae una ruta, reintentando hasta que conteste lo que se espera.
 *
 *  **Se reintenta también el 404**, no sólo el 500. Un Worker recién
 *  publicado contesta 404 unos segundos antes de que el borde lo suelte, y la
 *  primera versión de este guion se lo tragó como falla: el run 1 midió cuatro
 *  fallas contra un Worker que, comprobado medio minuto después, servía
 *  perfectamente los 574 635 bytes. dash101 ya había pagado esa lección en
 *  septiembre y aquí no se aplicó.
 *
 *  Para las rutas que SÍ deben dar 404 se pasa `esperado: 404`, y entonces
 *  contestan a la primera. */
async function traer(ruta, { esperado = 200, intentos = 18, espera = 5000 } = {}) {
  let ultimo = 'sin respuesta';
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(BASE + ruta, { redirect: 'manual' });
      if (r.status === esperado) return r;
      ultimo = `${r.status}`;
      // Un código que no es el esperado y tampoco es «todavía no está» (404 o
      // 5xx) no va a cambiar por esperar: se devuelve y que falle la
      // comprobación, con su número.
      if (r.status !== 404 && r.status < 500) return r;
    } catch (e) { ultimo = e.cause?.code || e.message; }
    if (i < intentos) await new Promise((s) => setTimeout(s, espera));
  }
  console.log(`  (${ruta}: ${intentos} intentos y seguía en ${ultimo})`);
  return new Response(null, { status: 599 });
}

console.log(`Midiendo ${BASE}  (${ENTORNO})`);
console.log();

// 1 · la app NO se entrega sin sesión
//
// Es lo que trajo la fase 2. Hasta el 16-sep, quien supiera la dirección abría
// el cotizador entero; ahora el Worker se niega a entregarlo y manda a la
// pantalla de entrada. Se comprueba desde afuera, sin sesión, que es justo
// como llegaría un desconocido.
const raiz = await traer('/', { esperado: 302 });
rev(raiz.status === 302, `la app pide sesión: / contesta 302 (${raiz.status})`);
rev((raiz.headers.get('location') || '').endsWith('/entrar.html'),
  `y manda a la pantalla de entrada (${raiz.headers.get('location') || 'sin location'})`);
const appDirecta = await traer('/index.html', { esperado: 302 });
rev(appDirecta.status === 302, `pedir /index.html a la mala tampoco la entrega (${appDirecta.status})`);

// 1b · la pantalla de entrada sí es pública
const entrada = await traer('/entrar.html');
const htmlEntrada = await entrada.text();
rev(entrada.status === 200, `la pantalla de entrada contesta 200 (${entrada.status})`);
rev(htmlEntrada.includes('quote101'), 'y trae su marca');
rev(!/firestore\.googleapis|AIza/.test(htmlEntrada),
  'la pantalla pública no lleva ni la dirección de la base ni su llave');
const entrajs = await traer('/entrar.js');
rev(entrajs.status === 200, `su código sale del propio origen (/entrar.js → ${entrajs.status})`);

// 1c · lo publicado es lo que se armó
//
// Antes esto se medía bajando `index.html` y comparándolo byte a byte. Ya no
// se puede —pide sesión—, así que se compara su huella, que `armar.mjs` deja
// en `huella.txt`. Se reintenta: el borde suelta la versión nueva unos
// segundos después de que wrangler dice «Deployed», y el 14-sep una medición
// hecha al instante tumbó una corrida buena.
const local = await readFile(fileURLToPath(new URL('../publicar/index.html', import.meta.url)));
const hl = huella(local);
let hs = null;
for (let i = 1; i <= 18; i++) {
  const r = await traer('/huella.txt');
  hs = r.status === 200 ? (await r.text()).trim() : null;
  if (hs === hl) break;
  if (i === 1) console.log('  (la huella servida todavía es la anterior: esperando a que el borde suelte la nueva)');
  if (i < 18) await new Promise((s) => setTimeout(s, 5000));
}
rev(hs === hl,
  `lo publicado es lo que se armó: ${local.length} bytes, sha256 ${String(hs).slice(0, 12)}… vs ${hl.slice(0, 12)}…`);

// 1d · lo que viene de cdnjs viaja con huella (15-sep-2026, barrido de
// seguridad): cada <script> externo lleva integrity + crossorigin. La huella
// exacta la comprueba paridad.spec.mjs contra la lista oficial de cdnjs; aquí
// se mide sobre lo ARMADO, que es lo que se acaba de publicar y cuya huella
// quedó comprobada arriba.
const html = local.toString('utf-8');
const externos = [...html.matchAll(/<script\b[^>]*\bsrc="https?:\/\/[^"]+"[^>]*>/g)].map((m) => m[0]);
rev(externos.length === 2, `hay ${externos.length} <script> externos (se esperaban 2: exceljs y jspdf)`);
rev(externos.every((e) => /\bintegrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/.test(e) && /\bcrossorigin="anonymous"/.test(e)),
  'los dos llevan integrity y crossorigin: si cdnjs sirviera otra cosa, el navegador la rechaza');

// 1e · la app ya no lleva Firebase adentro
//
// Es la comprobación de esta entrega, y se hace sobre lo ARMADO porque
// `index.html` ya no se puede bajar sin sesión —y su huella, que sí se acaba de
// comprobar arriba, es de este mismo archivo—.
//
// Se buscan tres cosas: la dirección de Firestore, la de Storage, y el prefijo
// `AIza` de una llave de Google. Mientras alguna esté, la app sigue teniendo un
// camino a Firebase y apagarlo la rompe. Y la llave, además, estaba a la vista
// de cualquiera que abriera la página: era el hueco, no un detalle.
const rastros = [
  ['firestore.googleapis.com', /firestore\.googleapis\.com/],
  ['firebasestorage', /firebasestorage/],
  ['una llave de Google (AIza…)', /AIza[0-9A-Za-z_-]{20,}/],
];
for (const [que, patron] of rastros) {
  // Los comentarios del código sí pueden nombrar a Firestore para contar de
  // dónde se viene: lo que no puede quedar es una dirección viva ni una llave.
  const sinComentarios = html
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  rev(!patron.test(sinComentarios), `la app publicada no lleva ${que}`);
}

// 2 · las fuentes, del propio origen
const fuente = await traer('/fonts/raleway-400.woff2');
rev(fuente.status === 200 && Number(fuente.headers.get('content-length') || 1) > 0,
  `las fuentes salen de aquí (/fonts/raleway-400.woff2 → ${fuente.status})`);

// 3 · el enlace a la suite
const salud = await traer('/s101/salud');
let cuerpo = null;
try { cuerpo = await salud.json(); } catch { /* no vino JSON */ }
rev(salud.status === 200 && cuerpo?.ok === true, `/s101/salud llega a la API (${salud.status})`);
if (cuerpo?.ok) {
  rev(cuerpo.data.servicio === 'suite101-api', `del otro lado está suite101-api`);
  rev(cuerpo.data.entorno === ENTORNO,
    `y es el entorno que toca: esperado ${ENTORNO}, contestó ${cuerpo.data.entorno}`);
  console.log(`        contrato ${cuerpo.data.contrato} · d1 ${cuerpo.data.d1}`);
}

// 4 · lo que NO se debe desviar ni publicar
//
// `/s101cosas` no lleva sesión, así que desde la fase 2 lo que contesta es el
// 302 de la puerta. Lo que se mide sigue siendo lo mismo: que NO se desvíe a
// la API, o sea que no conteste lo que contestaría la API.
const casi = await traer('/s101cosas', { esperado: 302 });
rev(casi.status === 302 || casi.status === 404, `/s101cosas no se desvía a la API (${casi.status})`);
rev(!(casi.headers.get('content-type') || '').includes('json'), 'y desde luego no contesta JSON de la API');

// Que las notas y el contrato no salgan se mide en DOS lados, porque la puerta
// tapa el síntoma pero no la causa: sin sesión contestan 302, pero si alguien
// los metiera a la lista de `armar.mjs`, cualquiera CON sesión podría leerlos.
// Por eso se comprueba también la carpeta que se acaba de armar.
for (const ruta of ['/claude/continuar.md', '/OPERAR.md']) {
  const r = await traer(ruta, { esperado: 302 });
  rev(r.status === 302 || r.status === 404, `${ruta} no se entrega (${r.status})`);
}
for (const nombre of ['claude', 'OPERAR.md', 'README.md']) {
  const hay = await stat(fileURLToPath(new URL('../publicar/' + nombre, import.meta.url))).then(() => true).catch(() => false);
  rev(!hay, `${nombre} no está en lo que se publicó`);
}

/* 5 · las direcciones viejas de Netlify, sólo al medir producción
 *
 * Netlify se retiró de la suite el 24-sep (lo decidió Mike, con la cuenta
 * suspendida por uso). Lo que importa medir sigue siendo lo mismo: que
 * `cotizador-t101.netlify.app` —y `cotizador-t101-old`— NO sirvan el
 * cotizador. Cada respuesta dice algo distinto:
 *
 *   · 404, 410 o que el nombre no resuelva: el sitio ya no existe. Cerrado.
 *   · 302 a quote101: el sitio existe y sólo redirige. Inofensivo, pero falta
 *     borrarlo: se avisa.
 *   · 5xx: Netlify suspendido o caído. El sitio EXISTE y vuelve cuando vuelva
 *     la cuota («un sitio caído no es un sitio cerrado»): se avisa que falta
 *     borrarlo. No tumba la publicación: no es algo que arregle un commit.
 *   · 200 o cualquier otra cosa: algo se está sirviendo ahí. Falla.
 *
 * El borrado lo hace Mike en netlify.com: el conector del chat no borra.
 * Hasta entonces `netlify.toml` se queda: sin él, un sitio que volviera
 * serviría la raíz del repositorio, sin puerta.
 */
async function comoContesta(url) {
  try {
    const r = await fetch(url + '/', { redirect: 'manual' });
    return { codigo: r.status, destino: r.headers.get('location') || '', texto: String(r.status) };
  } catch (e) {
    return { codigo: 0, destino: '', texto: e.cause?.code || e.message };
  }
}
if (ENTORNO === 'produccion') {
  for (const vieja of ['https://cotizador-t101.netlify.app', 'https://cotizador-t101-old.netlify.app']) {
    const nombre = vieja.replace('https://', '');
    const r = await comoContesta(vieja);
    if (r.codigo === 0 || r.codigo === 404 || r.codigo === 410) {
      rev(true, `${nombre} ya no existe (${r.texto})`);
    } else if (r.codigo === 302 || r.codigo === 301) {
      rev(r.destino.startsWith(BASE), `${nombre} sólo redirige a la dirección con puerta (${r.destino || 'sin location'})`);
      aviso(false, `${nombre} todavía existe en Netlify: falta borrarlo (Mike, netlify.com)`);
    } else if (r.codigo >= 500) {
      aviso(false, `${nombre} contestó ${r.texto}: Netlify suspendido o caído. El sitio sigue existiendo ` +
        'y vuelve cuando vuelva la cuota; falta borrarlo (Mike, netlify.com)');
    } else {
      rev(false, `${nombre} está sirviendo algo (${r.texto}): no debería contestar nada`);
    }
  }
}

console.log();
if (fallas > 0) {
  console.log(`RESULTADO: ${fallas} comprobación(es) fallaron`);
  process.exit(1);
}
console.log('RESULTADO: todo verde');
