# quote101 — arranque coordinado (copia operativa)

**De:** el coordinador de suite101, 10-sep-2026.
**Copiado al repo:** 12-sep-2026, por Jr. PROGRAMADOR (Claude Code).

> **Qué es este archivo.** El §0.7 del arranque manda copiar el documento del
> coordinador al repo, «porque el repo es la fuente de verdad; el proyecto de
> Claude es sólo el mapa». Esto **no es una copia literal**: es la parte
> operativa —lo que hace falta para trabajar en este repositorio sin abrir
> nada más—, reordenada y sin la prosa de encuadre. La diferencia queda dicha
> aquí y en el muro, no escondida.
>
> **El original completo** (28 KB) está en Google Drive:
> `suite101/coordinacion/quote101-arranque.md`, id
> `1dJXYuiYybnCB7kGEqE7RU9BJPn5JgTA9`. Si algo de aquí discrepa del original,
> manda el original; y si el original discrepa de un archivo del código, manda
> el archivo (OPERAR §3).

**El objetivo, en una línea:** mudar quote101 a Cloudflare y convertirlo en la
**puerta de entrada de los ítems de toda la suite**. Lo que se cotiza aquí es
lo que dash101 cobra, lo que quell101 fabrica y lo que el cliente ve en
peek101.

---

## Dónde está quote101 hoy

| | |
|---|---|
| Repo | `github.com/mikebalcazar/cotizador-t101` (privado) |
| Sitio vivo | Netlify `cotizador-t101` → `https://cotizador-t101.netlify.app` |
| Sitio viejo | Netlify `cotizador-t101-old`, deprecado. **No se borra:** es de Mike (D3) |
| En la API | se identifica como `cotizador101` (`X-App`); en `orgs.apps` la llave es `cotizador`. Encendida en `forespot` |

## Cómo se habla con la API

- **La sesión es sólo una cookie**: `s101`, `HttpOnly; Secure; SameSite=None`.
  No existe `Authorization: Bearer`. Esto decide cómo se hospeda la app (D1).
- **`X-App` es obligatorio** en `/orgs/…`. Valores válidos: `dash101`,
  `quell101`, `peek101`, `cotizador101`, `roster101`, `nest101`, `master101`,
  `suite101`. Si la org no tiene la app encendida: `403 app_inactiva`.
- **Entrar:** `POST /auth/codigo {correo}` manda un código de 6 dígitos por
  Resend (vence en 10 min, se reenvía cada 45 s). Luego `POST /auth/entrar
  {correo, codigo}` o `{correo, pin}`. `POST /auth/pin {pin}` lo fija. También
  `POST /auth/salir`, `GET /yo` y `/auth/google`.
- **En staging, `/auth/codigo` devuelve `codigo_prueba`** en la respuesta. Con
  eso una prueba de Playwright entra sola. En producción no lo devuelve.
- **El dinero va en centavos, como entero.** Un monto con decimales se rechaza
  con `400 dinero_no_entero`. Fechas en texto ISO 8601 UTC.
- **Cada campo tiene dueño** (`ESCRITORES`, en `src/permisos.ts`). Lo demás
  responde `403 campo_no_permitido` y dice qué sí se permite.
- **Quién ve dinero:** los miembros sí. `ve_costos` sólo owner, admin y socio.
  El personal según su `ve_dinero`. **Un cliente sólo puede abrir `/peek`.**
- Toda respuesta es `{ok:true, data}` o `{ok:false, error, detalle}`.
- Canal en vivo por org: `GET /orgs/:o/ws`.

## Lo que quote101 puede escribir (`ESCRITORES`)

| Tabla | Qué puede escribir `cotizador101` |
|---|---|
| `cotizaciones` | **todo** — es suya |
| `items` | `nombre`, `descripcion`, `tipo`, `monto`, `moneda`, `estado`, `proyecto_id`, `cliente_id`, `negocio_id`, `origen` |
| `clientes` | `nombre`, `nombre_norm`, `correo`, `telefono`, `negocio_id` (el `rfc` y las `notas` son de dash101) |
| `proveedores` | `nombre`, `nombre_norm`, `correo`, `telefono` |
| `proyectos` | `nombre`, `cliente_id`, `negocio_id` — y sólo al crearlo desde `/vender` |

La tabla `cotizaciones`, tal como está en `0001_inicial.sql`:

```
cotizaciones(id, negocio_id, cliente_id → clientes, folio,
             estado DEFAULT 'borrador', total INTEGER (centavos),
             moneda DEFAULT 'MXN', vigencia, datos TEXT JSON DEFAULT '{}',
             creado_at, actualizado_at)
```

## Las rutas que importan (a través del proxy, `/s101/…`)

- `GET /orgs/:o/pool` — clientes, proveedores y personal para autocompletar.
- `GET/POST/PATCH/DELETE /orgs/:o/cotizaciones[/:id]` — el CRUD genérico.
- `POST /orgs/:o/items/exportar`
  `{cotizacion_id, negocio_id, cliente_id, lineas:[{…, monto}]}`. Crea ítems en
  estado `cotizado`. Cada `monto` es un entero en centavos.
- `POST /orgs/:o/items/vender`
  `{item_ids, proyecto_id | null, nombre_proyecto}`. Pasa los ítems a `vendido`
  y los liga a un proyecto, o lo crea.

Ese par —exportar y vender— **es el nacimiento de un ítem en la suite**.
Después quell101 lo mueve por etapas (0 a 7; la `clave` tipo `M07` nace en la
etapa 4), dash101 lo cobra y peek101 se lo enseña al cliente.

## Las decisiones del coordinador (valen para quote101, dash101 y peek101)

**D1 · Cada app vive en su propio Worker y le habla a la API desde su mismo
origen.** El Worker sirve la interfaz como static assets y tiene un *service
binding* a `suite101-api`; todo lo que llega a `/s101/*` se reenvía sin el
prefijo. **Por qué:** la sesión es una cookie `SameSite=None`; servida desde
otro origen es cookie de terceros y Safari la bloquea, o sea todo iPhone. El
Worker pone `X-App`; la interfaz no lo manda. El prefijo es `/s101/` y no
`/api/` para no chocar con las rutas `/api` de Next.js en dash101 y para que
las tres apps tengan la misma regla.

**D2 · Nombres.** Los Workers nuevos son `quote101`, `dash101` y `peek101`,
cada uno con su gemelo `-staging`, en `https://<nombre>.mike-929.workers.dev`
hasta que haya dominio propio. Son nombres nuevos, no renombres.

**D3 · Netlify no se toca hasta el corte.** El sitio viejo sigue sirviendo
mientras el nuevo se mide a su lado. Apagar o borrar un sitio de Netlify lo
hace Mike: es irreversible. Ningún sitio de Netlify se renombra.

**D4 · Ninguna app toca una base directo.** Si falta un campo o una ruta, se
agrega en `suite101-api`, con semáforo, prueba y recado en el muro, y la app
espera a que esté desplegado. Cada cambio de contrato sube `VERSION_CONTRATO`
y se anuncia. Una migración de OrgDB se prueba como manda OPERAR §7.

**D5 · Staging primero.** Todo contra `suite101-api-staging` y el Worker
`-staging`. A producción sólo llega lo que ya salió verde ahí.

**D6 · La org de demostración.** Capturas y pruebas usan una org **`demo` en
staging**, con datos ficticios: «Familia Ramírez» y «Cocina Ramírez». **Nunca
se captura `forespot`**: ahí hay dinero real de clientes reales.

**D7 · `OPERAR.md` lo actualiza un solo chat: dash101.** Los otros no lo tocan;
si encuentran algo, lo dejan en el muro.

**D8 · Nombres de producto en minúsculas.** **quote101** (en la API sigue
siendo `cotizador101`: es contrato y no se cambia), **dash101** (su interfaz
hoy dice CONTA MASTER), **peek101**.

## Las fases

| | |
|---|---|
| **0** | Medir antes de mover nada → `claude/continuar.md`. **Hecha el 12-sep.** |
| **1** | Mudanza sin cambiar comportamiento: Worker + proxy `/s101/`, Netlify vivo al lado. Cuenta como terminada cuando Playwright cuenta lo mismo a 390×844 y a 1440, sin errores de JavaScript y sin Google Fonts |
| **2** | Guardar en la API: entrar, `/pool` para autocompletar, `cotizaciones` con `total` en centavos y el desglose en `datos`. El **folio** se propone en el muro antes de inventarlo |
| **3** | Del «sí» del cliente a los ítems: `items/exportar` y luego `items/vender`. Cuenta como terminada cuando, en staging contra `demo`, una cotización produce N ítems `cotizado`, `vender` los pasa a `vendido` con proyecto, y `/peek` los enseña. Contado por API, no a ojo |
| **4** | Las cotizaciones viejas. Importador **idempotente**, que conserve ids y se pueda correr dos veces sin duplicar |
| **5** | Corte. Mike apaga `cotizador-t101` y, si quiere, `cotizador-t101-old` |

## Publicar

Push a `main` → GitHub Actions → `wrangler deploy` con el secreto
`CLOUDFLARE_API_TOKEN` del repo → el mismo workflow mide lo publicado desde el
runner y deja los números como comentario del commit → la sesión lee ese
comentario por la API de GitHub. **Nada pasa por la computadora de Mike.**

`/s101/salud` pasa por el proxy hasta la API y devuelve
`{servicio, version, contrato, entorno, d1}`. Si responde, el binding está bien
puesto.

Tres cosas que ya no se hacen: `.bat` o parches para que Mike los corra; PAT en
`CONTEXTO.md` o en `github-token.txt`; `wrangler deploy` desde una máquina.

## Convenciones que no se negocian

- **Mike decide, el chat ejecuta y mide.** No se le pide que abra GitHub, que
  haga merge ni que verifique.
- **El mensaje de un commit no es prueba de nada.** Tampoco este documento.
- **Ninguna llave** se escribe en un chat, en un commit, en la bitácora ni en
  un archivo.
- **Dinero en centavos, como entero.** Nunca `REAL`, nunca `parseFloat` para
  guardar.
- **Fuentes propias, cero Google Fonts.** Las cifras en Fira Sans con
  `unicode-range`.
- **Nombres en minúsculas.**
- **No se renombra infraestructura que ya vive** (OPERAR §8).
- **Si no se pudo medir, se dice.** Nunca se supone.
- **Drive es la central del proyecto** (carpeta `suite101`, id
  `1DAInf5w-XgLyb7teIgTJOyfvMbLUotiv`). El repo guarda la historia; Drive es
  donde se entrega y se lee.

## El material de venta (§6 del original)

Va a `suite101/quote101/` en Drive **y** a `claude/venta/` en este repo, con
`LEEME.md`, `web.md`, `ficha.md`, `datos.md`, `marca/` y `capturas/`. Las
capturas: tema claro, español, datos de la org `demo`, **nunca datos reales**;
1600×1100 en computadora, `00-portada-16-9.png` a 1600×900, y `-celular` a
390×844 si aplica; de 4 a 9, tomadas con un guion de Playwright que queda en el
repo. Sin precios; la única llamada a la acción es pedir una demostración a
info@forespot.com. El detalle completo de los campos de `web.md` y de los
archivos de `marca/` está en el original de Drive.

## Lo que hacía falta de Mike

| # | Qué | Estado |
|---|---|---|
| M1 | Claude GitHub App instalada | ✅ comprobado con el push en seco, 12-sep |
| M2 | `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` en el repo | se comprueba en el primer deploy |
| M8 | Conector de Google Drive en la sesión | ✅ hay Drive en esta sesión |
| — | Vetar o aceptar el nombre `quote101` para el Worker (D2) | antes del primer deploy |
