/* Las fotos del mueble: escoger, arrastrar o pegar.
 *
 * Mike, 20-sep: «en la parte de agregar foto, que pueda arrastrar una, o
 * pegar la que está en el portapapeles».
 *
 * Igual que `guardado.spec.mjs`, esto NO copia el código: lo saca de
 * `index.html`, que es lo que va publicado. Copiarlo sería probar una copia
 * que mañana se queda atrás.
 *
 * Lo que de verdad aporta:
 *
 *   · que los TRES caminos terminen en la misma función. El riesgo real de
 *     agregar dos entradas nuevas es que cada una encoja la foto a su modo, y
 *     el día que cambie el tamaño queden dos reglas y nadie lo note hasta ver
 *     un PDF de 8 MB;
 *   · que el encogido respete el lado mayor y no estire una foto chica;
 *   · que lo que no es imagen se rechace. Al arrastrar de un correo o de una
 *     carpeta entra de todo.
 *
 *   node --test pruebas/fotos.spec.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTML = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

/** El bloque de la app, tal como va publicado. */
function bloqueApp() {
  const bloques = [...HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const b = bloques.find((x) => x.includes('function ZonaFotos('));
  assert.ok(b, 'no encontré ZonaFotos en index.html');
  return b;
}

/** El texto de `fotoAMiniatura`, sacado del bloque publicado. */
function fuenteDeMiniatura(app) {
  const i = app.indexOf('function fotoAMiniatura(');
  assert.ok(i > -1, 'no encontré fotoAMiniatura');
  const fin = app.indexOf('\nfunction ZonaFotos(', i);
  assert.ok(fin > i, 'no encontré dónde termina fotoAMiniatura');
  return app.slice(i, fin);
}

/** La arma con un navegador de mentiras: FileReader, Image y canvas. */
function levantarMiniatura({ ancho, alto }) {
  const pintado = { toDataURL: null, lienzo: null };
  class FileReaderFalso {
    readAsDataURL(archivo) {
      queueMicrotask(() => this.onload({ target: { result: `data:${archivo.type};base64,AAA` } }));
    }
  }
  class ImagenFalsa {
    set src(_v) {
      this.width = ancho;
      this.height = alto;
      queueMicrotask(() => this.onload());
    }
  }
  const documentoFalso = {
    createElement(que) {
      assert.equal(que, 'canvas');
      const cv = {
        width: 0, height: 0,
        getContext: () => ({ drawImage: (...a) => { pintado.lienzo = a.slice(1); } }),
        toDataURL: (tipo, calidad) => { pintado.toDataURL = { tipo, calidad, w: cv.width, h: cv.height }; return `data:${tipo};base64,BBB`; },
      };
      return cv;
    },
  };
  const hacer = new Function('FileReader', 'Image', 'document', `${fuenteDeMiniatura(bloqueApp())}\n;return fotoAMiniatura;`);
  return { fotoAMiniatura: hacer(FileReaderFalso, ImagenFalsa, documentoFalso), pintado };
}

const archivo = (tipo = 'image/png') => ({ type: tipo, name: 'x' });

describe('la foto se encoge igual venga de donde venga', () => {
  test('una foto ancha se baja a 300 px de ancho y conserva la proporción', async () => {
    const { fotoAMiniatura, pintado } = levantarMiniatura({ ancho: 1200, alto: 600 });
    const b64 = await fotoAMiniatura(archivo());
    assert.equal(pintado.toDataURL.w, 300);
    assert.equal(pintado.toDataURL.h, 150);
    assert.equal(pintado.toDataURL.tipo, 'image/jpeg');
    assert.equal(pintado.toDataURL.calidad, 0.5);
    assert.match(b64, /^data:image\/jpeg;base64,/);
  });

  test('una foto alta se baja a 300 px de alto', async () => {
    const { fotoAMiniatura, pintado } = levantarMiniatura({ ancho: 600, alto: 1200 });
    await fotoAMiniatura(archivo('image/jpeg'));
    assert.equal(pintado.toDataURL.w, 150);
    assert.equal(pintado.toDataURL.h, 300);
  });

  test('una foto chica NO se estira', async () => {
    const { fotoAMiniatura, pintado } = levantarMiniatura({ ancho: 120, alto: 80 });
    await fotoAMiniatura(archivo());
    assert.equal(pintado.toDataURL.w, 120);
    assert.equal(pintado.toDataURL.h, 80);
  });

  test('lo que no es imagen se rechaza antes de leer nada', async () => {
    const { fotoAMiniatura, pintado } = levantarMiniatura({ ancho: 100, alto: 100 });
    await assert.rejects(() => fotoAMiniatura({ type: 'application/pdf', name: 'plano.pdf' }));
    await assert.rejects(() => fotoAMiniatura(null));
    assert.equal(pintado.toDataURL, null, 'no se tocó el lienzo');
  });
});

describe('los tres caminos son uno solo', () => {
  const app = bloqueApp();
  const zona = app.slice(app.indexOf('function ZonaFotos('), app.indexOf('function Cotizador('));

  test('escoger el archivo, soltarlo y pegarlo llaman a la misma función', () => {
    assert.match(zona, /onChange: e => \{\s*agregarFotos\(e\.target\.files\)/, 'el input');
    assert.match(zona, /onDrop:[\s\S]*?agregarFotos\(/, 'soltar');
    assert.match(zona, /alPegar[\s\S]*?agregarFotos\(archivos\)/, 'pegar');
  });

  test('sólo `fotoAMiniatura` encoge: nadie más toca un canvas', () => {
    /* La única excepción, con nombre: `leerPlano`, el plano del armador
     * (23-sep). Un plano NO es una foto de muestra: a 300 px no se leen sus
     * cotas, así que va a otra resolución y también lee PDF. Fuera de esas
     * dos, nadie crea un canvas. */
    const plano = app.slice(app.indexOf('async function leerPlano('), app.indexOf('const PLANO_CSS'));
    assert.ok(plano.length > 0, 'leerPlano existe');
    assert.equal((plano.match(/createElement\("canvas"\)/g) || []).length, 1, 'el plano tiene su propio y único lienzo');
    const veces = (app.replace(plano, '').match(/createElement\("canvas"\)/g) || []).length;
    assert.equal(veces, 1, 'hay más de un lugar que crea un canvas para fotos');
  });

  test('el escucha de pegar se quita al desmontar la sección', () => {
    assert.match(zona, /window\.addEventListener\("paste", alPegar\)/);
    assert.match(zona, /return \(\) => window\.removeEventListener\("paste", alPegar\)/);
  });

  test('el tope de cinco se aplica sobre la lista completa', () => {
    assert.match(zona, /const FOTOS_MAX = 5;|slice\(0, FOTOS_MAX\)/);
    assert.match(app, /const FOTOS_MAX = 5;/);
  });
});
