# Guion Instruccional a Página (Moodle 5.1)

Constructor visual: el guion llega en Word, la página sale armada. Está pensada
para el compañero que **no sabe HTML** — no hay un solo campo donde se escriba
una etiqueta — pero conserva la decisión que sí es humana: qué se vuelve
acordeón, qué se queda como tabla, de qué lado va la imagen.

Es la mezcla del **Integrador HTML** (leer el Word, editar por bloques) y de
**Micrositio a Página** (vista previa fiel con la hoja real de Moodle y una
lista de lo que falta antes de subir), pero para la plantilla de 5.1.

## Los dos caminos

Al abrir, la herramienta pregunta cómo empezar. Los dos caminos pesan igual:

**A. Con el guion en Word.** Sueltas el `.docx` (o el botón *Word* del
encabezado, que sirve en cualquier momento). Las fichas de control editorial del
inicio se saltan solas: la página empieza en la **primera tabla de una celda con
texto**, que es la barra del título. Luego se abre el **asistente**: cada tabla
real del guion se muestra con su contenido y tú eliges qué es — *Tabla,
Acordeón, Tarjetas, Texto* o *No va*. Las tablas de una celda no se preguntan:
son barras de título y se convierten solas.

**B. De cero.** Cinco plantillas de arranque (actividad con pasos, con acordeón,
con tarjetas, con tabla, o en blanco) para no enfrentarse a una hoja vacía. A partir de ahí es el
mismo editor: nada de lo que sigue depende de haber subido un Word.

Y en los dos casos:

1. Eliges la **paleta del aula** (M01, M02, M03, MM, reg). De ahí salen todos
   los colores; nunca se escribe un hex.
2. Acomodas en el **lienzo**: arrastrar para mover, ▲▼, duplicar, borrar. Los
   bloques llegan plegados y se abren al hacer clic. Para meter algo en medio,
   la franja **+** entre dos bloques abre la paleta ahí mismo; la paleta del pie
   inserta debajo del bloque seleccionado.
3. Revisas en la **vista previa**, que trae los tres anchos (escritorio,
   tableta, celular). El de celular es el que importa: ahí se ve si la tabla se
   vuelve tarjetas de verdad.
4. Copias el HTML y sigues la pestaña **Antes de subir**.

## El reparto de la pantalla

Es un constructor con vista previa, así que el ancho es materia prima. Cuatro
decisiones, todas con el mismo porqué: **que la previa se parezca a Moodle y el
editor no obligue a scrollear para trabajar.**

1. **El contenedor llega a 1760px** (`.guion-app`), no a los 1400 del resto. Con
   el 50/50 anterior la previa quedaba en ~600px: por debajo de 576 la propia
   hoja de Moodle convierte las tablas en tarjetas, así que "escritorio" mentía
   justo en lo que la herramienta produce.
2. **El editor arranca angosto** (`clamp(400px, 30%, 540px)`) y la previa se
   queda con el resto: en una pantalla de 1792px son ~1100px de previa.
3. **El divisor se arrastra** (doble clic para restablecer, flechas con el
   teclado) y el ancho se guarda en `localStorage` (`guion-col-editor`). Nunca
   deja a la previa con menos de 520px. El `pointermove` se escucha en `window`,
   no en el divisor: son 20px y el cursor se sale; y la captura del puntero es lo
   que permite arrastrar **por encima del iframe** de la previa, que si no se
   queda con los eventos del ratón.
4. **El botón ⤢ le da a la previa el área completa** (Esc para volver) y junto a
   la barra se escribe **el ancho real en px**, que es lo que evita creer que se
   está viendo un escritorio cuando no.

Y dos cosas del panel del editor, que es donde se sentía apretado:

- **La paleta del pie se pliega** (se recuerda en `guion-paleta-plegada`): son
  ~150px que a veces se prefieren para el lienzo. Con la franja **+** entre
  bloques la paleta no es el único camino para insertar.
- **Con la página vacía, la paleta no se dibuja**: no hay bloque debajo del cual
  insertar y la pantalla de inicio se queda con el panel entero, centrada. Antes
  la primera pantalla de la herramienta era la más apretada de todas.
- En una laptop bajita (≤820px de alto) el lienzo, la paleta y la ficha ceden
  unos píxeles cada uno **antes** de que el panel entero se ponga a scrollear:
  vale más ver las tres cosas que dos completas y una detrás de una barra.

Ninguna zona saca barra de scroll a media pantalla; el borde se difumina cuando
queda contenido. La convención y sus clases están en el README de la raíz (§4).

## Las imágenes del guion

Al importar el `.docx` se extraen también sus imágenes (`assets/docx.js` ya
sabía hacerlo). A partir de ahí:

- Cada campo de imagen trae **miniatura** y el botón **Elegir del guion**, que
  abre la galería con todo lo que venía en el Word. Un clic y el campo queda en
  `@@PLUGINFILE@@/<nombre>`. Escribir el nombre a mano sigue siendo válido.
- **La vista previa muestra la imagen de verdad**: el `@@PLUGINFILE@@` se
  cambia por el `blob:` del archivo. En el HTML que se copia, por supuesto, se
  queda el `@@PLUGINFILE@@`.
- En *Antes de subir* hay **Descargar imágenes (.zip)** con las que esa página
  usa, para arrastrarlas todas de un jalón al editor de Moodle. El escritor de
  zip vive en `assets/zip.js`, compartido con Micrositio a Página (antes estaba
  duplicado dentro de esa herramienta).

> Por eso el `<iframe>` de la previa lleva `allow-same-origin`: sin él no puede
> cargar `blob:` del documento padre ni sincronizarse con el lienzo. Lo que
> corre adentro es nuestro; el texto del usuario va escapado y las ligas pasan
> por `ligaSegura()`.

## Lienzo y vista previa sincronizados

Al hacer clic en un bloque, la previa lo trae a la vista y lo enmarca; al hacer
clic en la previa, se abre ese bloque en el lienzo. Se logra marcando cada
bloque con `data-bq="<id>"` **solo en la generación de la previa**
(`marcarBloques(true)`): el HTML que se copia a Moodle nunca lleva ese atributo.
La marca se inyecta en la primera etiqueta del bloque, no envolviendo en un
`<div>`, porque un envoltorio extra cambiaría la rejilla y la previa dejaría de
ser fiel.

> ⚠️ **Ese clic llama a `dibujarLienzo()`, jamás a `dibujarTodo()`.** Con
> `dibujarTodo()` la previa se regenera desde cero, así que el acordeón —o la
> pestaña, o la ventana emergente— se cerraba **en el mismo clic con que se
> abría** y la previa parecía estar muerta. Abrir o seleccionar un bloque no
> cambia el HTML: no hay nada que refrescar allá.

## Las marcas del guion (lo que más importa del importador)

En el Word, producción escribe entre `< >` lo que hay que **construir**, no lo
que hay que publicar:

| Marca en el Word | Qué hace la herramienta |
|---|---|
| `<h1>` | El título de la página |
| `<Texto regular en negritas con ícono de interactividad a la izquierda>` … `<Termina …>` | Caja de instrucción amarilla con lo que va en medio |
| `<Lista numerada; son las instrucciones>` … `<Termina …>` | **Abre la caja de pasos** (ver abajo): los párrafos numerados son los pasos y lo indentado cuelga del paso |
| `<Texto regular centrado>` … `<Termina …>` | Párrafos centrados (`<p class="text-center">`), respetando las negritas del Word |
| `<Figura>` / `<Termina figura>` | Bloque de imagen vacío, listo para poner el archivo |
| `<Crear un grupo de 5 botones…>` | Bloque de tarjetas con esas 5 ventanas |
| `<Tabla>` | Se queda esperando: si abajo viene una tabla de verdad, **es esa** (antes salían las dos, la vacía y la real). Si nunca llega, queda la tabla vacía con la nota |
| `<Pop-up>`, `<Video>` | El bloque correspondiente, vacío |
| Cualquier otra | Se guarda como indicación, no se publica |

### La caja de pasos y la sangría de Word

Una actividad de aprendizaje no es una sucesión de bloques hermanos: la *Ruta de
aprendizaje* es una **caja de color con una lista numerada**, y de cada paso
cuelga lo suyo —la tabla del paso 5, la sublista *a, b, c* del 6, la
nomenclatura centrada del 7—. Eso es el componente **Pasos**; con el bloque
`lista` no se podía, porque sus elementos son texto plano y la tabla terminaba
como bloque hermano después de la lista.

Dentro de la región, quién decide si un párrafo cuelga del paso o si ya salió de
la caja es la **sangría de Word** (`w:ind`), que `assets/docx.js` entrega en
`sangria`: los pasos y su contenido vienen a 720 twips y el *"Nota: al nombrar tu
archivo…"* viene a 0 —y en la página publicada va, efectivamente, **fuera** de la
caja—. No es una corazonada: es el dato con el que Word lo dibuja. La excepción
es `<Texto regular centrado>`, que dice explícitamente que sí es del paso.

Los pasos se distinguen de la sublista por el `numId` del Word: el primero que
aparece en la región numera los pasos, cualquier otro (o un nivel más adentro) es
sublista del paso en curso, con `type="a"` si Word la numeró con letras.

Dejarlas en el texto era el error más visible de la primera versión: salían
impresas en la página. Ahora **ninguna marca llega al HTML**; cada una se vuelve
el bloque que corresponde y queda anotada en el bloque ("El guion pide: …") y en
la pestaña *Antes de subir*. Las marcas suelen venir en negritas dentro del
Word, así que se reconocen quitando los `**` antes de compararlas.

La indicación del guion vive en **`indicacion`**, no en `nota`: el bloque de
imagen ya usa `nota` para su pie de figura ("Nota. Elaboración propia (2026)."),
y cuando compartían campo un `<Figura>` del guion terminaba **publicado** como
pie de la imagen. Y los renglones que siguen a una figura se reconocen: el que
empieza con "Figura N." se vuelve su encabezado y el que empieza con "Nota." su
pie, en vez de quedar como dos párrafos sueltos debajo de la imagen.

### El contenido de un apartado va DENTRO del apartado

En la tabla **Pestaña | Contenido**, la celda de cada apartado no trae solo
texto: trae **tablas anidadas** —el grupo de botones del apartado 2, la tabla de
imágenes del 3— intercaladas entre sus párrafos. `assets/docx.js` entrega esa
celda con dos vistas: `lineas` (el texto aplanado, como siempre) y **`contenido`**,
que conserva el orden real con sus tablas anidadas incluidas.

`bloquesDeCelda()` recorre `contenido` y monta cada tabla anidada **en su lugar
exacto** dentro del apartado. Leyendo solo el texto aplanado pasaban dos cosas a
la vez: el apartado quedaba con el grupo de botones **vacío** (el que salía de la
marca `<Crear un grupo de 5 botones…>`) y el grupo de verdad reaparecía al final
de la página como bloque hermano del acordeón, junto con todo lo demás. Con el
apartado vacío, abrirlo no mostraba nada — de ahí la impresión de que "el
acordeón no abre".

Dos detalles del mecanismo:

- Las marcas que **anuncian** una tabla (`<Tabla>`, `<Crear un grupo de N
  botones…>`) esperan: si abajo viene la tabla de verdad, esa es; si no llega,
  entonces sí queda el bloque vacío con su nota. Sin esa espera salían las dos.
- Una tabla montada dentro de un apartado se marca como consumida para que el
  recorrido de primer nivel no la repita. Funciona porque `docx.js` cachea por
  nodo y entrega **el mismo objeto** en la celda y en la lista plana.
- Los párrafos de `contenido` se leen con `{ saltos: true }`, así que los saltos
  de línea manuales del Word (`w:br`) llegan como `\n` y salen como `<br>`: en la
  celda de una ventana emergente, "Periodo: …" y "Descubrimientos:" son dos
  renglones del mismo párrafo y sin eso salían pegados en una sola frase. La
  opción está apagada por omisión en `docx.js` porque el Integrador HTML parte sus
  listas por renglón (ver README raíz §5).

Y una limitación conocida: la tabla de imágenes (`<Figura>` en cada celda) se
convierte en tabla con esa columna **vacía**, porque el bloque Tabla no admite
imágenes en las celdas. El montaje real sí las lleva; hay que ponerlas a mano.

Dos cosas más del formato real de estos guiones:

- La tabla **Pestaña | Contenido** es el acordeón del recurso, y la tabla
  **Botón | Información** es el grupo de tarjetas con sus ventanas. El asistente
  las reconoce por esos encabezados.
- Word entrega el texto de una tabla anidada **dos veces**: una dentro de
  `filas` de la tabla que la contiene y otra como párrafos sueltos. Por eso
  `assets/docx.js` marca esos párrafos con `dentroDeTabla` y el importador los
  salta; sin eso la página salía duplicada entera.

## Sugerencia automática del asistente

No adivina fino a propósito; acierta lo común y lo demás lo corriges de un clic:

| Tabla del Word | Sugerencia |
|---|---|
| 1 columna | Texto |
| 2 columnas, alguna celda de más de 120 caracteres **y todas las filas con título** | Acordeón (concepto → explicación) |
| Lo demás | Tabla |

El requisito del título no es adorno: la tabla de "los alquimistas" tiene la 1ª
columna llena de marcas `<Figura>`, y al quitarlas quedaba un acordeón de
apartados sin nombre. Si no hay con qué titular, es una tabla.

En acordeón y tarjetas, la **primera columna titula** y el resto de la fila se
vuelve el contenido de ese apartado.

## Texto sin HTML

En cualquier campo de texto, la barrita inserta las marcas:

| Marca | Resultado |
|---|---|
| `**texto**` | negritas |
| `*texto*` | cursivas |
| `==texto==` | resaltado (`mark.bg-resalte-20`) |
| `[texto](url)` | enlace con `target="_blank"` y `nomediaplugin` |
| `{{palabra\|Título\|Explicación}}` | la palabra se vuelve un botón que abre una ventana emergente |

El texto del usuario **se escapa** antes de aplicar marcas: un `<` o un `&`
pegados del Word no pueden inyectar etiquetas.

## Lo que produce (y por qué así)

**El markup está copiado de páginas reales ya montadas por el equipo**, no
deducido del CSS. Hay dos referencias cotejadas HTML contra HTML:

1. **"Historia de la ciencia y tecnología"** (recurso Página): título,
   instrucción, acordeón, tarjetas con ventana, modales y tablas.
2. **"Actividad de aprendizaje 1. Ciencia bajo el Sol"** (una Tarea): la forma de
   las actividades — caja de pasos, tabla dentro de un paso, sublista `type="a"`,
   nomenclatura centrada, y el envoltorio de los títulos de sección.

De la segunda salieron estas correcciones (la salida quedó nodo por nodo igual a
la página publicada, salvo el enlace a la rúbrica, que no existe en el Word):

| Pieza | Antes | Ahora (como se publica) |
|---|---|---|
| Título de sección | `.col-12 > .tituloUnidad > h2` | `.row.bloque > .tituloUnidad.mt-4 > h2.text-primary` |
| Bajo el título de la página | nada | un `<hr>` pelado |
| Envoltorio de tabla | `.mt-4 > .col-md-8.mx-auto` | `.mt-3 > .col-10.mx-auto` |
| Encabezado de tabla | `.card-header.notas-tabla` | banda `.container-fluid.bg-neutral-claro-50…` con `p.text-muted.my-2.text-center` |
| Clases de la tabla | `table table-bordered border-neutral` | `table table-bordered` (+ `tabla-responsive-cards`) |
| `indicador-scroll` | solo sin modo tarjetas | **siempre**: solo se ve entre 576 y 768px, justo donde la tabla se desborda y las tarjetas no han entrado |

> La página de referencia colorea la 1ª columna alternando, pero en dos filas usa
> `bg-primary opacity-10` en vez de `bg-primary-10`. Eso es un desliz del montaje
> a mano (`opacity-10` apaga también el texto): la herramienta alterna siempre
> `bg-primary-10` / `bg-secondary-10`, como el Convertidor de Tablas.

Y de la primera, dos suposiciones que parecían razonables leyendo solo la hoja
del tema y eran falsas:

- Las ventanas emergentes son **modales de Bootstrap**
  (`data-bs-toggle="modal"` + `.modal.fade` + `.modal-dialog.modal-lg`), **no**
  el `<details>` de `.details-modal`. Ese `.details-modal` de la hoja lo usan
  los micrositios, no el montaje.
- Los botones del acordeón llevan **`bg-neutral-claro-50 text-primary`**: por
  eso se ven gris claro con el texto del color del aula. Sin esas dos clases
  salen con el azul por omisión de Bootstrap, que no es lo que se publica.

Todo cuelga de `<div class="container-fluid mainPlantilla23 {paleta}">`.

| Pieza | Markup |
|---|---|
| Título | `.row.bloque > .col-12 > .tituloUnidad > h1.text-primary` (el de sección, `.row.bloque > .tituloUnidad.mt-4 > h2`) |
| Instrucción | `.instrucciones.d-flex.bg-resalte-10` con `.icono-instruccion.bg-resalte-30` e imagen de 26px |
| Texto | `.row.bloque > .col-12 > p`; la pregunta que abre un apartado va en `.my-2.text-center` con `<strong>`; el centrado sin negritas es `p.text-center` |
| Pasos | `.col-12 > .card-body.col-sm-12.p-4.bg-primary-10.rounded-2 > .card-text > ol.estiloLista`, y el contenido de cada paso **dentro del `<li>`** |
| Imagen con texto | `.row.bloque.mt-3.align-items-center` con `.col-8` + `.col-4.col-md-3` |
| Figura con pie | `.card-deck > .card.img-contenedor` con `.card-header.notas-tabla.text-muted` |
| Acordeón | `.accordion.mt-3 > .accordion-item` con el botón `bg-neutral-claro-50 text-primary` |
| Tarjetas | `.card-group > .card` con botón `btn-secondary btn-sm rounded-4 border-4 border-secondary-10 flecha_btn` |
| Ventana | `.modal.fade > .modal-dialog.modal-lg` con `.btn-close` y `data-bs-dismiss` |
| Tabla | `.table.table-bordered` dentro de `.table-responsive`, en `.row.bloque.mt-3 > .col-10.mx-auto` |

Dentro de un `<li>` los hijos se generan **en modo desnudo**
(`htmlDeBloques(hijos, n, true)`): la sublista y los párrafos van pelados —un
`.row.bloque > .col-12` ahí rompe la lista— y la tabla, en cambio, sí conserva su
rejilla, exactamente como en la página publicada.

Dos detalles que no son cosméticos:

- **Los modales se sueltan después del bloque que los dispara**, nunca dentro
  del párrafo o de la tarjeta. Bootstrap los posiciona fijos y TinyMCE reacomoda
  lo que esté mal anidado; la página de referencia hace lo mismo.
- **Tablas**: mismo contrato que el Convertidor de Tablas
  (`tabla-responsive-cards` + `data-label` por celda) cuando se pide el modo
  tarjetas. Si se apaga, se agrega el aviso `indicador-scroll` de la página
  real. El CSS que las vuelve tarjetas vive en Moodle, no aquí.
- **Colores**: siempre por clase (`bg-primary-20`, `bg-resalte-10`…). Un hex
  aquí sería el bug del `#d8a7b6` otra vez.

## Vista previa

Va en un `<iframe sandbox>` con dos hojas:

1. `vista-previa.js` — subconjunto de Bootstrap. La hoja del tema **solo
   retoca** Bootstrap, da por hecho que Moodle ya lo cargó; sin este subconjunto
   la rejilla, el acordeón y las pestañas saldrían apiladas y la previa
   mentiría. Cubre solo las clases que genera `componentes.js`: si agregas un
   componente con clases nuevas, agrégalas ahí.
2. `hoja-moodle-default.js` — la hoja real del tema, **reutilizada de
   Micrositio a Página**. No se duplica a propósito: así fue como el hex
   `#d8a7b6` sobrevivió meses en una copia ya corregida en la otra.

El iframe va en sandbox sin `allow-same-origin` para que ese CSS ajeno no pueda
tocar el panel, y con un script propio mínimo que abre acordeones y pestañas
(en Moodle eso lo mueve el Bootstrap de la plataforma).

## Pendiente de validar en producción

Lo que sí está cotejado contra la página real: título, caja de instrucción,
acordeón, tarjetas con ventana, modales y tablas. Lo que **no** aparece en esa
referencia y sigue armado desde el CSS del tema:

1. **Pestañas** (`nav-tabs`) — no se usan en el recurso de referencia.
2. **Aviso / recuadro** (`alert`, `enmarcado`).
3. **Video** en `ratio-16x9`.

Además, el icono de la caja de instrucción se referencia como
`@@PLUGINFILE@@/clic.png` (el nombre que usa el montaje real). Si en tu recurso
se llama distinto, cámbialo en el bloque.

Cuando montes la primera página hecha con la herramienta, vale cotejar esos tres
y ajustar aquí: es una sola función por componente en `componentes.js`.

## Pruebas mínimas

1. Con un guion con imágenes: el bloque de figura debe ofrecer *Elegir del
   guion*, la previa debe enseñar la imagen elegida y *Antes de subir* debe
   ofrecer el .zip. Tras tocar `assets/zip.js`, probar también la descarga de
   imágenes de **Micrositio a Página**: usa el mismo escritor.
2. Sin subir nada: *Empezar de cero* → plantilla *Página con acordeón* debe
   dejar la caja de instrucción y tres apartados con su pregunta destacada; la
   franja **+** entre dos bloques debe insertar justo ahí.
3. Importar un guion con fichas arriba: debe empezar en el título y reportar
   cuántos elementos se saltaron.
3. bis. **Una actividad de aprendizaje** (guion con `<Lista numerada; son las
   instrucciones>`): debe quedar UN bloque *Pasos* con todos los puntos, la tabla
   **dentro** del paso que la menciona (y una sola tabla, no la vacía de la marca
   más la real), la sublista *a, b, c* dentro de su paso, la nomenclatura
   centrada dentro del suyo, y el párrafo sin sangría del final —el "Nota:…"—
   **fuera** de la caja. Es la prueba de la sangría: si se rompe, ese párrafo se
   mete en el último paso.
4. Una tabla de 2 columnas con celdas largas: el asistente debe sugerir
   Acordeón, y al aceptar debe quedar un acordeón con la 1ª columna de títulos.
4. bis. **Un recurso con pestañas** (guion con la tabla `Pestaña | Contenido` y
   tablas anidadas dentro de las celdas): en el lienzo la raíz debe quedar en tres
   bloques —instrucción, acordeón, título— y **nada más**; el grupo de tarjetas y
   la tabla deben estar DENTRO de su apartado, cada uno en su lugar. En la previa,
   el apartado debe abrir al hacer clic (y seguir abierto), y el botón de una
   tarjeta debe abrir su ventana. Si en la raíz aparecen "Tarjetas", "Imagen" o
   "Texto" sueltos después del acordeón, se rompió `bloquesDeCelda`.
5. Escribir `{{palabra|Título|Texto}}` y confirmar en el HTML que el párrafo
   salió como `div` y el tooltip como `<details>`.
6. Vista previa en **celular**: la tabla debe volverse tarjetas y cada celda
   mostrar su encabezado (viene del `data-label`).
7. Cambiar la paleta del aula: el color del acordeón abierto debe cambiar en la
   previa sin regenerar nada.
8. Con la ventana a 1366×700, el panel no debe scrollear ni recortar tarjetas.
9. En celular (≈390px de ancho): la pantalla de inicio no debe encimarse con la
   paleta, y en un bloque anidado la cabecera y la ruta de la imagen deben
   caber. Ojo con `.lienzo`: con las columnas apiladas va `flex: none`, porque
   con `flex: 1 1 240px` se queda en 240px y —al tener `overflow: visible`—
   **pinta su contenido encima** de lo que sigue.
