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
5. **TinyMCE limpia el HTML inválido al guardar.** El navegador es tolerante al
   mostrar el micrositio, TinyMCE no. Caso probado: una `<ul>`/`<ol>` **sin
   ningún `<li>`** (usada como simple envoltorio) se borra y su contenido queda
   suelto. Si esa lista era el único hijo de bloque de un contenedor flex
   (`.card-body.d-flex`), cada `<strong>`/`<mark>`/`<i>` pasa a ser **su propio
   item flex** y se estira a la altura del contenedor. Lo resuelve
   `sanearParaTinyMCE()` (§4-bis).
6. **La hoja de Moodle del usuario NO se toca.** Es el estándar del equipo. Todo
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

## 4-bis. Saneo estructural (`sanearParaTinyMCE()`) — sobrevivir al limpiador

Corre **siempre**, antes de `marcarConvertido()`, y **no depende del toggle de
blindaje**: si TinyMCE borra un elemento, ningún color inline lo salva.

- **`<ul>`/`<ol>` sin `<li>`** → se envuelve su contenido en un
  `<li style="list-style: none">`. Así la lista queda válida (TinyMCE ya no la
  toca), sigue siendo **un solo hijo de bloque** y **conserva las reglas que el
  micro tenga para `ul`** — más fiel que cambiarla por un `<div>`, que perdería
  su sangría y márgenes.
- Las listas **válidas no se tocan** (con `<li>`, anidadas, o vacías).
- Medido con el modal de "park": tras la limpieza de TinyMCE, el contenedor flex
  pasaba de 3 a **8 items** y el `<mark>` de 17px a **200px** de alto. Con el
  saneo, la salida queda idéntica al micrositio (3 items, `<mark>` de 17px).

## 4-ter. SVG → PNG: el tamaño fluido se pierde y hay que reponerlo

Los SVG se rasterizan a PNG (el arrastre múltiple de TinyMCE los rechaza). Eso
cambia una propiedad que **no es de estilo, es del formato**:

- Un `<img>` cuyo SVG **no declara medidas en px** (solo `viewBox`, o `width` en
  `%`) **no tiene tamaño intrínseco**, así que el navegador lo estira hasta
  **llenar su contenedor**. Es fluido sin que ninguna regla CSS intervenga.
- Un PNG **siempre** trae píxeles, así que nunca hace eso. Con los atributos
  `width`/`height` queda clavado a esa medida y **se ve más chico** que en el
  micrositio.

Por eso `medidasSVG()` devuelve `fluido` y la conversión se bifurca:

| El SVG traía | Salida | Por qué |
|---|---|---|
| Nada en px (`viewBox`, `%`) | `style="width:100%; height:auto"` | Repone el estirado al contenedor. Inline porque TinyMCE borra los `<style>` |
| Medidas en px | `width`/`height` como antes | Era una imagen de medida fija; sin los atributos saldría al **3×** del rasterizado |

Medido con el modal de "Número de átomos" (contenedor de 1138px, PNG 2400×933):

| | Se muestra |
|---|---|
| Micrositio (referencia) | 1138×442 |
| Antes (`width="800"`) | 800×311 ← el bug |
| Ahora | **1138×442** |

Y sigue adaptándose: en una columna de 300px da 300×117, sin `img-fluid` da lo
mismo, y no desborda. La proporción nunca cambió — el problema **no era**
deformación, era tamaño.

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
    2. **Defaults de Bootstrap** (`DEFAULTS_BOOTSTRAP_CSS` en `script.js`) — tabla
       curada, porque este caso **no se puede detectar comparando**: la regla no
       está en ninguna de las dos hojas, vive dentro del Bootstrap de cada lado
       (es la causa #1 de §1 y el "límite conocido" del final de esta sección).
       Normalmente se resolvería con blindaje inline, pero si el componente es un
       **botón** el inline está prohibido (§4: mata el hover), así que la única
       vía que queda es el complemento. Reglas de la tabla:
       - Se filtran con `seUsaEnPagina()`, igual que las perdidas.
       - Si el micro **sí** declara el selector, se ignoran: el flujo normal ya
         lo cubre.
       - **Solo fondo y texto, nunca `border-color`.** Los botones del micro
         traen `border border-4 border-secondary-10`: esa utilidad pinta el borde
         con el token del **módulo**, y un `border-color !important` nuestro lo
         dejaría gris en todos los módulos. (Además el atajo se expande a los
         cuatro longhands y ensucia el bloque.)
       - Hex fijos, no tokens: son grises de Bootstrap, iguales en todo módulo.
         La prohibición de hex de §6-bis aplica a colores que **dependen del
         módulo**, no a estos.
    3. **Estilo perdido** — reglas que el micro trae y tu hoja **no tiene**. No
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
- **Límite conocido:** el tablero solo *detecta* diferencias entre reglas que
  **ambas hojas declaran**. Un default de Bootstrap (causa #1 de §1) no aparece
  ahí porque ninguna hoja lo escribe. Esos casos no se detectan, **se enumeran a
  mano** y se resuelven según el componente:
  - Sin estado (tarjetas, `<th>`) → blindaje inline (§4).
  - Con estado (botones) → tabla `DEFAULTS_BOOTSTRAP_CSS` del complemento
    (punto 2 de la lista de arriba).

  Las dos listas van creciendo conforme aparecen casos: así entraron `.card`, el
  `<th>` y `.btn-secondary`.

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

## 6-ter. Tablas responsivas en pantallas medianas

Las tarjetas (`tabla-responsive-cards`) resuelven el celular (≤576px). El hueco
estaba **entre 577px y escritorio**: ahí la tabla no cabía y salía scroll
horizontal, porque `.mainPlantilla23 .table td { min-width: 200px }` (regla que
existe tanto en el CSS del micrositio como en la hoja de Moodle) le impone a una
tabla de 5 columnas un mínimo de 1000px.

Un `max-width: 100%` inline **no basta**: una tabla nunca baja de su ancho
mínimo. Hay que relajar el `min-width`, y como depende del ancho de pantalla
necesita un `@media` → va en el **complemento del tema** (§5), no inline:

```css
/* Tablas de micrositios: que se ajusten en pantallas medianas
   en vez de sacar barra de desplazamiento. */
@media (min-width: 577px) and (max-width: 1200px) {
    .ms-convertido .table-responsive table td,
    .ms-convertido .table-responsive table th {
        min-width: 0 !important;
    }
    .ms-convertido .table-responsive table {
        width: 100% !important;
    }
}
```

Medido: a 900px y 700px la tabla pasa de 1001px (con scroll) a ajustarse exacto
al contenedor, **sin scroll**, y el título coincide solo. El límite superior de
1200px es ajustable: por encima, las tablas normalmente ya caben.

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
| Texto de `<th>` grisáceo | El blindaje congelaba el color **heredado**: sin el Bootstrap del micro, el `<th>` hereda `#333340` de `.mainPlantilla23` en vez del `#212529` real | Solo se congela el color si lo pide una clase `text-*`; el heredado se deja a Moodle |
| Título de tabla más angosto | **Moodle constriñe `.container-fluid`** (max-width + márgenes auto, lo usa para el layout de página). La barra del título salía angosta y centrada, sin abarcar la tabla | `width/max-width: 100%` y márgenes `0` **inline con `!important`** en el `.container-fluid` hijo de `.table-responsive`. Además, si la tabla es `w-auto`, se le da `width: fit-content` al `.table-responsive` para que encoja como con el padre flex del micro |
| Enlaces con subrayado de más | Moodle subraya los `<a>` por accesibilidad con una regla más específica que la clase `.text-decoration-none` de Bootstrap, así que los enlaces-botón del micro (los de `<mark>`, modales…) salían subrayados | `text-decoration: none !important` inline **solo** en elementos con la clase `.text-decoration-none`. Los demás enlaces conservan su subrayado (verificado) |
| Imagen del modal más chica que en el micrositio | La ilustración salía a 800px dentro de un modal de 1138px, con espacio sobrando a los lados; en el micrositio llenaba el modal. **No era deformación** (proporción idéntica, 2.5723 en ambos): el SVG sin medidas en px es fluido y llena su contenedor, el PNG con `width="800"` queda clavado. `img-fluid` no ayuda: solo limita, nunca agranda | `medidasSVG()` devuelve `fluido`; si el SVG no traía px, la salida lleva `style="width:100%; height:auto"` en vez de los atributos. Ver §4-ter |
| SVG responsivo rasterizado cuadrado | `medidasSVG()` hacía `parseFloat` del atributo: un `width="100%"` daba **100** y se tomaba como 100px, así que un SVG responsivo salía como PNG **cuadrado de 100×100** con el dibujo deformado. Igual con unidades (`600pt`) | Solo se aceptan medidas en px (o sin unidad); cualquier otra cosa cae al `viewBox`, que además repone la medida que falte **conservando su proporción** |
| Texto del modal estirado | En el modal de "park", los `<mark>` de colores salían como **barras verticales altísimas** y las palabras separadas en fila. El micrositio envolvía la frase en una `<ul>` **sin `<li>`**; TinyMCE la borra por inválida y entonces cada `<strong>`/`<mark>`/`<i>` se volvió item flex del `.card-body.d-flex` (3 → 8 items, `<mark>` de 17px → 200px) | `sanearParaTinyMCE()`: envuelve el contenido suelto en un `<li style="list-style:none">` para que la lista sea válida y sobreviva. Ver §4-bis |
| Botón gris más claro | `.btn-secondary` (el "Ubicación en tiempo real" de los modales) salía **gris claro** en Moodle y **gris fuerte** (`#6c757d`) en el micro. El tablero **no ofrecía el arreglo**: ni la hoja del micro ni la de Moodle declaran `.btn-secondary` — es un default del Bootstrap de cada lado. Y como es un botón, tampoco podía blindarse inline (mataría el hover) | Tercera categoría del complemento: tabla `DEFAULTS_BOOTSTRAP_CSS` con el default de Bootstrap 5.2.3 (reposo/hover/active), filtrada por `seUsaEnPagina()`. **Solo fondo y texto**: el `border-color` se omite a propósito para no pisar `border-secondary-10` (color del módulo). Ver §6, punto 2 |
| Scroll horizontal en pantallas medianas | `.mainPlantilla23 .table td { min-width: 200px }` (está en el CSS del micro **y** en la hoja de Moodle): 5 columnas × 200px = **1000px de ancho mínimo**, así que la tabla no podía encogerse y sacaba barra de desplazamiento entre los 576px de las tarjetas y el escritorio | `max-width: 100%` inline en la tabla **+** una regla `@media` en el complemento del tema que pone `min-width: 0` en las celdas (ver §6-ter). Al encoger la tabla, el título cuadra solo |
