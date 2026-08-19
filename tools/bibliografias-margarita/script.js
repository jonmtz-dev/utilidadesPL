/* ==========================================================================
   Bibliografías Margarita Maza (Moodle 5.1)

   Dos modos, a propósito:

   1. **Desde Word** — el .docx de fuentes se vuelve la página completa de
      bibliografía: envoltorio `mainPlantilla23`, título con su rayita de color,
      dos columnas con línea divisoria y un `<p class="fuente">` por fuente.
      Es el formato cotejado contra una bibliografía YA PUBLICADA (345 fuentes,
      294 enlaces, todos con target="_blank" y los de YouTube con span.nolink).
   2. **Corregir HTML pegado** — la lógica original de esta herramienta, intacta:
      a los <a> de YouTube les agrega `class="nomediaplugin"`. NO se cambió a
      span.nolink a propósito: hay páginas ya montadas que dependen de ella.

   Que los dos modos usen marcas distintas es deliberado, no un descuido.

   Lo que se lee del Word lo hace `assets/docx.js` —el mismo lector de las otras
   tres herramientas— y las paletas salen de `assets/paletas.js`.
   ========================================================================== */

(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);

    const REGEX_URL = /(https?:\/\/[^\s<]+)/g;

    // Encabezados que el Word trae al inicio y NO son una fuente.
    const RE_TITULO = /^(bibliograf[ií]a|referencias?|fuentes?( de consulta)?|para saber m[áa]s)\.?$/i;

    const estado = { paleta: 'reg', archivo: '' };

    /* ---------------------------------------------------------------------
       Modo 1: del Word a la página
       --------------------------------------------------------------------- */

    const escapar = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    /**
     * Del texto del Word al HTML de la fuente.
     *
     * El orden importa: primero se escapa, luego se convierten las marcas de
     * formato y al final se enlazan las URL. Enlazar antes escaparía el <a>
     * recién puesto, y las marcas tienen que aplicarse sobre texto ya escapado
     * para no romper etiquetas.
     *
     * Las cursivas del Word llegan como *texto* y las negritas como **texto**
     * (ver assets/docx.js). En una ficha bibliográfica la cursiva del título es
     * parte de la norma de citación, así que se conserva.
     */
    function formatear(texto) {
        var t = escapar(texto);
        /* Las tres estrellas van PRIMERO: un run del Word que es negrita y
           cursiva a la vez llega como ***texto***, y si se resolviera antes la
           negrita el sobrante partia las etiquetas (<strong><i>x</strong></i>). */
        t = t.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><i>$1</i></strong>');
        t = t.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/\*([^*\n]+?)\*/g, '<i>$1</i>');
        return enlazar(t);
    }

    /**
     * Enlaza las URL de un texto YA escapado.
     *
     * Los de YouTube van con `<span class="nolink">` DENTRO del <a>, que es la
     * forma exacta de la bibliografía publicada. Sin él, Moodle cambia el enlace
     * por un reproductor incrustado a media lista de fuentes.
     */
    function enlazar(texto) {
        return String(texto).replace(REGEX_URL, (url) => {
            const limpia = url.replace(/[.,;]+$/, '');   // la puntuación final no es del enlace
            const cola = url.slice(limpia.length);
            const esYouTube = /youtube\.com|youtu\.be/i.test(limpia);
            const dentro = esYouTube && $('#opt-nolink').checked
                ? `<span class="nolink">${limpia}</span>`
                : limpia;
            return `<a href="${limpia}" target="_blank">${dentro}</a>${cola}`;
        });
    }

    function fuentes() {
        return $('#input-fuentes').value.split('\n').map(l => l.trim()).filter(Boolean);
    }

    /** El HTML completo de la página, con el envoltorio del montaje real. */
    function construirHTML() {
        const lista = fuentes();
        if (!lista.length) return '';
        const titulo = ($('#titulo-pagina').value || 'Bibliografía').trim();
        // Las dos clases van juntas en el montaje: la primera reparte el texto en
        // columnas y la segunda dibuja la línea punteada entre ellas.
        const columnas = $('#opt-columnas').checked ? ' text-multicol text-multicol-rule' : '';
        /* `.fuente` ES la sangría francesa: el tema la define como
           text-indent:-25px + padding-left:25px. Con el interruptor apagado se
           publica un <p> pelado, sin sangría. */
        const clase = $('#opt-sangria').checked ? ' class="fuente"' : '';
        const parrafos = lista.map(f => `      <p${clase}>${formatear(f)}</p>`).join('\n');

        return `<!-- ============================================================
     CAMBIA AQUÍ EL TEMA: M01 | M02 | M03 | MM | reg
     ============================================================ -->
<div class="container-fluid mainPlantilla23 ${estado.paleta} pb-3 mw-100">

  <div class="row bloque">
    <div class="col-12">
      <div class="tituloUnidad">
        <h1 class="text-primary">${escapar(titulo)}</h1>
      </div>
    </div>
  </div>

  <hr>

  <div class="row bloque mt-4" id="fuentes">
    <div class="col-12${columnas}">
${parrafos}
    </div>
  </div>

</div>`;
    }

    /* La previa va en un <iframe> con la hoja real del tema, como en Guion
       Instruccional a Página: el CSS de Moodle trae selectores globales
       (body, #page…) y meterlo en el panel lo desfiguraría. Además la rayita del
       título y la línea entre columnas SALEN de esa hoja, así que sin ella la
       previa no diría nada. */
    function documentoPrevia(html) {
        return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #fff; color: #333340;
           font-family: "Atkinson Hyperlegible", Roboto, Helvetica, Arial, sans-serif; font-size: 16px; }
    .row { display: flex; flex-wrap: wrap; margin: 0 -12px; }
    .row > [class*="col-"] { padding: 0 12px; width: 100%; }
    .col-12 { flex: 0 0 100%; max-width: 100%; }
    .mt-4 { margin-top: 1.5rem; } .pb-3 { padding-bottom: 1rem; } .mw-100 { max-width: 100%; }
    hr { border: 0; border-top: 1px solid #d5dce3; margin: 1.5rem 0; }
    p { margin: 0 0 1rem; }
    h1 { font-size: 1.9rem; margin: 0 0 .5rem; font-weight: 500; }
</style>
<style>${window.HOJA_MOODLE_DEFAULT || ''}</style>
</head><body class="path-mod-page">${html}</body></html>`;
    }

    function refrescarSalida() {
        const html = construirHTML();
        $('#result-empty').classList.toggle('hidden', Boolean(html));
        $('#result-wrapper').classList.toggle('hidden', !html);
        $('#output-code').value = html;
        $('#preview-empty').classList.toggle('hidden', Boolean(html));
        $('#preview-caja').classList.toggle('hidden', !html);
        if (html) $('#preview-frame').srcdoc = documentoPrevia(html);
        listarEnlaces(html);
    }

    /** La pestaña de enlaces sirve en los dos modos: dice qué se protegió. */
    function listarEnlaces(html) {
        const anclas = [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
        const datos = anclas
            .filter(m => /youtube\.com|youtu\.be/i.test(m[1]))
            .map(m => ({
                url: m[1],
                status: /nolink|nomediaplugin/i.test(m[0]) ? 'existente' : 'nuevo'
            }));
        pintarEnlaces(datos, datos.filter(d => d.status === 'existente').length, 0);
    }

    function pintarEnlaces(datos, protegidos, yaEstaban) {
        $('#stat-corregidos').textContent = protegidos;
        $('#stat-existentes').textContent = yaEstaban;
        const hay = datos.length > 0;
        $('#stats-bar').classList.toggle('hidden', !hay);
        $('#links-list').classList.toggle('hidden', !hay);
        $('#links-empty').classList.toggle('hidden', hay);
        if (!hay) {
            $('#links-empty-text').textContent = 'No se encontraron enlaces de YouTube.';
            return;
        }
        $('#links-list').innerHTML = datos.map(l => `
            <li>
                <i class="ph ph-youtube-logo" style="color:#FF0000;font-size:20px"></i>
                <a href="${escapar(l.url)}" target="_blank" rel="noopener" class="link-url">${escapar(l.url)}</a>
                <span class="badge ${l.status}">${l.status === 'nuevo' ? 'Sin proteger' : 'Protegido'}</span>
            </li>`).join('');
    }

    /* ------------------------------------------------------------ El Word */

    async function cargarDocx(file) {
        if (!/\.docx$/i.test(file.name)) {
            avisoDocx('Ese archivo no es un .docx. Si está en .doc, ábrelo en Word y guárdalo como .docx.', false);
            return;
        }
        try {
            /* Con `cursivas: true` para que los títulos conserven su itálica:
               leerParrafosDeDocx() entrega texto plano y las perdía. */
            const bloques = await leerBloquesDeDocx(file, { cursivas: true });
            const parrafos = bloques
                .filter(b => b.tipo === 'parrafo' && (b.texto || '').trim())
                .map(b => b.texto.trim());
            const lista = parrafos.filter(p => {
                REGEX_URL.lastIndex = 0;      // el /g guarda estado entre llamadas
                // El encabezado se compara sin marcas: "*Bibliografía*" también lo es.
                return !(RE_TITULO.test(p.replace(/\\*/g, '').trim()) && !REGEX_URL.test(p));
            });
            if (!lista.length) {
                avisoDocx('El documento no tiene párrafos que se puedan usar como fuentes.', false);
                return;
            }
            const omitidos = parrafos.length - lista.length;
            estado.archivo = file.name;
            $('#input-fuentes').value = lista.join('\n');
            avisoDocx(`${file.name} — ${lista.length} fuente(s)` +
                (omitidos ? `, ${omitidos} encabezado(s) omitido(s).` : '.') +
                ' Revísalas abajo antes de copiar el HTML.', true);
            refrescarSalida();
        } catch (e) {
            console.error('[biblio] docx:', e);
            avisoDocx('No se pudo leer el .docx: ' + e.message, false);
        }
    }

    function avisoDocx(texto, ok) {
        const p = $('#docx-info');
        p.textContent = texto;
        p.style.color = ok ? 'var(--success)' : 'var(--danger)';
    }

    /* ---------------------------------------------------------------------
       Modo 2: corregir el HTML pegado — LA LÓGICA ORIGINAL, sin cambios

       Sigue poniendo `class="nomediaplugin"` en el <a>, no span.nolink: hay
       páginas montadas con esa marca y cambiarla sería reescribirles el criterio
       a mitad del camino.
       --------------------------------------------------------------------- */

    function corregirPegado() {
        const crudo = $('#input-code').value;
        let corregidos = 0;
        let existentes = 0;
        const datos = [];

        const RE_A = /<a\b([^>]*)href=["']([^"']*(?:youtube\.com|youtu\.be)[^"']*)["']([^>]*)>/gi;

        const salida = crudo.replace(RE_A, (match, antes, url) => {
            if (/\bnomediaplugin\b/.test(match)) {
                existentes++;
                datos.push({ url, status: 'existente' });
                return match;
            }
            corregidos++;
            datos.push({ url, status: 'nuevo' });
            return /class=["']/i.test(match)
                ? match.replace(/class=(["'])/i, 'class=$1nomediaplugin ')
                : match.replace(/<a\b/i, '<a class="nomediaplugin"');
        });

        $('#output-code').value = salida;
        $('#result-empty').classList.add('hidden');
        $('#result-wrapper').classList.remove('hidden');
        pintarEnlaces(datos, corregidos, existentes);
        if (!datos.length) {
            $('#links-empty-text').textContent = 'No se encontraron enlaces de YouTube en el código proporcionado.';
        }
        activarTab('code');
    }

    /* ---------------------------------------------------------------- UI */

    function activarTab(nombre) {
        document.querySelectorAll('.tab-btn').forEach(t =>
            t.classList.toggle('active', t.dataset.target === nombre));
        document.querySelectorAll('.tab-content').forEach(c =>
            c.classList.toggle('active', c.id === `${nombre}-content`));
    }

    function activarModo(modo) {
        document.querySelectorAll('.modo-btn').forEach(b => {
            const activo = b.dataset.modo === modo;
            b.classList.toggle('active', activo);
            b.setAttribute('aria-selected', String(activo));
        });
        document.querySelectorAll('.modo-panel').forEach(p =>
            p.classList.toggle('activo', p.id === `modo-${modo}`));
        // La previa solo tiene sentido con la página armada desde el Word.
        $('.tab-btn[data-target="preview"]').classList.toggle('hidden', modo !== 'word');
        if (modo === 'word') { refrescarSalida(); activarTab('preview'); }
        else activarTab('code');
    }

    function dibujarPaletas() {
        const caja = $('#modulos');
        PALETAS.forEach(p => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'modulo' + (p.clase === estado.paleta ? ' activo' : '');
            b.dataset.clase = p.clase;
            b.title = `${p.nombre} (clase ${p.clase})`;
            b.innerHTML = `<span class="modulo-color" style="background:${p.color}"></span><span>${p.clase}</span>`;
            b.addEventListener('click', () => {
                estado.paleta = p.clase;
                caja.querySelectorAll('.modulo').forEach(x =>
                    x.classList.toggle('activo', x.dataset.clase === estado.paleta));
                refrescarSalida();
            });
            caja.appendChild(b);
        });
    }

    function prepararZona() {
        const zona = $('#dropzone');
        const input = $('#input-docx');
        zona.addEventListener('click', () => input.click());
        zona.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
        });
        input.addEventListener('change', () => input.files[0] && cargarDocx(input.files[0]));
        ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault(); zona.classList.add('dropzone--active');
        }));
        ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault(); zona.classList.remove('dropzone--active');
        }));
        zona.addEventListener('drop', e => e.dataTransfer.files[0] && cargarDocx(e.dataTransfer.files[0]));
    }

    function init() {
        dibujarPaletas();
        prepararZona();

        document.querySelectorAll('.modo-btn').forEach(b =>
            b.addEventListener('click', () => activarModo(b.dataset.modo)));
        document.querySelectorAll('.tab-btn').forEach(t =>
            t.addEventListener('click', () => activarTab(t.dataset.target)));

        // Modo Word: todo lo que cambie la salida la vuelve a armar.
        ['#input-fuentes', '#titulo-pagina'].forEach(sel =>
            $(sel).addEventListener('input', refrescarSalida));
        ['#opt-columnas', '#opt-nolink', '#opt-sangria'].forEach(sel =>
            $(sel).addEventListener('change', refrescarSalida));

        // Modo pegar: la lógica de siempre.
        $('#input-code').addEventListener('input', () => {
            $('#btn-process').disabled = $('#input-code').value.trim() === '';
        });
        $('#btn-process').addEventListener('click', corregirPegado);

        $('#btn-copy').addEventListener('click', () => {
            const ta = $('#output-code');
            if (!ta.value.trim()) return;
            navigator.clipboard.writeText(ta.value).then(() => {
                const i = $('#btn-copy i');
                i.className = 'ph ph-check';
                i.style.color = 'var(--success)';
                setTimeout(() => { i.className = 'ph ph-copy'; i.style.color = ''; }, 2000);
            }).catch(() => { ta.focus(); ta.select(); });
        });

        const reparto = Reparto.iniciar({
            workspace: '#workspace',
            divisor: '#divisor',
            clave: 'biblio-col-editor',
            colMin: 360,
            restoMin: 460,
            botonMax: '#btn-previa-max'
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && reparto) reparto.cerrarAmpliado();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
