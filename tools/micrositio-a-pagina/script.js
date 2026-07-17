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

/**
 * Aplica el formato responsive de tarjetas del panel: la clase
 * tabla-responsive-cards + un data-label por celda, que el CSS de Moodle
 * imprime como encabezado cuando la tabla se vuelve tarjeta en celular.
 * Devuelve los títulos usados, o null si la tabla no tiene de dónde sacarlos.
 */
function aplicarResponsive(tabla) {
    const filas = [...tabla.querySelectorAll('tr')];
    if (filas.length < 2) return null;

    // Con <thead> el encabezado es explícito; si no, la primera fila.
    const filaTitulos = tabla.querySelector('thead tr') || filas[0];
    const titulos = [...filaTitulos.querySelectorAll('th, td')]
        .map(c => (c.textContent || '').trim().replace(/\s+/g, ' '));
    if (titulos.every(t => t === '')) return null;

    const cuerpo = tabla.querySelectorAll('tbody tr').length
        ? [...tabla.querySelectorAll('tbody tr')]
        : filas.slice(filas.indexOf(filaTitulos) + 1);

    cuerpo.forEach(fila => {
        [...fila.querySelectorAll('td, th')].forEach((celda, i) => {
            if (titulos[i]) celda.setAttribute('data-label', titulos[i]);
        });
    });

    tabla.classList.add('table', 'tabla-responsive-cards');
    return titulos;
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

/* ------------------------------------------------------------- Estado --- */

let ARCHIVOS = new Map();   // ruta -> Uint8Array
let BLOBS = [];             // URLs a revocar entre conversiones

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
        tabla: document.getElementById('opt-tabla')
    };

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

        const rutaHtml = selectHtml.value;
        const dirBase = rutaHtml.includes('/')
            ? rutaHtml.slice(0, rutaHtml.lastIndexOf('/') + 1)
            : '';

        const texto = new TextDecoder('utf-8').decode(ARCHIVOS.get(rutaHtml));
        const doc = new DOMParser().parseFromString(texto, 'text/html');

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

        // --- Tablas
        if (opt.tabla.checked) {
            doc.querySelectorAll('table').forEach(t => {
                const titulos = aplicarResponsive(t);
                if (titulos) reporte.tablas.push(titulos);
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

            // Al arrastrarlas al editor todas quedan planas: dos archivos con el
            // mismo nombre en carpetas distintas se pisarían.
            const previa = reporte.usadas.get(base);
            if (previa && previa.ruta !== ruta) {
                if (!reporte.colisiones.has(base)) reporte.colisiones.set(base, new Set([previa.ruta]));
                reporte.colisiones.get(base).add(ruta);
            } else {
                reporte.usadas.set(base, { ruta, tam: ARCHIVOS.get(ruta).length });
            }

            return opt.pluginfile.checked
                ? `@@PLUGINFILE@@/${encodeURIComponent(base)}`
                : valor;
        }

        // --- Imágenes: src, srcset, <source>, y url() en estilos en línea
        doc.querySelectorAll('img, source').forEach(el => {
            const src = el.getAttribute('src');
            if (src !== null) {
                const nuevo = traducir(src);
                if (nuevo) el.setAttribute('src', nuevo);
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
    }

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
            const filas = [...r.usadas.entries()]
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([base, info]) => `
                    <li>
                        <i class="ph ph-image"></i>
                        <code>${escapar(base)}</code>
                        <span class="ruta">${escapar(info.ruta)}</span>
                        <span class="peso">${(info.tam / 1024).toFixed(0)} KB</span>
                    </li>`).join('');
            bloques.unshift(`
                <div class="aviso aviso-ok"><i class="ph ph-check-circle"></i>
                    <span><strong>${r.usadas.size} imagen(es) para arrastrar al editor.</strong>
                    Selecciónalas todas juntas y suéltalas en el campo Contenido.</span></div>
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

        // --- Tablas
        if (r.tablas.length) {
            const conTitulos = r.tablas.filter(Boolean);
            if (conTitulos.length) {
                const detalle = conTitulos.map((t, i) =>
                    `<li>Tabla ${i + 1}: ${t.map(x => `<code>${escapar(x)}</code>`).join(' · ')}</li>`
                ).join('');
                bloques.push(`<div class="aviso aviso-ok"><i class="ph ph-table"></i>
                    <span><strong>${conTitulos.length} tabla(s) detectada(s).</strong> Se les aplicó
                    <code>tabla-responsive-cards</code> y un <code>data-label</code> por celda, así
                    que en celular se ven como tarjetas.</span></div>
                    <ul class="lista-reporte">${detalle}</ul>`);
            }
            const sinTitulos = r.tablas.length - conTitulos.length;
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
            if (!valor || esExterna(valor)) return null;
            const base = decodeURIComponent(
                valor.startsWith('@@PLUGINFILE@@/')
                    ? valor.slice('@@PLUGINFILE@@/'.length)
                    : resolverRuta(dirBase, valor).split('/').pop()
            );
            const ruta = [...ARCHIVOS.keys()].find(r => r.split('/').pop() === base);
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

        // srcdoc + sandbox sin allow-scripts: el CSS del micrositio queda
        // encerrado y no puede tocar los estilos del panel.
        previewFrame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8">
            <style>body{margin:0;padding:16px;font-family:system-ui,sans-serif;background:#fff;color:#1d1d1f}
            img{max-width:100%;height:auto}</style>
            <style>${css}</style></head>
            <body>${copia.body.innerHTML}</body></html>`;

        previewEmpty.classList.add('hidden');
        previewFrame.classList.remove('hidden');
    }

    function escapar(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

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

    /* ----------------------------------------------------------- Varios */

    btnConvertir.addEventListener('click', convertir);
    Object.values(opt).forEach(o => o.addEventListener('change', () => {
        if (ARCHIVOS.size) convertir();
    }));
    selectHtml.addEventListener('change', convertir);

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
