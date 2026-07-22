function initBiblio() {
    const inputText = document.getElementById('input-text');
    const numModulo = document.getElementById('num-modulo');
    const moduloEcho = document.getElementById('modulo-echo');
    const optSangria = document.getElementById('opt-sangria');
    const optNolink = document.getElementById('opt-nolink');
    const optBreak = document.getElementById('opt-break');
    const btnGenerate = document.getElementById('btn-generate');
    const btnExample = document.getElementById('btn-example');
    const btnCopy = document.getElementById('btn-copy');
    const outputCode = document.getElementById('output-code');
    const previewContainer = document.getElementById('preview-container');
    const previewEmpty = document.getElementById('preview-empty');
    const modal = document.getElementById('modal-example');
    const modalClose = document.getElementById('modal-close');
    const exampleCode = document.getElementById('example-code');
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    const REGEX_URL = /(https?:\/\/[^\s<]+)/g;

    function activateTab(name) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.target === name));
        tabContents.forEach(c => c.classList.toggle('active', c.id === `${name}-content`));
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => activateTab(tab.dataset.target));
    });

    inputText.addEventListener('input', () => {
        btnGenerate.disabled = inputText.value.trim() === '';
    });

    /* ------------------------------------------------- Subir el .docx --- */

    const inputDocx = document.getElementById('input-docx');
    const dropzone = document.getElementById('dropzone');
    const docxInfo = document.getElementById('docx-info');

    // Encabezados que Word trae al inicio del documento y NO son una fuente.
    // Se detectan por ser cortos, sin URL y sin el "(año)" típico de una cita.
    const RE_TITULO = /^(bibliograf[ií]a|referencias?|fuentes?( de consulta)?|para saber m[áa]s)\.?$/i;

    function esTitulo(linea) {
        return RE_TITULO.test(linea.trim()) && !REGEX_URL.test(linea);
    }

    async function cargarDocx(file) {
        if (!/\.docx$/i.test(file.name)) {
            mostrarInfoDocx('Ese archivo no es un .docx. Si está en .doc, ábrelo en Word y guárdalo como .docx.', false);
            return;
        }
        try {
            const parrafos = await leerParrafosDeDocx(file);
            // REGEX_URL es global (/g) y guarda estado entre llamadas: hay que
            // reiniciarlo o `test()` va alternando true/false en las mismas
            // cadenas y descartaría fuentes buenas.
            REGEX_URL.lastIndex = 0;
            const fuentes = parrafos.filter(p => { REGEX_URL.lastIndex = 0; return !esTitulo(p); });
            const descartados = parrafos.length - fuentes.length;

            if (!fuentes.length) {
                mostrarInfoDocx('El documento no tiene párrafos de texto que se puedan usar.', false);
                return;
            }

            inputText.value = fuentes.join('\n');
            inputText.dispatchEvent(new Event('input'));
            mostrarInfoDocx(`${file.name} — ${fuentes.length} fuente(s) cargada(s)` +
                (descartados ? `, ${descartados} título(s) omitido(s).` : '.') +
                ' Revísalas abajo antes de generar.', true);
        } catch (e) {
            console.error('[biblio] docx:', e);
            mostrarInfoDocx('No se pudo leer el .docx: ' + e.message, false);
        }
    }

    function mostrarInfoDocx(texto, ok) {
        docxInfo.textContent = texto;
        docxInfo.classList.remove('hidden');
        docxInfo.style.color = ok ? 'var(--success)' : 'var(--danger)';
    }

    inputDocx.addEventListener('change', () => {
        if (inputDocx.files[0]) cargarDocx(inputDocx.files[0]);
    });
    dropzone.addEventListener('click', () => inputDocx.click());
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dropzone--activa');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dropzone--activa'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dropzone--activa');
        if (e.dataTransfer.files[0]) cargarDocx(e.dataTransfer.files[0]);
    });

    /* ----------------------------------------------- Selector de módulo --- */
    // La paleta viene de assets/modulos-311.js (fuente única compartida con el
    // Integrador HTML): [fondo de página, barra de título, fondo de contenido].
    const paleta = document.getElementById('paleta');

    Object.keys(MODULOS_311).forEach(n => numModulo.insertAdjacentHTML('beforeend',
        `<option value="${n}"${n === '3' ? ' selected' : ''}>Módulo ${n}</option>`));

    function actualizarPaleta() {
        paleta.innerHTML = MODULOS_311[numModulo.value].map(c => `<i style="background:${c}"></i>`).join('');
    }
    actualizarPaleta();

    numModulo.addEventListener('change', () => {
        moduloEcho.textContent = numModulo.value || '0';
        actualizarPaleta();
        // Si ya se generó, el cambio de módulo refresca la clase del código y
        // los colores de la vista previa sin obligar a otro clic en Generar.
        if (outputCode.value.trim()) renderSalida();
    });

    // Los toggles también refrescan en vivo: quitar la sangría (o el nolink, o
    // el corte de URLs) se ve al instante en la vista previa y en el código.
    [optSangria, optNolink, optBreak].forEach(toggle => toggle.addEventListener('change', () => {
        if (outputCode.value.trim()) renderSalida();
    }));

    // El estilo del <p> depende de los toggles: sin sangría no tiene sentido
    // arrastrar el text-indent negativo ni el padding que lo compensa.
    function buildStyle() {
        const rules = [];
        if (optSangria.checked) {
            rules.push('text-indent: -30px', 'position: relative', 'padding-left: 40px');
        }
        if (optBreak.checked) {
            rules.push('word-break: break-all');
        }
        return rules.join('; ');
    }

    function linkify(text) {
        return text.replace(REGEX_URL, (url) => {
            const anchor = `<a href="${url}" target="_blank">${url}</a>`;
            // El span.nolink evita que Moodle convierta el enlace de YouTube
            // en un reproductor incrustado.
            const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
            return isYouTube && optNolink.checked
                ? `<span class="nolink">${anchor}</span>`
                : anchor;
        });
    }

    function renderSalida() {
        const modulo = numModulo.value || '0';
        const style = buildStyle();
        const styleAttr = style ? ` style="${style}"` : '';

        const parrafos = inputText.value
            .split('\n')
            .filter(linea => linea.trim() !== '')
            .map(linea => `<p class="prepa-M${modulo}-textosParrafo"${styleAttr}>${linkify(linea)}</p>`);

        if (parrafos.length === 0) return false;

        outputCode.value = parrafos.join('\n');

        // La vista previa reproduce dónde viven estos párrafos en Moodle: el
        // fondo del módulo, la barra de título y el área de contenido, con los
        // colores reales del módulo elegido. Colores fijos (isla clara), no tokens.
        const p = MODULOS_311[modulo] || MODULOS_311['3'];
        previewEmpty.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        previewContainer.innerHTML =
            `<div class="moodle-preview" style="background:${p[0]}">` +
            `<h1 class="tema" style="background:${p[1]}">Fuentes de consulta</h1>` +
            `<div class="content" style="background:${p[2]}">${parrafos.join('\n')}</div>` +
            `</div>`;
        return true;
    }

    function generar() {
        if (renderSalida()) activateTab('code');
    }

    btnGenerate.addEventListener('click', generar);

    /* ------------------------------------------------------------- QA --- */

    /**
     * Verificador de solo lectura. Se corre en la página de Moodle ya publicada
     * y compara, fuente por fuente, contra lo que salió de aquí.
     *
     * Emparejar es el problema difícil: una bibliografía no tiene IDs, y el
     * orden puede cambiar. Se hace en dos pasadas —primero coincidencia exacta
     * normalizada, luego por "clave" (los primeros caracteres, que son el autor
     * y el año)— para poder distinguir "esta fuente cambió" de "esta fuente no
     * está", que es una diferencia que importa.
     *
     * ⚠️ Comprobado con un caso real: el Word traía
     * construyet.sep.gob.mx y en Moodle estaba bcd.cobach.edu.mx. Son
     * actualizaciones legítimas de URL, y justo lo que el QA debe señalar para
     * que alguien decida, en vez de pasarlas por alto.
     */
    function construirScriptQA(fuentes, modulo) {
        return `
(function() {
    var FUENTES = ${JSON.stringify(fuentes)};
    var MODULO = ${JSON.stringify(String(modulo))};

    function limpiar(s) {
        return (s || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim();
    }
    function clave(s) {
        return limpiar(s).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').slice(0, 45);
    }
    function urlsDe(s) {
        return (String(s).match(/https?:\\/\\/[^\\s<)]+/g) || []).map(function (u) {
            return u.replace(/[.,;]+$/, '');
        });
    }

    // Los <p> de la bibliografía en la página. Se busca por la clase del
    // módulo; si no aparece, se cae a cualquier clase *textosParrafo* para no
    // fallar solo porque el número de módulo del recurso no coincide.
    var nodos = [].slice.call(document.querySelectorAll('p[class*="M' + MODULO + '-textosParrafo"]'));
    var avisoClase = '';
    if (!nodos.length) {
        nodos = [].slice.call(document.querySelectorAll('p[class*="textosParrafo"]'));
        if (nodos.length) avisoClase = 'No encontré párrafos con la clase del módulo M' + MODULO +
            ', pero sí ' + nodos.length + ' con otra clase textosParrafo. Revisa el número de módulo.';
    }
    if (!nodos.length) {
        alert('No encontré la bibliografía en esta página.\\n' +
            'Ábre el capítulo del libro donde está publicada y vuelve a intentar.');
        return;
    }

    var enPagina = nodos.map(function (n) {
        return { nodo: n, texto: limpiar(n.textContent), usado: false };
    });

    function buscar(txt) {
        var t = limpiar(txt), i;
        for (i = 0; i < enPagina.length; i++)
            if (!enPagina[i].usado && enPagina[i].texto === t) { enPagina[i].usado = true; return enPagina[i]; }
        var k = clave(txt);
        for (i = 0; i < enPagina.length; i++)
            if (!enPagina[i].usado && clave(enPagina[i].texto) === k) { enPagina[i].usado = true; return enPagina[i]; }
        return null;
    }

    var iguales = 0, problemas = [], faltantes = [];

    FUENTES.forEach(function (src) {
        var m = buscar(src);
        if (!m) { faltantes.push(src); return; }

        var difTexto = m.texto !== limpiar(src);
        var urlsWord = urlsDe(src), urlsPag = urlsDe(m.texto);
        var urlsDistintas = urlsWord.join('|') !== urlsPag.join('|');

        // Enlaces: cada URL visible debería estar dentro de un <a>; y las de
        // YouTube, envueltas en span.nolink o Moodle las vuelve reproductor.
        var anclas = [].slice.call(m.nodo.querySelectorAll('a')).map(function (a) { return a.getAttribute('href'); });
        var sinEnlace = urlsPag.filter(function (u) {
            return !anclas.some(function (h) { return h && (h === u || h.indexOf(u) === 0 || u.indexOf(h) === 0); });
        });
        // El generador entrega <span class="nolink"><a>…</a></span>, pero el
        // editor de Moodle puede INVERTIR la estructura al guardar y dejar
        // <a …><span class="nolink">url</span></a> (comprobado en M18). Ambas
        // formas bloquean el reproductor, así que el span cuenta como ancestro,
        // como hijo del enlace o como clase del propio <a>.
        var ytSinNolink = [].slice.call(m.nodo.querySelectorAll('a')).filter(function (a) {
            var h = a.getAttribute('href') || '';
            var esYT = h.indexOf('youtube.com') !== -1 || h.indexOf('youtu.be') !== -1;
            if (!esYT) return false;
            var protegido = a.closest('.nolink') || a.querySelector('.nolink') ||
                (' ' + a.className + ' ').indexOf(' nolink ') !== -1;
            return !protegido;
        }).map(function (a) { return a.getAttribute('href'); });

        // En bibliografías los enlaces DEBEN abrir en pestaña nueva: es la regla
        // del equipo para este espacio. Sin target="_blank" el alumno sale del
        // curso al hacer clic y pierde dónde iba.
        var sinTarget = [].slice.call(m.nodo.querySelectorAll('a')).filter(function (a) {
            return (a.getAttribute('target') || '').toLowerCase() !== '_blank';
        }).map(function (a) { return a.getAttribute('href') || '(sin href)'; });

        if (!difTexto && !sinEnlace.length && !ytSinNolink.length && !sinTarget.length) { iguales++; return; }

        problemas.push({
            nodo: m.nodo,
            word: src,
            pagina: m.texto,
            difTexto: difTexto,
            urlsDistintas: urlsDistintas,
            sinEnlace: sinEnlace,
            ytSinNolink: ytSinNolink,
            sinTarget: sinTarget
        });
    });

    var sobrantes = enPagina.filter(function (e) { return !e.usado; });

    /* --------------------------------------------------------- informe --- */

    var previo = document.getElementById('qa-biblio-panel');
    if (previo) previo.remove();
    [].slice.call(document.querySelectorAll('.qa-marca')).forEach(function (m) {
        m.style.outline = ''; m.classList.remove('qa-marca');
    });

    problemas.forEach(function (p) {
        p.nodo.style.outline = '3px solid #c62828';
        p.nodo.classList.add('qa-marca');
    });
    sobrantes.forEach(function (s) {
        s.nodo.style.outline = '3px solid #ef6c00';
        s.nodo.classList.add('qa-marca');
    });

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }
    function corta(s, n) {
        s = String(s == null ? '' : s);
        return s.length > n ? s.slice(0, n) + '…' : s;
    }

    var hayError = problemas.length || faltantes.length;
    var estado = hayError ? 'ERRORES' : (sobrantes.length ? 'CON AVISOS' : 'TODO CORRECTO');
    var color = hayError ? '#c62828' : (sobrantes.length ? '#ef6c00' : '#2e7d32');

    var panel = document.createElement('div');
    panel.id = 'qa-biblio-panel';
    panel.style.cssText = 'position:fixed;top:12px;right:12px;width:440px;max-height:88vh;overflow:auto;' +
        'z-index:2147483647;background:#fff;color:#222;border-radius:10px;padding:14px 16px;' +
        'box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif;border:1px solid #ddd';

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<strong style="font-size:15px">QA de bibliografía</strong>' +
        '<button id="qa-cerrar" style="border:0;background:#eee;border-radius:6px;padding:4px 9px;cursor:pointer">Cerrar</button></div>' +
        '<div style="background:' + color + ';color:#fff;padding:8px 10px;border-radius:7px;font-weight:700;margin-bottom:10px">' + estado + '</div>' +
        '<div style="margin-bottom:10px">' + FUENTES.length + ' fuentes en el Word · ' + nodos.length + ' en la página · ' +
        '<span style="color:#2e7d32">' + iguales + ' correctas</span>' +
        (problemas.length ? ' · <span style="color:#c62828">' + problemas.length + ' con diferencia</span>' : '') + '</div>';

    if (avisoClase) {
        html += '<div style="background:#fff4e5;border-left:3px solid #ef6c00;padding:7px 9px;border-radius:5px;margin-bottom:8px">' +
            esc(avisoClase) + '</div>';
    }
    if (faltantes.length) {
        html += '<div style="background:#fdecea;border-left:3px solid #c62828;padding:7px 9px;border-radius:5px;margin-bottom:8px">' +
            '<strong>Fuentes del Word que NO están en la página (' + faltantes.length + '):</strong>' +
            faltantes.map(function (f) { return '<div style="margin-top:4px">' + esc(corta(f, 130)) + '</div>'; }).join('') + '</div>';
    }
    if (sobrantes.length) {
        html += '<div style="background:#fff4e5;border-left:3px solid #ef6c00;padding:7px 9px;border-radius:5px;margin-bottom:8px">' +
            '<strong>En la página pero NO en el Word (' + sobrantes.length + '):</strong>' +
            sobrantes.map(function (s) { return '<div style="margin-top:4px">' + esc(corta(s.texto, 130)) + '</div>'; }).join('') + '</div>';
    }

    if (!hayError && !sobrantes.length) {
        html += '<div style="background:#e8f5e9;border-left:3px solid #2e7d32;padding:9px;border-radius:5px">' +
            'Todas las fuentes coinciden y sus enlaces están bien formados.</div>';
    }

    if (problemas.length) {
        html += '<strong>Diferencias (' + problemas.length + '):</strong>';
        problemas.forEach(function (p) {
            html += '<div style="border-left:3px solid #c62828;padding:6px 9px;margin:7px 0;background:#fafafa;border-radius:5px">';
            var etiquetas = [];
            if (p.urlsDistintas) etiquetas.push('URL distinta');
            else if (p.difTexto) etiquetas.push('Texto distinto');
            if (p.sinEnlace.length) etiquetas.push(p.sinEnlace.length + ' URL sin enlace');
            if (p.sinTarget.length) etiquetas.push(p.sinTarget.length + ' sin abrir en pestaña nueva');
            if (p.ytSinNolink.length) etiquetas.push('YouTube sin nolink');
            html += '<div style="font-weight:700;color:#c62828">' + esc(etiquetas.join(' · ')) + '</div>';
            if (p.difTexto) {
                html += '<div style="margin-top:3px"><span style="color:#666">Word:</span> ' + esc(corta(p.word, 170)) + '</div>' +
                    '<div><span style="color:#666">Página:</span> ' + esc(corta(p.pagina, 170)) + '</div>';
            } else {
                html += '<div style="margin-top:3px">' + esc(corta(p.pagina, 170)) + '</div>';
            }
            if (p.sinEnlace.length) html += '<div style="color:#c62828;margin-top:3px">Sin &lt;a&gt;: ' + esc(p.sinEnlace.join(', ')) + '</div>';
            if (p.sinTarget.length) html += '<div style="color:#c62828;margin-top:3px">Sin target="_blank": ' + esc(p.sinTarget.join(', ')) + '</div>';
            if (p.ytSinNolink.length) html += '<div style="color:#c62828;margin-top:3px">YouTube sin span.nolink: ' + esc(p.ytSinNolink.join(', ')) + '</div>';
            html += '</div>';
        });
        html += '<div style="margin-top:10px;color:#666">Los párrafos con diferencia quedaron recuadrados en rojo; ' +
            'los que sobran, en naranja.</div>';
    }

    panel.innerHTML = html;
    document.body.appendChild(panel);
    document.getElementById('qa-cerrar').addEventListener('click', function () {
        [].slice.call(document.querySelectorAll('.qa-marca')).forEach(function (m) {
            m.style.outline = ''; m.classList.remove('qa-marca');
        });
        panel.remove();
    });

    var primera = document.querySelector('.qa-marca');
    if (primera) primera.scrollIntoView({ behavior: 'smooth', block: 'center' });
})();`.trim();
    }

    function generarQA() {
        const fuentes = inputText.value.split('\n').map(l => l.trim()).filter(Boolean);
        if (!fuentes.length) {
            alert('Primero carga o pega tus fuentes.');
            return;
        }
        pintarQA(construirScriptQA(fuentes, numModulo.value || '0'));
        activateTab('qa');
    }

    function pintarQA(codigo) {
        const qaEmpty = document.getElementById('qa-empty');
        const qaResultado = document.getElementById('qa-resultado');
        qaEmpty.classList.add('hidden');
        qaResultado.classList.remove('hidden');
        const bookmarklet = 'javascript:' + encodeURIComponent(codigo);
        const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

        qaResultado.innerHTML = `
            <div class="qa-aviso">
                <i class="ph ph-shield-check"></i>
                <span><strong>Verificador de solo lectura.</strong> Úsalo en la página de Moodle donde ya
                publicaste la bibliografía. Compara fuente por fuente contra tu Word y revisa los enlaces:
                que cada URL tenga su <code>&lt;a&gt;</code>, que abra en pestaña nueva
                (<code>target="_blank"</code>) y que las de YouTube lleven <code>span.nolink</code>.
                <strong>No modifica nada.</strong></span>
            </div>

            <div class="opcion-entrega">
                <h3><i class="ph ph-bookmark-simple"></i> Opción A — Marcador</h3>
                <p class="field-hint">Arrástralo a tus marcadores y púlsalo estando en la página publicada.</p>
                <a class="btn-secondary bookmarklet-link" href="${esc(bookmarklet)}"
                   onclick="return false;" title="Arrastra esto a tus marcadores">
                   <i class="ph ph-shield-check"></i> Verificar bibliografía
                </a>
            </div>

            <div class="opcion-entrega">
                <h3><i class="ph ph-terminal-window"></i> Opción B — Pegar en la consola</h3>
                <p class="field-hint">F12 → <em>Console</em>. Si Chrome bloquea el pegado, escribe
                    <code>allow pasting</code>, Enter, y vuelve a pegar.</p>
                <div class="code-wrapper">
                    <button class="btn-icon js-copiar-qa" title="Copiar"><i class="ph ph-copy"></i></button>
                    <textarea class="code-output" readonly>${esc(codigo)}</textarea>
                </div>
                <button class="btn-secondary btn-chico js-copiar-qa" type="button">
                    <i class="ph ph-copy"></i> Copiar verificador
                </button>
            </div>`;

        qaResultado.querySelectorAll('.js-copiar-qa').forEach(btn => {
            btn.addEventListener('click', () => {
                const ta = qaResultado.querySelector('.code-output');
                navigator.clipboard.writeText(ta.value).then(() => {
                    const icono = btn.querySelector('i');
                    const previa = icono.className;
                    icono.className = 'ph ph-check';
                    setTimeout(() => { icono.className = previa; }, 1200);
                }).catch(() => { ta.focus(); ta.select(); });
            });
        });
    }

    document.getElementById('btn-generate-qa').addEventListener('click', generarQA);

    btnCopy.addEventListener('click', () => {
        if (outputCode.value.trim() === '') return;

        navigator.clipboard.writeText(outputCode.value).then(() => {
            const icon = btnCopy.querySelector('i');
            icon.className = 'ph ph-check';
            icon.style.color = 'var(--success)';
            setTimeout(() => {
                icon.className = 'ph ph-copy';
                icon.style.color = '';
            }, 2000);
        }).catch(err => console.error('Error al copiar: ', err));
    });

    // --- Modal con el ejemplo del maquetado --- //
    function buildExample() {
        const modulo = numModulo.value || '0';
        const style = buildStyle();
        const styleAttr = style ? ` style="${style}"` : '';
        const pAbierto = `&lt;p class="prepa-M${modulo}-textosParrafo"${styleAttr}&gt;`;

        return `&lt;div class="<span class="codigo-gris">prepa-M${modulo}-body</span>"&gt;
&lt;div class="<span class="codigo-gris">prepa-M${modulo}-bannerGuias</span>"&gt;&lt;img src="<span class="resaltado-url">URL-DEL-BANNER</span>" /&gt;&lt;/div&gt;

&lt;h1 class="<span class="codigo-gris">prepa-M${modulo}-Tema</span>" style="text-align: center;"&gt;&lt;/h1&gt;
&lt;h1 style="text-align: center;"&gt;&lt;span style="color: #ffffff;"&gt;<span class="resaltado-titulo">EJEMPLO TITULO</span>&lt;/span&gt;&lt;/h1&gt;
&lt;!-- /Seccion 1 --&gt;
&lt;div class="<span class="codigo-gris">prepa-M${modulo}-bloqueContenidos</span>"&gt;
&lt;div class="<span class="codigo-gris">prepa-M${modulo}-contenidosTexto-Imagen</span>"&gt;

<span class="resaltado-parrafos">⬇️ PEGA AQUÍ LOS PÁRRAFOS GENERADOS ⬇️</span>

${pAbierto}Ejemplo de fuente de consulta 1...&lt;/p&gt;
${pAbierto}Ejemplo de fuente de consulta 2...&lt;/p&gt;

<span class="resaltado-parrafos">⬆️ FIN DE LOS PÁRRAFOS ⬆️</span>

&lt;/div&gt;
&lt;/div&gt;
&lt;/div&gt;`;
    }

    function abrirModal() {
        exampleCode.innerHTML = buildExample();
        modal.classList.remove('hidden');
    }

    function cerrarModal() {
        modal.classList.add('hidden');
    }

    btnExample.addEventListener('click', abrirModal);
    modalClose.addEventListener('click', cerrarModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) cerrarModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) cerrarModal();
    });
}

// Si el script llega tarde (DOM ya listo) el evento nunca se dispara, así que
// comprobamos el estado en vez de confiar solo en el listener.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBiblio);
} else {
    initBiblio();
}
