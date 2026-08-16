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
function vaciarModales(n) {
    if (!_modales.length) return '';
    const salida = _modales.map(f => f(n)).join('\n');
    _modales = [];
    return salida;
}

/**
 * Marcas de texto enriquecido -> HTML. Es lo que el compañero teclea sin saber
 * HTML; la barra de la herramienta las inserta por él.
 *
 *   **negritas**             -> <strong>
 *   *cursivas*               -> <em>
 *   ==resaltado==            -> <mark class="bg-resalte-20">
 *   [texto](url)             -> <a target="_blank">
 *   {{palabra|título|texto}} -> botón que abre una ventana emergente
 *
 * El texto se escapa ANTES de aplicar marcas: lo que pega el usuario no puede
 * inyectar etiquetas.
 */
function marcas(texto) {
    let t = escapar(texto);

    // La ventana emergente primero: su contenido no debe volver a partirse.
    t = t.replace(/\{\{([^|{}]+)\|([^|{}]*)\|([^{}]+)\}\}/g, (_, palabra, titulo, cuerpo) => {
        const id = nuevoId('modal');
        encolarModal(n => modalBootstrap(id, titulo.trim() || palabra.trim(),
            `${ind(n + 1)}<p>${escapar(cuerpo.trim())}</p>`, n));
        return `<button class="btn btn-sm text-tooltip bg-resalte-10 p-1 align-baseline" type="button" ` +
            `data-bs-toggle="modal" data-bs-target="#${id}">${palabra.trim()}</button>`;
    });

    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) =>
        `<a href="${ligaSegura(url)}" target="_blank" class="nomediaplugin">${txt}</a>`);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/==([^=]+)==/g, '<mark class="bg-resalte-20">$1</mark>');
    return t;
}

/** Párrafos: una línea en blanco separa uno de otro; un salto simple es <br>. */
function parrafos(texto, n) {
    return String(texto || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
        .map(p => `${ind(n)}<p>${marcas(p).replace(/\n/g, '<br>')}</p>`);
}

/* -------------------------------------------------------------------------
   Piezas compartidas
   ------------------------------------------------------------------------- */

/** Modal de Bootstrap, tal cual lo trae la página de referencia. */
function modalBootstrap(id, titulo, contenidoHtml, n) {
    return [
        `${ind(n)}<div id="${id}" class="modal fade" tabindex="-1" aria-labelledby="${id}Label" aria-hidden="true">`,
        `${ind(n + 1)}<div class="modal-dialog modal-lg">`,
        `${ind(n + 2)}<div class="modal-content">`,
        `${ind(n + 3)}<div class="modal-header">`,
        `${ind(n + 4)}<h1 id="${id}Label" class="modal-title fs-4">${marcas(titulo)}</h1>`,
        `${ind(n + 4)}<button class="btn-close" type="button" data-bs-dismiss="modal" aria-label="Cerrar"></button>`,
        `${ind(n + 3)}</div>`,
        `${ind(n + 3)}<div class="modal-body">`,
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

/* El campo, tal cual, para los componentes que lo ofrecen. */
const CAMPO_ALINEACION = {
    k: 'alineacion', tipo: 'opciones', etiqueta: 'Alineación', ops: [
        { v: 'izquierda', etiqueta: 'Izquierda', icono: 'text-align-left' },
        { v: 'centro', etiqueta: 'Centro', icono: 'text-align-center' },
        { v: 'derecha', etiqueta: 'Derecha', icono: 'text-align-right' }
    ]
};

/** Botón que dispara un modal (el "Mesopotámica ▸" de las tarjetas). */
function botonModal(id, etiqueta) {
    return `<button class="btn btn-secondary btn-sm rounded-4 border border-4 border-secondary-10 flecha_btn" ` +
        `type="button" data-bs-toggle="modal" data-bs-target="#${id}"><strong>${marcas(etiqueta)}</strong></button>`;
}

/* Con esto encendido, cada bloque sale marcado con `data-bq="<id>"` para que la
   vista previa y el lienzo puedan señalarse mutuamente. SOLO se enciende para
   la previa: el HTML que se copia a Moodle nunca lleva el atributo. */
let MARCAR_BLOQUES = false;
function marcarBloques(activo) { MARCAR_BLOQUES = activo; }

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
    pasos: '<rect x="1" y="3" width="38" height="26" rx="4" opacity=".22"/><rect x="5" y="8" width="5" height="5" rx="1.5" opacity=".9"/><rect x="5" y="19" width="5" height="5" rx="1.5" opacity=".9"/><rect x="13" y="8.5" width="22" height="4" rx="2" opacity=".6"/><rect x="13" y="19.5" width="18" height="4" rx="2" opacity=".6"/>'
};

/* -------------------------------------------------------------------------
   El catálogo
   ------------------------------------------------------------------------- */

const COMPONENTES = {

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
        nuevo: () => ({ texto: '', destacado: false, centrado: false }),
        resumen: b => (b.texto || '').replace(/\s+/g, ' '),
        campos: [
            { k: 'texto', tipo: 'rico', etiqueta: 'Texto', filas: 4, marcador: 'Escribe aquí. Una línea en blanco separa párrafos.' },
            { k: 'destacado', tipo: 'check', etiqueta: 'Centrado y en negritas (la pregunta que abre el apartado)' },
            { k: 'centrado', tipo: 'check', etiqueta: 'Centrado, sin forzar negritas (nomenclaturas, ejemplos)', siOculta: b => b.destacado }
        ],
        html: (b, n, desnudo) => {
            if (!(b.texto || '').trim()) return '';
            const trozos = String(b.texto).split(/\n{2,}/).map(p => p.trim()).filter(Boolean);

            /* Dentro de un <li> los párrafos van pelados: así los publica la
               página real ("Apellidos_Nombre_SM02S1AA1" centrado dentro del paso
               "Guarda el archivo…"). Un .row.bloque ahí rompería la lista. */
            if (desnudo) {
                const clase = (b.centrado || b.destacado) ? ' class="text-center"' : '';
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
            const cuerpo = b.centrado
                ? trozos.map(p => `${ind(n + 2)}<p class="text-center">${marcas(p).replace(/\n/g, '<br>')}</p>`)
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
                    { v: 'letras', etiqueta: 'a, b, c', icono: 'text-aa' }
                ]
            },
            { k: 'items', tipo: 'renglones', etiqueta: 'Elementos', marcador: 'Un elemento por renglón' }
        ],
        html: (b, n, desnudo) => {
            const items = (b.items || []).map(t => String(t).trim()).filter(Boolean);
            if (!items.length) return '';
            const et = b.estilo === 'vinetas' ? 'ul' : 'ol';
            const tipo = b.estilo === 'letras' ? ' type="a"' : '';
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

            // La figura con encabezado usa la tarjeta .img-contenedor de la
            // página real; sin encabezado va la imagen suelta.
            const figura = nivel => {
                const img = `${ind(nivel + (b.pie ? 2 : 0))}<img class="${b.pie ? 'card-img-top ' : ''}img-fluid" src="${ligaSegura(src)}" alt="${escapar(b.alt || '')}">`;
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
                    figura(n + 2),
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
            colorear: false, tarjetas: true, titulo: '', encabezadoColor: false
        }),
        resumen: b => `${(b.filas || []).length} filas × ${(b.encabezados || []).length} columnas`,
        campos: [
            { k: 'titulo', tipo: 'texto', etiqueta: 'Encabezado de la tabla (opcional)', marcador: 'Tabla 1. Aportaciones' },
            { k: 'rejilla', tipo: 'rejilla', etiqueta: 'Contenido' },
            {
                k: 'tarjetas', tipo: 'check',
                etiqueta: 'En celular, cada fila como tarjeta (recomendado)'
            },
            { k: 'colorear', tipo: 'check', etiqueta: 'Colorear la primera columna (alternado)' },
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
            const clases = ['table', 'table-bordered'];
            if (b.tarjetas) clases.push('tabla-responsive-cards');

            // Envoltorio cotejado con la página publicada: .mt-3 y .col-10
            // (con .col-md-8 la tabla de 4 columnas salía estrecha y las celdas
            // partían cada palabra en un renglón).
            const partes = [
                `${ind(n)}<div class="row bloque mt-3">`,
                `${ind(n + 1)}<div class="col-10 mx-auto">`,
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
                `${ind(n + 4)}<thead class="thead bg-primary-20">`,
                `${ind(n + 5)}<tr>`);
            /* El bg-primary-20 del <thead> viene del montaje real y se queda, pero
               ahí NO se ve: Bootstrap pinta el fondo en cada celda y la tapa. Para
               que el encabezado salga de color hay que repetir la clase en los
               <th>. Va como opción y apagada por omisión, para no separar las
               tablas nuevas de las páginas ya publicadas. El color lo resuelve
               --primary-20, así que sigue a la paleta del aula sin tocar nada. */
            const claseTh = 'text-center align-middle' + (b.encabezadoColor ? ' bg-primary-20' : '');
            enc.forEach(t => partes.push(`${ind(n + 6)}<th scope="col" class="${claseTh}">${marcas(t)}</th>`));
            partes.push(`${ind(n + 5)}</tr>`, `${ind(n + 4)}</thead>`, `${ind(n + 4)}<tbody>`);

            filas.forEach((fila, i) => {
                partes.push(`${ind(n + 5)}<tr class="align-middle">`);
                enc.forEach((titulo, c) => {
                    const clase = b.colorear && c === 0 ? ` class="${i % 2 === 0 ? 'bg-primary-10' : 'bg-secondary-10'}"` : '';
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
        nuevo: () => ({ etiqueta: 'Ver más', titulo: 'Título de la ventana', alineacion: 'centro', hijos: [] }),
        resumen: b => b.etiqueta,
        campos: [
            { k: 'etiqueta', tipo: 'texto', etiqueta: 'Texto del botón' },
            { k: 'titulo', tipo: 'texto', etiqueta: 'Título de la ventana' },
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
                `${ind(n + 2)}${botonModal(id, b.etiqueta || 'Ver más')}`,
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
        nuevo: () => ({
            alineacion: 'centro',
            items: [
                { img: '', alt: '', etiqueta: 'Tarjeta 1', titulo: 'Tarjeta 1', hijos: [] },
                { img: '', alt: '', etiqueta: 'Tarjeta 2', titulo: 'Tarjeta 2', hijos: [] }
            ]
        }),
        resumen: b => `${(b.items || []).length} tarjetas`,
        campos: [
            Object.assign({}, CAMPO_ALINEACION, { etiqueta: 'Alineación de los botones' }),
            {
                k: 'items', tipo: 'repetible', etiqueta: 'Tarjetas', nombreItem: 'Tarjeta',
                nuevo: () => ({ img: '', alt: '', etiqueta: 'Nueva tarjeta', titulo: 'Nueva tarjeta', hijos: [] }),
                campos: [
                    { k: 'img', tipo: 'url', imagen: true, etiqueta: 'Imagen', marcador: '@@PLUGINFILE@@/imagen.png' },
                    { k: 'alt', tipo: 'texto', etiqueta: 'Texto alternativo' },
                    { k: 'etiqueta', tipo: 'texto', etiqueta: 'Texto del botón' },
                    { k: 'titulo', tipo: 'texto', etiqueta: 'Título de la ventana' }
                ],
                hijos: true
            }
        ],
        html: (b, n) => {
            const items = b.items || [];
            if (!items.length) return '';
            const ids = items.map(() => nuevoId('modal'));
            const partes = [
                `${ind(n)}<div class="col-12 p-4">`,
                `${ind(n + 1)}<div class="card-group">`
            ];
            items.forEach((item, i) => {
                partes.push(`${ind(n + 2)}<div class="card">`);
                if ((item.img || '').trim()) {
                    partes.push(`${ind(n + 3)}<img class="card-img-top img-fluid" src="${ligaSegura(item.img.trim())}" alt="${escapar(item.alt || '')}">`);
                }
                partes.push(
                    // El mx-auto viene del montaje real, pero centra la CAJA, no lo
                    // que lleva dentro: sin la clase de texto los botones quedaban
                    // pegados a la izquierda de su tarjeta y la fila se veía despareja.
                    `${ind(n + 3)}<div class="card-body mx-auto ${alineacionDe(b.alineacion).texto}">${botonModal(ids[i], item.etiqueta || '')}</div>`,
                    `${ind(n + 2)}</div>`);
            });
            partes.push(`${ind(n + 1)}</div>`, `${ind(n)}</div>`);
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
        nuevo: () => ({ url: '', titulo: 'Video' }),
        resumen: b => b.url || 'sin URL',
        campos: [
            { k: 'url', tipo: 'url', etiqueta: 'Liga de YouTube', marcador: 'https://www.youtube.com/watch?v=...' },
            { k: 'titulo', tipo: 'texto', etiqueta: 'Título (accesibilidad)' }
        ],
        html: (b, n) => {
            const id = idDeYoutube(b.url || '');
            if (!id) return '';
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

    /* ---- Botón / enlace ---- */
    boton: {
        nombre: 'Botón',
        ayuda: 'Enlace a un documento o a otro sitio',
        icono: 'link',
        mini: MINI.boton,
        nuevo: () => ({ texto: 'Descargar el documento', url: '', estilo: 'boton', alineacion: 'centro' }),
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
            CAMPO_ALINEACION
        ],
        html: (b, n) => {
            const url = (b.url || '').trim();
            if (!url) return '';
            const clase = b.estilo === 'enlace'
                ? 'nomediaplugin'
                : 'btn btn-secondary btn-sm rounded-4 border border-4 border-secondary-10 nomediaplugin';
            // La fila y el texto se alinean juntos: con solo uno de los dos, un
            // botón "a la derecha" se quedaba centrado dentro de una columna
            // pegada a la derecha, que no es lo que nadie espera.
            const alineado = alineacionDe(b.alineacion);
            return [
                `${ind(n)}<div class="row bloque ${alineado.fila}">`,
                `${ind(n + 1)}<div class="col-12 ${alineado.texto}">`,
                `${ind(n + 2)}<a href="${ligaSegura(url)}" target="_blank" class="${clase}">${marcas(b.texto || '')}</a>`,
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
        nuevo: () => ({ tipo: 'info', texto: '' }),
        resumen: b => b.texto,
        campos: [
            {
                k: 'tipo', tipo: 'opciones', etiqueta: 'Tono', ops: [
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
            const clase = b.tipo === 'enmarcado' ? 'enmarcado' : `alert alert-${b.tipo || 'info'}`;
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

/** Id de un video de YouTube en cualquiera de sus formas de liga. */
function idDeYoutube(url) {
    const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{6,})/);
    return m ? m[1] : '';
}

/* Orden de la paleta: primero lo de toda página, luego lo compuesto. */
const ORDEN_PALETA = ['titulo', 'texto', 'lista', 'pasos', 'imagen', 'instruccion', 'tabla',
    'acordeon', 'modal', 'tarjetas', 'pestanas', 'video', 'boton', 'alerta', 'separador'];

/* Paletas del aula. Las clases son las del tema (mainPlantilla23.M01 …); los
   hex son SOLO la muestra de color del selector, no salen al HTML. */
/* PALETAS vive en assets/paletas.js: la comparten esta herramienta y
   Bibliografías Margarita Maza. */
