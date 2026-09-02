/* mapaDeColumnas(), titulosPorColumna() y traeEstiloPropio() viven en
   assets/tablas.js, compartidas con Micrositio a Página. */

document.addEventListener('DOMContentLoaded', () => {
    const pasteArea = document.getElementById('paste-area');
    const btnProcess = document.getElementById('btn-process');
    const previewContainer = document.getElementById('preview-container');
    const previewEmpty = document.getElementById('preview-empty');
    const outputCode = document.getElementById('output-code');
    const btnCopy = document.getElementById('btn-copy');
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const optBordered = document.getElementById('opt-bordered');
    const optAltColors = document.getElementById('opt-alt-colors');
    const optHeaderColor = document.getElementById('opt-header-color');
    const optRepetirCombinadas = document.getElementById('opt-repetir-combinadas');
    const optMoodleWrap = document.getElementById('opt-moodle-wrap');
    const previewBarra = document.getElementById('preview-barra');
    const previewCaja = document.getElementById('preview-caja');
    const previewFrame = document.getElementById('preview-frame');
    const previewMedida = document.getElementById('preview-medida');
    const paletaPrevia = document.getElementById('paleta-previa');

    // Índice ficticio para "esta tabla no tiene fila de títulos": no hay nada
    // que promover a <thead> ni que copiar a los data-label. El -1 sale gratis
    // en el slice del cuerpo (-1 + 1 = 0).
    const SIN_TITULOS = -1;

    let globalTempDiv = null;
    let globalOriginalTable = null;
    // Con qué fila se generó la última vez, para poder rehacerlo cuando alguien
    // mueve un toggle. Null = todavía no se ha elegido nada.
    let ultimaFilaTitulos = null;
    // El HTML de la última tabla generada, para repintar la previa al cambiar
    // de aula sin obligar a rehacer los dos pasos.
    let ultimaSalida = '';

    /**
     * Muestra los errores EN LA PÁGINA, no solo en la consola. Antes, si algo
     * reventaba (p. ej. faltaba assets/tablas.js), el botón simplemente no hacía
     * nada y no había forma de saber por qué sin abrir DevTools.
     */
    function escaparTexto(s) {
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    function mostrarError(titulo, detalle) {
        previewEmpty.classList.add('hidden');
        previewContainer.classList.remove('hidden', 'preview-container--avisos');
        previewBarra.classList.add('hidden');
        previewCaja.classList.add('hidden');
        previewContainer.innerHTML = `
            <div style="background-color:#b3261e; color:white; padding:14px; border-radius:8px;
                        margin-bottom:15px; font-weight:600; display:flex; gap:8px; align-items:flex-start">
                <i class="ph ph-warning-octagon" style="font-size:20px"></i>
                <span>${titulo}<br><span style="font-weight:400; font-size:13px">${detalle}</span></span>
            </div>`;
        tabs[0].click();
    }

    // La lógica de tablas vive en assets/tablas.js. Si no cargó, avisamos claro
    // en vez de fallar con un ReferenceError silencioso al primer clic.
    const FALTA_TABLAS_JS = typeof mapaDeColumnas !== 'function'
        || typeof titulosPorColumna !== 'function'
        || typeof celdasHeredadas !== 'function'
        || typeof traeEstiloPropio !== 'function';
    if (FALTA_TABLAS_JS) {
        btnProcess.disabled = true;
        mostrarError('No se pudo cargar <code>assets/tablas.js</code>.',
            'La herramienta necesita ese archivo. Verifica que exista en la carpeta ' +
            '<code>assets/</code> junto a <code>theme.js</code>, y recarga la página.');
    }

    /* ======================================================================
       Vista previa

       Va en un <iframe> y no en un <div> porque las media queries miran el
       ancho de la VENTANA: la regla de Moodle que vuelve la tabla en tarjetas
       es un @media (max-width: 576px), y un div angosto no la dispara. Solo
       estrechando un marco de verdad se ve lo que verá el estudiante.

       Las hojas son las MISMAS que usa Guion Instruccional a Página —la del
       tema de Moodle y el subconjunto de Bootstrap que la acompaña—, leídas de
       sus carpetas. Copiarlas aquí sería volver al error del hex repetido.
       ====================================================================== */

    /* Este bloque va DESPUÉS de la hoja del tema a propósito: es lo que le
       falta al subconjunto de Bootstrap para esta salida, y ninguna regla de
       Moodle debe poder ganarle.
       OJO: esto es una plantilla de texto de JS. Nada de acentos graves aquí
       dentro, ni en los comentarios: cerrarían la plantilla y dejarían la
       previa entera sin estilos. */
    const CSS_EXTRA_PREVIA = `
/* La fuente del aula. La hoja del tema la pide por nombre ('Atkinson
   Hyperlegible Next') pero sus @font-face apuntan a [[font:theme|...]], un
   marcador que solo resuelve dentro de Moodle: aqui no cargaba y la previa
   salia en Segoe UI. Se trae de Google Fonts, que es la misma familia.

   Va en ESTE bloque y no en un <link> del <head> por una razon concreta: cuando
   dos @font-face declaran la misma familia, gana la ULTIMA. Puesta antes, las
   veinte declaraciones rotas del tema la tapaban y seguia sin cargar. Sin
   internet no carga y se cae al respaldo, como antes. */
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;500;700&display=swap');

/* Utilidades de display de Bootstrap 5. El !important no es adorno: es como las
   trae Bootstrap de verdad, y sin el, la regla del tema que vuelve cada celda un
   bloque en celular le ganaria a .d-none y la previa ensenaria la fila de
   encabezados que en Moodle no se ve. */
.d-none { display: none !important; }
@media (min-width: 576px) {
    .d-sm-none { display: none !important; }
    .d-sm-table-row { display: table-row !important; }
}
/* El contenedor de la pagina no mete ancho propio: la previa YA es del ancho
   del aparato. */
.container-fluid { width: 100%; padding: 0 12px; }
/* Los 100px de aire que la hoja le da al pie de la plantilla sobran en una
   previa de una sola tabla. */
.mainPlantilla23 { padding-bottom: 16px; }
`;

    function documentoPrevia(htmlTabla) {
        const paleta = (paletaPrevia && paletaPrevia.value) || 'MM';
        return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${window.CSS_VISTA_PREVIA || ''}</style>
<style>${window.HOJA_MOODLE_DEFAULT || ''}</style>
<style>${CSS_EXTRA_PREVIA}</style>
</head><body class="path-mod-page">
<div class="container-fluid mainPlantilla23 ${paleta}">${htmlTabla}</div>
</body></html>`;
    }

    function pintarPrevia(htmlTabla) {
        ultimaSalida = htmlTabla;
        previewFrame.srcdoc = documentoPrevia(htmlTabla);
        previewCaja.classList.remove('hidden');
        previewBarra.classList.remove('hidden');
    }

    // Aula: solo pinta la previa. El código que se copia no cambia ni una letra
    // (el color lo resuelve la hoja de Moodle con la clase del contenedor de la
    // página real), por eso la etiqueta lo dice y por eso vive aparte de los
    // toggles de formato.
    if (paletaPrevia && typeof PALETAS !== 'undefined') {
        const CLAVE_PALETA = 'tablas-paleta-previa';
        PALETAS.forEach(p => {
            const op = document.createElement('option');
            op.value = p.clase;
            op.textContent = `${p.clase} · ${p.nombre}`;
            paletaPrevia.appendChild(op);
        });
        paletaPrevia.value = localStorage.getItem(CLAVE_PALETA) || 'MM';
        paletaPrevia.addEventListener('change', () => {
            localStorage.setItem(CLAVE_PALETA, paletaPrevia.value);
            if (ultimaSalida) previewFrame.srcdoc = documentoPrevia(ultimaSalida);
        });
    }

    document.querySelectorAll('.ancho-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ancho-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            previewCaja.dataset.ancho = btn.dataset.ancho;
        });
    });

    /* El ancho real de la previa en px: es la única forma de saber si lo que se
       está mirando de verdad es un escritorio o una tableta disfrazada. */
    if (window.ResizeObserver) {
        new ResizeObserver(([entrada]) => {
            const px = Math.round(entrada.contentRect.width);
            previewMedida.textContent = px ? `${px} px` : '';
        }).observe(previewFrame);
    }

    if (window.Reparto) {
        Reparto.iniciar({
            workspace: '#workspace',
            divisor: '#divisor',
            editor: '.editor-panel',
            clave: 'tablas-col-editor',
            colMin: 340,
            // Lo que se le reserva a la previa pase lo que pase: por debajo de
            // esto ya no se parece a un escritorio.
            restoMin: 520,
            botonMax: '#btn-previa-max'
        });
    }

    pasteArea.addEventListener('input', () => {
        btnProcess.disabled = pasteArea.innerHTML.trim() === '';
    });

    pasteArea.addEventListener('paste', (e) => {
        setTimeout(() => {
            btnProcess.disabled = FALTA_TABLAS_JS || pasteArea.innerHTML.trim() === '';
        }, 10);
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.target}-content`).classList.add('active');
        });
    });

    btnProcess.addEventListener('click', () => {
        try { cargarTabla(); }
        catch (e) {
            console.error('[tablas] Paso 1:', e);
            mostrarError('No se pudo leer la tabla.', escaparTexto(e.message));
        }
    });

    /**
     * Las "viñetas" de Word no son una lista. Word manda al portapapeles un
     * <p> por renglón con un <span style="font-family:Symbol"> que DIBUJA el
     * punto, y el sangrado en un `text-indent` negativo. Pegado en Moodle eso
     * queda como párrafos sueltos con un carácter raro al principio: sin
     * sangría francesa, sin la viñeta del tema y sin lista para el lector de
     * pantalla. Aquí los <p> seguidos de ese tipo se juntan en un <ul> con un
     * <li> cada uno, que es lo que la hoja de Moodle sabe pintar.
     *
     * Se llama ANTES de limpiar clases y estilos: la marca que los delata
     * —`MsoListParagraph`, o el span en Symbol— es justo lo que se va a borrar.
     *
     * Las listas NUMERADAS de Word no se tocan: su marcador no viene en Symbol
     * sino como texto ("1.", "a)"), y distinguirlo de un párrafo que de verdad
     * empieza con un número no se puede hacer sin adivinar.
     */
    /* Los caracteres con los que Word dibuja una viñeta. Son varios porque
       depende de la fuente del marcador: Symbol manda un U+00B7, las plantillas
       de Google Docs exportadas a .docx mandan el U+25CF, y Wingdings usa el
       área privada (U+F0B7 y compañía). Reconocer solo uno fue justo el error:
       la primera fila salía en lista y las demás no. */
    const VINETAS = '·•‣⁃▪▫●○◦∙‧';
    const EMPIEZA_CON_VINETA = new RegExp(`^[\\s]*[${VINETAS}][\\s]*`);

    function convertirVinetasDeWord(raiz) {
        // El <span> que DIBUJA el punto: o viene en una fuente de símbolos, o
        // trae la marca mso-list que Word le pone al marcador.
        const esMarcador = (nodo) => {
            if (!nodo || nodo.nodeType !== 1) return false;
            const estilo = nodo.getAttribute('style') || '';
            if (/symbol|wingdings|webdings|mso-list\s*:\s*ignore/i.test(estilo)) return true;
            // O simplemente un <span> cuyo texto ES la viñeta y nada más.
            return nodo.tagName === 'SPAN'
                && new RegExp(`^[\\s${VINETAS}]+$`).test(nodo.textContent || '');
        };

        // Lo que hay que saltarse entre pedazos: el espacio en blanco del
        // sangrado y los comentarios condicionales de Word.
        const esRelleno = (n) => n.nodeType === 8
            || (n.nodeType === 3 && !n.textContent.trim());

        const esVineta = (nodo) => {
            if (!nodo || nodo.nodeType !== 1) return false;
            if (nodo.tagName !== 'P' && nodo.tagName !== 'DIV') return false;
            if (/MsoListParagraph/i.test(nodo.getAttribute('class') || '')) return true;
            if (/mso-list\s*:/i.test(nodo.getAttribute('style') || '')) return true;
            // Y el caso que se escapaba: el punto llega como TEXTO, sin fuente
            // de símbolos ni clase que lo delate. Si el párrafo abre con un
            // carácter de viñeta, es una viñeta: ningún texto de verdad empieza
            // así.
            return EMPIEZA_CON_VINETA.test(nodo.textContent || '');
        };

        /* Quita el punto del principio del <li>, venga como venga: un span
           marcador, un nodo de texto suelto, o metido dentro del span que
           también trae el texto ("<span>· Concepto de variable</span>"). Sin
           esto saldría viñeta doble: la del <li> y la que dibujó Word. */
        const quitarMarcador = (li) => {
            while (li.firstChild && (esRelleno(li.firstChild) || esMarcador(li.firstChild))) {
                li.firstChild.remove();
            }
            // El primer nodo de texto que quede, esté a la profundidad que esté.
            const paseo = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
            for (let t = paseo.nextNode(); t; t = paseo.nextNode()) {
                if (!t.textContent.trim()) continue;
                // El &nbsp; del sangrado también se va: .trim() de JS se lo lleva.
                t.textContent = t.textContent
                    .replace(EMPIEZA_CON_VINETA, '')
                    .replace(/^\s+/, '');
                break;
            }
        };

        raiz.querySelectorAll('td, th').forEach(celda => {
            let grupo = [];

            const cerrarGrupo = () => {
                if (!grupo.length) return;
                const ul = document.createElement('ul');
                grupo.forEach(p => {
                    const li = document.createElement('li');
                    while (p.firstChild) li.appendChild(p.firstChild);
                    quitarMarcador(li);
                    ul.appendChild(li);
                });
                grupo[0].parentNode.insertBefore(ul, grupo[0]);
                grupo.forEach(p => p.remove());
                grupo = [];
            };

            Array.from(celda.childNodes).forEach(nodo => {
                if (esVineta(nodo)) { grupo.push(nodo); return; }
                // Un comentario o un salto de línea entre dos viñetas no corta
                // la lista; cualquier otra cosa sí.
                if (esRelleno(nodo)) return;
                cerrarGrupo();
            });
            cerrarGrupo();
        });
    }

    function cargarTabla() {
        const rawHTML = pasteArea.innerHTML;
        
        globalTempDiv = document.createElement('div');
        globalTempDiv.innerHTML = rawHTML;

        let tabla = globalTempDiv.querySelector('table');

        // Si no hay tabla como nodo, es que pegaron el HTML como texto (código
        // crudo): el contenteditable lo guarda escapado (&lt;table&gt;…), así que
        // reinterpretamos ese texto como HTML y volvemos a buscar.
        if (!tabla) {
            const comoTexto = globalTempDiv.textContent;
            if (/<table[\s\S]*<\/table>/i.test(comoTexto)) {
                globalTempDiv.innerHTML = comoTexto;
                tabla = globalTempDiv.querySelector('table');
            }
        }

        if (!tabla) {
            alert("⚠️ No se detectó ninguna tabla en el texto pegado.");
            return;
        }

        // Limpiar estilos en línea inyectados por el navegador al copiar.
        // OJO: solo en tablas "desnudas" (Word), donde los style son basura. Si la
        // tabla ya llega maquetada, esos style son DELIBERADOS (los `width: 25%` de
        // los <th>, por ejemplo) y borrarlos descuadraba las columnas.
        const traeDiseno = traeEstiloPropio(tabla);

        /* Las viñetas de Word no son una lista: son <p> con un span en fuente
           Symbol que dibuja el punto. Va ANTES de limpiar clases y estilos,
           porque la marca que las delata es justo lo que se va a borrar. */
        if (!traeDiseno) convertirVinetasDeWord(globalTempDiv);

        /* Atributos de presentación de los tiempos de HTML 4 que Word sigue
           escribiendo. Se van solo los que ESTORBAN, y solo donde estorban:
           `width="921"` le clava a la tabla un ancho fijo en píxeles —lo que
           pelea con el diseño responsivo de Moodle— y `border="1"` le pinta
           bordes aunque el toggle de bordes esté apagado, o sea que el
           interruptor no servía.

           `align` y `valign` NO se tocan en las celdas ni en los párrafos: son
           la alineación que trae el Word (los números de "Semana" van
           centrados) y quitarlos la perdía. En la <table> sí se va el align,
           que ahí no centra nada: flota la tabla. */
        const BASURA_TABLA = ['border', 'cellspacing', 'cellpadding', 'align',
            'width', 'height', 'bgcolor', 'background'];
        const BASURA_CELDA = ['width', 'height', 'bgcolor', 'background', 'nowrap'];
        const ES_CELDA = ['TD', 'TH', 'TR', 'COL', 'COLGROUP', 'TBODY', 'THEAD'];

        globalTempDiv.querySelectorAll('*').forEach(el => {
            if (!traeDiseno) {
                el.removeAttribute('style');
                if (el.tagName === 'TABLE') BASURA_TABLA.forEach(a => el.removeAttribute(a));
                else if (ES_CELDA.includes(el.tagName)) BASURA_CELDA.forEach(a => el.removeAttribute(a));
                // Las clases MsoNormalTable / MsoNormal / MsoListParagraph no
                // existen en Moodle: no pintan nada y solo ensucian el código
                // que hay que revisar a ojo antes de pegarlo.
                if (el.classList.length) {
                    [...el.classList].forEach(c => { if (/^Mso/i.test(c)) el.classList.remove(c); });
                    if (!el.classList.length) el.removeAttribute('class');
                }
            }
            // A veces Moodle/Chrome inyecta atributos raros al copiar, los quitamos por si acaso
            el.removeAttribute('data-darkreader-inline-color');
            el.removeAttribute('data-darkreader-inline-bgcolor');
        });

        /* Las etiquetas con dos puntos son de los espacios de nombres de Office
           (<o:p>, <w:sdt>…). El navegador las deja como elementos desconocidos y
           viajaban enteras hasta el código final. Se quita la etiqueta pero se
           conserva lo que traiga dentro, por si acaso. */
        if (!traeDiseno) {
            /* Y los comentarios condicionales que Word mete alrededor de cada
               viñeta (<![if !supportLists]>). El navegador los deja como nodos
               de comentario, invisibles en pantalla pero presentes en el código
               que hay que revisar antes de pegarlo. */
            const paseoC = document.createTreeWalker(globalTempDiv, NodeFilter.SHOW_COMMENT);
            const comentarios = [];
            for (let c = paseoC.nextNode(); c; c = paseoC.nextNode()) comentarios.push(c);
            comentarios.forEach(c => c.remove());

            globalTempDiv.querySelectorAll('*').forEach(el => {
                if (!el.tagName.includes(':')) return;
                while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
                el.remove();
            });

            /* Word envuelve cada <o:p> en un <span>. Al quitar el <o:p> queda
               un <span></span> vacío y sin atributos en CADA párrafo: no pinta
               nada y multiplica por dos los renglones del código. Las celdas
               vacías sí se respetan; esto es solo el envoltorio suelto. */
            globalTempDiv.querySelectorAll('span:empty, b:empty, i:empty, u:empty')
                .forEach(el => { if (!el.attributes.length) el.remove(); });
        }

        // Si vuelven a pegar una tabla YA convertida, hay que quitarle las copias
        // solo-celular de la pasada anterior: mapaDeColumnas() las contaría como
        // columnas de verdad y saldrían corridos todos los data-label.
        globalTempDiv.querySelectorAll('[data-celda-combinada]').forEach(c => c.remove());

        globalOriginalTable = tabla;

        // Al pegar código con indentación, según el navegador esos espacios se
        // vuelven &nbsp; (por eso a unos les pasa y a otros no). El parser de
        // tablas expulsa ese texto suelto FUERA de la tabla (foster parenting), y
        // como conservamos lo que la rodea para no perder títulos, ese bloque de
        // &nbsp; se colaba en la salida. Quitamos los nodos de texto que son solo
        // espacios/nbsp y no están dentro de una celda (ahí sí puede ser querido).
        const enCelda = (nodo) => {
            for (let p = nodo.parentElement; p; p = p.parentElement) {
                if (p.tagName === 'TD' || p.tagName === 'TH') return true;
            }
            return false;
        };
        // .trim() en JS también elimina el &nbsp;, así que un nodo que quede
        // vacío tras recortar es puro relleno.
        const paseo = document.createTreeWalker(globalTempDiv, NodeFilter.SHOW_TEXT);
        const basura = [];
        for (let n = paseo.nextNode(); n; n = paseo.nextNode()) {
            if (!n.textContent.trim() && !enCelda(n)) basura.push(n);
        }
        basura.forEach(n => n.remove());

        // Normaliza el espacio DENTRO de las celdas con texto. Al pegar código
        // indentado, ese sangrado se vuelve &nbsp; pegado al texto; y como
        // innerHTML serializa el nbsp como la entidad "&nbsp;" (empieza por '&'),
        // un .trim() sobre el string ya no lo quita y la celda queda desalineada
        // (sobre todo la 1ª columna y los <th> centrados). Aquí se arregla en el
        // DOM, donde el nbsp sí es un espacio de verdad. Las celdas vacías (solo
        // espacios) NO se tocan: ese &nbsp; les da altura en escritorio.
        globalTempDiv.querySelectorAll('td, th').forEach(celda => {
            if (!celda.textContent.trim()) return;
            const textos = [];
            const w = document.createTreeWalker(celda, NodeFilter.SHOW_TEXT);
            for (let t = w.nextNode(); t; t = w.nextNode()) textos.push(t);
            textos.forEach(t => { t.textContent = t.textContent.replace(/\s+/g, ' '); });
            textos[0].textContent = textos[0].textContent.replace(/^\s+/, '');
            const ult = textos[textos.length - 1];
            ult.textContent = ult.textContent.replace(/\s+$/, '');
        });

        tabs[0].click();
        previewEmpty.classList.add('hidden');
        // Tabla nueva: la fila de títulos de la anterior ya no significa nada,
        // así que los toggles no deben repintar hasta que se elija otra vez.
        ultimaFilaTitulos = null;
        // Paso 1: manda la tabla clicable, que es interfaz de la herramienta y
        // no una página de Moodle. La previa de verdad y su barra se guardan
        // hasta que haya una fila de títulos elegida.
        previewContainer.classList.remove('hidden', 'preview-container--avisos');
        previewBarra.classList.add('hidden');
        previewCaja.classList.add('hidden');

        // Colores fijos y no tokens: este banner vive dentro de .preview-container,
        // que es una isla clara en ambos temas. Con var(--accent) el texto blanco
        // perdería contraste en modo oscuro.
        previewContainer.innerHTML = `
            <div style="background-color: #0066cc; color: white; padding: 12px; border-radius: 8px; margin-bottom: 10px; font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px; animation: pulse 2s infinite;">
                <i class="ph ph-cursor-click"></i> PASO 2: Haz clic sobre la fila de la tabla que contiene los TÍTULOS (data-labels)
            </div>
            <button type="button" id="btn-sin-titulos" class="btn-sin-titulos">
                <i class="ph ph-rows"></i> Esta tabla no tiene fila de títulos — déjala tal cual
            </button>
        `;

        // No todas las tablas tienen fila de títulos: la de tipos de evaluación,
        // por ejemplo, es nombre y explicación, y ahí no hay nada que copiar al
        // data-label. Sin esta salida el paso 2 OBLIGABA a señalar como títulos
        // una fila que es contenido, y esa fila se perdía del cuerpo.
        previewContainer.querySelector('#btn-sin-titulos').addEventListener('click', () => {
            try { generateFinalTable(globalOriginalTable, SIN_TITULOS); }
            catch (e) {
                console.error('[tablas] Paso 2 (sin fila de titulos):', e);
                mostrarError('No se pudo generar el código.', escaparTexto(e.message));
            }
        });

        const selectionTable = document.createElement('table');
        selectionTable.className = "selection-table table";
        selectionTable.innerHTML = globalOriginalTable.innerHTML;
        
        const rows = selectionTable.querySelectorAll('tr');
        rows.forEach((row, index) => {
            row.addEventListener('click', () => {
                try {
                    generateFinalTable(globalOriginalTable, index);
                } catch (e) {
                    console.error('[tablas] Paso 2:', e);
                    mostrarError('No se pudo generar el código con esa fila de títulos.',
                        escaparTexto(e.message) + ' — prueba con otra fila, o revisa que la tabla esté bien formada.');
                }
            });
        });
        
        // Muestra también los elementos que estaban fuera de la tabla (ej. títulos)
        const previewWrap = globalTempDiv.cloneNode(true);
        const oldTable = previewWrap.querySelector('table');
        oldTable.parentNode.replaceChild(selectionTable, oldTable);
        
        previewContainer.appendChild(previewWrap);
    }

    /**
     * ANOTA la tabla en su sitio; NO la reconstruye.
     *
     * Antes se armaba una tabla nueva con createElement copiando solo el texto,
     * y todo lo que no se reconstruía explícitamente se perdía: la fila de
     * título con colspan, los bg-primary-10 de los <th>, los width en %, los
     * rowspan, los align-middle… La herramienta es para AGREGAR las tarjetas
     * (data-label + tabla-responsive-cards); el diseño ya vive en la hoja de
     * Moodle y hay que respetarlo tal cual llega.
     */
    function generateFinalTable(sourceTable, headerIndex, opciones) {
        const outputDiv = globalTempDiv.cloneNode(true);
        const tabla = outputDiv.querySelector('table');
        if (!tabla) return;

        const filas = Array.from(tabla.querySelectorAll('tr'));
        // Con SIN_TITULOS (-1) todo es cuerpo: no se promueve nada a <thead> y
        // no hay data-label que poner. Es el caso de una tabla de dos columnas
        // tipo "nombre / explicación", donde señalar una fila como títulos le
        // quitaba una fila al contenido.
        const headerRow = headerIndex >= 0 ? filas[headerIndex] : null;
        if (headerIndex >= 0 && !headerRow) return;

        const mapa = mapaDeColumnas(filas);
        const conEstilo = traeEstiloPropio(sourceTable);
        // Los toggles solo actúan sobre tablas "desnudas" (Word). Si la tabla ya
        // llega maquetada, pintarle encima le cambiaría el color que eligió su autor.
        const pintar = !conEstilo;

        const titulos = headerRow ? titulosPorColumna(headerRow, mapa) : [];

        // Cuerpo: lo que va DESPUÉS de la fila de títulos. Las filas anteriores
        // (p. ej. un título con colspan) se quedan intactas y sin data-label.
        // Con -1 el slice(0) devuelve la tabla entera, que es justo lo que toca.
        const filasCuerpo = filas.slice(headerIndex + 1);

        // Celdas combinadas (rowspan) que hay que repetir en las tarjetas. Se
        // calcula solo sobre el cuerpo: así un rowspan que nace en el encabezado
        // no baja a las tarjetas repitiendo el título como si fuera un dato.
        const heredadas = (optRepetirCombinadas && optRepetirCombinadas.checked)
            ? celdasHeredadas(filasCuerpo, mapa)
            : null;

        let indiceCuerpo = 0;
        filasCuerpo.forEach(fila => {
            const celdas = Array.from(fila.children)
                .filter(n => n.tagName === 'TD' || n.tagName === 'TH');
            if (!celdas.length) return;

            celdas.forEach(celda => {
                const pos = mapa.get(celda);
                if (pos && titulos[pos.col]) celda.setAttribute('data-label', titulos[pos.col]);
            });

            // En escritorio el rowspan se ve solo; en celular no existe, porque
            // el CSS de Moodle vuelve cada <tr> una tarjeta con display:block y
            // la celda combinada solo está en el DOM de la PRIMERA fila que
            // abarca. Por eso la tarjeta de la semana 1 salía completa y las de
            // las semanas 2 y 3 perdían "Bloque de contenido" y compañía.
            //
            // Se deja una COPIA en su columna real, invisible de 576px hacia
            // arriba con `d-sm-none` (ahí sigue mandando el rowspan de verdad) y
            // visible por debajo, que es justo donde empiezan las tarjetas.
            // Insertarla en su posición —y no al final de la fila— es lo que
            // hace que la tarjeta se lea en el mismo orden que el renglón.
            if (heredadas) {
                heredadas.get(fila).forEach(({ col, celda }) => {
                    const copia = document.createElement('td');
                    // Siempre <td>, aunque el original sea <th>: el ::before que
                    // imprime el data-label en la tarjeta solo aplica a td.
                    copia.setAttribute('data-celda-combinada', '');
                    copia.className = `${celda.getAttribute('class') || ''} d-sm-none`.trim();
                    const estilo = celda.getAttribute('style');
                    if (estilo) copia.setAttribute('style', estilo);
                    if (titulos[col]) copia.setAttribute('data-label', titulos[col]);
                    copia.innerHTML = celda.innerHTML;

                    const siguiente = celdas.find(c => {
                        const p = mapa.get(c);
                        return p && p.col > col;
                    });
                    fila.insertBefore(copia, siguiente || null);
                });
            }

            if (pintar && optAltColors.checked) {
                const primera = celdas[0];
                if (primera) {
                    primera.classList.add(indiceCuerpo % 2 === 0 ? 'bg-primary-10' : 'bg-secondary-10');
                }
            }
            indiceCuerpo++;
        });

        // Lo único que se agrega siempre: las clases que activan las tarjetas.
        tabla.classList.add('table', 'tabla-responsive-cards');

        if (pintar) {
            // Word entrega la fila de títulos como <td> sueltos dentro del tbody.
            // La promovemos a <thead> con <th scope="col">, que es lo semántico y
            // lo que hace que los lectores de pantalla anuncien la columna. En una
            // tabla que ya llega maquetada NO se toca: su autor ya decidió.
            if (headerRow && !tabla.querySelector('thead')) {
                Array.from(headerRow.children).forEach(celda => {
                    if (celda.tagName === 'TH') return;
                    const th = document.createElement('th');
                    th.setAttribute('scope', 'col');
                    th.className = 'text-center align-middle';
                    if (celda.getAttribute('colspan')) th.setAttribute('colspan', celda.getAttribute('colspan'));
                    if (celda.getAttribute('rowspan')) th.setAttribute('rowspan', celda.getAttribute('rowspan'));
                    th.innerHTML = celda.innerHTML;
                    celda.replaceWith(th);
                });

                if (headerIndex === 0) {
                    const thead = document.createElement('thead');
                    thead.className = 'thead';
                    thead.appendChild(headerRow);
                    tabla.insertBefore(thead, tabla.firstChild);
                } else {
                    // Hay filas ARRIBA de los títulos: el típico renglón de Word
                    // con colspan ("Contenido de Aprendizaje 1"). Un <thead> se
                    // pinta SIEMPRE primero (es table-header-group, no importa
                    // dónde esté en el DOM), así que promover la fila la subía
                    // por encima de ese título: se veía invertido.
                    //
                    // Aquí la fila se queda en su sitio —con sus <th scope="col">,
                    // que es lo que necesita el lector de pantalla— y en celular
                    // se esconde con las utilidades de Bootstrap, que es
                    // exactamente lo que hacía `.tabla-responsive-cards thead`.
                    // Así el título sigue visible como primera tarjeta.
                    headerRow.classList.add('d-none', 'd-sm-table-row');
                }
            }

            if (optBordered.checked) tabla.classList.add('table-bordered', 'border-neutral');
            if (headerRow && optHeaderColor && optHeaderColor.checked) {
                // Solo la CLASE, nunca un hex: el color lo resuelve el módulo de la
                // página en Moodle (MM, M01, M02…). Aquí había un
                // background-color:#d8a7b6 !important inline —el rosa de MM— que
                // pintaba del color equivocado cualquier página de otro módulo.
                // Mismo bug que ya se quitó en Micrositio a Página (REGLAS.md §6-bis).
                const thead = tabla.querySelector('thead');
                (thead && thead.contains(headerRow) ? thead : headerRow)
                    .classList.add('bg-primary-20');
            }
        }

        let finalOutputHTML = outputDiv.innerHTML;

        if (optMoodleWrap && optMoodleWrap.checked) {
            // Antes se buscaba 'class="row' como texto. Si la tabla ya venía en su
            // propio contenedor (col-12 > .table-responsive, como el HTML de una
            // página nuestra), no había 'row' y se envolvía otra vez: quedaba un
            // .table-responsive dentro de otro. Ahora se revisa en el DOM.
            const yaEnvuelta = outputDiv.querySelector('.row, .table-responsive');
            if (!yaEnvuelta) {
                finalOutputHTML = `
<!-- Contenedor Moodle -->
<div class="row bloque mt-3">
  <div class="col-12">
    <div class="table-responsive">
      ${finalOutputHTML}
    </div>
  </div>
</div>`;
            }
        }
        
        // Los avisos dejan de ser una isla clara con la tabla dentro: la isla es
        // ahora el marco de la previa. Colores fijos y no tokens: son cajas que
        // traen su propio fondo y tienen que leerse igual en los dos temas.
        previewContainer.innerHTML = `
            <div style="background-color: #1e8e3e; color: white; padding: 12px; border-radius: 8px; margin-bottom: 10px; font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="ph ph-check-circle"></i> ¡Tabla Procesada Correctamente!
            </div>
            <div style="background-color: ${conEstilo ? '#e7f1ff' : '#fff4e5'}; color: #333; padding: 10px 12px; border-radius: 8px; margin-bottom: 10px; font-size: 14px;">
                ${conEstilo
                    ? '<strong>La tabla ya traía su propio diseño.</strong> Se conservó tal cual (encabezados, colores, anchos, colspan y rowspan) y solo se le agregaron las tarjetas. Los toggles de color no se aplicaron.'
                    : '<strong>La tabla llegó sin diseño</strong> (típico de Word), así que se le aplicaron los toggles de color que tengas encendidos.'}
            </div>
        `;
        previewContainer.classList.add('preview-container--avisos');

        // La previa recibe el HTML FINAL, con contenedores si están encendidos:
        // es lo que se va a pegar en Moodle, no una versión de laboratorio.
        pintarPrevia(finalOutputHTML);

        outputCode.value = formatHTML(finalOutputHTML);

        ultimaFilaTitulos = headerIndex;

        // Se queda en la Vista Previa a propósito: es donde están los anchos de
        // escritorio, tableta y celular, y revisar las tarjetas es justo lo que
        // no se podía hacer antes. El código está a un clic.
        //
        // Salvo cuando la vuelta es por haber movido un toggle: ahí saltar de
        // pestaña le quitaría al usuario el código que estaba leyendo.
        if (!opciones || opciones.cambiarPestana !== false) tabs[0].click();
    }

    /* Los toggles no repintaban nada: había que rehacer los dos pasos para ver
       el efecto, y como la previa ahora sí se parece a Moodle, eso era justo lo
       que había que poder comparar de un vistazo. Se rehace la salida con la
       misma fila de títulos que se eligió. */
    [optBordered, optAltColors, optHeaderColor, optRepetirCombinadas, optMoodleWrap]
        .forEach(toggle => {
            if (!toggle) return;
            toggle.addEventListener('change', () => {
                if (ultimaFilaTitulos === null || !globalOriginalTable) return;
                try {
                    generateFinalTable(globalOriginalTable, ultimaFilaTitulos, { cambiarPestana: false });
                } catch (e) {
                    console.error('[tablas] Repintado tras cambiar una opción:', e);
                }
            });
        });

    function formatHTML(html) {
        let formatted = '';
        let indent = '';
        
        html.split(/>\s*</).forEach(function(element) {
            if (element.match(/^\/\w/)) {
                indent = indent.substring(4);
            }
            
            formatted += indent + '<' + element + '>\r\n';
            
            if (element.match(/^<?\w[^>]*[^\/]$/) && !element.startsWith("input") && !element.startsWith("img") && !element.startsWith("br")) {
                indent += '    ';
            }
        });
        
        return formatted.substring(1, formatted.length - 3).trim();
    }

    btnCopy.addEventListener('click', () => {
        outputCode.select();
        document.execCommand('copy');
        
        const icon = btnCopy.querySelector('i');
        icon.className = 'ph ph-check';
        icon.style.color = 'var(--success)';
        
        setTimeout(() => {
            icon.className = 'ph ph-copy';
            icon.style.color = '';
        }, 2000);
    });
});
