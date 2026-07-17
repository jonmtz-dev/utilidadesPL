# Panel de Herramientas Moodle

Cajón de apps con utilidades propias para maquetar contenido en Moodle 5.1.
Sin build, sin dependencias, sin `npm install`: son archivos HTML/CSS/JS planos.
Se abre `index.html` en el navegador y funciona.

Es además una **PWA instalable** (PC y móvil) que funciona sin conexión y avisa
cuando hay una versión nueva.

**Liga oficial (la que instala el equipo):**
**<https://jonmtz-dev.github.io/utilidadesPL/>** — repo `jonmtz-dev/utilidadesPL`.

Existe una copia en la cuenta personal (`jonawow/ConvertidorTablasMoodle`) como
respaldo. Ver §7 antes de publicar en las dos.

---

## 1. Para qué existe esto

Moodle 5.1 no hace responsivas las tablas: en celular se desbordan. La solución
adoptada fue un CSS propio en la hoja de estilos del tema de Moodle que, por
debajo de 576px, convierte cada `<tr>` en una tarjeta y usa el atributo
`data-label` de cada `<td>` para imprimir el encabezado de la columna.

**Ese CSS vive en Moodle, no en este repo.** Es el contrato que el generador de
tablas debe respetar (resumen de lo esencial):

```css
@media (max-width: 576px) {
    .tabla-responsive-cards thead { display: none; }
    .tabla-responsive-cards,
    .tabla-responsive-cards tbody,
    .tabla-responsive-cards tr,
    .tabla-responsive-cards th,
    .tabla-responsive-cards td { display: block; width: 100%; }
    .tabla-responsive-cards tr { /* tarjeta: borde, radio, sombra */ }
    .tabla-responsive-cards td[data-label]::before {
        content: attr(data-label);
        display: block;
        font-weight: 700;
    }
}
```

De ahí sale el trabajo real: **convertir a mano todas las tablas ya publicadas
en Moodle a ese formato es lentísimo**, y por eso existe el convertidor. La
misma lógica aplica a las demás herramientas: cada una automatiza un maquetado
repetitivo de la plataforma.

Consecuencia práctica: si cambias el HTML que generan las herramientas,
verifica que siga cuadrando con el CSS que está cargado en Moodle.

---

## 2. Estructura

```
index.html                  Launcher (el cajón de apps)
manifest.json               Manifiesto PWA (nombre, iconos, atajos)
sw.js                       Service Worker — VA EN LA RAÍZ, ver §7
.nojekyll                   Evita que GitHub Pages procese el sitio con Jekyll
assets/
  shared.css                Tokens de diseño, temas, shell y componentes de UI
  theme.js                  Tema claro/oscuro + inyecta el switch en el header
  pwa.js                    Registra el SW, aviso de versión y botón Instalar
  launcher.css              Estilos del launcher
  launcher.js               Dibuja las tarjetas y la búsqueda
  tools.js                  ← Registro de herramientas (la fuente de la verdad)
  icons/                    Iconos PWA (generados, ver §7)
tools/
  convertidor-tablas/       Tablas de Word/HTML → tarjetas responsivas
    index.html · script.js · styles.css
  generador-bibliografias/  Fuentes de consulta → párrafos <p> con enlaces
    index.html · script.js · styles.css
  micrositio-a-pagina/      Micrositio .zip → recurso Página (@@PLUGINFILE@@)
    index.html · script.js · styles.css
.claude/launch.json         Config del servidor local para previsualizar
```

El launcher **se dibuja solo** a partir del arreglo `TOOLS` de
`assets/tools.js`. No hay tarjetas escritas a mano en `index.html`.

---

## 3. Las herramientas

### Convertidor de Tablas (`tools/convertidor-tablas/`)

Flujo de dos pasos: pegas la tabla (desde Word o HTML crudo) y luego **haces
clic en la fila que contiene los títulos**. Esa fila se vuelve el `<thead>` y
sus textos se copian al `data-label` de cada celda de las filas siguientes.

Salida típica:

```html
<div class="row bloque mt-3"><div class="col-12"><div class="table-responsive">
  <table class="table tabla-responsive-cards table-bordered border-neutral">
    <thead class="thead bg-primary-20">
      <tr><th scope="col" class="text-center align-middle">Materia</th></tr>
    </thead>
    <tbody>
      <tr class="align-middle">
        <td class="bg-primary-10" data-label="Materia">Álgebra</td>
      </tr>
    </tbody>
  </table>
</div></div></div>
```

Opciones: bordes, colorear la 1ª columna alternando rosa/verde
(`bg-primary-10` / `bg-secondary-10`), y envolver en contenedores Moodle.

### Generador de Bibliografías (`tools/generador-bibliografias/`)

Convierte una lista de fuentes en texto plano (una por renglón) en párrafos
`<p class="prepa-M{n}-textosParrafo">` con las URLs ya convertidas en enlaces.

Tres detalles que **no son adorno**, cada uno resuelve un problema real:

| Opción | Qué hace | Por qué |
| --- | --- | --- |
| Sangría francesa | `text-indent: -30px; position: relative; padding-left: 40px` | Formato requerido para las fuentes de consulta |
| Bloquear vista previa de YouTube | Envuelve el `<a>` en `<span class="nolink">` | Sin eso Moodle incrusta un reproductor en vez de dejar el enlace |
| Cortar URLs largas | `word-break: break-all` | Una URL no tiene espacios: sin esto el navegador no sabe dónde partirla y la baja completa al siguiente renglón, rompiendo la sangría. Con esto se parte justo donde acaba el renglón |

El botón "Ver ejemplo del maquetado" abre un modal con la estructura completa
del recurso y resaltados de color, y refleja los toggles activos.

### Micrositio a Página (`tools/micrositio-a-pagina/`)

Otro equipo maquetó contenido como **micrositios** (un `.zip` con `index.html`,
`css/`, `img/`) subidos como recurso *Archivo*. Eso pierde el tema, el
responsive y la app móvil, y para cambiar una coma hay que recomprimir. Esta
herramienta los pasa a recurso **Página**.

Acepta las tres formas en que llegan: **`.zip`**, **carpeta sin comprimir**
(arrastrada o con el botón, vía `webkitGetAsEntry` / `webkitdirectory`) o
archivos sueltos. Todo se procesa **en el navegador**; nada se sube. El zip se
lee **sin librerías**, con `DecompressionStream('deflate-raw')`; soporta
entradas *deflate* y *stored*, e ignora la basura de macOS (`__MACOSX/`, `._*`).

Qué hace: extrae el `<body>`, reescribe las imágenes a
`@@PLUGINFILE@@/archivo.ext` (en `src`, `srcset` y en los `url()` de estilos en
línea), quita `<script>` / `<link>` / `<style>`, aplica el formato responsive a
las tablas y reporta lo que se va a romper.

**Pestaña Imágenes:** el checklist de qué arrastrar, con las alertas que a mano
se escapan — imágenes que el HTML pide y no están, nombres repetidos en carpetas
distintas (al aplanarse se pisan), nombres con espacios o acentos. El botón
**Descargar imágenes (.zip)** empaqueta justo las imágenes que esa página usa,
ya listas para arrastrar (ver la trampa del SVG abajo).

**SVG → PNG (importante).** El arrastre *múltiple* del editor TinyMCE **rechaza
los `.svg`** (subidos de a uno sí los acepta, pero eso no sirve para "todas de un
jalón"). Por eso el toggle **Convertir SVG a PNG** (encendido por defecto): al
descargar el zip, cada SVG se rasteriza en un `<canvas>` a 2× y el HTML ya
referencia el `.png`. La vista previa sigue mostrando el SVG original —el
navegador lo pinta directo— gracias a un mapa `salida.png → archivo.svg`. El
`.zip` se **genera** sin librerías, "stored" (sin compresión: los PNG ya vienen
comprimidos), con el mismo espíritu que el lector de zip.

El **tamaño** se saca del `width`/`height` del SVG, o de su `viewBox` si no los
trae. Antes se usaba `img.naturalWidth`, que para un SVG sin tamaño intrínseco
Chrome fija en **300px**: eso disparaba PNGs de 600px que en unos recursos salían
gigantes y en otros deformes (según si el recurso los limitaba por CSS). Además,
si el `<img>` no declara `width`/`height`, se los ponemos con el tamaño real del
SVG (el atributo cede ante cualquier CSS, así que no pisa lo que ya se veía bien).

**Íconos en flex que colapsaban.** Los micrositios ponen íconos en un contenedor
flex (clase `align-self-*`) cuyo "no encogerse" vivía en el CSS del micrositio
(que se quita). Contra la hoja de Moodle ese contenedor se encogía a 0 y el ícono
desaparecía. **La hoja de Moodle no se toca** (es de otro equipo), así que el
arreglo va aquí: la herramienta inyecta `flex-shrink: 0;` inline en cada
contenedor con `align-self-*` que envuelva una imagen. Es inofensivo si el
elemento no es ítem flex (la propiedad se ignora) y respeta el `style` existente.
Regla general del proyecto: si algo depende de CSS que solo estaba en el
micrositio, se resuelve en el HTML generado, no pidiendo cambios en Moodle.

**Pestaña Revisión:** no se limita a decir "hay scripts". Sabe qué trae Moodle 5
y da un veredicto por caso:

- Los `<script>` de Bootstrap, Font Awesome o jQuery **no son pérdida**: Moodle
  ya los carga. Solo se marcan como problema los scripts propios.
- Los `data-bs-toggle="collapse|dropdown|modal|offcanvas|tab"` **funcionan solo
  con atributos**, así que sobreviven sin el bundle del micrositio.
  `tooltip` y `popover` sí necesitan init por JS y se pierden.
- Las tablas se detectan y se convierten solas: `tabla-responsive-cards` +
  `data-label` sacados del `<thead>` (o de la primera fila). **Cada tabla trae su
  propio desplegable "Fila de títulos"** aquí mismo: si la auto-detección erró
  (títulos en la fila 2, una fila de portada arriba, etc.), la eliges y se
  reconvierte al instante. El cuerpo es siempre lo que va *después* de esa fila.
  Si una tabla no tiene encabezado con texto, lo dice y sugiere el Convertidor de
  Tablas. El toggle **Colorear 1ª columna** aplica el mismo alternado rosa/verde
  (`bg-primary-10` / `bg-secondary-10`) que el Convertidor de Tablas; va **apagado
  por defecto** para no pisar el estilo propio del micrositio.

**Pestaña CSS:** pegas tu hoja de estilos de Moodle y te dice **qué reglas del
micrositio te faltan** y cuáles existen con distinto contenido. El CSS se parsea
con el motor del navegador (`CSSStyleSheet` construible, que parsea sin aplicar,
así el CSS ajeno no puede tocar el panel), no con regex.

La **vista previa** va en un `<iframe sandbox>` con el CSS del micrositio y las
imágenes reales del zip como `blob:`, así ves el resultado tal cual. El sandbox
sin `allow-scripts` evita que ese CSS toque los estilos del panel.

El toggle **Vista previa con tu CSS de Moodle** convierte esa previa en un
WYSIWYG real: usa la hoja que pegaste en la pestaña CSS **y quita la del
micrositio** (como hace Moodle), y marca `data-bs-theme="light"` para activar tus
tokens. Así el preview reproduce lo que Moodle mostrará —incluidos los fallos:
íconos en flex que colapsan porque su tamaño vivía en el CSS del micrositio, o
clases sin definir— *antes* de subir. Pega **CSS compilado** (no el SCSS fuente)
para máxima fidelidad. Ojo: el colapso depende del ancho, así que revísalo también
angostando la ventana. Editar el CSS refresca la previa sola (con un respiro).

#### El flujo en Moodle (el truco importante)

1. Crea el recurso **Página**.
2. En la herramienta, pulsa **Descargar imágenes (.zip)** y descomprímelo. Trae
   todas las imágenes que esa página usa, con los SVG ya convertidos a PNG.
3. En el editor, **arrastra todas esas imágenes de un jalón**. Se van al área de
   borrador de esa página (sin el zip, los SVG se caen del arrastre múltiple).
4. Abre **código fuente** (`</>`), borra todo y pega el HTML de la herramienta.
5. Guarda. Las imágenes resuelven solas porque el HTML las llama por su nombre.

Así no hay que subir imagen por imagen ni copiar URLs largas.

> ⚠️ **Dos cosas sin validar en producción.** Pruébalas con UNA página antes de
> convertir cuarenta:
> 1. Que las imágenes del borrador sigan resolviendo al reemplazar el contenido
>    del editor (debería: el HTML las referencia por nombre).
> 2. Que Moodle no borre los atributos `data-bs-*` al guardar. Si los quita, los
>    desplegables dejan de abrir — el contenido no se pierde, queda oculto. Si
>    pasa, el plan B es convertirlos a `<details>/<summary>`, que es HTML nativo,
>    no necesita JS ni atributos raros y sobrevive a cualquier purificado.

> Idea para después: generar un `.mbz` (respaldo de Moodle) con todas las
> páginas y sus imágenes dentro, y restaurarlo de un jalón. Es el camino
> realmente masivo, pero el formato de backup es quisquilloso; solo vale la pena
> si el flujo manual demuestra ser el cuello de botella.

---

## 4. Sistema de diseño

Estética glass/Apple: fondo con manchas difuminadas, paneles translúcidos con
`backdrop-filter`, radios de 24px, tipografía Inter, iconos
[Phosphor](https://phosphoricons.com) por CDN.

`assets/shared.css` ya trae resueltos los componentes comunes. **Úsalos en vez
de reescribirlos**: `.app-container`, `.glass-panel`, `.app-header`, `.logo`,
`.btn-back`, `.workspace`, `.panel-section`, `.section-header`,
`.toggle-switch` + `.slider`, `.btn-primary`, `.btn-secondary`, `.tabs` +
`.tab-btn` + `.tab-content`, `.empty-state`, `.code-wrapper` + `.code-output`,
`.btn-icon`, `.hidden`.

### Temas

El tema se aplica con `data-theme="light|dark"` en `<html>`. Lo gestiona
`assets/theme.js`, que se carga **en el `<head>` y sin `defer` a propósito**
para aplicar el color antes del primer pintado (si no, hay un destello blanco
al entrar en oscuro). Guarda la elección en `localStorage` bajo `panel-tema`;
si no hay ninguna, sigue la preferencia del sistema operativo. El switch se
inyecta solo en el `.app-header`, así que una herramienta nueva no lo maqueta.

**Regla de oro:** si un color debe cambiar entre claro y oscuro, va como token
en `:root` / `:root[data-theme="dark"]` de `shared.css`. Nunca hardcodeado en
un componente. Tokens disponibles: `--bg-color`, `--mesh-gradient`,
`--shape-opacity`, `--glass-*`, `--text-main`, `--text-muted`, `--accent`,
`--accent-hover`, `--success`, `--danger`, `--warning`, `--surface-raised`,
`--surface-translucent`, `--modal-bg`, `--modal-backdrop`, `--control-bg`,
`--control-border`, `--input-bg`, `--input-bg-focus`, `--input-border`,
`--slider-off`, `--disabled-bg`, `--card-glow`, `--hover-shadow`.

Ojo con las superficies translúcidas: `.glass-panel` aplica `backdrop-filter`,
y un fondo **opaco** anula el desenfoque. Por eso el modal usa `--modal-bg`
(translúcido) y no `--surface-raised` (sólido, para la pestaña activa).

**Excepción importante — las vistas previas son islas claras.** Los
`.preview-container` fijan `--preview-bg` / `--preview-text` / `--preview-border`
y **no cambian con el tema**, porque imitan la página real de Moodle, que
siempre es clara. Lo mismo los `--prepa-*` (rosa/verde de Moodle). Si inyectas
algo por JS dentro de una vista previa, usa colores fijos, no tokens temáticos:
`var(--accent)` en oscuro se aclara y pierde contraste sobre el fondo blanco.

### Layout

En escritorio la app ocupa **exactamente** el alto de la ventana y la página
nunca scrollea; lo que no cabe scrollea dentro de su panel. Esto depende de dos
cosas frágiles, no las rompas:

- El gutter va como `padding` del `body`, **no** como `margin` del
  `.app-container`. Un margen del hijo colapsa con el del body y empuja la
  página 16px de más.
- La cadena de flex necesita `min-height: 0` en cada eslabón
  (`.workspace`, `.panel-section`, `.tab-content`, `.code-wrapper`). Sin eso un
  elemento flex nunca encoge por debajo de su contenido y desborda.

Por debajo de 1024px de ancho (columnas apiladas) o 620px de alto, se devuelve
el scroll normal de página y cada bloque toma su alto natural.

---

## 5. Agregar una herramienta

1. Crea `tools/<slug>/index.html` con su `script.js` y `styles.css`.
2. En el `<head>`, en este orden:

   ```html
   <link rel="stylesheet" href="../../assets/shared.css">
   <link rel="stylesheet" href="styles.css">
   <script src="https://unpkg.com/@phosphor-icons/web"></script>
   <script src="../../assets/theme.js"></script>
   ```

   `shared.css` primero: tu hoja carga después para poder pisarlo.

3. Dentro del `<header class="app-header">` agrega el botón de regreso (el
   switch de tema se inyecta solo, junto a este botón):

   ```html
   <a class="btn-back" href="../../index.html"><i class="ph ph-arrow-left"></i> Panel</a>
   ```

4. Regístrala en `assets/tools.js`:

   ```js
   {
       slug: 'mi-herramienta',
       title: 'Mi Herramienta',
       description: 'Qué hace, en una línea.',
       icon: 'wrench',                    // nombre Phosphor sin el prefijo ph-
       accent: ['#0066cc', '#00c6ff'],    // degradado del icono
       tags: ['Moodle'],
       url: 'tools/mi-herramienta/index.html',
       status: 'ready'                    // 'soon' la pinta gris y no clicable
   }
   ```

5. En tu `script.js` arranca comprobando el estado del DOM, no solo con el
   listener (ver "Trampas conocidas").

---

## 6. Trampas conocidas

Cosas que ya costaron un rato; no las vuelvas a pisar.

- **`DOMContentLoaded` puede no dispararse.** Si el script se ejecuta cuando el
  DOM ya está listo, el listener nunca corre y la página queda vacía. Patrón a
  usar siempre:

  ```js
  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
  } else {
      init();
  }
  ```

- **El CSS de la herramienta pisa a `shared.css`.** Misma especificidad + carga
  posterior = gana el último. Una media query en `shared.css` sobre `.plain-input`
  NO le gana a un `.plain-input { min-height: 0 }` del CSS de la herramienta. Las
  reglas de selectores propios de una herramienta van en SU hoja.

- **Los campos flexibles necesitan un mínimo.** `min-height: 140px` en las áreas
  de entrada: con la ventana apretada se aplastaban a 30px. El panel scrollea en
  vez de aplastarlas.

- **`display: flex` convierte cada hijo en ítem flex**, incluidos los `<strong>`
  sueltos dentro de un `<p>`. Envuelve el texto en un `<span>` o se parte en
  columnas.

- **Grid: `align-content` es `stretch` por defecto.** En el launcher hacía que
  las tarjetas se estiraran al alto completo; va en `start`.

- El texto que pega el usuario **no se escapa** (comportamiento heredado del
  código original). Con bibliografías normales no estorba, pero un `<` o `&` se
  interpretaría como HTML.

---

## 7. PWA y publicación

### Publicar en GitHub Pages

En GitHub: **Settings → Pages → Source: Deploy from a branch → Branch: `main`,
carpeta `/ (root)`**. En un par de minutos queda publicada, y cada `git push` a
`main` republica solo.

El código **no depende de la cuenta ni del nombre del repo**: todas las rutas
son relativas y `pwa.js` deduce la raíz de su propia URL. Por eso el mismo
código funciona igual en `jonmtz-dev/utilidadesPL` que en cualquier otro repo,
sin cambiar nada.

> ⚠️ **La app vive en un subdirectorio** (`.../utilidadesPL/`), no en la raíz
> del dominio. De ahí la regla: **nunca uses rutas absolutas** (`/assets/...`).
> Funcionan en local y se rompen en producción.

#### Dos ligas = dos apps distintas

El navegador identifica una PWA por su **origen**. Publicar el mismo código en
dos cuentas produce dos apps independientes: caché propia, instalación propia y
actualizaciones propias. Quien instaló desde la liga del trabajo **no** recibe
nada de lo que publiques solo en la personal.

Por eso: la liga oficial para el equipo es la del trabajo
(<https://jonmtz-dev.github.io/utilidadesPL/>). La copia personal es respaldo;
si la mantienes, publica en ambas o quedará atrás.

### Instalar

Con la página abierta en Chrome/Edge (PC o Android) aparece el botón
**Instalar** en el header, o el icono de instalar en la barra de direcciones.
En **iPhone/iPad** no existe ese botón: es Safari → Compartir → *Añadir a
pantalla de inicio* (limitación de iOS, no del código).

### Cómo funciona la actualización

`sw.js` cachea la app para que abra sin internet, con estrategia **red primero,
caché de respaldo**: teniendo conexión siempre ves lo último (nadie se queda
pegado con una versión vieja), y sin conexión abre igual desde la caché.

Cuando publicas y el navegador detecta que `sw.js` cambió, instala el SW nuevo,
la app muestra el aviso *"Hay una nueva versión disponible"* con un botón
**Actualizar**, y al pulsarlo se activa, borra la caché vieja y recarga. Se
revisa al volver a la pestaña y cada 30 minutos.

> ⚠️ **Al publicar cambios, sube `VERSION` en `sw.js`.** Es lo que hace que el
> navegador note el cambio y salga el aviso. Si no la subes, el aviso no
> aparece (el contenido igual se refresca por la estrategia de red primero,
> pero la caché offline se queda vieja).

### Los iconos

`assets/icons/` está **generado**, no dibujado a mano. El script vive en el
historial de la conversación pero es trivial de rehacer con PIL: cuadro con
degradado `#0066cc → #00c6ff` y el glifo de 4 cuadros blanco, igual que el logo
del launcher. Salidas: `icon-192`, `icon-512` (esquinas redondeadas),
`icon-maskable-512` (lienzo completo, glifo al 40% para la zona segura de
Android), `apple-touch-icon` (180) y `favicon-32`.

### Probar la PWA

**Los Service Workers solo corren en HTTPS o localhost.** Abriendo el
`index.html` con doble clic (`file://`) la app funciona, pero no se instala ni
cachea. Para probar de verdad usa `python -m http.server 5510`.

Para forzar un estado limpio: DevTools → Application → Service Workers →
*Unregister*, y Application → Storage → *Clear site data*.

---

## 8. Desarrollo

Basta con abrir `index.html` en el navegador (funciona en `file://`).

Para servirlo por HTTP:

```
python -m http.server 5510
```

y abre <http://localhost:5510>.

> **Nota sobre caché:** el navegador puede quedarse con un CSS viejo aunque el
> archivo ya cambió, y eso se ve como tokens que "no existen" (`var(--x)` cae a
> transparente) o estilos que no aplican. Antes de dar por roto un cambio de
> CSS, recarga sin caché (Ctrl+F5). El preview embebido de algunos entornos es
> especialmente agresivo cacheando `file://`.

### Cómo verificar un cambio

No basta con que el CSS "se vea bien" en un screenshot. Lo que se probó y vale
la pena repetir:

- Convertidor: pegar una tabla, hacer clic en la fila de títulos, y confirmar
  que la salida trae `tabla-responsive-cards` y un `data-label` por celda.
- Bibliografías: generar con los toggles encendidos y apagados, y confirmar que
  el `span.nolink` solo envuelve enlaces de YouTube.
- Micrositios: hay un generador de `.zip` de prueba con los casos difíciles
  (nombre con espacio, colisión en subcarpetas, imagen faltante, script, enlace
  a otra página, entrada *stored* sin comprimir). Vale la pena rehacerlo con
  `zipfile` de Python si tocas el lector de zip.
- Layout: con contenido largo (30 filas), comprobar
  `document.documentElement.scrollHeight > innerHeight === false` en escritorio.
- Temas: recargar con `localStorage.setItem('panel-tema','dark')` y revisar que
  las vistas previas sigan claras y legibles.
