# quote101 — Datos técnicos

| Campo | Valor |
|---|---|
| **Nombre oficial** | quote101 |
| **Versión** | G80 |
| **URL producción** | https://cotizador-t101.netlify.app |
| **Repo** | github.com/mikebalcazar/cotizador-t101 (privado) |
| **Estado** | Producción activa — uso diario en Taller 101 |
| **Deploy** | Push a `main` → Netlify auto-deploy (~30 seg) |
| **Stack** | React 18 UMD · Firebase Firestore · Netlify CDN — HTML/JS standalone, sin build step |
| **Fuentes** | Raleway (texto) · Fira Sans (números) · Sansation (marca) — Google Fonts |
| **Color de marca** | `#0080C1` |
| **Librerías** | ExcelJS 4.4.0 · jsPDF 2.5.1 · JSZip 3.10.1 |
| **Auth** | Firebase (Firestore Spark) — reglas `allow read, write: if true` (acceso interno) |

## Historial de versiones relevantes

| Versión | Cambio principal |
|---|---|
| G80 | Rebrand a quote101 · logo SVG · tipografía corregida (Fira Sans números) · color #0080C1 |
| G79 | Importador .t101x (nest101 → componentes) · JSZip |
| G76 | Términos y condiciones en PDF · esquema de pagos 60/20/10/10 |
| G75 | Firma digital embebida en bloque de aceptación |
| G73 | Vigencia hoy+30 en PDF · secciones formales |
| G72 | Toggle mueble: "+" animado que rota a "×" |
| G69–G71 | Cubierta: paso de fondo (30/40/50-60/+60cm) + multiplicador de precio |
| G68 | Botón "+ Agregar mueble" también al final de la lista |
| G65 | Autosave · Panel materiales · Reordenar muebles ▲▼ |
| G61 | Volver desde edición regresa a la cotización (no al inicio) |
| G48–G49 | Recibo migrado a HTML+Google Fonts · fix `</script>` en string JS |
| G40 | Tablas PF (Frentes) independientes · cálculo sin 80/20 |
