/* La entrada de quote101.
 *
 * Es la puerta de la suite 101, la misma de quell101, roster101 y las demás:
 * correo y código de 6 dígitos, PIN, o cuenta de Google. Todo pasa por
 * `/s101/*`, que el Worker reenvía a `suite101-api` desde este mismo origen
 * con `X-App: cotizador101` puesto por él; aquí no se manda.
 *
 * Esta página es la ÚNICA pública de quote101: la app (`index.html`) sólo se
 * sirve con sesión, y el Worker manda aquí a quien llegue sin ella. Por eso el
 * archivo es aparte y no una pantalla dentro de la app: así el Worker puede
 * negarse a entregar la app entera, en vez de entregarla y pedirle a su
 * JavaScript que se esconda solo.
 */

const $ = (id) => document.getElementById(id);
const API = '/s101';

/** Los errores de la API, con palabras de quien cotiza. */
const ERRORES = {
  codigo_invalido: 'Ese código no es. Revisa el correo y vuelve a intentar.',
  clave_invalida: 'Esa contraseña no es.',
  demasiados_intentos: 'Demasiados intentos. Espera un momento y vuelve a intentar.',
  sin_permiso: 'Ese correo no tiene acceso. Pídeselo a quien administra tu empresa.',
  sin_sesion: 'Tu sesión terminó. Vuelve a entrar.',
  datos_invalidos: 'Revisa lo que escribiste.',
  correo_no_configurado: 'El envío de códigos no está disponible ahora. Intenta más tarde.',
  google_no_configurado: 'Entrar con Google todavía no está prendido. Entra con tu correo.',
  origen_no_permitido: 'Esta dirección no está dada de alta para entrar con Google. Entra con tu correo.',
  entrada_invalida: 'El boleto de Google ya no sirve. Vuelve a intentar.',
  sin_respuesta: 'No hubo forma de llegar al servidor. Revisa tu señal.',
};

async function pedir(ruta, cuerpo) {
  let r;
  try {
    r = await fetch(API + ruta, {
      method: cuerpo ? 'POST' : 'GET',
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      credentials: 'same-origin',
    });
  } catch { throw new Error(ERRORES.sin_respuesta); }
  let d = null;
  try { d = await r.json(); } catch { /* no vino JSON */ }
  if (!r.ok || !d?.ok) {
    const cual = d?.error ?? 'sin_respuesta';
    // `detalle` viaja también: ahí la suite dice con palabras por qué una
    // contraseña no pasa, y eso se enseña tal cual.
    throw Object.assign(new Error(ERRORES[cual] ?? `Algo no salió bien (${cual}). Vuelve a intentar.`), { cual, detalle: d?.detalle });
  }
  return d.data;
}

/** La llave con la que la suite guarda la lista de apps de cada persona. NO es
 *  el nombre de la app: `miembros.apps` lleva llaves cortas. Se acepta también
 *  el nombre largo por si alguna lista se escribió a mano. */
const LLAVE = 'cotizador';
const APP = 'cotizador101';
const leAbre = (yo) =>
  !!yo && (yo.superadmin === true ||
    (yo.orgs || []).some((o) => !o.apps?.length || o.apps.includes(LLAVE) || o.apps.includes(APP)));

let correo = '';

const ver = (cual) => {
  for (const v of ['v-correo', 'v-clave', 'v-codigo', 'v-nueva', 'v-sinpaso', 'v-cargando']) $(v).hidden = v !== cual;
};

/** Ya hay sesión. Falta que la suite le abra ESTA app: la lista de apps la
 *  pone quien administra la empresa en workshop101. */
async function adentro() {
  ver('v-cargando');
  let yo = null;
  try { yo = await pedir('/yo'); } catch (e) { $('err-correo').textContent = e.message; ver('v-correo'); return; }

  /* Entró con un código y no tiene contraseña: no tiene por dónde volver
   * mañana, porque el código es de un solo uso y de diez minutos. Se le pide
   * antes de dejarlo pasar. Con Google NO se le pide: Google ya es una forma
   * de entrar. */
  if (!yo.tiene_clave && yo.entro_con === 'codigo') {
    $('nueva').value = ''; $('nueva2').value = ''; $('err-nueva').textContent = '';
    ver('v-nueva'); $('nueva').focus();
    return;
  }

  if (!leAbre(yo)) {
    $('p-sinpaso').textContent =
      `Entraste a la suite como ${yo.usuario?.correo ?? correo}, pero quote101 no está entre tus aplicaciones. ` +
      'Pídeselo a quien administra tu empresa.';
    ver('v-sinpaso');
    return;
  }
  // La app vive en la raíz y el Worker ya la deja pasar con esta sesión.
  location.replace('/');
}

/* El correo ya no dispara un código: lleva a la contraseña. Y no se le pregunta
 * a la API si esa persona tiene una antes de pedirla: eso volvería esta
 * pantalla un directorio de quién tiene cuenta. */
$('b-correo').onclick = () => {
  $('err-correo').textContent = '';
  const v = $('correo').value.trim();
  if (!v) { $('err-correo').textContent = 'Escribe tu correo.'; return; }
  correo = v;
  $('p-clave').textContent = `La de tu cuenta, ${correo}.`;
  $('clave').value = ''; $('err-clave').textContent = '';
  ver('v-clave'); $('clave').focus();
};
$('correo').onkeydown = (e) => { if (e.key === 'Enter') $('b-correo').click(); };

$('b-clave').onclick = async () => {
  $('err-clave').textContent = '';
  // La contraseña NO se recorta: un espacio al principio o al final es parte
  // de ella —la suite rechaza esas al ponerlas, no al usarlas— y recortarla
  // haría que una buena no entrara sin explicación.
  const v = $('clave').value;
  if (!v) { $('err-clave').textContent = 'Escribe tu contraseña.'; return; }
  $('b-clave').disabled = true;
  try {
    await pedir('/auth/entrar', { correo, clave: v });
    await adentro();
  } catch (e) {
    /* `sin_permiso` es el correo sin cuenta y `clave_invalida` la contraseña
     * equivocada. Se dicen IGUAL a propósito: distinguirlos le diría a
     * cualquiera qué correos tienen cuenta aquí. */
    $('err-clave').textContent = e.cual === 'sin_permiso' || e.cual === 'clave_invalida'
      ? 'Ese correo y esa contraseña no coinciden.' : e.message;
    $('clave').value = '';
  } finally { $('b-clave').disabled = false; }
};
$('clave').onkeydown = (e) => { if (e.key === 'Enter') $('b-clave').click(); };

/* «Olvidé mi contraseña», que es la misma puerta para quien nunca tuvo una. */
async function mandarCodigo(boton, donde) {
  $(donde).textContent = '';
  $(boton).disabled = true;
  try {
    await pedir('/auth/codigo', { correo });
    $('p-codigo').textContent = `Te mandamos un código de 6 dígitos a ${correo}. Vence en 10 minutos.`;
    $('codigo').value = ''; $('err-codigo').textContent = '';
    ver('v-codigo'); $('codigo').focus();
  } catch (e) { $(donde).textContent = e.message; }
  finally { $(boton).disabled = false; }
}
$('b-olvide').onclick = () => mandarCodigo('b-olvide', 'err-clave');
$('b-reenviar').onclick = () => mandarCodigo('b-reenviar', 'err-codigo');

$('b-codigo').onclick = async () => {
  $('err-codigo').textContent = '';
  const v = $('codigo').value.replace(/\D/g, '');
  if (v.length !== 6) { $('err-codigo').textContent = 'El código son 6 dígitos.'; return; }
  $('b-codigo').disabled = true;
  try {
    await pedir('/auth/entrar', { correo, codigo: v });
    await adentro();
  } catch (e) { $('err-codigo').textContent = e.message; $('codigo').value = ''; }
  finally { $('b-codigo').disabled = false; }
};
$('codigo').onkeydown = (e) => { if (e.key === 'Enter') $('b-codigo').click(); };

$('b-nueva').onclick = async () => {
  $('err-nueva').textContent = '';
  const a = $('nueva').value, c = $('nueva2').value;
  if (a.length < 10) { $('err-nueva').textContent = 'La contraseña necesita al menos 10 caracteres.'; return; }
  if (a !== c) {
    // No se dice cuál falló ni se deja la primera puesta: si no coincidieron,
    // una de las dos está mal y no hay forma de saber cuál.
    $('err-nueva').textContent = 'No coincidieron. Vamos otra vez, desde el principio.';
    $('nueva').value = ''; $('nueva2').value = ''; $('nueva').focus();
    return;
  }
  $('b-nueva').disabled = true;
  try {
    await pedir('/auth/clave', { clave: a });
    await adentro();
  } catch (e) {
    // La suite dice con palabras por qué una contraseña no pasa; se enseña tal cual.
    $('err-nueva').textContent = e.detalle?.porque || e.message;
    $('nueva').value = ''; $('nueva2').value = ''; $('nueva').focus();
  } finally { $('b-nueva').disabled = false; }
};
$('nueva2').onkeydown = (e) => { if (e.key === 'Enter') $('b-nueva').click(); };

const otroCorreo = () => {
  correo = '';
  for (const x of ['err-correo', 'err-clave', 'err-codigo', 'err-nueva']) $(x).textContent = '';
  ver('v-correo'); $('correo').focus();
};
$('b-otro').onclick = otroCorreo;
$('b-otro-2').onclick = otroCorreo;
$('b-otro-3').onclick = otroCorreo;

$('b-google').onclick = () => {
  location.href = `${API}/auth/google?volver_a=${encodeURIComponent(location.origin + '/entrar.html')}`;
};

/* ¿Venimos de Google? El boleto es de un solo uso: se canjea y se limpia la
 * dirección, para que recargar no intente gastarlo dos veces. */
(async () => {
  const u = new URL(location.href);
  const entrada = u.searchParams.get('entrada');
  if (!entrada) { $('correo').focus(); return; }
  u.searchParams.delete('entrada');
  history.replaceState(null, '', u.toString());
  ver('v-cargando');
  try {
    await pedir('/auth/canje', { entrada });
    await adentro();
  } catch (e) { $('err-correo').textContent = e.message; ver('v-correo'); }
})();
