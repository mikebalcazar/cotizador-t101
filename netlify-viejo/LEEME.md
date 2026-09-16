# Qué es esta carpeta

Lo único que debe servir el sitio de Netlify **`cotizador-t101-old`**: una
redirección a la dirección del cotizador que sí pide sesión.

Ese sitio no está conectado a ningún repositorio —fue un envío manual de una
sola vez— así que no se rearma solo y el `netlify.toml` de la raíz de este
repositorio no lo alcanza. Se actualiza soltándole una carpeta encima.

## Por qué existe

El 16-sep-2026 quote101 pasó a pedir sesión de la suite 101, con el candado en
el Worker de Cloudflare. Pero a la misma app se llegaba por tres direcciones, y
dos de ellas no tenían puerta:

| Dirección | Cómo quedó |
|---|---|
| `quote101.mike-929.workers.dev` | el candado |
| `cotizador-t101.netlify.app` | redirigida por `netlify.toml` de la raíz |
| `cotizador-t101-old.netlify.app` | **esta carpeta** |

Una puerta en una de tres entradas no es una puerta.

## Cómo se aplica

En https://app.netlify.com/projects/cotizador-t101-old → pestaña **Deploys** →
soltar esta carpeta (o el .zip) en el recuadro de arrastre. Reemplaza lo que
haya y queda redirigiendo.

No se borra el proyecto a propósito: borrarlo libera el nombre
`cotizador-t101-old.netlify.app` para que cualquiera lo registre en su cuenta,
y es un nombre que parece de la casa. Y una liga vieja en un correo o en un
marcador se rompería sin explicación en vez de aterrizar donde debe.

## Qué NO cierra

La base de Firebase, que sigue abierta a lectura para cualquiera. Eso se cierra
cuando las cotizaciones vivan en la suite y Firebase se apague (fases 3 a 5),
no con una redirección.

## Ojo

Esta carpeta **no** está en la lista de `scripts/armar.mjs`, así que no se
publica en el Worker. Es sólo el contenido de ese sitio de Netlify.
