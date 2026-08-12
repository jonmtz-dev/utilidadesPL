/* ==========================================================================
   Guion Instruccional a Página (Moodle 5.1)

   Editor visual: el compañero arma la página con bloques y nunca ve HTML.
   Este archivo es el editor y la vista previa; QUÉ produce cada bloque vive en
   componentes.js (fuente única del vocabulario de la plantilla).

   Tres decisiones que conviene no deshacer:

   1. La vista previa va en un <iframe sandbox> con la hoja real del tema. El
      CSS de Moodle trae selectores globales (body, #page…): inyectarlo en la
      página del panel lo desfiguraría. Quien lo aísla es el iframe en sí: es
      otro documento. Misma solución que Micrositio a Página, por la misma
      razón. El sandbox lleva allow-same-origin porque las imágenes del Word son
      blob: del documento padre y porque el lienzo y la previa se sincronizan.
   2. Escribir en un campo NO redibuja el lienzo (se perdería el cursor y la
      selección): actualiza el modelo, el resumen del bloque y la vista previa.
      Solo lo estructural (agregar, borrar, mover, cambiar de opción) redibuja.
   3. Los bloques anidados (acordeón → texto → tooltip) son el mismo modelo
      recursivo, así que el editor y el generador funcionan a cualquier
      profundidad sin casos especiales.
   ========================================================================== */

(function () {
    'use strict';

    /* ---------------------------------------------------------------------
       Estado
       --------------------------------------------------------------------- */

    const pagina = { paleta: 'M01', titulo: '', bloques: [] };
    let seleccion = null;          // id del bloque seleccionado
    let contadorId = 0;
    let indicaciones = [];         // marcas del guion que no se supo traducir
    /* Imágenes que venían dentro del .docx: [{nombre, bytes, url}]. `url` es un
       objeto de blob que usa la vista previa para enseñar la imagen real, y
       `bytes` alimenta el .zip que se arrastra al editor de Moodle. */
    let imagenesDocx = [];
    const historial = [];
    let refrescoPendiente = null;
    /* Tablas del Word que ya se montaron DENTRO de otra (el grupo de tarjetas de
       un apartado del acordeón). docx.js entrega el mismo objeto en las dos
       partes, así que un Set basta para que el recorrido de primer nivel no las
       vuelva a poner como bloques hermanos. Y las decisiones del asistente, por
       bloque, para poder consultarlas también desde dentro de una celda. */
    let tablasConsumidas = new Set();
    let decisionesTabla = new Map();

    const $ = s => document.querySelector(s);
    const nuevoIdBloque = () => ++contadorId;

    function crearBloque(tipo, abierto) {
        const comp = COMPONENTES[tipo];
        return Object.assign({ id: nuevoIdBloque(), tipo, abierto: abierto !== false }, comp.nuevo());
    }

    /* Los hijos creados por defecto en componentes.js llegan sin id propio. */
    function asignarIds(lista) {
        (lista || []).forEach(b => {
            if (!b.id) b.id = nuevoIdBloque();
            asignarIds(b.hijos);
            (b.items || []).forEach(it => asignarIds(it.hijos));
        });
    }

    /* --------- Recorrido del árbol: encontrar un bloque y su lista --------- */

    function buscar(id, lista = pagina.bloques) {
        for (let i = 0; i < lista.length; i++) {
            const b = lista[i];
            if (b.id === id) return { lista, i, bloque: b };
            const enHijos = b.hijos && buscar(id, b.hijos);
            if (enHijos) return enHijos;
            for (const item of b.items || []) {
                const enItem = item.hijos && buscar(id, item.hijos);
                if (enItem) return enItem;
            }
        }
        return null;
    }

    /* ---------------------------------------------------------------------
       Historial (deshacer)
       --------------------------------------------------------------------- */

    function guardarHistorial() {
        historial.push(JSON.stringify({ pagina, contadorId }));
        if (historial.length > 40) historial.shift();
        $('#btn-deshacer').disabled = false;
    }

    function deshacer() {
        const previo = historial.pop();
        if (!previo) return;
        const datos = JSON.parse(previo);
        pagina.paleta = datos.pagina.paleta;
        pagina.titulo = datos.pagina.titulo;
        pagina.bloques = datos.pagina.bloques;
        contadorId = datos.contadorId;
        seleccion = null;
        $('#btn-deshacer').disabled = !historial.length;
        dibujarTodo();
    }

    /* ---------------------------------------------------------------------
       Salida: HTML final
       --------------------------------------------------------------------- */

    function generarHTML(paraPrevia) {
        reiniciarIds();
        marcarBloques(Boolean(paraPrevia));
        const cuerpo = [];
        if ((pagina.titulo || '').trim()) {
            cuerpo.push(COMPONENTES.titulo.html({ nivel: 'h1', texto: pagina.titulo }, 1));
            // La regla del montaje: bajo la barra del título va una línea. Es un
            // <hr> pelado, no el .espacio-fino del separador manual.
            cuerpo.push(`${'    '}<hr>`);
        }
        const bloques = htmlDeBloques(pagina.bloques, 1);
        marcarBloques(false);
        if (bloques) cuerpo.push(bloques);
        if (!cuerpo.length) return '';
        // `container-fluid` + la paleta del aula: el wrapper exacto de las
        // páginas que ya publica el equipo.
        return `<div class="container-fluid mainPlantilla23 ${pagina.paleta}">\n${cuerpo.join('\n')}\n</div>`;
    }

    /* ---------------------------------------------------------------------
       Vista previa
       --------------------------------------------------------------------- */

    /* Bootstrap no viene en la hoja del tema (el tema solo la retoca), así que
       la previa carga un subconjunto propio: sin él la rejilla, el acordeón y
       las pestañas se verían apiladas y en blanco, y la previa mentiría. */
    function documentoPrevia(htmlOriginal) {
        let html = htmlOriginal;
        // El embebido de YouTube no se pone a jugar dentro del sandbox de la
        // previa; una caja negra parecería un error, así que se cambia por un
        // cartel que dice justo lo que habrá en Moodle.
        // Las imágenes del guion se ven de verdad en la previa: se cambia el
        // @@PLUGINFILE@@ por el blob: del archivo que venía en el .docx. En el
        // HTML que se copia a Moodle, por supuesto, se queda el @@PLUGINFILE@@.
        imagenesDocx.forEach(img => {
            html = html.split(`@@PLUGINFILE@@/${img.nombre}`).join(img.url);
        });
        const conCartel = html.replace(
            /<iframe [^>]*src="https:\/\/www\.youtube\.com\/embed\/[^"]*"[^>]*><\/iframe>/g,
            '<div class="previa-video">Video de YouTube<br><small>Se ve al publicar en Moodle</small></div>');
        return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<style>${window.CSS_VISTA_PREVIA || ''}</style>
<style>${window.HOJA_MOODLE_DEFAULT || ''}</style>
<!-- Va después de la hoja del tema a propósito: es andamiaje de la
     herramienta y ninguna regla de Moodle debe poder ganarle. -->
<style>${window.CSS_BARRA_PREVIA || ''}</style>
</head><body class="path-mod-page"><div class="previa-hoja">${conCartel}</div>
<script>
/* Acordeón y pestañas: en Moodle los mueve el Bootstrap de la plataforma.
   Aquí basta con reproducir el comportamiento para que la previa sea usable. */
document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-bs-toggle="collapse"]');
    if (b) {
        var panel = document.querySelector(b.getAttribute('data-bs-target'));
        if (!panel) return;
        var abierto = panel.classList.contains('show');
        var padre = panel.getAttribute('data-bs-parent');
        if (padre) document.querySelectorAll(padre + ' .accordion-collapse.show').forEach(function (p) {
            p.classList.remove('show');
            var btn = document.querySelector('[data-bs-target="#' + p.id + '"]');
            if (btn) { btn.classList.add('collapsed'); btn.setAttribute('aria-expanded', 'false'); }
        });
        panel.classList.toggle('show', !abierto);
        b.classList.toggle('collapsed', abierto);
        b.setAttribute('aria-expanded', String(!abierto));
        return;
    }
    var m = e.target.closest('[data-bs-toggle="modal"]');
    if (m) {
        var vent = document.querySelector(m.getAttribute('data-bs-target'));
        if (vent) vent.classList.add('show');
        return;
    }
    // Cerrar: la ✕, o un clic en el fondo oscuro (como hace Bootstrap).
    var cerrar = e.target.closest('[data-bs-dismiss="modal"]');
    if (cerrar || e.target.classList.contains('modal')) {
        var abierta = cerrar ? cerrar.closest('.modal') : e.target;
        if (abierta) abierta.classList.remove('show');
        return;
    }
    var t = e.target.closest('[data-bs-toggle="tab"]');
    if (t) {
        var lista = t.closest('.nav-tabs');
        var cont = lista && lista.parentElement.querySelector('.tab-content');
        if (!cont) return;
        lista.querySelectorAll('.nav-link').forEach(function (n) { n.classList.remove('active'); });
        cont.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('show', 'active'); });
        t.classList.add('active');
        var panel = cont.querySelector(t.getAttribute('data-bs-target'));
        if (panel) panel.classList.add('show', 'active');
    }
});
<\/script></body></html>`;
    }

    function refrescarSalida() {
        const html = generarHTML();
        $('#code').value = html;
        $('#preview-empty').classList.toggle('hidden', Boolean(html));
        $('#preview-caja').classList.toggle('hidden', !html);
        if (html) {
            const frame = $('#preview-frame');
            /* Sustituir el srcdoc recarga el documento y lo deja hasta arriba.
               Con la barra flotante eso se nota de más: mueves un bloque a media
               página y la previa salta al principio. Se guarda y se repone. */
            const antes = frame.contentDocument && frame.contentDocument.scrollingElement;
            const desplazado = antes ? antes.scrollTop : 0;
            frame.srcdoc = documentoPrevia(generarHTML(true));
            frame.addEventListener('load', () => {
                const ahora = frame.contentDocument && frame.contentDocument.scrollingElement;
                if (ahora && desplazado) ahora.scrollTop = desplazado;
                conectarPrevia();
            }, { once: true });
        }
        dibujarRevision(html);
    }

    /* ---------------------------------------------------------------------
       Lienzo ↔ vista previa

       Con veinte bloques uno se pierde entre las dos columnas. Al hacer clic en
       un bloque, la previa lo trae a la vista y lo enmarca; al hacer clic en la
       previa, se abre ese bloque en el lienzo.
       --------------------------------------------------------------------- */

    function conectarPrevia() {
        const doc = $('#preview-frame').contentDocument;
        if (!doc || !doc.body) return;
        /* Dos asignaciones seguidas de srcdoc (pasa al cargar el estado) dejan
           dos escuchas de "load" apuntando al MISMO documento: la primera no
           alcanzó a cargar. Sin esta marca, ese documento acababa con dos barras
           flotantes y con todas las escuchas duplicadas. */
        if (doc.body.dataset.conectada) { señalarEnPrevia(seleccion); return; }
        doc.body.dataset.conectada = '1';
        doc.addEventListener('click', e => {
            const marcado = e.target.closest('[data-bq]');
            if (!marcado) return;
            const id = Number(marcado.dataset.bq);
            const destino = buscar(id);
            if (!destino) return;
            destino.bloque.abierto = true;
            seleccion = id;
            /* Solo el lienzo, NUNCA dibujarTodo(): regenerar la previa aquí la
               reconstruye desde cero, así que el acordeón (o la pestaña, o la
               ventana) se cerraba en el mismo clic con que se abría y parecía
               que la previa no era interactiva. Abrir o seleccionar un bloque no
               cambia el HTML, así que no hay nada que refrescar allá. */
            dibujarLienzo();
            const card = document.querySelector(`.bloque-card[data-id="${id}"]`);
            if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
        const colocarBarra = montarBarraPrevia(doc);
        /* Tras mover un bloque la previa se reconstruye entera y el mouse sigue
           donde estaba, así que no habrá ningún mouseover que devuelva la barra:
           se repone a mano sobre el bloque que se acaba de tocar. Si se borró,
           colocar() no lo encuentra y se esconde. */
        if (bqBarra) colocarBarra(doc.querySelector(`[data-bq="${bqBarra}"]`));
        señalarEnPrevia(seleccion);
    }

    /* ---------------------------------------------------------------------
       Barra flotante de la vista previa

       Reordenar desde la previa: al pasar el mouse por un bloque aparecen
       subir/bajar/duplicar/quitar sobre su esquina.

       Vive DENTRO del iframe, inyectada después de cargar. Dentro porque así
       scrollea con la página sola, sin traducir coordenadas entre dos
       documentos; inyectada porque el HTML que se copia a Moodle no debe
       enterarse, igual que pasa con el data-bq.

       No es arrastre a propósito: el contenido de la previa ya reacciona al
       clic (acordeones, pestañas, ventanas), y hacerlo draggable dejaría cada
       clic peleado entre abrir y mover.
       --------------------------------------------------------------------- */

    let bqBarra = null;   // id del bloque sobre el que quedó la barra

    // Trazos propios: dentro del iframe no hay Phosphor (ni fuentes externas).
    const BOTONES_BARRA = [
        ['subir', 'Subir', 'M8 13V4M4.2 7.8 8 4l3.8 3.8'],
        ['bajar', 'Bajar', 'M8 3v9M4.2 8.2 8 12l3.8-3.8'],
        ['duplicar', 'Duplicar', 'M6 5.5h6.5a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1M10.5 3H3.5a.5.5 0 0 0-.5.5v7'],
        ['borrar', 'Quitar', 'M2.8 4.5h10.4M6.2 4.5V2.9h3.6v1.6M4.4 4.5l.6 8.6h6l.6-8.6']
    ];

    function montarBarraPrevia(doc) {
        const vista = doc.defaultView;
        const barra = doc.createElement('div');
        barra.className = 'previa-barra';
        barra.innerHTML = BOTONES_BARRA.map(([accion, titulo, trazo]) =>
            `<button type="button" data-accion="${accion}" title="${titulo}" aria-label="${titulo}">` +
            `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" ` +
            `stroke-linecap="round" stroke-linejoin="round"><path d="${trazo}"/></svg></button>`).join('');
        doc.body.appendChild(barra);

        function ocultar() {
            barra.classList.remove('visible');
            bqBarra = null;
        }

        function colocar(destino) {
            const sitio = destino && buscar(Number(destino.dataset.bq));
            if (!sitio) return ocultar();
            bqBarra = sitio.bloque.id;
            // Los topes se ven: subir el primero de su lista no hace nada.
            barra.querySelector('[data-accion="subir"]').disabled = sitio.i === 0;
            barra.querySelector('[data-accion="bajar"]').disabled = sitio.i === sitio.lista.length - 1;
            /* Una ventana emergente es position:fixed: sumarle el scroll de la
               página dejaría la barra a media pantalla del bloque. */
            const fija = Boolean(destino.closest('.modal'));
            barra.classList.toggle('previa-barra--fija', fija);
            const caja = destino.getBoundingClientRect();
            const dx = fija ? 0 : vista.scrollX;
            const dy = fija ? 0 : vista.scrollY;
            barra.style.left = (caja.right + dx) + 'px';
            // La barra se centra en el borde de arriba del bloque (translate en
            // el CSS): sin el tope, la del primer bloque saldría medio cortada.
            barra.style.top = Math.max(caja.top + dy, dy + 18) + 'px';
            barra.classList.add('visible');
        }

        doc.addEventListener('mouseover', e => {
            // Pasar por encima de la propia barra no la mueve ni la esconde.
            if (barra.contains(e.target)) return;
            colocar(e.target.closest('[data-bq]'));
        });
        doc.documentElement.addEventListener('mouseleave', ocultar);

        barra.addEventListener('click', e => {
            const btn = e.target.closest('[data-accion]');
            if (!btn || btn.disabled || !bqBarra) return;
            const id = bqBarra;
            /* Se deja señalado el bloque movido: la previa se reconstruye entera
               y sin el destello uno pierde de vista qué acaba de moverse. */
            if (btn.dataset.accion !== 'borrar') seleccion = id;
            accionDeBloque(btn.dataset.accion, id);
        });

        return colocar;
    }

    function señalarEnPrevia(id) {
        const doc = $('#preview-frame').contentDocument;
        if (!doc || !doc.body) return;
        doc.querySelectorAll('.previa-senalado').forEach(n => n.classList.remove('previa-senalado'));
        if (!id) return;
        const destino = doc.querySelector(`[data-bq="${id}"]`);
        if (!destino) return;
        destino.classList.add('previa-senalado');
        /* Solo se mueve el scroll si el bloque NO se ve. Ahora que la previa
           conserva su posición al redibujar, centrarlo siempre daba un tirón
           por cada tecla que se escribe. */
        const caja = destino.getBoundingClientRect();
        const alto = doc.documentElement.clientHeight;
        if (caja.bottom < 40 || caja.top > alto - 40) {
            destino.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }

    /* Escribir dispara una previa por tecleo; con la hoja del tema (240 KB) eso
       se siente pesado, así que se agrupa. */
    function programarRefresco() {
        clearTimeout(refrescoPendiente);
        refrescoPendiente = setTimeout(refrescarSalida, 300);
    }

    /* ---------------------------------------------------------------------
       Revisión: qué falta antes de subir
       --------------------------------------------------------------------- */

    function dibujarRevision(html) {
        const caja = $('#check-lista');
        const avisos = [];
        const imagenes = new Set();

        const recorrer = lista => (lista || []).forEach(b => {
            [b.src, b.icono, ...(b.items || []).map(i => i.img)].forEach(u => {
                const url = (u || '').trim();
                if (url && !/^https?:/i.test(url)) imagenes.add(url.replace('@@PLUGINFILE@@/', ''));
            });
            if (b.tipo === 'imagen' && (b.src || '').trim() && !(b.alt || '').trim()) {
                avisos.push({ tono: 'aviso', texto: 'Hay una imagen sin texto alternativo. Un lector de pantalla no podrá describirla.' });
            }
            if (b.tipo === 'acordeon' && (b.items || []).some(i => !(i.hijos || []).length)) {
                avisos.push({ tono: 'aviso', texto: 'Un apartado del acordeón está vacío: en Moodle abrirá en blanco.' });
            }
            if (b.tipo === 'tabla' && !(b.encabezados || []).filter(t => String(t).trim()).length) {
                avisos.push({ tono: 'error', texto: 'Una tabla no tiene encabezados. Sin ellos no hay data-label y en celular las tarjetas salen sin título de columna.' });
            }
            if (b.tipo === 'instruccion' && !(b.icono || '').trim()) {
                imagenes.add('icono-instruccion.png');
            }
            recorrer(b.hijos);
            (b.items || []).forEach(i => recorrer(i.hijos));
        });
        recorrer(pagina.bloques);

        if (!(pagina.titulo || '').trim()) {
            avisos.push({ tono: 'aviso', texto: 'La página no tiene título.' });
        }
        if (!html) {
            caja.innerHTML = '<div class="empty-state"><i class="ph ph-list-checks"></i><p>Arma la página y aquí aparece lo que falta por hacer en Moodle</p></div>';
            return;
        }

        const partes = [];

        partes.push(`
            <div class="check-bloque">
                <h3><i class="ph ph-numbered-list"></i> Cómo se sube</h3>
                <ol class="pasos">
                    <li>Crea el recurso <strong>Página</strong> en Moodle.</li>
                    <li>En el editor, <strong>arrastra todas las imágenes de un jalón</strong> (con el nombre exacto de la lista de abajo).</li>
                    <li>Abre <strong>código fuente</strong> <code>&lt;/&gt;</code>, borra todo y pega el HTML de la pestaña HTML.</li>
                    <li>Guarda y revisa: los acordeones abren, las ventanas emergentes cierran al hacer clic fuera.</li>
                </ol>
            </div>`);

        const delGuion = imagenesUsadas();
        partes.push(`
            <div class="check-bloque">
                <h3><i class="ph ph-images"></i> Imágenes por subir (${imagenes.size})</h3>
                ${imagenes.size
                ? `<ul class="check-archivos">${[...imagenes].map(a => {
                    const tengo = imagenDelGuion(a);
                    return `<li>${tengo
                        ? `<img class="check-mini" src="${tengo.url}" alt="">`
                        : '<i class="ph ph-file-image"></i>'} <code>${escapar(a)}</code>${tengo ? '' : ' <small>(no venía en el Word)</small>'}</li>`;
                }).join('')}</ul>
                       ${delGuion.length ? '<button id="btn-zip" class="btn-secondary btn-chico"><i class="ph ph-download-simple"></i> Descargar imágenes (.zip)</button>' : ''}
                       <p class="check-nota">Súbelas al editor con <strong>ese mismo nombre</strong>: el HTML las llama por nombre con <code>@@PLUGINFILE@@</code>. Con el .zip las arrastras todas de un jalón.</p>`
                : '<p class="check-nota">Ninguna: la página no usa imágenes propias.</p>'}
            </div>`);

        const conteo = { acordeon: 0, modal: 0, tabla: 0, pestanas: 0 };
        const contar = lista => (lista || []).forEach(b => {
            if (b.tipo in conteo) conteo[b.tipo]++;
            if (b.tipo === 'tarjetas') conteo.modal += (b.items || []).length;
            contar(b.hijos);
            (b.items || []).forEach(i => contar(i.hijos));
        });
        contar(pagina.bloques);
        // Los tooltips en línea no son bloques (viven dentro de un párrafo), así
        // que se cuentan sobre el HTML ya generado.
        const tooltips = (html.match(/details-modal-title/g) || []).length;

        partes.push(`
            <div class="check-bloque">
                <h3><i class="ph ph-eye"></i> Qué revisar ya publicado</h3>
                <ul class="check-archivos">
                    ${conteo.acordeon ? `<li><i class="ph ph-rows"></i> ${conteo.acordeon} acordeón(es): que abran y cierren.</li>` : ''}
                    ${tooltips ? `<li><i class="ph ph-cursor-click"></i> ${tooltips} ventana(s) emergente(s): abren con <code>&lt;details&gt;</code>, sin JavaScript, y cierran al hacer clic en el fondo.</li>` : ''}
                    ${conteo.tabla ? `<li><i class="ph ph-table"></i> ${conteo.tabla} tabla(s): angosta la ventana y confirma que cada fila se vuelve tarjeta con su encabezado.</li>` : ''}
                    ${conteo.pestanas ? `<li><i class="ph ph-browsers"></i> ${conteo.pestanas} juego(s) de pestañas.</li>` : ''}
                    <li><i class="ph ph-palette"></i> Que el color corresponda al aula: la página sale con la clase <code>${pagina.paleta}</code>.</li>
                </ul>
            </div>`);

        // Lo que el guion pidió y sigue sin atenderse (bloques con nota) más
        // las marcas que no se supo traducir. Es la lista de pendientes reales
        // del montaje, no un adorno.
        const pedidos = [];
        const juntarNotas = lista => (lista || []).forEach(b => {
            if (b.indicacion) pedidos.push({ tipo: COMPONENTES[b.tipo].nombre, nota: b.indicacion });
            juntarNotas(b.hijos);
            (b.items || []).forEach(i => juntarNotas(i.hijos));
        });
        juntarNotas(pagina.bloques);

        if (pedidos.length || indicaciones.length) {
            partes.push(`
                <div class="check-bloque">
                    <h3><i class="ph ph-note-pencil"></i> Indicaciones del guion (${pedidos.length + indicaciones.length})</h3>
                    <ul class="check-archivos">
                        ${pedidos.map(p => `<li><i class="ph ph-arrow-right"></i> <strong>${escapar(p.tipo)}:</strong> ${escapar(p.nota)}</li>`).join('')}
                        ${indicaciones.map(t => `<li><i class="ph ph-arrow-right"></i> ${escapar(t)}</li>`).join('')}
                    </ul>
                    <p class="check-nota">Vienen del Word entre &lt; &gt;. No se publican: son lo que producción pidió construir.</p>
                </div>`);
        }

        if (avisos.length) {
            partes.push(`
                <div class="check-bloque">
                    <h3><i class="ph ph-warning"></i> Pendientes (${avisos.length})</h3>
                    <ul class="check-avisos">
                        ${avisos.map(a => `<li class="tono-${a.tono}"><i class="ph ph-${a.tono === 'error' ? 'x-circle' : 'warning-circle'}"></i> ${a.texto}</li>`).join('')}
                    </ul>
                </div>`);
        }

        caja.innerHTML = partes.join('');
        const zip = caja.querySelector('#btn-zip');
        if (zip) zip.addEventListener('click', descargarImagenes);
    }

    /* ---------------------------------------------------------------------
       Lienzo: dibujar los bloques
       --------------------------------------------------------------------- */

    function dibujarTodo() {
        dibujarLienzo();
        refrescarSalida();
    }

    /* Abrir o seleccionar un bloque no cambia el HTML: redibujar solo el lienzo
       evita recargar la vista previa entera (y perder su scroll) por un clic. */
    function dibujarLienzo() {
        $('#titulo-pagina').value = pagina.titulo;
        dibujarPaletaAula();
        const lienzo = $('#lienzo');
        lienzo.innerHTML = '';
        // Con la página vacía manda la pantalla de inicio y la paleta del pie se
        // esconde (no hay bloque debajo del cual insertar). Lo hace el CSS con
        // esta clase; el estado vive aquí porque es el mismo que decide qué se
        // dibuja en el lienzo.
        $('.editor-panel').classList.toggle('sin-bloques', !pagina.bloques.length);
        if (!pagina.bloques.length) {
            lienzo.appendChild(pantallaDeInicio());
        } else {
            dibujarLista(pagina.bloques, lienzo);
        }
    }

    /* ---------------------------------------------------------------------
       Pantalla de inicio: los dos caminos para empezar

       No todos los montajes salen de un Word: a veces se arma la página a mano.
       Antes eso se podía hacer (la paleta siempre estuvo ahí) pero no se veía;
       lo único visible era la zona para soltar el .docx. Aquí se ofrecen los
       dos caminos con el mismo peso, y el de cero arranca con una plantilla
       para no enfrentarse a una hoja en blanco.
       --------------------------------------------------------------------- */

    const PLANTILLAS = [
        {
            // La forma de casi toda actividad de aprendizaje: el párrafo que
            // presenta y la lista numerada dentro de su caja de color.
            nombre: 'Actividad con pasos',
            detalle: 'Lista numerada en su caja',
            mini: MINI.pasos,
            armar: () => [
                Object.assign(crearBloque('texto', false), {
                    texto: 'Para afrontar la situación presentada, realiza la siguiente **actividad.**'
                }),
                Object.assign(crearBloque('pasos', false), {
                    caja: true,
                    items: [
                        { texto: '**Identifica** lo que se te pide en este paso.', hijos: [] },
                        { texto: '**Elabora** lo que corresponda; aquí puedes colgar una tabla o una sublista.', hijos: [] },
                        { texto: '**Guarda** el archivo en tu equipo de la siguiente manera:', hijos: [] }
                    ]
                })
            ]
        },
        {
            nombre: 'Página con acordeón',
            detalle: 'Instrucción + apartados plegables',
            mini: MINI.acordeon,
            armar: () => [
                Object.assign(crearBloque('instruccion', false), {
                    texto: 'Haz clic en las pestañas de este recurso para conocer más información'
                }),
                Object.assign(crearBloque('acordeon', false), {
                    items: ['Primer apartado', 'Segundo apartado', 'Tercer apartado'].map(titulo => ({
                        titulo,
                        hijos: [
                            Object.assign(crearBloque('texto', false), { texto: '¿Pregunta que abre el apartado?', destacado: true }),
                            Object.assign(crearBloque('texto', false), { texto: 'Escribe aquí el contenido.' })
                        ]
                    }))
                })
            ]
        },
        {
            nombre: 'Página con tarjetas',
            detalle: 'Imágenes con botón y su ventana',
            mini: MINI.tarjetas,
            armar: () => [
                Object.assign(crearBloque('texto', false), { texto: 'Texto que presenta las tarjetas.' }),
                Object.assign(crearBloque('instruccion', false), {
                    texto: 'Haz clic en cada botón para conocer más'
                }),
                Object.assign(crearBloque('tarjetas', false), {
                    items: ['Primera', 'Segunda', 'Tercera'].map(n => ({
                        img: '', alt: '', etiqueta: n, titulo: n,
                        hijos: [Object.assign(crearBloque('texto', false), { texto: 'Contenido de la ventana.' })]
                    }))
                })
            ]
        },
        {
            nombre: 'Página con tabla',
            detalle: 'Texto y una tabla responsiva',
            mini: MINI.tabla,
            armar: () => [
                Object.assign(crearBloque('texto', false), { texto: 'Texto que presenta la tabla.' }),
                crearBloque('tabla', false)
            ]
        },
        {
            nombre: 'En blanco',
            detalle: 'Solo un bloque de texto',
            mini: MINI.texto,
            armar: () => [crearBloque('texto', true)]
        }
    ];

    function pantallaDeInicio() {
        const caja = document.createElement('div');
        caja.className = 'inicio';
        caja.innerHTML = `
            <p class="inicio-titulo">¿Cómo quieres empezar?</p>
            <div class="inicio-caminos">
                <button class="camino" type="button" data-camino="word">
                    <i class="ph ph-file-doc"></i>
                    <span class="camino-nombre">Tengo el guion en Word</span>
                    <span class="camino-detalle">Suéltalo aquí o haz clic. Se salta las fichas de control y tú decides qué es cada tabla.</span>
                </button>
                <button class="camino" type="button" data-camino="cero">
                    <i class="ph ph-magic-wand"></i>
                    <span class="camino-nombre">Empezar de cero</span>
                    <span class="camino-detalle">Arma la página pieza por pieza. Elige por dónde arrancar:</span>
                </button>
            </div>
            <div class="inicio-plantillas"></div>`;

        const plantillas = caja.querySelector('.inicio-plantillas');
        PLANTILLAS.forEach(p => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pieza pieza--plantilla';
            b.innerHTML = `<svg viewBox="0 0 40 32" class="pieza-mini" aria-hidden="true">${p.mini}</svg>
                <span>${p.nombre}</span><small>${p.detalle}</small>`;
            b.addEventListener('click', () => {
                guardarHistorial();
                const bloques = p.armar();
                asignarIds(bloques);
                pagina.bloques = pagina.bloques.concat(bloques);
                dibujarTodo();
            });
            plantillas.appendChild(b);
        });

        const alWord = caja.querySelector('[data-camino="word"]');
        alWord.addEventListener('click', () => $('#input-docx').click());
        prepararSoltarDocx(alWord);
        caja.querySelector('[data-camino="cero"]').addEventListener('click', () => {
            plantillas.classList.add('destacadas');
            // En una laptop las plantillas quedan bajo el pliegue del lienzo:
            // sin esto el clic parecía no hacer nada.
            plantillas.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });

        return caja;
    }

    function dibujarLista(lista, contenedor) {
        lista.forEach((bloque, i) => {
            contenedor.appendChild(tarjetaDeBloque(bloque));
            contenedor.appendChild(barraInsertar(lista, i + 1));
        });
        prepararArrastre(contenedor, lista);
    }

    /**
     * Franja "+" entre dos bloques. Sin esto, para meter algo en medio había
     * que seleccionar el bloque de arriba y bajar a la paleta del pie: dos
     * pasos y una regla que hay que recordar. Aquí se inserta donde se ve.
     */
    function barraInsertar(lista, posicion) {
        const barra = document.createElement('div');
        barra.className = 'insertar';

        const mas = document.createElement('button');
        mas.type = 'button';
        mas.className = 'insertar-mas';
        mas.title = 'Insertar aquí';
        mas.innerHTML = '<i class="ph ph-plus"></i>';

        const opciones = document.createElement('div');
        opciones.className = 'insertar-opciones hidden';
        ORDEN_PALETA.forEach(tipo => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mini-btn';
            b.title = COMPONENTES[tipo].nombre;
            b.innerHTML = `<i class="ph ph-${COMPONENTES[tipo].icono}"></i>`;
            b.addEventListener('click', () => {
                guardarHistorial();
                const nuevo = crearBloque(tipo);
                asignarIds([nuevo]);
                lista.splice(posicion, 0, nuevo);
                seleccion = nuevo.id;
                dibujarTodo();
            });
            opciones.appendChild(b);
        });

        mas.addEventListener('click', () => opciones.classList.toggle('hidden'));
        barra.append(mas, opciones);
        return barra;
    }

    /* ---------------------------------------------------------------------
       Acciones estructurales de un bloque

       Las comparten la cabeza de la tarjeta del lienzo y la barra flotante de
       la vista previa: si vivieran por separado, subir desde un lado y desde el
       otro acabarían haciendo cosas distintas. Mover es SIEMPRE dentro de la
       lista de sus hermanos —la que devuelve buscar()—, así que un bloque de un
       acordeón no se sale del acordeón sin querer.
       --------------------------------------------------------------------- */
    function accionDeBloque(accion, id) {
        const sitio = buscar(id);
        if (!sitio) return false;
        const { lista, i, bloque } = sitio;
        // Los topes se revisan ANTES de tocar el historial: subir el primero no
        // cambia nada y no debería gastar un "deshacer".
        if (accion === 'subir' && i === 0) return false;
        if (accion === 'bajar' && i === lista.length - 1) return false;
        guardarHistorial();
        if (accion === 'subir') lista.splice(i - 1, 0, lista.splice(i, 1)[0]);
        if (accion === 'bajar') lista.splice(i + 1, 0, lista.splice(i, 1)[0]);
        if (accion === 'duplicar') {
            const copia = JSON.parse(JSON.stringify(bloque));
            soltarIds([copia]);
            asignarIds([copia]);
            lista.splice(i + 1, 0, copia);
            seleccion = copia.id;
        }
        if (accion === 'borrar') {
            lista.splice(i, 1);
            if (seleccion === id) seleccion = null;
        }
        dibujarTodo();
        return true;
    }

    /* Al duplicar hay que soltar TODOS los ids, no solo el del bloque: la copia
       de un acordeón se llevaba los de sus hijos, y como asignarIds() solo pone
       los que faltan, quedaban dos bloques con el mismo id. buscar() se queda
       con el primero, así que el enlace lienzo↔previa apuntaba al gemelo
       equivocado (y ahora también lo haría la barra flotante). */
    function soltarIds(lista) {
        (lista || []).forEach(b => {
            b.id = null;
            soltarIds(b.hijos);
            (b.items || []).forEach(it => soltarIds(it.hijos));
        });
    }

    function tarjetaDeBloque(bloque) {
        const comp = COMPONENTES[bloque.tipo];
        const card = document.createElement('div');
        // Plegado por omisión: un guion importado deja 20 bloques y con todos
        // los campos abiertos el lienzo era un muro de cajas donde no se
        // distinguía la estructura de la página. Se abre el que se está
        // editando.
        card.className = 'bloque-card' + (seleccion === bloque.id ? ' seleccionado' : '') +
            (bloque.abierto ? ' abierto' : '');
        card.dataset.id = bloque.id;
        card.draggable = false;

        const cabeza = document.createElement('div');
        cabeza.className = 'bloque-cabeza';
        cabeza.innerHTML = `
            <span class="arrastre" title="Arrastra para mover"><i class="ph ph-dots-six-vertical"></i></span>
            <span class="bloque-chip"><i class="ph ph-${comp.icono}"></i></span>
            <span class="bloque-nombre">${comp.nombre}</span>
            <span class="bloque-resumen">${escapar((comp.resumen(bloque) || '').slice(0, 70))}</span>
            <span class="bloque-tools">
                <button class="mini-btn mini-btn--abrir" data-accion="abrir" title="Abrir o cerrar"><i class="ph ph-caret-down"></i></button>
                <button class="mini-btn" data-accion="subir" title="Subir"><i class="ph ph-arrow-up"></i></button>
                <button class="mini-btn" data-accion="bajar" title="Bajar"><i class="ph ph-arrow-down"></i></button>
                <button class="mini-btn" data-accion="duplicar" title="Duplicar"><i class="ph ph-copy"></i></button>
                <button class="mini-btn mini-btn--rojo" data-accion="borrar" title="Quitar"><i class="ph ph-trash"></i></button>
            </span>`;
        card.appendChild(cabeza);

        // El asa de arrastre es lo único que activa el drag: si la tarjeta
        // entera fuera draggable, no se podría seleccionar texto en sus campos.
        const asa = cabeza.querySelector('.arrastre');
        asa.addEventListener('mousedown', () => { card.draggable = true; });
        card.addEventListener('dragend', () => { card.draggable = false; });

        cabeza.addEventListener('click', e => {
            const btn = e.target.closest('[data-accion]');
            if (!btn || btn.dataset.accion === 'abrir') {
                bloque.abierto = !bloque.abierto;
                seleccion = bloque.id;
                dibujarLienzo();
                señalarEnPrevia(bloque.id);
                return;
            }
            accionDeBloque(btn.dataset.accion, bloque.id);
        });

        // La indicación que traía el guion para este bloque ("<Crear un grupo
        // de 5 botones…>"). No sale al HTML: es lo que producción pidió y hay
        // que atender a mano, así que se muestra aquí y no se pierde.
        /* `indicacion`, no `nota`: la nota del bloque de imagen es su pie de
           figura ("Nota. Elaboración propia") y se publica. Cuando compartían
           campo, un `<Figura>` del guion acababa impreso como pie de la imagen. */
        if (bloque.indicacion) {
            const nota = document.createElement('p');
            nota.className = 'bloque-nota';
            nota.innerHTML = `<i class="ph ph-note-pencil"></i> <span>El guion pide: ${escapar(bloque.indicacion)}</span>`;
            card.appendChild(nota);
        }

        if (!bloque.abierto) return card;

        const cuerpo = document.createElement('div');
        cuerpo.className = 'bloque-cuerpo';
        comp.campos.forEach(campo => {
            if (campo.siOculta && campo.siOculta(bloque)) return;
            cuerpo.appendChild(dibujarCampo(campo, bloque, card));
        });
        card.appendChild(cuerpo);
        return card;
    }

    function seleccionar(id) {
        seleccion = seleccion === id ? null : id;
        document.querySelectorAll('.bloque-card').forEach(c =>
            c.classList.toggle('seleccionado', Number(c.dataset.id) === seleccion));
    }

    /* ---------------------------------------------------------------------
       Campos del editor
       --------------------------------------------------------------------- */

    function etiquetaDe(campo) {
        const l = document.createElement('label');
        l.className = 'campo-etiqueta';
        l.textContent = campo.etiqueta;
        return l;
    }

    function ayudaDe(campo) {
        if (!campo.ayuda) return null;
        const p = document.createElement('p');
        p.className = 'campo-ayuda';
        p.textContent = campo.ayuda;
        return p;
    }

    /** Al escribir: modelo + resumen + previa, sin redibujar (no perder el foco). */
    function alEscribir(bloque, k, valor, card) {
        bloque[k] = valor;
        const resumen = card && card.querySelector('.bloque-resumen');
        if (resumen) resumen.textContent = (COMPONENTES[bloque.tipo].resumen(bloque) || '').slice(0, 70);
        programarRefresco();
    }

    function dibujarCampo(campo, bloque, card) {
        const caja = document.createElement('div');
        caja.className = 'campo';

        if (campo.tipo === 'texto' || campo.tipo === 'url') {
            caja.appendChild(etiquetaDe(campo));
            const input = document.createElement('input');
            input.className = 'plain-input';
            input.value = bloque[campo.k] || '';
            input.placeholder = campo.marcador || '';
            input.addEventListener('input', () => alEscribir(bloque, campo.k, input.value, card));
            input.addEventListener('focus', guardarUnaVez);

            // Campo de imagen: miniatura de lo elegido y acceso a la galería
            // del guion. Escribir el nombre a mano sigue siendo válido.
            if (campo.imagen) {
                const fila = document.createElement('div');
                fila.className = 'campo-imagen';
                const img = imagenDelGuion(bloque[campo.k]);
                const miniatura = document.createElement('div');
                miniatura.className = 'miniatura' + (img ? '' : ' miniatura--vacia');
                miniatura.innerHTML = img
                    ? `<img src="${img.url}" alt="${escapar(img.nombre)}">`
                    : '<i class="ph ph-image"></i>';
                const elegir = document.createElement('button');
                elegir.type = 'button';
                elegir.className = 'btn-secondary btn-chico';
                elegir.innerHTML = `<i class="ph ph-images"></i> Elegir del guion${imagenesDocx.length ? ` (${imagenesDocx.length})` : ''}`;
                elegir.addEventListener('click', () => abrirGaleria(v => { bloque[campo.k] = v; }));
                fila.append(miniatura, input, elegir);
                caja.appendChild(fila);
            } else {
                caja.appendChild(input);
            }

            const ay = ayudaDe(campo);
            if (ay) caja.appendChild(ay);
            return caja;
        }

        if (campo.tipo === 'rico') {
            caja.appendChild(etiquetaDe(campo));
            const area = document.createElement('textarea');
            area.className = 'plain-input area-rica';
            area.rows = campo.filas || 3;
            area.value = bloque[campo.k] || '';
            area.placeholder = campo.marcador || '';
            area.addEventListener('input', () => alEscribir(bloque, campo.k, area.value, card));
            area.addEventListener('focus', guardarUnaVez);
            caja.appendChild(barraDeMarcas(area, bloque, campo.k, card));
            caja.appendChild(area);
            return caja;
        }

        if (campo.tipo === 'check') {
            const l = document.createElement('label');
            l.className = 'toggle-switch';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = Boolean(bloque[campo.k]);
            input.addEventListener('change', () => {
                guardarHistorial();
                bloque[campo.k] = input.checked;
                refrescarSalida();
            });
            const s = document.createElement('span');
            s.className = 'slider';
            const t = document.createElement('span');
            t.className = 'label-text';
            t.textContent = campo.etiqueta;
            l.append(input, s, t);
            caja.appendChild(l);
            return caja;
        }

        if (campo.tipo === 'opciones') {
            caja.appendChild(etiquetaDe(campo));
            const grupo = document.createElement('div');
            grupo.className = 'opciones';
            campo.ops.forEach(op => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'opcion' + (bloque[campo.k] === op.v ? ' activa' : '');
                b.innerHTML = (op.icono ? `<i class="ph ph-${op.icono}"></i>` : '') + `<span>${op.etiqueta}</span>`;
                b.addEventListener('click', () => {
                    guardarHistorial();
                    bloque[campo.k] = op.v;
                    dibujarTodo();
                });
                grupo.appendChild(b);
            });
            caja.appendChild(grupo);
            return caja;
        }

        if (campo.tipo === 'renglones') {
            caja.appendChild(etiquetaDe(campo));
            const area = document.createElement('textarea');
            area.className = 'plain-input area-rica';
            area.rows = Math.max(3, (bloque[campo.k] || []).length + 1);
            area.value = (bloque[campo.k] || []).join('\n');
            area.placeholder = campo.marcador || '';
            area.addEventListener('input', () =>
                alEscribir(bloque, campo.k, area.value.split('\n'), card));
            area.addEventListener('focus', guardarUnaVez);
            caja.appendChild(barraDeMarcas(area, bloque, campo.k, card, true));
            caja.appendChild(area);
            return caja;
        }

        if (campo.tipo === 'rejilla') return rejillaDeTabla(bloque, card);
        if (campo.tipo === 'repetible') return repetible(campo, bloque);
        if (campo.tipo === 'hijos') return lienzoHijo(bloque, campo.etiqueta);

        return caja;
    }

    /* Barra de formato: inserta las marcas para que nadie tenga que aprenderlas. */
    function barraDeMarcas(area, bloque, k, card, esRenglones) {
        const barra = document.createElement('div');
        barra.className = 'barra-marcas';
        const marcasBotones = [
            { i: 'text-b', t: 'Negritas', a: '**', b: '**' },
            { i: 'text-italic', t: 'Cursivas', a: '*', b: '*' },
            { i: 'highlighter', t: 'Resaltado', a: '==', b: '==' },
            { i: 'link', t: 'Enlace', a: '[', b: '](https://)' },
            { i: 'cursor-click', t: 'Ventana emergente sobre la palabra', a: '{{', b: '|Título|Explicación}}' }
        ];
        marcasBotones.forEach(m => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mini-btn';
            b.title = m.t;
            b.innerHTML = `<i class="ph ph-${m.i}"></i>`;
            b.addEventListener('click', () => {
                guardarHistorial();
                const ini = area.selectionStart, fin = area.selectionEnd;
                const sel = area.value.slice(ini, fin) || 'texto';
                area.value = area.value.slice(0, ini) + m.a + sel + m.b + area.value.slice(fin);
                area.focus();
                area.selectionStart = ini + m.a.length;
                area.selectionEnd = ini + m.a.length + sel.length;
                alEscribir(bloque, k, esRenglones ? area.value.split('\n') : area.value, card);
            });
            barra.appendChild(b);
        });

        // Las marcas también se pueden teclear; el "?" enseña cuáles son sin
        // obligar a leer un manual.
        const ayuda = document.createElement('button');
        ayuda.type = 'button';
        ayuda.className = 'mini-btn mini-btn--ayuda';
        ayuda.title = 'Cómo se escribe';
        ayuda.innerHTML = '<i class="ph ph-question"></i>';
        const leyenda = document.createElement('p');
        leyenda.className = 'marcas-ayuda hidden';
        leyenda.innerHTML = '<code>**negritas**</code> · <code>*cursivas*</code> · ' +
            '<code>==resaltado==</code> · <code>[texto](liga)</code> · ' +
            '<code>{{palabra|Título|Explicación}}</code> abre una ventana. ' +
            'Una línea en blanco separa párrafos.';
        ayuda.addEventListener('click', () => leyenda.classList.toggle('hidden'));
        barra.appendChild(ayuda);

        const envoltura = document.createElement('div');
        envoltura.className = 'marcas-caja';
        envoltura.append(barra, leyenda);
        return envoltura;
    }

    /* Rejilla de la tabla: encabezados + celdas, con botones para filas/columnas. */
    function rejillaDeTabla(bloque, card) {
        const caja = document.createElement('div');
        caja.className = 'campo';
        const tabla = document.createElement('table');
        tabla.className = 'rejilla';

        const thead = document.createElement('thead');
        const trh = document.createElement('tr');
        (bloque.encabezados || []).forEach((t, c) => {
            const th = document.createElement('th');
            const inp = document.createElement('input');
            inp.value = t;
            inp.placeholder = `Columna ${c + 1}`;
            inp.addEventListener('input', () => {
                bloque.encabezados[c] = inp.value;
                programarRefresco();
            });
            inp.addEventListener('focus', guardarUnaVez);
            const quitar = document.createElement('button');
            quitar.className = 'mini-btn mini-btn--rojo';
            quitar.title = 'Quitar columna';
            quitar.innerHTML = '<i class="ph ph-x"></i>';
            quitar.addEventListener('click', () => {
                guardarHistorial();
                bloque.encabezados.splice(c, 1);
                (bloque.filas || []).forEach(f => f.splice(c, 1));
                dibujarTodo();
            });
            th.append(inp, quitar);
            trh.appendChild(th);
        });
        thead.appendChild(trh);
        tabla.appendChild(thead);

        const tbody = document.createElement('tbody');
        (bloque.filas || []).forEach((fila, f) => {
            const tr = document.createElement('tr');
            (bloque.encabezados || []).forEach((_, c) => {
                const td = document.createElement('td');
                const inp = document.createElement('input');
                inp.value = fila[c] || '';
                inp.addEventListener('input', () => {
                    fila[c] = inp.value;
                    programarRefresco();
                });
                inp.addEventListener('focus', guardarUnaVez);
                td.appendChild(inp);
                tr.appendChild(td);
            });
            const tdQuitar = document.createElement('td');
            tdQuitar.className = 'rejilla-quitar';
            const quitar = document.createElement('button');
            quitar.className = 'mini-btn mini-btn--rojo';
            quitar.title = 'Quitar fila';
            quitar.innerHTML = '<i class="ph ph-trash"></i>';
            quitar.addEventListener('click', () => {
                guardarHistorial();
                bloque.filas.splice(f, 1);
                dibujarTodo();
            });
            tdQuitar.appendChild(quitar);
            tr.appendChild(tdQuitar);
            tbody.appendChild(tr);
        });
        tabla.appendChild(tbody);

        const acciones = document.createElement('div');
        acciones.className = 'rejilla-acciones';
        const bFila = document.createElement('button');
        bFila.className = 'btn-secondary btn-chico';
        bFila.innerHTML = '<i class="ph ph-plus"></i> Fila';
        bFila.addEventListener('click', () => {
            guardarHistorial();
            bloque.filas.push(bloque.encabezados.map(() => ''));
            dibujarTodo();
        });
        const bCol = document.createElement('button');
        bCol.className = 'btn-secondary btn-chico';
        bCol.innerHTML = '<i class="ph ph-plus"></i> Columna';
        bCol.addEventListener('click', () => {
            guardarHistorial();
            bloque.encabezados.push(`Columna ${bloque.encabezados.length + 1}`);
            bloque.filas.forEach(f => f.push(''));
            dibujarTodo();
        });
        acciones.append(bFila, bCol);

        const envoltura = document.createElement('div');
        envoltura.className = 'rejilla-scroll';
        envoltura.appendChild(tabla);
        caja.append(envoltura, acciones);
        return caja;
    }

    /* Lista repetible (apartados del acordeón, tarjetas, pestañas). */
    function repetible(campo, bloque) {
        const caja = document.createElement('div');
        caja.className = 'campo';
        caja.appendChild(etiquetaDe(campo));

        (bloque[campo.k] || []).forEach((item, i) => {
            const ficha = document.createElement('div');
            ficha.className = 'ficha';
            const cabeza = document.createElement('div');
            cabeza.className = 'ficha-cabeza';
            // `texto` es para los pasos de la actividad, que no tienen título:
            // sin esto todas las fichas se leerían "Paso" y no se distinguirían.
            const nombreDe = it => (it.titulo || it.etiqueta || (it.texto || '').replace(/\*\*/g, '').slice(0, 48) || campo.nombreItem);
            cabeza.innerHTML = `<span class="ficha-num">${i + 1}</span><span class="ficha-nombre">${escapar(nombreDe(item))}</span>`;

            const tools = document.createElement('span');
            tools.className = 'bloque-tools';
            [['arrow-up', 'subir'], ['arrow-down', 'bajar'], ['trash', 'borrar']].forEach(([ic, ac]) => {
                const b = document.createElement('button');
                b.className = 'mini-btn' + (ac === 'borrar' ? ' mini-btn--rojo' : '');
                b.innerHTML = `<i class="ph ph-${ic}"></i>`;
                b.title = ac;
                b.addEventListener('click', () => {
                    guardarHistorial();
                    const arr = bloque[campo.k];
                    if (ac === 'subir' && i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
                    if (ac === 'bajar' && i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]);
                    if (ac === 'borrar') arr.splice(i, 1);
                    dibujarTodo();
                });
                tools.appendChild(b);
            });
            cabeza.appendChild(tools);
            ficha.appendChild(cabeza);

            campo.campos.forEach(sub => {
                const c = dibujarCampo(sub, item, null);
                c.querySelectorAll('input, textarea').forEach(inp => {
                    inp.addEventListener('input', () => {
                        cabeza.querySelector('.ficha-nombre').textContent = nombreDe(item);
                    });
                });
                ficha.appendChild(c);
            });

            if (campo.hijos) {
                item.hijos = item.hijos || [];
                ficha.appendChild(lienzoHijo(item, 'Contenido'));
            }
            caja.appendChild(ficha);
        });

        const agregar = document.createElement('button');
        agregar.className = 'btn-secondary btn-chico';
        agregar.innerHTML = `<i class="ph ph-plus"></i> Agregar ${campo.nombreItem.toLowerCase()}`;
        agregar.addEventListener('click', () => {
            guardarHistorial();
            bloque[campo.k] = bloque[campo.k] || [];
            bloque[campo.k].push(campo.nuevo());
            dibujarTodo();
        });
        caja.appendChild(agregar);
        return caja;
    }

    /* Lienzo anidado: los bloques que van DENTRO de un acordeón, ventana… */
    function lienzoHijo(contenedor, etiqueta) {
        contenedor.hijos = contenedor.hijos || [];
        const caja = document.createElement('div');
        caja.className = 'campo lienzo-hijo';

        const cabeza = document.createElement('div');
        cabeza.className = 'lienzo-hijo-cabeza';
        cabeza.innerHTML = `<span class="campo-etiqueta">${escapar(etiqueta)}</span>`;
        const agregar = document.createElement('div');
        agregar.className = 'mini-paleta';
        ORDEN_PALETA.filter(t => t !== 'titulo').forEach(tipo => {
            const b = document.createElement('button');
            b.className = 'mini-btn';
            b.title = COMPONENTES[tipo].nombre;
            b.innerHTML = `<i class="ph ph-${COMPONENTES[tipo].icono}"></i>`;
            b.addEventListener('click', () => {
                guardarHistorial();
                const nuevo = crearBloque(tipo);
                asignarIds([nuevo]);
                contenedor.hijos.push(nuevo);
                dibujarTodo();
            });
            agregar.appendChild(b);
        });
        cabeza.appendChild(agregar);
        caja.appendChild(cabeza);

        const zona = document.createElement('div');
        zona.className = 'zona-hijos';
        if (!contenedor.hijos.length) {
            zona.innerHTML = '<p class="zona-vacia">Vacío. Agrega texto, una imagen, una tabla…</p>';
        } else {
            dibujarLista(contenedor.hijos, zona);
        }
        caja.appendChild(zona);
        return caja;
    }

    /* Un solo snapshot por ráfaga de tecleo (si no, deshacer iría letra a letra). */
    let guardadoReciente = false;
    function guardarUnaVez() {
        if (guardadoReciente) return;
        guardarHistorial();
        guardadoReciente = true;
        setTimeout(() => { guardadoReciente = false; }, 1500);
    }

    /* ---------------------------------------------------------------------
       Arrastrar para reordenar
       --------------------------------------------------------------------- */

    function prepararArrastre(contenedor, lista) {
        let origen = null;

        contenedor.addEventListener('dragstart', e => {
            const card = e.target.closest('.bloque-card');
            if (!card || card.parentElement !== contenedor) return;
            origen = card;
            card.classList.add('arrastrando');
            e.dataTransfer.effectAllowed = 'move';
            // Firefox no inicia el arrastre sin datos.
            e.dataTransfer.setData('text/plain', card.dataset.id);
            e.stopPropagation();
        });

        contenedor.addEventListener('dragover', e => {
            if (!origen || origen.parentElement !== contenedor) return;
            e.preventDefault();
            const hermanos = [...contenedor.querySelectorAll(':scope > .bloque-card:not(.arrastrando)')];
            const siguiente = hermanos.find(c => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
            contenedor.insertBefore(origen, siguiente || null);
        });

        contenedor.addEventListener('drop', e => {
            if (!origen || origen.parentElement !== contenedor) return;
            e.preventDefault();
            e.stopPropagation();
            guardarHistorial();
            const orden = [...contenedor.querySelectorAll(':scope > .bloque-card')].map(c => Number(c.dataset.id));
            lista.sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id));
            origen.classList.remove('arrastrando');
            origen = null;
            dibujarTodo();
        });

        contenedor.addEventListener('dragend', () => {
            if (origen) origen.classList.remove('arrastrando');
            origen = null;
        });
    }

    /* ---------------------------------------------------------------------
       Paletas: aula y componentes
       --------------------------------------------------------------------- */

    function dibujarPaletaAula() {
        const caja = $('#modulos');
        if (caja.childElementCount) {
            caja.querySelectorAll('.modulo').forEach(b =>
                b.classList.toggle('activo', b.dataset.clase === pagina.paleta));
            return;
        }
        PALETAS.forEach(p => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'modulo' + (p.clase === pagina.paleta ? ' activo' : '');
            b.dataset.clase = p.clase;
            b.title = `${p.nombre} (clase ${p.clase})`;
            b.innerHTML = `<span class="modulo-color" style="background:${p.color}"></span><span>${p.clase}</span>`;
            b.addEventListener('click', () => {
                guardarHistorial();
                pagina.paleta = p.clase;
                dibujarTodo();
            });
            caja.appendChild(b);
        });
    }

    function dibujarPaletaComponentes() {
        const caja = $('#paleta');
        ORDEN_PALETA.forEach(tipo => {
            const comp = COMPONENTES[tipo];
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'pieza';
            b.title = comp.ayuda;
            b.innerHTML = `
                <svg viewBox="0 0 40 32" class="pieza-mini" aria-hidden="true">${comp.mini}</svg>
                <span>${comp.nombre}</span>`;
            b.addEventListener('click', () => agregarBloque(tipo));
            caja.appendChild(b);
        });
    }

    /** Inserta después del bloque seleccionado; sin selección, al final. */
    function agregarBloque(tipo) {
        guardarHistorial();
        const nuevo = crearBloque(tipo);
        asignarIds([nuevo]);
        const destino = seleccion && buscar(seleccion);
        if (destino) destino.lista.splice(destino.i + 1, 0, nuevo);
        else pagina.bloques.push(nuevo);
        seleccion = nuevo.id;
        dibujarTodo();
        const card = document.querySelector(`.bloque-card[data-id="${nuevo.id}"]`);
        if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    /* ---------------------------------------------------------------------
       Importar el guion (.docx)
       --------------------------------------------------------------------- */

    let propuesta = null;   // { bloquesWord, tablas: [{indice, filas, decision}] }

    /* ---------------------------------------------------------------------
       Imágenes del Word

       El guion trae las imágenes adentro. Sin esto había que teclear el nombre
       del archivo a mano y adivinar cuál iba en cada figura, que era lo único
       que obligaba a salirse de la herramienta.
       --------------------------------------------------------------------- */

    async function cargarImagenes(file) {
        imagenesDocx.forEach(i => URL.revokeObjectURL(i.url));
        imagenesDocx = [];
        const mapa = await leerImagenesDeDocx(file);
        const vistos = new Set();
        for (const { nombre, blob } of mapa.values()) {
            // El mismo archivo puede venir referenciado por varios rId.
            if (vistos.has(nombre)) continue;
            vistos.add(nombre);
            imagenesDocx.push({
                nombre,
                url: URL.createObjectURL(blob),
                bytes: new Uint8Array(await blob.arrayBuffer())
            });
        }
    }

    /** ¿Ese valor de campo apunta a una imagen que trajimos del Word? */
    function imagenDelGuion(valor) {
        const nombre = String(valor || '').replace('@@PLUGINFILE@@/', '').trim();
        return imagenesDocx.find(i => i.nombre === nombre) || null;
    }

    /* La galería se abre desde un campo concreto y le devuelve el nombre. */
    let campoEsperandoImagen = null;

    function abrirGaleria(alElegir) {
        campoEsperandoImagen = alElegir;
        const caja = $('#galeria');
        caja.innerHTML = '';
        if (!imagenesDocx.length) {
            caja.innerHTML = '<p class="check-nota">Este guion no traía imágenes, o todavía no subes el Word. ' +
                'Puedes escribir el nombre del archivo a mano: <code>@@PLUGINFILE@@/imagen.png</code>.</p>';
        }
        imagenesDocx.forEach(img => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'galeria-item';
            b.innerHTML = `<img src="${img.url}" alt=""><span>${escapar(img.nombre)}</span>`;
            b.addEventListener('click', () => {
                cerrarGaleria(`@@PLUGINFILE@@/${img.nombre}`);
            });
            caja.appendChild(b);
        });
        $('#modal-galeria').classList.remove('hidden');
    }

    function cerrarGaleria(valor) {
        if (valor !== undefined && campoEsperandoImagen) {
            guardarHistorial();
            campoEsperandoImagen(valor);
            dibujarTodo();
        }
        campoEsperandoImagen = null;
        $('#modal-galeria').classList.add('hidden');
    }

    /** Nombres de archivo que la página pide y sí tenemos del Word. */
    function imagenesUsadas() {
        const nombres = new Set();
        const recorrer = lista => (lista || []).forEach(b => {
            [b.src, b.icono, ...(b.items || []).map(i => i.img)].forEach(v => {
                const img = imagenDelGuion(v);
                if (img) nombres.add(img.nombre);
            });
            recorrer(b.hijos);
            (b.items || []).forEach(i => recorrer(i.hijos));
        });
        recorrer(pagina.bloques);
        return [...nombres].map(n => imagenesDocx.find(i => i.nombre === n));
    }

    /** Descarga las imágenes que usa la página, listas para arrastrarlas. */
    function descargarImagenes() {
        const usadas = imagenesUsadas();
        if (!usadas.length) return;
        const url = URL.createObjectURL(
            armarZipStored(usadas.map(i => ({ nombre: i.nombre, datos: i.bytes }))));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'imagenes-de-la-pagina.zip';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    /** Deja soltar el .docx sobre un elemento (la tarjeta de inicio). */
    function prepararSoltarDocx(zona) {
        ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault();
            zona.classList.add('camino--activo');
        }));
        ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault();
            zona.classList.remove('camino--activo');
        }));
        zona.addEventListener('drop', e => {
            const file = e.dataTransfer.files[0];
            if (file && file.name.toLowerCase().endsWith('.docx')) importarDocx(file);
        });
    }

    async function importarDocx(file) {
        const info = $('#import-info');
        info.classList.remove('hidden');
        info.textContent = 'Leyendo el guion…';
        try {
            const crudos = await leerBloquesDeDocx(file);
            await cargarImagenes(file);
            const desde = inicioDelContenido(crudos);
            const utiles = crudos.slice(desde);
            propuesta = {
                bloques: utiles,
                // Las tablas de una sola celda son las barras de título del
                // guion, no contenido: no se pregunta por ellas, se vuelven
                // título solas. Preguntar por 15 barras cansaría al usuario y
                // es justo lo que la herramienta debe ahorrarle.
                tablas: utiles.map((b, i) => ({ i, b }))
                    .filter(x => x.b.tipo === 'tabla' && x.b.celdas > 1 && (x.b.filas || []).length > 1)
            };
            info.textContent = `${utiles.length} elementos leídos, ${propuesta.tablas.length} tablas por decidir` +
                `${imagenesDocx.length ? `, ${imagenesDocx.length} imágenes disponibles` : ''}. ` +
                `Se saltaron ${desde} elementos de control editorial.`;
            if (propuesta.tablas.length) abrirAsistente();
            else aplicarImportacion();
        } catch (err) {
            info.textContent = 'No se pudo leer el archivo: ' + err.message;
        }
    }

    /**
     * Dónde empieza lo que sí va a Moodle.
     *
     * Los guiones traen fichas de control editorial arriba (datos del autor,
     * revisiones, indicaciones internas) y todas son tablas. El contenido
     * publicable arranca en el TÍTULO, que en estos guiones es la primera tabla
     * de una sola celda con texto (la barra sombreada) o, si no hay, el primer
     * párrafo con texto tras las fichas. Igual que en el Integrador HTML.
     */
    function inicioDelContenido(bloques) {
        const barra = bloques.findIndex(b =>
            b.tipo === 'tabla' && b.celdas === 1 && (b.texto || '').trim());
        if (barra >= 0) return barra;
        const ficha = bloques.findIndex(b => b.tipo !== 'tabla' && (b.texto || '').trim());
        return ficha > 0 ? ficha : 0;
    }

    /* ---- Asistente: qué es cada tabla ---- */

    const DECISIONES = [
        { v: 'tabla', nombre: 'Tabla', mini: MINI.tabla, ayuda: 'Se queda como tabla, ya responsiva' },
        { v: 'acordeon', nombre: 'Acordeón', mini: MINI.acordeon, ayuda: 'Cada fila es un apartado plegable' },
        { v: 'tarjetas', nombre: 'Tarjetas', mini: MINI.tarjetas, ayuda: 'Cada fila es una tarjeta con ventana' },
        { v: 'texto', nombre: 'Texto', mini: MINI.texto, ayuda: 'Solo el contenido, sin tabla' },
        { v: 'omitir', nombre: 'No va', mini: MINI.separador, ayuda: 'Es una indicación interna del guion' }
    ];

    function abrirAsistente() {
        const caja = $('#import-tablas');
        caja.innerHTML = '';
        propuesta.tablas.forEach(t => {
            t.decision = sugerir(t.b);
            const filas = t.b.filas || [];
            const ficha = document.createElement('div');
            ficha.className = 'import-ficha';
            ficha.innerHTML = `
                <div class="import-previa">
                    <table>${filas.slice(0, 4).map((f, i) => `<tr>${f.slice(0, 4).map(c =>
                `<${i === 0 ? 'th' : 'td'}>${escapar((c.texto || '').slice(0, 60))}</${i === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>
                    <p class="import-meta">${filas.length} filas × ${(filas[0] || []).length} columnas${filas.length > 4 ? ' (se muestran 4)' : ''}</p>
                </div>
                <div class="import-opciones"></div>`;
            const ops = ficha.querySelector('.import-opciones');
            DECISIONES.forEach(d => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'pieza pieza--chica' + (d.v === t.decision ? ' activa' : '');
                b.title = d.ayuda;
                b.innerHTML = `<svg viewBox="0 0 40 32" class="pieza-mini" aria-hidden="true">${d.mini}</svg><span>${d.nombre}</span>`;
                b.addEventListener('click', () => {
                    t.decision = d.v;
                    ops.querySelectorAll('.pieza').forEach(x => x.classList.remove('activa'));
                    b.classList.add('activa');
                });
                ops.appendChild(b);
            });
            caja.appendChild(ficha);
        });
        $('#modal-import').classList.remove('hidden');
    }

    /**
     * Sugerencia inicial del asistente. Reconoce primero los encabezados que
     * usan los guiones instruccionales (son fijos) y solo después adivina por
     * forma; así la propuesta acierta en el caso normal.
     */
    function sugerir(t) {
        const filas = t.filas || [];
        const cols = (filas[0] || []).length;
        const enc = (filas[0] || []).map(c => (c.texto || '').toLowerCase()).join(' | ');

        // "Pestaña | Contenido" es la tabla que arma las secciones del recurso.
        if (/pesta[ñn]a/.test(enc) && /contenido/.test(enc)) return 'acordeon';
        // "Botón | Información" es el grupo de botones con su ventana emergente.
        if (/bot[oó]n/.test(enc) && /(informaci[oó]n|contenido)/.test(enc)) return 'tarjetas';

        if (cols === 1) return 'texto';
        // Dos columnas con textos largos a la derecha suelen ser "concepto →
        // explicación": eso en la página se monta como acordeón. El umbral de
        // 120 caracteres salió de medir guiones reales.
        const largo = filas.reduce((m, f) => Math.max(m, ...f.map(c => (c.texto || '').length)), 0);
        /* Pero un acordeón necesita títulos: si la 1ª columna son solo marcas de
           montaje (`<Figura>`), al quitarlas no queda nada que titular y lo que
           hay en realidad es una tabla de imagen + explicación —así se publica
           la de "los alquimistas"—. Sin este filtro salía un acordeón de
           apartados sin nombre. */
        const conTitulo = filas.slice(1).filter(f => sinMarcas((f[0] || {}).texto)).length;
        if (cols === 2 && largo > 120 && conTitulo === filas.length - 1) return 'acordeon';
        return 'tabla';
    }

    /* ------------------------------------------------------------------
       Marcas de montaje del guion

       En el Word, producción escribe entre < > lo que hay que construir:
       <Figura>, <Tabla>, <Pop-up>, <Crear un grupo de 5 botones…>, y abre y
       cierra las cajas de instrucción con <Texto regular en negritas con ícono
       de interactividad a la izquierda> … <Termina …>.

       Esas marcas NO son contenido publicable: si se dejan en el texto salen
       impresas en la página (fue lo primero que se vio mal). Pero tampoco se
       tiran: cada una se vuelve el bloque vacío que corresponde y se guarda
       como `nota` para que en el editor se lea "El guion pide: …".
       ------------------------------------------------------------------ */

    const MARCA = /^[<«]\s*(.+?)\s*[>»]$/;

    function bloquesDesdeLineas(lineas, sueltas, permitirDestacado) {
        const salida = [];
        let acumulado = [];
        let enInstruccion = false;
        let enCentrado = false;
        let primero = permitirDestacado !== false;

        const cerrar = () => {
            const texto = acumulado.join('\n\n').trim();
            acumulado = [];
            if (!texto) return;
            if (enCentrado) {
                salida.push(Object.assign(crearBloque('texto', false), { texto, centrado: true }));
                primero = false;
                return;
            }
            if (enInstruccion) {
                // La caja ya destaca sola; si el guion trae TODA la frase en
                // negritas, sobra el <strong> encima (así se publica en las
                // páginas de referencia).
                salida.push(Object.assign(crearBloque('instruccion', false), {
                    texto: texto.replace(/^\*\*([\s\S]+)\*\*$/, '$1').trim()
                }));
                return;
            }
            // El primer párrafo corto de un apartado es la pregunta que lo
            // abre: en las páginas publicadas va centrada y en negritas.
            const destacado = primero && texto.length < 160 && !texto.includes('\n');
            salida.push(Object.assign(crearBloque('texto', false), { texto, destacado }));
            primero = false;
        };

        (lineas || []).forEach(linea => {
            // Las marcas suelen venir dentro de un run en negritas, así que el
            // renglón llega como `**<Figura>**`. Para reconocerlas hay que
            // quitar los asteriscos primero; el texto normal sí las conserva.
            const m = linea.replace(/\*\*/g, '').trim().match(MARCA);
            if (!m) {
                /* "Figura 1. …" y "Nota. Elaboración propia (2026)." no son
                   párrafos de la página: son el encabezado y el pie de la figura
                   de arriba, y así se publican (.card-header.notas-tabla y
                   .text-muted). Sueltos salían como dos párrafos más debajo de la
                   imagen. Solo cuenta si vienen pegados a la figura, sin ningún
                   párrafo en medio. */
                if (!acumulado.length && !enInstruccion && !enCentrado) {
                    const ultimo = salida[salida.length - 1];
                    const limpio = linea.replace(/\*\*/g, '').trim();
                    if (ultimo && ultimo.tipo === 'imagen') {
                        if (!ultimo.pie && /^(figura|imagen|gr[áa]fic\w*)\s*\d*\s*[.:]/i.test(limpio)) { ultimo.pie = limpio; return; }
                        if (!ultimo.nota && /^nota\s*[.:]/i.test(limpio)) { ultimo.nota = limpio; return; }
                    }
                }
                // Los números sueltos que deja Word al anclar una imagen
                // (5715019050 y parecidos) no son texto del guion.
                if (!/^\d{6,}$/.test(linea)) acumulado.push(linea);
                return;
            }

            const marca = m[1];
            const clave = marca.toLowerCase();

            if (/^termina/.test(clave)) { cerrar(); enInstruccion = false; enCentrado = false; return; }

            cerrar();

            if (/interactividad|ícono de interactividad|icono de interactividad/.test(clave)) {
                enInstruccion = true;
                return;
            }
            // Nomenclaturas y ejemplos: van centrados, sin forzar negritas (las
            // que traiga el Word se respetan).
            if (/texto regular centrado/.test(clave)) {
                enCentrado = true;
                return;
            }
            if (/^h[1-4]$/.test(clave)) return;                    // ya es el título
            if (/^figura/.test(clave)) {
                salida.push(Object.assign(crearBloque('imagen', false),
                    { indicacion: marca, lado: 'sola' }));
                return;
            }
            if (/grupo de\s+(\d+)\s+bot/.test(clave)) {
                const cuantos = Number(RegExp.$1) || 2;
                const items = Array.from({ length: cuantos }, (_, i) => ({
                    img: '', alt: '', etiqueta: `Botón ${i + 1}`, titulo: `Botón ${i + 1}`, hijos: []
                }));
                salida.push(Object.assign(crearBloque('tarjetas', false), { items, indicacion: marca }));
                return;
            }
            if (/^tabla/.test(clave)) {
                salida.push(Object.assign(crearBloque('tabla', false), { indicacion: marca }));
                return;
            }
            if (/pop-?up|ventana/.test(clave)) {
                salida.push(Object.assign(crearBloque('modal', false), { indicacion: marca }));
                return;
            }
            if (/v[ií]deo/.test(clave)) {
                salida.push(Object.assign(crearBloque('video', false), { indicacion: marca }));
                return;
            }
            // Marca que no se sabe traducir: se anota aparte para que alguien
            // la lea, en vez de dejarla impresa en la página.
            if (sueltas) sueltas.push(marca);
        });

        cerrar();
        return salida;
    }

    /**
     * Quita las marcas de montaje de un texto de una línea (títulos, celdas).
     * También los `** **` vacíos: el lector de Word marca las negritas con
     * asteriscos y un run en negritas que solo trae un espacio deja ese
     * fantasma, que se vería como asteriscos sueltos en la página.
     */
    function sinMarcas(texto) {
        return String(texto || '')
            .replace(/[<«][^<>«»]*[>»]/g, ' ')
            .replace(/\*\*\s*\*\*/g, ' ')
            .replace(/^Pesta[ñn]a\s*\d+\s*/i, '')
            .replace(/\s+/g, ' ').trim();
    }

    /**
     * Arma la página con lo que se leyó del Word.
     *
     * Lo que hace que esto no sea un recorrido plano son las REGIONES que el
     * guion abre y cierra con sus marcas, sobre todo `<Lista numerada; son las
     * instrucciones>`: mientras está abierta, la página no es una sucesión de
     * bloques hermanos sino una caja con pasos, y lo que viene indentado cuelga
     * DEL PASO EN CURSO (la tabla del paso 5, la sublista a, b, c del 6, la
     * nomenclatura centrada del 7). Aplanarlo era el error visible: la tabla
     * salía después de la lista, el guion perdía el orden y encima aparecía una
     * tabla vacía extra por la marca `<Tabla>`.
     *
     * Quién decide si un párrafo cuelga del paso o ya salió de la caja: la
     * SANGRÍA de Word (`w:ind`). Los pasos y su contenido vienen a 720 twips; el
     * "Nota: al nombrar tu archivo…" viene a 0 y en el montaje real va fuera de
     * la caja. No es una corazonada: es el dato con el que Word lo dibuja.
     */
    function aplicarImportacion() {
        guardarHistorial();
        const decisiones = new Map((propuesta.tablas || []).map(t => [t.i, t.decision]));
        tablasConsumidas = new Set();
        decisionesTabla = new Map((propuesta.tablas || []).map(t => [t.b, t.decision]));
        const nuevos = [];
        const sueltas = [];
        let sueltos = [];         // líneas de párrafos seguidos, aún sin cerrar
        let listaActual = null;

        let pasos = null;         // bloque `pasos` abierto por la marca del guion
        let paso = null;          // último punto de la lista, para colgarle cosas
        let idPasos = null;       // el numId de Word que numera los pasos
        let subLista = null;      // sublista a, b, c del paso en curso
        let centrado = false;     // dentro de <Texto regular centrado>
        let tablaPendiente = null; // marca <Tabla> esperando la tabla de verdad
        let tituloTabla = '';     // el encabezado que venía junto a esa tabla

        // Dentro de un paso todo cuelga de él; fuera, va al cuerpo de la página.
        const empujarDestino = b => {
            [].concat(b).filter(Boolean).forEach(x => {
                asignarIds([x]);
                if (paso) paso.hijos.push(x); else nuevos.push(x);
            });
            listaActual = null;
        };

        // Los párrafos de primer nivel también traen marcas de montaje (la caja
        // "Haz clic en las pestañas…" del recurso de referencia vive ahí, no
        // dentro de la tabla), así que pasan por el mismo intérprete.
        const vaciarSueltos = () => {
            if (!sueltos.length) return;
            const bloques = bloquesDesdeLineas(sueltos, sueltas, false);
            sueltos = [];
            if (centrado) bloques.forEach(b => { if (b.tipo === 'texto') b.centrado = true; });
            empujarDestino(bloques);
        };

        const empujar = b => { vaciarSueltos(); empujarDestino(b); };

        const cerrarSubLista = () => { subLista = null; };

        // Una marca <Tabla> que nunca recibió su tabla sigue siendo un pendiente
        // del montaje: se queda como tabla vacía con la nota, como antes.
        const resolverTablaPendiente = () => {
            if (!tablaPendiente) return;
            const indicacion = tablaPendiente, titulo = tituloTabla;
            tablaPendiente = null; tituloTabla = '';
            empujar(Object.assign(crearBloque('tabla', false), { indicacion, titulo }));
        };

        const abrirPasos = () => {
            vaciarSueltos();
            cerrarSubLista();
            paso = null; idPasos = null;
            pasos = Object.assign(crearBloque('pasos', false), { caja: true, items: [] });
            asignarIds([pasos]);
            nuevos.push(pasos);
            listaActual = null;
        };

        const cerrarPasos = () => {
            vaciarSueltos();          // lo que quede es del último paso
            cerrarSubLista();
            pasos = null; paso = null; idPasos = null;
        };

        propuesta.bloques.forEach((crudo, i) => {
            // Los párrafos que salieron de las celdas de otra tabla ya viajaron
            // dentro de ella (`filas`): repetirlos duplicaba toda la página.
            if (crudo.dentroDeTabla && crudo.tipo !== 'tabla') return;
            // Ya se montó dentro de su apartado, en su lugar exacto.
            if (crudo.tipo === 'tabla' && tablasConsumidas.has(crudo)) return;

            if (crudo.tipo === 'tabla') {
                const decision = decisiones.get(i);
                if (decision === 'omitir') { tablaPendiente = null; tituloTabla = ''; return; }
                // Tabla de una sola celda = barra de título del guion. Un título
                // nuevo cierra la caja de pasos: ya empezó otra sección.
                if (crudo.celdas === 1 || (crudo.filas || []).length < 2) {
                    const texto = sinMarcas(crudo.texto);
                    if (!texto) return;
                    cerrarPasos();
                    if (!pagina.titulo) { pagina.titulo = texto; return; }
                    empujar(Object.assign(crearBloque('titulo', false), { nivel: 'h2', texto }));
                    return;
                }
                vaciarSueltos();
                // La marca <Tabla> queda satisfecha por esta tabla: ya no hay que
                // dejar una vacía con la nota "el guion pide una tabla".
                const conTitulo = tituloTabla;
                tablaPendiente = null; tituloTabla = '';
                empujarDestino(tablaWordA(decision || 'tabla', crudo, sueltas, conTitulo));
                return;
            }

            const texto = (crudo.texto || '').trim();
            if (!texto) return;

            // ¿El párrafo es solo una marca de montaje? Las que abren y cierran
            // región se atienden aquí; las demás siguen su camino de siempre
            // (bloquesDesdeLineas las convierte en el bloque que toca).
            const m = texto.replace(/\*\*/g, '').trim().match(MARCA);
            if (m) {
                const clave = m[1].toLowerCase();
                const termina = /^termina/.test(clave);
                if (/lista numerada|son las instrucciones/.test(clave)) {
                    if (termina) cerrarPasos(); else abrirPasos();
                    return;
                }
                if (/texto regular centrado/.test(clave)) {
                    vaciarSueltos();      // se cierra lo anterior con su estado
                    centrado = !termina;
                    return;
                }
                if (/^tabla\b/.test(clave)) {   // <Tabla>: la de verdad viene abajo
                    vaciarSueltos();
                    tablaPendiente = m[1];
                    return;
                }
                if (termina && /tabla/.test(clave)) { resolverTablaPendiente(); return; }
                sueltos.push(texto);
                return;
            }

            // Con una marca <Tabla> abierta, el párrafo que empieza con "Tabla"
            // es su encabezado ("Tabla de afirmaciones sobre…"), no un párrafo
            // de la página: en el montaje va en la banda gris de la tabla.
            if (tablaPendiente && !crudo.lista && /^tabla\b/i.test(texto.replace(/\*\*/g, ''))) {
                // Sin negritas: en el Word el pie viene en negritas, pero la
                // banda gris del montaje lo publica en texto normal.
                tituloTabla = sinMarcas(texto).replace(/\*\*/g, '');
                return;
            }

            if (crudo.lista) {
                // Dentro de la caja: el primer numId que aparece es el que
                // numera los pasos; cualquier otro (o un nivel más adentro) es
                // la sublista a, b, c de ese paso.
                if (pasos) {
                    if (!idPasos) idPasos = crudo.idLista;
                    if (crudo.idLista === idPasos && !crudo.nivelLista) {
                        vaciarSueltos();
                        cerrarSubLista();
                        paso = { texto: sinMarcas(texto), hijos: [] };
                        pasos.items.push(paso);
                        return;
                    }
                    vaciarSueltos();
                    if (!subLista) {
                        subLista = Object.assign(crearBloque('lista', false), {
                            estilo: crudo.tipoLista === 'vinetas' ? 'vinetas'
                                : crudo.tipoLista === 'letras' ? 'letras' : 'numerada',
                            items: []
                        });
                        empujarDestino(subLista);
                    }
                    subLista.items.push(sinMarcas(texto));
                    return;
                }

                if (!listaActual) {
                    vaciarSueltos();
                    listaActual = Object.assign(crearBloque('lista', false), {
                        estilo: crudo.tipoLista === 'vinetas' ? 'vinetas' : 'numerada', items: []
                    });
                    asignarIds([listaActual]);
                    nuevos.push(listaActual);
                }
                listaActual.items.push(sinMarcas(texto));
                return;
            }

            listaActual = null;
            cerrarSubLista();
            /* Párrafo sin numerar dentro de la caja: si Word lo dejó sin sangría
               ya no pertenece al paso (es el "Nota: al nombrar tu archivo…", que
               en la página publicada va después de la caja). Lo centrado es la
               excepción: esa marca dice explícitamente que sí es del paso. */
            if (pasos && !centrado && !crudo.sangria) cerrarPasos();
            sueltos.push(texto);
        });
        cerrarPasos();
        resolverTablaPendiente();
        vaciarSueltos();

        pagina.bloques = pagina.bloques.concat(nuevos);
        indicaciones = sueltas;
        $('#modal-import').classList.add('hidden');
        dibujarTodo();
    }

    /**
     * Contenido de una celda del guion, en el orden del Word.
     *
     * El caso que obliga a esto: en la tabla "Pestaña | Contenido", la celda del
     * apartado 2 trae texto, la caja de instrucción, la marca `<Crear un grupo de
     * 5 botones…>`, **una tabla anidada** con esos 5 botones y un párrafo de
     * cierre. Leyendo solo el texto aplanado, la tabla anidada se colaba como
     * renglones sueltos y además reaparecía al final de la página como un bloque
     * "Tarjetas" hermano del acordeón: el apartado quedaba vacío (de ahí la
     * impresión de que "el acordeón no abre") y el montaje, desordenado.
     */
    function bloquesDeCelda(celda, sueltas) {
        const piezas = celda.contenido || [];
        if (!piezas.length) {
            return bloquesDesdeLineas(celda.lineas && celda.lineas.length ? celda.lineas : [celda.texto], sueltas);
        }

        const salida = [];
        let lineas = [];
        /* Marca que anuncia la tabla que viene: `<Tabla>` o `<Crear un grupo de N
           botones…>`. Espera en vez de convertirse ya en un bloque vacío, porque
           si abajo viene la tabla de verdad salían las DOS cosas: el grupo (o la
           tabla) en blanco y el real. */
        let pendiente = null;

        const vaciar = () => {
            if (!lineas.length) return;
            salida.push(...bloquesDesdeLineas(lineas, sueltas));
            lineas = [];
        };

        piezas.forEach(pieza => {
            if (pieza.tipo !== 'tabla') {
                const m = (pieza.texto || '').replace(/\*\*/g, '').trim().match(MARCA);
                const clave = m ? m[1].toLowerCase() : '';
                if (m && /grupo de\s+\d+\s+bot/.test(clave)) { vaciar(); pendiente = { tipo: 'tarjetas', marca: m[1] }; return; }
                if (m && /^tabla\b/.test(clave)) { vaciar(); pendiente = { tipo: 'tabla', marca: m[1] }; return; }
                if (pieza.texto) lineas.push(pieza.texto);
                return;
            }
            vaciar();
            const t = pieza.bloque;
            tablasConsumidas.add(t);      // ya se montó aquí; no repetirla afuera
            // Manda lo que el usuario eligió en el asistente; si esa tabla no se
            // preguntó, lo que dice la marca; y si no hay marca, la sugerencia.
            const decision = decisionesTabla.get(t) || (pendiente ? pendiente.tipo : sugerir(t));
            pendiente = null;
            if (decision === 'omitir') return;
            salida.push(...[].concat(tablaWordA(decision, t, sueltas)));
        });
        vaciar();
        // Marca sin tabla que la respalde: sigue siendo un pendiente del montaje,
        // así que se queda el bloque vacío con su nota, como siempre.
        if (pendiente) salida.push(...bloquesDesdeLineas([`<${pendiente.marca}>`], sueltas));
        return salida;
    }

    /** Convierte una tabla del Word al bloque que el usuario eligió. */
    function tablaWordA(decision, crudo, sueltas, titulo) {
        const filas = crudo.filas || [];
        const encabezados = (filas[0] || []).map(c => sinMarcas(c.texto));
        const cuerpo = filas.slice(1);

        if (decision === 'tabla') {
            return Object.assign(crearBloque('tabla', false), {
                encabezados,
                filas: cuerpo.map(f => f.map(c => sinMarcas(c.texto))),
                tarjetas: true,
                /* Encendido al importar: el Word llega sin sombreado (todas las
                   celdas en "auto") pero el montaje publicado SIEMPRE alterna la
                   primera columna en rosa/verde. Se apaga con el toggle si esta
                   tabla no lo lleva. */
                colorear: true,
                titulo: titulo || ''
            });
        }

        if (decision === 'texto') {
            return Object.assign(crearBloque('texto', false), {
                texto: filas.map(f => f.map(c => sinMarcas(c.texto)).filter(Boolean).join(' — '))
                    .filter(Boolean).join('\n\n')
            });
        }

        // La fila de encabezados de estos guiones no siempre es solo
        // "Pestaña | Contenido": ahí viene también la caja de instrucción que
        // va ANTES del acordeón ("Haz clic en las pestañas…"). Se rescata.
        const antes = (filas[0] || []).flatMap(celda =>
            bloquesDesdeLineas((celda.lineas || []).filter(l => !/^(pesta[ñn]a|contenido|bot[oó]n|informaci[oó]n)$/i.test(l)), sueltas));
        asignarIds(antes);

        // Acordeón y tarjetas: la 1ª columna titula y el resto de la fila es el
        // contenido, que se parte en bloques según las marcas del guion.
        const items = cuerpo.map(fila => {
            const titulo = sinMarcas((fila[0] || {}).texto);
            const hijos = fila.slice(1).flatMap(celda => bloquesDeCelda(celda, sueltas));
            asignarIds(hijos);
            return { titulo, etiqueta: titulo, img: '', alt: '', hijos };
        }).filter(it => it.titulo || it.hijos.length);

        const compuesto = decision === 'tarjetas'
            ? Object.assign(crearBloque('tarjetas', false), { items })
            : Object.assign(crearBloque('acordeon', false), { items });
        return antes.concat(compuesto);
    }

    /* ---------------------------------------------------------------------
       Reparto de la pantalla: divisor y previa ampliada

       La conducta (arrastrar, recordar, doble clic, teclado, ampliar) vive en
       assets/reparto.js, compartida con el Integrador HTML. Aquí solo queda lo
       que es de esta herramienta: los mínimos y la medida en píxeles.
       --------------------------------------------------------------------- */

    let reparto = null;

    function prepararDivisor() {
        reparto = Reparto.iniciar({
            workspace: '#workspace',
            divisor: '#divisor',
            clave: 'guion-col-editor',
            colMin: 360,
            // Lo que se le reserva a la previa aunque se arrastre a lo bestia:
            // por debajo de esto la rejilla de escritorio de Moodle ya no se
            // parece a un escritorio.
            restoMin: 520,
            botonMax: '#btn-previa-max',
            botonEditorMax: '#btn-editor-max'
        });

        /* El ancho real de la previa en px. Es la única forma de saber si lo que
           se está mirando de verdad es un escritorio o una tableta disfrazada. */
        const medida = $('#preview-medida');
        new ResizeObserver(([entrada]) => {
            const px = Math.round(entrada.contentRect.width);
            medida.textContent = px ? `${px} px` : '';
        }).observe($('#preview-frame'));
    }

    /* La paleta del pie se pliega: en una laptop son ~150px que a veces se
       prefieren para el lienzo. Se recuerda, porque quien la pliega la quiere
       plegada siempre. */
    function prepararPaleta() {
        const CLAVE = 'guion-paleta-plegada';
        const caja = document.querySelector('.paleta-componentes');
        const btn = $('#btn-paleta');

        const fijar = plegada => {
            caja.classList.toggle('plegada', plegada);
            btn.setAttribute('aria-expanded', String(!plegada));
            localStorage.setItem(CLAVE, plegada ? '1' : '0');
        };

        if (localStorage.getItem(CLAVE) === '1') fijar(true);
        btn.addEventListener('click', () => fijar(!caja.classList.contains('plegada')));
    }

    /* ---------------------------------------------------------------------
       Arranque
       --------------------------------------------------------------------- */

    function init() {
        dibujarPaletaComponentes();
        dibujarTodo();
        prepararDivisor();
        prepararPaleta();

        $('#titulo-pagina').addEventListener('input', e => {
            pagina.titulo = e.target.value;
            programarRefresco();
        });
        $('#titulo-pagina').addEventListener('focus', guardarUnaVez);

        // Pestañas del panel derecho
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                $(`#${btn.dataset.target}-content`).classList.add('active');
            });
        });

        // Ancho de la vista previa (para ver las tablas en modo tarjeta)
        document.querySelectorAll('.ancho-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ancho-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $('#preview-caja').dataset.ancho = btn.dataset.ancho;
            });
        });

        // Word: el botón del encabezado sirve siempre; la tarjeta de la
        // pantalla de inicio además acepta que le suelten el archivo encima.
        const input = $('#input-docx');
        input.addEventListener('change', () => { if (input.files[0]) importarDocx(input.files[0]); });
        $('#btn-importar').addEventListener('click', () => input.click());

        $('#galeria-cerrar').addEventListener('click', () => cerrarGaleria());
        $('#galeria-quitar').addEventListener('click', () => cerrarGaleria(''));
        $('#modal-galeria').addEventListener('click', e => {
            if (e.target.id === 'modal-galeria') cerrarGaleria();
        });

        $('#import-aceptar').addEventListener('click', aplicarImportacion);
        $('#import-cancelar').addEventListener('click', () => $('#modal-import').classList.add('hidden'));

        $('#btn-deshacer').addEventListener('click', deshacer);
        $('#btn-limpiar').addEventListener('click', () => {
            if (!pagina.bloques.length) return;
            guardarHistorial();
            pagina.bloques = [];
            seleccion = null;
            dibujarTodo();
        });

        $('#btn-copy').addEventListener('click', () => {
            const code = $('#code');
            code.select();
            document.execCommand('copy');
            const icono = $('#btn-copy').querySelector('i');
            icono.className = 'ph ph-check';
            setTimeout(() => { icono.className = 'ph ph-copy'; }, 1500);
        });

        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
                e.preventDefault();
                deshacer();
            }
            // Un solo Escape para los dos paneles ampliados.
            if (e.key === 'Escape' && reparto) reparto.cerrarAmpliado();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
