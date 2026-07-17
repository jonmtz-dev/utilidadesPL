# Contexto para Claude

**Lee `README.md` antes de tocar nada.** Tiene el porqué del proyecto, el
contrato con el CSS que vive en Moodle, el sistema de diseño y las trampas ya
descubiertas. Este archivo solo es el resumen.

## Qué es

Panel de herramientas (cajón de apps) para maquetar contenido en Moodle 5.1.
HTML/CSS/JS planos, **sin build ni dependencias**. No propongas React, Vite ni
npm: la gracia es abrir `index.html` y que funcione.

Idioma: **todo en español** (UI, comentarios, commits).

## Reglas que importan

- El launcher se dibuja solo desde el arreglo `TOOLS` de `assets/tools.js`.
  Agregar una herramienta = carpeta en `tools/<slug>/` + un objeto ahí.
- Los componentes de UI compartidos ya existen en `assets/shared.css`
  (`.glass-panel`, `.toggle-switch`, `.btn-primary`, `.tabs`, `.code-output`…).
  Reutilízalos; no los reescribas por herramienta.
- Colores: si cambia entre claro y oscuro, va como token en `:root` /
  `:root[data-theme="dark"]` de `shared.css`. Nunca hardcodeado.
- **Las vistas previas (`.preview-container`) son islas claras a propósito** —
  imitan la página real de Moodle. No las "arregles" para que sigan el tema
  oscuro, y no uses tokens temáticos en nada que se inyecte dentro de ellas.
- Layout: el gutter va como `padding` del `body` (no margen del contenedor) y la
  cadena de flex necesita `min-height: 0`. El README explica por qué.
- En JS, arrancar siempre con el patrón `document.readyState === 'loading'`,
  no solo con `DOMContentLoaded`.

## PWA (importante)

Es una PWA instalable publicada en GitHub Pages, en un **subdirectorio**.
Liga oficial: <https://jonmtz-dev.github.io/utilidadesPL/> (repo del trabajo
`jonmtz-dev/utilidadesPL`). Hay una copia de respaldo en la cuenta personal.
Consecuencias:

- **Nunca uses rutas absolutas** (`/assets/...`): funcionan en local y se rompen
  en producción. Todo relativo. El código no depende del nombre del repo ni de
  la cuenta, y así debe seguir.
- `sw.js` va en la raíz del repo (un SW solo controla su carpeta hacia abajo).
- **Al publicar cambios hay que subir `VERSION` en `sw.js`**, o el aviso de
  "nueva versión" no aparece y la caché offline se queda vieja.
- Los Service Workers no corren en `file://`. Para probar: `python -m http.server`.

## Verificar

Hay que probar el flujo de verdad en el navegador, no solo mirar un screenshot:
generar la salida y confirmar el HTML (`data-label`, `span.nolink`), revisar que
la página no scrollee en escritorio, y revisar ambos temas. Para servirlo:
`python -m http.server 5510`.
