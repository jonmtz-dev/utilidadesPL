# Reglas del sistema de igualación de estilos (Micrositio → Moodle)

Este documento es la **fuente de la verdad** de por qué la herramienta hace lo que
hace con los estilos. Antes de tocar `script.js`, lee esto: cada regla aquí costó
una prueba real en Moodle 5.1 y romperla regresa bugs que ya se resolvieron.

---

## 1. El problema real (diagnóstico probado, no teoría)

Los micrositios y la hoja de Moodle (`conjunto.scss`) son **el mismo sistema de
diseño**: mismas clases (`bg-primary-20`, `.mainPlantilla23`, módulos `.MM/.M01…`)
y mismos valores hex (se compararon token por token: **cero diferencias**).

Entonces, ¿por qué se ve distinto al pegar en Moodle? Tres causas, cada una con
solución distinta:

| # | Causa | Ejemplo real | Solución |
|---|---|---|---|
| 1 | **Defaults de Bootstrap distintos.** El micro carga Bootstrap 5.2.3 puro; Moodle trae Bootstrap + su tema, que pinta otros defaults. | Tarjetas `.card`: blancas con borde en el micro, **grises sin borde** en Moodle. `<th>` de tablas: gris de Moodle tapa el rosa del `<thead>`. | **Blindaje inline** (§4) |
| 2 | **Reglas que divergieron** entre el `estilos.css` del micro y `conjunto.scss`. | `.accordion-button:hover`: micro = blanco sobre `--primary-40`; Moodle = `--primary-50` sobre `--primary-30`. | **Complemento aditivo** `.ms-convertido` (§5) |
| 3 | **Contexto de módulo perdido.** Toda la paleta (`--primary-*`) vive en `.mainPlantilla23.MM` (o `.M01`…). Sin ese wrapper, TODO queda transparente. | Probado: sin wrapper, `--primary-20` no existe y el thead sale transparente. | Conservar siempre el wrapper en la salida (la herramienta no lo quita) |

## 2. Las restricciones del entorno (la "física" de Moodle 5.1 + TinyMCE)

Probado en producción, no negociable:

1. **TinyMCE borra los `<style>`** del contenido. No se puede meter CSS embebido.
2. **TinyMCE/Moodle borra o ignora las variables `--bs-*` puestas inline.**
   (Se probó sembrar `--bs-accordion-active-bg` inline: no sobrevive.)
3. **Los `style=""` inline con `!important` SÍ sobreviven y SÍ ganan** al
   Bootstrap/tema de Moodle. (Así se arregló el encabezado de tabla.)
4. Consecuencia lógica de 1+2+3: **un estado (hover, abierto/cerrado) es
   IMPOSIBLE de estilizar desde el HTML.** Un inline es un solo valor fijo; si se
   congela el estado de reposo con `!important`, mata el hover (pasó con el
   acordeón: dejó de reaccionar al mouse). Los estados solo pueden vivir en el
   **CSS del tema**.
5. **La hoja de Moodle del usuario NO se toca.** Es el estándar del equipo. Todo
   arreglo en el tema debe ser **aditivo**: reglas nuevas bajo la marca
   `.ms-convertido`, nunca editar reglas existentes.

## 3. Arquitectura de la solución (3 mecanismos que se reparten el trabajo)

```
┌─ ¿El estilo depende de un estado (hover/abierto)? ─────────────┐
│  SÍ → Complemento aditivo .ms-convertido en el TEMA (§5)       │
│  NO → ¿Es un default de Bootstrap que Moodle pinta distinto,   │
│        o un color de clase que hay que asegurar?               │
│        → Blindaje inline en el HTML (§4)                       │
└────────────────────────────────────────────────────────────────┘
El tablero de la pestaña CSS (§6) detecta las diferencias del caso "SÍ"
y genera el complemento listo para pegar.
```

## 4. Blindaje inline (`blindar()` en `script.js`) — lo SIN estado

Renderiza el cuerpo convertido en un **iframe oculto con el CSS del micrositio**
(donde se ve como debe ser), lee los colores **computados** finales y los fija
`style="… !important"` en la salida. Reglas exactas de `congelarElemento()`:

- **Interactivos (`.accordion-button`, `.btn*`): se SALTAN.** Nada inline; un
  inline les mataría los estados. Los cubre el complemento del tema (§5).
- **`<th>`**: fondo **efectivo** (sube por ancestros hasta hallar color — el rosa
  vive en el `<thead>` y el `th` lo tapa con el gris de Moodle) + color de texto.
- **Clases `bg-* / text-* / border-*`** (primary/secondary/neutral/resalte):
  congela el color computado correspondiente.
- **`.card`** (contenedor sin estado con defaults divergentes):
  - Fondo: si **no** trae color propio → congela **blanco** (`#fff`), porque su
    fondo era el default de Bootstrap y Moodle lo pinta gris. Si **sí** trae color
    (clase `bg-*`) → **no se toca**: esa clase funciona igual en ambos lados y
    debe seguir theme-aware.
  - Borde: Moodle se lo quita a TODAS las tarjetas. Si no define uno propio →
    repone el default de Bootstrap (`1px solid rgba(0,0,0,.176)`); si define uno,
    respeta su color.
  - ⚠️ El iframe del blindaje solo carga el `estilos.css` del micro, **no su
    Bootstrap**: por eso una `.card` sin fondo propio se ve transparente ahí y se
    asume el blanco default. No "arreglar" esto cargando Bootstrap por CDN (rompe
    el modo offline de la PWA y mete red en la conversión).
- Si el conteo de nodos entre iframe y salida no coincide, **no se arriesga**:
  se deja el HTML sin congelar (estructuras desalineadas).

## 5. Complemento aditivo `.ms-convertido` — lo CON estado

- La herramienta **marca** cada conversión: agrega la clase `ms-convertido` al
  wrapper `.mainPlantilla23` (o envuelve el cuerpo si no existe). Idempotente.
- En el **tema de Moodle** viven reglas nuevas colgadas de esa marca, p. ej.:

  ```css
  /* FIX: Estilos equivalentes para micrositios */
  .ms-convertido .accordion-button:hover {
      color: #fff !important;
      background-color: var(--primary-40) !important;
  }
  ```

- Por qué funciona: es **más específico y posterior** → gana sin editar las
  reglas existentes; solo afecta contenido convertido (por la marca); soporta
  **estados** y sigue **theme-aware** (usa tokens, no hex).
- El usuario las pega en su tema **una vez** y sirven para todos los micrositios.

## 6. El tablero (pestaña CSS) — detección automática de diferencias

- La hoja de Moodle (**CSS compilado**, no SCSS — el parser del navegador no
  entiende SCSS) viene **precargada** en `hoja-moodle-default.js`
  (`window.HOJA_MOODLE_DEFAULT`). Nadie tiene que pegar nada.
- Si el usuario pega una hoja propia, se guarda en `localStorage`
  (key `ms-hoja-moodle`) y **tiene prioridad** sobre la precargada. Guardar =
  pegar; no hay botón aparte. Si excede la cuota de localStorage, no rompe: avisa
  y funciona en la sesión.
- Al comparar (`compararCSS`, con `CSSStyleSheet` construible: parsea sin
  aplicar, el CSS ajeno no puede tocar el panel):
  - **Diferencias de componentes** (selector igual, valor distinto, y el selector
    es de componente: `mainPlantilla23`, accordion, btn, table, thead, clases de
    color) → se muestran con **muestras de color** (los `var(--x)` se resuelven a
    rgb reales en un iframe con la hoja del usuario y el módulo del micro).
  - **Arreglo listo**: `generarComplemento()` reescribe el selector del micro
    (`.mainPlantilla23` → `.ms-convertido`) con las declaraciones del micro +
    `!important`, listo para copiar y pegar en el tema. Cubre **dos** categorías:
    1. **Conflictos** — mismo selector, distinto valor, en selectores de
       componente (`esSelectorComponente`). Son diferencias de color.
    2. **Estilo perdido** — reglas que el micro trae y tu hoja **no tiene**. No
       son solo color: pueden romper el **acomodo** (fue el caso de
       `.texto-titulo`, cuya altura alineaba las columnas de una `.row`; sin ella
       cada título empujaba su imagen a distinta altura). Se filtran con
       `seUsaEnPagina()`: solo entran las que **esta página realmente usa**
       (`querySelector` sobre el HTML convertido, quitando pseudo-clases), porque
       un micrositio trae decenas de reglas que esta página no toca. Las que no
       usa quedan en el detalle técnico, por si otra página las necesita.
  - Lo no accionable (faltantes, diferencias sin color) va a un desplegable de
    "detalle técnico".
  - **Cierre del ciclo — diferencias "cubiertas":** antes de reportar una
    diferencia, `compararCSS` revisa si la hoja del usuario ya contiene la regla
    `.ms-convertido` equivalente (misma transformación de selector que
    `generarComplemento` — por eso ambas usan `selectorComplemento()`, no
    duplicar esa lógica) **con las mismas declaraciones del micro**. Si sí, se
    reporta como "ya cubierta por tu complemento" y NO sale en el arreglo. Si el
    selector existe pero con otros valores, se sigue reportando (el complemento
    no reproduce el look del micro).
  - **Botón "Ya lo pegué en mi tema":** tras pegar el arreglo en el tema real, un
    clic anexa ese mismo bloque a la hoja guardada en la herramienta (dispara el
    flujo normal de pegado → `localStorage`) y re-compara. Así la herramienta
    queda sincronizada con el tema sin volver a copiar el CSS de Moodle. El botón
    NO modifica el tema: solo el espejo local; el usuario debe haber pegado el
    arreglo en Moodle primero.
- **Límite conocido:** el tablero solo detecta diferencias entre reglas que
  **ambas hojas declaran**. Un default de Bootstrap (causa #1 de §1) no aparece
  ahí porque ninguna hoja lo escribe; esos casos se resuelven en el blindaje (§4)
  y se van sumando ahí cuando aparecen (así entraron `.card` y el `<th>`).

## 6-bis. Los toggles de colorear tabla: NUNCA un hex

`Colorear 1ª columna` y `Colorear encabezado` van **apagados por defecto** y son
**opt-in**, para tablas que lleguen sin ningún color propio. Reglas:

- **Solo aplican CLASES** (`bg-primary-20`, `bg-primary-10`/`bg-secondary-10`),
  jamás un color literal. El color lo resuelve el **módulo** del micrositio
  (`.mainPlantilla23.MM/.M01/…`) contra la hoja de Moodle.
- ⚠️ Hubo un `background-color: #d8a7b6 !important` inline en la fila de títulos.
  Ese hex es el rosa del módulo **MM**: en un micrositio de M01 (lila), M02
  (azul), M03 (rojo) o reg pintaba el encabezado del **color equivocado**, y al
  ser inline `!important` le ganaba incluso al blindaje. **Eliminado — no
  reintroducir hex en este archivo.**
- Van apagados porque los micrositios **ya traen su color** (`bg-primary-20` en su
  `<thead>`) y el blindaje (§4) se encarga de que se vea correcto en Moodle.
  Encenderlos *añade* diseño que el micro no tenía; es decisión editorial, no
  fidelidad.

## 7. Ciclo de trabajo del equipo

1. Abrir la herramienta → cargar micrositio (la hoja ya está precargada).
2. Pestaña CSS: si hay diferencias, **copiar el arreglo** y pegarlo en el tema
   (Administración → Apariencia → tema → sección nueva). Purgar cachés del tema.
3. Copiar el HTML convertido → pegarlo en el recurso Página.
4. Cada diferencia arreglada en el tema **deja de aparecer** para siempre; con
   cada micrositio quedan menos pendientes.

## 8. Actualizar la hoja precargada (cuando cambie `conjunto.scss`)

1. Compilar el SCSS (hay `libsass` instalado en el Python local):
   `sass.compile(filename='conjunto.scss', output_style='expanded')`.
2. Regenerar `hoja-moodle-default.js`: es `window.HOJA_MOODLE_DEFAULT = <JSON
   string del CSS>;` (se genera con `json.dumps`, **no editar a mano**).
3. Subir `VERSION` en `sw.js` y publicar. (`hoja-moodle-default.js` está en el
   APP_SHELL del service worker: se cachea para offline.)
4. Alternativa individual sin publicar: pegar el CSS nuevo en la pestaña CSS
   (queda en el localStorage de ese navegador).

## 9. Historial de casos resueltos (regresiones que NO deben volver)

| Caso | Síntoma en Moodle | Arreglo |
|---|---|---|
| Encabezado de tabla | Gris en vez de rosa (`bg-primary-20` en `<thead>`, tapado por el `th` de Moodle) | Blindaje: fondo efectivo inline en cada `<th>` |
| Acordeón congelado | Se congeló el reposo con `!important` inline y **murió el hover** | Los interactivos NUNCA se congelan inline; van al complemento del tema |
| Variables `--bs-*` inline | Moodle las borra; el acordeón siguió con el default | Descartado como mecanismo; solo tema |
| Hover del acordeón | Más claro y sin texto blanco (regla divergente en la hoja) | Regla aditiva `.ms-convertido .accordion-button:hover` en el tema |
| Tarjetas `.card` | Grises y sin borde (default de Moodle) | Blindaje: blanco si no hay color propio + borde default siempre; color propio intacto |
| Columnas desalineadas | Las imágenes de una `.row` quedaban a distinta altura: `.texto-titulo` (con su altura) existía solo en el micro y se perdía | El arreglo ahora incluye las **reglas faltantes que la página usa**, no solo los conflictos de color |
| Encabezado con hex fijo | `Colorear encabezado` inyectaba `#d8a7b6` (rosa de **MM**) inline: color equivocado en micrositios de otros módulos | Solo se aplica la clase `bg-primary-20`; el toggle quedó **apagado** por defecto |
