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

### Los modales NO se tiran

Un `.modal` entra como bloque `crudo`. Antes se descartaba con un
`return null` y un comentario que decía que se recogía *"aparte, con el bloque
que lo dispara"* — **y ese aparte nunca se implementó**. Resultado: los botones
con ventana llegaban sin su ventana y en la herramienta no abrían nada. Como
`crudo` conserva el `id`, el botón vuelve a encontrarla.

Los únicos que sobran son los que ya viajan **dentro** de una marca `{{ }}`: si
además entraran como bloque, la página acabaría con la ventana dos veces. Se
apuntan en `modalesAbsorbidos` y se filtran **al final**, no antes: hasta que no
se recorrió la página no se sabe cuáles quedaron absorbidos, y el modal puede
venir escrito antes que el párrafo que lo dispara.

> Cuidado con los `return null` de `leerNodo()`: ahí es donde el contenido
> desaparece sin dejar rastro. Hoy solo queda uno —los modales absorbidos— y se
> resuelve por filtrado, con la lista a la vista.

### La palabra con ventana se reconstruye entera

`aMarcas()` reconoce el disparador (`a[data-bs-toggle="modal"]`), va a buscar su
modal por el `data-bs-target` y recompone la marca completa
`{{palabra|Título|Explicación}}`.

Sin eso caía a los casos genéricos y salía **`==**palabra**==`**: el resaltado se
conservaba y **la ventana se perdía en silencio**. Es el peor tipo de fallo —la
página se ve casi igual y el contenido ya no está—, y le pasaba a cualquier
página traída de Moodle.

Y si la ventana lleva **bloques** en vez de texto (una tabla), la marca no la
sabe llevar: `conVentanaCompleja()` lo detecta y manda el nodo entero a `crudo`,
antes que publicarlo a medias.

> Se descubrió preparando la edición directa sobre la vista previa. Esa función
> **no se agregó** —se descartó por el riesgo de romper estilos al convertir de
> vuelta lo que escriba el navegador—, pero el fallo que destapó era del
> importador y se quedó arreglado.

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

Armar una página con **los 21 bloques**, pegarla de vuelta y comprobar que no se
pierde nada. Es la única prueba que cubre los dos caminos a la vez —de cero a
Moodle y de Moodle a la herramienta— y la que hay que repetir al tocar el
generador o el lector.

Cómo se compara, porque el texto crudo **no** sale idéntico y eso es normal:

1. Se quitan **todos** los espacios: los bloques `crudo` re-indentan plano, así
   que la sangría cambia sin que cambie nada.
2. Se normalizan los **ids autogenerados** (`acordeon2` → `ACC`, `modal5` → `MOD`…):
   `reiniciarIds()` renumera según el orden, y un bloque que pasó a crudo corre
   la cuenta.

Con eso, el resultado tiene que ser **idéntico carácter por carácter**. Hoy lo es:
8 679 = 8 679, y una segunda vuelta da exactamente lo mismo (10 392 = 10 392), que
es lo que prueba que no degrada al repetir.

> Comparar solo el largo engaña: entre la primera y la segunda pasada bailan
> ~1 300 caracteres **de pura sangría**. Y comparar el primer carácter distinto
> engaña igual, porque casi siempre cae en un id renumerado. La comparación útil
> es contar marcadores estructurales (`accordion-item`, `modal fade`, `table`,
> `tab-pane`…) y exigir que ninguno cambie.

### Los lectores tienen que ser estrictos, no generosos

`leerTitulo()` pedía `:scope > .col-12 > .tituloUnidad > h1`. Parece razonable —
y se comía el bloque **Presentación** entero: `.col-12` también casa con
`.col-12.col-lg-8`, que es su columna izquierda, y ahí dentro hay un
`.tituloUnidad`. Reclamaba el nodo y devolvía un triste título, tirando el
antetítulo, los párrafos, el recuadro gris de la derecha y su tabla. **2 640
caracteres, sin avisar.**

Ahora exige que la fila traiga UNA sola columna, que esa columna no lleve nada
más, y que no haya antetítulo. Lo que no cumple se va a `crudo` y se publica
idéntico.

> La regla general: un lector que reclama un nodo se queda con **todo** el
> subárbol. Si no puede reconstruirlo entero, no debe reclamarlo. Un selector de
> más cuesta contenido perdido; uno de menos solo cuesta que ese trozo no se
> pueda editar por piezas.

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

## Un respaldo de `var()` es un color hardcodeado

Todo lo que se agregó en el rediseño se escribió al principio así:

```css
background: var(--panel, #1b1b22);   /* MAL */
```

`--panel` **no existe** en este proyecto. En oscuro se veía bien de pura
casualidad —el respaldo era oscuro— y en claro el panel salía **negro sobre
fondo blanco**, con las etiquetas invisibles. El respaldo silencia el error
justo en el tema en el que estabas trabajando, que es lo que lo hace tan fácil
de no ver.

Los tokens reales del proyecto, y a qué corresponde cada invento:

| Se inventó | Va |
|---|---|
| `--panel` | `--surface-raised` (opaco en los dos temas; el panel tapa el lienzo) |
| `--panel-2`, `--hover` | `--control-bg` |
| `--borde` | `--control-border` |
| `--acento` | `--accent` |
| `--peligro` | `--danger` |

Los tres del chip de ventana no existían y sí cambian entre temas, así que se
declararon **en los dos** al principio de `styles.css`
(`--chip-ventana-bg/-borde/-texto`).

> Cómo se revisa: `grep` de `var(--…, …)` en la hoja de la herramienta. Si algún
> `var()` lleva respaldo, es un color hardcodeado esperando a salir mal en el
> otro tema. Hoy solo queda `--col-editor`, que no es color: es el ancho que
> escribe el divisor.

> Ojo con las `.preview-container` y el iframe de la previa: **esos sí llevan
> `#fff` a propósito**, porque imitan la página real de Moodle y no deben seguir
> el tema oscuro (regla del README raíz).

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

### La previa no se cierra sola al editar

Cambiar un campo regenera el `srcdoc`, y eso **recarga el documento entero**: el
acordeón abierto se cierra y la pestaña vuelve a la primera. Con la previa al
lado, eso obliga a volver a abrir el apartado después de CADA clic — lo contrario
de una vista previa.

`estadoAbierto()` anota qué paneles y pestañas estaban abiertos antes de
regenerar, y `reponerAbierto()` los repone tras el `load`. Va por **id**, que es
estable porque `reiniciarIds()` numera igual mientras la estructura no cambie; si
un apartado desaparece, su id no se encuentra y no pasa nada.

Dos detalles:

- Al reponer un panel hay que quitarle `collapsed` a su botón y poner
  `aria-expanded="true"`, o queda abierto pero con la flecha al revés.
- Las pestañas se reponen **en bloque**, apagando primero las hermanas: activar
  una sin apagar la que el HTML trae activa por omisión deja dos encendidas.

> Se repone junto con el scroll, que ya se conservaba. Los dos resuelven lo
> mismo: que editar no te mueva de donde estabas mirando.

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

### El formato del Word sí llega: negritas, cursivas, viñetas y el cuadro

Cuatro cosas del Word que antes se perdían en el camino, y las cuatro se perdían
en el **mismo sitio**: dentro de una celda. Y casi todo el guion instruccional
vive dentro de una celda, porque el contenido de cada pestaña es una celda de la
tabla *Pestaña | Contenido*.

| Qué | Dónde se perdía | Cómo llega ahora |
|---|---|---|
| **Negritas** | En ningún lado: ya funcionaban (`**texto**` → `<strong>`) | Igual que siempre |
| **Cursivas** | `docx.js` las trae apagadas por omisión y la herramienta nunca las pedía; encima, el `contenido` de una celda llamaba a `textoDeParrafoConNegritas` con `{ saltos: true }` **fijo**, así que ni pidiéndolas llegaban | `leerBloquesDeDocx(file, { cursivas: true })`, y el `contenido` hereda esa opción. `marcas()` ya convertía `*texto*` en `<em>` |
| **Viñetas y numeraciones** | El `contenido` de una celda entregaba `{ tipo, texto, imagenes }` y nada más: la viñeta no existía ahí, así que cada elemento salía como un párrafo suelto | `contenido` trae `lista`, `tipoLista`, `nivelLista` e `idLista`, y `bloquesDesdeLineas` agrupa los renglones seguidos en un bloque **Lista** |
| **El cuadro** (una celda sola, con borde y sin relleno) | Se leía como "tabla de una celda", que en el guion es la barra de título de sección | Si **no** está sombreada es un cuadro y sale como **Caja de color** sin banda |
| **La caja de instrucción sin su marca** | El guion no siempre escribe `<Texto regular…con ícono de interactividad>`: a veces solo pega el ícono en el párrafo. Salía como un párrafo en negritas más | Se reconoce por el ícono anclado + el texto entero en negritas (ver abajo) |
| **Las figuras** | El párrafo que solo trae la imagen se caía: la página salía sin una sola | Se vuelve bloque **Imagen**, con su pie y con el nombre de archivo que pide el comentario del guion |

El estilo de la lista sale de `numbering.xml` (lo lee `docx.js`), no del texto:
viñeta, `1.`, `a.` e `i.` se distinguen sin adivinar. `ESTILO_LISTA` traduce eso
al campo `estilo` del bloque en **un solo lugar**, porque lo consultan los tres
caminos —párrafo suelto, celda y sublista de un paso— y tenerlo tres veces es
cómo se quedó vivo meses el hex `#d8a7b6`.

Dos decisiones que conviene conocer antes de "arreglarlas":

- **Un cambio de formato abre otra lista.** Si el Word pasa de viñetas a `a, b,
  c`, salen dos bloques `lista`, no uno con dos estilos. Lo mismo si cambia el
  `numId`: en el guion eso son dos listas distintas que quedaron pegadas.
- **Los niveles anidados se aplanan.** El bloque `lista` publica sus elementos
  como texto y no admite hijos —para eso está `pasos`—, así que una sublista sale
  como su propia lista debajo. Es legible, y es mucho más de lo que había antes
  (la viñeta se perdía entera). Si algún día hace falta el anidado de verdad, va
  en `pasos`, no aquí.

**El cuadro se distingue por el sombreado, no por el tamaño.** En estos guiones
la barra de sección viene con `#666666` y el cuadro con relleno automático; por
eso `sugerir()` devuelve `cuadro` solo cuando la tabla tiene una celda **y** no
está sombreada. El bloque destino es `envolvente` (Caja de color) con
`fondo: neutral-claro-50`, que es el equivalente neutro de las plantillas: el
cuadro del Word no trae color y el markup de la caja está copiado de la
plantilla, no deducido. En el asistente de importación, *Cuadro* también aparece
como opción para las tablas que sí se preguntan.

### La caja de instrucción cuando el guion no la marca

Lo normal es que el guion abra la caja amarilla con `<Texto regular en negritas
con ícono de interactividad a la izquierda>`. Hay guiones que no escriben la
marca: pegan el **ícono dentro del párrafo** y ponen la frase entera en
negritas. En el Word se ve igual; en la página salía como un párrafo en negritas
más, sin caja.

Se reconoce por **dos indicios que tienen que darse juntos**:

1. El párrafo trae una imagen anclada **pequeña** — el ícono de interactividad
   mide 33 px en los guiones cotejados, y la figura más chica del mismo Word
   mide 135. El corte está en 60 px, con aire por los dos lados.
2. El texto va **entero** en negritas (`**todo**`, sin ningún `**` por dentro).

Por qué no se dispara de más: en el Word cotejado los únicos párrafos con imagen
anclada **y** texto son justo los cuatro de instrucción. Las figuras de verdad
van solas en su párrafo, sin una palabra; y el único párrafo que sí mezcla texto
con una imagen grande —el SmartArt de la metodología de gráficos— no viene en
negritas, así que falla el segundo indicio.

El tamaño no se adivina: `assets/docx.js` lo entrega en **`imagenesInfo`**
(`[{ id, ancho, alto }]` en píxeles, sacado del `wp:extent` del dibujo). Es un
campo nuevo; `imagenes` sigue siendo la lista de rId pelada que ya leían las
otras herramientas. Un dibujo sin `wp:extent` llega en 0 —que significa "no sé",
no "diminuto"— y no cuenta como ícono.

**El ícono lo pone el bloque, no el Word.** La caja sale con
`@@PLUGINFILE@@/clic.png`, que es lo que publica el montaje; la imagen que traía
el párrafo era el ícono del guion y no se sube. En la vista previa ese `src` da
404 a propósito: el archivo vive en Moodle.

### Las imágenes se montan solas (y con el nombre bueno)

Antes, una página importada salía **sin una sola figura**: el recorrido pedía
texto y un párrafo que solo trae la imagen se caía por ahí. Quedaban los bloques
vacíos de las marcas `<Figura>`, cuando el guion las escribiera, y nada más.

Ahora un párrafo con imagen y sin texto se vuelve su bloque **Imagen**, con dos
cosas resueltas:

**El pie.** El encabezado *"Figura 1. …"* viene **antes** de la imagen en unos
guiones y **después** en otros. El de después ya se reconocía; ahora también el
de antes: si el último renglón que espera salir es un encabezado de figura, se lo
queda la figura en vez de publicarse como un párrafo encima. El *"Nota.
Elaboración propia (2026)."* de abajo sigue cayendo en `nota`. Un solo regex
—`ENCABEZADO_DE_FIGURA`— para los dos casos.

**El nombre.** Producción no escribe el nombre del archivo en el cuerpo del
guion: lo deja en un **comentario de Word** sobre la imagen — *"Insertar ícono de
interactividad. Con nomenclatura: 01S.04_ICONO_GENERAL_Interactividad_IMG1"*—. Ese
es el nombre con el que la imagen se va a subir a Moodle, así que es el que queda
escrito en el `@@PLUGINFILE@@`. Puesta así, la página ya sale buena: solo falta
subir el archivo.

La extensión **no se inventa**: la nomenclatura llega sin ella, y se toma la del
archivo que viene dentro del `.docx`. Sin comentario, se usa el nombre del propio
Word (`IMG003.png`), que al menos deja la previa completa y el `.zip` utilizable.

#### El alias, que es lo que hace que todo cuadre

`imagenesDocx` está indexado por el nombre que el archivo trae **dentro** del
Word, y con esto la página pide otro. Cada entrada lleva ahora una lista `alias`
con los nombres finales que se le dieron, y de ahí salen tres cosas:

| Quién | Qué hace con el alias |
|---|---|
| La vista previa | Cambia `@@PLUGINFILE@@/<alias>` por el `blob:` del archivo, así que la previa se ve completa aunque el nombre todavía no exista en Moodle |
| El `.zip` de *Antes de subir* | Empaqueta cada archivo **con el nombre que pide el HTML**, no con el del Word. Si trajera el del Word, el `@@PLUGINFILE@@` no lo encontraría al arrastrarlo al editor |
| La galería y la lista de pendientes | Reconocen las dos formas del nombre |

Es lista y no un campo suelto porque un mismo archivo del Word puede montarse con
dos nomenclaturas distintas.

### Los colores del guion son un código (y lo elige el usuario)

Los guiones usan el color como código y **lo declaran ellos mismos**, en su
ficha de control:

> Las indicaciones para producción figuran como comentarios y/o resaltadas en turquesa.
> Las indicaciones para montaje figuran como comentarios y/o resaltadas en amarillo.
> El texto resaltado en verde deberá conservar el estilo.
> Haz clic en las palabras de color púrpura para conocer más información.

Ese código se repite en los cinco guiones cotejados… pero está escrito DENTRO
del guion, así que otro módulo puede usar otro — y de hecho lo usa: en aa2 el
magenta son **resaltados**, y en aa3 y aa5 el púrpura son **ventanas**. Por eso
NO se cablea. El asistente muestra cada color con su muestra y su conteo, y se
elige entre cuatro sentidos: **Tal cual · Ventana · Resaltado · No va**.

La propuesta sale de la leyenda; el usuario manda. Igual que con las tablas.

### La leyenda se lee frase por frase

Las cuatro líneas viven en una misma celda, así que el bloque entero trae las
cuatro reglas y los cuatro colores juntos. Leído de corrido, el verde heredaba
la frase del turquesa y salía propuesto como "No va".

### "Ventana" se propone por mayoría, no por una vez

Los dos canales se solapan: las palabras púrpura vienen **además** resaltadas en
verde. Contando "alguna", el verde entero se proponía como ventana por cuatro
palabras de noventa y cuatro.

### El texto tiene que salir IGUAL con colores o sin ellos

Encender `colores` parte los tramos por color, y dos trozos en negritas seguidos
daban `**a****b**` en vez de `**ab**`. O sea: encender la función habría cambiado
en silencio lo que leen el Integrador HTML y Bibliografías. `textoDeParrafoConNegritas`
vuelve a juntar los tramos por el único formato que sabe escribir —negritas y
cursivas— antes de armar la cadena. Comprobado en los cinco guiones: `texto`
idéntico con colores encendidos y apagados.

### El comentario va con la PALABRA, no con el párrafo

El texto de cada ventana es el comentario que producción ancló sobre esa palabra
("Producción: Crear pop-up con el siguiente texto:TXT:…"). Cuando un párrafo
tiene varias palabras señaladas, el comentario del párrafo no basta: los ids
viajan por tramo (`unidadesDeParrafo` los rastrea igual que hacía para el LaTeX).

El cuerpo se corta por la **última** marca `txt`, no la primera: hay recados con
la forma "…con el siguiente TXT y código latex:Txt:…" y con la primera el cuerpo
se quedaba con "y código latex:Txt:" pegado delante.

**Una ventana sin comentario no es una ventana.** Pasa con la propia leyenda
—"haz clic en las palabras de color púrpura"—, donde la palabra va del color que
explica pero no abre nada. Sin esa salvedad salía un modal vacío.

### Se aplica sobre los bloques crudos

`aplicarColores` reescribe `texto` ANTES de armar nada, así que las listas, las
celdas, las tablas y las cajas siguen leyendo `texto` como siempre: no hubo que
tocar el camino ya probado. En una celda hay que rearmar además `lineas` y
`texto`, que salen de otra lectura del Word y no se enteran de lo reescrito.

### El resaltado usa el nivel de la página

`==texto==` estaba fijo en `bg-resalte-20` mientras la palabra con ventana usaba
el de la página (`bg-resalte-30`): la misma página salía con dos intensidades sin
que nadie lo pidiera. Los montajes cotejados usan una sola.

### Los títulos que no vienen en barra

No todos los guiones traen la barra sombreada de la que salía el título. Los que
no, lo marcan: un párrafo con `<h1>` y **el título en el párrafo siguiente**.

    <h1>
    ¿Cómo se construye el conocimiento?     ← el título
    <h2>
    Método científico                        ← subtítulo

La marca se ignoraba ("ya es el título", decía el código) porque en los guiones
con barra sobra. En los que no la traen, esto era lo ÚNICO que decía cuál de los
párrafos es un título, y la página entera salía sin uno solo: aa2 y aa4 daban
**cero**. Un `<h1>` posterior, cuando la barra ya dio el título de la página, baja
a `h2`: es un título de sección, no un segundo título de la página.

### El video

Tres formas, todas del guion:

| En el guion | Qué sale |
|---|---|
| La liga sola en su renglón | Bloque Video con esa liga |
| `Producción: Embeber el siguiente video: <liga>` | Igual; el recado no se publica |
| `Producción: Embeber video <SM2_S3_…_Video>` | Bloque Video **vacío** con la indicación |

La tercera es un video que todavía no existe: solo hay nomenclatura. Sale el
bloque vacío con su nota —como ya se hacía con `<Figura>`— para que en el montaje
se pegue la liga. Un párrafo que menciona una liga de pasada no se convierte en
video: sin recado, se exige que el renglón sea casi solo la liga.

### La tabla que en realidad son palabras con ventana

En el guion, los pasos del método científico vienen como tabla: en una columna la
figura y en otra el paso con su ventana, como renglones de la MISMA celda:

    1.
    Observación
    <Pop up> Identificar un fenómeno o problema que genera interés. <Termina pop up>

En la página montada eso no es una tabla: es cada paso resaltado y, al hacer clic,
su ventana. Leída como tabla, la explicación se publicaba como una columna más
—con la marca `<Pop up>` impresa— y no salía una sola ventana. A veces la marca va
sola y el cuerpo baja al renglón siguiente; las dos formas se atienden.

Se exige que **todas** las filas tengan esa forma, para no confundirla con una
tabla normal que casualmente traiga un pop-up.

### Una MARCA nunca se descarta por color

Este es el que costó encontrar. En aa2, la marca `<Pop up>` viene **resaltada en
turquesa**, y turquesa está propuesto como "no va". Resultado: el color borraba la
marca antes de que la gramática del guion pudiera leerla, y el texto de la ventana
quedaba suelto, sin quién lo reconociera. Cero ventanas, y ningún error a la vista.

Regla: cuando un tramo marcado como "no va" contiene `<…>`, se conserva. Las
marcas son la gramática del guion —`<Pop up>`, `<Figura>`, `<h2>`— y el intérprete
que las traduce viene después; ya se encarga de que no lleguen impresas a la
página. El color decide sobre el TEXTO, no sobre la gramática.

### El botón de ventana tiene tono y tamaño

Salían todos iguales —secundario y chico—, pero en las páginas montadas hay tres
combinaciones vivas:

| Montaje | Clases |
|---|---|
| aa1 | `btn btn-secondary btn-sm … border-secondary-10` |
| aa3 | `btn btn-primary btn-lg … border-primary-10` |
| aa5 | `btn btn-primary … border-primary-10` (sin modificador de tamaño) |

Son dos ejes: **tono** (`btn-primary` / `btn-secondary`) y **tamaño** (`btn-sm`,
nada, `btn-lg`). Van como campos del bloque, y **por omisión dan exactamente lo
de siempre** —secundario y chico—, que es lo que ya está publicado.

**El borde va apareado con el tono en el código, no a mano.** En un montaje real
se coló un `btn-secondary` con `border-primary-10` y se ve como un botón a medio
pintar; `TONOS_BOTON` empareja los dos y así esa combinación no se puede
escribir. Los campos viven una sola vez (`CAMPO_TONO_BOTON`,
`CAMPO_TAMANO_BOTON`) y los comparten Tarjetas y Ventana emergente.

### La imagen sola va centrada

En el guion **todas** las figuras vienen centradas (`w:jc="center"`, sin una sola
excepción en los cotejados), pero salían pegadas a la izquierda… solo algunas.

La inconsistencia estaba dentro del bloque Imagen: el envoltorio
(`.col-12.col-md-8.mx-auto`) centra la **columna**, no lo que va dentro. Con
encabezado no se notaba —la `.card-deck` ocupa el ancho de la columna—, pero sin
encabezado la imagen es un `<img>` suelto y, si es más angosta que la columna, se
queda en su orilla izquierda. O sea: la misma figura salía centrada o no según si
el guion le había puesto "Figura N." encima.

Ahora la imagen sola y sin encabezado lleva `d-block mx-auto`. Medido en la
previa: `izq === der` en las ocho figuras del guion de prueba.

#### El SmartArt

Word le pega al párrafo de la imagen el texto que hay **dentro** del diagrama
(*"- Depende del tipo y cantidad de información.- Depende si usas…"*), así que
esa figura llega con texto encima y no cumple la regla de "párrafo con imagen y
ni una palabra". Lo que la delata es venir justo debajo de su encabezado *"Figura
N."*. Ahí sale la figura **y el texto sigue su camino como párrafo**: borrar un
párrafo de más en el editor es fácil, recuperar una imagen perdida no. Esa
asimetría es la regla, no un descuido.

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

### Un interruptor que esconde campos vuelve a dibujar la FICHA

Los campos con `siOculta` se filtran **al dibujarlos**, así que un interruptor
que los gobierna tiene que redibujar además de `refrescarSalida()`. Sin eso,
apagar *Recuadro de contenidos* quitaba la columna de la página pero dejaba a la
vista sus tres campos, que ya no aplicaban.

> ⚠️ **Es `dibujarFicha()`, no `dibujarLienzo()`.** Era `dibujarLienzo()` cuando
> los campos vivían dentro de la tarjeta del lienzo. El rediseño los movió al
> panel de la derecha (`#panel-bloque` / `#panel-cuerpo`), que `dibujarLienzo()`
> **no toca**, y el arreglo dejó de servir sin que nada avisara: medido, apagar
> *Recuadro de contenidos* seguía mostrando los tres campos. Ahora se llaman las
> dos, porque el renglón del índice también puede cambiar.
>
> Nunca `dibujarTodo()`: la previa ya se regenera en `refrescarSalida()`, y con
> `dibujarTodo()` se cerraría la ficha que se acaba de abrir (ver arriba).

La cuenta de "¿hay algo que esconder?" mira `campos.some(c => c.siOculta)` **y**
`alineaTexto`, porque los botones de alineación del bloque Texto no viven en
`campos`: viven en la barra del campo (abajo).

### La alineación del Texto vive en la barra, no como campo

El bloque Texto tenía dos casillas: *centrado y en negritas* (`destacado`) y
*centrado, sin forzar negritas* (`centrado`). O sea: se podía centrar, pero no
alinear. La segunda casilla se cambió por tres botones —izquierda / centro /
derecha— **dentro de la barra de marcas**, junto a negritas y cursivas.

Van ahí y no como campo suelto porque es donde los busca quien viene del editor
de Moodle: es la misma fila de botones del TinyMCE. El componente lo declara con
`alineaTexto: 'texto'` (el campo al que se le pegan) y los dibuja
`barraDeMarcas()`.

> No son una marca. Los otros botones **insertan texto** (`**negritas**`) en la
> posición del cursor; estos ponen una clase al **bloque entero**, así que se
> pintan con estado (`.mini-btn.activa`) para que se vea cuál está puesto. Es la
> diferencia con Tiny, donde la alineación es por párrafo: aquí los párrafos de
> un bloque van todos iguales. Para mezclar alineaciones, van en bloques
> distintos.

Detalles que importan:

- **Las clases son de Bootstrap, no inventadas**: `text-center` y `text-end`. La
  hoja del tema no las declara —salen del Bootstrap que carga Moodle— y tampoco
  las pelea: lo único con `text-align` ahí son dos reglas de contexto que no
  tocan al `<p>` suelto. Comprobado renderizando la salida contra la hoja: da
  `start` / `center` / `right`.
- **Izquierda no escribe `text-start`.** Es el default del navegador; escribirlo
  cambiaría el HTML de todos los bloques que ya salían bien sin ganar nada.
- **`text-justify` NO se ofrece.** Está en el subconjunto de `vista-previa.js`,
  pero **Bootstrap 5 la eliminó**: en Moodle no existe. Ofrecerla habría dado una
  previa que miente.
- **`destacado` manda.** Con esa casilla encendida los botones no se dibujan: ese
  patrón ya es "centrado y en negritas" por definición.
- El valor viejo (`centrado: true`) se sigue entendiendo como centro, vía
  `alineacionTexto()`. Y el **importador lo detecta** de los `<p>`, pero solo si
  **todos** coinciden: con una mezcla no hay un valor de bloque que la
  represente.

### El menú de piezas que nunca se cerraba

`.insertar-opciones` —la rejilla de 21 piezas que abre cada "+"— llevaba
`display: grid !important`. Y `shared.css` esconde con
`.hidden { display: none !important }`. Misma especificidad, los dos
`!important`, y el de la herramienta va **después**: ganaba el `grid`, así que
**el menú jamás se escondía**.

Se veía como dos paneles de piezas abiertos a la vez en la columna izquierda —uno
por cada "+", más la paleta del pie— y el panel dejaba de entenderse. Medido con
un solo bloque en la página: **42 piezas en pantalla** cuando debían ser 21 (las
de la paleta del pie), y el lienzo tres veces más alto.

El `!important` no hacía falta: estaba para ganarle al `display: flex` de la otra
regla `.insertar-opciones` de más arriba, y esa ya la gana **por orden**.

> La moraleja es de las que se repiten: `!important` sobre una propiedad que una
> clase de utilidad también gobierna (`display`, `hidden`) le rompe la utilidad
> en todos lados, no solo aquí.

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

## Salida: página completa o solo el título

El mismo envoltorio, con un problema distinto en cada extremo. La hoja le da a
`.mainPlantilla23` un `padding-bottom: 100px`:

```css
.mainPlantilla23 {
    background-color: transparent;
    min-height: 100%;
    padding-bottom: 100px;
}
```

En una **página** ese aire es el final del contenido y está bien. En un **recurso
con archivo** (Archivo/PDF, Carpeta, URL, video) la descripción lleva **solo el
título**: el contenedor cierra ahí mismo y esos 100px no son el final de nada
—quedan colgando **entre el título y el PDF** que Moodle pinta debajo—. Es el
hueco que se ve en los recursos ya publicados.

De ahí el selector **Salida**, en *Ajustes de la página*:

| Salida | Qué genera | Envoltorio |
|---|---|---|
| **Página completa** | El título y todo el lienzo | `container-fluid mainPlantilla23 <paleta>` |
| **Solo el título** | El título y su `<hr>`, nada más | …`<paleta> pb-0` |

Tres decisiones que no son obvias:

- **El envoltorio se queda en los dos casos.** Es tentador soltar el título
  pelado, pero el color y la rayita salen de `.mainPlantilla23 .tituloUnidad h1`
  y de `--primary-40`, que define la clase del aula sobre ese mismo div
  (`.mainPlantilla23.M01`). Sin envoltorio el título sale gris y sin barra.
- **La línea `<hr>` se queda.** Es la regla del montaje —bajo la barra del título
  va una línea— y ahí separa el título del archivo.
- **`pb-0` y no `pb-3`.** Es utilidad de Bootstrap, así que lleva `!important` y
  le gana a la hoja del tema, que no lo lleva. El único respiro que queda es el
  margen del `<hr>`, que es justo lo que se quería.

Los bloques del lienzo **no se borran** al cambiar a *Solo el título*: siguen
ahí y vuelven al elegir *Página completa*. Lo que sí pasa es que dejan de
publicarse, y eso se dice tres veces —bajo el selector (*"N bloques del lienzo no
salen"*, en rojo), en *Antes de subir* como pendiente, y en los pasos de subida,
que en ese modo hablan de editar la **Descripción del recurso** y no de crear una
Página—. Callarlo sería que la herramienta pareciera haber perdido el trabajo.

En *Antes de subir* ese modo tampoco revisa el lienzo: pedir que se suban las
imágenes de bloques que no se publican es mandar a hacer trabajo que no va a
salir (`bloquesQueSalen` en `dibujarRevision()`).

> Y al **traer una página de vuelta**: `pb-0` en el envoltorio se lee como
> *Solo el título*, pero **solo si de verdad no venía nada más que el título**.
> En una página con bloques cambiar el modo los sacaría de la salida sin avisar,
> así que ahí `pb-0` se conserva como clase del contenedor y ya.

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
| **Salida** | Siempre — todo recurso es una cosa o la otra |
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

### La tabla tiene DOS encabezados y son distintos

Se confunden con facilidad —se confundieron en uso real—, así que los campos lo
dicen en la etiqueta:

| Campo | Etiqueta | Qué produce | Dónde se ve |
|---|---|---|---|
| `titulo` | *Título gris, ARRIBA de la tabla* | `.container-fluid.bg-neutral-claro-50` con `p.text-muted.my-2.text-center` | Banda **gris**, **fuera** de la tabla |
| `banda` | *Banda de color, DENTRO del encabezado* | `<tr><th colspan="N">` dentro del `<thead>` | Renglón **de color**, ya dentro |

El "Tabla 1. …" que llevan casi todas las tablas del equipo es el **primero**.
Escribirlo en el segundo lo saca de color y dentro de la tabla, que no es donde va.

> ⚠️ **El importador tiene que leer los dos.** El título gris es *hermano* del
> `<table>`, no parte de él: `leerTabla()` reclama el nodo entero, así que lo que
> ese lector no lea **desaparece**. Sin buscarlo a propósito, traer una tabla de
> Moodle perdía su "Tabla 1. …" sin avisar. Es el riesgo de todo lector que
> reclama un subárbol completo — vale para los que se agreguen después.

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

### El `<small>` faltaba en el subconjunto de la previa

`<small>` no es una clase del tema: es **Reboot de Bootstrap**
(`small { font-size: 0.875em }`). Faltaba en `vista-previa.js`, así que el
navegador le aplicaba su default (`smaller`) y la previa daba **13.33px** donde
Moodle da **14px**.

Se nota justo en el recuadro de *Contenidos de aprendizaje* de la presentación,
que va **entero** dentro de `<small>`: título y párrafos salían más chicos que en
la página publicada. Medido después del arreglo: 14px en los dos.

Volvió a pasar con **`.d-block`**, y ahí el sintoma fue mas engañoso: la imagen
sola lleva `d-block mx-auto`, y `.mx-auto` **si** estaba en el subconjunto. Pero
`margin: auto` no centra nada sobre un elemento `inline`, asi que sin `.d-block`
las dos clases juntas no hacian nada y la figura salia pegada a la izquierda —en
Moodle, con el Bootstrap de la plataforma, se veia bien—. La hoja del tema **no**
sirve de red: solo retoca Bootstrap, no lo trae (su unico `.d-block` es un
`ul.section.d-block` de Moodle, y su unico `.mx-auto` va dentro de
`.mainPlantilla23`).

Es la regla que ya estaba escrita arriba y que conviene releer: *este subconjunto
cubre lo que genera `componentes.js`*. Y no solo las **clases** —también las
**etiquetas** que Bootstrap reestilza (`small`, `mark`, `hr`…). Si un componente
empieza a emitir una etiqueta nueva, va también aquí. **Una clase a medias es
peor que ninguna**: con `.mx-auto` sola la previa no fallaba, mentía.

> ⚠️ **`vista-previa.js` es una plantilla de texto de JS.** Un acento grave
> dentro de un comentario del CSS cierra la plantilla y deja
> `CSS_VISTA_PREVIA` en `undefined`: la previa entera sale sin estilos y la
> consola no dice gran cosa. Pasó al escribir este mismo comentario.

### El HTML va en la DESCRIPCIÓN, siempre

Los dos modos de *Salida* se pegan en el mismo campo: la **Descripción** del
recurso, con *Mostrar descripción en la página del curso* marcado. Así lo monta
el equipo y así lo espera su plugin.

No es cuestión de gusto: **la hoja del tema está escrita para ese contenedor.**
Sus reglas de ancho cuelgan de `.activity-description` (ver *El envoltorio lleva
el ancho escrito a mano*), y en el *Contenido de la página* no existe ese
ancestro, así que no aplican.

| Salida | Qué va en la Descripción |
|---|---|
| Página completa | la página entera |
| Solo el título | solo la barra del título, para un recurso con archivo (PDF, video) que Moodle pinta debajo |

Lo dice la tabla `DESTINO`, y se escribe en dos lados —bajo el selector de
*Salida* y bajo el HTML, en la pestaña de código—.

> ⚠️ **Ojo con dónde se juzga el resultado.** La misma descripción se pinta en
> dos vistas —la página del curso y el recurso abierto— y **no tienen la misma
> base de tamaño**. Medido con la misma presentación: el encabezado del recuadro
> da **14px** en una (= 16 × 0.875, un solo `<small>` sobre base 16) y
> **11.484375px** en la otra (= 15 × 0.875 × 0.875). El HTML es el mismo en las
> dos. Antes de tocar nada, hay que saber qué vista se está mirando.

### El tamaño del texto lo pone el CONTENEDOR, no la herramienta

Ningún bloque de la herramienta escribe un `font-size`: todo se hereda de donde
se pegue el HTML. En el recuadro de la presentación el único reductor es el
`<small>`, que es **exactamente lo que trae el montaje publicado**.

Por eso, cuando un montaje sale con las letras más chicas, lo primero que hay que
mirar no es el HTML sino **dónde se pegó**. La señal para distinguirlos: si lo que
se encogió es **todo el bloque** —el `h1`, los párrafos y el recuadro— es el
contenedor; si se encogió **solo** lo que va en `<small>`, ahí sí mira el markup.

Un caso real: la misma presentación dio `14px` en el encabezado del recuadro
abierta como recurso Página, y `11.484375px` en otra vista. Ese número no es
casual: `15 × 0.875 × 0.875`, o sea **dos reducciones de `em` sobre una base de
15px** en lugar de una sobre 16px. La hoja del tema no tiene ninguna regla que lo
haga —buscado: no hay `font-size` en `.activity-description` ni en `.card-header`
ni en `small`—, así que viene del Moodle de alrededor.

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

> ⚠️ **La clase que se repite en los `<th>` es `bg-primary-10`, NO el
> `bg-primary-20` del `<thead>`.** La primera versión repetía el -20 y eso dejaba
> la banda del `colspan` y la fila de títulos **del mismo color**. En el montaje
> publicado son dos tonos distintos: la banda con el -20 y los títulos con el
> -10, más claro. Cotejado contra dos páginas ya montadas, una de **MM** y otra
> de **M03**, con el mismo markup en las dos.
>
> En M03 la diferencia es sutil (`rgb(250,230,230)` contra `rgb(252,244,244)`),
> pero en MM salta a la vista: el -20 es el rosa fuerte `#d8a7b6` y el -10 es
> `rgb(244,233,237)`, casi blanco. Con el -20, media tabla salía rosa.

Los `<th>` de títulos también llevan la clase `thead`, igual que el `<thead>`. No
pinta nada —la hoja no la declara—; se conserva para que el HTML siga siendo
comparable renglón por renglón con la página publicada.

> El color **no se escribe**: sale de `--primary-10` / `--primary-20`, así que
> sigue a la paleta del aula sola. El `#d8a7b6` de `MM` es el mismo hex que ya
> nos costó meses cuando estaba duplicado a mano en dos herramientas.

### La primera columna tiene DOS montajes, no uno

`colorear` era una casilla (alternar sí/no) y ahora son tres opciones, porque el
equipo publica las dos cosas:

| Opción | Qué hace | Dónde está publicado |
|---|---|---|
| `no` | sin color | tablas sin sombreado |
| `alternado` | `bg-primary-10` / `bg-secondary-10` fila por fila | las tablas normales (y lo que hace el Convertidor de Tablas). Por eso el importador de Word lo enciende |
| `plano` | `bg-secondary-10` en **todas** las filas | la **Tabla 1** de la presentación de la semana: cotejado en MM y en M03, sus dos filas llevan el mismo tono |

Con dos filas la diferencia es exactamente una celda, y era la que se veía mal:
la Tabla 1 salía con la fila 1 en rosa y la 2 en verde, cuando las dos van en
verde. Por eso la plantilla de *Presentación de semana* trae `colorear: 'plano'`.

El valor viejo (`true`) se sigue entendiendo como `'alternado'`: lo normaliza
`tonoPrimeraColumna()` en vez de migrar los bloques.

Y el **importador de HTML lo detecta**, mirando la primera celda de cada fila:
todas del mismo tono y ese tono es `bg-secondary-10` → `plano`; si hay color pero
no cuadra → `alternado`; sin color → `no`. Antes entraba siempre en "sin color",
así que importar una tabla publicada y volver a generarla le borraba la columna.

### `MW-auto`: la clase que deja encoger la tabla

El montaje publicado escribe
`<table class="table table-bordered MW-auto tabla-responsive-cards">`, y esa
`MW-auto` **no es decorativa**. La hoja del tema trae:

```css
.mainPlantilla23 .table td { min-width: 200px }
.mainPlantilla23 .table.MW-auto td { min-width: auto }
```

Sin `MW-auto`, una tabla de cinco columnas tiene **1000px de ancho mínimo** y ya
no puede encoger: entre los 576px donde entran las tarjetas y el escritorio saca
barra de desplazamiento. Es el mismo problema que documenta
`tools/micrositio-a-pagina/REGLAS.md` §6-ter.

Medido con las cinco columnas de la Tabla 1, con el subconjunto de Bootstrap de
la previa más la hoja del tema:

| Contenedor | Sin `MW-auto` | Con `MW-auto` |
|---|---|---|
| 1100px | 1060px, sin scroll | 1060px, sin scroll |
| 700px | **1001px → con scroll** | 660px, sin scroll |

O sea: en pantalla ancha no cambia nada y en pantalla mediana quita el scroll.
Por eso va **siempre**, no como opción.

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
7. bis. **Salida en *Solo el título***: el HTML debe salir con `pb-0` y sin
   ningún bloque, la previa debe medir `padding-bottom: 0px` en el contenedor
   (y 100px al volver a *Página completa*), y con bloques en el lienzo tienen
   que aparecer los dos avisos —el rojo bajo el selector y el de *Antes de
   subir*—. Pegando ese mismo HTML en *Traer de Moodle*, la salida debe volver
   sola a *Solo el título* y el `pb-0` **no** debe duplicarse en las clases del
   contenedor.
8. Con la ventana a 1366×700, el panel no debe scrollear ni recortar tarjetas.
9. En celular (≈390px de ancho): la pantalla de inicio no debe encimarse con la
   paleta, y en un bloque anidado la cabecera y la ruta de la imagen deben
   caber. Ojo con `.lienzo`: con las columnas apiladas va `flex: none`, porque
   con `flex: 1 1 240px` se queda en 240px y —al tener `overflow: visible`—
   **pinta su contenido encima** de lo que sigue.
