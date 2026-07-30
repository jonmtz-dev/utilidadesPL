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

   Va como cadena en un .js (y no como .css) porque el iframe se arma con
   srcdoc y sandbox sin allow-same-origin: en ese documento de origen opaco un
   <link> a un archivo local no carga. Mismo motivo por el que la hoja de
   Micrositio a Página también vive en un .js.
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
h1, h2, h3, h4 { margin: 0 0 .5rem; font-weight: 500; }
hr { border: 0; border-top: 1px solid #d5dce3; margin: 1.5rem 0; }

/* --- Rejilla --- */
.row { display: flex; flex-wrap: wrap; margin: 0 -12px; }
.row > [class*="col-"] { padding: 0 12px; width: 100%; }
.justify-content-center { justify-content: center; }
.align-items-center { align-items: center; }
.text-center { text-align: center; }
.text-justify { text-align: justify; }
.d-flex { display: flex; }
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
}
@media (min-width: 768px) {
    .col-md-2 { flex: 0 0 16.6667%; max-width: 16.6667%; }
    .col-md-3 { flex: 0 0 25%; max-width: 25%; }
    .col-md-4 { flex: 0 0 33.3333%; max-width: 33.3333%; }
    .col-md-6 { flex: 0 0 50%; max-width: 50%; }
    .col-md-8 { flex: 0 0 66.6667%; max-width: 66.6667%; }
    .col-md-10 { flex: 0 0 83.3333%; max-width: 83.3333%; }
}

/* --- Tablas --- */
.table-responsive { overflow-x: auto; }
table.table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
table.table th, table.table td { padding: .6rem .75rem; vertical-align: middle; }
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
.my-2 { margin: .5rem 0; }
.me-2 { margin-right: .5rem; }
.p-2 { padding: .5rem; }
.p-3 { padding: 1rem; }
.p-4 { padding: 1.5rem; }
.align-self-stretch { align-self: stretch; }
.align-baseline { vertical-align: baseline; }
.fs-4 { font-size: 1.5rem; }
.text-muted { color: #6c757d; }
.col-4 { flex: 0 0 33.3333%; max-width: 33.3333%; }
.col-8 { flex: 0 0 66.6667%; max-width: 66.6667%; }
@media (min-width: 992px) {
    .col-lg-3 { flex: 0 0 25%; max-width: 25%; }
    .col-lg-6 { flex: 0 0 50%; max-width: 50%; }
}
a { color: var(--primary-50, #6b4c8b); }

/* --- Modal de Bootstrap --- */
.modal { display: none; position: fixed; inset: 0; z-index: 1055; overflow: auto; }
.modal.show { display: block; background: rgba(0,0,0,.5); }
.modal-dialog { max-width: 500px; margin: 1.75rem auto; }
.modal-lg { max-width: 800px; }
.modal-xl { max-width: 1140px; }
.modal-sm { max-width: 300px; }
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
