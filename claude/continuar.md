# quote101 — dónde va esto

Lo escribe la sesión de Claude Code que trabaja el repo. Lo más nuevo arriba.
**Lo que dice «medido» se midió aquí; lo demás dice de dónde sale.**

---

# 12-sep-2026 · Fase 0, y dos cosas que no estaban en el plan

Mike eligió por botones **mudar quote101 a la suite sin parche intermedio**.
Antes de mover nada, esto es lo que hay.

## 1 · La base está abierta a internet

**Medido aquí, sin leer ningún dato de cliente.** Se le pidió a Firestore un
documento **que no existe**, sin identificarse:

```
GET .../documents/app/no-existe-<marca-de-tiempo>   →  404 NOT_FOUND
```

Si las reglas estuvieran cerradas, la respuesta habría sido **403
PERMISSION_DENIED**: negar el permiso antes de decir si el documento existe.
Contestó 404, o sea que la lectura está permitida a cualquiera. Después, ya con
permiso de Mike para sacar el respaldo, la lectura del documento de verdad
devolvió **200 y 3 287 178 bytes**, también sin identificarse.

El 12-sep Mike abrió la consola de Firebase y pegó las reglas: permiten leer
**y escribir** cualquier documento sin identificarse (según la bitácora de
quote101 en Drive; la parte de lectura está medida aquí). La escritura **no se
probó a propósito**: probarla habría tocado datos de verdad.

Qué significa, en concreto:

- cualquiera puede bajarse los 12 clientes con sus proyectos, cotizaciones y
  montos;
- cualquiera puede cambiar `prices` y `config` —IVA, comisiones, flete— y la
  siguiente cotización saldría con esos números sin que nadie lo note;
- cualquiera puede borrar el documento entero de una sola llamada.

La llave está dentro del `index.html` que sirve el sitio, a la vista de quien
mire el código: `const FS_KEY = "AIza…"`. **No se copia aquí ni en ningún otro
lado.** No es un descuido de quien la puso: una llave web de Firebase está
hecha para ser pública, y lo que protege los datos son las reglas. Las reglas
son las que están abiertas.

**Hay respaldo desde hoy.** Está el acta en Drive
(`suite101/quote101/quote101 — acta del respaldo 12-sep-2026`) con las huellas
sha256 y los archivos se le entregaron a Mike. Es una foto del 12-sep, no un
respaldo continuo.

## 2 · Firebase Storage está caído por facturación cerrada

**Medido aquí.** Tanto el bucket como tres enlaces de fotos de verdad:

```
GET https://firebasestorage.googleapis.com/v0/b/cotizador-t101.firebasestorage.app/o/<lo-que-sea>
  → 402  "The billing account for the owning project is disabled in state closed"
```

En el respaldo hay **93 enlaces distintos** a Storage. Los tres que se probaron
dan 402. O sea que **las fotos de los muebles ya no cargan hoy, para nadie**.

Esto no lo rompió la migración y no es de hoy: es la cuenta de facturación del
proyecto de Google, que está cerrada. Es de Mike, no de código.

Consecuencia para la mudanza: las fotos que están en Storage **no se pueden
bajar** mientras la facturación siga cerrada. Las 7 que venían incrustadas
dentro del propio documento (88 KB) sí están en el respaldo.

Las reglas de Storage siguen sin poderse revisar, justamente porque contesta
402 antes de llegar a ellas.

---

## Fase 0 · Lo que el coordinador pidió medir

### Dónde viven hoy las cotizaciones

En **Firestore del proyecto `cotizador-t101`**, y todo cabe en **un solo
documento**: `app/datos`. No es `localStorage`, no es el Firestore de dash101,
no es un archivo.

| | medido el 12-sep |
|---|---|
| Clientes | 12 |
| Proyectos | 22 |
| Cotizaciones | 38 |
| Listas de precios | 11 |
| `reciboCounter` | 7 |
| Creado | 2026-05-04 |
| Última escritura de la app | 2026-09-03 01:49 UTC |
| Tamaño tal como lo entrega Firestore | 3 287 178 bytes |

El importador Firestore → OrgDB de la API **no trae cotizaciones** (lo dice el
arranque del coordinador). O sea que **la fase 4 sí hace falta**: la mudanza de
estas 38 cotizaciones es nuestra.

### Qué es una cotización por dentro

El árbol, medido sobre el respaldo:

```
app/datos
├── config          fleteMin, fleteEscalon, fleteIncremento, iva, embalaje,
│                   indirectos, ingenieria, comisionArq, comisionTDC,
│                   especialesGuardados
├── prices          11 listas: LED_ML, PP, PC, PPG, JALADERAS, PPO, PF, PL,
│                   PE, PG, PCUB
├── reciboCounter   7
├── updatedAt
└── clientes[]      {id, nombre, archivado, proyectos[]}
    └── proyectos[]     {id, nombre, cotizaciones[]}
        └── cotizaciones[]  {id, nombre, versiones[]}
            └── versiones[]     {fecha, muebles[], materiales, totalFinal,
                                 descuento, usaTDC, usaFlete, usaArq, autosave}
                └── muebles[]       {id, nombre, qty, perfil, componentes,
                                     total, imagen, imagenes}
```

**Los precios NO viven en el `index.html`.** Están en `prices`, dentro de la
base. Eso responde una de las preguntas abiertas del §7 del arranque: no son
datos de negocio metidos en el código.

### ⚠️ El dinero está en PESOS CON DECIMALES, y la API exige CENTAVOS ENTEROS

**Es el dato más peligroso de toda la mudanza.** Medido sobre los 38
`totalFinal`:

| | |
|---|---|
| Versiones con total | 38 |
| Mínimo | 5 757.17 |
| Mediana | 182 257.61 |
| Máximo | 1 640 856.07 |
| **Con decimales** | **37 de 38** |

Una cotización mediana de $182 257.61 es una cocina; leída como centavos serían
$1 822.58, que no es nada. Así que son **pesos**. En todo el documento hay
**2 554 números enteros y 447 con decimales**.

La API rechaza cualquier monto no entero con `400 dinero_no_entero` y guarda en
centavos. O sea que la mudanza tiene que **multiplicar por 100 y redondear**, y
ahí es exactamente donde el dinero cambia sin que nadie lo vea. No se hace a
ojo: el importador de la fase 4 tiene que cuadrar, cotización por cotización,
que la suma en centavos dividida entre 100 da el mismo peso que el original, y
reportar cada diferencia. Un centavo de más en 38 cotizaciones es un error que
nadie encuentra después.

### Qué llamadas salen a internet

| Destino | Para qué |
|---|---|
| `firestore.googleapis.com` | la base, por REST (sin SDK: funciona hasta desde `file://`) |
| `firebasestorage.googleapis.com` | las fotos de los muebles — **hoy contesta 402** |
| `cdnjs.cloudflare.com` | `exceljs` y `jspdf` |
| `reactjs.org` | sólo un comentario en el código, no una petición |

**Fuentes propias, cero Google Fonts.** Cumple la regla de la suite.

Las dos librerías de CDN son un pendiente de la mudanza: sin internet, exportar
a Excel y a PDF deja de funcionar, y el Worker debería servirlas él mismo.

### Si arma PDF, y con qué

Sí: **jsPDF**. Excel con **ExcelJS**. Las dos desde cdnjs.

### Si produce o lee `.t101x`

**No.** Cero coincidencias de `t101x` en `index.html`. Queda contestada la
pregunta del arranque: quote101 no está en el camino de nest101/draw101.

### El folio

Lo asigna la propia app leyendo `reciboCounter`, sumándole uno y volviéndolo a
guardar. **Dos personas cotizando a la vez sacan el mismo folio.** La API no
genera folios (lo dice el arranque, §4). Cuando toque la fase 2 hay que
proponerlo en el muro antes de inventarlo en el navegador (D4).

---

## Lo que sigue, y en qué orden

Mike eligió la mudanza directa, sin candado de emergencia intermedio. El
razonamiento que se le dio y que aceptó: ponerle un inicio de sesión de puente
a la app de Firebase es trabajo que se tira en cuanto la mudanza termine, y
Firebase ya se está apagando solo —la facturación cerrada lo dice—.

**Mientras dure la mudanza, la base sigue abierta.** Eso está dicho y decidido,
no olvidado. El respaldo del 12-sep es la red.

1. **Fase 1** — Worker `quote101-staging` y `quote101`, static assets y el
   proxy `/s101/` (D1). Sin cambiar comportamiento.
2. **Fase 2** — entrar por la suite y guardar en `cotizaciones`. Antes: el
   folio, en el muro.
3. **Fase 3** — `items/exportar` y `items/vender`.
4. **Fase 4** — mudar las 38 cotizaciones viejas, con el cuadre de pesos a
   centavos de arriba.
5. **Fase 5** — corte. Lo apaga Mike (D3).

## Lo que NO se midió, y por qué

- **Que la escritura esté abierta.** Se leyó de las reglas que Mike pegó, no se
  probó. Probarlo habría escrito en datos de verdad.
- **Las reglas de Storage.** Contesta 402 antes de llegar a evaluarlas.
- **Si `cotizador-t101-old` lo usa alguien.** Sigue abierto del arranque §7.
- **Si los folios deben continuar la numeración vieja.** Es de Mike.
- **El sitio de Netlify servido.** Desde esta sesión el proxy rechaza
  `*.netlify.app`. Lo que se midió es la base, que es lo que importaba.
