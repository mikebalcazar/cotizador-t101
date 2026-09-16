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
  pin_invalido: 'Ese PIN no es.',
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
    throw Object.assign(new Error(ERRORES[cual] ?? `Algo no salió bien (${cual}). Vuelve a intentar.`), { cual });
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
let modo = 'codigo';   // codigo | pin

const ver = (cual) => {
  for (const v of ['v-correo', 'v-clave', 'v-sinpaso', 'v-cargando']) $(v).hidden = v !== cual;
};

function pintaClave() {
  const esCodigo = modo === 'codigo';
  $('t-clave').textContent = esCodigo ? 'Tu código' : 'Tu PIN';
  $('p-clave').textContent = esCodigo
    ? `Te mandamos un código de 6 dígitos a ${correo}. Vence en 10 minutos.`
    : 'El PIN de seis dígitos que pusiste en la suite.';
  $('l-clave').textContent = esCodigo ? 'Código de 6 dígitos' : 'PIN de 6 dígitos';
  $('clave').type = esCodigo ? 'text' : 'password';
  $('clave').setAttribute('autocomplete', esCodigo ? 'one-time-code' : 'current-password');
  $('b-modo').textContent = esCodigo ? 'Entrar con mi PIN' : 'Mándame un código';
  $('clave').value = '';
  $('err-clave').textContent = '';
  $('clave').focus();
}

/** Ya hay sesión. Falta que la suite le abra ESTA app: la lista de apps la
 *  pone quien administra la empresa en workshop101. */
async function adentro() {
  ver('v-cargando');
  let yo = null;
  try { yo = await pedir('/yo'); } catch (e) { $('err-correo').textContent = e.message; ver('v-correo'); return; }
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

$('b-correo').onclick = async () => {
  $('err-correo').textContent = '';
  const v = $('correo').value.trim();
  if (!v) { $('err-correo').textContent = 'Escribe tu correo.'; return; }
  $('b-correo').disabled = true;
  try {
    await pedir('/auth/codigo', { correo: v });
    correo = v;
    modo = 'codigo';
    ver('v-clave');
    pintaClave();
  } catch (e) { $('err-correo').textContent = e.message; }
  finally { $('b-correo').disabled = false; }
};
$('correo').onkeydown = (e) => { if (e.key === 'Enter') $('b-correo').click(); };

$('b-clave').onclick = async () => {
  $('err-clave').textContent = '';
  const v = $('clave').value.replace(/\D/g, '');
  if (v.length !== 6) { $('err-clave').textContent = modo === 'codigo' ? 'El código son 6 dígitos.' : 'El PIN son 6 dígitos.'; return; }
  $('b-clave').disabled = true;
  try {
    await pedir('/auth/entrar', modo === 'codigo' ? { correo, codigo: v } : { correo, pin: v });
    await adentro();
  } catch (e) { $('err-clave').textContent = e.message; $('clave').value = ''; }
  finally { $('b-clave').disabled = false; }
};
$('clave').onkeydown = (e) => { if (e.key === 'Enter') $('b-clave').click(); };

$('b-modo').onclick = async () => {
  $('err-clave').textContent = '';
  if (modo === 'codigo') { modo = 'pin'; pintaClave(); return; }
  $('b-modo').disabled = true;
  try { await pedir('/auth/codigo', { correo }); modo = 'codigo'; pintaClave(); }
  catch (e) { $('err-clave').textContent = e.message; }
  finally { $('b-modo').disabled = false; }
};

const otroCorreo = () => { correo = ''; ver('v-correo'); $('correo').focus(); };
$('b-otro').onclick = otroCorreo;
$('b-otro-2').onclick = otroCorreo;

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
