# Cómo opera un chat en este repositorio

Este archivo va **igual en los seis repositorios** de taller101. Si lo cambias
en uno, cópialo a los demás. Es el contrato: un chat nuevo lo lee y ya sabe
trabajar sin preguntarle nada a Mike y sin que Mike prenda su computadora.

La regla de fondo: **Mike decide, el chat ejecuta y mide.** Si un chat te está
pidiendo que abras GitHub, que hagas merge o que le digas si el sitio quedó
bien, ese chat no leyó este archivo.

---

## 1. Arranque (esto va primero, siempre)

El contenedor del chat se borra entre sesiones. El token no: vive en el
conocimiento del proyecto. Se recupera así, sin imprimirlo nunca:

```bash
python3 -c "import re,pathlib; t=pathlib.Path('/mnt/project/CONTEXTO.md').read_text(); \
pathlib.Path('/tmp/.gh_token').write_text(re.search(r'github_pat_[A-Za-z0-9_]+',t).group(0))"
chmod 600 /tmp/.gh_token
```

Comprobar que alcanza este repositorio antes de cualquier otra cosa:

```bash
T=$(cat /tmp/.gh_token)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $T" \
  https://api.github.com/repos/mikebalcazar/cotizador-t101
```

`200` = adelante. `404` = el token no tiene este repositorio en su lista;
**eso se le dice a Mike y se para ahí**, no se busca otro camino.

Clonar:

```bash
git clone "https://x-access-token:${T}@github.com/mikebalcazar/cotizador-t101.git" /home/claude/repo
cd /home/claude/repo && git config user.name "claude" && git config user.email "mike@forespot.com"
```

Nunca se escribe el token en un mensaje, en un commit, ni en un archivo del
repositorio. Solo en `/tmp/.gh_token`.

## 2. Lo primero que se mira

```bash
git log --oneline -5
curl -s -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/cotizador-t101/actions/runs?per_page=3" \
  | python3 -c "import json,sys; [print(r['name'], r['status'], r['conclusion'], r['head_branch']) for r in json.load(sys.stdin)['workflow_runs']]"
```

Si el último run no está verde, **eso va primero**. No se apila trabajo nuevo
sobre un despliegue roto.

## 3. Un cambio

1. Rama `claude/<lo-que-hace>`.
2. Medirlo antes de empujar, con lo que aplique (ver §5).
3. Commit **en español**, diciendo qué se hizo, por qué y **cómo se probó**.
   Sin identificadores de modelo, sin coautorías.
4. PR y merge a `main`, por API. Todo desde el chat:

```bash
curl -s -X POST -H "Authorization: Bearer $T" \
  https://api.github.com/repos/mikebalcazar/cotizador-t101/pulls \
  -d '{"title":"…","head":"claude/…","base":"main","body":"…"}'
# y con el número que devuelve:
curl -s -X PUT -H "Authorization: Bearer $T" \
  https://api.github.com/repos/mikebalcazar/cotizador-t101/pulls/<N>/merge \
  -d '{"merge_method":"squash"}'
```

5. Leer el run del merge y **contarle a Mike qué se midió, con números, y qué
   no se pudo verificar.**

## 4. El chat no alcanza producción — el runner sí

El proxy de salida del chat rechaza `*.workers.dev`, `*.netlify.app`,
`api.cloudflare.com`, Google Fonts y casi todo. Solo pasan `github.com`,
`api.github.com`, npm y PyPI. **No se rodea: se usa el runner.**

El corredor de GitHub Actions sí tiene internet abierto. Por eso **cada
workflow que publica termina probando lo que publicó**. Ver `verificar.yml`.

**Ojo: el log de Actions NO es el canal de vuelta.** Descargarlo redirige a
`results-receiver.actions.githubusercontent.com`, que el proxy también rechaza.
Se midió el 8-sep con el run #36. Del log, el chat solo alcanza a ver si el
paso salió `success` o `failure`, sin un solo número.

Por eso `verificar.yml` **deja lo que midió como comentario del commit**. Eso
lo sirve `api.github.com`, que sí pasa:

```bash
# el resultado de la verificación del último merge
curl -s -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/cotizador-t101/commits/<SHA>/comments" \
  | python3 -c "import json,sys; [print(c['body']) for c in json.load(sys.stdin)]"

# y si algo falló, en qué trabajo fue
curl -s -H "Authorization: Bearer $T" \
  "https://api.github.com/repos/mikebalcazar/cotizador-t101/actions/runs/<ID>/jobs" \
  | python3 -c "import json,sys; [print(j['name'], j['conclusion']) for j in json.load(sys.stdin)['jobs']]"
```

Regla general: **lo que el chat necesite saber del corredor tiene que volver por
`api.github.com`** —comentario de commit, estado de commit o conclusión del
trabajo—, nunca por el log.

Regla: **si algo no se puede medir desde el chat, se mide en el runner.** Si
tampoco ahí, se le dice a Mike qué quedó sin verificar. Nunca se supone.

## 5. Cómo se mide, por tipo de cambio

| Qué cambió | Cómo se prueba, sin Mike |
|---|---|
| Interfaz web | Vite en local + Playwright con `fetch` simulado. 390×844 y 1440. Contar elementos (`locator().count()`), no mirar la captura. Los archivos de prueba se borran antes del commit |
| Migración de base | `sqlite3` en memoria, todas las anteriores aplicadas, `PRAGMA foreign_keys = ON`, con datos. Filas antes/después y `PRAGMA foreign_key_check` |
| Sitio ya publicado | Paso `Verificar` dentro del workflow. El runner le pega a la dirección real |
| Iconos y logotipo | `cairosvg` + PIL a 512 y a 32; se mide el resultado, no se ve |
| Apps (APK, instalador) | `workflow_dispatch` de `apps.yml`; el log dice si armó y subió |
| Netlify | El push dispara la construcción; el estado se lee en el commit (`/commits/<sha>/statuses`) |

## 6. Lo que un chat NO hace nunca

- Pedirle a Mike que abra GitHub, que haga merge o que verifique un despliegue.
  Todo eso lo hace el chat.
- Escribir, leer o listar secretos. Se comprueban por el deploy en verde.
- Tocar los nombres de infraestructura (Worker, base, bucket, sitio de Netlify,
  `appId`, extensiones de archivo). Renombrarlos desliga cosas que ya viven.
- Rodear el proxy. Si no alcanza, se reporta.
- Inventar un procedimiento nuevo. Si este archivo no cubre el caso, se resuelve
  **y se agrega aquí**, en los seis repositorios.

## 7. Lo único que sigue necesitando a Mike

Corto y explícito, para que nadie invente más:

1. **Que el PAT exista y traiga los seis repositorios**, con permisos
   *Contents: RW · Pull requests: RW · Actions: RW · Workflows: RW*. Sin
   `Workflows: RW` los archivos de `.github/workflows/` no se pueden empujar y
   alguien tiene que pegarlos a mano — que es justo lo que estorba.
2. **Renovar el PAT cuando venza** y pegarlo en `CONTEXTO.md §3.3`. Un solo
   lugar, un solo renglón.
3. **Los secretos de cada repositorio** (`CLOUDFLARE_API_TOKEN`,
   `RESEND_API_KEY`, lo de Netlify). Se ponen una vez; ya están.
4. **Decidir.** Producto, alcance, prioridad. Eso no se delega.

Todo lo demás —escribir, probar, empujar, mergear, publicar, armar apps,
verificar— lo hace el chat.
