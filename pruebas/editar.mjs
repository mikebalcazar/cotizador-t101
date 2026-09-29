/* Entrar a editar una cotización SIN perder el clic.
 *
 * El corredor de GitHub perdía, de vez en cuando, el clic en «✎ Editar
 * cotización»: la prueba seguía y se quedaba 30 s esperando un botón que
 * sólo existe en modo de edición («+ A mano», «abrir el armador»). Pasó tres
 * veces el 29-sep-2026 en tres pruebas distintas (la-hoja 57, el-plano 27 y
 * 23), nunca aquí. Es de la misma familia del clic perdido que ya está
 * anotado en index.html junto a `hayVersionNueva` (el `focus`), y sigue sin
 * causa explicada.
 *
 * Esto no la esconde: entra a editar y COMPRUEBA que entró —el botón
 * «+ A mano» de la barra sólo se pinta editando— y, si no entró en 4 s,
 * vuelve a picar, hasta tres veces, y lo dice en la salida para que se
 * pueda contar cuántas veces hizo falta. Si al tercer intento sigue sin
 * entrar, truena con esa explicación en vez de con un tiempo agotado mudo.
 */
export async function editarCotizacion(p) {
  for (let intento = 1; intento <= 3; intento++) {
    await p.getByRole('button', { name: /Editar cotización/ }).click();
    try {
      await p.getByRole('button', { name: '+ A mano' }).waitFor({ state: 'visible', timeout: 4000 });
      if (intento > 1) console.log(`#     «Editar cotización» entró al intento ${intento}`);
      return;
    } catch {
      /* no entró: se vuelve a picar */
    }
  }
  throw new Error('«Editar cotización» no entró a editar en tres intentos');
}
