/* Arma lo que el Worker va a servir, y NADA más.
 *
 * POR QUÉ ESTO NO ES UN `directory = "."`
 *
 * Netlify sirve la raíz de este repositorio tal cual, y el 12-sep-2026 eso
 * dejó `claude/continuar.md` —las notas de trabajo del chat, que describían un
 * hueco abierto— en una dirección pública. Se tapó con `netlify.toml`, pero la
 * lección es la que importa: **lo que se publica se elige, no se hereda.**
 *
 * Así que aquí se copia una lista explícita. Un archivo nuevo en el repo no
 * aparece en internet por existir: aparece porque alguien lo puso en esta
 * lista.
 *
 *   node scripts/armar.mjs
 */

import { cp, mkdir, rm, readdir, stat, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../', import.meta.url));
const SALIDA = join(RAIZ, 'publicar');

/** Lo único que se publica. Agregar aquí es una decisión, no un accidente. */
const LISTA = [
  'index.html',       // la app entera: React incrustado, 574 KB. Sólo con sesión.
  'entrar.html',      // la pantalla de entrada: la ÚNICA página pública
  'entrar.js',        // y su código
  'fonts',            // Sansation, Raleway y las cifras en Fira Sans
  'no-publicado.html', // la página del 404 de `claude/*`
];

await rm(SALIDA, { recursive: true, force: true });
await mkdir(SALIDA, { recursive: true });

let archivos = 0;
let bytes = 0;

async function contar(ruta) {
  const s = await stat(ruta);
  if (s.isDirectory()) {
    for (const e of await readdir(ruta)) await contar(join(ruta, e));
  } else {
    archivos += 1;
    bytes += s.size;
  }
}

for (const nombre of LISTA) {
  await cp(join(RAIZ, nombre), join(SALIDA, nombre), { recursive: true });
  await contar(join(SALIDA, nombre));
}

/* La huella de la app, en un archivo público.
 *
 * Desde la fase 2 `index.html` no se sirve sin sesión, así que la medición ya
 * no puede bajarlo y compararlo byte a byte contra lo armado — que es como se
 * sabía que el borde de Cloudflare ya soltó la versión nueva y no sigue
 * sirviendo la anterior. Esto conserva esa comprobación sin publicar la app:
 * lo que se compara es la huella, que no dice nada de nadie.
 */
const huellaApp = createHash('sha256').update(await readFile(join(SALIDA, 'index.html'))).digest('hex');
await writeFile(join(SALIDA, 'huella.txt'), huellaApp + '\n');
archivos += 1;
bytes += huellaApp.length + 1;

console.log(`publicar/: ${archivos} archivos, ${bytes.toLocaleString('es-MX')} bytes`);
for (const nombre of LISTA) console.log(`  ${nombre}`);
console.log(`  huella.txt  (sha256 de index.html: ${huellaApp.slice(0, 12)}…)`);
