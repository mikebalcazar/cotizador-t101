/* Qué ofrece la pantalla de entrada, medido sobre LO ARMADO en `publicar/`.
 *
 * El 16-sep-2026 la entrada se homologó por encargo de Mike: Google o correo y
 * contraseña en todas las apps de la suite menos roster101. El código de 6
 * dígitos se queda como recuperación, no como forma de entrar, y el PIN se fue.
 *
 * Se mide `publicar/`, no la raíz, por la misma razón que `medir.mjs`: es lo
 * que se sirve. Y el cableado —cada id que `entrar.js` busca existe en
 * `entrar.html`— porque no hay empaquetador que lo avise: un id que ya no
 * existe truena cuando alguien le pica.
 *
 *   npm run prueba
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../publicar/entrar.html', import.meta.url), 'utf8');
const jsCrudo = readFileSync(new URL('../publicar/entrar.js', import.meta.url), 'utf8');
// Lo que se afirma que NO está se afirma sin comentarios: los comentarios
// nombran justo lo que se quitó, y una afirmación sobre el texto crudo se
// cacha a sí misma. Pasó en el corte de dash101 ese mismo día.
const js = jsCrudo.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');
const htmlLimpio = html.replace(/<!--[\s\S]*?-->/g, '');

test('cada id que entrar.js busca existe en entrar.html', () => {
  const usados = [...new Set([...js.matchAll(/\$\('([a-z0-9-]+)'\)/g)].map((m) => m[1]))];
  const faltan = usados.filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(faltan, [], `faltan en el HTML: ${faltan.join(', ')}`);
  assert.ok(usados.length >= 20, `se esperaban al menos 20 ids, hay ${usados.length}`);
});

test('cada vista del HTML la conoce ver()', () => {
  const vistas = [...html.matchAll(/id="(v-[a-z0-9-]+)"/g)].map((m) => m[1]);
  const lista = js.match(/for \(const v of \[([^\]]+)\]\)/)?.[1] ?? '';
  const noConoce = vistas.filter((v) => !lista.includes(`'${v}'`));
  assert.deepEqual(noConoce, [], `ver() no conoce: ${noConoce.join(', ')}`);
});

test('entra con correo y contraseña, y con el código sólo para recuperar', () => {
  assert.match(js, /pedir\('\/auth\/entrar', \{ correo, clave: v \}\)/);
  assert.match(js, /pedir\('\/auth\/entrar', \{ correo, codigo: v \}\)/);
  assert.match(js, /auth\/google/);
  assert.match(htmlLimpio, /Olvid[ée] mi contrase/i);
  assert.match(htmlLimpio, /type="password"/);
  assert.ok(/name="password"/.test(htmlLimpio) && /name="new-password"/.test(htmlLimpio),
    'los campos llevan name, para que el administrador del teléfono los guarde');
});

test('ya no ofrece PIN ni código como forma de entrar', () => {
  assert.doesNotMatch(js, /\bpin\b/i, 'entrar.js no manda ningún PIN');
  assert.doesNotMatch(htmlLimpio, /\bPIN\b/);
  assert.doesNotMatch(html, /b-modo/, 'se fue el botón que cambiaba de código a PIN');
  assert.doesNotMatch(htmlLimpio.split('id="v-codigo"')[0], /one-time-code/,
    'la primera pantalla ya no pide un código de un solo uso');
  assert.doesNotMatch(js, /pin_invalido/, 'ni trae mensaje para un error que ya no puede llegar');
});

test('a quien entró con código y no tiene contraseña se le pide ponerla; a quien entró con Google, no', () => {
  assert.match(js, /!yo\.tiene_clave\s*&&\s*yo\.entro_con\s*===\s*'codigo'/);
  assert.doesNotMatch(js, /!yo\.tiene_clave\s*\)/, 'guarda: con Google no se pide nada');
});

test('la contraseña se manda tal cual, sin recortar, y el error no revela quién tiene cuenta', () => {
  assert.match(js, /const v = \$\('clave'\)\.value;/);
  assert.match(js, /e\.cual === 'sin_permiso' \|\| e\.cual === 'clave_invalida'/);
});
