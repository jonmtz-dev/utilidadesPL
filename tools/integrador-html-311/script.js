/* ========================================================================== 
   Integrador HTML 3.11. El documento es fuente editorial; los bloques son la
   fuente de verdad para el HTML y la vista previa. Así no pueden divergir.
   ========================================================================== */
(function () {
    // La paleta vive en assets/modulos-311.js (fuente única compartida con el
    // Generador de Bibliografías).
    const MODULOS = MODULOS_311;
    let blocks = [];
    let serial = 0;
    let selectedBlockId = null;
    let comentariosMontaje = [];
    /* Map<idDeComentario, latex> con los códigos que producción escribió a mano
       en el Word. Sirve para distinguir la fórmula autorizada de la que el
       lector convirtió solo desde el objeto de ecuación (esas se avisan para
       revisarlas antes de publicar). */
    let codigosDeProduccion = new Map();
    // Toda fórmula que quedó en los bloques: `$$…$$` con su código.
    const FORMULA = /\$\$([^$]+)\$\$/g;
    const $ = (s) => document.querySelector(s);
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const clean = (s) => String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const key = (s) => clean(s).toLocaleLowerCase('es-MX');
    // Las negritas viajan como marcas **texto** (así las entrega el importador
    // y así se pueden teclear a mano). Se convierten DESPUÉS de escapar.
    const negritas = (html) => String(html).replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    // Para las comparaciones: el texto como lo mostrará Moodle.
    const sinMarcas = (s) => String(s || '').replace(/\*\*/g, '');

    function init() {
        const modulo = $('#modulo');
        Object.keys(MODULOS).forEach(n => modulo.insertAdjacentHTML('beforeend', `<option value="${n}"${n === '17' ? ' selected' : ''}>Módulo ${n}</option>`));
        actualizarPaleta();
        // renderEditor: los selectores de color de las tablas muestran el color
        // del módulo cuando no hay uno propio, y deben refrescarse al cambiarlo.
        modulo.addEventListener('change', () => { actualizarPaleta(); renderEditor(); actualizar(); });
        $('#titulo').addEventListener('input', actualizar);
        document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => agregar(b.dataset.add)));
        $('#btn-generate').addEventListener('click', () => { actualizar(); activarTab('code'); avisoEnlaces(); });
        configurarModalEnlaces();
        $('#btn-copy').addEventListener('click', copiarHTML);
        document.querySelectorAll('.tab-btn').forEach(t => t.addEventListener('click', () => activarTab(t.dataset.target)));
        configurarImportador();
        prepararReparto();
        montarBarraPrevia();
        conectarPrevia();
        // Deja una sección inicial para que el flujo sea evidente sin imponer contenido.
        agregar('text');
    }

    // Al generar, recuerda que los enlaces a documentos y las imágenes no viajan
    // solos: el usuario debe volver a enlazarlos/subirlos dentro de Moodle. Solo
    // aparece si la actividad realmente lleva bloques de enlace o imagen.
    const CLAVE_AVISO_ENLACES = 'integrador-aviso-enlaces';
    function avisoEnlaces() {
        const hayBloques = blocks.some(b => b.tipo === 'image' || b.tipo === 'link');
        // Indicaciones de montaje que venían como comentarios en el Word.
        $('#modal-enlaces-lista').innerHTML = comentariosMontaje.map(c =>
            `<li>${c.ancla ? `<strong>«${esc(c.ancla)}»</strong>: ` : ''}${esc(c.texto)}</li>`).join('');
        $('#modal-enlaces-montaje').classList.toggle('hidden', !comentariosMontaje.length);
        // El "no volver a mostrar" solo silencia el recordatorio genérico; las
        // indicaciones concretas del Word se muestran siempre (y ocultan el check).
        $('#modal-enlaces-nomas').closest('label').classList.toggle('hidden', comentariosMontaje.length > 0);
        if (!comentariosMontaje.length) {
            if (localStorage.getItem(CLAVE_AVISO_ENLACES) === 'no') return;
            if (!hayBloques) return;
        }
        $('#modal-enlaces').classList.remove('hidden');
    }
    function configurarModalEnlaces() {
        const modal = $('#modal-enlaces');
        const cerrar = () => {
            if ($('#modal-enlaces-nomas').checked) localStorage.setItem(CLAVE_AVISO_ENLACES, 'no');
            modal.classList.add('hidden');
        };
        $('#modal-enlaces-ok').addEventListener('click', cerrar);
        modal.addEventListener('click', e => { if (e.target === modal) cerrar(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) cerrar(); });
    }
    function actualizarPaleta() {
        const c = MODULOS[$('#modulo').value];
        $('#paleta').innerHTML = c.map(x => `<i style="background:${x}"></i>`).join('');
    }
    /* Rotuladores de lista.

       CSS solo sabe pintar "1." — no existe un `list-style-type` que termine
       en paréntesis, y `@counter-style` no se puede poner en línea (TinyMCE
       borra los `<style>` al guardar). Así que para "1)" la lista se genera
       sin marcador y el rótulo se escribe dentro del `<li>`. */
    function letraDe(n) {
        let s = '';
        while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(97 + r) + s; n = (n - 1 - r) / 26; }
        return s;
    }
    const ROMANOS = [[1000,'m'],[900,'cm'],[500,'d'],[400,'cd'],[100,'c'],[90,'xc'],
                     [50,'l'],[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']];
    function romanoDe(n) {
        let s = '';
        for (const [v, r] of ROMANOS) while (n >= v) { s += r; n -= v; }
        return s;
    }
    function rotulo(tipo, n) {
        if (tipo === 'letras') return letraDe(n);
        if (tipo === 'romana') return romanoDe(n);
        return String(n);
    }

    function nuevo(tipo, datos) { return Object.assign({ id: ++serial, tipo, titulo: '', texto: '', href: '', alt: '', encabezados: '', filas: '', tituloTabla: '', colorEncabezado: '', archivoImagen: '', urlLocal: '', alineacion: 'izquierda', sangria: 0, tipoLista: 'vinetas', nivelLista: 0, inicioLista: 1, cierreLista: '.' }, datos || {}); }
    function agregar(tipo, datos) {
        const bloque = nuevo(tipo, datos);
        const posicion = selectedBlockId == null ? -1 : blocks.findIndex(b => b.id === selectedBlockId);
        if (posicion < 0) blocks.push(bloque); else blocks.splice(posicion + 1, 0, bloque);
        selectedBlockId = bloque.id;
        renderEditor(); actualizar();
    }
    /* La comparten los botones de la tarjeta del editor y la barra flotante de
       la previa: separadas, subir desde un lado y desde el otro acabarían
       haciendo cosas distintas. */
    function mover(id, delta) {
        const i = blocks.findIndex(b => b.id === id), j = i + delta;
        if (i < 0 || j < 0 || j >= blocks.length) return false;
        [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
        selectedBlockId = id;
        renderEditor(); actualizar();
        return true;
    }
    function borrar(id) { blocks = blocks.filter(b => b.id !== id); if (selectedBlockId === id) selectedBlockId = null; renderEditor(); actualizar(); marcarSeleccionEnPrevia(); }
    function seleccionarBloque(id) { selectedBlockId = id; renderEditor(); marcarSeleccionEnPrevia(); }
    /* ---------------------------------------------------------------------
       Reparto de la pantalla

       Sustituye al botón "Ampliar edición", que no movía nada: su regla
       (.editor-ampliado) y la de .integrador-workspace tenían la misma
       especificidad y la segunda, por ir después, siempre le ganaba.

       La conducta (arrastrar, recordar, doble clic, teclado, ampliar) vive en
       assets/reparto.js, compartida con Guion Instruccional a Página.
       --------------------------------------------------------------------- */
    let reparto = null;

    function prepararReparto() {
        reparto = Reparto.iniciar({
            workspace: '#workspace',
            divisor: '#divisor',
            clave: 'integrador-col-editor',
            colMin: 380,
            // Lo que se le reserva a la previa aunque se arrastre a lo bestia.
            restoMin: 420,
            colMax: 900,
            botonMax: '#btn-previa-max'
        });
        document.addEventListener('keydown', e => {
            // El modal tiene su propio Escape y va primero: si está abierto,
            // esa tecla es suya.
            if (e.key !== 'Escape' || !reparto || !reparto.maximizada()) return;
            if (!$('#modal-enlaces').classList.contains('hidden')) return;
            reparto.maximizar(false);
        });
    }

    /* ---------------------------------------------------------------------
       Barra flotante de la vista previa

       Al pasar el cursor por un bloque aparecen subir/bajar/quitar en su
       esquina: reordenar sin bajar la vista al editor. La barra vive dentro de
       #preview y se vuelve a colgar tras cada repintado (aquí eso pasa en cada
       tecla), porque actualizar() reescribe el innerHTML entero.

       No es arrastre a propósito: en la previa no hay dónde poner un asa sin
       ensuciar lo que se copia a Moodle. Las marcas data-bq son solo de la
       previa; buildHTML() —lo que se pega en Moodle— nunca las lleva.
       --------------------------------------------------------------------- */

    const BOTONES_PREVIA = [
        ['subir', 'Subir', 'ph-arrow-up'],
        ['bajar', 'Bajar', 'ph-arrow-down'],
        ['borrar', 'Quitar', 'ph-trash']
    ];
    let barraPrevia = null;
    let bqBarra = null;      // id del bloque sobre el que quedó la barra

    function montarBarraPrevia() {
        const previa = $('#preview');
        barraPrevia = document.createElement('div');
        barraPrevia.className = 'previa-barra';
        barraPrevia.innerHTML = BOTONES_PREVIA.map(([accion, titulo, icono]) =>
            `<button type="button" data-accion="${accion}" title="${titulo}" aria-label="${titulo}"><i class="ph ${icono}"></i></button>`).join('');
        previa.appendChild(barraPrevia);

        // Las escuchas van en #preview, que sobrevive al repintado; la barra no.
        previa.addEventListener('mouseover', e => {
            if (barraPrevia.contains(e.target)) return;   // pasar por la barra no la mueve
            colocarBarra(e.target.closest('.bloque-previa'));
        });
        previa.addEventListener('mouseleave', ocultarBarra);
        barraPrevia.addEventListener('click', e => {
            const btn = e.target.closest('[data-accion]');
            if (!btn || btn.disabled || bqBarra == null) return;
            const id = bqBarra;
            if (btn.dataset.accion === 'borrar') { borrar(id); return; }
            mover(id, btn.dataset.accion === 'subir' ? -1 : 1);
            señalarEnPrevia(id);
        });
    }

    function ocultarBarra() {
        if (!barraPrevia) return;
        barraPrevia.classList.remove('visible');
        bqBarra = null;
    }

    function colocarBarra(destino) {
        if (!destino) return ocultarBarra();
        const id = Number(destino.dataset.bq);
        const i = blocks.findIndex(b => b.id === id);
        if (i < 0) return ocultarBarra();
        bqBarra = id;
        // Los topes se ven: subir el primero no hace nada.
        barraPrevia.querySelector('[data-accion="subir"]').disabled = i === 0;
        barraPrevia.querySelector('[data-accion="bajar"]').disabled = i === blocks.length - 1;
        const previa = $('#preview');
        const rp = previa.getBoundingClientRect(), rb = destino.getBoundingClientRect();
        barraPrevia.style.left = `${rb.right - rp.left + previa.scrollLeft}px`;
        /* La barra se centra en el borde de arriba del bloque (translate en el
           CSS): sin el tope, la del primer bloque saldría medio cortada. */
        barraPrevia.style.top = `${Math.max(rb.top - rp.top + previa.scrollTop, previa.scrollTop + 16)}px`;
        barraPrevia.classList.add('visible');
    }

    /* Tras cada repintado la barra se quedó fuera del #preview y hay que
       colgarla otra vez. Como el cursor no se movió, tampoco habrá ningún
       mouseover que la devuelva sola sobre el bloque que se acaba de tocar. */
    function refrescarBarraPrevia() {
        if (!barraPrevia) return;
        const previa = $('#preview');
        previa.appendChild(barraPrevia);
        const destino = bqBarra == null ? null : previa.querySelector(`[data-bq="${bqBarra}"]`);
        if (destino) colocarBarra(destino); else ocultarBarra();
    }

    /* El bloque movido se enmarca un momento: la previa se repinta entera y sin
       esto uno pierde de vista qué acaba de moverse. */
    function señalarEnPrevia(id) {
        const previa = $('#preview');
        const el = previa.querySelector(`[data-bq="${id}"]`);
        if (!el) return;
        el.classList.add('bloque-previa--senalado');
        setTimeout(() => el.classList.remove('bloque-previa--senalado'), 1200);
        const rp = previa.getBoundingClientRect(), rb = el.getBoundingClientRect();
        // Solo si se salió de la vista: mover el scroll sin falta marea.
        if (rb.bottom < rp.top + 30 || rb.top > rp.bottom - 30) el.scrollIntoView({ block: 'center' });
    }

    /* ---------------------------------------------------------------------
       Ir y venir entre la previa y el editor

       Con un Word largo son treinta bloques en la columna izquierda y la mitad
       del tiempo se iba en buscar cuál de todos es el párrafo que se está
       leyendo en la previa. Ahora la previa manda: se hace clic en el texto y
       el editor abre esa tarjeta, la trae a la vista, enfoca su campo y deja el
       cursor sobre ese mismo renglón. Al revés, el bloque seleccionado queda
       enmarcado en la previa. Es la misma idea de Guion Instruccional a Página,
       sin iframe de por medio: aquí la previa es HTML de esta misma página.
       --------------------------------------------------------------------- */

    function conectarPrevia() {
        const previa = $('#preview');
        previa.addEventListener('click', e => {
            // Los botones de subir/bajar/quitar son de la barra, no del bloque.
            if (barraPrevia && barraPrevia.contains(e.target)) return;
            const marcado = e.target.closest('.bloque-previa');
            if (!marcado) return;
            /* Un enlace de la previa apunta a Moodle y seguirlo se llevaría por
               delante el trabajo sin guardar. Aquí es una parte del bloque como
               cualquier otra: abre su tarjeta. */
            const enlace = e.target.closest('a');
            if (enlace) e.preventDefault();
            abrirTarjetaDe(Number(marcado.dataset.bq), e.target);
        });
    }

    /** Enmarca en la previa el bloque seleccionado y, si se salió de la vista,
        lo trae. Se rehace en cada repintado: `actualizar()` reescribe #preview
        entero y la marca se va con él. */
    function marcarSeleccionEnPrevia() {
        const previa = $('#preview');
        previa.querySelectorAll('.bloque-previa--activo').forEach(n => n.classList.remove('bloque-previa--activo'));
        if (selectedBlockId == null) return;
        const destino = previa.querySelector(`[data-bq="${selectedBlockId}"]`);
        if (!destino) return;
        destino.classList.add('bloque-previa--activo');
        // Solo si NO se ve: centrarlo en cada tecla marearía.
        const rp = previa.getBoundingClientRect(), rb = destino.getBoundingClientRect();
        if (rb.bottom < rp.top + 30 || rb.top > rp.bottom - 30) destino.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    /** Abre en el editor la tarjeta del bloque `id` y deja el cursor donde se
        hizo clic en la previa. `nodo` es el elemento tocado, para saber qué
        campo enfocar (el título de la sección no es su contenido) y qué
        renglón señalar. */
    function abrirTarjetaDe(id, nodo) {
        const bloque = blocks.find(b => b.id === id);
        if (!bloque) return;
        seleccionarBloque(id);
        const tarjeta = $(`.block[data-id="${id}"]`);
        if (!tarjeta) return;
        const campo = tarjeta.querySelector(`[data-field="${campoDelClic(bloque, nodo)}"]`);
        if (campo) {
            campo.focus();
            const parrafo = nodo && nodo.closest && nodo.closest('p, li, td, th, h1, h2, h3');
            const sitio = ubicarEnCampo(campo.value, (parrafo || nodo || {}).textContent || '');
            // `select()` de todo el campo sería peor que nada: se pierde de vista
            // cuál era el renglón. Sin coincidencia, se deja el foco y ya.
            if (sitio && campo.setSelectionRange) campo.setSelectionRange(sitio.inicio, sitio.fin);
        }
        const lista = $('#blocks').getBoundingClientRect(), caja = tarjeta.getBoundingClientRect();
        if (caja.top < lista.top || caja.bottom > lista.bottom) tarjeta.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function campoDelClic(bloque, nodo) {
        if (bloque.tipo === 'section' && nodo && nodo.closest && nodo.closest('.subtema')) return 'titulo';
        if (bloque.tipo === 'table') return nodo && nodo.closest && nodo.closest('th') ? 'encabezados' : 'filas';
        if (bloque.tipo === 'image') return 'href';
        return 'texto';
    }

    /* Dónde cae, dentro del campo de texto, lo que se leyó en la previa.
       No se pueden comparar las cadenas tal cual: el campo trae las marcas
       `**negritas**`, sus saltos de renglón salieron como <br> (que no dejan
       ni un espacio en textContent) y `clean()` colapsó los espacios. Se
       comparan solo letras y números, guardando de qué posición del campo salió
       cada uno, y se devuelve el tramo original. */
    function ubicarEnCampo(valor, buscado) {
        const esLetra = (c) => /[\p{L}\p{N}]/u.test(c);
        const posiciones = [], letras = [];
        for (let i = 0; i < valor.length; i++) {
            if (!esLetra(valor[i])) continue;
            letras.push(valor[i].toLocaleLowerCase('es-MX'));
            posiciones.push(i);
        }
        const aguja = [...String(buscado)].filter(esLetra).map(c => c.toLocaleLowerCase('es-MX')).join('');
        // Con menos de tres letras cualquier "de" o "la" daría un falso positivo.
        if (aguja.length < 3) return null;
        const donde = letras.join('').indexOf(aguja);
        if (donde < 0) return null;
        return { inicio: posiciones[donde], fin: posiciones[donde + aguja.length - 1] + 1 };
    }

    function renderEditor() {
        const holder = $('#blocks');
        if (!blocks.length) { holder.innerHTML = '<div class="empty-state"><i class="ph ph-plus-circle"></i><p>Agrega un bloque para empezar.</p></div>'; return; }
        $('#insert-hint').textContent = selectedBlockId == null ? 'Selecciona un bloque para insertar después de él. Sin selección, se agrega al final.' : 'Los botones agregan el nuevo bloque justo después del bloque seleccionado.';
        holder.innerHTML = blocks.map((b, idx) => {
            const head = `<div class="block-head"><i class="ph ${icono(b.tipo)}"></i>${nombre(b.tipo)}<span class="block-tools"><button class="block-move" data-move="${b.id}:-1" title="Subir bloque"${idx === 0 ? ' disabled' : ''}><i class="ph ph-caret-up"></i></button><button class="block-move" data-move="${b.id}:1" title="Bajar bloque"${idx === blocks.length - 1 ? ' disabled' : ''}><i class="ph ph-caret-down"></i></button><button class="block-remove" data-remove="${b.id}" title="Eliminar bloque"><i class="ph ph-trash"></i></button></span></div>`;
            const clase = `block${selectedBlockId === b.id ? ' block--seleccionado' : ''}`;
            if (b.tipo === 'section') return `<article class="${clase}" data-id="${b.id}">${head}<input class="block-field block-title" data-field="titulo" placeholder="Título de sección (ej. Propósito)" value="${esc(b.titulo)}"><textarea class="block-field" data-field="texto" rows="4" placeholder="Contenido de la sección. Un renglón en blanco crea otro párrafo. **texto** = negritas.">${esc(b.texto)}</textarea>${controlAlineacion(b)}</article>`;
            if (b.tipo === 'text') return `<article class="${clase}" data-id="${b.id}">${head}<textarea class="block-field" data-field="texto" rows="5" placeholder="Pega o escribe el texto introductorio... **texto** = negritas.">${esc(b.texto)}</textarea>${controlAlineacion(b)}</article>`;
            if (b.tipo === 'list') return `<article class="${clase}" data-id="${b.id}">${head}<textarea class="block-field" data-field="texto" rows="5" placeholder="Un elemento por renglón">${esc(b.texto)}</textarea><div class="block-controls"><label>Tipo <select class="block-field" data-field="tipoLista"><option value="vinetas"${b.tipoLista==='vinetas'?' selected':''}>Viñetas</option><option value="ordenada"${b.tipoLista==='ordenada'?' selected':''}>Numerada (1, 2)</option><option value="letras"${b.tipoLista==='letras'?' selected':''}>Letras (a, b)</option><option value="romana"${b.tipoLista==='romana'?' selected':''}>Romana (i, ii)</option></select></label><label>Nivel / sangría <select class="block-field" data-field="nivelLista"><option value="0"${Number(b.nivelLista)===0?' selected':''}>Principal</option><option value="1"${Number(b.nivelLista)===1?' selected':''}>Segundo</option><option value="2"${Number(b.nivelLista)===2?' selected':''}>Tercero</option></select></label>${b.tipoLista==='vinetas'?'':`<label>Empieza en <input type="number" class="block-field block-inicio" data-field="inicioLista" min="1" step="1" value="${Number(b.inicioLista)||1}" title="Con qué número (o letra) arranca esta lista. Sirve para continuar la de arriba después de una sublista."></label><label>Marcador <select class="block-field" data-field="cierreLista" title="Cómo cierra el rótulo de cada elemento"><option value="."${b.cierreLista!==')'?' selected':''}>${b.tipoLista==='letras'?'a.':(b.tipoLista==='romana'?'i.':'1.')}</option><option value=")"${b.cierreLista===')'?' selected':''}>${b.tipoLista==='letras'?'a)':(b.tipoLista==='romana'?'i)':'1)')}</option></select></label>`}</div><small>Un elemento por renglón. La sangría conserva la jerarquía del Word: Principal → Segundo → Tercero. Las viñetas se generan como viñetas, no como números. **texto** = negritas.${b.tipoLista==='vinetas'?'':' <strong>Empieza en</strong> continúa la numeración: tras una sublista a/b/c, la lista de arriba sigue en 2, no vuelve a 1.'}</small></article>`;
            if (b.tipo === 'table') { const paleta = MODULOS[$('#modulo').value]; return `<article class="${clase}" data-id="${b.id}">${head}<div class="table-fields"><input class="block-field" data-field="tituloTabla" placeholder="Fila título que abarca todas las columnas (opcional)" value="${esc(b.tituloTabla)}"><input class="block-field" data-field="encabezados" placeholder="Encabezados separados por tabulador o |" value="${esc(b.encabezados)}"><textarea class="block-field" data-field="filas" rows="4" placeholder="Una fila por renglón; celdas separadas por tabulador o |">${esc(b.filas)}</textarea></div><div class="block-controls"><label>Color de encabezado <input type="color" class="block-field" data-field="colorEncabezado" value="${esc(b.colorEncabezado || paleta[1])}" title="Color de fondo de encabezados y fila título"></label>${b.colorEncabezado ? `<button class="btn-secondary btn-chico" data-color-modulo="${b.id}" type="button">Usar color del módulo</button>` : ''}</div><small>Un encabezado vacío se combina con el anterior (colspan). Un renglón con solo "|" crea una fila vacía de plantilla.</small></article>`; }
            if (b.tipo === 'image') return `<article class="${clase}" data-id="${b.id}">${head}${b.urlLocal ? `<div class="img-word"><img src="${esc(b.urlLocal)}" alt=""><div class="img-word-info"><strong>${esc(b.archivoImagen)}</strong> viene del Word.<span>Descárgala y arrástrala al editor de Moodle: el HTML ya la llama por su nombre (@@PLUGINFILE@@). Si prefieres URL, pégala abajo.</span><a class="btn-secondary btn-chico" href="${esc(b.urlLocal)}" download="${esc(b.archivoImagen)}"><i class="ph ph-download-simple"></i> Descargar imagen</a></div></div>` : ''}<input class="block-field" data-field="href" placeholder="${b.urlLocal ? 'URL en Moodle (opcional: sin URL se usa @@PLUGINFILE@@)' : 'URL de la imagen'}" value="${esc(b.href)}"><input class="block-field" data-field="alt" placeholder="Texto alternativo" value="${esc(b.alt)}"></article>`;
            return `<article class="${clase}" data-id="${b.id}">${head}<input class="block-field" data-field="texto" placeholder="Texto visible del enlace" value="${esc(b.texto)}"><input class="block-field" data-field="href" placeholder="https://..." value="${esc(b.href)}"><small>Se generará con target="_blank".</small></article>`;
        }).join('');
        holder.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => borrar(Number(b.dataset.remove))));
        holder.querySelectorAll('[data-move]').forEach(btn => btn.addEventListener('click', () => {
            const [id, delta] = btn.dataset.move.split(':').map(Number);
            mover(id, delta);
        }));
        holder.querySelectorAll('[data-color-modulo]').forEach(btn => btn.addEventListener('click', () => {
            const block = blocks.find(b => b.id === Number(btn.dataset.colorModulo));
            if (block) { block.colorEncabezado = ''; renderEditor(); actualizar(); }
        }));
        holder.querySelectorAll('.block').forEach(b => b.addEventListener('click', (e) => {
            if (e.target.closest('input, textarea, select, button')) return;
            seleccionarBloque(Number(b.dataset.id));
        }));
        holder.querySelectorAll('[data-field]').forEach(input => input.addEventListener('input', e => {
            const block = blocks.find(b => b.id === Number(e.target.closest('.block').dataset.id));
            block[e.target.dataset.field] = e.target.value;
            actualizar();
        }));
        // Al cerrar el selector de color aparece el botón "Usar color del módulo".
        // Se re-renderiza en change (no en input) para no robar el foco al teclear.
        holder.querySelectorAll('[data-field="colorEncabezado"]').forEach(input => input.addEventListener('change', renderEditor));
        // Y al cambiar el tipo de lista: "Empieza en" solo tiene sentido en las
        // numeradas, así que aparece o se va con el selector.
        holder.querySelectorAll('[data-field="tipoLista"]').forEach(sel => sel.addEventListener('change', renderEditor));
        holder.querySelectorAll('[data-field="cierreLista"]').forEach(sel => sel.addEventListener('change', renderEditor));
    }
    function controlAlineacion(b) { const s = Number(b.sangria) || 0; return `<div class="block-controls"><label>Alineación <select class="block-field" data-field="alineacion"><option value="izquierda"${b.alineacion==='izquierda'?' selected':''}>Izquierda</option><option value="justificado"${b.alineacion==='justificado'?' selected':''}>Justificada</option><option value="centro"${b.alineacion==='centro'?' selected':''}>Centrada</option><option value="derecha"${b.alineacion==='derecha'?' selected':''}>Derecha</option></select></label><label>Sangría izq. <select class="block-field" data-field="sangria"><option value="0"${s===0?' selected':''}>Ninguna</option><option value="1"${s===1?' selected':''}>1 nivel</option><option value="2"${s===2?' selected':''}>2 niveles</option><option value="3"${s===3?' selected':''}>3 niveles</option></select></label></div>`; }
    function icono(t) { return ({section:'ph-text-h-two',text:'ph-text-t',list:'ph-list-bullets',table:'ph-table',image:'ph-image',link:'ph-link'})[t]; }
    function nombre(t) { return ({section:'Sección',text:'Texto',list:'Lista',table:'Tabla',image:'Imagen',link:'Enlace'})[t]; }
    function activarTab(target) { document.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x.dataset.target === target)); document.querySelectorAll('.tab-content').forEach(x => x.classList.toggle('active', x.id === `${target}-content`)); }

    function parrafos(texto, alineacion, sangria) {
        const valor = alineacion === 'centro' ? 'center' : (alineacion === 'derecha' ? 'right' : (alineacion === 'justificado' ? 'justify' : 'left'));
        const reglas = [];
        if (alineacion && alineacion !== 'izquierda') reglas.push(`text-align: ${valor}`);
        // Cada nivel de sangría ≈ 38px, el mismo sangrado principal de las listas,
        // para que el párrafo quede alineado bajo el texto del punto de lista.
        const px = (Number(sangria) || 0) * 38;
        if (px) reglas.push(`margin-left: ${px}px`);
        const style = reglas.length ? ` style="${reglas.join('; ')};"` : '';
        return String(texto || '').split(/\n\s*\n/).map(clean).filter(Boolean).map(t => `<p${style}><span style="color: #000000;">${negritas(esc(t)).replace(/\n/g, '<br>')}</span></p>`).join('');
    }
    function celdas(linea) { return String(linea || '').split(/\t|\|/).map(clean); }
    // Texto negro o blanco según la luminosidad del fondo: los sombreados del
    // Word suelen ser claros (#dde6f2, #f7bf77) y el blanco fijo era ilegible.
    function contrasteTexto(hex) {
        const h = String(hex || '').replace('#', '');
        if (h.length < 6) return '#ffffff';
        const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#000000' : '#ffffff';
    }
    function tablaHTML(b, paleta) {
        // Se conservan las filas vacías de plantilla ("| | |"): en las
        // actividades son los renglones que el estudiante debe llenar.
        const headers = celdas(b.encabezados);
        while (headers.length && !headers[headers.length - 1]) headers.pop();
        const rows = String(b.filas || '').split('\n').filter(l => clean(l)).map(celdas);
        const tituloTabla = clean(b.tituloTabla);
        if (!headers.some(Boolean) && !rows.length && !tituloTabla) return '';
        const n = Math.max(headers.length, ...rows.map(r => r.length), 1);
        const fondo = clean(b.colorEncabezado) || paleta[1];
        const th = `style="border:1px solid #000000;padding:8px;background-color:${fondo};color:${contrasteTexto(fondo)};text-align:center;"`;
        // Un encabezado vacío se combina con el anterior (colspan), igual que
        // las celdas combinadas del Word ("Clases (rangos de edad)" sobre dos columnas).
        const grupos = [];
        for (let i = 0; i < n; i++) {
            const t = headers[i] || '';
            if (!t && grupos.length) grupos[grupos.length - 1].span++;
            else grupos.push({ t, span: 1 });
        }
        const filaTitulo = tituloTabla ? `<tr><th colspan="${n}" scope="colgroup" ${th}>${esc(tituloTabla)}</th></tr>` : '';
        const filaEncabezados = headers.some(Boolean) ? `<tr>${grupos.map(g => `<th${g.span > 1 ? ` colspan="${g.span}"` : ''} scope="col" ${th}>${esc(g.t) || '&nbsp;'}</th>`).join('')}</tr>` : '';
        const thead = filaTitulo || filaEncabezados ? `<thead>${filaTitulo}${filaEncabezados}</thead>` : '';
        const cuerpo = rows.map(r => `<tr>${Array.from({ length: n }, (_, i) => `<td style="border:1px solid #000000;padding:8px;"><span style="color: #000000;">${esc(r[i] || '') || '&nbsp;'}</span></td>`).join('')}</tr>`).join('');
        // Responsive sin depender del CSS del tema 3.11: las tablas anchas van a
        // 100% con un mínimo por columna, y el contenedor scrollea en pantallas
        // chicas en vez de aplastar el texto (el width:0px de Word hacía justo eso).
        // Las angostas quedan centradas a su ancho natural, como en el Word.
        const ancha = n >= 4;
        const estiloTabla = ancha
            ? `border-collapse:collapse;width:100%;min-width:${n * 110}px;`
            : 'border-collapse:collapse;margin:0 auto;min-width:280px;';
        return `<div style="overflow-x:auto;"><table border="1" cellspacing="0" cellpadding="8" style="${estiloTabla}">${thead}<tbody>${cuerpo}</tbody></table></div>`;
    }
    function contenidoBloque(b, paleta, paraPreview) {
        if (b.tipo === 'text' || b.tipo === 'section') return parrafos(b.texto, b.alineacion, b.sangria);
        /* La viñeta (y el número) NO son texto: el navegador los pinta con el
           `color` del <li>, no con el del <span> de adentro. Sin `color` en el
           <li> heredaban el gris que el tema de Moodle le da a las listas y
           quedaban de otro color que su propio texto. Va con !important, como
           el resto: la hoja de Moodle no se toca, se gana desde aquí. */
        if (b.tipo === 'list') { const nivel = Math.max(0, Math.min(3, Number(b.nivelLista) || 0)); const tag = b.tipoLista === 'vinetas' ? 'ul' : 'ol'; const estilo = b.tipoLista === 'vinetas' ? 'disc' : (b.tipoLista === 'letras' ? 'lower-alpha' : (b.tipoLista === 'romana' ? 'lower-roman' : 'decimal')); const reglas = [`padding-left: ${38 + nivel * 38}px`, `list-style-type: ${estilo} !important`, 'color: #000000 !important', 'font-family: inherit !important', 'font-size: 14px !important', 'line-height: inherit !important']; const estiloElemento = 'color: #000000 !important; font-family: inherit !important; font-size: 14px !important; line-height: inherit !important;'; const estiloTexto = 'color: #000000; font-size: 14px !important;'; const start = tag === 'ol' && Number(b.inicioLista) > 1 ? ` start="${Number(b.inicioLista)}"` : ''; const lineas = String(b.texto || '').split('\n').map(clean).filter(Boolean); const desde = Math.max(1, Number(b.inicioLista) || 1); if (tag === 'ol' && b.cierreLista === ')') { const reglasP = [`padding-left: ${38 + nivel * 38}px`, 'list-style: none !important', 'color: #000000 !important', 'font-family: inherit !important', 'font-size: 14px !important', 'line-height: inherit !important']; const sangria = 'text-indent: -24px; padding-left: 24px; '; return `<ol style="${reglasP.join('; ')};">${lineas.map((x, i) => `<li style="${sangria}${estiloElemento}"><span style="${estiloTexto}">${esc(rotulo(b.tipoLista, desde + i))}) ${negritas(esc(x))}</span></li>`).join('')}</ol>`; } return `<${tag}${start} style="${reglas.join('; ')};">${lineas.map(x => `<li style="${estiloElemento}"><span style="${estiloTexto}">${negritas(esc(x))}</span></li>`).join('')}</${tag}>`; }
        if (b.tipo === 'table') return tablaHTML(b, paleta);
        if (b.tipo === 'image') {
            // Sin URL manual, una imagen importada del Word sale como
            // @@PLUGINFILE@@/nombre: Moodle la resuelve sola cuando el archivo
            // descargado se arrastra al editor (mismo flujo que Micrositio a Página).
            // La vista previa usa la imagen local, que @@PLUGINFILE@@ no puede pintar.
            const src = paraPreview
                ? (b.urlLocal || clean(b.href))
                : (clean(b.href) || (b.archivoImagen ? `@@PLUGINFILE@@/${b.archivoImagen}` : ''));
            return src ? `<p style="text-align:center;"><img src="${esc(src)}" alt="${esc(b.alt)}" style="max-width:100%;height:auto;"></p>` : '';
        }
        if (b.tipo === 'link') return b.href || b.texto ? `<p><a href="${esc(b.href)}" target="_blank">${esc(b.texto || b.href)}</a></p>` : '';
        return '';
    }
    function buildHTML() {
        const m = $('#modulo').value, paleta = MODULOS[m], titulo = clean($('#titulo').value);
        const cuerpo = blocks.filter(b => contenidoBloque(b, paleta) || (b.tipo === 'section' && clean(b.titulo))).map(b => {
            const head = b.tipo === 'section' && clean(b.titulo) ? `<h2 class="prepa-M${m}-subTema"><span>${esc(clean(b.titulo))}</span></h2>` : '';
            return `<div class="prepa-M${m}-bloqueContenidos">${head}<div class="prepa-M${m}-contenidosTexto-Imagen">${contenidoBloque(b, paleta)}</div></div>`;
        }).join('\n');
        return `<div class="prepa-M${m}-body">\n<div class="prepa-M${m}-Tema">\n<h1 class="prepa-M${m}-tituloTema"><span>${esc(titulo)}</span></h1>\n</div>\n${cuerpo}\n</div>`;
    }
    /* SOLO para la previa: el `$$…$$` se destaca para poder contarlas de un
       vistazo. Aquí no se renderiza la fórmula —eso lo hace el filtro TeX de
       Moodle, y meter una biblioteca de matemáticas rompería el trato de "sin
       dependencias"—, así que la previa enseña el código tal cual viaja.
       Colores fijos, como todo lo que se inyecta en la isla clara. */
    function marcarFormulas(html) {
        return String(html || '').replace(FORMULA, (_, latex) =>
            `<span style="background:#eef3fb;border:1px dashed #7d9bc4;border-radius:4px;padding:0 3px;font-family:Consolas,monospace;font-size:.92em;" title="Moodle 3.11 lo publica como fórmula">$$${latex}$$</span>`);
    }
    function previewHTML() {
        const m = $('#modulo').value, p = MODULOS[m], title = esc(clean($('#titulo').value) || 'Título de la actividad');
        const cuerpo = blocks.map(b => {
            const content = marcarFormulas(contenidoBloque(b, p, true)); if (!content && !(b.tipo === 'section' && clean(b.titulo))) return '';
            const head = b.tipo === 'section' && clean(b.titulo) ? `<h2 class="subtema" style="background:${p[1]}">${esc(clean(b.titulo))}</h2>` : '';
            /* La envoltura marcada es SOLO de la previa (buildHTML no la lleva):
               una sección son dos hermanos —el <h2> y su .content— y la barra
               flotante necesita un único elemento del que colgarse. */
            return `<div class="bloque-previa" data-bq="${b.id}">${head}<div class="content" style="background:${p[2]}">${content}</div></div>`;
        }).join('');
        return `<div class="moodle-preview" style="background:${p[0]}"><h1 class="tema" style="background:${p[1]}">${title}</h1>${cuerpo}</div>`;
    }
    function actualizar() {
        const hay = blocks.some(b => clean(b.texto) || clean(b.titulo) || clean(b.href) || clean(b.encabezados) || clean(b.filas) || clean(b.tituloTabla) || b.urlLocal);
        $('#code').value = buildHTML();
        $('#preview').innerHTML = previewHTML();
        $('#preview').classList.toggle('hidden', !hay); $('#preview-empty').classList.toggle('hidden', hay);
        refrescarBarraPrevia();
        marcarSeleccionEnPrevia();
    }
    function copiarHTML() { const c = $('#code'); if (!c.value.trim()) return; navigator.clipboard.writeText(c.value).then(() => { const i=$('#btn-copy i'); i.className='ph ph-check'; setTimeout(()=>i.className='ph ph-copy',1200); }).catch(()=>{c.focus();c.select();}); }

    function configurarImportador() {
        const input = $('#input-docx'), zone = $('#dropzone');
        zone.addEventListener('click', () => input.click()); input.addEventListener('change', () => input.files[0] && importarWord(input.files[0]));
        ['dragenter','dragover'].forEach(e => zone.addEventListener(e, x => { x.preventDefault(); zone.classList.add('dropzone--active'); }));
        ['dragleave','drop'].forEach(e => zone.addEventListener(e, x => { x.preventDefault(); zone.classList.remove('dropzone--active'); }));
        zone.addEventListener('drop', e => e.dataTransfer.files[0] && importarWord(e.dataTransfer.files[0]));
    }
    async function importarWord(file) {
        if (!/\.docx$/i.test(file.name)) return infoImport('El archivo debe ser .docx.', false);
        try {
            /* Con `latex` las ecuaciones del Word entran como `$$…$$`, que es
               como Moodle 3.11 espera el TeX. Antes se perdían enteras: el
               texto de una fórmula no vive en un `w:r`, así que "el límite
               cuando m→0, m→3 y m→6" llegaba como "el límite cuando , y .". */
            const fuente = await leerBloquesDeDocx(file, { latex: true });
            const imagenesWord = await leerImagenesDeDocx(file);
            codigosDeProduccion = await leerLatexDeComentariosDocx(file);
            // Las notas de revisión del Word son indicaciones de montaje (dónde
            // vincular un PDF o imagen): no son enlaces reales, se recuerdan al
            // generar. Los "Código para producción" ya viajan dentro del texto
            // como $$…$$: son contenido, no un recado pendiente.
            comentariosMontaje = (await leerComentariosDeDocx(file)).filter(c => !esComentarioDeLatex(c.texto));
            // El inicio no es una "página" (Word no guarda páginas fiables): es la primera
            // tabla de una celda, que es exactamente la primera barra gris del formato de actividades.
            const inicio = fuente.findIndex(x => x.tipo === 'tabla' && x.celdas === 1 && x.texto);
            if (inicio < 0) throw new Error('No encontré la primera barra de título (tabla de una celda).');
            const leidos = fuente.slice(inicio);
            const nuevos = []; let actual = null; let esTitulo = true;
            const contadoresLista = new Map();
            leidos.forEach(x => {
                if (x.tipo === 'tabla' && x.celdas === 1) {
                    if (esTitulo) { $('#titulo').value = x.texto; esTitulo = false; actual = nuevo('text'); nuevos.push(actual); }
                    else { actual = nuevo('section', { titulo:x.texto }); nuevos.push(actual); }
                } else if (x.tipo === 'tabla' && x.filas && x.filas.length) {
                    // Tabla real de contenido (caso AI3/PI). Se respeta lo que trae
                    // el Word: celdas combinadas, color de sombreado y filas vacías
                    // de plantilla que el estudiante llenará.
                    nuevos.push(bloqueDesdeTablaWord(x));
                    actual = null;
                } else if (x.tipo === 'parrafo' && x.imagenes && x.imagenes.length && !x.texto) {
                    // Imagen suelta (caso AI4: la tabla pegada como captura). Se
                    // extrae del Word para verla, descargarla y referenciarla.
                    x.imagenes.forEach(id => {
                        const img = imagenesWord.get(id);
                        if (img) nuevos.push(nuevo('image', { archivoImagen: img.nombre, urlLocal: URL.createObjectURL(img.blob) }));
                    });
                    actual = null;
                } else if (x.tipo === 'parrafo' && x.texto) {
                    // Son marcas visuales del formato Word, no contenido que deba llegar a Moodle.
                    const marca = clean(sinMarcas(x.texto)).toLocaleLowerCase('es-MX');
                    if (marca === '<h2>' || marca === '</h2>' || marca.includes('lista numerada')) return;
                    if (x.lista) {
                        const llave = `${x.idLista}:${x.nivelLista}`;
                        const siguiente = (contadoresLista.get(llave) || 0) + 1;
                        let l = nuevos[nuevos.length - 1];
                        if (!l || l.tipo !== 'list' || l.tipoLista !== x.tipoLista || Number(l.nivelLista) !== Number(x.nivelLista) || l.idLista !== x.idLista) {
                            l = nuevo('list', { tipoLista:x.tipoLista, nivelLista:x.nivelLista, idLista:x.idLista, inicioLista:siguiente });
                            nuevos.push(l);
                        }
                        l.texto += (l.texto ? '\n' : '') + x.texto;
                        contadoresLista.set(llave, siguiente);
                        actual = null;
                    }
                    else {
                        // Los twips del Word (567 ≈ 1 cm) se redondean a un nivel de
                        // sangría 0-3; así el párrafo de cuerpo conserva la indentación
                        // con que se alinea bajo un punto de lista.
                        const sangria = Math.min(3, Math.round((Number(x.sangria) || 0) / 567));
                        if (!actual || (actual.texto && (actual.alineacion !== x.alineacion || Number(actual.sangria) !== sangria))) { actual = nuevo('text', { alineacion:x.alineacion, sangria }); nuevos.push(actual); }
                        if (!actual.texto) { actual.alineacion = x.alineacion; actual.sangria = sangria; }
                        actual.texto += (actual.texto ? '\n\n' : '') + x.texto;
                    }
                }
            });
            blocks = nuevos.filter(b => clean(b.texto) || clean(b.titulo) || clean(b.encabezados) || clean(b.filas) || clean(b.tituloTabla) || b.urlLocal);
            selectedBlockId = null; renderEditor(); actualizar();
            $('#dropzone').classList.add('dropzone--loaded');
            const tablas = blocks.filter(b => b.tipo === 'table').length;
            const imagenes = blocks.filter(b => b.tipo === 'image').length;
            const formulas = formulasDeBloques();
            const convertidas = formulas.filter(f => f.auto).length;
            const extras = [
                tablas ? `${tablas} tabla(s)` : '',
                imagenes ? `${imagenes} imagen(es): descárgalas y arrástralas al editor de Moodle` : '',
                formulas.length ? `${formulas.length} fórmula(s) como $$…$$${convertidas ? `, ${convertidas} sin código de producción: revísalas` : ''}` : ''
            ].filter(Boolean).join(' · ');
            infoImport(`${file.name}: ${blocks.length} bloque(s) creados${extras ? ` (${extras})` : ''}. Revisa tablas, imágenes y enlaces antes de generar.`, true);
        } catch (e) { console.error(e); infoImport(`No se pudo importar: ${e.message}`, false); }
    }
    /* La tabla del Word llega con celdas combinadas (gridSpan) y sombreados.
       Aquí se traduce al modelo del bloque Tabla:
       - cada celda combinada se expande en columnas vacías, que al generar se
         vuelven de nuevo un colspan;
       - una primera fila de una sola celda combinada es la fila título
         (caso "Variable:" del Proyecto Integrador);
       - el color de sombreado del Word se conserva como color de encabezado. */
    function bloqueDesdeTablaWord(x) {
        const filas = x.filas.map(f => f.flatMap(c => [c.texto, ...Array(c.span - 1).fill('')]));
        const total = Math.max(...filas.map(f => f.length), 1);
        let tituloTabla = '', resto = filas;
        if (x.filas.length > 1 && x.filas[0].length === 1 && x.filas[0][0].span >= total) {
            tituloTabla = filas[0][0];
            resto = filas.slice(1);
        }
        const colorEncabezado = (x.filas.flat().find(c => c.fondo) || {}).fondo || '';
        return nuevo('table', {
            tituloTabla,
            colorEncabezado,
            encabezados: (resto[0] || []).join(' | '),
            filas: resto.slice(1).map(f => f.join(' | ')).join('\n')
        });
    }
    function infoImport(msg, ok) { const el=$('#import-info'); el.textContent=msg; el.classList.remove('hidden'); el.style.color=ok?'var(--success)':'var(--danger)'; }

    /* Las fórmulas que hay ahora mismo en los bloques: `[{ latex, auto }]`.
       `auto` marca las que NO traían "Código para producción" en el Word y salió
       de convertir el objeto de ecuación: se ven bien casi siempre, pero es lo
       único de la importación que conviene mirar con ojo antes de publicar.
       Se recalcula al vuelo (y no se guarda en el bloque) porque el usuario
       puede teclear o corregir un `$$…$$` a mano después de importar. */
    function formulasDeBloques() {
        const autorizados = new Set([...codigosDeProduccion.values()].map(clean));
        const salida = [];
        blocks.forEach(b => {
            [b.texto, b.titulo, b.filas, b.encabezados, b.tituloTabla].forEach(campo => {
                for (const m of String(campo || '').matchAll(FORMULA)) {
                    const latex = m[1].trim();
                    salida.push({ latex, auto: !autorizados.has(latex) });
                }
            });
        });
        return salida;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
