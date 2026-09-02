# Panel de Herramientas Moodle

Cajón de apps con utilidades propias para maquetar contenido en Moodle.
Sin build, sin dependencias, sin `npm install`: son archivos HTML/CSS/JS planos.
Se abre `index.html` en el navegador y funciona.

**Ojo: no todas las herramientas son para la misma versión de Moodle.** Cada una
lo indica con una insignia, en su tarjeta del panel y en su propio encabezado:

| Herramienta | Moodle |
|---|---|
| Adaptador de Rúbricas · Generador de Bibliografías · Integrador HTML | **3.11** |
| Convertidor de Tablas · Micrositio a Página · Bibliografías Margarita Maza · Guion Instruccional a Página | **5.1** |

El editor de rúbricas y el de libros cambiaron entre una versión y otra, así que
usar la herramienta equivocada genera HTML que se ve bien en la vista previa y
falla al pegarlo. La versión vive **solo** en el campo `moodle` de
`assets/tools.js` (§ del launcher): de ahí salen las dos insignias.

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
  scroll-pista.js           Difuminado y píldora "hay más abajo" (ver §4)
  tools.js                  ← Registro de herramientas (la fuente de la verdad)
  docx.js                   Lector de Word: bloques, tablas e imágenes (3 herramientas)
  modulos-311.js            Módulos y paletas 3.11 (Integrador y Bibliografías)
  tablas.js                 Conversión de tablas a tarjetas responsivas
  version-moodle.js         Inyecta la insignia de versión en cada herramienta
  volver.js                 Botón de volver: regresa a la plataforma con la que se entró
  reparto.js                Divisor arrastrable y previa ampliada (Guion e Integrador)
  paletas.js                Paletas de aula 5.1 (Guion y Bibliografías Margarita)
  zip.js                    Escritor de .zip (Micrositio y Guion a Página)
  icons/                    Iconos PWA (generados, ver §7)
tools/
  convertidor-tablas/       Tablas de Word/HTML → tarjetas responsivas
    index.html · script.js · styles.css
  generador-bibliografias/  Fuentes de consulta → párrafos <p> con enlaces
  adaptador-rubricas/       Rúbrica de Word → script que llena "Definir rúbrica"
    index.html · script.js · styles.css
  integrador-html-311/      Word de actividad → bloques editables + HTML + QA
    README.md                Reglas de importación, editor, QA y pruebas
    index.html · script.js · styles.css
  micrositio-a-pagina/      Micrositio .zip → recurso Página (@@PLUGINFILE@@)
    index.html · script.js · styles.css
  guion-a-pagina/           Guion en Word → página 5.1 armada visualmente
    README.md                Componentes, asistente de importación y previa
    index.html · script.js · componentes.js · vista-previa.js · styles.css
  qa-51/                    Revisa que lo montado en 5.1 sea el guion y la rúbrica
    README.md                Qué se coteja, qué se perdona y por qué
    index.html · script.js · verificador.js · styles.css
  bibliografias-margarita/  Word de fuentes → página 5.1, y QA de lo ya montado
    index.html · script.js · qa.js · verificador.js · styles.css
.claude/launch.json         Config del servidor local para previsualizar
```

El launcher **se dibuja solo** a partir del arreglo `TOOLS` de
`assets/tools.js`. No hay tarjetas escritas a mano en `index.html`.

### Montaje y QA: dos secciones, no una lista

Cada herramienta declara un `grupo` en `TOOLS`: **`rm`** (Responsable de
Montaje: arma el contenido) o **`qa`** (revisa lo ya montado contra el Word).
Los nombres y el orden salen de `GRUPOS`, en el mismo archivo — **agregar una
herramienta es ponerle su `grupo`, nada más**; si se olvida, no desaparece: cae
al final, sin encabezado.

Se usan en momentos distintos del trabajo, y mezcladas en una sola rejilla
costaba encontrar la que tocaba. Detalles del dibujo:

- El encabezado vive **dentro de la misma rejilla**, ocupando el renglón entero
  con `grid-column: 1 / -1`. Partirlo en dos rejillas partía también el filtro,
  el brillo que sigue al cursor y la entrada escalonada de las tarjetas.
- **Solo aparece si en pantalla hay más de un grupo.** En Prepa en Línea, que
  hoy no tiene herramientas de QA, un "Montaje" solitario encima de todas las
  tarjetas no separa nada; igual al buscar algo que solo cae en un grupo.
- Dentro de cada sección se respeta el orden de `TOOLS`, que ya viene por
  versión de Moodle: al *Ver todas*, cada sección enseña primero las de 3.11 y
  luego las de 5.1, sin barajarse.
- Sin fondo ni caja: la rejilla ya está llena de `.glass-panel` y otra
  superficie más solo compite. Ahí separa la línea, no el relleno.

**Una herramienta puede tener dos tarjetas.** Bibliografías Margarita Maza monta
la página *y* revisa la montada, así que aparece dos veces: en Montaje, y en
Revisión · QA como "QA de Bibliografías", con la misma `url` más `?modo=qa`. No
hay código duplicado —es la misma carpeta, la herramienta lee ese parámetro y
abre en su tercer modo—; lo que se duplica es la puerta, porque quien va a
revisar busca en la sección de QA y no tiene por qué saber que dentro de una
tarjeta de montaje hay una pestaña más.

Dos cosas que eso obligó a dejar resueltas:

- **El `slug` de la tarjeta no es el de la carpeta** (`qa-bibliografias` →
  `tools/bibliografias-margarita/`). No pasa nada: la insignia de versión y el
  botón de volver deducen la herramienta por la carpeta de la dirección, no por
  el slug de la tarjeta.
- **El Service Worker busca en caché con `ignoreSearch`.** Sin eso, sin conexión
  la liga con `?modo=qa` no coincidía con nada guardado y caía al launcher. Es
  la misma trampa por la que la marca de plataforma va en el hash y no en la
  query (ver §7).

### De qué plataforma se entró

La portada pregunta primero por la plataforma (Prepa en Línea / Margarita Maza)
y filtra la rejilla por el campo `moodle` de cada herramienta. Esa elección se
recuerda en el **hash** de la dirección (`index.html#plataforma=5.1`) y se le
pega a la liga de cada tarjeta, así que:

- el botón de volver de la herramienta regresa a **esa** lista y lo dice
  ("← Margarita Maza"), en vez de mandarte a elegir plataforma otra vez;
- el atrás del navegador hace lo mismo;
- abrir una herramienta directo (favorito, app instalada) no cambia nada: sin
  marca, el botón sigue diciendo "Panel" y lleva a la portada.

> ⚠️ **En el hash, nunca en la query.** El hash no viaja en la petición; con
> `?plataforma=…` el Service Worker busca en caché por dirección completa, no
> encontraría `index.html` ni la herramienta y **sin conexión te dejaría en el
> panel** en vez de abrir lo que pediste.

El nombre corto de cada plataforma (`corto` en `PLATAFORMAS`) vive en
`assets/tools.js` por lo mismo que la versión de Moodle: fuente única, nunca
escrito en el HTML de una herramienta.

---

## 3. Las herramientas

### Convertidor de Tablas (`tools/convertidor-tablas/`)

Flujo de dos pasos: pegas la tabla (desde Word o HTML crudo) y luego **haces
clic en la fila que contiene los títulos**. Esa fila se vuelve el `<thead>`
(salvo el caso 1 de abajo) y sus textos se copian al `data-label` de cada celda
de las filas siguientes.

**O ninguna, si la tabla no tiene fila de títulos.** El paso 2 lleva un botón
—"Esta tabla no tiene fila de títulos"— que genera la salida sin `<thead>`, sin
`<th>` y sin `data-label`: solo las clases de las tarjetas y los toggles de
color. Es el caso de las tablas de dos columnas tipo *nombre / explicación* (los
tipos de evaluación, las categorías de una rúbrica), donde **antes había que
señalar como títulos una fila que era contenido, y esa fila se perdía del
cuerpo**. En celular cada `<tr>` sigue siendo una tarjeta y se lee solo: nombre
arriba —con el color de la 1ª columna— y explicación debajo. Por dentro es
`headerIndex = -1` (`SIN_TITULOS`), que además sale gratis en el corte del
cuerpo: `slice(-1 + 1)` es la tabla entera.

**Los toggles repintan la salida y la previa al vuelo.** No lo hacían: había que
rehacer los dos pasos para ver el efecto de un interruptor, y desde que la
previa se parece de verdad a Moodle eso era justo lo que había que poder
comparar de un vistazo. Se recuerda con qué fila se generó (`ultimaFilaTitulos`)
y se rehace con ella. Dos detalles que no son adorno: cargar otra tabla borra
ese recuerdo (la fila de la anterior ya no significa nada), y el repintado **no
cambia de pestaña** —saltar a la previa le quitaría de enfrente el código a
quien lo estaba leyendo—.

Salida típica (el contenedor Moodle solo si se enciende su toggle):

```html
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
```

Opciones: bordes, colorear la 1ª columna alternando rosa/verde
(`bg-primary-10` / `bg-secondary-10`), repetir las celdas combinadas en las
tarjetas de celular, y envolver en contenedores Moodle.

**El contenedor Moodle va APAGADO por omisión.** Casi siempre la tabla se pega
dentro de una página que ya trae su `row > col-12`, y envolverla otra vez deja
un `.table-responsive` dentro de otro; el código tiene que empezar en
`<table class=`. Enciéndelo solo cuando la tabla vaya suelta: el
`.table-responsive` es el que le da el scroll horizontal, y sin él una tabla de
cinco columnas se desborda (la hoja de Moodle le pone
`.mainPlantilla23 .table td { min-width: 200px }`). **La vista previa lo enseña**:
en tableta, sin contenedor, la tabla se sale.

**De una tabla desnuda de Word también se limpian los restos de Word**, con el
mismo criterio que ya se usaba para el `style` en línea (solo si la tabla NO
trae diseño propio):

| Se quita | Dónde | Por qué |
| --- | --- | --- |
| `border`, `cellspacing`, `cellpadding`, `align`, `width`, `height`, `bgcolor` | solo en la `<table>` | `width="921"` le clava un ancho fijo en píxeles, justo lo que pelea con el diseño responsivo; `border="1"` pintaba bordes aunque el toggle estuviera apagado, o sea que el interruptor no servía; el `align` de una `<table>` no centra nada, la flota |
| `width`, `height`, `bgcolor`, `nowrap` | en celdas, filas y `<col>` | Anchos fijos en píxeles, otra vez |
| Clases `Mso*` (`MsoNormalTable`, `MsoNormal`, `MsoListParagraph`) | en todo | No existen en Moodle: no pintan nada y solo ensucian el código que hay que revisar a ojo |
| Etiquetas con dos puntos (`<o:p>`, `<w:sdt>`…), comentarios condicionales (`<![if !supportLists]>`) y los `<span></span>` que quedan vacíos | en todo | Son de Office. Se quita la etiqueta y se conserva lo que traiga dentro |

> ⚠️ **`align` y `valign` NO se tocan en celdas ni en párrafos.** Ahí sí son la
> alineación que trae el Word —los números de la columna "Semana" van
> centrados— y quitarlos la perdía. Ya pasó una vez: la limpieza empezó
> borrándolos en todo y la tabla salió con todo pegado a la izquierda.

**Las "viñetas" de Word no son una lista y aquí se vuelven una.** Word manda al
portapapeles un `<p>` por renglón con un `<span style="font-family:Symbol">` que
**dibuja** el punto, y la sangría en un `text-indent` negativo. Pegado en Moodle
eso queda como párrafos sueltos con un carácter raro al principio: sin sangría
francesa, sin la viñeta del tema y sin lista para el lector de pantalla. Los
`<p>` seguidos de ese tipo se juntan en un `<ul>` con un `<li>` cada uno
(`convertirVinetasDeWord()`), y el marcador se tira porque el punto ya lo pone
la lista. Se hace **antes** de limpiar clases y estilos: parte de lo que los
delata es justo lo que se va a borrar.

**No hay UN formato de viñeta de Word, hay cuatro**, y reconocer solo el
primero fue exactamente el error que dejó la fila 1 en lista y las demás en
párrafos:

| Cómo llega | Cómo se reconoce |
| --- | --- |
| `<p class=MsoListParagraph><![if !supportLists]><span style='font-family:Symbol'>·…` | la clase, o la fuente de símbolos |
| `<span style='mso-list:Ignore'>●</span><span> Texto</span>` | la marca `mso-list` |
| `<p class=MsoNormal><span>● Texto</span></p>` (el punto es TEXTO, sin nada que lo delate) | el párrafo **empieza** con un carácter de viñeta |
| `<p>• Texto</p>` | igual que el anterior |

Por eso la lista de caracteres (`VINETAS`) lleva `·`, `•`, `●`, `▪`… **y los del
área privada** (`U+F0B7` y compañía), que es como los mandan Symbol y Wingdings:
un documento hecho en Google Docs y exportado a `.docx` usa `U+25CF` donde Word
usa `U+00B7`.

Las listas **numeradas** no se tocan: su marcador viene como texto ("1.", "a)")
y no se puede distinguir de un párrafo que de verdad empieza con un número sin
adivinar. Un párrafo que abre con `-` tampoco cuenta, por lo mismo.

> ⚠️ **Al probar esto, el fixture tiene que traer los cuatro sabores.** El
> primer intento se probó con uno solo, generado a mano: pasó la prueba y falló
> en la tabla real del usuario, donde cada fila traía un formato distinto.

Y un efecto secundario de las listas: **la vista previa del paso 1 necesita
devolverle la sangría al `<ul>`**. El reset de `shared.css` (`* { padding: 0 }`)
se la quita, y como el punto de un `<li>` se dibuja FUERA de la caja
(`list-style-position: outside`), sin ese hueco las viñetas salían pintadas
encima del borde de la celda, fuera de la tabla. En Moodle no pasa —allá
Bootstrap le da al `<ul>` sus 2rem—, así que la regla vive en el CSS de la
herramienta, acotada a `.preview-container`.

**La vista previa vive en un `<iframe>`** con los anchos de escritorio, tableta
y celular, igual que Guion Instruccional a Página. No es un capricho: las media
queries miran el ancho de la **ventana**, y la regla que vuelve la tabla en
tarjetas es un `@media (max-width: 576px)`. Un `<div>` angosto no la dispara, así
que la previa vieja —tabla suelta con el CSS de la herramienta— **no podía
enseñar las tarjetas** y además mentía en el color del encabezado. Ahora usa las
mismas hojas que el guion (`hoja-moodle-default.js` + `CSS_VISTA_PREVIA`, leídas
de sus carpetas, sin copiarlas) y el contenido va envuelto en
`container-fluid mainPlantilla23 <aula>`, que es de donde salen los colores. El
selector de aula de la barra **solo pinta la previa**: no cambia ni una letra
del código.

**La fuente se trae de Google Fonts, y va DESPUÉS de la hoja del tema.** La hoja
pide `'Atkinson Hyperlegible Next'` por nombre, pero sus veinte `@font-face`
apuntan a `[[font:theme|…]]`, un marcador que solo resuelve dentro de Moodle:
fuera, no carga ninguna y la previa salía en Segoe UI. El `@import` de Google va
al principio de `CSS_EXTRA_PREVIA` —el bloque que se pega después del tema— y no
en un `<link>` del `<head>`, porque **cuando dos `@font-face` declaran la misma
familia gana la última**: puesta antes, las declaraciones rotas del tema la
tapaban y seguía sin cargar. (Esas rutas rotas siguen dando dos 404 en la
consola de la previa; son inofensivos y le pasan igual a Guion Instruccional,
que carga la misma hoja.)

**El color del encabezado va en las CELDAS, no solo en la fila.** Bootstrap
pinta el fondo de la tabla celda por celda
(`.table > :not(caption) > * > * { background-color: … }`), así que un
`bg-primary-20` puesto en el `<thead>` o en el `<tr>` queda **tapado** por el
blanco de los `<th>` de encima. Medido en la previa: el `<thead>` salía
`#d8a7b6` y el `<th>` salía `#fff`. Por eso el toggle "Colorear encabezado" no
se veía —ni aquí ni en Moodle— y las tablas ya publicadas tienen el encabezado
blanco aunque traigan la clase. Ahora la clase va en la fila **y** en cada
celda; en la celda gana, porque la hoja del tema la declara con `!important`.
Es lo mismo que documenta Guion Instruccional en su opción "Encabezado con el
color del aula".

**Dos trampas del formato de Word con fila de título y celdas combinadas** (el
típico "Contenido de Aprendizaje 1" con `colspan` arriba de los encabezados, y
columnas verticalmente combinadas):

1. **Si hay filas ARRIBA de los títulos, la fila de títulos NO se promueve a
   `<thead>`.** Un `<thead>` es `table-header-group`: el navegador lo pinta
   siempre primero, esté donde esté en el DOM. Promoverlo subía los títulos de
   columna por encima del título de la tabla y se veía **invertido**. En ese
   caso la fila se queda en su sitio —ya con sus `<th scope="col">`— y se
   esconde en celular con `d-none d-sm-table-row`, que es exactamente lo que
   hacía `.tabla-responsive-cards thead { display: none }`. Bonus: así el
   título con `colspan` sigue visible como primera tarjeta. Cuando los títulos
   son la primera fila (el caso común) todo sigue igual que siempre: `<thead>`.
2. **El `rowspan` no existe en celular.** Las tarjetas son `display: block`, y
   una celda combinada solo vive en el DOM de la PRIMERA fila que abarca: la
   tarjeta de la semana 1 salía completa y las de las semanas 2 y 3 perdían
   "Bloque de contenido" y compañía. Por eso se deja una **copia** de esa celda
   en cada fila heredera, **en su columna real** (`celdasHeredadas()` de
   `assets/tablas.js`), marcada `d-sm-none`: invisible de 576px hacia arriba
   —ahí sigue mandando el `rowspan` de verdad, la tabla de escritorio no
   cambia— y visible por debajo. Insertarla en su posición y no al final es lo
   que hace que la tarjeta se lea en el mismo orden que el renglón. Las copias
   llevan `data-celda-combinada` y se borran al cargar, para que volver a pegar
   una tabla ya convertida no las duplique ni corra los `data-label`.

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

El módulo se elige con un selector con paleta (la misma
`assets/modulos-311.js` que usa el Integrador HTML — fuente única, no se
duplica), y la vista previa reproduce el maquetado real de Moodle 3.11: fondo
del módulo, barra de título y área de contenido con los colores del módulo
elegido. Cambiar el módulo con la salida ya generada refresca la clase
`prepa-M{n}` y los colores sin volver a pulsar Generar.

### Adaptador de Rúbricas (`tools/adaptador-rubricas/`)

Lee la rúbrica del Word (o pegada como tabla) y genera un script que llena
"Definir rúbrica" en Moodle comparando **por nombre de criterio**, nunca a
ciegas.

**Las viñetas hay que escribirlas.** Word no guarda el `•` ni el `1.` dentro del
párrafo: los pinta a partir de `word/numbering.xml`. Al leer solo los `w:t`, una
lista se convertía en renglones sueltos y la definición del nivel llegaba a
Moodle sin viñetas —el campo del editor de rúbricas es **texto plano**, así que
si la viñeta no va escrita, no existe—. Por eso `textoDeCelda()` de
`assets/docx.js` acepta el mapa de formatos y antepone `• `, `1. ` o `a. ` según
lo que diga `numbering.xml`, con dos espacios de sangría por nivel. Un párrafo
sin lista reinicia la numeración.

Es **opcional a propósito**: quien genera HTML (Guion Instruccional a Página)
quiere la lista como estructura, no un `• ` literal metido en el párrafo. Solo
`leerTablasDeDocx()` —que usa la rúbrica— pide las viñetas.

### Guion Instruccional a Página (`tools/guion-a-pagina/`)

Los guiones llegan en Word y hay que montarlos como recurso **Página** de 5.1.
El problema no es teclear: es que **el montaje lo decide una persona** (esta
tabla del guion, ¿es tabla o acordeón?, ¿la imagen va a la izquierda?) y varios
compañeros no escriben HTML. Esta herramienta separa las dos cosas: la decisión
la toma el usuario con clics, el HTML lo pone la herramienta.

Se puede empezar de dos formas, y la herramienta lo pregunta al abrir: **con el
guion en Word** o **de cero** (con plantillas de arranque: con acordeón, con
tarjetas, con tabla o en blanco). Nada del editor depende de haber subido un
Word.

Importando el `.docx` (se salta las fichas de control editorial y arranca en el
título), abre un **asistente** donde cada tabla del guion se muestra con su
contenido para elegir en qué se convierte —*Tabla, Acordeón, Botón desplegable,
Tarjetas, Texto, No va*— y deja todo en un lienzo de bloques que se arrastran.
Hay 16 piezas (título, texto, lista, **pasos**, imagen con texto a un lado, caja
de instrucción, tabla, acordeón, **botón desplegable**, ventana emergente,
tarjetas, pestañas, video, botón, aviso, separador) y **se anidan**: dentro de un apartado del acordeón
caben una tabla, una imagen y otro tooltip.

**Pasos** es la pieza de las actividades de aprendizaje: la lista numerada de la
*Ruta de aprendizaje* dentro de su caja de color, con la tabla, la sublista
*a, b, c* o la nomenclatura centrada **colgando del paso** que las menciona. Al
importar, la marca `<Lista numerada; son las instrucciones>` la arma sola y la
sangría del Word decide qué párrafo pertenece al paso y cuál ya salió de la caja.

Las **imágenes del Word se extraen solas**: cada bloque de imagen ofrece la
galería del guion para elegirla con un clic, la vista previa las enseña de
verdad (cambia el `@@PLUGINFILE@@` por el archivo real) y *Antes de subir* trae
un **.zip** con las que esa página usa, para arrastrarlas todas de un jalón al
editor de Moodle.

La vista previa es un iframe con la hoja real del tema y tres anchos; el de
celular es el que enseña si la tabla se volvió tarjetas de verdad. Está
**sincronizada con el lienzo**: al hacer clic en un bloque lo enmarca allá, y al
hacer clic en la previa se abre ese bloque acá.

Se sale del tope de 1400px del contenedor (usa 1760) y tiene el **reparto de
pantalla ajustable** —lo mismo que el Integrador HTML, con el que comparte
`assets/reparto.js`—: el editor arranca angosto para que la previa tenga ancho
de escritorio de verdad, el divisor se arrastra (y se recuerda), y hay un botón
⤢ para darle el área completa a la previa **y otro para dárselo al editor**. El
ancho real en px va escrito junto a la barra, porque "escritorio" en una ventana
chica no es escritorio y conviene saberlo.

Las marcas de montaje del guion (`<Figura>`, `<Crear un grupo de 5 botones…>`,
las que abren y cierran las cajas de instrucción) **no se publican**: cada una
se convierte en el bloque vacío que corresponde y queda anotada en el bloque y
en la pestaña *Antes de subir*, para que nadie las pierda ni las imprima en la
página.

> 📐 **Detalles del HTML que produce en
> [`tools/guion-a-pagina/README.md`](tools/guion-a-pagina/README.md).** Léelo
> antes de tocar `componentes.js`: su markup está copiado de una página real ya
> montada (las ventanas emergentes son modales de Bootstrap, y los botones del
> acordeón llevan `bg-neutral-claro-50 text-primary`), y ahí está el catálogo
> de marcas del guion.

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
comprimidos), con el mismo espíritu que el lector de zip. Ese escritor vive en
`assets/zip.js` porque lo comparte con Guion Instruccional a Página; el lector
sí es propio de cada herramienta, porque leen cosas distintas.

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

**Modo “Corregir HTML” — páginas que ya están en Moodle.** Hay recursos que se
montaron cuando la herramienta aún no tenía todos los arreglos y **de los que ya
no queda el micrositio**: lo único recuperable es el HTML que está en Moodle. El
selector de arriba a la izquierda cambia a ese modo: se pega el HTML y sale el
mismo HTML con lo que le faltaba. El arreglo grande es la marca
`.ms-convertido` —sin ella, las reglas de estado del tema (acordeón abierto,
hover de los botones) no alcanzan a esa página y se ve descolorida—, y con ella
viajan el saneo para TinyMCE, los arreglos de montaje y el `data-label` por
columna real de las tablas. Los bloques son **los mismos** que usa la conversión
normal (`arreglosDeMontaje()`), no una copia.

**No toca rutas ni imágenes**, y no puede reponer el tamaño de las que eran SVG
(para eso hace falta el archivo original): esa página hay que rehacerla desde el
micrositio. Tampoco pisa un estilo inline que ya esté puesto —manda el que dejó
el blindaje medido contra el micrositio de verdad—, así que correrlo de más no
cambia nada: la salida es idempotente. El detalle, en el §10 de `REGLAS.md`.

> 📐 **La lógica completa del sistema de igualación de estilos vive en
> [`tools/micrositio-a-pagina/REGLAS.md`](tools/micrositio-a-pagina/REGLAS.md).**
> Léelo antes de tocar `blindar()`, la marca `.ms-convertido` o el tablero de la
> pestaña CSS: documenta las restricciones probadas en Moodle (qué borra TinyMCE,
> por qué los estados no pueden ir inline) y los casos ya resueltos.

**Pestaña CSS — igualar estilos con tu Moodle.** La hoja de Moodle (el CSS
**compilado**, no el SCSS) **viene precargada por defecto** en `hoja-moodle-default.js`
(`window.HOJA_MOODLE_DEFAULT`), así el equipo no tiene que pegar nada. Si alguien pega
una propia, esa **se guarda** (`localStorage`, key `ms-hoja-moodle`) y tiene prioridad
sobre el default. Para actualizar el default: recompila el SCSS y regenera ese archivo
(es `JSON.stringify` del CSS, sin editar a mano). El CSS se parsea con el motor del
navegador (`CSSStyleSheet` construible, que parsea sin aplicar, así el CSS ajeno no
puede tocar el panel), no con regex.

Con esa hoja, la herramienta compara cada micrositio y arma un **tablero**: lista
las **diferencias de estilo de componentes** (acordeones, botones, tablas…) con
**muestras de color** (resuelve los `var(--x)` reales bajo el módulo del micro en un
iframe oculto), y genera el **arreglo listo para pegar** en tu tema.

El arreglo son reglas **aditivas** bajo la clase marca `.ms-convertido` (que la
herramienta le pone al wrapper de cada conversión): reescribe el selector del micro
`.mainPlantilla23 → .ms-convertido` y usa sus declaraciones con `!important`. Así el
arreglo **no modifica tus reglas existentes** y solo afecta a micrositios convertidos.
Es la única vía para igualar **estados** (hover, acordeón abierto), que un `style=""`
inline no puede: TinyMCE de Moodle borra los `<style>` y las variables `--bs-*`, pero
respeta las clases y el CSS del **tema**. El flujo: pegas tu hoja → conviertes → copias
el arreglo → lo pegas en tu tema (sección nueva) → repegas tu hoja y esa diferencia
deja de aparecer. Cada micro nuevo aporta menos diferencias hasta cubrirlo todo.

Para lo **sin estado** (fondos, textos, bordes de tablas), además hay un blindaje
inline opcional (toggle *Blindar colores*): renderiza el micro en un iframe con su
propio CSS y **congela** el color final como `style="… !important"` en la salida —gana
al Bootstrap de Moodle y sobrevive a TinyMCE—. Los componentes con estado NO se
congelan (los resuelve el complemento `.ms-convertido` del tema).

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

### Bibliografías Margarita Maza (`tools/bibliografias-margarita/`)

Tres modos: dos para montar y uno para revisar. Los dos primeros usan marcas
distintas a propósito:

1. **Desde Word** — el .docx de fuentes se vuelve la página completa:
   `container-fluid mainPlantilla23 <paleta> pb-3 mw-100`, título con su rayita
   de color, `<hr>`, y las fuentes en `text-multicol text-multicol-rule` (dos
   columnas con línea punteada) como `<p class="fuente">`. Todos los enlaces con
   `target="_blank"`; los de YouTube envueltos en `<span class="nolink">`.
   El envoltorio salió de **cotejar una bibliografía ya publicada**: 345
   fuentes, 294 enlaces, todos con target, 21 con nolink y **cero**
   `nomediaplugin`.

   Dos interruptores: **sangría francesa** (es la clase `fuente`, que el tema
   define como `text-indent:-25px; padding-left:25px`; apagada, el `<p>` sale
   pelado) y **dos columnas**. Las **cursivas del Word sí se conservan** —el
   título de una ficha va en itálica por norma de citación—: llegan del lector
   como `*texto*` y salen como `<i>`. Ese ejemplo publicado no las traía, pero
   era solo un ejemplo.
2. **Corregir HTML pegado** — la lógica original: a los `<a>` de YouTube les
   agrega `class="nomediaplugin"`. **No se cambió a `nolink`**: hay páginas
   montadas con esa marca y cambiarla les reescribiría el criterio a media obra.
3. **Revisar lo montado (QA)** — se sube el Word y sale un **marcador**
   (bookmarklet) que se ejecuta sobre la página de Moodle: enmarca ahí mismo lo
   que no cuadra, dibuja su panel y genera la evidencia en PDF, igual que las
   otras dos herramientas de QA. Como alternativa —revisar antes de publicar, o
   desde otra máquina— el mismo cotejo corre sobre un HTML pegado.
   **Tiene su propia tarjeta en el panel**, dentro de Revisión · QA ("QA de
   Bibliografías"): es esta misma herramienta abierta con `?modo=qa`.

   El reparto de archivos importa:

   | Archivo | Qué es | ¿Viaja a Moodle? |
   |---|---|---|
   | `qa.js` → `MOTOR_QA_BIBLIO(DATOS, raiz)` | **El cotejo.** Recibe las fuentes y un nodo del DOM; devuelve hallazgos | **Sí**, serializado con `toString()` |
   | `qa.js` → `QaBibliografia` | Envoltorio de la página: lee el Word y llama al motor sobre el HTML pegado | No |
   | `verificador.js` | Dónde mirar dentro de Moodle, el enmarcado y el panel | **Sí** |
   | `assets/evidencia-qa.js` | La evidencia imprimible, compartida con los otros QA | **Sí**, como argumento |

   **El motor es uno solo a propósito.** El marcador y el modo de pegar el HTML
   aplican exactamente las mismas reglas; con dos copias, la primera corrección
   en una dejaba mintiendo a la otra. Llamado sin `raiz` el motor entrega sus
   utilidades en vez de un informe, y de ahí salen también los lectores del
   Word: así los regex que deciden qué es una fuente y qué es una marca del
   guion existen **una vez**.

   Se puede probar sin Moodle:
   `QaBibliografia.revisar({ fuentes, html })`.

#### Qué revisa el modo QA

| Se revisa | Nivel si falla |
|---|---|
| Cada fuente del Word está montada, y con su texto exacto | **Error** (falta, sobra, cambia una palabra o un acento) |
| Cambia solo la puntuación o los espacios | Aviso: casi siempre una corrección de estilo al montar |
| Todo `<a>` lleva `target="_blank"` | **Error**: sin él el enlace se lleva al estudiante fuera del curso |
| Los de YouTube van con `span.nolink` (o el `nomediaplugin` viejo) | **Error**: Moodle los cambia por un reproductor incrustado |
| Una URL del Word quedó como texto plano | **Error** |
| El texto visible del enlace es otra dirección que su `href` | **Error** |
| Falta `rel="noopener"` | Aviso: el montaje del área lo lleva siempre |
| **La sangría francesa es la del Word** | **Error** por párrafo: `class="fuente"` de más o de menos |
| Marcas del guion publicadas (`<h1>`, `<Figura>`…) | **Error** |
| Orden distinto al del Word, repetidas, párrafos vacíos, texto sin año ni URL | Aviso |
| El conteo de "Hipervínculos" de la hoja de control no cuadra | Aviso |

Tres decisiones que conviene no deshacer:

- **El marcador ve cosas que el HTML pegado no.** En la página viva ya
  corrieron los filtros de Moodle: si a un enlace de YouTube le faltó el
  `span.nolink`, ahí se ve **el reproductor ya incrustado** —y así se reporta—,
  mientras que en el código del editor no había nada raro que mirar.
- **El marcador no revisa la página entera.** Entra por `#fuentes`, y si no
  está, por `.mainPlantilla23` o por el contenido de `#region-main`. Tomando
  `document.body` el menú del curso y el pie —llenos de `<a>` sin `target`—
  metían cien errores que no son de la bibliografía. El modo de pegar el HTML
  elige la raíz igual, por si pegan la página completa.
- **Los dos formatos de guion entran igual.** El que solo manda las fuentes y el
  que las manda detrás de una hoja de control (módulo, elaboradores,
  indicaciones para producción). Esa hoja vive en TABLAS, y como `docx.js` no
  entrega el texto de una celda como párrafo, se cae sola. El título
  "Bibliografía" y las marcas tipo `<h1>` se quitan por nombre. **La misma
  función la usa el modo 1** (`QaBibliografia.fuentesDeBloques`): antes ese
  guion largo montaba `<h1>` como si fuera una fuente.
- **Cuando el Word viene mezclado, no se reportan 32 errores del montaje.** Pasa
  de verdad: un guion real trae 108 fuentes con sangría francesa y 32 sin ella.
  Se avisa **una vez** que el Word no es consistente, se listan las que se
  salen, y se coteja Moodle contra la mayoría —que es lo que el montador iba a
  hacer de todos modos—. Ese aviso cuenta como uno solo en el veredicto; si no,
  una página impecable salía con "31 avisos".

El selector de paleta cambia la clase del contenedor, y de ahí sale el color de
la rayita del `<h1>` (`.tituloUnidad h1 { border-left: 8px var(--primary-40) }`).
La lista vive en `assets/paletas.js`, compartida con Guion a Página. La previa va
en un iframe con la hoja real del tema, porque esa rayita y la línea entre
columnas salen de ahí.

### QA de Actividad y Rúbrica (`tools/qa-51/`)

Cierra el circuito de 5.1: **revisa que lo montado sea lo que mandó producción.**
Se suben el guion y la rúbrica en Word, y la herramienta genera un verificador
—marcador o pegote de consola— que se ejecuta **sobre la página ya montada** en
Moodle. Compara texto, negritas y cursivas, tablas, el enlace de la rúbrica, los
criterios con sus puntos y que la suma dé el total del Word. Solo lee: enmarca lo
que no coincide y dibuja su panel.

Es el mismo lector de Word (`assets/docx.js`) y el mismo catálogo de marcas que
usa Guion Instruccional a Página, a propósito: el HTML que genera esa herramienta
es idéntico al que monta el equipo, así que las dos entienden el mismo documento.

> 📐 **Qué se coteja, qué se perdona y por qué, en
> [`tools/qa-51/README.md`](tools/qa-51/README.md).** Ahí está la tabla de
> diferencias legítimas (el renumerado de las tablas, las comas que se corrigen
> al montar…) que separan un aviso de un error, y las tres trampas de comparación
> que costaron trabajo.

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

También el **reparto de la pantalla** (`.divisor`, con `assets/reparto.js`) y la
**barra de la vista previa**: `.preview-barra`, `.preview-nota`,
`.btn-icono-barra`, los anchos `.anchos` + `.ancho-btn`, la medida
`.preview-medida` y el marco `.preview-caja` con su `<iframe>`. Los comparten
Guion Instruccional a Página y el Convertidor de Tablas; cada herramienta solo
decide el ancho de SUS columnas, con la variable `--col-editor`.

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

### Scroll: nunca una barra a media pantalla

Consecuencia directa del layout de arriba: si la página no scrollea, scrollea
algo de adentro, y la barra nativa aparece flotando en medio de un panel de
cristal —se lee como una cicatriz y encima no dice *qué* se mueve—. El acuerdo,
con las clases de `shared.css`:

| Caso | Clases | Qué hace |
| --- | --- | --- |
| Zona chica dentro de un panel (lienzo, paleta, galería, checklist) | `.scroll-sin-barra .scroll-difuso` + `data-pista-scroll` | Sin barra; el borde se difumina **solo** cuando queda contenido de ese lado |
| Zona que además conviene anunciar (rejilla del launcher) | + `data-pista="#id"` y un `<button class="pista-mas">` | Píldora "hay más abajo" que late suave y baja al pulsarla |
| Un panel entero (`.panel-section`) | ya lo trae | Barra **fina** y translúcida: esconderla del todo dejaría el panel sin ninguna pista |

Las clases de estado (`mas-arriba` / `mas-abajo`) las pone `scroll-pista.js`, que
mira el scroll, el tamaño de la zona (`ResizeObserver`) y su contenido
(`MutationObserver`, porque el launcher filtra tarjetas y el lienzo se redibuja
entero). Sin el script, las clases son inofensivas: la máscara queda opaca.

El difuminado son dos custom properties registradas con `@property` (`--fade-arriba`
/ `--fade-abajo`) para que puedan transicionar; sin registrarlas, una custom
property no es animable y el difuminado aparecería de golpe.

> ⚠️ **`.scroll-difuso` no va en un contenedor de `.glass-panel`.** Una máscara
> convierte al elemento en *backdrop root*: sus descendientes con
> `backdrop-filter` dejan de ver el fondo de la página y el efecto cristal se
> apaga. Por eso la rejilla del launcher (tarjetas de cristal) usa solo la
> píldora, sin difuminado.

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

### Tocar código compartido: agrega, no cambies

`assets/` lo usan varias herramientas a la vez, y cada una ya está cotejada
contra páginas publicadas. La regla, cuando una herramienta necesita algo nuevo
del código común:

> **Lo que ya sirve se queda como está. Lo nuevo entra como campo adicional o
> como opción apagada por omisión.**

No es prudencia decorativa: `assets/docx.js` alimenta al Integrador HTML, al
Adaptador de Rúbricas y a Guion a Página, y cada uno interpreta el mismo texto
de forma distinta. Las dos formas de hacerlo, con los casos que las motivaron:

| Necesidad | Cómo NO | Cómo sí |
| --- | --- | --- |
| Guion a Página necesitaba las tablas anidadas de una celda, en orden | Cambiar `lineas`/`texto` para que dejaran de aplanar | **Campo nuevo** `contenido`, con los párrafos y las tablas en el orden real. `lineas` y `texto` intactos |
| Necesitaba los saltos de línea manuales (`w:br`) como `\n` | Devolverlos siempre | **Opción** `textoDeParrafoConNegritas(p, { saltos: true })`, apagada por omisión |
| El QA de bibliografías necesitaba saber si el párrafo trae **sangría francesa** | Reinterpretar `sangria`, que ya leen tres herramientas como "cuánto se corre el párrafo" | **Campos nuevos** `sangriaColgante` (twips) y `sangriaFrancesa` (booleano), de `w:hanging` o de un `w:firstLine` negativo. `sangria` intacto |
| El Integrador HTML necesitaba las **fórmulas** del Word, que se estaban perdiendo enteras | Devolver siempre el `$$…$$` dentro del texto | **Opción** `leerBloquesDeDocx(file, { latex: true })`, apagada por omisión: en el editor de rúbricas de Moodle esos signos se publicarían literales |
| Guion a Página necesitaba las **viñetas escritas dentro de una celda**, que llegaban como párrafos sueltos | Reescribir la viñeta como texto en `texto`/`lineas`, como hace el Adaptador de Rúbricas | **Campos nuevos** en cada párrafo de `contenido`: `lista`, `tipoLista`, `nivelLista`, `idLista`. Salen del mismo `datosDeLista()` que ya usaba el bloque de párrafo, así que no hay dos lecturas de `numbering.xml` |
| …y las **cursivas** dentro de esa misma celda | Encenderlas siempre en `contenido` | El `contenido` **hereda** el `cursivas` de quien llamó (antes iba fijo en `{ saltos: true }`). El `latex` NO se hereda: quien lee celdas hoy no espera un `$$…$$` en su texto |
| Guion a Página necesitaba distinguir el **ícono anclado** en un párrafo de una figura de verdad | Filtrar por tamaño dentro de `imagenes`, que ya son ids pelados | **Campo nuevo** `imagenesInfo`: `[{ id, ancho, alto }]` en píxeles, del `wp:extent` del dibujo. `imagenes` sigue siendo la lista de rId de siempre |
| Guion a Página necesitaba la **nomenclatura** que producción deja en un comentario de Word sobre la imagen | Leer `comments.xml` por su cuenta, duplicando el lector que ya existe | **Campo nuevo** `comentarios` (los ids que tocan el párrafo) en el bloque y en `contenido`; el texto se saca con el `leerComentariosDeDocx` de siempre |

El segundo caso enseña por qué: el Integrador HTML parte sus listas por renglón,
así que un salto dentro de un elemento se habría convertido en **dos** elementos.
El cambio era correcto para una herramienta y equivocado para la otra; como
opción, las dos quedan bien.

Y al terminar, **prueba la otra herramienta**, no solo la tuya: tras tocar
`docx.js`, importar el mismo Word en el Integrador HTML y comparar el número de
bloques y de `<li>` es una prueba de 30 segundos que detecta esto.

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
  las tarjetas se estiraran al alto completo; va en `start`. Y su contrario:
  con alto definido, las filas `auto` se **aprietan** para caber y el contenido
  se corta; por eso el launcher usa `grid-auto-rows: max-content`.

- **Dos campos con el mismo nombre y distinto dueño.** En Guion a Página, la
  indicación del guion ("El guion pide: Figura") y el pie de figura del bloque de
  imagen compartían el campo `nota`: una marca `<Figura>` del Word acababa
  **publicada** como pie de la imagen. Antes de reutilizar un nombre de campo,
  revisa que ningún componente ya lo tenga como campo propio (ahora se llama
  `indicacion`).

- **Dentro de una plantilla de texto, un acento grave la cierra — hasta en un
  comentario.** Los verificadores de QA se arman como plantilla (`` return `…` ``)
  y ahí un `// la `firma` es…` parte el archivo en dos: el navegador reporta un
  `SyntaxError` en una línea que se ve perfecta y la herramienta entera queda sin
  arrancar. Lo mismo vale para las barras invertidas: cada `\` del código
  generado va **doble** en el fuente, así que un `/\s+/g` del verificador se
  escribe `/\\s+/g`, y un `/\\[a-zA-Z]+/g` —el que busca una barra literal— se
  escribe con cuatro. Al tocar un `scriptQA`, mira el código YA generado (la caja
  de la pestaña QA), no solo el fuente.

- **El Service Worker sirve la versión vieja mientras pruebas.** Si guardaste un
  archivo con un error, esa copia rota se queda en la caché y sigue apareciendo
  aunque ya lo hayas arreglado. Al depurar en local: quitar el registro
  (`navigator.serviceWorker.getRegistrations()`) y vaciar `caches` antes de
  recargar, o probar en una ventana de incógnito.

- **Redibujar la vista previa por un clic la deja muerta.** En Guion a Página, el
  clic en la previa (para sincronizar con el lienzo) llamaba a `dibujarTodo()`,
  que regenera el iframe: el acordeón se cerraba en el mismo clic con que se
  abría, y lo mismo las pestañas y las ventanas. Abrir o seleccionar un bloque no
  cambia el HTML, así que ahí va `dibujarLienzo()` y nada más.

- **El texto aplanado de una celda pierde sus tablas anidadas.** En los guiones,
  la celda de un apartado trae tablas dentro (el grupo de botones). Con solo el
  texto, esa tabla desaparecía del apartado y reaparecía como bloque hermano al
  final de la página. Por eso `docx.js` entrega también `contenido`: los párrafos
  y las tablas de la celda **en el orden real**.

- **Un ítem flex con `flex: none` se mide por su contenido.** Al envolver una
  zona con scroll en una "ventana" `display: flex` (para colgarle la píldora),
  el hijo con `flex: none` —lo que hace la media query al apilar— pasa a medir
  `max-content`: el lienzo de Guion a Página se salió a 495px dentro de un panel
  de 271px. En vertical la ventana vuelve a `display: block`.

- **`overflow: visible` + un flex-basis fijo = contenido encimado.** Al apilar
  las columnas en celular, un contenedor con `flex: 1 1 240px` se queda en
  240px, y como ahí el overflow es visible, lo que sobra se pinta ENCIMA de lo
  que sigue (no scrollea ni empuja). En vertical, al apilar va `flex: none`.

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
>
> **Y ojo con el Service Worker, que también cachea el JS.** Probando en
> `localhost` con el SW registrado, un `assets/*.js` recién editado puede seguir
> sirviéndose viejo: el síntoma es de los que hacen perder media hora —un campo
> nuevo que llega `undefined`, una función que "no existe", una corrección que no
> aparece— aunque el archivo en disco esté bien. Para descartarlo, en la consola:
>
> ```js
> (await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister());
> (await caches.keys()).forEach(k => caches.delete(k));
> ```
>
> y recarga. Un `?v=algo` en la URL solo refresca el HTML, no los scripts que
> cuelgan de él.

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
