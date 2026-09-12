/* El Worker de verdad, corriendo en esta máquina, para poder probarlo con un
 * navegador.
 *
 * `wrangler dev` no sirve aquí: el *service binding* a `suite101-api` sólo
 * existe dentro de Cloudflare, y en local wrangler lo marca «[not
 * connected]». Pero no hace falta copiar el Worker para probarlo: se
 * **importa `worker/index.js` tal cual** y se le da un `env` de mentiras —la
 * API por HTTPS contra STAGING y los archivos leídos de `publicar/`—.
 *
 * Eso es lo que separa a este banco de una copia: el reparto de rutas lo hace
 * el mismo código que va publicado, no una imitación que puede quedarse atrás.
 * Lo que este banco NO prueba es la plataforma: `run_worker_first` y el
 * service binding de verdad. Eso se mide sobre lo publicado, desde el
 * corredor.
 *
 *   node pruebas/banco.mjs [puerto]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../worker/index.js';

const PUBLICO = fileURLToPath(new URL('../publicar/', import.meta.url));
const API = process.env.API_ORIGEN || 'https://suite101-api-staging.mike-929.workers.dev';
const PUERTO = Number(process.argv[2] || process.env.PUERTO || 8793);

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

/** El *service binding*, pero por HTTPS contra staging. */
const apiPorHttps = {
  async fetch(pet) {
    const u = new URL(pet.url);
    const destino = new URL(API);
    destino.pathname = u.pathname;
    destino.search = u.search;
    const cuerpo = pet.method === 'GET' || pet.method === 'HEAD' ? undefined : await pet.arrayBuffer();
    return fetch(destino, {
      method: pet.method,
      headers: pet.headers,
      body: cuerpo && cuerpo.byteLength ? cuerpo : undefined,
      redirect: 'manual',
    });
  },
};

/** Los archivos de `publicar/`. */
const archivos = {
  async fetch(pet) {
    const u = new URL(pet.url);
    const rel = normalize(u.pathname === '/' ? '/index.html' : u.pathname).replace(/^(\.\.[/\\])+/, '');
    try {
      const cuerpo = await readFile(join(PUBLICO, rel));
      return new Response(cuerpo, { headers: { 'Content-Type': TIPOS[extname(rel)] ?? 'application/octet-stream' } });
    } catch {
      return new Response('no existe', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  },
};

const env = { ASSETS: archivos, API: apiPorHttps };

const servidor = createServer(async (pet, res) => {
  const trozos = [];
  for await (const t of pet) trozos.push(t);
  const cabeceras = new Headers();
  for (const [k, v] of Object.entries(pet.headers)) if (typeof v === 'string') cabeceras.set(k, v);

  let r;
  try {
    r = await worker.fetch(new Request(`http://127.0.0.1:${PUERTO}${pet.url}`, {
      method: pet.method,
      headers: cabeceras,
      body: trozos.length ? Buffer.concat(trozos) : undefined,
    }), env);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('el Worker se cayó: ' + e.message);
    return;
  }

  const salida = {};
  for (const [k, v] of r.headers) {
    const n = k.toLowerCase();
    // `set-cookie` se trata aparte, abajo.
    //
    // `content-encoding` y `content-length` NO se relayan: `fetch` ya
    // descomprimió el cuerpo, así que reenviar «gzip» le pide al navegador
    // que descomprima algo que ya está descomprimido. Se cayó justo con eso
    // el 12-sep —un `Gunzip` roto que llegaba como un escueto «terminated»—.
    if (n === 'set-cookie' || n === 'content-encoding' || n === 'content-length') continue;
    salida[k] = v;
  }
  // La galleta de la API dice `Secure`, y en http://127.0.0.1 el navegador la
  // tiraría. Se le quita SÓLO aquí: en el Worker de verdad todo va por https.
  const puesta = r.headers.getSetCookie?.() ?? (r.headers.get('set-cookie') ? [r.headers.get('set-cookie')] : []);
  if (puesta.length) {
    salida['Set-Cookie'] = puesta.map((c) => c.replace(/;\s*Secure/gi, '').replace(/SameSite=None/gi, 'SameSite=Lax'));
  }
  res.writeHead(r.status, salida);
  res.end(Buffer.from(await r.arrayBuffer()));
});

/** Levanta el banco. **Se cae si el puerto está ocupado**, en vez de quedarse
 *  colgado: sin el `on('error')`, un puerto ocupado deja la promesa sin
 *  resolver y `node --test` reporta «Promise resolution is still pending» en
 *  las seis pruebas, que no dice nada de lo que pasa. Se topó justo con eso
 *  el 12-sep, con un banco anterior que se había quedado vivo. */
export const arrancar = (puerto = PUERTO) =>
  new Promise((listo, falla) => {
    servidor.once('error', (e) => {
      falla(new Error(
        e.code === 'EADDRINUSE'
          ? `el puerto ${puerto} ya está ocupado: hay otro banco vivo. Ciérralo y vuelve a correr.`
          : `no se pudo levantar el banco: ${e.message}`,
      ));
    });
    servidor.listen(puerto, '127.0.0.1', () => listo(servidor));
  });

export const cerrar = () => new Promise((listo) => servidor.close(listo));

if (import.meta.url === `file://${process.argv[1]}`) {
  arrancar().then(() => console.log(`banco en http://127.0.0.1:${PUERTO}  ·  /s101 → ${API}`));
}
