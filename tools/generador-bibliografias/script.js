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

    numModulo.addEventListener('input', () => {
        moduloEcho.textContent = numModulo.value || '0';
    });

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

    function generar() {
        const modulo = numModulo.value || '0';
        const style = buildStyle();
        const styleAttr = style ? ` style="${style}"` : '';

        const parrafos = inputText.value
            .split('\n')
            .filter(linea => linea.trim() !== '')
            .map(linea => `<p class="prepa-M${modulo}-textosParrafo"${styleAttr}>${linkify(linea)}</p>`);

        if (parrafos.length === 0) return;

        outputCode.value = parrafos.join('\n');

        previewEmpty.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        previewContainer.innerHTML = parrafos.join('\n');

        activateTab('code');
    }

    btnGenerate.addEventListener('click', generar);

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
