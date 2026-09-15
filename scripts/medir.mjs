/* Mide un quote101 ya publicado. Se corre desde el corredor, que sí tiene
 * internet y sí alcanza `*.workers.dev`.
 *
 *   node scripts/medir.mjs https://quote101-staging.mike-929.workers.dev staging
 *   node scripts/medir.mjs https://quote101.mike-929.workers.dev produccion
 *
 * Qué comprueba, y por qué cada cosa:
 *
 *   · la portada contesta 200 y es **byte a byte** el `index.html` de este
 *     commit. No «parecida»: idéntica. Así se sabe que lo publicado es lo que
 *     se armó, y no una copia vieja que el borde todavía sirve;
 *   · las fuentes salen del propio origen;
 *   · `/s101/salud` llega a la API y contesta el entorno que toca. Si eso
 *     falla, el *service binding* no está puesto y la fase 2 no podría ni
 *     empezar;
 *   · `/s101cosas` NO se desvía a la API;
 *   · `claude/` no está publicado. Esto no es paranoia: el 12-sep las notas
 *     de trabajo del chat acabaron en internet por servir la raíz del
 *     repositorio en Netlify.
 *
 * Sale con 1 si algo no cuadra. Una medición que no puede fallar no prueba
 * nada.
 */

import { readFile } from 'node:fs/promises';
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

// 1 · la portada, byte a byte contra este commit
//
// Se reintenta también cuando contesta 200 pero con la portada ANTERIOR: el
// borde de Cloudflare suelta la versión nueva unos segundos después de que
// wrangler dice «Deployed». El 14-sep (corrida 34900841447) la medición se
// hizo al instante, comparó 574 635 bytes viejos contra 584 615 armados y
// tumbó la corrida, con el Worker sirviendo la portada nueva medio minuto
// después. Hasta 18 intentos cada 5 s; si sigue distinta, sí es falla.
const local = await readFile(fileURLToPath(new URL('../publicar/index.html', import.meta.url)));
const hl = huella(local);
let portada, servido, hs;
for (let i = 1; i <= 18; i++) {
  portada = await traer('/');
  servido = Buffer.from(await portada.arrayBuffer());
  hs = huella(servido);
  if (portada.status === 200 && hs === hl) break;
  if (i === 1) console.log('  (la portada servida todavía es la anterior: esperando a que el borde suelte la nueva)');
  if (i < 18) await new Promise((s) => setTimeout(s, 5000));
}
rev(portada.status === 200, `la portada contesta 200 (${portada.status})`);
rev(hl === hs,
  `la portada es idéntica al commit: ${servido.length} bytes servidos, ${local.length} armados ` +
  `(${hs.slice(0, 12)}… vs ${hl.slice(0, 12)}…)`);

// 1b · lo que viene de cdnjs viaja con huella (15-sep-2026, barrido de
// seguridad): cada <script> externo lleva integrity + crossorigin. La huella
// exacta la comprueba paridad.spec.mjs contra la lista oficial de cdnjs; aquí
// se mide que lo PUBLICADO la trae, en staging y en producción.
const html = servido.toString('utf-8');
const externos = [...html.matchAll(/<script\b[^>]*\bsrc="https?:\/\/[^"]+"[^>]*>/g)].map((m) => m[0]);
rev(externos.length === 2, `hay ${externos.length} <script> externos (se esperaban 2: exceljs y jspdf)`);
rev(externos.every((e) => /\bintegrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/.test(e) && /\bcrossorigin="anonymous"/.test(e)),
  'los dos llevan integrity y crossorigin: si cdnjs sirviera otra cosa, el navegador la rechaza');

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
const casi = await traer('/s101cosas', { esperado: 404 });
rev(casi.status === 404, `/s101cosas no se desvía a la API (${casi.status})`);
const notas = await traer('/claude/continuar.md', { esperado: 404 });
rev(notas.status === 404, `las notas de trabajo no están publicadas (${notas.status})`);
const operar = await traer('/OPERAR.md', { esperado: 404 });
rev(operar.status === 404, `ni el contrato: sólo se publica lo de la lista (${operar.status})`);

console.log();
if (fallas > 0) {
  console.log(`RESULTADO: ${fallas} comprobación(es) fallaron`);
  process.exit(1);
}
console.log('RESULTADO: todo verde');
