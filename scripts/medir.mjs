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

/** Reintenta: un Worker recién publicado tarda unos segundos en servir. */
async function traer(ruta, intentos = 12) {
  let ultimo;
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(BASE + ruta, { redirect: 'manual' });
      if (r.status < 500) return r;
      ultimo = `${r.status}`;
    } catch (e) { ultimo = e.cause?.code || e.message; }
    await new Promise((s) => setTimeout(s, 5000));
  }
  throw new Error(`${ruta} no contestó tras ${intentos} intentos (${ultimo})`);
}

console.log(`Midiendo ${BASE}  (${ENTORNO})`);
console.log();

// 1 · la portada, byte a byte contra este commit
const local = await readFile(fileURLToPath(new URL('../publicar/index.html', import.meta.url)));
const portada = await traer('/');
const servido = Buffer.from(await portada.arrayBuffer());
rev(portada.status === 200, `la portada contesta 200 (${portada.status})`);
const hl = huella(local), hs = huella(servido);
rev(hl === hs,
  `la portada es idéntica al commit: ${servido.length} bytes servidos, ${local.length} armados ` +
  `(${hs.slice(0, 12)}… vs ${hl.slice(0, 12)}…)`);

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
const casi = await traer('/s101cosas');
rev(casi.status === 404, `/s101cosas no se desvía a la API (${casi.status})`);
const notas = await traer('/claude/continuar.md');
rev(notas.status === 404, `las notas de trabajo no están publicadas (${notas.status})`);
const operar = await traer('/OPERAR.md');
rev(operar.status === 404, `ni el contrato: sólo se publica lo de la lista (${operar.status})`);

console.log();
if (fallas > 0) {
  console.log(`RESULTADO: ${fallas} comprobación(es) fallaron`);
  process.exit(1);
}
console.log('RESULTADO: todo verde');
