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
 * Y no es teoría: el 16-sep el candado de la fase 2 pasó las 18 pruebas de
 * aquí y no corrió ni una vez en pruebas, porque `run_worker_first` sólo
 * dejaba entrar `/s101/*` y la capa de archivos contestaba la app sin pasar
 * por el Worker. Lo cachó la medición sobre lo publicado. Por eso los archivos
 * de aquí se sirven LITERALES, como los sirve Cloudflare: para que el banco no
 * tape lo que la plataforma sí hace.
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

/** El *service binding*, pero por HTTPS contra staging.
 *
 * `accept-encoding` NO se reenvía, y esto costó cinco corridas el 16-sep.
 *
 * El navegador pide `gzip, deflate, br, zstd`. Si eso se le pasa tal cual a
 * Cloudflare, Cloudflare puede contestar en **zstd**, que el `fetch` de Node no
 * sabe abrir: el cuerpo llega ilegible con código 200. La app hacía
 * `r.json()`, le tronaba, se quedaba con `{}` y concluía «esta cuenta no es
 * miembro de ninguna empresa» — un error que manda a revisar membresías cuando
 * lo que estaba roto era el transporte de esta máquina.
 *
 * Quitándolo, Node negocia su propia compresión con Cloudflare, la abre y
 * entrega el cuerpo en claro. `host` se quita por lo mismo: el del banco no es
 * el de la API.
 *
 * Es la misma clase de cosa que ya había mordido el 12-sep en la dirección
 * contraria —relayar `content-encoding` de vuelta al navegador—, y está anotada
 * abajo. Un banco que reenvía encabezados de compresión a ciegas es un banco
 * que miente sobre el cuerpo. */
const apiPorHttps = {
  async fetch(pet) {
    const u = new URL(pet.url);
    const destino = new URL(API);
    destino.pathname = u.pathname;
    destino.search = u.search;
    const cuerpo = pet.method === 'GET' || pet.method === 'HEAD' ? undefined : await pet.arrayBuffer();
    const cabeceras = new Headers(pet.headers);
    cabeceras.delete('accept-encoding');
    cabeceras.delete('host');
    return fetch(destino, {
      method: pet.method,
      headers: cabeceras,
      body: cuerpo && cuerpo.byteLength ? cuerpo : undefined,
      redirect: 'manual',
    });
  },
};

/** Los archivos de `publicar/`. */
const archivos = {
  async fetch(pet) {
    const u = new URL(pet.url);
    // Literal, como `html_handling = "none"` en Cloudflare: el Worker es quien
    // mapea `/` a `/index.html`. Si aquí se mapeara también, el banco taparía
    // justo el fallo que costó una corrida el 16-sep.
    const rel = normalize(u.pathname).replace(/^(\.\.[/\\])+/, '');
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
