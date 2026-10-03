/* Lo que debe costar un renglón al cliente, con los porcentajes de fábrica
 * (CONFIG_DEFAULT) y la regla del 3-oct-2026: lo escrito a mano es la base,
 * encima van los indirectos siempre, las comisiones prendidas y el flete
 * repartido entre TODOS los renglones; los armados llevan además ingeniería
 * y embalaje y se redondean de $50 en $50. Es la misma cuenta que
 * `preciosHoja` en index.html, en el mismo orden, para que las pruebas
 * digan el número esperado sin copiarlo a mano. */
export const IND = 0.075, ING = 0.035, EMB = 0.02, ARQ = 0.10, TDC = 0.045;
export const FLETE_MIN = 1500, FLETE_INC = 300, FLETE_ESC = 10000;
export const fleteDe = (t) => Math.max(FLETE_MIN, Math.floor(t / FLETE_ESC) * FLETE_INC);
/** renglones: [{ base, qty, armado }] — en un armado `base` es su costo (un solo componente). */
export function preciosEsperados(renglones, { arq = true, tdc = true, flete = true } = {}) {
  const fA = arq ? 1 + ARQ : 1, fT = tdc ? 1 + TDC : 1;
  const factor = (1 + IND + ING + EMB) * fA * fT, factorMano = (1 + IND) * fA * fT;
  const exactos = renglones.map((r) => r.base * (r.armado ? factor : factorMano));
  const sinFlete = renglones.reduce((s, r, i) => s + exactos[i] * (r.qty || 1), 0);
  const neto = flete && sinFlete > 0 ? fleteDe(sinFlete) : 0;
  const ff = sinFlete > 0 ? 1 + neto / sinFlete : 1;
  return renglones.map((r, i) => r.armado ? Math.ceil(exactos[i] * ff / 50 - 1e-9) * 50 : Math.round(exactos[i] * ff));
}
