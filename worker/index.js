/* quote101 como Worker de Cloudflare — la puerta.
 *
 * Fase 2: **la app ya no se entrega sin sesión**. Hasta ahora quote101 no
 * tenía ninguna puerta: quien supiera la dirección abría el cotizador entero.
 * Ahora la única página pública es `entrar.html`, y a `index.html` sólo se
 * llega con una sesión de la suite 101 que además traiga quote101 entre sus
 * apps.
 *
 * El candado vive AQUÍ y no dentro de la app a propósito: así el Worker se
 * niega a entregar la app, en vez de entregarla y pedirle a su JavaScript que
 * se esconda solo. Lo segundo no es una puerta, es una cortina.
 *
 * Lo que esto NO cierra, y conviene tenerlo claro: la app sigue hablándole a
 * Firestore directo desde el navegador, y esa base sigue abierta a quien le
 * pegue por su cuenta sin pasar por aquí. Eso se cierra cuando las cotizaciones
 * vivan en la suite y Firebase se apague (fases 3 a 5), no con este candado.
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
const APP = 'cotizador101';

/** La llave con la que la suite guarda la lista de apps de cada persona.
 *  NO es el nombre de la app: `miembros.apps` lleva llaves cortas
 *  (`cotizador`, `dash`, `quell`…), que es lo que escribe workshop101 y lo que
 *  compara la propia API (`LLAVE_APP` en schema/tipos.ts). Compararla contra
 *  el nombre largo no coincide nunca, y deja fuera a cualquiera con una lista
 *  específica; pasó el 16-sep en quell101 y en roster101. Se acepta también el
 *  nombre largo por si alguna lista se escribió a mano. */
const LLAVE = 'cotizador';

/** Lo que se entrega sin sesión. Todo lo demás pide una.
 *
 *  Las fuentes van abiertas porque las pide la propia pantalla de entrada, y
 *  no dicen nada de nadie. `no-publicado.html` es la página del 404. */
const ABIERTO = new Set(['/entrar.html', '/entrar.js', '/no-publicado.html', '/huella.txt']);
const esAbierto = (ruta) => ABIERTO.has(ruta) || ruta.startsWith('/fonts/');

/** La capa de archivos sirve las rutas tal cual (`html_handling = "none"`), así
 *  que `/` no encuentra nada por su cuenta: se mapea aquí. Se hace en el
 *  Worker a propósito, para que no haya una redirección de la plataforma que
 *  el candado no vea; con el valor de fábrica, `/entrar.html` rebotaba a
 *  `/entrar` y el candado lo regresaba a `/entrar.html`, sin salida. */
const archivo = (u) => {
  const p = u.pathname;
  if (p === '/' || p === '/index.html') return '/index.html';
  // Por si queda una liga vieja a la forma sin extensión.
  if (p === '/entrar') return '/entrar.html';
  return p;
};
const pedirArchivo = (req, u, env) => {
  const destino = new URL(req.url);
  destino.pathname = archivo(u);
  return env.ASSETS.fetch(new Request(destino, req));
};

/** ¿Quién viene, según la suite? Devuelve lo que contesta `/yo`, o null. */
async function laSuiteDiceQuien(req, env) {
  const galleta = req.headers.get('cookie');
  if (!galleta || !galleta.includes('s101=')) return null;
  const r = await env.API.fetch(new Request('https://suite101-api/yo', {
    headers: { cookie: galleta, 'X-App': APP },
  }));
  if (!r.ok) return null;
  const cuerpo = await r.json().catch(() => null);
  return cuerpo?.data || null;
}

/** ¿La suite le abre quote101? El dueño de la suite entra a todo; a los demás
 *  se lo dice la lista de apps que les puso quien administra su empresa en
 *  workshop101. Vacía quiere decir todas. */
const laSuiteLeAbre = (yo) =>
  !!yo && (yo.superadmin === true ||
    (yo.orgs || []).some((o) => !o.apps?.length || o.apps.includes(LLAVE) || o.apps.includes(APP)));

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
      r.headers.set('X-App', APP);
      return env.API.fetch(r);
    }

    if (esAbierto(archivo(u))) return pedirArchivo(req, u, env);

    // Todo lo demás —empezando por la app— pide sesión.
    const yo = await laSuiteDiceQuien(req, env);
    if (!laSuiteLeAbre(yo)) {
      return Response.redirect(new URL('/entrar.html', u.origin).toString(), 302);
    }

    return pedirArchivo(req, u, env);
  },
};
