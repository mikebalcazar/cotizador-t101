/* El Excel del cliente: la misma propuesta que el PDF, en hoja de cálculo.
 *
 * Mike, 27-nov-2026: «necesito poder exportar un excel de la versión del pdf
 * del cliente. Con formato de imagen corporativa de taller101». Decidió por
 * botones que fuera un botón NUEVO, dejando el «Excel arq» como estaba.
 *
 * Lo que más importa de estas pruebas: que el Excel y el PDF digan el MISMO
 * dinero. Dos documentos que salen del mismo botón mental y cuadran distinto
 * es peor que no tener el segundo, porque nadie se entera hasta que el
 * cliente compara. Por eso el resumen no se compara contra números escritos
 * aquí, sino contra los que el PDF acaba de imprimir.
 *
 *     npm run armar && node --test pruebas/el-excel-del-cliente.spec.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PUBLICAR = fileURLToPath(new URL('../publicar/', import.meta.url));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const servidor = createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const archivo = join(PUBLICAR, ruta === '/' ? 'index.html' : ruta);
  try { const cuerpo = await readFile(archivo); res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' }); res.end(cuerpo); }
  catch { res.writeHead(404).end('no está'); }
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const EXCELJS = fileURLToPath(new URL('../node_modules/exceljs/dist/exceljs.min.js', import.meta.url));
const ok = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });

/* Un plano de 4×3 px: lo justo para que el canvas tenga algo que dibujar y
 * los círculos se quemen encima de verdad. */
const PLANO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAFklEQVR42mP8z8Dwn4GKgHHUwFEDqWsgAM1pBAXnFz6AAAAAAElFTkSuQmCC';
const COMPS = [
  /* `unitario`/`qty`/`subtotal` son lo que hace que `preciosHoja` pueda
   * sacar el precio exacto de cada componente; sin ellos el PDF deja la
   * columna en blanco y no habría nada que comparar. */
  { id: 'c-1', modulo: 'Gabinete', desc: 'Base 60', tags: ['Formaica'], extras: ['Bisagra $120'], unitario: 14000, qty: 1, subtotal: 14000, pos: { x: 0.25, y: 0.4 } },
  { id: 'c-2', modulo: 'Cubierta', desc: 'Cubierta 2.40 m', tags: ['Superficie sólida'], extras: [], unitario: 6000, qty: 2.4, subtotal: 14400, pos: { x: 0.7, y: 0.6 } },
];
const MUEBLE = {
  id: 'm-1', nombre: 'Cocina integral', qty: 2, total: 40000, componentes: COMPS,
  perfil: { int: { formato: '18mm', acabado: 'formaica', chapa: null }, fre: { formato: '18mm', acabado: 'formaica', chapa: null } },
  imagenes: [], plano: { src: PLANO },
};
const A_MANO = { id: 'm-2', manual: true, nombre: 'Instalación en sitio', descripcion: 'Maniobras y montaje', qty: 1, precio: 5000, total: 5000, componentes: [], imagenes: [] };
const VERSION = {
  muebles: [MUEBLE, A_MANO], usaFlete: true, usaArq: true, usaTDC: true, cargosAMano: true,
  desglosar: true, descuento: 5, fecha: '2026-11-27T12:00:00Z',
  materiales: { formaica: 'Blanco mate Egger', chapaEncino: 'Encino rift natural' },
};
/* 2×2 px azules: basta para que el logotipo exista como imagen en la hoja. */
const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mNkYPhfz0AEYBxVSF+FAMUdA/1NXFerAAAAAElFTkSuQmCC';
/* El logotipo no viaja en el JSON: la API manda su ruta y la app la baja y la
 * vuelve data URL. Se imita igual, o el Excel saldría sin marca y la prueba
 * estaría midiendo otra cosa. */
const LOGO_RUTA = '/orgs/org-1/archivos/logo.png';
const EMPRESA = { nombre: 'taller101', logo_ruta: LOGO_RUTA, correo: 'hola@taller101.com', telefono: '55-2951-7900', sitio_web: 'www.taller101.com', rfc: 'XAXX010101000', direccion: 'CDMX' };
const CLIENTE = { id: 'cl-1', nombre: 'Casa Muestra', negocio_id: 'n-1' };
const PROYECTO = { id: 'pr-1', nombre: 'Departamento Lomas', cliente_id: 'cl-1', negocio_id: 'n-1' };
const COT = {
  id: 'q-1', folio: 'C-0007', cliente_id: 'cl-1', negocio_id: 'n-1', total: 2000000,
  datos: { nombre: 'Corrida 1', proyecto_id: 'pr-1', versiones: [VERSION] },
};

async function abrirApp() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  /* cdnjs no se alcanza desde el contenedor de pruebas, y una prueba que
   * depende de internet no prueba nada el día que la red falle. Se sirve la
   * MISMA versión de exceljs que carga la app, desde node_modules. */
  await p.route('**/cdnjs.cloudflare.com/**', async (route) => {
    const u = route.request().url();
    if (/exceljs/.test(u)) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: await readFile(EXCELJS, 'utf8') });
    }
    /* Lo demás de cdnjs (jspdf) se deja caer como cae hoy en este contenedor:
     * un cuerpo falso no pasaría su `integrity` y ensuciaría la consola. */
    return route.abort();
  });
  await p.route('**/s101/**', (route) => {
    const r = new URL(route.request().url()).pathname.replace(/^\/s101/, '');
    if (route.request().method() !== 'GET') return route.fulfill({ ...ok({ id: 'q-1', folio: 'C-0007' }), status: 200 });
    if (r === '/yo') return route.fulfill(ok({ usuario: { correo: 'mike@ejemplo.mx' }, orgs: [{ id: 'org-1', nombre: 'Taller de prueba' }] }));
    if (r === LOGO_RUTA) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(LOGO.split(',')[1], 'base64') });
    if (r === '/orgs/org-1/empresa') return route.fulfill(ok(EMPRESA));
    if (r === '/orgs/org-1/negocios') return route.fulfill(ok({ filas: [{ id: 'n-1', nombre: 'Taller', moneda: 'MXN' }] }));
    if (r === '/orgs/org-1/clientes') return route.fulfill(ok({ filas: [CLIENTE] }));
    if (r === '/orgs/org-1/proyectos') return route.fulfill(ok({ filas: [PROYECTO] }));
    if (r === '/orgs/org-1/cotizaciones') return route.fulfill(ok({ filas: [COT] }));
    return route.fulfill(ok({ filas: [] }));
  });
  await p.goto(base, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => document.querySelectorAll('#root *').length > 10, null, { timeout: 20000 });
  await p.getByText('Casa Muestra').first().click(); await p.waitForTimeout(400);
  await p.getByText('Departamento Lomas').first().click(); await p.waitForTimeout(400);
  await p.getByText('Corrida 1').first().click();
  await p.waitForSelector('[data-pantalla="hoja"]', { timeout: 10000 });
  return { ctx, p, errores };
}

/* El .xlsx se abre con openpyxl: el archivo de verdad, no lo que el
 * navegador creía estar escribiendo. */
function leerLibro(ruta) {
  const py = `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
out = {}
for ws in wb.worksheets:
    celdas = []
    for fila in ws.iter_rows():
        for c in fila:
            if c.value not in (None, ""):
                celdas.append({"ref": c.coordinate, "v": c.value if not hasattr(c.value, "isoformat") else str(c.value),
                               "fmt": c.number_format,
                               "relleno": (c.fill.fgColor.rgb if c.fill and c.fill.fgColor and isinstance(c.fill.fgColor.rgb, str) else None),
                               "fuente": c.font.name, "color": (c.font.color.rgb if c.font.color and isinstance(c.font.color.rgb, str) else None)})
    out[ws.title] = {"celdas": celdas}
# openpyxl no expone como imagen lo que ExcelJS escribe, asi que las imagenes
# se cuentan en el archivo mismo: los medios del libro y el dibujo de cada hoja.
import zipfile
z = zipfile.ZipFile(sys.argv[1])
medios = [n for n in z.namelist() if n.startswith("xl/media/")]
for i, ws in enumerate(wb.worksheets, start=1):
    rels = "xl/worksheets/_rels/sheet%d.xml.rels" % i
    tiene = rels in z.namelist() and b"drawing" in z.read(rels)
    out[ws.title]["imagenes"] = 1 if tiene else 0
out["_medios"] = len(medios)
print(json.dumps(out))
`;
  const r = spawnSync('python3', ['-I', '-c', py, ruta], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.status, 0, 'openpyxl abrió el archivo: ' + (r.stderr || '').slice(-600));
  return JSON.parse(r.stdout);
}
const textos = (hoja) => hoja.celdas.filter((c) => typeof c.v === 'string').map((c) => c.v);
const numeros = (hoja) => hoja.celdas.filter((c) => typeof c.v === 'number').map((c) => c.v);
const pesos = (t) => [...String(t).matchAll(/\$\s*([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));

async function bajarExcel(ctx, p) {
  const dir = await mkdtemp(join(tmpdir(), 'xlsx-'));
  const ruta = join(dir, 'cliente.xlsx');
  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 30000 }),
    p.getByRole('button', { name: 'Excel cliente' }).click(),
  ]);
  await dl.saveAs(ruta);
  return { libro: leerLibro(ruta), nombre: dl.suggestedFilename(), dir };
}

test('hay un botón «Excel cliente» y el «Excel arq» sigue en su lugar', async () => {
  const { ctx, p, errores } = await abrirApp();
  try {
    assert.equal(await p.getByRole('button', { name: 'Excel cliente' }).count(), 1, 'el botón nuevo existe');
    assert.equal(await p.getByRole('button', { name: 'Excel arq' }).count(), 1, 'y el de siempre no se tocó');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); }
});

test('el Excel trae las tres hojas, con la propuesta, los planos y las condiciones', async () => {
  const { ctx, p, errores } = await abrirApp();
  let dir;
  try {
    const r = await bajarExcel(ctx, p);
    dir = r.dir;
    const L = r.libro;
    assert.match(r.nombre, /CLIENTE\.xlsx$/, 'el archivo se llama del cliente, no _ARQ');
    assert.deepEqual(Object.keys(L).filter((k) => k[0] !== '_'), ['Propuesta', 'Planos', 'Condiciones'], 'las tres hojas, en ese orden');

    const T = textos(L.Propuesta).join('\n');
    assert.match(T, /Folio \d{6}/, 'el folio');
    assert.match(T, /Estimado\/a Casa Muestra,/, 'el saludo con el nombre del cliente');
    assert.match(T, /Departamento Lomas/, 'el proyecto');
    assert.match(T, /MATERIALES Y ACABADOS/, 'el bloque de materiales');
    assert.match(T, /Blanco mate Egger/, 'y lo que se eligió en cada uno');
    assert.match(T, /Encino rift natural/);
    assert.match(T, /2 × Cocina integral/, 'el mueble, con su cantidad');
    assert.match(T, /Base 60/, 'y sus componentes, desglosados');
    assert.match(T, /Cubierta 2\.40 m/);
    assert.match(T, /Maniobras y montaje/, 'el renglón a mano trae su descripción');
    assert.match(T, /Subtotal[\s\S]*IVA[\s\S]*TOTAL/, 'el resumen');

    assert.equal(L.Planos.imagenes, 1, 'la hoja de planos trae el plano incrustado');
    assert.ok(L._medios >= 2, 'y el libro lleva al menos dos imágenes: el logotipo y el plano (' + L._medios + ')');

    const C = textos(L.Condiciones).join('\n');
    for (const n of [1, 2, 5, 10]) assert.match(C, new RegExp('^' + n + '\\. ', 'm'), 'la condición ' + n + ' está');
    assert.match(C, /ACEPTACIÓN DE PRESUPUESTO/, 'y el bloque de aceptación');
    assert.ok(!/<\/?(ul|li|br|div|p|b|strong)\b/i.test(C), 'el texto va en limpio, sin etiquetas HTML');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); if (dir) await rm(dir, { recursive: true, force: true }); }
});

test('el dinero del Excel es el MISMO que el del PDF del cliente', async () => {
  const { ctx, p, errores } = await abrirApp();
  let dir;
  try {
    // 1) Lo que imprime el PDF, que es el papel que firma el cliente.
    const [w] = await Promise.all([ctx.waitForEvent('page'), p.getByRole('button', { name: 'PDF cliente con condiciones' }).click()]);
    await w.waitForLoadState('domcontentloaded');
    const resumenPDF = pesos(await w.locator('.res').innerText());
    const unitariosPDF = pesos((await w.locator('[data-comp-unit]').allInnerTexts()).join(' '));
    const subsPDF = pesos((await w.locator('[data-comp-sub]').allInnerTexts()).join(' '));
    await w.close();
    assert.ok(resumenPDF.length >= 3, 'el PDF imprimió su resumen');
    assert.equal(unitariosPDF.length, 2, 'y los dos componentes con su precio unitario');

    // 2) Lo que escribe el Excel.
    const r = await bajarExcel(ctx, p);
    dir = r.dir;
    const nums = numeros(r.libro.Propuesta);

    for (const v of unitariosPDF) assert.ok(nums.includes(v), 'el precio unitario ' + v + ' del PDF está igual en el Excel');
    for (const v of subsPDF) assert.ok(nums.includes(v), 'el subtotal de componente ' + v + ' está igual en el Excel');
    for (const v of resumenPDF) assert.ok(nums.includes(v) || nums.includes(-v), 'el renglón de resumen ' + v + ' está igual en el Excel');

    // 3) Y son números de verdad, con formato de dinero: sumables en Excel.
    const dinero = r.libro.Propuesta.celdas.filter((c) => typeof c.v === 'number' && /\$/.test(c.fmt || ''));
    assert.ok(dinero.length >= 5, 'los montos son números con formato de pesos, no texto (' + dinero.length + ')');
    assert.ok(dinero.every((c) => c.fuente === 'Fira Sans'), 'y las cifras van en Fira Sans, como manda la suite');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); if (dir) await rm(dir, { recursive: true, force: true }); }
});

test('lleva la imagen corporativa: azul de la casa y el logotipo', async () => {
  const { ctx, p, errores } = await abrirApp();
  let dir;
  try {
    const r = await bajarExcel(ctx, p);
    dir = r.dir;
    const P = r.libro.Propuesta;
    const azul = P.celdas.filter((c) => c.relleno === 'FF0080C1');
    assert.ok(azul.length >= 6, 'la cabecera y los muebles van en el azul #0080C1 (' + azul.length + ' celdas)');
    const blanco = P.celdas.filter((c) => c.color === 'FFFFFFFF');
    assert.ok(blanco.length >= 3, 'y su texto en blanco encima');
    assert.equal(P.imagenes, 1, 'el logotipo va en la hoja de la propuesta');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); if (dir) await rm(dir, { recursive: true, force: true }); }
});

test('sin desglose, el Excel enseña la lista y el dinero, sin la tabla de componentes', async () => {
  const { ctx, p, errores } = await abrirApp();
  let dir;
  try {
    await p.locator('[data-campo="desglosar"]').uncheck();
    await p.waitForTimeout(300);
    const r = await bajarExcel(ctx, p);
    dir = r.dir;
    const T = textos(r.libro.Propuesta).join('\n');
    assert.ok(!/Base 60/.test(T), 'ya no salen los componentes');
    assert.match(T, /Cocina integral/, 'pero sí el mueble');
    assert.match(T, /TOTAL/, 'y el resumen sigue entero');
    assert.ok(!Object.keys(r.libro).filter((k) => k[0] !== '_').includes('Planos'), 'sin desglose tampoco van los planos: sus números remiten a la tabla que no está');
    assert.deepEqual(errores, [], 'sin errores de JavaScript');
  } finally { await ctx.close(); if (dir) await rm(dir, { recursive: true, force: true }); }
});

test.after(async () => { await navegador.close(); servidor.close(); });
