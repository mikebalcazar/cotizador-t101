/* Cómo guarda quote101 en la suite, mirado de cerca y sin navegador.
 *
 * `paridad.spec.mjs` abre la app con Playwright y comprueba lo que se ve desde
 * afuera: que arranca, que pinta y que ya no le habla a Firebase. Lo que no
 * puede mirar de cerca es lo de adentro: qué se crea, qué se actualiza, qué se
 * borra y en qué orden, y cuántos centavos se guardan. Ahí es donde viven los
 * errores que cuestan datos.
 *
 * Así que aquí se carga el bloque de `window.suiteDB` **tal como va publicado**
 * —se saca de `index.html`, no se copia— y se le da un `fetch` de mentiras que
 * apunta lo que le pidieron. Copiar el código a la prueba sería probar una
 * copia que mañana se queda atrás.
 *
 *   node --test pruebas/guardado.spec.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTML = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

/** El bloque que va publicado, sacado del propio `index.html`. */
function bloqueDeGuardado() {
  const bloques = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const b = bloques.find((x) => x.includes('window.suiteDB'));
  assert.ok(b, 'no encontré el bloque de window.suiteDB en index.html');
  return b;
}

/** Levanta el módulo con un `fetch` de mentiras. `rutas` contesta por
 *  `MÉTODO /ruta`; lo que no esté contestado truena, para que ninguna prueba
 *  pase por accidente creyendo que algo respondió. */
function levantar(rutas = {}) {
  const pedidas = [];
  const ventana = {};
  const sitio = { href: '/' };

  const fetchFalso = async (url, opciones = {}) => {
    const metodo = opciones.method || 'GET';
    const ruta = String(url);
    pedidas.push({ metodo, ruta, cuerpo: opciones.body && typeof opciones.body === 'string' ? JSON.parse(opciones.body) : opciones.body });
    const llave = Object.keys(rutas).find((k) => {
      const [m, patron] = k.split(' ');
      return m === metodo && new RegExp('^' + patron.replace(/:\w+/g, '[^/?]+') + '$').test(ruta.split('?')[0]);
    });
    if (!llave) throw new Error(`el fetch de mentiras no sabe contestar ${metodo} ${ruta}`);
    const r = rutas[llave];
    const salida = typeof r === 'function' ? r({ metodo, ruta, cuerpo: pedidas[pedidas.length - 1].cuerpo }) : r;
    return {
      status: salida.estado ?? 200,
      json: async () => salida.cuerpo ?? { ok: true, data: salida.data },
    };
  };

  // eslint-disable-next-line no-new-func
  new Function('window', 'location', 'fetch', bloqueDeGuardado())(ventana, sitio, fetchFalso);
  return { db: ventana.suiteDB, pedidas, sitio };
}

const YO = { 'GET /s101/yo': { data: { orgs: [{ id: 'taller', nombre: 'Taller 101' }] } } };
const NEG = { 'GET /s101/orgs/:o/negocios': { data: { filas: [{ id: 'neg-1', nombre: 'Taller' }] } } };

/** Lo mínimo para que `identidad()` pase. */
const base = (extra = {}) => ({ ...YO, ...NEG, ...extra });

/* ─────────────── cargar ─────────────── */

describe('cargar: el árbol se arma de las tres tablas', () => {
  const rutas = base({
    'GET /s101/orgs/:o/clientes': { data: { filas: [{ id: 'c1', nombre: 'Casa Aurea' }, { id: 'c2', nombre: 'Rita' }] } },
    'GET /s101/orgs/:o/proyectos': { data: { filas: [{ id: 'p1', nombre: 'Cocina', cliente_id: 'c1' }] } },
    'GET /s101/orgs/:o/cotizaciones': {
      data: {
        filas: [{
          id: 'q1', cliente_id: 'c1', folio: 'COT-000001', total: 2500100,
          datos: { nombre: 'Cocina integral', proyecto_id: 'p1', versiones: [{ fecha: 'x', muebles: [] }] },
        }],
      },
    },
    'GET /s101/orgs/:o/ajustes': {
      data: { filas: [{ clave: 'config', valor: { empresa: 'Taller 101' } }, { clave: 'precios', valor: { mano_obra: 350 } }] },
    },
  });

  test('cada cotización queda dentro de su proyecto y su cliente', async () => {
    const { db } = levantar(rutas);
    const r = await db.cargar();
    assert.equal(r.clientes.length, 2);
    const aurea = r.clientes.find((c) => c.id === 'c1');
    assert.equal(aurea.proyectos.length, 1);
    assert.equal(aurea.proyectos[0].cotizaciones.length, 1);
    assert.equal(aurea.proyectos[0].cotizaciones[0].nombre, 'Cocina integral');
    assert.equal(aurea.proyectos[0].cotizaciones[0].folio, 'COT-000001');
    // Un cliente sin proyectos no se queda sin el arreglo: la app recorre
    // `c.proyectos` sin preguntar.
    assert.deepEqual(r.clientes.find((c) => c.id === 'c2').proyectos, []);
  });

  test('la configuración y los precios salen de ajustes', async () => {
    const { db } = levantar(rutas);
    const r = await db.cargar();
    assert.deepEqual(r.config, { empresa: 'Taller 101' });
    assert.deepEqual(r.prices, { mano_obra: 350 });
  });

  test('si algo falla se devuelve vacío, no a medias', async () => {
    // Enseñar la mitad del árbol y dejar que alguien guarde encima borraría lo
    // que no se alcanzó a leer.
    const { db } = levantar({ ...YO, 'GET /s101/orgs/:o/negocios': { estado: 500, cuerpo: { error: 'trueno' } } });
    const r = await db.cargar();
    assert.deepEqual(r, { clientes: [], config: null, prices: null });
  });

  test('si la empresa no tiene negocio, el cotizador crea el suyo', async () => {
    // `cotizaciones.negocio_id` es obligatorio: sin negocio no se puede
    // cotizar, y quedaría trabado esperando a otra app.
    const { db, pedidas } = levantar({
      ...YO,
      'GET /s101/orgs/:o/negocios': { data: { filas: [] } },
      'POST /s101/orgs/:o/negocios': { estado: 201, data: { id: 'neg-nuevo' } },
      'GET /s101/orgs/:o/clientes': { data: { filas: [] } },
      'GET /s101/orgs/:o/proyectos': { data: { filas: [] } },
      'GET /s101/orgs/:o/cotizaciones': { data: { filas: [] } },
      'GET /s101/orgs/:o/ajustes': { data: { filas: [] } },
    });
    await db.cargar();
    const creado = pedidas.find((p) => p.metodo === 'POST' && p.ruta.endsWith('/negocios'));
    assert.ok(creado, 'se creó el negocio');
    assert.equal(creado.cuerpo.nombre, 'Taller 101');
  });

  test('una sesión vencida manda a la puerta, no da vueltas', async () => {
    const { db, sitio } = levantar({ 'GET /s101/yo': { estado: 401, cuerpo: { error: 'sin_sesion' } } });
    await db.cargar();
    assert.equal(sitio.href, '/entrar.html');
  });
});

/* ─────────────── guardar ─────────────── */

/** Un árbol nuevo, como el que la app tiene en memoria antes del primer guardado. */
const arbolNuevo = () => ([{
  id: 'tmp-c', nombre: 'Casa Aurea',
  proyectos: [{
    id: 'tmp-p', nombre: 'Cocina',
    cotizaciones: [{
      id: 'tmp-q', nombre: 'Cocina integral',
      versiones: [{ fecha: '2026-03-04', muebles: [{ id: 'm1', total: 12500.5, qty: 2 }] }],
    }],
  }],
}]);

const vacio = () => base({
  'GET /s101/orgs/:o/clientes': { data: { filas: [] } },
  'GET /s101/orgs/:o/proyectos': { data: { filas: [] } },
  'GET /s101/orgs/:o/cotizaciones': { data: { filas: [] } },
  'GET /s101/orgs/:o/ajustes': { data: { filas: [] } },
  'POST /s101/orgs/:o/clientes': { estado: 201, data: { id: 'CLI' } },
  'POST /s101/orgs/:o/proyectos': { estado: 201, data: { id: 'PRO' } },
  'POST /s101/orgs/:o/cotizaciones': { estado: 201, data: { id: 'COT', folio: 'COT-000001' } },
  'PATCH /s101/orgs/:o/clientes/:id': { data: {} },
  'PATCH /s101/orgs/:o/proyectos/:id': { data: {} },
  'PATCH /s101/orgs/:o/cotizaciones/:id': { data: {} },
  'DELETE /s101/orgs/:o/clientes/:id': { data: { borrado: true } },
  'DELETE /s101/orgs/:o/proyectos/:id': { data: { borrado: true } },
  'DELETE /s101/orgs/:o/cotizaciones/:id': { data: { borrado: true } },
});

describe('guardar: lo nuevo se crea y los ids los pone la suite', () => {
  test('se crea de arriba hacia abajo y el árbol adopta los ids', async () => {
    const { db, pedidas } = levantar(vacio());
    await db.cargar();
    const arbol = arbolNuevo();
    assert.equal(await db.guardar(arbol), true);

    const creados = pedidas.filter((p) => p.metodo === 'POST').map((p) => p.ruta.split('/').pop());
    assert.deepEqual(creados, ['clientes', 'proyectos', 'cotizaciones'], 'cliente, luego proyecto, luego cotización');

    // Y el árbol se queda con los ids de la base, no con los inventados: la
    // suite no deja que una app elija el id de un cliente, y tener dos
    // identidades para la misma cosa se descubre el día que algo no se borra.
    assert.equal(arbol[0].id, 'CLI');
    assert.equal(arbol[0].proyectos[0].id, 'PRO');
    assert.equal(arbol[0].proyectos[0].cotizaciones[0].id, 'COT');
  });

  test('el folio que devuelve la suite se guarda en el árbol', async () => {
    const { db } = levantar(vacio());
    await db.cargar();
    const arbol = arbolNuevo();
    await db.guardar(arbol);
    assert.equal(arbol[0].proyectos[0].cotizaciones[0].folio, 'COT-000001');
  });

  test('el total va en centavos enteros, convertidos antes de multiplicar', async () => {
    const { db, pedidas } = levantar(vacio());
    await db.cargar();
    await db.guardar(arbolNuevo());
    const cot = pedidas.find((p) => p.metodo === 'POST' && p.ruta.endsWith('/cotizaciones'));
    assert.equal(cot.cuerpo.total, 2500100);  // 12500.50 × 2
  });

  test('10.005 por pieza × 4 son 4004 centavos, no 4002', async () => {
    // Multiplicando primero en flotantes: 10.005 × 4 = 40.02 → 4002. Los dos
    // centavos de diferencia no están en ningún renglón.
    const { db, pedidas } = levantar(vacio());
    await db.cargar();
    const arbol = arbolNuevo();
    arbol[0].proyectos[0].cotizaciones[0].versiones[0].muebles = [{ total: 10.005, qty: 4 }];
    await db.guardar(arbol);
    const cot = pedidas.find((p) => p.metodo === 'POST' && p.ruta.endsWith('/cotizaciones'));
    assert.equal(cot.cuerpo.total, 4004);
    assert.equal(Math.round(10.005 * 4 * 100), 4002);
  });

  test('las versiones viajan enteras en `datos`, con el proyecto adentro', async () => {
    const { db, pedidas } = levantar(vacio());
    await db.cargar();
    await db.guardar(arbolNuevo());
    const cot = pedidas.find((p) => p.metodo === 'POST' && p.ruta.endsWith('/cotizaciones'));
    assert.equal(cot.cuerpo.datos.proyecto_id, 'PRO');
    assert.equal(cot.cuerpo.datos.versiones.length, 1);
  });
});

describe('guardar: sólo se manda lo que cambió', () => {
  test('guardar dos veces lo mismo no manda ni una escritura', async () => {
    // `guardar` recibe el árbol completo en cada tecleo. Sin esto, cada letra
    // que alguien escriba reescribiría todo.
    const { db, pedidas } = levantar(vacio());
    await db.cargar();
    const arbol = arbolNuevo();
    await db.guardar(arbol);
    const antes = pedidas.length;
    assert.equal(await db.guardar(arbol), true);
    assert.equal(pedidas.length, antes, 'la segunda vez no salió ninguna petición');
  });

  test('cambiarle el nombre a un cliente manda UN PATCH y nada más', async () => {
    const { db, pedidas } = levantar(vacio());
    await db.cargar();
    const arbol = arbolNuevo();
    await db.guardar(arbol);
    const antes = pedidas.length;
    arbol[0].nombre = 'Casa Áurea Pérez';
    await db.guardar(arbol);
    const nuevas = pedidas.slice(antes);
    assert.equal(nuevas.length, 1);
    assert.equal(nuevas[0].metodo, 'PATCH');
    assert.ok(nuevas[0].ruta.includes('/clientes/CLI'));
  });

  test('cambiarle un mueble a la cotización actualiza la cotización, no el cliente', async () => {
    const { db, pedidas } = levantar(vacio());
    await db.cargar();
    const arbol = arbolNuevo();
    await db.guardar(arbol);
    const antes = pedidas.length;
    arbol[0].proyectos[0].cotizaciones[0].versiones[0].muebles.push({ total: 300, qty: 1 });
    await db.guardar(arbol);
    const nuevas = pedidas.slice(antes);
    assert.equal(nuevas.length, 1);
    assert.ok(nuevas[0].ruta.includes('/cotizaciones/COT'));
    assert.equal(nuevas[0].cuerpo.total, 2500100 + 30000);
  });
});

describe('guardar: lo que se quitó de la pantalla se borra', () => {
  test('una cotización que ya no está se borra', async () => {
    const { db, pedidas } = levantar(vacio());
    await db.cargar();
    const arbol = arbolNuevo();
    await db.guardar(arbol);
    const antes = pedidas.length;
    arbol[0].proyectos[0].cotizaciones = [];
    await db.guardar(arbol);
    const borradas = pedidas.slice(antes).filter((p) => p.metodo === 'DELETE');
    assert.equal(borradas.length, 1);
    assert.ok(borradas[0].ruta.includes('/cotizaciones/COT'));
  });

  test('borrar un cliente entero va de abajo hacia arriba', async () => {
    // Al revés la suite contesta 409, porque quedan filas apuntando.
    const { db, pedidas } = levantar(vacio());
    await db.cargar();
    const arbol = arbolNuevo();
    await db.guardar(arbol);
    const antes = pedidas.length;
    await db.guardar([]);
    const orden = pedidas.slice(antes).filter((p) => p.metodo === 'DELETE')
      .map((p) => p.ruta.split('/').slice(-2)[0]);
    assert.deepEqual(orden, ['cotizaciones', 'proyectos', 'clientes']);
  });
});

describe('guardar: las fotos', () => {
  const conFoto = () => {
    const a = arbolNuevo();
    a[0].proyectos[0].cotizaciones[0].versiones[0].muebles[0].imagenes = [
      'data:image/jpeg;base64,AAAA',
      '/s101/orgs/taller/archivos/ya-estaba',
    ];
    return a;
  };

  test('una foto nueva se sube y en el árbol queda su dirección', async () => {
    const { db, pedidas } = levantar({ ...vacio(), 'POST /s101/orgs/:o/archivos': { estado: 201, data: { id: 'ARCH' } } });
    await db.cargar();
    const arbol = conFoto();
    await db.guardar(arbol);
    const subida = pedidas.filter((p) => p.ruta.endsWith('/archivos'));
    assert.equal(subida.length, 1, 'sólo la nueva: la que ya era dirección no se vuelve a subir');
    const imgs = arbol[0].proyectos[0].cotizaciones[0].versiones[0].muebles[0].imagenes;
    assert.equal(imgs[0], '/s101/orgs/taller/archivos/ARCH');
    assert.equal(imgs[1], '/s101/orgs/taller/archivos/ya-estaba');
  });

  test('y en el siguiente guardado ya no se sube otra vez', async () => {
    // Se escribe en el arreglo del árbol, no en una copia. Si no, cada guardado
    // subiría la misma foto y la app se haría más lenta a cada rato.
    const { db, pedidas } = levantar({ ...vacio(), 'POST /s101/orgs/:o/archivos': { estado: 201, data: { id: 'ARCH' } } });
    await db.cargar();
    const arbol = conFoto();
    await db.guardar(arbol);
    const antes = pedidas.filter((p) => p.ruta.endsWith('/archivos')).length;
    await db.guardar(arbol);
    assert.equal(pedidas.filter((p) => p.ruta.endsWith('/archivos')).length, antes);
  });
});

describe('guardar: cuando algo falla', () => {
  test('devuelve false y no da por guardado lo que no se guardó', async () => {
    // Si la huella se apuntara igual, el siguiente guardado creería que la
    // cotización ya está en la suite y no la volvería a mandar: se perdería
    // sin que nadie viera un error.
    const { db, pedidas } = levantar({ ...vacio(), 'POST /s101/orgs/:o/cotizaciones': { estado: 500, cuerpo: { error: 'trueno' } } });
    await db.cargar();
    const arbol = arbolNuevo();
    assert.equal(await db.guardar(arbol), false);
    const antes = pedidas.filter((p) => p.metodo === 'POST' && p.ruta.endsWith('/cotizaciones')).length;
    await db.guardar(arbol);
    assert.ok(pedidas.filter((p) => p.metodo === 'POST' && p.ruta.endsWith('/cotizaciones')).length > antes,
      'la cotización se vuelve a intentar en el siguiente guardado');
  });
});

describe('el folio del recibo', () => {
  test('mirarlo NO lo aparta, y viene con cuatro dígitos', async () => {
    const { db, pedidas } = levantar(base({ 'GET /s101/orgs/:o/folios/:serie': { data: { serie: 'REC', siguiente: 8 } } }));
    assert.equal(await db.leerFolioActual(), '0008');
    assert.deepEqual(pedidas.filter((p) => p.metodo !== 'GET'), []);
  });

  test('apartarlo lo pide a la suite, no lo calcula aquí', async () => {
    // Antes este navegador leía el contador, le sumaba uno y lo guardaba. Dos
    // personas haciendo un recibo a la vez se llevaban el mismo número.
    const { db, pedidas } = levantar(base({ 'POST /s101/orgs/:o/folios/:serie': { estado: 201, data: { serie: 'REC', numero: 9 } } }));
    assert.equal(await db.obtenerProximoFolio(), '0009');
    assert.ok(pedidas.some((p) => p.metodo === 'POST' && p.ruta.includes('/folios/REC')));
  });

  test('si no se puede apartar, truena en vez de inventar un número', async () => {
    const { db } = levantar(base({ 'POST /s101/orgs/:o/folios/:serie': { estado: 500, cuerpo: { error: 'trueno' } } }));
    await assert.rejects(() => db.obtenerProximoFolio(), /folio del recibo/);
  });
});

describe('la configuración y los precios', () => {
  test('van a ajustes con su clave, en un solo POST', async () => {
    const { db, pedidas } = levantar(base({ 'POST /s101/orgs/:o/ajustes': { estado: 201, data: { id: 'cotizador101:config' } } }));
    assert.equal(await db.guardarConfig({ empresa: 'Taller 101' }), true);
    assert.equal(await db.guardarPrices({ mano_obra: 350 }), true);
    const claves = pedidas.filter((p) => p.ruta.endsWith('/ajustes')).map((p) => p.cuerpo.clave);
    assert.deepEqual(claves, ['config', 'precios']);
  });
});

describe('los dos huecos que salieron al revisar el diff a la contra', () => {
  test('una fila que la pantalla NUNCA vio no se puede borrar', async () => {
    /* El caso: una cotización cuyo `proyecto_id` apunta a un proyecto que no
     * existe. El árbol no la puede colgar de ningún lado, así que no se enseña.
     * Si el espejo la llevara igual, el siguiente guardado la borraría — sin que
     * nadie la hubiera visto ni pedido, y sin un error a la vista.
     *
     * Por eso el espejo se llena recorriendo el árbol que se entrega y no las
     * listas que llegaron: en el espejo sólo hay lo que se le enseñó a la
     * pantalla. */
    const { db, pedidas } = levantar({
      ...vacio(),
      'GET /s101/orgs/:o/clientes': { data: { filas: [{ id: 'c1', nombre: 'Casa' }] } },
      'GET /s101/orgs/:o/proyectos': { data: { filas: [{ id: 'p1', nombre: 'Cocina', cliente_id: 'c1' }] } },
      'GET /s101/orgs/:o/cotizaciones': {
        data: {
          filas: [
            { id: 'q-ok', cliente_id: 'c1', datos: { proyecto_id: 'p1', versiones: [] } },
            { id: 'q-huerfana', cliente_id: 'c1', datos: { proyecto_id: 'no-existe', versiones: [] } },
          ],
        },
      },
    });
    const arbol = await db.cargar();
    // La huérfana no se enseña: no hay dónde colgarla.
    assert.equal(arbol.clientes[0].proyectos[0].cotizaciones.length, 1);
    // Y guardar tal cual NO la borra.
    assert.equal(await db.guardar(arbol.clientes), true);
    assert.deepEqual(pedidas.filter((p) => p.metodo === 'DELETE'), []);
  });

  test('un monto que no se puede leer truena; no se guarda como gratis', async () => {
    // Devolver cero dejaría el renglón guardado en $0 y el total más bajo, sin
    // un error a la vista. Es la clase de cosa que se descubre cobrando.
    const { db, pedidas } = levantar(vacio());
    await db.cargar();
    const arbol = arbolNuevo();
    arbol[0].proyectos[0].cotizaciones[0].versiones[0].muebles = [{ total: 'como quince mil', qty: 1 }];
    assert.equal(await db.guardar(arbol), false);
    assert.deepEqual(pedidas.filter((p) => p.metodo === 'POST' && p.ruta.endsWith('/cotizaciones')), []);
  });

  test('pero un campo vacío sigue valiendo cero', async () => {
    const { db, pedidas } = levantar(vacio());
    await db.cargar();
    const arbol = arbolNuevo();
    arbol[0].proyectos[0].cotizaciones[0].versiones[0].muebles = [{ total: '', qty: 1 }, { total: 1000, qty: 1 }];
    assert.equal(await db.guardar(arbol), true);
    const cot = pedidas.find((p) => p.metodo === 'POST' && p.ruta.endsWith('/cotizaciones'));
    assert.equal(cot.cuerpo.total, 100000);
  });
});
