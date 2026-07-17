/* ==========================================================================
   Micrositio -> recurso Página de Moodle.

   Todo pasa en el navegador: el .zip nunca sale de tu equipo.

   El .zip se lee sin librerías, con DecompressionStream('deflate-raw'), que
   ya traen los navegadores modernos. Así el proyecto sigue sin dependencias.
   ========================================================================== */

/* ------------------------------------------------------------------ ZIP --- */

const SIG_EOCD = 0x06054b50;   // fin del directorio central
const SIG_CD = 0x02014b50;     // entrada del directorio central
const SIG_LOCAL = 0x04034b50;  // cabecera local de archivo

async function inflar(datos, metodo) {
    if (metodo === 0) return datos;              // guardado sin comprimir
    if (metodo !== 8) {                          // 8 = deflate
        throw new Error(`Método de compresión no soportado (${metodo})`);
    }
    const stream = new Blob([datos]).stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

function buscarEOCD(dv) {
    // El EOCD va al final, pero puede llevar hasta 64KB de comentario detrás.
    const min = Math.max(0, dv.byteLength - 65557);
    for (let i = dv.byteLength - 22; i >= min; i--) {
        if (dv.getUint32(i, true) === SIG_EOCD) return i;
    }
    return -1;
}

/**
 * Lee un .zip y devuelve Map<ruta, Uint8Array>.
 * Solo lo necesario para micrositios: sin zip64, sin cifrado.
 */
async function leerZip(buffer) {
    const dv = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    const eocd = buscarEOCD(dv);
    if (eocd < 0) throw new Error('No parece un .zip válido (no se encontró el índice).');

    const totalEntradas = dv.getUint16(eocd + 10, true);
    let puntero = dv.getUint32(eocd + 16, true); // inicio del directorio central

    const archivos = new Map();

    for (let i = 0; i < totalEntradas; i++) {
        if (dv.getUint32(puntero, true) !== SIG_CD) break;

        const flags = dv.getUint16(puntero + 8, true);
        const metodo = dv.getUint16(puntero + 10, true);
        const tamComprimido = dv.getUint32(puntero + 20, true);
        const largoNombre = dv.getUint16(puntero + 28, true);
        const largoExtra = dv.getUint16(puntero + 30, true);
        const largoComentario = dv.getUint16(puntero + 32, true);
        const offsetLocal = dv.getUint32(puntero + 42, true);

        // El bit 11 indica nombres en UTF-8. Si no está, suele ser CP437, que
        // TextDecoder no soporta; UTF-8 es la mejor apuesta y los nombres ASCII
        // (la mayoría) salen bien igual.
        const utf8 = (flags & 0x800) !== 0;
        const nombre = new TextDecoder(utf8 ? 'utf-8' : 'utf-8', { fatal: false })
            .decode(bytes.subarray(puntero + 46, puntero + 46 + largoNombre));

        puntero += 46 + largoNombre + largoExtra + largoComentario;

        if (nombre.endsWith('/')) continue;                 // carpeta
        if (nombre.split('/').some(p => p === '__MACOSX')) continue;
        if (nombre.split('/').pop().startsWith('._')) continue; // basura de macOS

        // La cabecera local repite nombre y extra con largos propios: hay que
        // leerlos de ahí para ubicar el inicio real de los datos.
        if (dv.getUint32(offsetLocal, true) !== SIG_LOCAL) continue;
        const nombreLocal = dv.getUint16(offsetLocal + 26, true);
        const extraLocal = dv.getUint16(offsetLocal + 28, true);
        const inicio = offsetLocal + 30 + nombreLocal + extraLocal;

        const crudo = bytes.subarray(inicio, inicio + tamComprimido);
        try {
            archivos.set(nombre, await inflar(crudo, metodo));
        } catch (e) {
            console.warn('[micrositio] No se pudo extraer', nombre, e);
        }
    }

    return archivos;
}

/* --------------------------------------------------------------- Rutas --- */

const EXT_MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
    bmp: 'image/bmp'
};

function extension(ruta) {
    return (ruta.split('.').pop() || '').toLowerCase();
}

function esImagen(ruta) {
    return Object.hasOwn(EXT_MIME, extension(ruta));
}

function esExterna(url) {
    return /^(https?:)?\/\//i.test(url) || /^(data|mailto|tel|javascript):/i.test(url);
}

/** Resuelve "../img/x.png" contra la carpeta del index. Devuelve ruta del zip. */
function resolverRuta(dirBase, relativa) {
    const limpia = relativa.split('#')[0].split('?')[0];
    // La API URL hace el trabajo de ./ y ../ ; el origen falso da igual.
    const url = new URL(decodeURI(limpia), 'file:///' + dirBase);
    return decodeURIComponent(url.pathname.slice(1));
}

/* --------------------------------------------------- Saberes de Moodle --- */

/**
 * Qué recursos externos ya trae Moodle 5.x cargados. Si el micrositio los pide
 * por CDN, quitarlos no rompe nada: por eso conviene decirlo y no alarmar.
 */
const YA_EN_MOODLE = [
    { re: /bootstrap[.\-@][\w.\-]*\/?(dist\/)?js|bootstrap\.bundle/i, nombre: 'Bootstrap JS',
      nota: 'Moodle 5 ya carga Bootstrap 5. Los desplegables siguen funcionando sin este script.' },
    { re: /bootstrap[.\-@][\w.\-]*\/?(dist\/)?css|bootstrap\.min\.css/i, nombre: 'Bootstrap CSS',
      nota: 'Moodle 5 ya trae Bootstrap 5: las clases row/col/card ya están.' },
    { re: /kit\.fontawesome\.com|fontawesome|font-awesome/i, nombre: 'Font Awesome',
      nota: 'Moodle ya trae Font Awesome; los iconos <i class="fa-…"> siguen sirviendo.' },
    { re: /jquery/i, nombre: 'jQuery',
      nota: 'Moodle ya carga jQuery.' }
];

/**
 * data-bs-toggle: qué componentes de Bootstrap viven solo de atributos y cuáles
 * necesitan que alguien los inicialice con JS (que Moodle no va a ejecutar).
 */
const BS_SIN_JS = ['collapse', 'dropdown', 'modal', 'offcanvas', 'tab', 'pill', 'button', 'collapse'];
const BS_CON_JS = ['tooltip', 'popover'];

function clasificarExterno(url) {
    return YA_EN_MOODLE.find(x => x.re.test(url)) || null;
}

/** Resumen corto del contenido de una fila, para el desplegable de títulos. */
function resumenFila(fila) {
    const texto = [...fila.querySelectorAll('th, td')]
        .map(c => (c.textContent || '').trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .join(' · ');
    return texto.length > 55 ? texto.slice(0, 55) + '…' : (texto || '(fila vacía)');
}

/**
 * Aplica el formato responsive de tarjetas del panel: la clase
 * tabla-responsive-cards + un data-label por celda, que el CSS de Moodle
 * imprime como encabezado cuando la tabla se vuelve tarjeta en celular.
 *
 * `headerIndex` fuerza qué fila son los títulos (lo elige el usuario en el
 * selector); si es null, se auto-detecta (el <thead>, o la primera fila).
 * `colorear` pinta la 1ª columna alternando rosa/verde, igual que el
 * Convertidor de Tablas.
 *
 * Devuelve { titulos, headerIndex, filas } para pintar el selector, o null si la
 * tabla no tiene de dónde sacar títulos.
 */
function aplicarResponsive(tabla, { headerIndex = null, colorear = false } = {}) {
    const filas = [...tabla.querySelectorAll('tr')];
    if (filas.length < 2) return null;

    // Índice de la fila de títulos: lo que eligió el usuario, o auto-detección.
    let idx;
    if (headerIndex !== null && filas[headerIndex]) {
        idx = headerIndex;
    } else {
        const theadTr = tabla.querySelector('thead tr');
        idx = theadTr ? filas.indexOf(theadTr) : 0;
    }

    const titulos = [...filas[idx].querySelectorAll('th, td')]
        .map(c => (c.textContent || '').trim().replace(/\s+/g, ' '));
    if (titulos.every(t => t === '')) return null;

    // El cuerpo es siempre lo que va DESPUÉS de la fila de títulos: así funciona
    // igual con encabezado en <thead> o en una fila cualquiera que se elija.
    const cuerpo = filas.slice(idx + 1);

    cuerpo.forEach((fila, rowIndex) => {
        const celdas = [...fila.querySelectorAll('td, th')];
        celdas.forEach((celda, i) => {
            if (titulos[i]) celda.setAttribute('data-label', titulos[i]);
        });
        if (colorear && celdas[0]) {
            // Normaliza cualquier color previo del micrositio y aplica el alternado.
            celdas[0].classList.remove('bg-primary-10', 'bg-secondary-10',
                'bg-primary', 'bg-secondary', 'opacity-10');
            celdas[0].classList.add(rowIndex % 2 === 0 ? 'bg-primary-10' : 'bg-secondary-10');
        }
    });

    tabla.classList.add('table', 'tabla-responsive-cards');

    return {
        titulos,
        headerIndex: idx,
        filas: filas.map((f, i) => ({ index: i, resumen: resumenFila(f) }))
    };
}

/* ----------------------------------------------- Carpetas sin comprimir --- */

/**
 * Recorre una entrada del portapapeles/arrastre (archivo o carpeta) y llena el
 * mapa con rutas relativas, igual que haría el .zip.
 */
async function leerEntrada(entrada, prefijo, mapa) {
    if (entrada.isFile) {
        const file = await new Promise((ok, err) => entrada.file(ok, err));
        mapa.set(prefijo + entrada.name, new Uint8Array(await file.arrayBuffer()));
        return;
    }
    if (!entrada.isDirectory) return;

    const lector = entrada.createReader();
    // readEntries devuelve como mucho 100 entradas por llamada: hay que
    // insistir hasta que conteste vacío.
    let lote;
    do {
        lote = await new Promise((ok, err) => lector.readEntries(ok, err));
        for (const hija of lote) {
            await leerEntrada(hija, `${prefijo}${entrada.name}/`, mapa);
        }
    } while (lote.length > 0);
}

/** Archivos elegidos con <input webkitdirectory>: traen webkitRelativePath. */
function mapaDesdeInputCarpeta(fileList) {
    return Promise.all([...fileList].map(async (f) => [
        f.webkitRelativePath || f.name,
        new Uint8Array(await f.arrayBuffer())
    ])).then(pares => new Map(pares));
}

/** Quita la basura de macOS, igual que en el lector de zip. */
function limpiarMapa(mapa) {
    for (const ruta of [...mapa.keys()]) {
        const partes = ruta.split('/');
        if (partes.some(p => p === '__MACOSX') || partes.pop().startsWith('._')) {
            mapa.delete(ruta);
        }
    }
    return mapa;
}

/* -------------------------------------------------------- Comparar CSS --- */

/**
 * Parsea CSS a Map<clave, declaraciones> usando el motor del navegador (nada de
 * regex frágil). CSSStyleSheet construible: se parsea pero NO se aplica, así
 * que el CSS ajeno no puede tocar los estilos del panel.
 * La clave incluye la condición de @media para no confundir reglas homónimas.
 */
function parsearCSS(texto) {
    const mapa = new Map();
    const hoja = new CSSStyleSheet();
    // @import no se puede resolver aquí y hace fallar el parseo entero.
    hoja.replaceSync(texto.replace(/@import[^;]+;/gi, ''));

    (function recorrer(reglas, contexto) {
        for (const regla of reglas) {
            if (regla.cssRules && regla.conditionText !== undefined) {
                recorrer(regla.cssRules, `${contexto}@media ${regla.conditionText} `);
            } else if (regla.selectorText) {
                const clave = contexto + regla.selectorText;
                // Normalizamos para que un cambio de orden o de espacios no
                // cuente como diferencia real.
                const decl = [...regla.style]
                    .map(p => `${p}:${regla.style.getPropertyValue(p).trim()}`)
                    .sort()
                    .join(';');
                mapa.set(clave, decl);
            }
        }
    })(hoja.cssRules, '');

    return mapa;
}

function compararCSS(cssMicrositio, cssMoodle) {
    const A = parsearCSS(cssMicrositio);
    const B = parsearCSS(cssMoodle);

    const faltantes = [];
    const diferentes = [];
    let iguales = 0;

    for (const [sel, decl] of A) {
        if (!B.has(sel)) faltantes.push(sel);
        else if (B.get(sel) !== decl) diferentes.push({ sel, micrositio: decl, moodle: B.get(sel) });
        else iguales++;
    }

    return { faltantes, diferentes, iguales, totalMicrositio: A.size, totalMoodle: B.size };
}

/* -------------------------------------------------- URL de borrador --- */

/**
 * Al arrastrar una imagen al editor, Moodle la guarda en un "área de borrador"
 * y la inserta con una URL así:
 *   https://sitio/draftfile.php/5/user/draft/123456789/clic.svg
 *
 * Todas las imágenes de ese mismo editor comparten esa carpeta. Si apuntamos el
 * HTML ahí, al guardar Moodle convierte esas URLs a @@PLUGINFILE@@ él solo, que
 * es exactamente su flujo normal. Es más seguro que escribir @@PLUGINFILE@@ a
 * mano, porque el editor nunca ve un marcador que no sabe interpretar.
 *
 * Devuelve la carpeta (con la barra final) o null si la URL no sirve.
 */
function baseDeBorrador(url) {
    const limpia = (url || '').trim();
    if (!limpia || !/draftfile\.php\//i.test(limpia)) return null;
    const corte = limpia.lastIndexOf('/');
    if (corte < 0) return null;
    return limpia.slice(0, corte + 1);
}

/* -------------------------------------------- SVG -> PNG y armado zip --- */

/**
 * Lee las medidas de un SVG. El arrastre múltiple de TinyMCE rechaza los SVG,
 * así que los rasterizamos a PNG para poder subirlos como los demás. Un SVG sin
 * width/height explícitos hay que medirlo por su viewBox o saldría de 0px.
 */
function medidasSVG(texto) {
    const svg = new DOMParser().parseFromString(texto, 'image/svg+xml').querySelector('svg');
    let ancho = parseFloat(svg?.getAttribute('width'));
    let alto = parseFloat(svg?.getAttribute('height'));
    if (!ancho || !alto) {
        const vb = (svg?.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
        if (vb.length === 4) { ancho = ancho || vb[2]; alto = alto || vb[3]; }
    }
    return { ancho: ancho || 512, alto: alto || 512 };
}

function cargarImagen(url) {
    return new Promise((ok, err) => {
        const img = new Image();
        img.onload = () => ok(img);
        img.onerror = () => err(new Error('No se pudo rasterizar un SVG'));
        img.src = url;
    });
}

/** Dibuja el SVG en un canvas y lo devuelve como PNG, a resolución generosa. */
async function rasterizarSVG(bytes, escala = 3) {
    // Usamos el tamaño REAL del SVG (width/height o viewBox), no img.naturalWidth:
    // para un SVG sin tamaño intrínseco Chrome lo fija en 300px y salían PNGs
    // deformes. Con esto el PNG mide lo que el SVG dice, a alta resolución.
    let { ancho, alto } = medidasSVG(new TextDecoder('utf-8').decode(bytes));
    const lado = Math.max(ancho, alto);
    const MAX = 3072;   // tope de memoria
    const PISO = 1200;  // resolución mínima del lado largo para imágenes no diminutas

    // Base ×escala (retina). Para imágenes medianas/grandes —ilustraciones, no
    // íconos— subimos hasta un piso: un SVG detallado mostrado grande se ve
    // borroso si el PNG tiene pocos píxeles (el SVG es vectorial; el PNG no).
    let objetivo = lado * escala;
    if (lado >= 150) objetivo = Math.max(objetivo, PISO);
    objetivo = Math.min(objetivo, MAX);
    const esc = objetivo / lado;

    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }));
    try {
        const img = await cargarImagen(url);
        const w = Math.max(1, Math.round(ancho * esc));
        const h = Math.max(1, Math.round(alto * esc));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        return new Uint8Array(await blob.arrayBuffer());
    } finally {
        URL.revokeObjectURL(url);
    }
}

const CRC_TABLA = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Arma un .zip "stored" (sin compresión) sin librerías, igual que leemos el zip
 * a mano. Los PNG/JPG ya vienen comprimidos, así que comprimir de nuevo no
 * ahorra nada. Marca los nombres como UTF-8 (bit 11) para respetar acentos.
 */
function armarZipStored(entradas) {
    const enc = new TextEncoder();
    const datosLocales = [];
    const central = [];
    let offset = 0;

    for (const { nombre, datos } of entradas) {
        const nombreBytes = enc.encode(nombre);
        const crc = crc32(datos);
        const tam = datos.length;

        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, SIG_LOCAL, true);
        lh.setUint16(4, 20, true);       // versión necesaria
        lh.setUint16(6, 0x0800, true);   // bandera: nombres UTF-8
        lh.setUint16(8, 0, true);        // método 0 = stored
        lh.setUint32(14, crc, true);
        lh.setUint32(18, tam, true);     // tam comprimido
        lh.setUint32(22, tam, true);     // tam sin comprimir
        lh.setUint16(26, nombreBytes.length, true);
        datosLocales.push(new Uint8Array(lh.buffer), nombreBytes, datos);

        const cd = new DataView(new ArrayBuffer(46));
        cd.setUint32(0, SIG_CD, true);
        cd.setUint16(4, 20, true);       // versión que lo creó
        cd.setUint16(6, 20, true);       // versión necesaria
        cd.setUint16(8, 0x0800, true);   // bandera UTF-8
        cd.setUint16(10, 0, true);       // método stored
        cd.setUint32(16, crc, true);
        cd.setUint32(20, tam, true);
        cd.setUint32(24, tam, true);
        cd.setUint16(28, nombreBytes.length, true);
        cd.setUint32(42, offset, true);  // offset de la cabecera local
        central.push(new Uint8Array(cd.buffer), nombreBytes);

        offset += 30 + nombreBytes.length + tam;
    }

    const centralTam = central.reduce((s, c) => s + c.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, SIG_EOCD, true);
    eocd.setUint16(8, entradas.length, true);
    eocd.setUint16(10, entradas.length, true);
    eocd.setUint32(12, centralTam, true);
    eocd.setUint32(16, offset, true);    // inicio del directorio central

    return new Blob([...datosLocales, ...central, new Uint8Array(eocd.buffer)],
        { type: 'application/zip' });
}

/* ------------------------------------------------------------- Estado --- */

let ARCHIVOS = new Map();   // ruta -> Uint8Array
let BLOBS = [];             // URLs a revocar entre conversiones
let RENOMBRE = new Map();   // nombre de salida -> ruta original (para la preview)
let ULTIMO_REPORTE = null;  // último reporte, para la descarga de imágenes
let HEADER_OVERRIDE = new Map(); // índice de tabla -> fila de títulos elegida a mano

/* ---------------------------------------------------------------- Init --- */

function initMicrositio() {
    const dropzone = document.getElementById('dropzone');
    const inputZip = document.getElementById('input-zip');
    const inputCarpeta = document.getElementById('input-carpeta');
    const zipInfo = document.getElementById('zip-info');
    const filaHtml = document.getElementById('fila-html');
    const selectHtml = document.getElementById('select-html');
    const btnConvertir = document.getElementById('btn-convertir');
    const btnPasos = document.getElementById('btn-pasos');
    const btnCopy = document.getElementById('btn-copy');
    const btnCopyCss = document.getElementById('btn-copy-css');
    const outputCode = document.getElementById('output-code');
    const outputCss = document.getElementById('output-css');
    const previewEmpty = document.getElementById('preview-empty');
    const previewFrame = document.getElementById('preview-frame');
    const imgsLista = document.getElementById('imgs-lista');
    const badgeImgs = document.getElementById('badge-imgs');
    const revisionLista = document.getElementById('revision-lista');
    const inputDraft = document.getElementById('input-draft');
    const notaDraft = document.getElementById('nota-draft');
    const inputCssMoodle = document.getElementById('input-css-moodle');
    const btnComparar = document.getElementById('btn-comparar');
    const cmpResultado = document.getElementById('cmp-resultado');
    const modal = document.getElementById('modal-pasos');
    const modalClose = document.getElementById('modal-close');
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    const opt = {
        pluginfile: document.getElementById('opt-pluginfile'),
        soloBody: document.getElementById('opt-solo-body'),
        quitarCss: document.getElementById('opt-quitar-css'),
        quitarJs: document.getElementById('opt-quitar-js'),
        tabla: document.getElementById('opt-tabla'),
        svgPng: document.getElementById('opt-svg-png'),
        colorear: document.getElementById('opt-colorear'),
        previewMoodle: document.getElementById('opt-preview-moodle')
    };
    const btnDescargarImgs = document.getElementById('btn-descargar-imgs');

    function activarTab(nombre) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.target === nombre));
        tabContents.forEach(c => c.classList.toggle('active', c.id === `${nombre}-content`));
    }
    tabs.forEach(t => t.addEventListener('click', () => activarTab(t.dataset.target)));

    /* ------------------------------------------------------- Cargar zip */

    function avisoCarga(clase, icono, texto) {
        zipInfo.classList.remove('hidden');
        zipInfo.className = `zip-info aviso aviso-${clase}`;
        zipInfo.innerHTML = `<i class="ph ph-${icono}"></i> <span>${texto}</span>`;
    }

    /** Punto único de entrada: da igual si vino de .zip, carpeta o archivos. */
    async function procesarArchivos(mapa, etiqueta) {
        ARCHIVOS = limpiarMapa(mapa);
        HEADER_OVERRIDE = new Map();   // otro micrositio, otras tablas

        const htmls = [...ARCHIVOS.keys()].filter(r => /\.html?$/i.test(r));
        if (htmls.length === 0) {
            avisoCarga('error', 'x-circle', 'No se encontró ningún archivo .html');
            btnConvertir.disabled = true;
            return;
        }

        // El index de la carpeta más superficial es el candidato natural.
        htmls.sort((a, b) => {
            const nivel = a.split('/').length - b.split('/').length;
            if (nivel !== 0) return nivel;
            const esIndex = (r) => (/(^|\/)index\.html?$/i.test(r) ? 0 : 1);
            return esIndex(a) - esIndex(b);
        });

        selectHtml.innerHTML = '';
        htmls.forEach(r => {
            const o = document.createElement('option');
            o.value = r;
            o.textContent = r;
            selectHtml.appendChild(o);
        });
        filaHtml.classList.toggle('hidden', htmls.length < 2);

        const imgs = [...ARCHIVOS.keys()].filter(esImagen).length;
        avisoCarga('ok', 'check-circle',
            `<strong>${escapar(etiqueta)}</strong> — ${ARCHIVOS.size} archivos, ` +
            `${imgs} imágenes, ${htmls.length} HTML`);

        btnConvertir.disabled = false;
        convertir();
    }

    async function cargarZip(file) {
        if (!file) return;
        avisoCarga('info', 'spinner', 'Leyendo el zip…');
        try {
            await procesarArchivos(await leerZip(await file.arrayBuffer()), file.name);
        } catch (e) {
            avisoCarga('error', 'x-circle', escapar(e.message));
            btnConvertir.disabled = true;
        }
    }

    async function cargarCarpeta(fileList) {
        if (!fileList || !fileList.length) return;
        avisoCarga('info', 'spinner', 'Leyendo la carpeta…');
        try {
            const mapa = await mapaDesdeInputCarpeta(fileList);
            const raiz = (fileList[0].webkitRelativePath || '').split('/')[0];
            await procesarArchivos(mapa, raiz || `${fileList.length} archivos`);
        } catch (e) {
            avisoCarga('error', 'x-circle', escapar(e.message));
            btnConvertir.disabled = true;
        }
    }

    /** Un arrastre puede traer un .zip, una carpeta o varios archivos sueltos. */
    async function cargarDesdeArrastre(dt) {
        const entradas = [...dt.items]
            .map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
            .filter(Boolean);

        const soloZip = dt.files.length === 1 && /\.zip$/i.test(dt.files[0].name);
        if (soloZip) return cargarZip(dt.files[0]);

        if (entradas.length === 0) {
            // Navegador sin API de entradas: al menos aceptamos archivos planos.
            const mapa = new Map();
            for (const f of dt.files) mapa.set(f.name, new Uint8Array(await f.arrayBuffer()));
            return procesarArchivos(mapa, `${dt.files.length} archivos`);
        }

        avisoCarga('info', 'spinner', 'Leyendo la carpeta…');
        try {
            const mapa = new Map();
            for (const entrada of entradas) await leerEntrada(entrada, '', mapa);
            const etiqueta = entradas.length === 1 && entradas[0].isDirectory
                ? entradas[0].name
                : `${mapa.size} archivos`;
            await procesarArchivos(mapa, etiqueta);
        } catch (e) {
            avisoCarga('error', 'x-circle', escapar(e.message));
            btnConvertir.disabled = true;
        }
    }

    document.getElementById('btn-buscar-zip')
        .addEventListener('click', () => inputZip.click());
    document.getElementById('btn-buscar-carpeta')
        .addEventListener('click', () => inputCarpeta.click());

    inputZip.addEventListener('change', () => cargarZip(inputZip.files[0]));
    inputCarpeta.addEventListener('change', () => cargarCarpeta(inputCarpeta.files));

    ['dragenter', 'dragover'].forEach(ev =>
        dropzone.addEventListener(ev, (e) => {
            e.preventDefault();
            dropzone.classList.add('dropzone--activa');
        })
    );
    ['dragleave', 'drop'].forEach(ev =>
        dropzone.addEventListener(ev, (e) => {
            e.preventDefault();
            dropzone.classList.remove('dropzone--activa');
        })
    );
    dropzone.addEventListener('drop', (e) => cargarDesdeArrastre(e.dataTransfer));

    /* -------------------------------------------------------- Convertir */

    function convertir() {
        if (ARCHIVOS.size === 0) return;

        BLOBS.forEach(URL.revokeObjectURL);
        BLOBS = [];
        RENOMBRE = new Map();

        const rutaHtml = selectHtml.value;
        const dirBase = rutaHtml.includes('/')
            ? rutaHtml.slice(0, rutaHtml.lastIndexOf('/') + 1)
            : '';

        const texto = new TextDecoder('utf-8').decode(ARCHIVOS.get(rutaHtml));
        const doc = new DOMParser().parseFromString(texto, 'text/html');

        const draftBase = baseDeBorrador(inputDraft.value);
        pintarNotaDraft(draftBase);

        const reporte = {
            usadas: new Map(),   // basename -> {ruta, tam}
            faltantes: [],       // referencias que no están en el zip
            colisiones: new Map(),
            externas: [],
            scripts: [],         // {url, conocido, inline}
            deps: [],            // {url, conocido}
            interactivos: new Map(), // tipo data-bs-toggle -> cantidad
            tablas: [],          // títulos aplicados por tabla
            enlaces: [],
            sinUsar: [],
            cssLocales: []       // url() del CSS que apuntan a archivos del zip
        };

        // --- Scripts: distinguir librería que Moodle ya trae vs código propio
        doc.querySelectorAll('script').forEach(s => {
            const src = s.getAttribute('src');
            reporte.scripts.push(src
                ? { url: src, conocido: clasificarExterno(src), inline: false }
                : { url: (s.textContent || '').trim(), conocido: null, inline: true });
            if (opt.quitarJs.checked) s.remove();
        });

        // --- Interactivos de Bootstrap declarados por atributo
        doc.querySelectorAll('[data-bs-toggle], [data-toggle]').forEach(el => {
            const tipo = el.getAttribute('data-bs-toggle') || el.getAttribute('data-toggle');
            reporte.interactivos.set(tipo, (reporte.interactivos.get(tipo) || 0) + 1);
        });

        // --- Tablas. El índice en reporte.tablas es el orden de la tabla en el
        // documento, y con esa clave guardamos qué fila de títulos eligió el
        // usuario (HEADER_OVERRIDE), para que sobreviva a cada reconversión.
        if (opt.tabla.checked) {
            [...doc.querySelectorAll('table')].forEach((t, i) => {
                reporte.tablas.push(aplicarResponsive(t, {
                    headerIndex: HEADER_OVERRIDE.has(i) ? HEADER_OVERRIDE.get(i) : null,
                    colorear: opt.colorear.checked
                }));
            });
        } else {
            doc.querySelectorAll('table').forEach(() => reporte.tablas.push(null));
        }

        // --- CSS
        const css = [];
        doc.querySelectorAll('link[rel~="stylesheet" i]').forEach(l => {
            const href = l.getAttribute('href');
            if (href && !esExterna(href)) {
                const ruta = resolverRuta(dirBase, href);
                const datos = ARCHIVOS.get(ruta);
                if (datos) {
                    css.push(`/* ===== ${ruta} ===== */\n` +
                        new TextDecoder('utf-8').decode(datos));
                }
            } else if (href) {
                reporte.deps.push({ url: href, conocido: clasificarExterno(href) });
            }
            if (opt.quitarCss.checked) l.remove();
        });
        doc.querySelectorAll('style').forEach(s => {
            css.push(`/* ===== <style> en ${rutaHtml} ===== */\n${s.textContent.trim()}`);
            if (opt.quitarCss.checked) s.remove();
        });

        // El CSS se va a vivir a la hoja de Moodle, donde las rutas relativas
        // del micrositio (fonts/…, img/…) ya no existen. Las data: URI sí viajan.
        for (const [, , valor] of css.join('\n').matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
            const limpio = valor.trim();
            if (!esExterna(limpio) && !/^data:/i.test(limpio)) reporte.cssLocales.push(limpio);
        }

        /** Traduce una ruta relativa a @@PLUGINFILE@@/archivo, registrando el reporte. */
        function traducir(valor) {
            if (!valor || esExterna(valor)) {
                if (valor && esExterna(valor) && !/^data:/i.test(valor)) {
                    reporte.externas.push(valor);
                }
                return null;
            }

            const ruta = resolverRuta(dirBase, valor);
            const base = ruta.split('/').pop();

            if (!ARCHIVOS.has(ruta)) {
                reporte.faltantes.push(valor);
                return null;
            }

            // Solo reescribimos la ruta si vamos a apuntar a Moodle (borrador o
            // marcador). En ese caso, si es SVG y el toggle está activo, el
            // nombre de salida pasa a .png (TinyMCE rechaza los SVG al arrastre
            // múltiple; los subimos ya rasterizados).
            const reescribiendo = draftBase || opt.pluginfile.checked;
            const salida = (reescribiendo && opt.svgPng.checked && extension(ruta) === 'svg')
                ? base.replace(/\.svg$/i, '.png')
                : base;

            // Al arrastrarlas al editor todas quedan planas: dos archivos con el
            // mismo nombre en carpetas distintas se pisarían.
            const previa = reporte.usadas.get(base);
            if (previa && previa.ruta !== ruta) {
                if (!reporte.colisiones.has(base)) reporte.colisiones.set(base, new Set([previa.ruta]));
                reporte.colisiones.get(base).add(ruta);
            } else {
                reporte.usadas.set(base, { ruta, tam: ARCHIVOS.get(ruta).length, salida });
                RENOMBRE.set(salida, ruta);   // la preview resuelve el nombre de salida al archivo real
            }

            // Si nos dieron la carpeta de borrador, apuntamos ahí: al guardar,
            // Moodle la convierte a @@PLUGINFILE@@ por su cuenta.
            if (draftBase) return draftBase + encodeURIComponent(salida);

            return opt.pluginfile.checked
                ? `@@PLUGINFILE@@/${encodeURIComponent(salida)}`
                : valor;
        }

        // --- Imágenes: src, srcset, <source>, y url() en estilos en línea
        doc.querySelectorAll('img, source').forEach(el => {
            const src = el.getAttribute('src');
            if (src !== null) {
                const nuevo = traducir(src);
                if (nuevo) el.setAttribute('src', nuevo);

                // Si convertimos un SVG a PNG y el <img> no dice de qué tamaño va,
                // le fijamos el tamaño real del SVG. Sin esto, el PNG se mostraba
                // a su resolución en píxeles (gigante) cuando el recurso no lo
                // limitaba por CSS. El atributo width/height cede ante cualquier
                // CSS existente, así que no pisa los casos que ya se veían bien.
                if (nuevo && el.tagName === 'IMG' && /\.png$/i.test(nuevo) && !esExterna(src)
                    && !el.hasAttribute('width') && !el.hasAttribute('height')) {
                    const ruta = resolverRuta(dirBase, src);
                    if (extension(ruta) === 'svg' && ARCHIVOS.has(ruta)) {
                        const { ancho, alto } = medidasSVG(
                            new TextDecoder('utf-8').decode(ARCHIVOS.get(ruta)));
                        el.setAttribute('width', Math.round(ancho));
                        el.setAttribute('height', Math.round(alto));
                    }
                }
            }

            const srcset = el.getAttribute('srcset');
            if (srcset) {
                const partes = srcset.split(',').map(p => {
                    const [url, ...resto] = p.trim().split(/\s+/);
                    const nuevo = traducir(url);
                    return [nuevo || url, ...resto].join(' ');
                });
                el.setAttribute('srcset', partes.join(', '));
            }
        });

        doc.querySelectorAll('[style]').forEach(el => {
            const estilo = el.getAttribute('style');
            const nuevo = estilo.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (todo, comilla, url) => {
                const t = traducir(url.trim());
                return t ? `url(${comilla}${t}${comilla})` : todo;
            });
            if (nuevo !== estilo) el.setAttribute('style', nuevo);
        });

        // --- Enlaces a otras páginas del micrositio: no se pueden resolver solos
        doc.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (!href || esExterna(href) || href.startsWith('#')) return;
            if (/\.html?$/i.test(href.split('#')[0])) reporte.enlaces.push(href);
        });

        // --- Imágenes del zip que nadie referencia
        reporte.sinUsar = [...ARCHIVOS.keys()]
            .filter(esImagen)
            .filter(r => ![...reporte.usadas.values()].some(u => u.ruta === r));

        /* ---- Salidas */

        const html = opt.soloBody.checked
            ? doc.body.innerHTML.trim()
            : doc.documentElement.outerHTML;

        outputCode.value = html;
        outputCss.value = css.join('\n\n');
        pintarReporte(reporte);
        pintarRevision(reporte);
        pintarPreview(doc, css.join('\n\n'), dirBase);
        if (inputCssMoodle.value.trim()) pintarComparacion();

        badgeImgs.textContent = String(reporte.usadas.size);
        badgeImgs.classList.remove('hidden');

        const problemas = reporte.faltantes.length + reporte.colisiones.size;
        badgeImgs.classList.toggle('badge--alerta', problemas > 0);

        ULTIMO_REPORTE = reporte;
        btnDescargarImgs.classList.toggle('hidden', reporte.usadas.size === 0);
    }

    /* ------------------------------------------------ Descargar imágenes */

    /**
     * Empaqueta en un .zip todas las imágenes que esta página usa, ya listas para
     * arrastrar al editor: las de mapa de bits tal cual y los SVG rasterizados a
     * PNG (con el nombre que el HTML ya referencia). Un solo arrastre, sin
     * excepciones de SVG.
     */
    async function descargarImagenes() {
        if (!ULTIMO_REPORTE || !ULTIMO_REPORTE.usadas.size) return;

        const original = btnDescargarImgs.innerHTML;
        btnDescargarImgs.disabled = true;
        btnDescargarImgs.innerHTML = '<i class="ph ph-spinner"></i> Preparando…';

        try {
            const entradas = [];
            for (const info of ULTIMO_REPORTE.usadas.values()) {
                const datos = ARCHIVOS.get(info.ruta);
                if (!datos) continue;

                // El nombre de salida manda: si quedó .png y el original es .svg,
                // rasterizamos; así el archivo casa con lo que el HTML pide.
                if (extension(info.salida) === 'png' && extension(info.ruta) === 'svg') {
                    try {
                        entradas.push({ nombre: info.salida, datos: await rasterizarSVG(datos) });
                        continue;
                    } catch (e) {
                        console.warn('[micrositio] SVG que no se pudo rasterizar:', info.ruta, e);
                        // Cae al SVG original con su nombre original, para no perderlo.
                        entradas.push({ nombre: info.ruta.split('/').pop(), datos });
                        continue;
                    }
                }
                entradas.push({ nombre: info.salida, datos });
            }

            const url = URL.createObjectURL(armarZipStored(entradas));
            const a = document.createElement('a');
            a.href = url;
            a.download = 'imagenes-moodle.zip';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } finally {
            btnDescargarImgs.disabled = false;
            btnDescargarImgs.innerHTML = original;
        }
    }

    btnDescargarImgs.addEventListener('click', descargarImagenes);

    /* ---------------------------------------------------------- Reporte */

    function pintarReporte(r) {
        const bloques = [];

        const lista = (items) => items.map(i => `<li><code>${escapar(i)}</code></li>`).join('');

        if (r.faltantes.length) {
            bloques.push(`<div class="aviso aviso-error"><i class="ph ph-x-circle"></i>
                <span><strong>${r.faltantes.length} imagen(es) que el HTML pide y NO están en el zip.</strong>
                Van a salir rotas.</span></div>
                <ul class="lista-reporte">${lista([...new Set(r.faltantes)])}</ul>`);
        }

        if (r.colisiones.size) {
            const filas = [...r.colisiones.entries()].map(([base, rutas]) =>
                `<li><code>${escapar(base)}</code> lo usan: ${[...rutas].map(x => `<code>${escapar(x)}</code>`).join(' · ')}</li>`
            ).join('');
            bloques.push(`<div class="aviso aviso-error"><i class="ph ph-warning-octagon"></i>
                <span><strong>Nombres repetidos en carpetas distintas.</strong> Al arrastrarlas al
                editor todas quedan planas y se pisarían. Renombra antes de subir.</span></div>
                <ul class="lista-reporte">${filas}</ul>`);
        }

        const raros = [...r.usadas.keys()].filter(n => /[^\w.\-]/.test(n));
        if (raros.length) {
            bloques.push(`<div class="aviso aviso-warn"><i class="ph ph-warning"></i>
                <span><strong>Nombres con espacios o acentos.</strong> Ya van codificados en el
                HTML, así que funcionan; súbelas <em>sin renombrar</em> o dejarán de coincidir.</span></div>
                <ul class="lista-reporte">${lista(raros)}</ul>`);
        }

        // Checklist principal
        if (r.usadas.size) {
            const entradas = [...r.usadas.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            const svgs = entradas.filter(([base, info]) => info.salida !== base).length;
            const filas = entradas.map(([base, info]) => `
                    <li>
                        <i class="ph ph-image"></i>
                        <code>${escapar(info.salida)}</code>
                        ${info.salida !== base ? `<span class="etiqueta-svg" title="Se rasteriza al descargar">SVG→PNG</span>` : ''}
                        <span class="ruta">${escapar(info.ruta)}</span>
                        <span class="peso">${(info.tam / 1024).toFixed(0)} KB</span>
                    </li>`).join('');
            bloques.unshift(`
                <div class="aviso aviso-ok"><i class="ph ph-check-circle"></i>
                    <span><strong>${r.usadas.size} imagen(es) para arrastrar al editor.</strong>
                    Usa <strong>Descargar imágenes</strong> y suelta todo el zip descomprimido en el
                    campo Contenido, de un jalón.${svgs ? ` Incluye ${svgs} SVG convertido(s) a PNG.` : ''}</span></div>
                <ul class="lista-imgs">${filas}</ul>`);
        } else {
            bloques.unshift(`<div class="aviso aviso-info"><i class="ph ph-info"></i>
                <span>Esta página no usa imágenes propias.</span></div>`);
        }

        if (r.sinUsar.length) {
            bloques.push(`<div class="aviso aviso-info"><i class="ph ph-info"></i>
                <span><strong>${r.sinUsar.length} imagen(es) del zip que esta página no usa.</strong>
                No hace falta subirlas (puede que las use otra página del micrositio).</span></div>
                <ul class="lista-reporte">${lista(r.sinUsar)}</ul>`);
        }

        imgsLista.innerHTML = bloques.join('');
    }

    /* -------------------------------------------------------- Revisión */

    function pintarRevision(r) {
        const bloques = [];
        const lista = (items) => items.map(i => `<li><code>${escapar(i)}</code></li>`).join('');

        // --- Tablas: por cada una, un selector para elegir la fila de títulos.
        if (r.tablas.length) {
            const detectadas = r.tablas.filter(Boolean).length;
            const sinTitulos = r.tablas.length - detectadas;

            if (detectadas) {
                const filasHtml = r.tablas.map((info, i) => {
                    if (!info) return '';
                    const opciones = info.filas.map(f =>
                        `<option value="${f.index}"${f.index === info.headerIndex ? ' selected' : ''}>` +
                        `Fila ${f.index + 1}: ${escapar(f.resumen)}</option>`
                    ).join('');
                    return `<li class="tabla-sel">
                        <div class="tabla-sel-cab"><i class="ph ph-table"></i> <strong>Tabla ${i + 1}</strong>
                            <span class="tabla-sel-titulos">${info.titulos.filter(Boolean).map(x => `<code>${escapar(x)}</code>`).join(' · ')}</span>
                        </div>
                        <label class="tabla-sel-fila">Fila de títulos:
                            <select class="sel-header" data-tabla="${i}">${opciones}</select>
                        </label>
                    </li>`;
                }).join('');
                bloques.push(`<div class="aviso aviso-ok"><i class="ph ph-table"></i>
                    <span><strong>${detectadas} tabla(s) detectada(s).</strong> Se les aplicó
                    <code>tabla-responsive-cards</code> y un <code>data-label</code> por celda. Si los
                    títulos no salieron bien, cambia la <strong>fila de títulos</strong> de esa tabla.</span></div>
                    <ul class="lista-tablas">${filasHtml}</ul>`);
            }

            if (sinTitulos > 0) {
                bloques.push(`<div class="aviso aviso-warn"><i class="ph ph-table"></i>
                    <span><strong>${sinTitulos} tabla(s) sin encabezado claro.</strong> No se les puso
                    <code>data-label</code>: revísalas con el Convertidor de Tablas, que te deja elegir
                    la fila de títulos a mano.</span></div>`);
            }
        }

        // --- Interactivos
        if (r.interactivos.size) {
            const filas = [...r.interactivos.entries()].map(([tipo, n]) => {
                const sinJs = BS_SIN_JS.includes(tipo);
                return `<li>
                    <i class="ph ph-${sinJs ? 'check-circle' : 'x-circle'}"></i>
                    <code>${escapar(tipo)}</code> ×${n} —
                    ${sinJs
                        ? 'funciona solo con atributos, Moodle ya carga Bootstrap 5'
                        : 'necesita que alguien lo inicialice con JS: <strong>no va a funcionar</strong>'}
                </li>`;
            }).join('');
            const todosOk = [...r.interactivos.keys()].every(t => BS_SIN_JS.includes(t));
            bloques.push(`<div class="aviso aviso-${todosOk ? 'ok' : 'warn'}">
                <i class="ph ph-cursor-click"></i>
                <span><strong>Interactivos de Bootstrap.</strong>
                ${todosOk
                    ? 'Todos viven de atributos, así que sobreviven sin scripts propios.'
                    : 'Algunos necesitan JS y se van a perder.'}</span></div>
                <ul class="lista-veredicto">${filas}</ul>
                <div class="aviso aviso-warn"><i class="ph ph-warning"></i>
                    <span><strong>Esto hay que probarlo.</strong> Depende de que Moodle no borre los
                    atributos <code>data-bs-*</code> al guardar. Si los quita, los desplegables dejan
                    de abrir (el contenido no se pierde, solo queda oculto). Pruébalo con una página.</span>
                </div>`);
        }

        // --- Scripts
        if (r.scripts.length) {
            const filas = r.scripts.map(s => {
                if (s.conocido) {
                    return `<li><i class="ph ph-check-circle"></i>
                        <code>${escapar(s.conocido.nombre)}</code> — ${s.conocido.nota}</li>`;
                }
                if (s.inline) {
                    const resumen = s.url.replace(/\s+/g, ' ').slice(0, 90);
                    return `<li><i class="ph ph-warning"></i>
                        <code>script en línea</code> — se elimina; revísalo:
                        <span class="ruta">${escapar(resumen)}…</span></li>`;
                }
                return `<li><i class="ph ph-warning"></i>
                    <code>${escapar(s.url)}</code> — script propio: se elimina.</li>`;
            }).join('');
            const propios = r.scripts.filter(s => !s.conocido).length;
            bloques.push(`<div class="aviso aviso-${propios ? 'warn' : 'ok'}">
                <i class="ph ph-code"></i>
                <span><strong>${r.scripts.length} script(s).</strong>
                ${propios
                    ? `${r.scripts.length - propios} son librerías que Moodle ya trae; ${propios} son propios y sí se pierden.`
                    : 'Todos son librerías que Moodle ya carga: quitarlos no rompe nada.'}</span></div>
                <ul class="lista-veredicto">${filas}</ul>`);
        }

        // --- Dependencias CSS externas
        if (r.deps.length) {
            const filas = r.deps.map(d => d.conocido
                ? `<li><i class="ph ph-check-circle"></i> <code>${escapar(d.conocido.nombre)}</code> — ${d.conocido.nota}</li>`
                : `<li><i class="ph ph-warning"></i> <code>${escapar(d.url)}</code> — no lo trae Moodle:
                   asegúrate de tenerlo en tu hoja de estilos o el diseño cambiará.</li>`
            ).join('');
            bloques.push(`<div class="aviso aviso-info"><i class="ph ph-link"></i>
                <span><strong>Dependencias externas del micrositio.</strong> Al quitar los
                <code>&lt;link&gt;</code>, esto es de lo que dependía.</span></div>
                <ul class="lista-veredicto">${filas}</ul>`);
        }

        // --- Archivos que el CSS pide por ruta relativa (fuentes, fondos)
        if (r.cssLocales.length) {
            bloques.push(`<div class="aviso aviso-warn"><i class="ph ph-file-dashed"></i>
                <span><strong>El CSS pide archivos por ruta relativa.</strong> Ese CSS vive en la hoja
                de Moodle, donde <code>fonts/…</code> o <code>img/…</code> ya no existen: hay que subir
                esos archivos aparte y apuntar la regla a su URL definitiva. Las imágenes en
                <code>data:</code> no tienen problema, viajan dentro del CSS.</span></div>
                <ul class="lista-reporte">${lista([...new Set(r.cssLocales)])}</ul>`);
        }

        // --- Enlaces internos
        if (r.enlaces.length) {
            bloques.push(`<div class="aviso aviso-warn"><i class="ph ph-link-break"></i>
                <span><strong>Enlaces a otras páginas del micrositio.</strong> Apuntan a archivos que
                no existirán en Moodle: cámbialos por la URL de la Página correspondiente.</span></div>
                <ul class="lista-reporte">${lista([...new Set(r.enlaces)])}</ul>`);
        }

        if (!bloques.length) {
            bloques.push(`<div class="aviso aviso-ok"><i class="ph ph-check-circle"></i>
                <span>Nada que revisar: esta página no trae scripts, interactivos ni tablas.</span></div>`);
        }

        revisionLista.innerHTML = bloques.join('');
    }

    /* --------------------------------------------------------- Preview */

    function pintarPreview(doc, css, dirBase) {
        // El preview usa las imágenes reales del zip (blob:) en vez de
        // @@PLUGINFILE@@, que solo Moodle sabe resolver.
        const copia = doc.cloneNode(true);

        /** Devuelve una URL blob: para el archivo del zip, o null si no está. */
        function aBlob(valor) {
            if (!valor) return null;

            // La vista previa tiene que resolver los tres formatos que puede
            // llevar el src: el marcador, la URL de borrador de Moodle (que es
            // absoluta, pero no es "externa" para nosotros) y la ruta original.
            let crudo;
            if (valor.startsWith('@@PLUGINFILE@@/')) {
                crudo = valor.slice('@@PLUGINFILE@@/'.length);
            } else if (/draftfile\.php\//i.test(valor)) {
                crudo = valor.slice(valor.lastIndexOf('/') + 1);
            } else if (esExterna(valor)) {
                return null;
            } else {
                crudo = resolverRuta(dirBase, valor).split('/').pop();
            }

            const base = decodeURIComponent(crudo);
            // El HTML puede referir un .png que en realidad es un .svg renombrado:
            // RENOMBRE lo devuelve al archivo real. El navegador pinta el SVG solo.
            const ruta = RENOMBRE.get(base)
                || [...ARCHIVOS.keys()].find(r => r.split('/').pop() === base);
            if (!ruta) return null;
            const url = URL.createObjectURL(
                new Blob([ARCHIVOS.get(ruta)], { type: EXT_MIME[extension(ruta)] || '' })
            );
            BLOBS.push(url);
            return url;
        }

        copia.querySelectorAll('img, source').forEach(el => {
            const url = aBlob(el.getAttribute('src'));
            if (url) el.setAttribute('src', url);
            el.removeAttribute('srcset');
        });

        // Los fondos en estilos en línea también apuntan a @@PLUGINFILE@@, que
        // solo Moodle resuelve: sin esto la vista previa saldría sin fondos.
        copia.querySelectorAll('[style]').forEach(el => {
            const estilo = el.getAttribute('style');
            const nuevo = estilo.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (todo, comilla, valor) => {
                const url = aBlob(valor.trim());
                return url ? `url(${comilla}${url}${comilla})` : todo;
            });
            if (nuevo !== estilo) el.setAttribute('style', nuevo);
        });

        // "Modo Moodle": si pegaste tu hoja de Moodle y activaste el toggle,
        // mostramos el resultado REAL de la conversión — el CSS del micrositio se
        // quita (Moodle lo hace) y aplicamos el tuyo. Así el preview cacha lo que
        // falta (íconos que colapsan, clases sin definir) antes de subir.
        // data-bs-theme="light" activa tus tokens de tema claro.
        const cssMoodle = inputCssMoodle.value.trim();
        const modoMoodle = opt.previewMoodle.checked && cssMoodle;

        // srcdoc + sandbox sin allow-scripts: el CSS queda encerrado y no puede
        // tocar los estilos del panel.
        previewFrame.srcdoc = `<!DOCTYPE html><html${modoMoodle ? ' data-bs-theme="light"' : ''}><head><meta charset="utf-8">
            <style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#fff;color:#1d1d1f}
            img{max-width:100%;height:auto}</style>
            <style>${modoMoodle ? cssMoodle : css}</style></head>
            <body>${copia.body.innerHTML}</body></html>`;

        previewEmpty.classList.add('hidden');
        previewFrame.classList.remove('hidden');
    }

    function escapar(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function pintarNotaDraft(base) {
        const escrito = inputDraft.value.trim();

        if (base) {
            notaDraft.className = 'campo-nota campo-nota--ok';
            notaDraft.innerHTML = `<i class="ph ph-check-circle"></i> Listo: las imágenes apuntan a
                <code>${escapar(base)}</code>. Pega el HTML y guarda; Moodle lo convierte solo.`;
        } else if (escrito) {
            notaDraft.className = 'campo-nota campo-nota--error';
            notaDraft.innerHTML = `<i class="ph ph-x-circle"></i> Esa URL no parece de borrador:
                debe contener <code>draftfile.php</code>. Uso <code>@@PLUGINFILE@@</code> mientras tanto.`;
        } else {
            notaDraft.className = 'campo-nota';
            notaDraft.innerHTML = `Arrastra las imágenes al editor, abre <code>&lt;/&gt;</code> y copia el
                <code>src</code> de cualquiera. Con eso apunto todas a esa carpeta y Moodle
                hace el resto solo al guardar.`;
        }
    }

    inputDraft.addEventListener('input', () => {
        if (ARCHIVOS.size) convertir();
        else pintarNotaDraft(baseDeBorrador(inputDraft.value));
    });

    /* ----------------------------------------------------- Comparar CSS */

    function pintarComparacion() {
        const cssMoodle = inputCssMoodle.value.trim();
        const cssMicro = outputCss.value.trim();

        if (!cssMoodle || !cssMicro) {
            cmpResultado.innerHTML = `<div class="aviso aviso-info"><i class="ph ph-info"></i>
                <span>Pega tu hoja de estilos de Moodle y carga un micrositio para comparar.</span></div>`;
            return;
        }

        let r;
        try {
            r = compararCSS(cssMicro, cssMoodle);
        } catch (e) {
            cmpResultado.innerHTML = `<div class="aviso aviso-error"><i class="ph ph-x-circle"></i>
                <span>No se pudo leer el CSS: ${escapar(e.message)}</span></div>`;
            return;
        }

        const bloques = [`<div class="aviso aviso-info"><i class="ph ph-git-diff"></i>
            <span>Comparé <strong>${r.totalMicrositio}</strong> reglas del micrositio contra
            <strong>${r.totalMoodle}</strong> de tu hoja: <strong>${r.iguales}</strong> idénticas,
            <strong>${r.diferentes.length}</strong> distintas,
            <strong>${r.faltantes.length}</strong> que te faltan.</span></div>`];

        if (r.faltantes.length) {
            bloques.push(`<div class="aviso aviso-error"><i class="ph ph-x-circle"></i>
                <span><strong>${r.faltantes.length} regla(s) que el micrositio usa y tu hoja NO tiene.</strong>
                Si no las agregas, esta parte se verá distinta.</span></div>
                <ul class="lista-reporte">${r.faltantes.map(s => `<li><code>${escapar(s)}</code></li>`).join('')}</ul>`);
        }

        if (r.diferentes.length) {
            const filas = r.diferentes.map(d => `
                <li>
                    <code>${escapar(d.sel)}</code>
                    <div class="cmp-lado"><span class="cmp-tag cmp-tag--micro">micrositio</span>
                        <span class="ruta">${escapar(d.micrositio)}</span></div>
                    <div class="cmp-lado"><span class="cmp-tag cmp-tag--moodle">tu Moodle</span>
                        <span class="ruta">${escapar(d.moodle)}</span></div>
                </li>`).join('');
            bloques.push(`<div class="aviso aviso-warn"><i class="ph ph-warning"></i>
                <span><strong>${r.diferentes.length} regla(s) con el mismo selector pero distinto contenido.</strong>
                Decide cuál gana; puede que tu hoja ya esté más al día.</span></div>
                <ul class="lista-cmp">${filas}</ul>`);
        }

        if (!r.faltantes.length && !r.diferentes.length) {
            bloques.push(`<div class="aviso aviso-ok"><i class="ph ph-check-circle"></i>
                <span><strong>Tu hoja ya cubre todo.</strong> No hace falta agregar nada.</span></div>`);
        }

        cmpResultado.innerHTML = bloques.join('');
    }

    btnComparar.addEventListener('click', pintarComparacion);

    // Al pegar/editar tu CSS de Moodle, si el preview está en "modo Moodle" lo
    // refrescamos (con un respiro para no re-renderizar en cada tecla).
    let tempCssPreview = null;
    inputCssMoodle.addEventListener('input', () => {
        if (!opt.previewMoodle.checked || !ARCHIVOS.size) return;
        clearTimeout(tempCssPreview);
        tempCssPreview = setTimeout(convertir, 500);
    });

    /* ----------------------------------------------------------- Varios */

    btnConvertir.addEventListener('click', convertir);
    Object.values(opt).forEach(o => o.addEventListener('change', () => {
        if (ARCHIVOS.size) convertir();
    }));
    // Al cambiar de página cambian las tablas: olvidamos las filas elegidas.
    selectHtml.addEventListener('change', () => { HEADER_OVERRIDE = new Map(); convertir(); });

    // Selector de fila de títulos por tabla (delegado: se re-renderiza en cada
    // conversión). Guardamos la elección por índice de tabla y reconvertimos.
    revisionLista.addEventListener('change', (e) => {
        if (!e.target.classList.contains('sel-header')) return;
        HEADER_OVERRIDE.set(Number(e.target.dataset.tabla), Number(e.target.value));
        convertir();
    });

    function copiar(textarea, boton) {
        if (!textarea.value.trim()) return;
        navigator.clipboard.writeText(textarea.value).then(() => {
            const icono = boton.querySelector('i');
            icono.className = 'ph ph-check';
            icono.style.color = 'var(--success)';
            setTimeout(() => { icono.className = 'ph ph-copy'; icono.style.color = ''; }, 2000);
        }).catch(err => console.error('Error al copiar:', err));
    }
    btnCopy.addEventListener('click', () => copiar(outputCode, btnCopy));
    btnCopyCss.addEventListener('click', () => copiar(outputCss, btnCopyCss));

    btnPasos.addEventListener('click', () => modal.classList.remove('hidden'));
    modalClose.addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') modal.classList.add('hidden');
    });
}

// Si el script llega tarde (DOM ya listo) el evento nunca se dispara.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMicrositio);
} else {
    initMicrositio();
}
