/* ==========================================================================
   Catálogo de componentes de la plantilla de Moodle 5.1 (mainPlantilla23).

   FUENTE ÚNICA de la herramienta: cada componente declara aquí su nombre, su
   miniatura, sus campos de edición y el HTML que produce. El editor (script.js)
   no sabe nada de acordeones ni de modales: dibuja los campos que encuentre y
   pide el HTML. Agregar un componente = agregar un objeto aquí.

   EL MARKUP NO SE INVENTA. Está copiado de una página real ya montada por el
   equipo (el recurso "Historia de la ciencia y tecnología", cuyo HTML pegado en
   el editor se conserva como referencia). Eso corrigió dos suposiciones que
   parecían razonables leyendo solo el CSS del tema y eran falsas:

   - Las ventanas emergentes son **modales de Bootstrap**
     (`data-bs-toggle="modal"`), no el `<details>` de `.details-modal`. Ese
     `.details-modal` de la hoja lo usan los micrositios, no el montaje.
   - Los botones del acordeón llevan `bg-neutral-claro-50 text-primary`: por eso
     se ven gris claro con el texto del color del aula. Sin esas dos clases
     salen con el azul default de Bootstrap, que no es lo que se publica.

   Colores: SIEMPRE por clase (`bg-primary-20`, `bg-resalte-10`…), nunca un hex.
   El color real lo resuelve la paleta del aula (M01, MM, reg…) del wrapper. Un
   hex aquí es el bug del #d8a7b6 otra vez.
   ========================================================================== */

/* -------------------------------------------------------------------------
   Utilidades de texto
   ------------------------------------------------------------------------- */

function escapar(t) {
    return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Solo se dejan pasar las ligas que tienen sentido en Moodle: http(s), correo,
 * un archivo del recurso o un ancla. Cualquier otra cosa (un `javascript:`
 * pegado sin querer) se neutraliza. Moodle también lo filtraría, pero la vista
 * previa se ejecuta aquí antes que allá.
 */
function ligaSegura(url) {
    const limpia = String(url || '').trim();
    return /^(https?:\/\/|mailto:|#|@@PLUGINFILE@@\/|\.{0,2}\/)/i.test(limpia) ? escapar(limpia) : '#';
}

/** Sangría de N niveles, para que el HTML salga legible al pegarlo. */
function ind(n) { return '  '.repeat(n); }

/* Contador de los id que necesitan el acordeón y los modales de Bootstrap. Se
   reinicia en cada generación para que dos generaciones seguidas den el mismo
   HTML y el diff en Moodle sea limpio. */
let _secuencia = 0;
function reiniciarIds() { _secuencia = 0; }
function nuevoId(prefijo) { return `${prefijo}${++_secuencia}`; }

/* Modales pendientes de la generación en curso. Un modal NO puede quedar dentro
   del párrafo ni de la tarjeta que lo dispara (Bootstrap lo posiciona fijo y
   TinyMCE reacomoda lo que esté mal anidado): se sueltan al final del bloque,
   igual que en la página de referencia. */
let _modales = [];
function encolarModal(html) { _modales.push(html); }

/* Bloques que usará la ventana de un `{{palabra|Título}}` sin tercer segmento.
   Existe porque el contenido de esa ventana no cabe en una línea de texto: la
   "Tabla 1" de la presentación es una tabla entera. El componente lo enciende
   alrededor de su propio marcas() y lo apaga al salir; fuera de ahí es null y
   la marca de dos segmentos deja la ventana vacía. */
let _bloquesDeVentana = null;
function conVentanaDeBloques(bloques, hacer) {
    const previo = _bloquesDeVentana;
    _bloquesDeVentana = bloques || null;
    try { return hacer(); } finally { _bloquesDeVentana = previo; }
}

/* Dentro de una ventana ancha, una tabla usa TODO el ancho (`col-12`) en vez
   del `col-10 mx-auto` con que se publica suelta en la página. En la página ese
   margen le da aire; dentro de un `modal-xl` con cinco columnas se come el 20%
   del espacio y las celdas parten cada palabra en un renglón. Cotejado con la
   "Presentación Semana 1" montada, que ahí usa `col-12`. */
let _anchoCompleto = false;
function conAnchoCompleto(hacer) {
    const previo = _anchoCompleto;
    _anchoCompleto = true;
    try { return hacer(); } finally { _anchoCompleto = previo; }
}
function vaciarModales(n) {
    if (!_modales.length) return '';
    // La cola se vacía ANTES de armar el HTML, no después: una ventana cuyo
    // contenido son bloques (la Tabla 1 de la presentación) vuelve a entrar a
    // htmlDeBloques mientras se arma, y con el reseteo al final ese reingreso
    // encontraba la misma cola llena y se quedaba dando vueltas.
    const pendientes = _modales;
    _modales = [];
    return pendientes.map(f => f(n)).join('\n');
}

/**
 * Marcas de texto enriquecido -> HTML. Es lo que el compañero teclea sin saber
 * HTML; la barra de la herramienta las inserta por él.
 *
 *   **negritas**             -> <strong>
 *   *cursivas*               -> <em>
 *   ==resaltado==            -> <mark class="bg-resalte-20">
 *   [texto](url)             -> <a target="_blank">
 *   {{palabra|título|texto}} -> la palabra resaltada abre una ventana con ese texto
 *   {{palabra|título}}       -> la palabra resaltada abre la ventana que el
 *                               bloque trae armada con bloques (una tabla, p. ej.)
 *
 * El texto se escapa ANTES de aplicar marcas: lo que pega el usuario no puede
 * inyectar etiquetas.
 */
function marcas(texto) {
    let t = escapar(texto);

    // La ventana emergente primero: su contenido no debe volver a partirse.
    t = t.replace(/\{\{([^|{}]+)\|([^|{}]*)(?:\|([^{}]+))?\}\}/g, (_, palabra, titulo, cuerpo) => {
        const id = nuevoId('modal');
        const suelto = String(cuerpo || '').trim();
        // El closure tiene que quedarse con los bloques AHORA: la cola de
        // modales se vacía más tarde, cuando el contexto del bloque ya se apagó.
        const bloques = suelto ? null : _bloquesDeVentana;
        encolarModal(n => suelto
            // Ya viene escapado por el escapar() de arriba; volver a escaparlo
            // convertía un "&" pegado del Word en "&amp;amp;".
            ? modalBootstrap(id, titulo.trim() || palabra.trim(), `${ind(n + 1)}<p>${suelto}</p>`, n)
            : modalBootstrap(id, titulo.trim() || palabra.trim(),
                conAnchoCompleto(() => htmlDeBloques(bloques, n + 4)) || `${ind(n + 1)}<p></p>`, n, { ancha: true }));
        // NO es un botón suelto. En las páginas ya publicadas —la "Presentación
        // Semana 1" y el recurso de licencias libres— el disparador es la
        // palabra resaltada con el iconito de interactividad, que lo pinta el
        // ::after de `.interactivo` de la hoja del tema.
        return `<a class="text-decoration-none" type="button" data-bs-toggle="modal" data-bs-target="#${id}">` +
            `<mark class="${RESALTE_VENTANA} border-0"><strong class="interactivo">${palabra.trim()}</strong></mark></a>`;
    });

    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) =>
        `<a href="${ligaSegura(url)}" target="_blank" class="nomediaplugin">${txt}</a>`);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    /* Resalte por CATEGORÍA: `==verde:texto==`. No es la escala de intensidad
       de `bg-resalte-10…40` —esa dice "esto pesa más"— sino un código de
       colores: en los ejercicios de gramática cada color marca una parte de la
       oración, y llegan a salir cuatro en un mismo renglón. Por eso las clases
       son neutras al aula: si siguieran la paleta, el mismo ejercicio cambiaría
       de código entre M01 y M02 y el alumno que lleva dos módulos se perdería.
       Antes esto se escribía a mano con `style="background-color:#cee4da"`. */
    t = t.replace(/==([a-zñ]+):([^=]+)==/gi, (todo, color, txt) => {
        const clase = MARCAS_COLOR[color.toLowerCase()];
        return clase ? `<mark class="${clase} border-0">${txt}</mark>` : todo;
    });
    /* El nivel del resaltado es el que se eligió PARA LA PÁGINA, el mismo que
       usa la palabra que abre una ventana. Estaba fijo en `bg-resalte-20` y
       entonces una página con resalte 30 salía con dos intensidades distintas
       sin que nadie lo hubiera pedido; los montajes cotejados usan una sola. */
    t = t.replace(/==([^=]+)==/g, `<mark class="${RESALTE_VENTANA}">$1</mark>`);
    return t;
}

/* Los seis colores del código gramatical. El nombre es lo que teclea el
   compañero; la clase vive en la hoja de Moodle (bg-marca-1…6). */
const MARCAS_COLOR = {
    morado: 'bg-marca-1', azul: 'bg-marca-2', verde: 'bg-marca-3',
    naranja: 'bg-marca-4', rosa: 'bg-marca-5', gris: 'bg-marca-6'
};

/** Párrafos: una línea en blanco separa uno de otro; un salto simple es <br>. */
function parrafos(texto, n) {
    return String(texto || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
        .map(p => `${ind(n)}<p>${marcas(p).replace(/\n/g, '<br>')}</p>`);
}

/* -------------------------------------------------------------------------
   Piezas compartidas
   ------------------------------------------------------------------------- */

/**
 * Modal de Bootstrap, tal cual lo trae la página de referencia.
 *
 * `ops.ancha` es la variante de la "Presentación Semana 1", cuya ventana lleva
 * una tabla de cinco columnas: ahí el montaje usa `modal-dialog-centered
 * modal-xl`, `rounded-lg`, un `h3` de título y `border-top` en el cuerpo. Va
 * como opción y no como cambio: las ventanas de las tarjetas y de los tooltips
 * ya están cotejadas con `modal-lg` y no hay por qué moverlas.
 */
function modalBootstrap(id, titulo, contenidoHtml, n, ops) {
    const ancha = Boolean(ops && ops.ancha);
    return [
        `${ind(n)}<div id="${id}" class="modal fade" tabindex="-1" aria-labelledby="${id}Label" aria-hidden="true">`,
        `${ind(n + 1)}<div class="modal-dialog ${ancha ? 'modal-dialog-centered modal-xl' : 'modal-lg'}">`,
        `${ind(n + 2)}<div class="modal-content${ancha ? ' rounded-lg' : ''}">`,
        `${ind(n + 3)}<div class="modal-header">`,
        ancha
            ? `${ind(n + 4)}<h3 id="${id}Label" class="modal-title">${marcas(titulo)}</h3>`
            : `${ind(n + 4)}<h1 id="${id}Label" class="modal-title fs-4">${marcas(titulo)}</h1>`,
        `${ind(n + 4)}<button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Cerrar"></button>`,
        `${ind(n + 3)}</div>`,
        `${ind(n + 3)}<div class="modal-body${ancha ? ' border-top' : ''}">`,
        contenidoHtml,
        `${ind(n + 3)}</div>`,
        `${ind(n + 2)}</div>`,
        `${ind(n + 1)}</div>`,
        `${ind(n)}</div>`
    ].filter(l => l !== '').join('\n');
}

/* Alineación horizontal, en clases de Bootstrap. Vive aquí y no repetida en
   cada componente porque el vocabulario tiene que ser el mismo: si un dia la
   plantilla cambia de text-start a otra cosa, se cambia en un solo lugar.

   Ojo: las clases que salgan de aqui tienen que existir tambien en el CSS de la
   vista previa (vista-previa.js) o la previa mentiría. */
const ALINEACION = {
    izquierda: { texto: 'text-start', fila: 'justify-content-start' },
    centro: { texto: 'text-center', fila: 'justify-content-center' },
    derecha: { texto: 'text-end', fila: 'justify-content-end' }
};
function alineacionDe(valor) { return ALINEACION[valor] || ALINEACION.centro; }

/**
 * Alineación de un bloque de Texto, con el valor viejo entendido.
 *
 * El campo era una casilla `centrado` (sí/no) y ahora son tres valores. Se
 * normaliza aquí en vez de migrar los bloques: un `centrado: true` de antes
 * sigue significando centro.
 *
 * `destacado` manda sobre todo: ese patrón de la página real —la pregunta que
 * abre el apartado— va centrado y en negritas por definición.
 *
 * Y el valor por omisión es **izquierda**, no el `centro` de `alineacionDe()`:
 * ese default es para botones, que sí van centrados; un párrafo no.
 */
function alineacionTexto(b) {
    if (b.destacado) return 'centro';
    if (!b.alineacion && b.centrado === true) return 'centro';
    return ALINEACION[b.alineacion] ? b.alineacion : 'izquierda';
}

/* El campo, tal cual, para los componentes que lo ofrecen. */
const CAMPO_ALINEACION = {
    k: 'alineacion', tipo: 'opciones', etiqueta: 'Alineación', ops: [
        { v: 'izquierda', etiqueta: 'Izquierda', icono: 'text-align-left' },
        { v: 'centro', etiqueta: 'Centro', icono: 'text-align-center' },
        { v: 'derecha', etiqueta: 'Derecha', icono: 'text-align-right' }
    ]
};

/* Clases de columna por cantidad, copiadas de los "Bloque con contenido de N"
   de la plantilla de pestañas. NO es una cuenta de 12/N: el de 6 y el de 12
   comparten los cortes de tableta (`col-sm-6 col-md-4`) y solo se separan en
   `lg`. Calcularlo habría dado una rejilla parecida pero distinta. */
const REJILLA = {
    '2': 'col-12 col-lg-6 mb-2',
    '3': 'col-12 col-sm-6 col-lg-4 mb-2',
    '4': 'col-12 col-sm-6 col-lg-3 mb-2',
    '6': 'col-12 col-sm-6 col-md-4 col-lg-2 mb-2',
    '12': 'col-12 col-sm-6 col-md-4 col-lg-1 mb-2'
};

/* Color del botón. `primary` es el color del aula (M01, M02, M03, MM, reg) y
   `secondary` el gris fuerte; en el grupo de botones de la página publicada se
   alternan uno con otro, y por eso se elige por botón y no por bloque.

   El valor vacío cuenta como gris: los documentos hechos antes de que existiera
   este campo tienen que seguir saliendo igual. */
const CAMPO_COLOR_BOTON = {
    k: 'color', tipo: 'opciones', etiqueta: 'Color del botón',
    ayuda: '"Del tema" toma el color del aula (M01, M02…); "Gris" es el gris fuerte del montaje.',
    ops: [
        { v: 'primary', etiqueta: 'Del tema', icono: 'palette' },
        { v: 'secondary', etiqueta: 'Gris', icono: 'circle-half' }
    ]
};

/* El gris NO se escribe en el botón: llega por `.ms-convertido .btn-secondary`,
   que la hoja del aula declara como #6c757d con blanco encima. Hubo una versión
   con el hex en línea (opción "Gris fijo") y se quitó al saber que el
   contenedor lleva la clase: el hex duplicado congelaba el hover y era el mismo
   error del `#d8a7b6`. Si el gris vuelve a verse claro, lo que falta es la
   clase en el contenedor, no un color aquí. */

/* Clases del botón, copiadas de la página ya montada:

     btn btn-<color> btn-lg rounded-4 border border-4 border-primary-10

   Dos detalles que NO se deducen y que se tenían mal:

   1. El borde es `border-primary-10` en LOS DOS colores. El gris llevaba
      `border-secondary-10`, que era lo que parecía coherente y no es lo que
      hay en la página.
   2. El `margin-bottom` en línea también es del montaje, y hace falta: cuando
      la fila de botones se parte en dos renglones, sin él quedan pegados.

   El tamaño NO va aquí: es un campo (`CAMPO_TAMANO_BOTON`), porque en los
   montajes cotejados hay tres —chico, sin modificador y grande—. Lo que sí es
   fijo es el arranque: grande en el grupo de botones, chico dentro de una
   tarjeta con imagen, que es donde no cabe el grande.

   Y ya no sale `flecha_btn`: esa clase solo pinta la flechita dentro de
   `.ms-convertido`. Antes viajaba muerta —la salida no llevaba la clase—, pero
   ahora el contenedor sí la lleva y la pintaría; el grupo de botones de la
   página de referencia no trae flechita. */
/* `btn-sm` y `btn-lg` son de Bootstrap; el tamaño de en medio no lleva clase.
   Los tres salen en montajes cotejados (aa1 chico, aa3 grande, aa5 sin
   modificador), y por eso el tamaño es un campo y no una constante. */
const TAMANOS_BOTON = { chico: 'btn-sm', normal: '', grande: 'btn-lg' };

function clasesBoton(color, tamano) {
    const tam = TAMANOS_BOTON[tamano] !== undefined ? TAMANOS_BOTON[tamano] : TAMANOS_BOTON.grande;
    return ['btn', `btn-${color === 'primary' ? 'primary' : 'secondary'}`, tam,
        'rounded-4', 'border', 'border-4', 'border-primary-10'].filter(Boolean).join(' ');
}

/* El campo del tamaño, compartido por Tarjetas, Ventana emergente y Botón.
   Uno solo: duplicarlo es como se quedó vivo meses el hex repetido. */
const CAMPO_TAMANO_BOTON = {
    k: 'tamano', tipo: 'opciones', etiqueta: 'Tamaño del botón', ops: [
        { v: 'chico', etiqueta: 'Chico', icono: 'text-t' },
        { v: 'normal', etiqueta: 'Normal', icono: 'text-t' },
        { v: 'grande', etiqueta: 'Grande', icono: 'text-t' }
    ]
};

/** El `style` del botón: el margen del montaje, y nada más. */
function estiloBoton() { return 'margin-bottom: 5px;'; }

/** Botón que dispara un modal (el "Mesopotámica ▸" de las tarjetas). */
function botonModal(id, etiqueta, ops) {
    const o = ops || {};
    const texto = o.fuerte ? `<strong>${marcas(etiqueta)}</strong>` : marcas(etiqueta);
    return `<button class="${clasesBoton(o.color, o.tamano)}" style="${estiloBoton()}" ` +
        `type="button" data-bs-toggle="modal" data-bs-target="#${id}">${texto}</button>`;
}

/* Con esto encendido, cada bloque sale marcado con `data-bq="<id>"` para que la
   vista previa y el lienzo puedan señalarse mutuamente. SOLO se enciende para
   la previa: el HTML que se copia a Moodle nunca lleva el atributo. */
let MARCAR_BLOQUES = false;
function marcarBloques(activo) { MARCAR_BLOQUES = activo; }

/* Intensidad del resaltado de la palabra que abre una ventana. Va por PÁGINA y
   no por palabra a propósito: en las dos páginas ya publicadas cada una usa un
   nivel y lo usa parejo en todo el recurso —la presentación el pálido, el de
   licencias libres el fuerte—. Mezclarlos dentro de una misma página le quitaría
   el sentido, que es "esto se puede tocar". */
let RESALTE_VENTANA = 'bg-resalte-30';
function resalteDeVentana(clase) { RESALTE_VENTANA = clase || 'bg-resalte-30'; }

/* Los cuatro niveles, para el selector. Salen de la paleta del aula, así que el
   tono real cambia con el módulo; aquí solo se elige la intensidad. */
const NIVELES_RESALTE = [
    { v: 'bg-resalte-10', etiqueta: 'Muy suave', muestra: '#fff4d6' },
    { v: 'bg-resalte-20', etiqueta: 'Suave', muestra: '#ffe499' },
    { v: 'bg-resalte-30', etiqueta: 'Fuerte', muestra: '#ffd140' },
    { v: 'bg-resalte-40', etiqueta: 'Muy fuerte', muestra: '#cc9c23' }
];

/* Qué se genera. No es un detalle del contenedor: cambia QUÉ se publica.
   En una PÁGINA el envoltorio abraza todo el contenido y el
   `padding-bottom: 100px` que la hoja le da a `.mainPlantilla23` es el aire
   del final. En un recurso con archivo (PDF, video) la descripción lleva SOLO
   el título: el contenedor cierra ahí y esos 100px quedan colgando entre el
   título y el archivo que Moodle pinta debajo —el hueco que se ve en los
   recursos ya publicados—. `pb-0` es utilidad de Bootstrap (lleva
   `!important`) y le gana a la hoja del tema, que no lo lleva. */
const SALIDAS = [
    {
        v: 'completa', etiqueta: 'Página completa', icono: 'article', pb: '',
        ayuda: 'El título y todo lo que hay en el lienzo, dentro del contenedor de la plantilla.'
    },
    {
        v: 'titulo', etiqueta: 'Solo el título', icono: 'file-pdf', pb: ' pb-0',
        ayuda: 'Solo la barra del título, sin el aire de abajo: para recursos donde Moodle pinta el archivo debajo (PDF, video, carpeta).'
    }
];

/**
 * HTML de una lista de bloques (recursivo: acordeones, modales, pestañas).
 *
 * `desnudo` es para el contenido que va DENTRO de un `<li>`: ahí un
 * `.row.bloque > .col-12` alrededor de un párrafo o de una sublista rompe la
 * lista (la página real mete el `<ol type="a">` y los `<p class="text-center">`
 * pelados dentro del `<li>`). Solo lo respetan los componentes donde importa;
 * una tabla dentro de un `<li>` sí conserva su rejilla, como en el montaje real.
 */
function htmlDeBloques(bloques, n, desnudo) {
    return (bloques || []).map(b => {
        const comp = COMPONENTES[b.tipo];
        if (!comp) return '';
        let cuerpo = comp.html(b, n, desnudo);
        // Se inyecta en la primera etiqueta, no envolviendo: un <div> extra
        // cambiaría la rejilla y la previa dejaría de ser fiel.
        if (MARCAR_BLOQUES && cuerpo) cuerpo = cuerpo.replace(/^(\s*<[a-z0-9]+)/i, `$1 data-bq="${b.id}"`);
        // Los modales que haya generado este bloque (tooltips en línea) van
        // justo después de él, nunca dentro del párrafo.
        const modales = vaciarModales(n);
        return [cuerpo, modales].filter(Boolean).join('\n');
    }).filter(Boolean).join('\n');
}

/* Miniaturas de la paleta: SVG planos para reconocer la pieza de un vistazo. */
const MINI = {
    titulo: '<rect x="2" y="6" width="4" height="20" rx="2"/><rect x="10" y="9" width="26" height="5" rx="2.5" opacity=".85"/><rect x="10" y="18" width="16" height="4" rx="2" opacity=".4"/>',
    texto: '<rect x="2" y="7" width="36" height="3.5" rx="1.75" opacity=".8"/><rect x="2" y="14" width="36" height="3.5" rx="1.75" opacity=".55"/><rect x="2" y="21" width="28" height="3.5" rx="1.75" opacity=".35"/>',
    lista: '<circle cx="4" cy="9" r="2.5"/><circle cx="4" cy="17" r="2.5"/><circle cx="4" cy="25" r="2.5"/><rect x="11" y="7" width="27" height="4" rx="2" opacity=".6"/><rect x="11" y="15" width="23" height="4" rx="2" opacity=".6"/><rect x="11" y="23" width="27" height="4" rx="2" opacity=".6"/>',
    instruccion: '<rect x="1" y="6" width="38" height="20" rx="6" opacity=".28"/><rect x="1" y="6" width="11" height="20" rx="6" opacity=".85"/><path d="M5 12l4 8 1.2-3 3-1z"/><rect x="16" y="12" width="19" height="3" rx="1.5" opacity=".7"/><rect x="16" y="18" width="13" height="3" rx="1.5" opacity=".45"/>',
    imagen: '<rect x="1" y="5" width="18" height="22" rx="3" opacity=".8"/><circle cx="7" cy="12" r="2.2" fill="#fff" opacity=".9"/><path d="M2 24l5-6 4 4 3-3 4 5z" fill="#fff" opacity=".85"/><rect x="23" y="8" width="16" height="3.5" rx="1.75" opacity=".55"/><rect x="23" y="15" width="16" height="3.5" rx="1.75" opacity=".4"/><rect x="23" y="22" width="11" height="3.5" rx="1.75" opacity=".3"/>',
    tabla: '<rect x="1" y="5" width="38" height="6" rx="2" opacity=".85"/><rect x="1" y="13" width="38" height="6" rx="1" opacity=".3"/><rect x="1" y="21" width="38" height="6" rx="1" opacity=".3"/><rect x="14" y="13" width="1.6" height="14" opacity=".6"/><rect x="27" y="13" width="1.6" height="14" opacity=".6"/>',
    acordeon: '<rect x="1" y="3" width="38" height="8" rx="3" opacity=".85"/><path d="M33 6l2.5 2.5L38 6" stroke="#fff" stroke-width="1.6" fill="none" opacity=".9"/><rect x="1" y="13" width="38" height="6" rx="3" opacity=".3"/><rect x="1" y="21" width="38" height="6" rx="3" opacity=".3"/>',
    modal: '<rect x="1" y="4" width="38" height="24" rx="3" opacity=".22"/><rect x="7" y="8" width="26" height="16" rx="3" opacity=".9"/><rect x="10" y="11" width="12" height="3" rx="1.5" fill="#fff" opacity=".9"/><rect x="10" y="17" width="18" height="2.5" rx="1.25" fill="#fff" opacity=".6"/>',
    tarjetas: '<rect x="1" y="5" width="11" height="22" rx="3" opacity=".8"/><rect x="14.5" y="5" width="11" height="22" rx="3" opacity=".55"/><rect x="28" y="5" width="11" height="22" rx="3" opacity=".35"/><rect x="3" y="21" width="7" height="4" rx="2" fill="#fff" opacity=".9"/>',
    pestanas: '<rect x="1" y="4" width="13" height="7" rx="2.5" opacity=".9"/><rect x="15" y="5" width="12" height="6" rx="2.5" opacity=".35"/><rect x="28" y="5" width="11" height="6" rx="2.5" opacity=".35"/><rect x="1" y="12" width="38" height="15" rx="3" opacity=".25"/>',
    video: '<rect x="1" y="5" width="38" height="22" rx="4" opacity=".8"/><path d="M17 11l9 5-9 5z" fill="#fff"/>',
    boton: '<rect x="7" y="10" width="26" height="12" rx="6" opacity=".9"/><rect x="12" y="14.5" width="16" height="3" rx="1.5" fill="#fff" opacity=".9"/>',
    alerta: '<rect x="1" y="7" width="38" height="18" rx="4" opacity=".28"/><rect x="1" y="7" width="4" height="18" rx="2" opacity=".9"/><circle cx="12" cy="16" r="3.4" opacity=".8"/><rect x="19" y="14.5" width="18" height="3" rx="1.5" opacity=".5"/>',
    separador: '<rect x="1" y="14" width="38" height="3" rx="1.5" opacity=".5"/>',
    /* Sin <text>: el glifo de un SVG cuenta como texto del botón y el nombre de
       la pieza salía "1 2 Pasos" en la paleta y en las plantillas. */
    pasos: '<rect x="1" y="3" width="38" height="26" rx="4" opacity=".22"/><rect x="5" y="8" width="5" height="5" rx="1.5" opacity=".9"/><rect x="5" y="19" width="5" height="5" rx="1.5" opacity=".9"/><rect x="13" y="8.5" width="22" height="4" rx="2" opacity=".6"/><rect x="13" y="19.5" width="18" height="4" rx="2" opacity=".6"/>',
    conversacion: '<rect x="1" y="4" width="22" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2" opacity=".9"/><rect x="5" y="8" width="13" height="2.4" rx="1.2" opacity=".55"/><rect x="5" y="12.5" width="9" height="2.4" rx="1.2" opacity=".55"/><rect x="26" y="12" width="13" height="14" rx="2" opacity=".35"/>',
    crudo: '<rect x="1" y="6" width="38" height="20" rx="3" opacity=".22"/><path d="M12 11l-4 5 4 5M28 11l4 5-4 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/><path d="M22 10l-4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity=".5"/>',
    envolvente: '<rect x="2" y="5" width="36" height="7" rx="2" opacity=".85"/><rect x="2" y="12" width="36" height="15" rx="2" opacity=".25"/><rect x="6" y="16" width="28" height="2.6" rx="1.3" opacity=".5"/><rect x="6" y="21" width="20" height="2.6" rx="1.3" opacity=".5"/>',
    columnas: '<rect x="1" y="5" width="11" height="22" rx="2" opacity=".75"/><rect x="14.5" y="5" width="11" height="22" rx="2" opacity=".5"/><rect x="28" y="5" width="11" height="22" rx="2" opacity=".3"/>',
    escribir: '<rect x="1" y="8" width="13" height="3" rx="1.5" opacity=".6"/><rect x="16" y="5" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".9"/><rect x="1" y="21" width="9" height="3" rx="1.5" opacity=".6"/><rect x="12" y="18" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".9"/>',
    /* Título con su barra a la izquierda y, al lado, el recuadro con su banda. */
    presentacion: '<rect x="1" y="5" width="2.5" height="9" rx="1.25" opacity=".9"/><rect x="6" y="6" width="16" height="4" rx="2" opacity=".85"/><rect x="1" y="17" width="21" height="2.6" rx="1.3" opacity=".45"/><rect x="1" y="22" width="17" height="2.6" rx="1.3" opacity=".45"/><rect x="26" y="5" width="13" height="4.5" rx="1.5" opacity=".8"/><rect x="26" y="11" width="13" height="16" rx="1.5" opacity=".25"/>'
};

/* -------------------------------------------------------------------------
   El catálogo
   ------------------------------------------------------------------------- */

/**
 * Tono de la primera columna de una tabla. Tres valores y una historia:
 *
 * · `'alternado'` — rosa/verde fila por fila. Es lo que hace el montaje de las
 *   tablas normales del equipo (y el Convertidor de Tablas), por eso el
 *   importador de Word lo enciende.
 * · `'plano'` — `bg-secondary-10` en TODAS las filas. Es lo que trae la Tabla 1
 *   de la presentación de la semana en las páginas publicadas (cotejado con un
 *   montaje de MM y otro de M03: las dos filas llevan el mismo tono).
 * · `'no'` — sin color.
 *
 * El campo era una casilla y guardaba `true`/`false`. Se normaliza aquí en vez
 * de migrar los bloques: un `true` viejo sigue significando alternado.
 */
function tonoPrimeraColumna(b) {
    if (b.colorear === true) return 'alternado';
    return (b.colorear === 'alternado' || b.colorear === 'plano') ? b.colorear : 'no';
}

const COMPONENTES = {

    /* ---- Presentación de la semana ----
       El encabezado que abre toda página de presentación: a la izquierda el
       antetítulo ("Presentación de la Semana 1"), el título grande y los
       párrafos; a la derecha el recuadro gris de los contenidos de aprendizaje,
       con su banda de color arriba. Copiado nodo por nodo de la página
       "Presentación Semana 1" ya publicada.

       No es un título + un texto + una tarjeta sueltos: las dos columnas son
       del MISMO `.row.bloque`, y esa es justamente la parte que a mano sale
       mal. Por eso va como una pieza y no como tres.

       Ojo: trae su propio h1. Si se usa este bloque, el campo "Título de la
       página" de la barra de arriba va vacío, o la página sale con dos. */
    presentacion: {
        nombre: 'Presentación',
        ayuda: 'Título a la izquierda y recuadro de contenidos a la derecha',
        icono: 'layout',
        mini: MINI.presentacion,
        nuevo: () => ({
            antetitulo: 'Presentación de la Semana 1',
            titulo: 'Título de la semana',
            texto: 'Durante esta semana iniciarás tu recorrido por el submódulo; para ello, tendrás a tu disposición recursos que te permitirán…\n\nComo parte de tu proceso de aprendizaje, desarrollarás…',
            tarjeta: true,
            tituloTarjeta: 'Contenidos de aprendizaje',
            textoTarjeta: 'Cada submódulo cuenta con contenidos de aprendizaje donde se abordan los contenidos formativos que te permitirán la realización de tus actividades de aprendizaje, así como de cuestionarios formativos y socioemocionales. Comprender cómo se organizan para tus lecturas semanales te permitirá avanzar con mayor claridad.\n\nPuedes consultar la {{Tabla 1|Tabla 1. Distribución de contenidos de aprendizaje}} para verificar cómo se encuentran distribuidos según su alcance formativo.\n\nHaz clic en **[contenido de aprendizaje](@@PLUGINFILE@@/contenido.pdf)** para ir a tu lectura.',
            // La ventana de la "Tabla 1" llega armada: es la misma en todas las
            // presentaciones y montarla desde cero era lo más tardado.
            hijos: [Object.assign({ tipo: 'tabla', abierto: false }, COMPONENTES.tabla.nuevo(), {
                titulo: '',
                banda: 'Contenido de Aprendizaje 1',
                encabezados: ['Semana', 'Nombre', 'Propósito formativo', 'Contenidos formativos', 'Contenido del ámbito de formación socioemocional'],
                filas: [['1', '', '', '', ''], ['2', '', '', '', '']],
                // 'plano': las dos filas de la Tabla 1 publicada llevan el mismo tono.
                colorear: 'plano', encabezadoColor: true
            })]
        }),
        resumen: b => b.titulo,
        campos: [
            {
                k: 'antetitulo', tipo: 'texto', etiqueta: 'Antetítulo',
                marcador: 'Presentación de la Semana 1'
            },
            {
                k: 'titulo', tipo: 'texto', etiqueta: 'Título de la semana',
                ayuda: 'El grande, con la barra de color. Deja vacío el "Título de la página" de arriba para no repetirlo.'
            },
            { k: 'texto', tipo: 'rico', etiqueta: 'Párrafos de la izquierda', filas: 6 },
            { k: 'tarjeta', tipo: 'check', etiqueta: 'Recuadro de contenidos a la derecha' },
            {
                k: 'tituloTarjeta', tipo: 'texto', etiqueta: 'Título del recuadro',
                marcador: 'Contenidos de aprendizaje', siOculta: b => !b.tarjeta
            },
            {
                k: 'textoTarjeta', tipo: 'rico', etiqueta: 'Texto del recuadro', filas: 7,
                siOculta: b => !b.tarjeta,
                ayuda: 'Sale en letra chica. La marca {{Tabla 1|Título de la ventana}} —sin tercer segmento— convierte esa palabra en el resaltado que abre la ventana de abajo.'
            },
            {
                k: 'hijos', tipo: 'hijos', etiqueta: 'Contenido de la ventana (la Tabla 1)',
                siOculta: b => !b.tarjeta
            }
        ],
        html: (b, n) => {
            const partes = [
                `${ind(n)}<div class="row bloque">`,
                `${ind(n + 1)}<div class="col-12 col-lg-8">`,
                `${ind(n + 2)}<div class="tituloUnidad">`
            ];
            if ((b.antetitulo || '').trim()) {
                partes.push(`${ind(n + 3)}<h5 class="mb-3">${marcas(b.antetitulo)}</h5>`);
            }
            partes.push(
                `${ind(n + 3)}<h1 class="text-primary">${marcas(b.titulo || '')}</h1>`,
                `${ind(n + 2)}</div>`,
                // El <hr> va DENTRO de la columna, debajo del título: es lo que
                // separa el encabezado de los párrafos en la página publicada.
                `${ind(n + 2)}<hr>`,
                ...parrafos(b.texto, n + 2),
                `${ind(n + 1)}</div>`
            );

            if (b.tarjeta) {
                // El texto del recuadro se arma con la ventana del bloque
                // encendida: ahí es donde un {{Tabla 1|…}} de dos segmentos
                // encuentra los bloques con los que llenarla.
                const cuerpo = conVentanaDeBloques(b.hijos, () =>
                    String(b.textoTarjeta || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
                        .map(p => `${ind(n + 4)}<p><small>${marcas(p).replace(/\n/g, '<br>')}</small></p>`));
                partes.push(
                    `${ind(n + 1)}<div class="col-lg-4 d-flex align-items-center">`,
                    `${ind(n + 2)}<div class="card-body">`,
                    `${ind(n + 3)}<div class="card-header bg-primary-10 p-2 col-8"><span class="mx-3"><small><strong>${marcas(b.tituloTarjeta || '')}</strong></small></span></div>`,
                    `${ind(n + 3)}<div class="card-text bg-neutral-claro-50 p-4">`,
                    ...cuerpo,
                    `${ind(n + 3)}</div>`,
                    `${ind(n + 2)}</div>`,
                    `${ind(n + 1)}</div>`
                );
            }
            partes.push(`${ind(n)}</div>`);
            return partes.join('\n');
        }
    },

    /* ---- Título ---- */
    titulo: {
        nombre: 'Título',
        ayuda: 'Encabezado con la barra de color a la izquierda',
        icono: 'text-h',
        mini: MINI.titulo,
        nuevo: () => ({ nivel: 'h2', texto: 'Nuevo título' }),
        resumen: b => b.texto,
        campos: [
            { k: 'texto', tipo: 'texto', etiqueta: 'Texto del título' },
            {
                k: 'nivel', tipo: 'opciones', etiqueta: 'Jerarquía', ops: [
                    { v: 'h1', etiqueta: 'Principal', icono: 'text-h-one' },
                    { v: 'h2', etiqueta: 'Sección', icono: 'text-h-two' }
                ]
            }
        ],
        html: (b, n) => {
            // Los dos niveles NO llevan el mismo envoltorio en las páginas del
            // equipo: el h1 va dentro de un .col-12 y el h2 de sección cuelga
            // directo del .row con .mt-4 (es lo que le da el aire de arriba).
            if (b.nivel === 'h1') {
                return [
                    `${ind(n)}<div class="row bloque">`,
                    `${ind(n + 1)}<div class="col-12">`,
                    `${ind(n + 2)}<div class="tituloUnidad">`,
                    `${ind(n + 3)}<h1 class="text-primary">${marcas(b.texto || '')}</h1>`,
                    `${ind(n + 2)}</div>`,
                    `${ind(n + 1)}</div>`,
                    `${ind(n)}</div>`
                ].join('\n');
            }
            return [
                `${ind(n)}<div class="row bloque">`,
                `${ind(n + 1)}<div class="tituloUnidad mt-4">`,
                `${ind(n + 2)}<h2 class="text-primary">${marcas(b.texto || '')}</h2>`,
                `${ind(n + 1)}</div>`,
                `${ind(n)}</div>`
            ].join('\n');
        }
    },

    /* ---- Párrafos ---- */
    texto: {
        nombre: 'Texto',
        ayuda: 'Párrafos con negritas, enlaces y ventanas emergentes',
        icono: 'text-align-left',
        mini: MINI.texto,
        nuevo: () => ({ texto: '', destacado: false, alineacion: 'izquierda' }),
        resumen: b => (b.texto || '').replace(/\s+/g, ' '),
        /* La alineación va en la BARRA del campo, no como campo aparte: es
           donde la busca quien viene del editor de Moodle. Lo dice este campo y
           lo dibuja barraDeMarcas(); el valor vive en `b.alineacion`. */
        alineaTexto: 'texto',
        campos: [
            { k: 'texto', tipo: 'rico', etiqueta: 'Texto', filas: 4, marcador: 'Escribe aquí. Una línea en blanco separa párrafos.' },
            { k: 'destacado', tipo: 'check', etiqueta: 'Centrado y en negritas (la pregunta que abre el apartado)' }
        ],
        html: (b, n, desnudo) => {
            if (!(b.texto || '').trim()) return '';
            const trozos = String(b.texto).split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

            /* Dentro de un <li> los párrafos van pelados: así los publica la
               página real ("Apellidos_Nombre_SM02S1AA1" centrado dentro del paso
               "Guarda el archivo…"). Un .row.bloque ahí rompería la lista. */
            const alin = alineacionTexto(b);
            /* Izquierda NO escribe `text-start`: es el default del navegador y
               ponerlo cambiaría el HTML de todos los bloques que ya salían bien
               sin ganar nada. Solo se escribe la clase cuando desvía. */
            const claseAlin = alin === 'izquierda' ? '' : ALINEACION[alin].texto;

            if (desnudo) {
                const clase = claseAlin ? ` class="${claseAlin}"` : '';
                return trozos.map(p => `${ind(n)}<p${clase}>${b.destacado
                    ? `<strong>${marcas(p)}</strong>` : marcas(p).replace(/\n/g, '<br>')}</p>`).join('\n');
            }

            // El "destacado" es el patrón de la página real: la pregunta que
            // abre cada apartado va centrada y en negritas dentro de .my-2.
            if (b.destacado) {
                return [
                    `${ind(n)}<div class="row bloque">`,
                    `${ind(n + 1)}<div class="my-2 text-center">`,
                    ...trozos.map(p => `${ind(n + 2)}<p><strong>${marcas(p)}</strong></p>`),
                    `${ind(n + 1)}</div>`,
                    `${ind(n)}</div>`
                ].join('\n');
            }
            const cuerpo = claseAlin
                ? trozos.map(p => `${ind(n + 2)}<p class="${claseAlin}">${marcas(p).replace(/\n/g, '<br>')}</p>`)
                : parrafos(b.texto, n + 2);
            return [
                `${ind(n)}<div class="row bloque">`,
                `${ind(n + 1)}<div class="col-12">`,
                ...cuerpo,
                `${ind(n + 1)}</div>`,
                `${ind(n)}</div>`
            ].join('\n');
        }
    },

    /* ---- Lista ---- */
    lista: {
        nombre: 'Lista',
        ayuda: 'Viñetas o numeración',
        icono: 'list-bullets',
        mini: MINI.lista,
        nuevo: () => ({ estilo: 'vinetas', items: ['', ''] }),
        resumen: b => (b.items || []).filter(t => String(t).trim()).length + ' elementos',
        campos: [
            {
                k: 'estilo', tipo: 'opciones', etiqueta: 'Estilo', ops: [
                    { v: 'vinetas', etiqueta: 'Viñetas', icono: 'list-bullets' },
                    { v: 'numerada', etiqueta: '1, 2, 3', icono: 'list-numbers' },
                    { v: 'letras', etiqueta: 'a, b, c', icono: 'text-aa' },
                    /* La romana la trae Word (`lowerRoman`) y docx.js ya la
                       distingue; sin esta opción el guion la aplanaba a 1, 2, 3.
                       `type="i"` es HTML de siempre: no necesita clase del tema. */
                    { v: 'romana', etiqueta: 'i, ii, iii', icono: 'text-italic' }
                ]
            },
            { k: 'items', tipo: 'renglones', etiqueta: 'Elementos', marcador: 'Un elemento por renglón' }
        ],
        html: (b, n, desnudo) => {
            const items = (b.items || []).map(t => String(t).trim()).filter(Boolean);
            if (!items.length) return '';
            const et = b.estilo === 'vinetas' ? 'ul' : 'ol';
            const tipo = b.estilo === 'letras' ? ' type="a"' : (b.estilo === 'romana' ? ' type="i"' : '');
            /* Dentro de un <li> la sublista va pelada y SIN .estiloLista: así es
               el `<ol type="a">` de la página real, y la clase del padre ya le da
               el estilo. Envolverla en .row.bloque la sacaría de su punto. */
            if (desnudo) {
                return [
                    `${ind(n)}<${et}${tipo}>`,
                    ...items.map(t => `${ind(n + 1)}<li>${marcas(t)}</li>`),
                    `${ind(n)}</${et}>`
                ].join('\n');
            }
            return [
                `${ind(n)}<div class="row bloque">`,
                `${ind(n + 1)}<div class="col-12">`,
                `${ind(n + 2)}<${et} class="estiloLista"${tipo}>`,
                ...items.map(t => `${ind(n + 3)}<li>${marcas(t)}</li>`),
                `${ind(n + 2)}</${et}>`,
                `${ind(n + 1)}</div>`,
                `${ind(n)}</div>`
            ].join('\n');
        }
    },

    /* ---- Pasos de la actividad (la lista numerada en su caja de color) ----

       Es LA pieza de las actividades de aprendizaje: la "Ruta de aprendizaje"
       va en una caja rosa con una lista numerada, y cada paso puede llevar
       colgada una tabla, una sublista a, b, c o una nomenclatura centrada. Con
       el bloque `lista` no se podía: sus elementos son texto plano, así que la
       tabla del paso 5 salía como bloque hermano y el guion perdía el orden. */
    pasos: {
        nombre: 'Pasos',
        ayuda: 'La lista numerada de la actividad, en su caja de color; cada paso admite tabla, sublista o texto centrado',
        icono: 'list-numbers',
        mini: MINI.pasos,
        nuevo: () => ({ caja: true, items: [{ texto: '', hijos: [] }] }),
        resumen: b => `${(b.items || []).length} pasos`,
        campos: [
            { k: 'caja', tipo: 'check', etiqueta: 'Dentro de la caja de color (como la Ruta de aprendizaje)' },
            {
                k: 'items', tipo: 'repetible', etiqueta: 'Pasos', nombreItem: 'Paso',
                nuevo: () => ({ texto: '', hijos: [] }),
                campos: [{ k: 'texto', tipo: 'rico', etiqueta: 'Texto del paso', filas: 2, marcador: 'Identifica qué ocurre con…' }],
                hijos: true
            }
        ],
        html: (b, n) => {
            const items = (b.items || []).filter(it => (it.texto || '').trim() || (it.hijos || []).length);
            if (!items.length) return '';

            const nLista = b.caja ? n + 4 : n + 2;
            const partes = [
                `${ind(n)}<div class="row bloque">`,
                `${ind(n + 1)}<div class="col-12">`
            ];
            if (b.caja) {
                partes.push(
                    `${ind(n + 2)}<div class="card-body col-sm-12 p-4 bg-primary-10 rounded-2">`,
                    `${ind(n + 3)}<div class="card-text">`);
            }
            partes.push(`${ind(nLista)}<ol class="estiloLista">`);
            items.forEach(it => {
                // El contenido del paso va DENTRO del <li> y en modo desnudo: la
                // sublista y los párrafos centrados van pelados, la tabla sí
                // conserva su rejilla (así está en la página de referencia).
                const dentro = htmlDeBloques(it.hijos, nLista + 2, true);
                if (dentro) {
                    partes.push(`${ind(nLista + 1)}<li>${marcas(it.texto || '')}`, dentro, `${ind(nLista + 1)}</li>`);
                } else {
                    partes.push(`${ind(nLista + 1)}<li>${marcas(it.texto || '')}</li>`);
                }
            });
            partes.push(`${ind(nLista)}</ol>`);
            if (b.caja) partes.push(`${ind(n + 3)}</div>`, `${ind(n + 2)}</div>`);
            partes.push(`${ind(n + 1)}</div>`, `${ind(n)}</div>`);
            return partes.join('\n');
        }
    },

    /* ---- Caja de instrucción (la amarilla con el icono de clic) ---- */
    instruccion: {
        nombre: 'Instrucción',
        ayuda: 'La caja amarilla de "Haz clic en…"',
        icono: 'cursor-click',
        mini: MINI.instruccion,
        nuevo: () => ({ texto: 'Haz clic en las pestañas de este recurso para conocer más información', icono: '' }),
        resumen: b => b.texto,
        campos: [
            { k: 'texto', tipo: 'rico', etiqueta: 'Indicación', filas: 2 },
            {
                k: 'icono', tipo: 'url', imagen: true, etiqueta: 'Icono (opcional)', marcador: '@@PLUGINFILE@@/clic.png',
                ayuda: 'El icono del cursor. Súbelo al editor con ese nombre; si lo dejas vacío se usa clic.png.'
            }
        ],
        html: (b, n) => {
            const src = (b.icono || '@@PLUGINFILE@@/clic.png').trim();
            return [
                `${ind(n)}<div class="row justify-content-center bloque">`,
                `${ind(n + 1)}<div class="col-12 col-md-6">`,
                `${ind(n + 2)}<div class="instrucciones d-flex align-items-center bg-resalte-10">`,
                `${ind(n + 3)}<div class="icono-instruccion bg-resalte-30 me-2 mr-2 align-self-stretch d-flex align-items-center" style="flex-shrink: 0;">`,
                `${ind(n + 4)}<img class="img-fluid" src="${ligaSegura(src)}" width="26" height="26" alt="">`,
                `${ind(n + 3)}</div>`,
                `${ind(n + 3)}<p class="m-0 p-3">${marcas(b.texto || '')}</p>`,
                `${ind(n + 2)}</div>`,
                `${ind(n + 1)}</div>`,
                `${ind(n)}</div>`
            ].join('\n');
        }
    },

    /* ---- Imagen (sola, con pie, o con texto al lado) ---- */
    imagen: {
        nombre: 'Imagen',
        ayuda: 'Sola, con pie de figura, o con el texto a un lado',
        icono: 'image',
        mini: MINI.imagen,
        nuevo: () => ({ src: '', alt: '', pie: '', nota: '', lado: 'derecha', texto: '' }),
        resumen: b => b.alt || b.src || 'sin imagen',
        campos: [
            { k: 'src', tipo: 'url', imagen: true, etiqueta: 'Archivo o URL', marcador: '@@PLUGINFILE@@/imagen.png' },
            { k: 'alt', tipo: 'texto', etiqueta: 'Texto alternativo', ayuda: 'Lo lee el lector de pantalla. Describe la imagen; no empieces con "imagen de…".' },
            {
                k: 'lado', tipo: 'opciones', etiqueta: 'Acomodo', ops: [
                    { v: 'sola', etiqueta: 'Sola', icono: 'image-square' },
                    { v: 'derecha', etiqueta: 'Imagen a la derecha', icono: 'text-columns' },
                    { v: 'izquierda', etiqueta: 'Imagen a la izquierda', icono: 'columns' }
                ]
            },
            { k: 'texto', tipo: 'rico', etiqueta: 'Texto que la acompaña', filas: 3, siOculta: b => b.lado === 'sola' },
            { k: 'pie', tipo: 'texto', etiqueta: 'Encabezado de figura (opcional)', marcador: 'Figura 1. Ciencia y tecnología' },
            { k: 'nota', tipo: 'texto', etiqueta: 'Nota al pie (opcional)', marcador: 'Nota. Elaboración propia (2026).' }
        ],
        html: (b, n) => {
            const src = (b.src || '').trim();
            const conTexto = b.lado !== 'sola' && (b.texto || '').trim();
            if (!src && !conTexto) return '';

            /* La figura con encabezado usa la tarjeta .img-contenedor de la
               página real; sin encabezado va la imagen suelta.

               `centrada` es para la imagen SOLA y sin encabezado. El envoltorio
               (`.col-md-8.mx-auto`) centra la COLUMNA, no lo que va dentro: una
               imagen más angosta que esa columna se pegaba a su orilla
               izquierda. Con encabezado no pasaba —la `.card-deck` ocupa el
               ancho—, y de ahí que la misma figura saliera centrada o no según
               si el guion le había puesto "Figura N." encima. Eso era la
               inconsistencia: en el guion TODAS las figuras vienen centradas
               (`w:jc="center"`, sin una sola excepción en los cotejados). */
            const figura = (nivel, centrada) => {
                const clases = [b.pie ? 'card-img-top' : '', 'img-fluid',
                    !b.pie && centrada ? 'd-block mx-auto' : ''].filter(Boolean).join(' ');
                const img = `${ind(nivel + (b.pie ? 2 : 0))}<img class="${clases}" src="${ligaSegura(src)}" alt="${escapar(b.alt || '')}">`;
                if (!b.pie) return img;
                return [
                    `${ind(nivel)}<div class="card-deck">`,
                    `${ind(nivel + 1)}<div class="card img-contenedor">`,
                    `${ind(nivel + 2)}<div class="card-header notas-tabla text-muted">${marcas(b.pie)}</div>`,
                    img,
                    `${ind(nivel + 1)}</div>`,
                    `${ind(nivel)}</div>`
                ].join('\n');
            };
            const nota = nivel => (b.nota || '').trim()
                ? `${ind(nivel)}<p class="text-muted">${marcas(b.nota)}</p>` : '';

            if (!conTexto) {
                return [
                    `${ind(n)}<div class="row bloque justify-content-center">`,
                    `${ind(n + 1)}<div class="col-12 col-md-8 mx-auto">`,
                    figura(n + 2, true),
                    nota(n + 2),
                    `${ind(n + 1)}</div>`,
                    `${ind(n)}</div>`
                ].filter(Boolean).join('\n');
            }

            const colTexto = [
                `${ind(n + 1)}<div class="col-8">`,
                ...parrafos(b.texto, n + 2),
                `${ind(n + 1)}</div>`
            ].join('\n');
            const colImagen = [
                `${ind(n + 1)}<div class="col-4 col-md-3">`,
                figura(n + 2),
                nota(n + 2),
                `${ind(n + 1)}</div>`
            ].filter(Boolean).join('\n');

            return [
                `${ind(n)}<div class="row bloque mt-3 align-items-center">`,
                b.lado === 'izquierda' ? colImagen : colTexto,
                b.lado === 'izquierda' ? colTexto : colImagen,
                `${ind(n)}</div>`
            ].join('\n');
        }
    },

    /* ---- Tabla ---- */
    tabla: {
        nombre: 'Tabla',
        ayuda: 'Con encabezados; en celular se vuelve tarjetas',
        icono: 'table',
        mini: MINI.tabla,
        nuevo: () => ({
            encabezados: ['Columna 1', 'Columna 2'],
            filas: [['', ''], ['', '']],
            colorear: 'no', tarjetas: true, titulo: '', encabezadoColor: false, banda: '',
            anchos: 'auto', anchoCols: []
        }),
        resumen: b => `${(b.filas || []).length} filas × ${(b.encabezados || []).length} columnas`,
        campos: [
            {
                k: 'titulo', tipo: 'texto', etiqueta: 'Título gris, ARRIBA de la tabla (opcional)',
                marcador: 'Tabla 1. Aportaciones',
                ayuda: 'La banda gris que va fuera de la tabla, con el texto en gris claro. Es la que llevan casi todas las tablas del equipo: "Tabla 1. …".'
            },
            {
                k: 'banda', tipo: 'texto', etiqueta: 'Banda de color, DENTRO del encabezado (opcional)',
                marcador: 'Contenido de Aprendizaje 1',
                ayuda: 'El renglón de COLOR que cruza todas las columnas, ya dentro de la tabla y encima de los títulos. No es el gris de arriba: ese es el campo anterior.'
            },
            { k: 'rejilla', tipo: 'rejilla', etiqueta: 'Contenido' },
            {
                k: 'anchos', tipo: 'opciones', etiqueta: 'Ancho de las columnas',
                ayuda: '«Automático» deja que el navegador reparta según el texto, y es lo que hace que una columna corta salga apretada aunque sobre espacio. «Parejas» las hace todas iguales. «A la medida» abre una casilla de % sobre cada columna, ahí arriba en el Contenido.',
                ops: [
                    { v: 'auto', etiqueta: 'Automático', icono: 'magic-wand' },
                    { v: 'parejo', etiqueta: 'Parejas', icono: 'columns' },
                    { v: 'medida', etiqueta: 'A la medida', icono: 'ruler' }
                ]
            },
            {
                k: 'tarjetas', tipo: 'check',
                etiqueta: 'En celular, cada fila como tarjeta (recomendado)'
            },
            {
                k: 'colorear', tipo: 'opciones', etiqueta: 'Color de la primera columna',
                ops: [
                    { v: 'no', etiqueta: 'Sin color', icono: 'minus' },
                    { v: 'alternado', etiqueta: 'Alternado', icono: 'rows' },
                    { v: 'plano', etiqueta: 'Un solo tono', icono: 'square' }
                ],
                ayuda: '«Alternado» va cambiando de tono fila por fila: es lo que hacen las tablas normales del equipo. «Un solo tono» pinta todas las filas del segundo color, que es lo que trae la Tabla 1 de la presentación de la semana en las páginas publicadas. Los dos colores salen de la paleta del aula, nunca de un hex.'
            },
            {
                k: 'encabezadoColor', tipo: 'check',
                etiqueta: 'Encabezado con el color del aula',
                ayuda: 'Apagado, el encabezado sale blanco: es lo que hacen las páginas ya publicadas. El montaje pone el color en el <thead> y Bootstrap lo tapa con el fondo de cada celda, así que ahí nunca se vio. Encendido, la clase va también en las celdas y sí se pinta —con el color de la paleta elegida arriba, sea reg, MM o la del módulo—.'
            }
        ],
        html: (b, n) => {
            const enc = (b.encabezados || []);
            const filas = b.filas || [];
            if (!enc.length) return '';
            /* MW-auto no es decorativa: la hoja pone
               `.mainPlantilla23 .table td { min-width: 200px }`, o sea 1000px de
               ancho mínimo en una tabla de cinco columnas, y ahí la tabla ya no
               puede encoger. `.table.MW-auto td { min-width: auto }` lo suelta.
               El montaje publicado la trae siempre. */
            const clases = ['table', 'table-bordered', 'MW-auto'];
            if (b.tarjetas) clases.push('tabla-responsive-cards');

            // Envoltorio cotejado con la página publicada: .mt-3 y .col-10
            // (con .col-md-8 la tabla de 4 columnas salía estrecha y las celdas
            // partían cada palabra en un renglón).
            const partes = [
                `${ind(n)}<div class="row bloque mt-3">`,
                `${ind(n + 1)}<div class="${_anchoCompleto ? 'col-12' : 'col-10 mx-auto'}">`,
                `${ind(n + 2)}<div class="table-responsive">`
            ];
            // El encabezado de la tabla es una banda gris con el texto centrado,
            // no un .card-header: eso es lo que hace el montaje del equipo.
            if ((b.titulo || '').trim()) {
                partes.push(
                    `${ind(n + 3)}<div class="container-fluid bg-neutral-claro-50 border border-neutral-claro-50 rounded-1 rounded-top">`,
                    `${ind(n + 4)}<p class="text-muted my-2 text-center">${marcas(b.titulo)}</p>`,
                    `${ind(n + 3)}</div>`);
            }
            partes.push(
                `${ind(n + 3)}<table class="${clases.join(' ')}">`,
                `${ind(n + 4)}<thead class="thead bg-primary-20">`);
            /* La banda que cruza todas las columnas ("Contenido de Aprendizaje 1").
               Va en su propio <tr> con un solo <th colspan>, tal cual el montaje.
               Lleva el color SIEMPRE, sin depender de la casilla de abajo: en la
               página publicada la banda se ve de color y los títulos no. */
            if ((b.banda || '').trim()) {
                partes.push(
                    `${ind(n + 5)}<tr>`,
                    `${ind(n + 6)}<th class="text-center bg-primary-20" colspan="${enc.length}">${marcas(b.banda)}</th>`,
                    `${ind(n + 5)}</tr>`);
            }
            partes.push(`${ind(n + 5)}<tr>`);
            /* El bg-primary-20 del <thead> viene del montaje real y se queda, pero
               ahí NO se ve: Bootstrap pinta el fondo en cada celda y la tapa. Para
               que el encabezado salga de color hay que repetir la clase en los
               <th>. Va como opción y apagada por omisión, para no separar las
               tablas nuevas de las páginas ya publicadas.

               ⚠️ La clase que va aquí es `bg-primary-10`, NO la `bg-primary-20`
               del <thead>. Cotejado con dos montajes publicados (uno de MM, otro
               de M03): la banda del colspan lleva el -20 y la fila de títulos el
               -10, que es un tono más claro. Repetir el -20 dejaba la banda y los
               títulos del mismo color, y en MM eso se nota muchísimo (el -20 es
               el rosa fuerte #d8a7b6 y el -10 casi blanco). El color no se
               escribe: sale de --primary-10 y sigue a la paleta del aula.

               La clase `thead` en el <th> también es del montaje. No pinta nada
               —la hoja no la declara—, pero se conserva para que el HTML siga
               siendo comparable línea por línea con la página publicada. */
            const claseTh = 'thead text-center align-middle' + (b.encabezadoColor ? ' bg-primary-10' : '');
            /* El ancho va en el <th> y en por ciento, no en la <table> ni en un
               <colgroup>: es donde lo escribe el propio TinyMCE al redimensionar
               una columna a mano, así que es lo único que se sabe que sobrevive
               al editor de Moodle. En celular ni se nota —`.tabla-responsive-cards
               thead { display: none }` y las celdas pasan a bloque—. */
            const anchos = anchosDeTabla(b, enc.length);
            enc.forEach((t, c) => partes.push(
                `${ind(n + 6)}<th scope="col" class="${claseTh}"` +
                `${anchos[c] ? ` style="width: ${anchos[c]}%;"` : ''}>${marcas(t)}</th>`));
            partes.push(`${ind(n + 5)}</tr>`, `${ind(n + 4)}</thead>`, `${ind(n + 4)}<tbody>`);

            const tono = tonoPrimeraColumna(b);
            filas.forEach((fila, i) => {
                partes.push(`${ind(n + 5)}<tr class="align-middle">`);
                enc.forEach((titulo, c) => {
                    const color = tono === 'plano'
                        ? 'bg-secondary-10'
                        : (i % 2 === 0 ? 'bg-primary-10' : 'bg-secondary-10');
                    const clase = tono !== 'no' && c === 0 ? ` class="${color}"` : '';
                    partes.push(`${ind(n + 6)}<td${clase} data-label="${escapar(titulo)}">${marcas(fila[c] || '')}</td>`);
                });
                partes.push(`${ind(n + 5)}</tr>`);
            });

            partes.push(`${ind(n + 4)}</tbody>`, `${ind(n + 3)}</table>`);
            /* Aviso de scroll: va SIEMPRE, como en la página publicada. No pelea
               con el modo tarjetas —solo se muestra entre 576px y 768px, y las
               tarjetas empiezan por debajo de 576—: es justo la franja donde la
               tabla se desborda sin haberse vuelto tarjetas todavía. */
            partes.push(
                `${ind(n + 3)}<div class="indicador-scroll d-none d-sm-block d-md-none">`,
                `${ind(n + 4)}<i class="texto-scroll">Scroll a la derecha para ver más</i>`,
                `${ind(n + 4)}<div class="flecha-scroll">...</div>`,
                `${ind(n + 3)}</div>`);
            partes.push(`${ind(n + 2)}</div>`, `${ind(n + 1)}</div>`, `${ind(n)}</div>`);
            return partes.join('\n');
        }
    },

    /* ---- Acordeón ---- */
    acordeon: {
        nombre: 'Acordeón',
        ayuda: 'Apartados plegables; cada uno lleva su propio contenido',
        icono: 'rows',
        mini: MINI.acordeon,
        nuevo: () => ({ items: [{ titulo: 'Primer apartado', hijos: [] }] }),
        resumen: b => `${(b.items || []).length} apartados`,
        campos: [
            {
                k: 'items', tipo: 'repetible', etiqueta: 'Apartados', nombreItem: 'Apartado',
                nuevo: () => ({ titulo: 'Nuevo apartado', hijos: [] }),
                campos: [{ k: 'titulo', tipo: 'texto', etiqueta: 'Título visible' }],
                hijos: true
            }
        ],
        html: (b, n) => {
            const items = b.items || [];
            if (!items.length) return '';
            const idAcordeon = nuevoId('acordeon');
            const partes = [`${ind(n)}<div id="${idAcordeon}" class="accordion mt-3">`];
            items.forEach(item => {
                const idPanel = nuevoId('collapse');
                const idCabeza = `heading${idPanel}`;
                partes.push(
                    `${ind(n + 1)}<div class="accordion-item">`,
                    `${ind(n + 2)}<h2 id="${idCabeza}" class="accordion-header">`,
                    `${ind(n + 3)}<button class="accordion-button bg-neutral-claro-50 text-primary collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${idPanel}" aria-expanded="false" aria-controls="${idPanel}">${marcas(item.titulo || '')}</button>`,
                    `${ind(n + 2)}</h2>`,
                    `${ind(n + 2)}<div id="${idPanel}" class="accordion-collapse collapse" aria-labelledby="${idCabeza}" data-bs-parent="#${idAcordeon}">`,
                    `${ind(n + 3)}<div class="accordion-body">`
                );
                const dentro = htmlDeBloques(item.hijos, n + 4);
                if (dentro) partes.push(dentro);
                partes.push(`${ind(n + 3)}</div>`, `${ind(n + 2)}</div>`, `${ind(n + 1)}</div>`);
            });
            partes.push(`${ind(n)}</div>`);
            return partes.join('\n');
        }
    },

    /* ---- Ventana emergente suelta ---- */
    modal: {
        nombre: 'Ventana emergente',
        ayuda: 'Un botón que abre una ventana con más información',
        icono: 'app-window',
        mini: MINI.modal,
        nuevo: () => ({ etiqueta: 'Ver más', titulo: 'Título de la ventana', color: 'primary', tamano: 'grande', alineacion: 'centro', hijos: [] }),
        resumen: b => b.etiqueta,
        campos: [
            { k: 'etiqueta', tipo: 'texto', etiqueta: 'Texto del botón' },
            { k: 'titulo', tipo: 'texto', etiqueta: 'Título de la ventana' },
            CAMPO_COLOR_BOTON,
            CAMPO_TAMANO_BOTON,
            Object.assign({}, CAMPO_ALINEACION, { etiqueta: 'Alineación del botón' }),
            { k: 'hijos', tipo: 'hijos', etiqueta: 'Contenido de la ventana' }
        ],
        html: (b, n) => {
            const id = nuevoId('modal');
            const dentro = htmlDeBloques(b.hijos, n + 4) || `${ind(n + 4)}<p></p>`;
            // La fila y el texto se alinean juntos: con solo uno de los dos, un
            // botón "a la derecha" se quedaba centrado dentro de una columna
            // pegada a la derecha, que no es lo que nadie espera.
            const alineado = alineacionDe(b.alineacion);
            return [
                `${ind(n)}<div class="row bloque ${alineado.fila}">`,
                `${ind(n + 1)}<div class="col-12 ${alineado.texto}">`,
                `${ind(n + 2)}${botonModal(id, b.etiqueta || 'Ver más', { color: b.color, tamano: b.tamano })}`,
                `${ind(n + 1)}</div>`,
                `${ind(n)}</div>`,
                modalBootstrap(id, b.titulo || b.etiqueta || '', dentro, n)
            ].join('\n');
        }
    },

    /* ---- Tarjetas con ventana (las "culturas") ---- */
    tarjetas: {
        nombre: 'Tarjetas',
        ayuda: 'Fila de imágenes con botón; cada una abre su ventana',
        icono: 'cards-three',
        mini: MINI.tarjetas,
        /* Los dos colores alternados no son adorno: así está el grupo de
           botones de la página publicada (tema, gris, tema, gris…). */
        nuevo: () => ({
            formato: 'auto',
            alineacion: 'centro',
            items: [
                { img: '', alt: '', etiqueta: 'Tarjeta 1', titulo: 'Tarjeta 1', color: 'primary', hijos: [] },
                { img: '', alt: '', etiqueta: 'Tarjeta 2', titulo: 'Tarjeta 2', color: 'secondary', hijos: [] }
            ]
        }),
        resumen: b => `${(b.items || []).length} tarjetas`,
        campos: [
            {
                k: 'formato', tipo: 'opciones', etiqueta: 'Se ve como',
                ayuda: 'Automático: con imagen salen tarjetas; sin ninguna imagen sale solo la fila de botones, que es el "grupo de N botones" del guion.',
                ops: [
                    { v: 'auto', etiqueta: 'Automático', icono: 'magic-wand' },
                    { v: 'tarjetas', etiqueta: 'Tarjetas', icono: 'cards-three' },
                    { v: 'botones', etiqueta: 'Solo botones', icono: 'rectangle' }
                ]
            },
            CAMPO_TAMANO_BOTON,
            Object.assign({}, CAMPO_ALINEACION, { etiqueta: 'Alineación de los botones' }),
            {
                k: 'items', tipo: 'repetible', etiqueta: 'Tarjetas', nombreItem: 'Tarjeta',
                nuevo: () => ({ img: '', alt: '', etiqueta: 'Nueva tarjeta', titulo: 'Nueva tarjeta', color: 'secondary', hijos: [] }),
                campos: [
                    { k: 'img', tipo: 'url', imagen: true, etiqueta: 'Imagen', marcador: '@@PLUGINFILE@@/imagen.png' },
                    { k: 'alt', tipo: 'texto', etiqueta: 'Texto alternativo' },
                    { k: 'etiqueta', tipo: 'texto', etiqueta: 'Texto del botón' },
                    CAMPO_COLOR_BOTON,
                    { k: 'titulo', tipo: 'texto', etiqueta: 'Título de la ventana' }
                ],
                hijos: true
            }
        ],
        html: (b, n) => {
            const items = b.items || [];
            if (!items.length) return '';
            const ids = items.map(() => nuevoId('modal'));
            const partes = [];

            /* Sin una sola imagen esto no es una fila de tarjetas: es el grupo
               de botones del guion. Salía igual —cada botón dentro de su
               `.card`— y en Moodle eso se ve como una banda gris con los
               botones flotando dentro, que no es ningún montaje. El grupo de
               verdad es una columna centrada con los botones sueltos. */
            const conImagen = items.some(it => (it.img || '').trim());
            const formato = (b.formato && b.formato !== 'auto') ? b.formato : (conImagen ? 'tarjetas' : 'botones');

            /* Sin elección explícita, cada forma conserva el tamaño de su
               montaje: el grupo de botones el grande, y el de dentro de una
               tarjeta el chico —ahí un `btn-lg` no cabe—. */
            const tamano = b.tamano || (formato === 'botones' ? 'grande' : 'chico');

            if (formato === 'botones') {
                partes.push(`${ind(n)}<div class="col-12 col-lg-12 mx-auto ${alineacionDe(b.alineacion).texto}">`);
                items.forEach((item, i) => partes.push(
                    `${ind(n + 1)}${botonModal(ids[i], item.etiqueta || '', { color: item.color, tamano })}`));
                partes.push(`${ind(n)}</div>`);
            } else {
                partes.push(
                    `${ind(n)}<div class="col-12 p-4">`,
                    `${ind(n + 1)}<div class="card-group">`);
                items.forEach((item, i) => {
                    partes.push(`${ind(n + 2)}<div class="card">`);
                    if ((item.img || '').trim()) {
                        partes.push(`${ind(n + 3)}<img class="card-img-top img-fluid" src="${ligaSegura(item.img.trim())}" alt="${escapar(item.alt || '')}">`);
                    }
                    partes.push(
                        // El mx-auto viene del montaje real, pero centra la CAJA, no lo
                        // que lleva dentro: sin la clase de texto los botones quedaban
                        // pegados a la izquierda de su tarjeta y la fila se veía despareja.
                        `${ind(n + 3)}<div class="card-body mx-auto ${alineacionDe(b.alineacion).texto}">` +
                        `${botonModal(ids[i], item.etiqueta || '', { color: item.color, tamano, fuerte: true })}</div>`,
                        `${ind(n + 2)}</div>`);
                });
                partes.push(`${ind(n + 1)}</div>`, `${ind(n)}</div>`);
            }
            // Los modales van después del grupo de tarjetas, como en la página
            // real: dentro de la tarjeta, Bootstrap los posiciona mal.
            items.forEach((item, i) => {
                const dentro = htmlDeBloques(item.hijos, n + 4) || `${ind(n + 4)}<p></p>`;
                partes.push(modalBootstrap(ids[i], item.titulo || item.etiqueta || '', dentro, n));
            });
            return partes.join('\n');
        }
    },

    /* ---- Pestañas ---- */
    pestanas: {
        nombre: 'Pestañas',
        ayuda: 'Contenido repartido en pestañas (nav-tabs)',
        icono: 'browsers',
        mini: MINI.pestanas,
        nuevo: () => ({ items: [{ titulo: 'Pestaña 1', hijos: [] }, { titulo: 'Pestaña 2', hijos: [] }] }),
        resumen: b => `${(b.items || []).length} pestañas`,
        campos: [
            {
                k: 'items', tipo: 'repetible', etiqueta: 'Pestañas', nombreItem: 'Pestaña',
                nuevo: () => ({ titulo: 'Nueva pestaña', hijos: [] }),
                campos: [{ k: 'titulo', tipo: 'texto', etiqueta: 'Título de la pestaña' }],
                hijos: true
            }
        ],
        html: (b, n) => {
            const items = b.items || [];
            if (!items.length) return '';
            const ids = items.map(() => nuevoId('pest'));
            const partes = [
                `${ind(n)}<div class="row bloque">`,
                `${ind(n + 1)}<div class="col-12">`,
                `${ind(n + 2)}<ul class="nav nav-tabs" role="tablist">`
            ];
            items.forEach((item, i) => partes.push(
                `${ind(n + 3)}<li class="nav-item" role="presentation">`,
                `${ind(n + 4)}<button class="nav-link${i === 0 ? ' active' : ''}" data-bs-toggle="tab" data-bs-target="#${ids[i]}" type="button" role="tab" aria-controls="${ids[i]}" aria-selected="${i === 0}">${marcas(item.titulo || '')}</button>`,
                `${ind(n + 3)}</li>`));
            partes.push(`${ind(n + 2)}</ul>`, `${ind(n + 2)}<div class="tab-content">`);
            items.forEach((item, i) => {
                partes.push(`${ind(n + 3)}<div class="tab-pane fade${i === 0 ? ' show active' : ''}" id="${ids[i]}" role="tabpanel">`);
                const dentro = htmlDeBloques(item.hijos, n + 4);
                if (dentro) partes.push(dentro);
                partes.push(`${ind(n + 3)}</div>`);
            });
            partes.push(`${ind(n + 2)}</div>`, `${ind(n + 1)}</div>`, `${ind(n)}</div>`);
            return partes.join('\n');
        }
    },

    /* ---- Video ---- */
    video: {
        nombre: 'Video',
        ayuda: 'YouTube incrustado en 16:9',
        icono: 'youtube-logo',
        mini: MINI.video,
        nuevo: () => ({ url: '', titulo: 'Video', texto: '' }),
        resumen: b => b.url || 'sin URL',
        campos: [
            { k: 'url', tipo: 'url', etiqueta: 'Liga de YouTube', marcador: 'https://www.youtube.com/watch?v=...' },
            { k: 'titulo', tipo: 'texto', etiqueta: 'Título (accesibilidad)' },
            {
                k: 'texto', tipo: 'rico', etiqueta: 'Texto al lado (opcional)', filas: 4,
                ayuda: 'Si escribes algo aquí, el video se pasa a la mitad derecha y el texto ocupa la izquierda. Vacío, el video va centrado como siempre.'
            }
        ],
        html: (b, n) => {
            const id = idDeYoutube(b.url || '');
            if (!id) return '';

            /* Con texto, la plantilla usa DOS columnas de mitad y mitad y el
               iframe lleva `frame-video`. Va como opción y no como cambio: sin
               texto sale el video centrado de siempre. */
            if ((b.texto || '').trim()) {
                return [
                    `${ind(n)}<div class="row bloque">`,
                    `${ind(n + 1)}<div class="col-12 col-md-12 col-lg-6">`,
                    ...parrafos(b.texto, n + 2),
                    `${ind(n + 1)}</div>`,
                    `${ind(n + 1)}<div class="col-12 col-md-12 col-lg-6 d-flex align-items-center">`,
                    `${ind(n + 2)}<div class="ratio ratio-16x9">`,
                    `${ind(n + 3)}<iframe src="https://www.youtube.com/embed/${id}" class="frame-video" title="${escapar(b.titulo || 'Video')}" allowfullscreen></iframe>`,
                    `${ind(n + 2)}</div>`,
                    `${ind(n + 1)}</div>`,
                    `${ind(n)}</div>`
                ].join('\n');
            }
            return [
                `${ind(n)}<div class="row bloque justify-content-center">`,
                `${ind(n + 1)}<div class="col-12 col-md-8 mx-auto">`,
                `${ind(n + 2)}<div class="ratio ratio-16x9">`,
                `${ind(n + 3)}<iframe src="https://www.youtube.com/embed/${id}" title="${escapar(b.titulo || 'Video')}" allowfullscreen></iframe>`,
                `${ind(n + 2)}</div>`,
                `${ind(n + 1)}</div>`,
                `${ind(n)}</div>`
            ].join('\n');
        }
    },

    /* ---- Texto con envolvente ----
       La caja de color de las plantillas 01S.05. Dos formas, que en el montaje
       son markup distinto y no una variante de la misma caja:

       - CON título: `.card` con su banda `.card-header` de color arriba.
       - SIN título: `.card-body` centrado, sin banda, más angosto (`col-lg-8`).

       Por eso el título no es solo un campo opcional: cambia el envoltorio. */
    envolvente: {
        nombre: 'Caja de color',
        ayuda: 'Texto dentro de una caja, con o sin banda de título',
        icono: 'square',
        mini: MINI.envolvente,
        nuevo: () => ({ titulo: 'Título', texto: '', color: 'primary-30', fondo: 'primary-10' }),
        resumen: b => b.titulo || (b.texto || '').replace(/\s+/g, ' ') || 'caja',
        campos: [
            {
                k: 'titulo', tipo: 'texto', etiqueta: 'Título de la banda',
                ayuda: 'Si lo dejas vacío, la caja sale sin banda y centrada, que es la otra forma que publica el equipo.'
            },
            { k: 'texto', tipo: 'rico', etiqueta: 'Texto', filas: 4 },
            {
                k: 'color', tipo: 'opciones', etiqueta: 'Color de la banda', siOculta: b => !(b.titulo || '').trim(),
                ops: [
                    { v: 'primary-30', etiqueta: 'Principal' },
                    { v: 'primary', etiqueta: 'Principal fuerte' },
                    { v: 'secondary-20', etiqueta: 'Secundario' }
                ]
            },
            {
                k: 'fondo', tipo: 'opciones', etiqueta: 'Fondo de la caja', ops: [
                    { v: 'primary-10', etiqueta: 'Principal claro' },
                    { v: 'secondary-20', etiqueta: 'Secundario' },
                    { v: 'neutral-claro-50', etiqueta: 'Gris' }
                ]
            }
        ],
        html: (b, n) => {
            const cuerpo = parrafos(b.texto, n + 4);
            if (!cuerpo.length && !(b.titulo || '').trim()) return '';
            const titulo = (b.titulo || '').trim();

            // Sin banda: la caja centrada de "Bloques de texto con envolvente
            // simple". No lleva .card ni .card-header.
            if (!titulo) {
                return [
                    `${ind(n)}<div class="row bloque">`,
                    `${ind(n + 1)}<div class="col-12">`,
                    `${ind(n + 2)}<div class="card-body col-sm-12 col-lg-8 p-4 mx-auto text-center bg-${b.fondo || 'primary-10'} rounded-2">`,
                    `${ind(n + 3)}<div class="card-text">`,
                    ...parrafos(b.texto, n + 4),
                    `${ind(n + 3)}</div>`,
                    `${ind(n + 2)}</div>`,
                    `${ind(n + 1)}</div>`,
                    `${ind(n)}</div>`
                ].join('\n');
            }
            // Con banda. El .card-body lleva el fondo y el .rounded-1 de adentro
            // es lo que separa el texto de la orilla, como en la plantilla.
            const claseTitulo = b.color === 'primary' ? 'bg-primary text-primary-10' : `bg-${b.color || 'primary-30'}`;
            return [
                `${ind(n)}<div class="row bloque">`,
                `${ind(n + 1)}<div class="col-12 d-flex align-items-center">`,
                `${ind(n + 2)}<div class="card mx-auto p-0">`,
                `${ind(n + 3)}<div class="card-header notas-tabla ${claseTitulo}">${marcas(titulo)}</div>`,
                `${ind(n + 3)}<div class="card-body bg-${b.fondo || 'primary-10'} px-3">`,
                `${ind(n + 4)}<div class="rounded-1 rounded-top p-3">`,
                ...parrafos(b.texto, n + 5),
                `${ind(n + 4)}</div>`,
                `${ind(n + 3)}</div>`,
                `${ind(n + 2)}</div>`,
                `${ind(n + 1)}</div>`,
                `${ind(n)}</div>`
            ].join('\n');
        }
    },

    /* ---- Rejilla de columnas ----
       Los "Bloque con contenido de N" de la plantilla de pestañas. Cada N trae
       SU cadena de clases, copiada tal cual: no es `12/N` calculado, porque los
       cortes de tableta no siguen esa cuenta (el de 6 y el de 12 comparten
       `col-sm-6 col-md-4` y solo se separan en `lg`). */
    columnas: {
        nombre: 'Columnas',
        ayuda: 'Reparte cualquier contenido en 2, 3, 4, 6 o 12 columnas',
        icono: 'columns',
        mini: MINI.columnas,
        nuevo: () => ({
            cuantas: '3',
            items: [{ hijos: [] }, { hijos: [] }, { hijos: [] }]
        }),
        resumen: b => `${(b.items || []).length} columnas`,
        campos: [
            {
                k: 'cuantas', tipo: 'opciones', etiqueta: 'Columnas en escritorio', ops: [
                    { v: '2', etiqueta: '2' }, { v: '3', etiqueta: '3' }, { v: '4', etiqueta: '4' },
                    { v: '6', etiqueta: '6' }, { v: '12', etiqueta: '12' }
                ],
                ayuda: 'En celular siempre se apilan. El número es lo que se ve en pantalla ancha.'
            },
            {
                k: 'items', tipo: 'repetible', etiqueta: 'Columnas', nombreItem: 'Columna',
                nuevo: () => ({ hijos: [] }), campos: [], hijos: true
            }
        ],
        html: (b, n) => {
            const items = b.items || [];
            if (!items.length) return '';
            const clase = REJILLA[b.cuantas] || REJILLA['3'];
            const partes = [`${ind(n)}<div class="row bloque mt-3 mb-3">`];
            items.forEach(item => {
                partes.push(`${ind(n + 1)}<div class="${clase}">`);
                const dentro = htmlDeBloques(item.hijos, n + 2, true);
                if (dentro) partes.push(dentro);
                partes.push(`${ind(n + 1)}</div>`);
            });
            partes.push(`${ind(n)}</div>`);
            return partes.join('\n');
        }
    },

    /* ---- Recuadro para escribir ----
       Los `textarea` en medio de la frase para completar oraciones. Es la única
       pieza interactiva de las plantillas que NO necesita JavaScript: el alumno
       escribe y ya. Su CSS (`recuadro__input`) ya está en la hoja de Moodle. */
    escribir: {
        nombre: 'Completar',
        ayuda: 'Frases con un espacio en blanco para escribir la respuesta',
        icono: 'cursor-text',
        mini: MINI.escribir,
        nuevo: () => ({
            marcador: 'answer',
            items: ['Lisa ___ green eyes.', 'I ___ friendly.']
        }),
        resumen: b => `${(b.items || []).filter(t => String(t).trim()).length} frases`,
        campos: [
            {
                k: 'items', tipo: 'renglones', etiqueta: 'Frases',
                marcador: 'Una frase por renglón. Escribe ___ donde va el espacio en blanco.',
                ayuda: 'Los tres guiones bajos (___) se convierten en el recuadro donde escribe el alumno. Puedes poner más de uno en la misma frase.'
            },
            {
                k: 'marcador', tipo: 'texto', etiqueta: 'Texto guía del recuadro',
                marcador: 'answer'
            }
        ],
        html: (b, n) => {
            const items = (b.items || []).map(t => String(t).trim()).filter(Boolean);
            if (!items.length) return '';
            const hueco = `<textarea name="text_single" class="recuadro__input" placeholder="${escapar(b.marcador || '')}"></textarea>`;
            return [
                `${ind(n)}<div class="row bloque mt-3">`,
                `${ind(n + 1)}<div class="col-12 col-lg-6">`,
                `${ind(n + 2)}<div class="tab-panels p-4">`,
                // El hueco se mete DESPUÉS de aplicar marcas: si se metiera antes,
                // el escapado del texto convertiría el <textarea> en texto visible.
                ...items.map(t => `${ind(n + 3)}<p>${marcas(t).replace(/_{3,}/g, hueco)}</p>`),
                `${ind(n + 2)}</div>`,
                `${ind(n + 1)}</div>`,
                `${ind(n)}</div>`
            ].join('\n');
        }
    },

    /* ---- Conversación ----
       El diálogo de las plantillas 01S.05: una tarjeta de borde punteado con
       los parlamentos, y al lado la imagen. El audio NO lo pone la herramienta
       —se inserta desde el editor de Moodle, que ya lo hace bien— y por eso la
       columna de al lado queda lista para recibirlo.

       El borde punteado sale de la clase `borde-punteado`, no del
       `style="border-style: dashed"` de la plantilla: eso era un hex y medio
       escritos a mano, y ya vive en la hoja del tema. */
    conversacion: {
        nombre: 'Conversación',
        ayuda: 'Diálogo en una tarjeta punteada, con imagen al lado',
        icono: 'chats-circle',
        mini: MINI.conversacion,
        nuevo: () => ({
            lineas: ['**Carol:** In this box there are accessories.\n*En esta caja hay accesorios.*',
                '**Anne:** Those sneakers are mine.\n*Esas zapatillas son mías.*'],
            img: '', alt: ''
        }),
        resumen: b => `${(b.lineas || []).filter(t => String(t).trim()).length} parlamentos`,
        campos: [
            {
                k: 'lineas', tipo: 'renglones', etiqueta: 'Parlamentos',
                marcador: 'Un parlamento por renglón. Usa **Nombre:** al principio.',
                ayuda: 'Para la traducción debajo, escribe un salto de línea dentro del mismo parlamento y ponla en *cursivas*.'
            },
            { k: 'img', tipo: 'url', imagen: true, etiqueta: 'Imagen del lado (opcional)', marcador: '@@PLUGINFILE@@/imagen.png' },
            { k: 'alt', tipo: 'texto', etiqueta: 'Texto alternativo', siOculta: b => !(b.img || '').trim() }
        ],
        html: (b, n) => {
            const lineas = (b.lineas || []).map(t => String(t).trim()).filter(Boolean);
            if (!lineas.length) return '';
            const partes = [
                `${ind(n)}<div class="row bloque mb-4">`,
                `${ind(n + 1)}<div class="col-12">`,
                `${ind(n + 2)}<div class="row no-gutters align-items-center">`,
                `${ind(n + 3)}<div class="card col-12 col-lg-5 p-4 rounded-2 border-primary borde-punteado m-3">`,
                `${ind(n + 4)}<div class="card-text">`,
                // El salto simple dentro de un parlamento es la traducción: va
                // como <br>, igual que en el montaje.
                ...lineas.map(t => `${ind(n + 5)}<p>${marcas(t).replace(/\n/g, '<br>')}</p>`),
                `${ind(n + 4)}</div>`,
                `${ind(n + 3)}</div>`,
                `${ind(n + 3)}<div class="col-12 col-lg-6 align-items-center">`
            ];
            if ((b.img || '').trim()) {
                partes.push(
                    `${ind(n + 4)}<div class="col-12">`,
                    `${ind(n + 5)}<img class="img-fluid" src="${ligaSegura(b.img.trim())}" alt="${escapar(b.alt || '')}">`,
                    `${ind(n + 4)}</div>`);
            }
            partes.push(
                `${ind(n + 3)}</div>`,
                `${ind(n + 2)}</div>`,
                `${ind(n + 1)}</div>`,
                `${ind(n)}</div>`);
            return partes.join('\n');
        }
    },

    /* ---- Botón / enlace ---- */
    boton: {
        nombre: 'Botón',
        ayuda: 'Enlace a un documento o a otro sitio',
        icono: 'link',
        mini: MINI.boton,
        nuevo: () => ({ texto: 'Descargar el documento', url: '', estilo: 'boton', color: 'primary', tamano: 'grande', alineacion: 'centro' }),
        resumen: b => b.texto,
        campos: [
            { k: 'texto', tipo: 'texto', etiqueta: 'Texto' },
            { k: 'url', tipo: 'url', etiqueta: 'Liga', marcador: '@@PLUGINFILE@@/documento.pdf' },
            {
                k: 'estilo', tipo: 'opciones', etiqueta: 'Se ve como', ops: [
                    { v: 'boton', etiqueta: 'Botón', icono: 'rectangle' },
                    { v: 'enlace', etiqueta: 'Enlace', icono: 'link-simple' }
                ]
            },
            CAMPO_COLOR_BOTON,
            CAMPO_TAMANO_BOTON,
            CAMPO_ALINEACION
        ],
        html: (b, n) => {
            const url = (b.url || '').trim();
            if (!url) return '';
            const clase = b.estilo === 'enlace'
                ? 'nomediaplugin'
                : `${clasesBoton(b.color, b.tamano)} nomediaplugin`;
            // La fila y el texto se alinean juntos: con solo uno de los dos, un
            // botón "a la derecha" se quedaba centrado dentro de una columna
            // pegada a la derecha, que no es lo que nadie espera.
            const alineado = alineacionDe(b.alineacion);
            return [
                `${ind(n)}<div class="row bloque ${alineado.fila}">`,
                `${ind(n + 1)}<div class="col-12 ${alineado.texto}">`,
                `${ind(n + 2)}<a href="${ligaSegura(url)}" target="_blank" class="${clase}"` +
                `${b.estilo === 'enlace' ? '' : ` style="${estiloBoton()}"`}>${marcas(b.texto || '')}</a>`,
                `${ind(n + 1)}</div>`,
                `${ind(n)}</div>`
            ].join('\n');
        }
    },

    /* ---- Aviso ---- */
    alerta: {
        nombre: 'Aviso',
        ayuda: 'Caja de nota, advertencia o dato importante',
        icono: 'warning-circle',
        mini: MINI.alerta,
        /* El campo se llama `tono`, NO `tipo`: `tipo` es el discriminador del
           bloque y crearBloque() hace Object.assign con lo que devuelve esto.
           Llamándolo `tipo` el bloque nacía como `tipo: 'info'` —que no es
           ningún componente— y el lienzo entero reventaba al dibujarlo: se
           agregaba el Aviso y a partir de ahí la herramienta no respondía.
           Es el mismo choque de nombres que el `nota` de la figura. */
        nuevo: () => ({ tono: 'info', texto: '' }),
        resumen: b => b.texto,
        campos: [
            {
                k: 'tono', tipo: 'opciones', etiqueta: 'Tono', ops: [
                    { v: 'info', etiqueta: 'Nota', icono: 'info' },
                    { v: 'warning', etiqueta: 'Cuidado', icono: 'warning' },
                    { v: 'success', etiqueta: 'Logro', icono: 'check-circle' },
                    { v: 'enmarcado', etiqueta: 'Recuadro', icono: 'square' }
                ]
            },
            { k: 'texto', tipo: 'rico', etiqueta: 'Texto', filas: 3 }
        ],
        html: (b, n) => {
            if (!(b.texto || '').trim()) return '';
            // `b.tono`, con respaldo a `b.tipo` para las páginas que se hayan
            // guardado con el nombre viejo antes del arreglo.
            const tono = b.tono || (b.tipo !== 'alerta' && b.tipo) || 'info';
            const clase = tono === 'enmarcado' ? 'enmarcado' : `alert alert-${tono}`;
            return [
                `${ind(n)}<div class="row justify-content-center bloque">`,
                `${ind(n + 1)}<div class="col-12 col-md-8 mx-auto">`,
                `${ind(n + 2)}<div class="${clase}">`,
                ...parrafos(b.texto, n + 3),
                `${ind(n + 2)}</div>`,
                `${ind(n + 1)}</div>`,
                `${ind(n)}</div>`
            ].join('\n');
        }
    },

    /* ---- HTML tal cual ----
       Sale del importador: lo que se pega y la herramienta no sabe reconocer
       entra aquí y se publica **idéntico**. Es lo que hace que importar sea
       seguro — sin este bloque, traer una página de Moodle sería una apuesta a
       que el lector entienda el 100%, y lo que no entendiera se perdería.

       No se escapa a propósito: es HTML de verdad, puesto por alguien que sabe
       lo que hace. Es el único componente que no pasa por `marcas()`. */
    crudo: {
        nombre: 'HTML tal cual',
        ayuda: 'Un trozo de HTML que se publica sin tocar',
        icono: 'code',
        mini: MINI.crudo,
        nuevo: () => ({ html: '' }),
        resumen: b => {
            const t = String(b.html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            return t ? t.slice(0, 60) : 'vacío';
        },
        campos: [
            {
                k: 'html', tipo: 'rico', etiqueta: 'HTML', filas: 8, sinMarcas: true,
                marcador: '<div class="row bloque">…</div>',
                ayuda: 'Se publica exactamente como está. Úsalo para lo que la herramienta todavía no sabe armar; lo demás conviene hacerlo con bloques, que sí se editan.'
            }
        ],
        html: (b, n) => {
            const t = String(b.html || '').trim();
            if (!t) return '';
            // Se reindenta para que el HTML final siga siendo legible al pegarlo.
            return t.split('\n').map(l => ind(n) + l.trim()).join('\n');
        }
    },

    /* ---- Separador ---- */
    separador: {
        nombre: 'Separador',
        ayuda: 'Una línea para cortar entre temas',
        icono: 'minus',
        mini: MINI.separador,
        nuevo: () => ({}),
        resumen: () => 'línea',
        campos: [],
        html: (b, n) => `${ind(n)}<hr class="espacio-fino">`
    }
};

/**
 * El ancho de cada columna, en por ciento. `0` = sin escribir nada.
 *
 * Existe porque `MW-auto` —que va siempre, y con razón: sin ella una tabla de
 * cinco columnas no puede encoger— también suelta el reparto: el navegador le
 * da el ancho a la columna con más texto y deja la corta partiendo palabras a
 * la mitad ("Media aritméti-ca"), aunque haya espacio de sobra al lado.
 *
 * `parejo` no se guarda columna por columna a propósito: si se agrega una
 * columna después, el reparto se recalcula solo.
 */
function anchosDeTabla(b, cuantas) {
    if (b.anchos === 'parejo') {
        const w = Math.round(10000 / cuantas) / 100;
        return Array.from({ length: cuantas }, () => w);
    }
    if (b.anchos === 'medida') {
        return Array.from({ length: cuantas }, (_, c) => {
            const v = Number((b.anchoCols || [])[c]);
            return v > 0 && v <= 100 ? v : 0;
        });
    }
    return Array.from({ length: cuantas }, () => 0);
}

/** Id de un video de YouTube en cualquiera de sus formas de liga. */
function idDeYoutube(url) {
    const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/);
    return m ? m[1] : '';
}

/* Orden de la paleta: primero lo de toda página, luego lo compuesto.
   `presentacion` va al frente porque es lo primero de una página de semana. */
const ORDEN_PALETA = ['presentacion', 'titulo', 'texto', 'lista', 'pasos', 'imagen', 'instruccion', 'tabla',
    'envolvente', 'columnas', 'acordeon', 'modal', 'tarjetas', 'pestanas', 'conversacion', 'video', 'escribir',
    'boton', 'alerta', 'separador', 'crudo'];

/* Paletas del aula. Las clases son las del tema (mainPlantilla23.M01 …); los
   hex son SOLO la muestra de color del selector, no salen al HTML. */
/* PALETAS vive en assets/paletas.js: la comparten esta herramienta y
   Bibliografías Margarita Maza. */
