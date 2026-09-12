/* quote101 como Worker de Cloudflare — la puerta.
 *
 * Fase 1 de la migración: **mudanza sin cambiar comportamiento**. La app es la
 * misma de siempre (`index.html`, con React incrustado) y sigue hablándole a
 * Firestore por su cuenta. Lo único nuevo es dónde vive y que ya tiene por
 * dónde hablarle a la suite.
 *
 * Decisión D1 del coordinador: cada app vive en su propio Worker y le habla a
 * `suite101-api` **desde su mismo origen**, por `/s101/*`, con un *service
 * binding* —llamada de Worker a Worker que no sale a internet—.
 *
 * Por qué el mismo origen y no una URL: la sesión de la suite es una cookie
 * `s101` con `SameSite=None`. Servida desde otro origen es cookie de terceros,
 * y Safari la bloquea; o sea, todo iPhone. Desde el mismo origen es cookie
 * propia y además no hay CORS que configurar.
 *
 * El Worker pone `X-App: cotizador101` —el nombre con el que la API conoce a
 * quote101; es contrato y no se cambia (D8)— y lo **sobrescribe** si la
 * interfaz manda otro: la app no decide quién dice ser.
 *
 * Lo demás son los archivos de `publicar/`, que arma `scripts/armar.mjs` con
 * una lista explícita. No se sirve la raíz del repositorio: eso fue justo lo
 * que dejó las notas de trabajo del chat en internet el 12-sep.
 */

const PREFIJO = '/s101';

export default {
  async fetch(req, env) {
    const u = new URL(req.url);

    if (u.pathname === PREFIJO || u.pathname.startsWith(PREFIJO + '/')) {
      // `/s101/auth/codigo` → `/auth/codigo`. Un `/s101` pelón va a la raíz.
      //
      // Se compara contra `PREFIJO + '/'` y no sólo contra `PREFIJO`: con
      // `startsWith('/s101')` a secas, una ruta como `/s101cosas` también
      // entraría aquí y se le mandaría a la API convertida en `cosas`.
      u.pathname = u.pathname.slice(PREFIJO.length) || '/';
      const r = new Request(u, req);
      r.headers.set('X-App', 'cotizador101');
      return env.API.fetch(r);
    }

    return env.ASSETS.fetch(req);
  },
};
