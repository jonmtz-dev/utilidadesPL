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

**B. De cero.** Cuatro plantillas de arranque (con acordeón, con tarjetas, con
tabla, o en blanco) para no enfrentarse a una hoja vacía. A partir de ahí es el
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

## Las marcas del guion (lo que más importa del importador)

En el Word, producción escribe entre `< >` lo que hay que **construir**, no lo
que hay que publicar:

| Marca en el Word | Qué hace la herramienta |
|---|---|
| `<h1>` | El título de la página |
| `<Texto regular en negritas con ícono de interactividad a la izquierda>` … `<Termina …>` | Caja de instrucción amarilla con lo que va en medio |
| `<Figura>` / `<Termina figura>` | Bloque de imagen vacío, listo para poner el archivo |
| `<Crear un grupo de 5 botones…>` | Bloque de tarjetas con esas 5 ventanas |
| `<Tabla>`, `<Pop-up>`, `<Video>` | El bloque correspondiente, vacío |
| Cualquier otra | Se guarda como indicación, no se publica |

Dejarlas en el texto era el error más visible de la primera versión: salían
impresas en la página. Ahora **ninguna marca llega al HTML**; cada una se vuelve
el bloque que corresponde y queda anotada en el bloque ("El guion pide: …") y en
la pestaña *Antes de subir*. Las marcas suelen venir en negritas dentro del
Word, así que se reconocen quitando los `**` antes de compararlas.

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
| 2 columnas y alguna celda de más de 120 caracteres | Acordeón (concepto → explicación) |
| Lo demás | Tabla |

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

**El markup está copiado de una página real ya montada por el equipo**, no
deducido del CSS: el recurso "Historia de la ciencia y tecnología", cuyo HTML
pegado en el editor sirvió de referencia. Eso corrigió dos suposiciones que
parecían razonables leyendo solo la hoja del tema y eran falsas:

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
| Título | `.row.bloque > .col-12 > .tituloUnidad > h1.text-primary` |
| Instrucción | `.instrucciones.d-flex.bg-resalte-10` con `.icono-instruccion.bg-resalte-30` e imagen de 26px |
| Texto | `.row.bloque > .col-12 > p`; la pregunta que abre un apartado va en `.my-2.text-center` con `<strong>` |
| Imagen con texto | `.row.bloque.mt-3.align-items-center` con `.col-8` + `.col-4.col-md-3` |
| Figura con pie | `.card-deck > .card.img-contenedor` con `.card-header.notas-tabla.text-muted` |
| Acordeón | `.accordion.mt-3 > .accordion-item` con el botón `bg-neutral-claro-50 text-primary` |
| Tarjetas | `.card-group > .card` con botón `btn-secondary btn-sm rounded-4 border-4 border-secondary-10 flecha_btn` |
| Ventana | `.modal.fade > .modal-dialog.modal-lg` con `.btn-close` y `data-bs-dismiss` |
| Tabla | `.table.table-bordered.border-neutral` dentro de `.table-responsive` |

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
4. Una tabla de 2 columnas con celdas largas: el asistente debe sugerir
   Acordeón, y al aceptar debe quedar un acordeón con la 1ª columna de títulos.
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
