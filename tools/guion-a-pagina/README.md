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

**B. De cero.** Seis plantillas de arranque (presentación de semana, actividad
con pasos, con acordeón, con tarjetas, con tabla, o en blanco) para no
enfrentarse a una hoja vacía. A partir de ahí es el
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

### El espacio en blanco del archivo NO son saltos de línea

`aMarcas()` colapsa cualquier racha de espacios de los nodos de texto
(`\s+` → un espacio), igual que hace el navegador. Sin eso, el HTML **formateado**
—el que viene con sangría y renglones cortados, que es como sale del editor—
entrega esos saltos como `
`, y `parrafos()` los publica como `<br>` de verdad:
el texto sale cortado exactamente donde el archivo tenía sus renglones.

Se reportó como *"el texto lo acomoda diferente"* y costó encontrarlo porque el
párrafo se ve a todo lo ancho; lo que cambia es dónde corta. Los `<br>` de verdad
sí se conservan: esos vienen del elemento, no del espacio en blanco.

## Traer una página de Moodle de vuelta

El área de la pestaña **HTML** dejó de ser de solo lectura: se puede pegar ahí
una página ya montada y traerla a bloques editables. Vive en
`importar-html.js`, que es el camino inverso de `componentes.js`.

**La regla que lo hace seguro: lo que no se reconoce NO se tira.** Entra como
bloque `crudo` y se vuelve a publicar idéntico. Sin esa red, importar sería
apostar a que el lector entienda el 100% del markup, y lo que fallara
desaparecería sin avisar. Con ella, el peor caso es *"esto no se puede editar por
piezas"*, nunca *"esto se perdió"*.

Por lo mismo el lector es **deliberadamente desconfiado**: solo reclama un nodo
cuando puede reconstruirlo igual. El lector de texto, por ejemplo, exige que la
columna traiga **solo** `<p>`; con cualquier otra cosa dentro se va a crudo. Ante
la duda, crudo.

| Reconoce | Va a `crudo` |
|---|---|
| Título (h1/h2), texto, instrucción, tabla (con su banda), acordeón con sus hijos, video de YouTube, aviso, separador | Todo lo demás |

Además saca la **paleta del aula** de la clase del contenedor y el **título de la
página** del primer `h1`, quitando el `<hr>` que lo sigue: si no, al reimportar
saldrían duplicados.

Dos detalles del mecanismo:

- **Un lector que truene no tumba la importación.** Cada uno va en su `try`; el
  nodo que falle se va como crudo y lo demás sigue. Una página rara no puede
  dejar al usuario sin nada.
- **`guardarHistorial()` antes de pisar.** Traer reemplaza lo que haya armado;
  es lo que hace que un pegado por equivocación no cueste el trabajo de la tarde.

### La prueba que importa es la ida y vuelta

Generar una página, pegarla de vuelta y comprobar que el HTML sale **idéntico**.
Ya está verificada con título, instrucción, tabla, acordeón y separador: mismos
2 440 caracteres, cero bloques crudos. Si algún día se toca el generador o el
lector, esa es la prueba que hay que repetir.

> El bloque `crudo` es el único que **no escapa** su contenido ni pasa por
> `marcas()`: es HTML de verdad, puesto a propósito. Por eso no se ofrece como
> primera opción — lo demás conviene hacerlo con bloques, que sí se editan.

## El lienzo es un índice, no un formulario

Los campos de un bloque **no** se editan en el lienzo: se editan en el **panel**
que entra sobre él (`#panel-bloque`). El lienzo enseña la estructura —qué cuelga
de qué apartado, qué va dentro de qué columna, con los hijos indentados— y el
panel enseña un bloque a la vez.

Las dos cosas juntas no cabían: con un guion de 20 bloques y todos los campos
desplegados, el lienzo era un muro de cajas donde no se distinguía la página, que
es justo lo que hay que ver para maquetar.

Cómo se reparte:

| Va en el lienzo | Va en el panel |
|---|---|
| Nombre y resumen del bloque | Los campos escalares (texto, opciones, casillas) |
| Los **bloques hijos**, indentados | Los apartados de un repetible (título, imagen…) y **cuántos** bloques lleva cada uno |
| Reordenar, duplicar, borrar | — |

Tres cosas que conviene no deshacer:

- **`dibujarTodo()` redibuja el panel; `dibujarLienzo()` no.** Un clic que solo
  pliega hijos no debe arrancarle el foco al campo que se está escribiendo.
- **El resumen del renglón se actualiza sin redibujar** (`refrescarResumen()`):
  redibujar el lienzo en cada tecla mataba el foco del campo.
- **Los hijos no se dibujan en los dos lados.** El `repetible` con `hijos` ya no
  monta su `lienzoHijo` en el panel; deja solo la cuenta. Tenerlos en ambos era
  el enredo que este rediseño vino a quitar.

> ⚠️ La clase `.ficha` **ya estaba tomada** por los apartados de un repetible.
> El panel nuevo usa `.panel-bloque`: al reusar `.ficha` le entraba
> `position: absolute; inset: 0` a cada apartado y se apilaban encima. Es el
> mismo choque de nombres que el `nota`/`tipo`; antes de reusar una clase,
> búscala.

### El panel cubre la COLUMNA, no el lienzo

`#panel-bloque` cuelga de `.editor-panel`, no de `.lienzo-viewport`. Metido
dentro del viewport se quedaba con el alto de este: **102px en una laptop, para
500px de campos**. Todo caía bajo el pliegue y con un bloque Columnas el botón
de agregar contenido no se encontraba nunca — se veía "Sin contenido todavía" y
ninguna salida. Colgado de la columna son 464px.

El panel trae su propio encabezado con volver y *Listo*, así que taparlo todo no
deja a nadie sin salida.

> Al probar esto **no basta con que el botón exista en el DOM**. Hay que medir
> que se vea y que se pueda tocar: `getComputedStyle().opacity`, el tamaño real,
> y que `document.elementFromPoint()` en su centro devuelva el propio botón. Las
> dos veces que esto se dio por bueno sin medirlo, el botón estaba ahí y era
> inalcanzable — una vez con `opacity: 0`, otra fuera del área visible.

### Desde el panel se puede agregar contenido

Cada columna, apartado o ventana enseña en el panel **qué lleva dentro** (chips
que saltan a ese bloque) y una franja **+** para agregar uno más ahí mismo. Lo
dibuja `resumenDeHijos()`, compartida por los dos sitios donde cuelga contenido
—el campo `hijos` suelto y cada apartado de un repetible—.

Esa franja se pide con `barraInsertar(lista, pos, true)`: la variante **visible y
con etiqueta**. La de entre bloques del índice vive con `opacity: 0` hasta el
hover, y ahí está bien —si no habría una franja gritando entre cada par—, pero
dentro del panel es la única puerta para llenar una columna vacía, y escondida
era exactamente lo mismo que no existir.

Antes solo decía *"agrégalo desde el índice"*: un callejón sin salida. Estás
parado en el panel, te manda a otro lado, y con una columna vacía ni siquiera
había nada visible a donde ir. El orden sigue estando en el índice, que es donde
se entiende la estructura; lo que se recuperó es poder **empezar** desde donde
estás.

### La franja "+" va también antes del primero

`dibujarLista()` abre con `barraInsertar(lista, 0)`. Sin eso había dos callejones
sin salida: meter algo al principio de la página, y llenar un **apartado vacío**
del acordeón —ahí no hay ningún bloque debajo del cual insertar, así que la lista
no tenía manera de crecer—.

### Arrastrar: un solo mecanismo para tres cosas

Hay tres arrastres y **los tres terminan en las mismas dos funciones**
(`destinoDeSoltar()` para saber dónde cae, `moverBloqueA()` para moverlo).
Separados acabarían haciendo cosas distintas, que es justo lo que ya pasó con
`accionDeBloque`.

| Se arrastra | Desde | Qué hace |
|---|---|---|
| Una pieza de la paleta | `.pieza` | Crea el bloque donde se suelte y le abre el panel |
| Un bloque del índice | el asa `.arrastre` de su renglón | Lo mueve, **incluso a otro nivel** |
| Un bloque de la vista previa | el asa `.previa-asa` de la barra flotante | Lo mismo, sin bajar la vista al índice |

Lo que se está arrastrando vive en `piezaArrastrada` / `bloqueArrastrado`, no en
el `dataTransfer`: durante el `dragover` no todos los navegadores dejan leerlo.

> ⚠️ **Al empezar a arrastrar una pieza se cierra el panel de campos.** No es
> un adorno: el panel va `position: absolute; inset: 0` **sobre** el lienzo, así
> que mientras está abierto tapa la única zona que acepta el soltar — se
> arrastraba y solo salía el cursor de prohibido. Y como agregar un bloque abre
> su panel, estaba abierto casi siempre, o sea que el arrastre desde la paleta
> no servía prácticamente nunca. Empezar a arrastrar es decir "quiero colocar
> algo", así que dejar el índice a la vista es además lo que uno quiere ver.

**Entre niveles.** Un bloque puede entrar a un apartado del acordeón o a una
columna, y salirse. Antes no se podía *por diseño*: el arrastre viejo escuchaba
por contenedor y descartaba todo lo que no fuera hermano
(`origen.parentElement !== contenedor`). Ahora lo atiende un solo par de
manejadores en `#lienzo`.

> ⚠️ **`sePuedeSoltar()` no es opcional.** Sin él se puede soltar un acordeón
> dentro de uno de sus propios apartados: el bloque se desprende del árbol y se
> pierde con todo lo que lleva dentro. El destino prohibido ni siquiera pinta la
> raya y el `dragover` no hace `preventDefault()`, así que el cursor enseña "no
> se puede" **antes** de soltar, no después.

**En la previa el bloque NO es draggable, y es a propósito.** Su contenido ya
reacciona al clic (acordeones, pestañas, ventanas) y hacerlo arrastrable deja
cada clic peleado entre abrir y mover. Quien arrastra es el **asa** de la barra
flotante —las seis puntitas—, que no compite con nada, igual que la `.arrastre`
del índice. Al empezar a arrastrar la barra se esconde: si no, se queda flotando
sobre el bloque que ya se movió.

Y un detalle del índice que se rompe fácil: el `dragstart` del renglón lleva
`stopPropagation()`. Sin él, arrastrar un hijo arranca también el arrastre del
padre y se mueve el acordeón entero en vez del bloque que se tomó.

## El campo `tipo` que mataba la herramienta

El bloque Aviso declaraba un campo llamado **`tipo`** para su tono. Como
`crearBloque()` hacía `Object.assign({ id, tipo, abierto }, comp.nuevo())`, ese
campo **se llevaba el `tipo` del bloque**: nacía como `tipo: 'info'`, que no es
ningún componente, y `tarjetaDeBloque()` lanzaba al dibujarlo. A partir de ese
clic el lienzo no se podía redibujar y la herramienta se quedaba muerta — sin
poder siquiera borrar el bloque culpable, porque su papelera se dibuja ahí.

Tres arreglos, porque uno solo no bastaba:

1. El campo se llama **`tono`** (con respaldo al nombre viejo al generar, para
   las páginas ya guardadas).
2. **`crearBloque()` escribe la identidad al final**, no al principio: ningún
   componente puede volver a llevarse `id`, `tipo` ni `abierto`.
3. **`revisarNombresDeCampo()`** grita en consola al arrancar si algún componente
   usa un nombre reservado, y **un bloque de tipo desconocido ya no tumba el
   lienzo**: sale una tarjeta roja con su botón de borrar y el resto sigue vivo.

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

   > La conducta vive en `assets/reparto.js`, **compartida con el Integrador
   > HTML**. Aquí solo quedan los mínimos de esta herramienta y la medida en px.
   > Los estilos del divisor y de la barra de la previa están en `shared.css`.
4. **El botón ⤢ le da a la previa el área completa** (Esc para volver) y junto a
   la barra se escribe **el ancho real en px**, que es lo que evita creer que se
   está viendo un escritorio cuando no.
5. **Y el ⤢ del encabezado del editor hace lo mismo al revés.** Los dos son
   excluyentes y el mismo Esc cierra el que esté abierto. No es solo ancho: con
   el panel entero la paleta del pie pasa de tres renglones a uno (la rejilla es
   `auto-fill`) y ese alto se lo queda el lienzo. En 1536×864 el lienzo pasa de
   **231px a 339px**, y con la paleta plegada a **420px**.

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

## Alinear los botones

Botón, Ventana emergente y Tarjetas tienen un campo **Alineación**
(izquierda · centro · derecha). Sale de `CAMPO_ALINEACION` y de la tabla
`ALINEACION` de `componentes.js`, que traduce a clases de Bootstrap: nadie
escribe `text-start` a mano en un componente.

Dos cosas que costaron y conviene no deshacer:

- **La fila y el texto se alinean juntos.** Con solo `justify-content-*`, un
  botón "a la derecha" se quedaba centrado dentro de una columna pegada a la
  derecha. Van los dos: `justify-content-end` en el `.row` y `text-end` en la
  columna.
- **En Tarjetas el `mx-auto` del montaje real no centraba nada.** Centra la
  *caja* (`.card-body`), no lo que lleva dentro, y como la caja ya ocupa el ancho
  de la tarjeta no movía un píxel: los botones quedaban pegados a la izquierda y
  la fila se veía despareja. Se le suma la clase de texto y se deja el `mx-auto`,
  que sí viene de la página publicada.

> Las tres clases (`text-start`, `text-end`, `justify-content-start/end`) están
> también en `CSS_VISTA_PREVIA`. Si faltaran, la previa enseñaría todo centrado y
> mentiría justo en lo que se acaba de elegir.

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

### La barra flotante de la previa

Al pasar el mouse por un bloque de la previa aparece, en su esquina de arriba a
la derecha, una barra con **subir · bajar · duplicar · quitar**: reordenar sin
bajar la vista al lienzo. Vive **dentro** del iframe (así scrollea con la página
sola, sin traducir coordenadas entre dos documentos) y se inyecta con JS después
de cargar, de modo que —igual que el `data-bq`— nunca forma parte del HTML que
se copia a Moodle.

Tres cosas que conviene no deshacer:

- **No es arrastre, y es a propósito.** El contenido de la previa ya reacciona
  al clic (acordeones, pestañas, ventanas); hacerlo `draggable` deja cada clic
  peleado entre abrir y mover. En el lienzo el arrastre sí existe porque ahí hay
  un asa (`.arrastre`) que no compite con nada.
- **Mover es siempre dentro de la lista de hermanos**, la que devuelve
  `buscar()`. Un bloque de un acordeón se reordena entre los de su apartado y no
  puede salirse sin querer.
- **Dentro de una ventana emergente la barra va `position: fixed`**
  (`.previa-barra--fija`). El `.modal` es fijo: sumarle el scroll de la página
  dejaba la barra a media pantalla del bloque.

Las cuatro acciones son las mismas del lienzo porque son literalmente la misma
función (`accionDeBloque`): separadas, subir desde un lado y desde el otro
acabarían haciendo cosas distintas.

> Reordenar **sí** regenera la previa (cambia el HTML), así que ahí no aplica la
> regla de arriba. Para que no se sienta, `refrescarSalida()` conserva el scroll
> del iframe, la barra vuelve sola sobre el bloque movido —tras recargar el
> mouse no se movió y no habrá `mouseover`— y `señalarEnPrevia()` solo desplaza
> cuando el bloque no se ve.

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

## La presentación de la semana

Es la página que abre cada semana y la más repetida de todas: a la izquierda el
antetítulo (*"Presentación de la Semana 1"*), el `h1` con su barra de color, una
línea y los párrafos; a la derecha el recuadro gris de *Contenidos de
aprendizaje*, con una palabra que abre la ventana de la **Tabla 1**.

Va como **un solo bloque** (`presentacion`), no como título + texto + tarjeta
sueltos, porque las dos columnas son del **mismo `.row.bloque`**: armadas por
separado, el recuadro cae debajo del texto en vez de a su lado, y esa era
justamente la parte que salía mal a mano. Markup copiado de la página publicada,
salvo los `style=` inline —redundantes: las clases ya ponen ese color—.

Tres cosas del bloque:

- **Trae su propio `h1`.** Si se usa, el campo *Título de la página* de la barra
  de arriba va vacío o la página sale con dos títulos. Lo dice la ayuda del campo.
- **El recuadro se apaga** con una casilla, para las presentaciones que no lo llevan.
- **La ventana de la Tabla 1 llega armada**, con las cinco columnas del formato
  (Semana · Nombre · Propósito formativo · Contenidos formativos · Contenido del
  ámbito socioemocional) y sus dos filas: es la misma tabla en todas las semanas
  y montarla desde cero era lo más tardado. Se edita en *Contenido de la ventana*
  y se dispara con la marca `{{Tabla 1|…}}` del texto del recuadro.

También es la primera plantilla de *Empezar de cero*.

> `modalBootstrap()` recibió una opción `ancha` para esta ventana:
> `modal-dialog-centered modal-xl`, `rounded-lg`, título en `h3` y `border-top`
> en el cuerpo, que es como la publica el equipo. Va como opción y no como
> cambio — las ventanas de las tarjetas y de los tooltips ya estaban cotejadas
> con `modal-lg` y no había por qué moverlas.

### Un interruptor que esconde campos vuelve a dibujar el lienzo

Los campos con `siOculta` se filtran **al dibujarlos**, así que un interruptor
que los gobierna tiene que llamar a `dibujarLienzo()` además de
`refrescarSalida()`. Sin eso, apagar *Recuadro de contenidos* quitaba la columna
de la página pero dejaba a la vista sus tres campos, que ya no aplicaban. El
mismo arreglo destapa el caso que ya existía en el bloque Texto (*centrado* está
gobernado por *destacado*).

Es `dibujarLienzo()`, nunca `dibujarTodo()`: la previa ya se regenera en
`refrescarSalida()`, y con `dibujarTodo()` se cerraría el acordeón que se acaba
de abrir (ver arriba).

## El envoltorio lleva el ancho escrito a mano

```html
<div class="container-fluid mainPlantilla23 MM pb-3" style="max-width: 100% !important;">
```

Ese `style` es **la única cosa inline que genera la herramienta**, y no se puede
quitar. La hoja de Moodle solo suelta el ancho del contenido cuando la página se
pinta como **descripción de actividad**:

```css
#page-content #region-main-box #region-main .activity-description .container-fluid,
#page-content #region-main-box #region-main .activity-description .mainPlantilla23 {
    max-width: none !important;
    width: 100% !important;
}
```

Abierta como **recurso Página** (`/mod/page/view.php`) esa regla no aplica —no hay
`.activity-description`—, Moodle le deja su contenedor angosto y la presentación
sale apretada. Por eso el montaje del equipo lo trae escrito a mano; la primera
versión de la herramienta no lo ponía y ese fue justamente el reporte: *"me salió
con márgenes muy reducidos"*.

No contradice la regla de los colores: eso es un **ancho**, no un color. Los
colores siguen saliendo todos por clase. Y arreglarlo desde la hoja no es opción
barata — habría que tocar una regla que afecta a todas las páginas ya publicadas.

### Y la tabla dentro de una ventana va a `col-12`

Suelta en la página, una tabla se publica en `.col-10.mx-auto`: ese margen le da
aire. Dentro de un `modal-xl` con cinco columnas, en cambio, ese mismo 10% de
cada lado deja las celdas partiendo cada palabra en un renglón. La página real
usa `col-12` ahí.

Lo resuelve `conAnchoCompleto()`, que se enciende solo mientras se arma el cuerpo
de una ventana ancha. Es un contexto, no un campo del bloque: la misma tabla
puede estar suelta o dentro de una ventana y no tiene por qué saberlo.

## Texto sin HTML

En cualquier campo de texto, la barrita inserta las marcas:

| Marca | Resultado |
|---|---|
| `**texto**` | negritas |
| `*texto*` | cursivas |
| `==texto==` | resaltado (`mark.bg-resalte-20`) |
| `==verde:texto==` | resaltado **por categoría** (`bg-marca-3`); también `morado`, `azul`, `naranja`, `rosa`, `gris` |
| `[texto](url)` | enlace con `target="_blank"` y `nomediaplugin` |
| `{{palabra\|Título\|Explicación}}` | la palabra queda resaltada y abre una ventana con ese texto |
| `{{palabra\|Título}}` | igual, pero la ventana se llena con **bloques** (así entra una tabla) |

### Y no se teclea: se llena un formulario

La marca `{{palabra|Título|Explicación}}` sigue existiendo y se puede escribir,
pero **el botón de la barrita ya no la inserta a medias**. Antes ponía
`{{palabra|Título|Explicación}}` y había que sustituir las dos palabras *dentro*
de las llaves — nadie que no conozca la sintaxis adivina eso, que es lo contrario
de lo que esta herramienta viene a hacer.

Ahora abre un formulario de tres campos, pegado a la barrita y no en un modal
(es un apunte corto, y un modal taparía el texto sobre el que se trabaja). Lo
que traigas seleccionado en el campo llena **la palabra y el título**, que en el
caso común son lo mismo: solo queda escribir la explicación.

Dejar la explicación vacía produce la marca de **dos segmentos**, que es la que
llena la ventana con bloques (así entra una tabla). Está dicho en el propio
formulario, donde se necesita saber.

> Valida antes de insertar: sin palabra no hace nada, y `|`, `{` y `}` se
> rechazan con su mensaje — son la sintaxis de la marca, y colarlos partiría el
> texto en pedazos que no son los que se quisieron.

### Las ventanas puestas se ven bajo el campo

En un `textarea` no se puede pintar la palabra de amarillo —es texto plano—, así
que debajo se listan como chips las ventanas que ese texto ya tiene, con su
explicación en el `title`. Es la única forma de ver de un vistazo cuáles llevan
ventana sin ponerse a leer llaves.

> Ojo al tocarlo: asignar `area.value` por código **no** dispara `input`, así que
> tras insertar desde el formulario hay que llamar a `pintarLista()` a mano.

### La palabra que abre la ventana NO es un botón

Cotejado contra dos páginas publicadas —la "Presentación Semana 1" y el recurso
de licencias libres—, el disparador es la **palabra resaltada** con el iconito
de interactividad:

```html
<a class="text-decoration-none" type="button" data-bs-toggle="modal" data-bs-target="#id">
  <mark class="bg-resalte-30 border-0"><strong class="interactivo">licencias libres</strong></mark>
</a>
```

La primera versión emitía un `<button class="btn btn-sm text-tooltip …">`, que
era deducido del CSS y no existe en ningún montaje: salía como un botón de
Bootstrap a media frase. El iconito lo pinta el `::after` de `.interactivo` de la
hoja del tema, y el color sale de `bg-resalte-30` — la página de referencia
además lo repite inline (`background-color: rgb(231, 210, 149)`), que es el hex
de `--prepa-resalteMM-30` escrito a mano. Aquí no: la clase ya lo pone con
`!important` y así sigue a la paleta del aula.

> Las dos páginas de referencia no coinciden entre ellas —una usa
> `bg-resalte-10` y la otra `bg-resalte-30`—. Se unificó en `bg-resalte-30`, que
> es el de la página más reciente y el que de verdad se lee como resaltado.

**Sin el tercer segmento** la ventana no se llena con texto sino con los bloques
del campo *Contenido de la ventana* del bloque que la contiene. Es lo que
permite meter una tabla ahí (la "Tabla 1" de la presentación), que en una línea
de texto no cabía. El contexto lo enciende `conVentanaDeBloques()` alrededor del
`marcas()` del componente, y el closure de la cola se queda con los bloques en
ese momento: la cola de modales se vacía más tarde, cuando el contexto ya se
apagó.

> Por eso `vaciarModales()` **vacía la cola antes de armar el HTML, no después**.
> Una ventana hecha de bloques vuelve a entrar a `htmlDeBloques()` mientras se
> arma, y con el reseteo al final ese reingreso encontraba la misma cola llena y
> se quedaba dando vueltas.

El texto del usuario **se escapa** antes de aplicar marcas: un `<` o un `&`
pegados del Word no pueden inyectar etiquetas.

## Los ajustes de página aparecen solo cuando aplican

Paleta, Título y Resaltado viven arriba, agrupados bajo **Ajustes de la página**
y plegables (se recuerda en `guion-ajustes-plegados`). Pero además **no siempre
están**: un control que no puede hacer nada no ocupa sitio. Lo decide
`avisarDeAjustes()` en cada refresco.

| Ajuste | Cuándo se ve |
|---|---|
| **Paleta del aula** | Siempre — toda página tiene una |
| **Resaltado** | Solo si la página ya tiene alguna palabra que abre ventana |
| **Título** | Siempre, **salvo** que haya un bloque Presentación y el campo esté vacío |

**El Resaltado** era el caso claro: sin una palabra con ventana, moverlo no
cambia nada visible, así que se leía como un botón muerto —y así se reportó, dos
veces—. Ahora aparece justo cuando se crea la primera, que es cuando empieza a
significar algo. Se cuenta con `class="interactivo"` sobre el HTML ya generado:
ni recorrer el árbol ni mantener otro contador.

**El Título no se puede esconder "hasta que haya título"**: es el único sitio
donde se escribe, así que no habría manera de poner el primero. Lo que sí sobra
es cuando la página lleva un bloque Presentación, que trae el suyo. De ahí los
tres casos, y el tercero es el que importa:

| Estado | Qué pasa |
|---|---|
| Sin Presentación | Se ve, normal |
| Presentación + campo vacío | Se esconde: no hay nada que hacer |
| Presentación + campo **con texto** | **Reaparece en rojo**: la página saldría con dos títulos |

> El tercero no es un descuido. Esconder el campo ahí ocultaría el problema en
> vez de resolverlo: el título seguiría publicándose y saldrían dos encabezados
> sin que nadie pudiera ver de dónde venía el segundo.

## El nivel del resaltado se elige (y va por página)

> El control son **botones**, no un `<select>`. Era el único desplegable de la
> herramienta y con el tema oscuro su popup nativo salía blanco: la página no
> declara `color-scheme`, así que los controles nativos se pintan con el tema
> claro del sistema. Con botones —el mismo patrón `.opciones` del resto de la
> herramienta— el problema no existe, y de paso se ve la intensidad de cada nivel.


La palabra que abre una ventana sale con `bg-resalte-10…40`, y cuál se usa lo
decide un selector arriba, junto al título. Por **página** y no por palabra a
propósito: en las dos páginas ya publicadas cada recurso usa un nivel y lo usa
parejo —la presentación el pálido, el de licencias libres el fuerte—. Mezclarlos
dentro de una misma página le quitaría el sentido, que es "esto se puede tocar".

El nivel vive en `pagina.resalte` y llega a `componentes.js` por
`resalteDeVentana()`, con el mismo patrón que `marcarBloques()`: estado del
módulo con setter, que se pone al empezar a generar.

> Ojo: si se agrega otro ajuste de página hay que sumarlo también a `deshacer()`
> y al `dibujarLienzo()` que repone el control. `pagina.resalte` se olvidaba al
> deshacer hasta que se agregó en los dos sitios.

## Los resaltes por categoría

`==verde:Is==` sale como `<mark class="bg-marca-3 border-0">`. **No es la escala
de `bg-resalte-10…40`**, y la diferencia importa:

| | `bg-resalte-10…40` | `bg-marca-1…6` |
|---|---|---|
| Qué dice | intensidad — "esto pesa más" | categoría — "esto es el verbo" |
| Cuántos por renglón | uno | hasta cuatro |
| ¿Sigue la paleta del aula? | sí | **no, a propósito** |

Lo último es lo que cuesta aceptar y no hay que deshacer: si siguieran la
paleta, el mismo ejercicio de gramática tendría un código de colores distinto en
M01 que en M02, y el alumno que lleva dos módulos perdería la referencia. Son de
los poquísimos colores del sistema que **no** salen de `--primary-*`.

Antes esto se escribía a mano en las plantillas
(`style="background-color:#cee4da"`), que es lo que la marca viene a sustituir.

> Las clases viven en la hoja de Moodle. El bloque listo para pegar está en
> `work/marcas-categoria.scss`, con los seis hex sacados de las plantillas
> 01S.05 sin cambiarles nada —para que lo ya montado se vea igual al migrarlo—.
> Mientras no estén en la hoja, la previa las trae en su subconjunto; cuando
> estén, la hoja real gana por orden de carga y quedan sincronizadas solas.

### La banda de la tabla

El renglón que cruza todas las columnas ("Contenido de Aprendizaje 1") es el
campo **`banda`**: vacío no sale nada, con texto sale un `<tr>` con un solo
`<th colspan="N">`, tal cual el montaje. Lleva el color **siempre**, sin
depender de la casilla *Encabezado con el color del aula*: en la página
publicada la banda se ve de color y los títulos de columna no.

La tabla que trae armada el bloque Presentación viene con su banda puesta,
porque en ese montaje siempre la lleva.

## Piezas de las plantillas 01S.05

Cuatro bloques salidos del cotejo con las plantillas que entregó el equipo de
sitios. Todos con markup copiado, no deducido:

| Bloque | Sale de | Detalle que no es obvio |
|---|---|---|
| **Caja de color** (`envolvente`) | *Bloque de texto con envolvente* | Con título y sin título son **markup distinto**, no una variante: con título es `.card` + `.card-header`; sin título es un `.card-body` centrado y más angosto (`col-lg-8`). Por eso el título vacío cambia el envoltorio. |
| **Columnas** (`columnas`) | *Bloque con contenido de N* | Cada N trae **su** cadena de clases (tabla `REJILLA`), copiada tal cual. No es `12/N` calculado: el de 6 y el de 12 comparten los cortes de tableta (`col-sm-6 col-md-4`) y solo se separan en `lg`. |
| **Completar** (`escribir`) | *Text areas* | Los `___` del texto se vuelven el `textarea.recuadro__input`. Se sustituyen **después** de aplicar marcas: antes, el escapado los habría impreso como texto. Es la única pieza interactiva de las plantillas que no necesita JavaScript. |
| **Conversación** (`conversacion`) | *Conversaciones* | Tarjeta punteada con los parlamentos e imagen al lado. El borde sale de `borde-punteado`, no del `style="border-style: dashed"` de la plantilla. **El audio no lo pone la herramienta**: se inserta desde el editor de Moodle, que ya lo hace bien, y por eso la columna de al lado queda libre para recibirlo. |
| **Video a 2 columnas** | *Texto + video a 2 columnas* | Es una **opción del bloque Video**, no un bloque nuevo: si el campo *Texto al lado* trae algo, se reparte en dos mitades; vacío, sale el video centrado de siempre. |

Y una corrección sobre la plantilla: ahí el video a dos columnas usa
`align-items-middle`, que **no existe en Bootstrap**. Aquí va
`align-items-center`, que es la que sí alinea.

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
| Presentación | un `.row.bloque` con `.col-12.col-lg-8` (antetítulo `h5` + `h1` + `<hr>` + párrafos) y `.col-lg-4.d-flex.align-items-center` (banda `.card-header.bg-primary-10` + `.card-text.bg-neutral-claro-50`) |
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

### El encabezado de la tabla no se pinta (y la previa tampoco debe pintarlo)

El montaje real pone el color en el `<thead class="thead bg-primary-20">`, pero
**en Moodle ese color no se ve**: Bootstrap pinta el fondo en *cada celda*
(`.table > :not(caption) > * > *`), y las celdas tapan lo que traiga el `<thead>`
o el `<tr>`. Cotejado contra una actividad ya publicada: ahí el encabezado sale
blanco.

Esa regla faltaba en el subconjunto de `vista-previa.js`, así que la previa
enseñaba el encabezado del color de la paleta y **mentía**. Ya está puesta.

> Un color puesto en la **celda** sí se ve en los dos lados: la hoja del tema
> declara `.bg-primary-10` y compañía con `!important`, y por eso la opción
> *colorear la primera columna* (que va en los `<td>`) sigue pintando.

Para que el encabezado **sí** salga de color hay que repetir la clase en los
`<th>`. Eso va como opción del bloque Tabla, **apagada por omisión**
(`encabezadoColor`): así una tabla nueva sale igual que las ya publicadas y
quien la quiera de color la enciende, tabla por tabla.

El `bg-primary-20` del `<thead>` se queda de todas formas: viene del montaje real
y quitarlo separaría el HTML de la referencia sin ganar nada.

> El color **no se escribe**: sale de `--primary-20`, así que sigue a la paleta
> del aula sola. Con `reg` da `#a6beb9` y con `MM` da `#d8a7b6` —el mismo hex que
> ya nos costó meses cuando estaba duplicado a mano en dos herramientas—.

El iframe va en sandbox **con** `allow-same-origin` —lo necesitan las imágenes
del Word (son `blob:` del documento padre) y la sincronía con el lienzo—, y con
un script propio mínimo que abre acordeones y pestañas (en Moodle eso lo mueve
el Bootstrap de la plataforma). Quien aísla al panel del CSS de Moodle es el
iframe en sí, no esa bandera: el documento de la previa es otro documento.

La hoja de la barra flotante (`CSS_BARRA_PREVIA`) va en un tercer `<style>`,
**después** de la del tema: si compartiera bloque con la primera, cualquier
regla de Moodle sobre `<button>` le ganaría por orden.

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
3. ter. **Presentación de semana** (plantilla del mismo nombre): en escritorio
   el título y el recuadro gris deben quedar **lado a lado** (8/4) y en celular
   apilados; la palabra *Tabla 1* debe salir resaltada con el iconito —no como
   botón— y abrir una ventana ancha con la tabla dentro. Si el recuadro cae
   debajo del título en escritorio, faltan `.col-lg-8`/`.col-lg-4` en
   `vista-previa.js`.
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
