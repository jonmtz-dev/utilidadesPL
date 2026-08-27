/* ==========================================================================
   CSS que se inyecta en el <iframe> de la vista previa.

   Por qué existe: la hoja del tema (hoja-moodle-default.js) solo RETOCA
   Bootstrap; da por hecho que Moodle ya lo cargó. Si la previa se quedara con
   esa hoja sola, la rejilla, el acordeón y las pestañas saldrían apilados y en
   blanco, y la previa mentiría justo en lo que esta herramienta produce.

   Es un subconjunto a propósito: cubre las clases que genera componentes.js,
   ni una más. Si agregas un componente con clases nuevas de Bootstrap, súbelas
   aquí también o su previa no se parecerá a Moodle.

   ⚠️ Todo esto vive dentro de una plantilla de texto (template literal): un
   acento grave suelto —hasta en un comentario— la cierra y deja el archivo sin
   parsear, con la previa entera sin estilos. Ya pasó una vez.

   Va como cadena en un .js (y no como .css) porque el documento de la previa se
   arma entero con srcdoc: la hoja viaja dentro de la cadena. Mismo formato que
   la hoja del tema de Micrositio a Página, que aquí se reutiliza tal cual.
   ========================================================================== */

window.CSS_VISTA_PREVIA = `
*, *::before, *::after { box-sizing: border-box; }
body {
    margin: 0;
    padding: 18px;
    background: #fff;
    color: #333340;
    font-family: "Atkinson Hyperlegible", Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.5;
}
img { max-width: 100%; height: auto; }
p { margin: 0 0 1rem; }
/* <small> es de Bootstrap (Reboot), no del tema, y faltaba en este subconjunto:
   sin la regla, el navegador le aplica su default 'smaller' y en la previa daba
   13.33px donde Moodle da 14px. Se nota en el recuadro de "Contenidos de
   aprendizaje" de la presentación, que va todo en <small>: la previa lo enseñaba
   más chico de lo que sale publicado. Va en em, no en rem: se encoge respecto a
   su contenedor, igual que en Bootstrap.

   OJO: este archivo es una PLANTILLA DE TEXTO de JS. Nada de acentos graves
   aquí dentro (los de teclear código entre comillas): cierran la plantilla y
   dejan CSS_VISTA_PREVIA en undefined, o sea la previa entera sin estilos. */
small, .small { font-size: 0.875em; }
/* h5 entra por el antetítulo de la presentación ("Presentación de la Semana 1"). */
h1, h2, h3, h4, h5 { margin: 0 0 .5rem; font-weight: 500; }
h5 { font-size: 1.1rem; }
/* La palabra que abre una ventana: <mark> con el <strong class="interactivo">
   dentro. El color y el iconito los pone la hoja del tema; aquí solo se quita
   el amarillo que el navegador le da a <mark> por omisión. */
mark { background: transparent; color: inherit; padding: .1875em; }
hr { border: 0; border-top: 1px solid #d5dce3; margin: 1.5rem 0; }

/* --- Rejilla --- */
.row { display: flex; flex-wrap: wrap; margin: 0 -12px; }
/* Bootstrap 5 le da width:100% a TODOS los hijos de .row (row mayor asterisco), no solo
   a los que traen clase col-. La previa lo tenia limitado a [class*="col-"] y
   por eso un <p> suelto dentro de un .row —cosa que si aparece en las paginas
   ya montadas— salia angosto y en paralelo con el siguiente, cuando en Moodle
   va a todo lo ancho y apilado. La previa mentia justo ahi. */
.row > * { padding: 0 12px; width: 100%; max-width: 100%; flex-shrink: 0; }
/* La columna automatica: se reparte el ancho sobrante en vez de ocupar todo. */
.col { flex: 1 0 0%; width: auto; }
.justify-content-center { justify-content: center; }
/* Las de alinear: las genera el campo "Alineación" de Botón, Ventana emergente
   y Tarjetas. Si faltaran aquí, la previa enseñaría todo centrado y mentiría. */
.justify-content-start { justify-content: flex-start; }
.justify-content-end { justify-content: flex-end; }
.text-start { text-align: left; }
.text-end { text-align: right; }
.align-items-center { align-items: center; }
.text-center { text-align: center; }
.text-justify { text-align: justify; }
.d-flex { display: flex; }
/* Faltaba, y la previa mentía justo donde importa: una imagen sola lleva
   d-block + mx-auto, y margin:auto no centra nada sobre un elemento inline.
   En Moodle sí funciona —el Bootstrap de la plataforma trae la utilidad— y
   aquí salía pegada a la izquierda. Es la misma trampa del small.
   OJO: este CSS vive dentro de una plantilla de texto; nada de acentos
   graves aquí adentro o se parte en dos y la previa se queda sin hoja. */
.d-block { display: block; }
.d-inline { display: inline; }
.d-inline-block { display: inline-block; }
.flex-shrink-0 { flex-shrink: 0; }
.h-100 { height: 100%; }
.m-0 { margin: 0; }
.mb-3 { margin-bottom: 1rem; }
.mb-4 { margin-bottom: 1.5rem; }
.mt-2 { margin-top: .5rem; }
.mt-3 { margin-top: 1rem; }
.mt-4 { margin-top: 1.5rem; }
.px-1 { padding: 0 .25rem; }
.px-3 { padding: 0 1rem; }
.img-fluid { max-width: 100%; height: auto; }
.col-12 { flex: 0 0 100%; max-width: 100%; }
@media (min-width: 576px) {
    .col-sm-6 { flex: 0 0 50%; max-width: 50%; }
    .col-sm-12 { flex: 0 0 100%; max-width: 100%; }
}
@media (min-width: 768px) {
    .col-md-2 { flex: 0 0 16.6667%; max-width: 16.6667%; }
    .col-md-3 { flex: 0 0 25%; max-width: 25%; }
    .col-md-4 { flex: 0 0 33.3333%; max-width: 33.3333%; }
    .col-md-12 { flex: 0 0 100%; max-width: 100%; }
    .col-md-6 { flex: 0 0 50%; max-width: 50%; }
    .col-md-8 { flex: 0 0 66.6667%; max-width: 66.6667%; }
    .col-md-10 { flex: 0 0 83.3333%; max-width: 83.3333%; }
}

/* --- Tablas --- */
.table-responsive { overflow-x: auto; }
table.table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
table.table th, table.table td { padding: .6rem .75rem; vertical-align: middle; }
/* Bootstrap pinta el fondo en CADA CELDA, no en la fila ni en el <thead>. Esta
   regla faltaba aquí y era la que hacía que la previa mintiera: enseñaba el
   encabezado del color de la paleta cuando en Moodle sale blanco, porque allá
   las celdas lo tapan. La marca del montaje real pone bg-primary-20 en el
   <thead>, y ahí Bootstrap no lo deja ver.

   Un color puesto en la CELDA sí se ve, aquí y en Moodle: la hoja del tema
   declara .bg-primary-10 y compañía con !important, y por eso la opción
   "colorear la primera columna" sigue pintando. */
table.table > :not(caption) > * > * { background-color: #fff; }
table.table-bordered, table.table-bordered th, table.table-bordered td { border: 1px solid #A2A9B5; }
caption { caption-side: top; padding: .5rem; }

/* --- Acordeón --- */
.accordion { width: 100%; }
.accordion-item { border: 1px solid rgba(0,0,0,.125); background: #fff; }
.accordion-item + .accordion-item { border-top: 0; }
/* El encabezado es un <h2> por accesibilidad, pero el botón se ve del tamaño
   del cuerpo (así lo hace Bootstrap). Sin esto la previa lo pinta enorme. */
.accordion-header { margin: 0; font-size: 1rem; font-weight: 400; }
.accordion-button {
    width: 100%;
    text-align: left;
    padding: 1rem 3rem 1rem 1.25rem;
    border: 0;
    background: #fff;
    font-family: inherit;
    /* El tamaño va en el BOTÓN, no heredado del <h2 class="accordion-header">:
       la hoja del tema dimensiona los h2 con más especificidad que cualquier
       clase del encabezado, y el título del acordeón salía a 36px. Bootstrap
       hace exactamente esto mismo. */
    font-size: 1rem;
    color: inherit;
    cursor: pointer;
    position: relative;
}
.accordion-button::after {
    content: "";
    position: absolute;
    right: 1.25rem;
    top: 50%;
    width: 10px; height: 10px;
    margin-top: -7px;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(45deg);
    transition: transform .2s ease;
}
.accordion-button.collapsed::after { transform: rotate(45deg); }
/* El color del botón NO se fija aquí: en el montaje real las clases
   "bg-neutral-claro-50 text-primary" lo resuelven contra la paleta del aula, y
   (ojo: nada de acentos graves aquí dentro, cerrarían la plantilla de texto), y
   la hoja del tema ya define esas dos. Fijarlo aquí mentiría. */
.accordion-button:not(.collapsed)::after { transform: rotate(-135deg); margin-top: -3px; }
.accordion-collapse { display: none; }
.accordion-collapse.show { display: block; }
.accordion-body { padding: 1.25rem; }

/* --- Pestañas --- */
.nav-tabs { display: flex; flex-wrap: wrap; list-style: none; margin: 0; padding: 0; border-bottom: 1px solid #d5dce3; }
.nav-tabs .nav-link { border: 0; background: transparent; padding: .7rem 1.1rem; font: inherit; cursor: pointer; }
.tab-pane { display: none; }
.tab-pane.show.active { display: block; }

/* --- Tarjetas y botones --- */
.card { border: 1px solid rgba(0,0,0,.176); border-radius: .375rem; overflow: hidden; background: #fff; }
.card-body { padding: 1rem; }
.card-header { padding: .5rem .75rem; border-bottom: 1px solid rgba(0,0,0,.125); }
/* El recuadro de la presentación: el .card-body va suelto (sin .card que lo
   encierre) y la banda + el cuerpo se pintan con bg-primary-10 y
   bg-neutral-claro-50, que sí vienen de la hoja del tema. */
.card-text { display: block; }
.card-img-top { width: 100%; object-fit: cover; }
/* card-group/card-deck: fila de tarjetas de igual alto, como en el montaje */
.card-group, .card-deck { display: flex; flex-wrap: wrap; }
.card-group > .card, .card-deck > .card { flex: 1 0 0%; min-width: 140px; }
.btn {
    display: inline-block; padding: .375rem .75rem; border-radius: .375rem;
    border: 1px solid transparent; cursor: pointer; font: inherit; background: transparent;
}
.btn-sm { padding: .25rem .5rem; font-size: .875rem; }
.btn-secondary { background: #6c757d; border-color: #6c757d; color: #fff; }
.rounded-4 { border-radius: .75rem !important; }
.border-4 { border-width: 4px !important; }
.mx-auto { margin-left: auto; margin-right: auto; }
.mx-3 { margin-left: 1rem; margin-right: 1rem; }
.my-2 { margin: .5rem 0; }
.border-0 { border: 0 !important; }
.text-decoration-none { text-decoration: none; }
.me-2 { margin-right: .5rem; }
.p-2 { padding: .5rem; }
.p-3 { padding: 1rem; }
.p-4 { padding: 1.5rem; }
.pb-3 { padding-bottom: 1rem; }
/* El !important NO es adorno ni copia distraída: esta hoja carga ANTES que la
   del tema, y la regla .mainPlantilla23 (padding-bottom: 100px) tiene la misma
   especificidad, así que sin él ganaría la del tema y la previa enseñaría el
   hueco que la salida "solo el título" viene justo a quitar. En Moodle el
   pb-0 de Bootstrap sí lo lleva; aquí se reproduce igual.
   (Y sin acentos graves: esta hoja vive dentro de una plantilla de texto.) */
.pb-0 { padding-bottom: 0 !important; }
.mb-4 { margin-bottom: 1.5rem; }
.no-gutters { margin-left: 0; margin-right: 0; }
.align-items-center { align-items: center; }
.mb-2 { margin-bottom: .5rem; }
.mt-3 { margin-top: 1rem; }
.mb-3 { margin-bottom: 1rem; }
.px-3 { padding-left: 1rem; padding-right: 1rem; }
.p-0 { padding: 0; }
.rounded-1 { border-radius: .25rem; }
.rounded-2 { border-radius: .375rem; }
/* Los seis resaltes por categoría. En Moodle salen de bg-marca-1…6 de la hoja;
   aquí van con su hex porque la previa tiene que enseñar el color exacto y
   estas clases NO siguen la paleta del aula (ver componentes.js). */
.bg-marca-1 { background-color: #d8cfe3; }
.bg-marca-2 { background-color: #cfe0f3; }
.bg-marca-3 { background-color: #cee4da; }
.bg-marca-4 { background-color: #fbe4d6; }
.bg-marca-5 { background-color: #eedae9; }
.bg-marca-6 { background-color: #d4d4d4; }
/* Ojo: .recuadro__input y .tab-panels NO van aqui, los declara la hoja real del
   tema (que se carga despues). Copiarlos era el bug del #d8a7b6 otra vez: dos
   definiciones del mismo estilo y una envejeciendo. Este archivo es solo el
   subconjunto de Bootstrap que Moodle da por hecho.
   Y nada de acentos graves en los comentarios: esta hoja vive dentro de un
   template literal y uno solo la parte en dos. */
.frame-video { width: 100%; height: 100%; border: 0; }
.align-self-stretch { align-self: stretch; }
.align-baseline { vertical-align: baseline; }
.fs-4 { font-size: 1.5rem; }
.text-muted { color: #6c757d; }
.col-4 { flex: 0 0 33.3333%; max-width: 33.3333%; }
.col-8 { flex: 0 0 66.6667%; max-width: 66.6667%; }
@media (min-width: 992px) {
    .col-lg-3 { flex: 0 0 25%; max-width: 25%; }
    /* Las dos columnas de la presentación: 8/4. Sin ellas la previa apila el
       recuadro gris debajo del título y el bloque parece estar roto. */
    .col-lg-4 { flex: 0 0 33.3333%; max-width: 33.3333%; }
    .col-lg-6 { flex: 0 0 50%; max-width: 50%; }
    .col-lg-1 { flex: 0 0 8.3333%; max-width: 8.3333%; }
    .col-lg-2 { flex: 0 0 16.6667%; max-width: 16.6667%; }
    .col-lg-8 { flex: 0 0 66.6667%; max-width: 66.6667%; }
}
a { color: var(--primary-50, #6b4c8b); }

/* --- Modal de Bootstrap --- */
.modal { display: none; position: fixed; inset: 0; z-index: 1055; overflow: auto; }
.modal.show { display: block; background: rgba(0,0,0,.5); }
.modal-dialog { max-width: 500px; margin: 1.75rem auto; }
.modal-lg { max-width: 800px; }
.modal-xl { max-width: 1140px; }
.modal-sm { max-width: 300px; }
/* La ventana ancha de la presentación (la Tabla 1) va centrada y con la esquina
   redondeada; el cuerpo se separa del encabezado con una línea. */
.modal-dialog-centered { display: flex; align-items: center; min-height: calc(100% - 3.5rem); }
.modal-dialog-centered > .modal-content { width: 100%; }
.rounded-lg { border-radius: .5rem; }
.border-top { border-top: 1px solid #dee2e6; }
.modal-content { background: #fff; border-radius: .5rem; box-shadow: 0 10px 30px rgba(0,0,0,.3); }
.modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1rem; border-bottom: 1px solid #dee2e6;
}
.modal-title { margin: 0; }
.modal-body { padding: 1rem; }
.btn-close {
    border: 0; background: transparent; font-size: 1.4rem; line-height: 1;
    cursor: pointer; color: #333340;
}
.btn-close::before { content: "\\00d7"; }

/* Aviso de scroll de las tablas anchas (solo en pantallas chicas) */
.d-none { display: none; }
@media (min-width: 576px) { .d-sm-block { display: block; } }
@media (min-width: 768px) { .d-md-none { display: none; } }
.indicador-scroll { text-align: center; color: #6c757d; font-size: .85rem; }

/* --- Avisos --- */
.alert { border-radius: .25rem; }
.alert-info { background: #e7f1ff; border-color: #b6d4fe; }
.alert-warning { background: #fff3cd; border-color: #ffe69c; }
.alert-success { background: #d1e7dd; border-color: #a3cfbb; }
.alert-danger { background: #f8d7da; border-color: #f1aeb5; }

/* --- Video --- */
.ratio { position: relative; width: 100%; }
.ratio::before { display: block; content: ""; padding-top: 56.25%; }
.ratio > * { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }

/* Cartel que sustituye al video: el sandbox de la previa no puede cargar
   YouTube, y una caja negra parecería un error. */
.previa-video {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    aspect-ratio: 16 / 9; border-radius: .375rem;
    background: #333340; color: #fff; text-align: center; font-weight: 600;
}
.previa-video small { font-weight: 400; opacity: .75; }

/* Bloque señalado desde el lienzo. Los colores son fijos (azul del panel) y no
   tokens del tema: esto es andamiaje de la herramienta, no de la página. */
[data-bq] { scroll-margin: 24px; }
.previa-senalado {
    outline: 2px solid #0066cc;
    outline-offset: 3px;
    border-radius: 4px;
    animation: senalar 1.2s ease;
}
@keyframes senalar {
    0% { background: rgba(0, 102, 204, .16); }
    100% { background: transparent; }
}

/* --- Modal <details> --- */
details > summary { cursor: pointer; }
details[open] > summary { position: relative; z-index: 98; }
`;

/* ==========================================================================
   Barra flotante para reordenar desde la previa.

   Andamiaje de la herramienta, como .previa-senalado: colores fijos (los del
   panel), nunca tokens del tema, y nunca sale en el HTML que se copia a Moodle
   —se inyecta con JS después de cargar—.

   Va aparte de CSS_VISTA_PREVIA porque en documentoPrevia se pega DESPUÉS de la
   hoja del tema: si compartiera bloque, cualquier regla de Moodle sobre
   <button> le ganaría por orden.

   ⚠️ Igual que arriba: nada de acentos graves aquí dentro, ni en los
   comentarios; cerrarían la plantilla de texto.
   ========================================================================== */

window.CSS_BARRA_PREVIA = `
.previa-barra {
    position: absolute;
    z-index: 1000;
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 9px;
    background: #fff;
    border: 1px solid #d5dce3;
    box-shadow: 0 4px 14px rgba(0, 0, 0, .18);
    /* Anclada al borde de arriba y a la derecha del bloque, como en el lienzo. */
    transform: translate(-100%, -50%);
    opacity: 0;
    visibility: hidden;
    transition: opacity .12s ease;
}
.previa-barra.visible { opacity: 1; visibility: visible; }
/* El asa: lo unico arrastrable de la previa. El bloque no lo es a proposito
   (competiria con los clics que abren acordeones y ventanas). */
.previa-asa {
    display: flex; align-items: center; justify-content: center;
    width: 22px; border-radius: 6px; cursor: grab; color: #8b93a1;
}
.previa-asa:active { cursor: grabbing; }
.previa-asa:hover { background: #eef1f5; color: #333340; }
.previa-asa svg { width: 15px; height: 15px; }
/* Donde va a caer el bloque que se arrastra. */
.previa-raya {
    height: 3px; border-radius: 3px; background: #6597d8;
    margin: 2px 0; box-shadow: 0 0 0 1px rgba(255,255,255,.7);
}
/* Dentro de una ventana emergente (position: fixed) la barra va fija también, y
   por encima del .modal (z-index 1055). */
.previa-barra--fija { position: fixed; z-index: 1060; }
.previa-barra > button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px; height: 26px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #333340;
    cursor: pointer;
    line-height: 1;
}
.previa-barra > button > svg { width: 16px; height: 16px; display: block; }
.previa-barra > button:hover { background: #eef2f7; color: #0066cc; }
.previa-barra > button[data-accion="borrar"]:hover { background: #fdecee; color: #c0293a; }
.previa-barra > button:disabled {
    opacity: .28;
    cursor: default;
    background: transparent;
    color: #333340;
}
`;
