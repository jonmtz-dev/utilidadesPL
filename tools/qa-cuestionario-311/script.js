/* ==========================================================================
   QA de Cuestionarios (Moodle 3.11, plugin Questionnaire)

   Qué hace: lee el guion que mandó producción y arma un verificador que se
   ejecuta DENTRO de Moodle, en cualquier página del cuestionario ya montado,
   para cotejar que sea lo mismo.

   Es el gemelo del QA de Actividad y Rúbrica de 3.11 en la interfaz y en la
   forma de entregar el verificador (marcador o consola), pero NO comparte su
   lector de Word: aquel entiende una actividad con textos y una rúbrica; este
   entiende la plantilla de PANTALLAS de un cuestionario (ver lector.js).

   Tres decisiones que conviene no deshacer:

   1. El verificador vive en `verificador.js` como función normal y se envía
      con `toString()`. Escribirlo dentro de una plantilla de texto obliga a
      escapar cada acento grave y es lo que dejó ilegible al QA de 3.11.
   2. El generador de evidencia es el MISMO de las demás herramientas de QA
      (`assets/evidencia-qa.js`): el informe es un solo documento con otros
      datos. Viaja serializado y se pasa como argumento; no se cuelga de
      `window` para no dejar rastro en Moodle.
   3. Solo LEE. El verificador no abre `complete.php` ni envía formularios:
      contestar un cuestionario tiene efectos y revisar no debe tenerlos.
   ========================================================================== */

(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);

    const datos = { guion: null };
    const archivos = { guion: '' };

    const escapar = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /* La clave con que se nombra la evidencia y el favorito del marcador. Si el
       archivo trae la nomenclatura de producción (`M17_S3_AI6`, `SM1S1-CF1`) se
       usa; si no, se nombra con el título del guion. Lo que no se hace es
       inventar: un archivo que se llama `a8039e81….docx` no dice nada. */
    function claveDeEvidencia(nombreArchivo, titulo) {
        const archivo = String(nombreArchivo || '');
        const m = archivo.match(/M\s*0?(\d+)\s*[_\-\s]?\s*(?:S\s*0?(\d+)\s*[_\-\s]?\s*)?(AI|AA|AC|CF|CS)\s*0?(\d+)/i)
            || archivo.match(/SM\s*0?(\d+)\s*[_\-\s]?\s*S\s*0?(\d+)\s*[_\-\s]?\s*(CF|AA)\s*0?(\d+)/i);
        if (m) return m[0].replace(/[\s\-]+/g, '_').toUpperCase();
        // Por palabras completas: cortar a mitad de «…de_E» no le dice nada a nadie.
        let base = '';
        String(titulo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
            .forEach(w => { if ((base + '_' + w).length <= 36) base += (base ? '_' : '') + w; });
        if (!base) return 'CUESTIONARIO_' + new Date().toISOString().slice(0, 10);
        // Si el título ya empieza con «Cuestionario» no se repite la palabra.
        return /^cuestionario/i.test(base) ? base : 'CUESTIONARIO_' + base;
    }

    function avisar(mensaje, error) {
        const p = $('#aviso-lectura');
        p.textContent = mensaje || '';
        p.style.color = error ? 'var(--danger)' : '';
    }

    async function cargarGuion(file) {
        avisar('Leyendo el guion…');
        try {
            datos.guion = await leerGuionDeCuestionario(file);
            archivos.guion = file.name;
            $('#zona-guion').classList.add('dropzone--cargada');
            avisar('');
        } catch (e) {
            datos.guion = null;
            archivos.guion = '';
            $('#zona-guion').classList.remove('dropzone--cargada');
            avisar('No se pudo leer el guion: ' + e.message, true);
        }
        dibujar();
    }

    function quitar() {
        datos.guion = null;
        archivos.guion = '';
        $('#zona-guion').classList.remove('dropzone--cargada');
        $('#input-guion').value = '';
        avisar('');
        dibujar();
    }

    function prepararZona(idZona, idInput, alCargar) {
        const zona = $(idZona);
        const input = $(idInput);
        zona.addEventListener('click', () => input.click());
        zona.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
        });
        input.addEventListener('change', () => input.files[0] && alCargar(input.files[0]));
        ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault(); zona.classList.add('dropzone--active');
        }));
        ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault(); zona.classList.remove('dropzone--active');
        }));
        zona.addEventListener('drop', e => {
            const f = e.dataTransfer.files[0];
            if (f && /\.docx$/i.test(f.name)) alCargar(f);
            else avisar('El archivo debe ser .docx', true);
        });
    }

    /* ---------------------------------------------------------------------
       Salida: resumen, verificador y lista de lo que se revisa
       --------------------------------------------------------------------- */

    /* La función se envía tal cual y se invoca con los datos ya resueltos. El
       generador de evidencia viaja serializado a su lado y se pasa como
       argumento. Los nombres de archivo van dentro de los datos porque dan
       nombre al PDF. */
    function codigoVerificador() {
        const paquete = {
            guion: datos.guion,
            archivos: archivos,
            clave: claveDeEvidencia(archivos.guion, datos.guion && datos.guion.titulo)
        };
        return 'void (function () {\n'
            + 'var evidencia = ' + window.EVIDENCIA_QA.toString() + ';\n'
            + '(' + window.VERIFICADOR_QA_CUESTIONARIO_311.toString() + ')(' + JSON.stringify(paquete) + ', evidencia);\n'
            + '}());';
    }

    function dibujar() {
        const hay = Boolean(datos.guion);
        $('#verificador-vacio').classList.toggle('hidden', hay);
        $('#verificador-caja').classList.toggle('hidden', !hay);
        $('#revisar-vacio').classList.toggle('hidden', hay);
        $('#revisar-lista').classList.toggle('hidden', !hay);
        dibujarResumen();
        if (!hay) return;

        const codigo = codigoVerificador();
        $('#codigo').value = codigo;
        $('#marcador').setAttribute('href', 'javascript:' + encodeURIComponent(codigo));
        // El texto del enlace es el nombre que toma el favorito al arrastrarlo
        // a la barra: el mismo del PDF, así el marcador dice de qué guion es.
        $('#marcador-nombre').textContent = 'QA_' + claveDeEvidencia(archivos.guion, datos.guion.titulo);
        dibujarRevision();
    }

    const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

    function resumenDePreguntas(g) {
        const cuenta = (t) => g.preguntas.filter(q => q.tipo === t).length;
        return `${g.preguntas.length} (${plural(cuenta('opciones'), 'de opciones', 'de opciones')}, ${plural(cuenta('abierta'), 'abierta', 'abiertas')})`;
    }

    function dibujarResumen() {
        const caja = $('#resumen');
        if (!datos.guion) { caja.innerHTML = ''; return; }
        const g = datos.guion;
        const fechas = g.fechas
            ? `${g.fechas.diaApertura} ${g.fechas.horaApertura} → ${g.fechas.diaCierre} ${g.fechas.horaCierre}`
            : 'no se piden';

        const bloques = [`
            <div class="resumen-bloque">
                <h3><span class="resumen-titulo"><i class="ph ph-file-doc"></i> Guion</span>
                    <button class="btn-quitar" type="button" data-quitar title="Quitar el guion"><i class="ph ph-x"></i></button></h3>
                <div class="resumen-dato"><span>Archivo</span><span><code>${escapar(archivos.guion)}</code></span></div>
                <div class="resumen-dato"><span>Título del recurso</span><span>${escapar(g.titulo || '(no se encontró)')}</span></div>
                <div class="resumen-dato"><span>Introducción</span><span>${plural(g.intro.filter(p => p.rol === 'contenido').length, 'párrafo', 'párrafos')}</span></div>
                <div class="resumen-dato"><span>Encabezado</span><span>${escapar(g.banner || '(sin título en banner)')} · ${plural(g.instrucciones.length, 'párrafo', 'párrafos')}</span></div>
                <div class="resumen-dato"><span>Preguntas</span><span>${escapar(resumenDePreguntas(g))}</span></div>
                <div class="resumen-dato"><span>Fechas pedidas</span><span>${escapar(fechas)}</span></div>
                <div class="resumen-dato"><span>Comentarios de montaje</span><span>${g.comentarios.length}</span></div>
            </div>`];

        if (g.avisos.length) {
            bloques.push(`
            <div class="avisos-guion">
                <h3><i class="ph ph-warning"></i> Avisos del guion (${g.avisos.length})</h3>
                <p class="check-nota">Son del Word, no del montaje: conviene resolverlos con producción antes de revisar.</p>
                <ul>${g.avisos.map(a => `<li>${escapar(a)}</li>`).join('')}</ul>
            </div>`);
        }
        caja.innerHTML = bloques.join('');
        caja.querySelector('[data-quitar]').addEventListener('click', quitar);
    }

    function dibujarRevision() {
        const g = datos.guion;
        const parrafo = (p) => `<div class="qa-linea"><span class="qa-texto">${escapar(p.texto.slice(0, 170))}${p.texto.length > 170 ? '…' : ''}
            ${p.negritas && p.negritas.length ? ` <strong>· negritas: ${escapar(p.negritas.join(' / '))}</strong>` : ''}
            ${p.cursivas && p.cursivas.length ? ` <em>· cursivas: ${escapar(p.cursivas.join(' / '))}</em>` : ''}
            ${p.conservaEstilo ? ' <span class="etiqueta-estilo">conservar estilo</span>' : ''}
            ${p.plantillaFecha ? ' <span class="etiqueta-estilo etiqueta-fecha">fecha: se coteja contra los ajustes</span>' : ''}</span></div>`;

        const partes = [];
        const contenido = g.intro.filter(p => p.rol === 'contenido');
        partes.push(`<div class="check-bloque">
            <h3><i class="ph ph-article"></i> Introducción de la actividad (${contenido.length})</h3>
            <p class="check-nota">Se coteja contra el texto que se escribió en los ajustes del cuestionario.</p>
            <div class="qa-lista-textos">${contenido.map(parrafo).join('')}</div></div>`);

        partes.push(`<div class="check-bloque">
            <h3><i class="ph ph-text-h"></i> Encabezado de las preguntas (${g.instrucciones.length + (g.banner ? 1 : 0)})</h3>
            <p class="check-nota">Se coteja contra la Etiqueta que va antes de la primera pregunta.</p>
            <div class="qa-lista-textos">${g.banner ? `<div class="qa-linea"><span class="qa-etiqueta">Título</span><span class="qa-texto">${escapar(g.banner)}</span></div>` : ''}
            ${g.instrucciones.map(parrafo).join('')}</div></div>`);

        partes.push(`<div class="check-bloque">
            <h3><i class="ph ph-question"></i> Preguntas (${g.preguntas.length})</h3>
            <div class="qa-lista-textos">${g.preguntas.map(q => `
                <div class="qa-linea"><span class="qa-etiqueta">${q.numero}. ${q.tipo === 'abierta' ? 'Abierta' : (q.tipo === 'opciones' ? 'Opciones' : '¿?')}</span>
                <span class="qa-texto">${escapar(q.enunciado.slice(0, 170))}${q.enunciado.length > 170 ? '…' : ''}
                ${q.tipo === 'opciones' ? ` <strong>· ${q.opciones.length} opciones${q.opciones.every(o => !o) ? ' (sin texto)' : ''}</strong>` : ''}</span></div>`).join('')}
            </div></div>`);

        if (g.comentarios.length) {
            partes.push(`<div class="check-bloque">
                <h3><i class="ph ph-chat-text"></i> Indicaciones del Word que se revisan a ojo (${g.comentarios.length})</h3>
                <p class="check-nota">Comentarios de montaje del guion. El verificador no puede comprobarlos solo; los enseña como recordatorio.</p>
                <div class="qa-lista-textos">${g.comentarios.map(c => `
                    <div class="qa-linea"><span class="qa-etiqueta">${escapar(c.ancla ? c.ancla.slice(0, 22) : 'comentario')}</span>
                    <span class="qa-texto">${escapar(c.texto)}</span></div>`).join('')}</div></div>`);
        }

        partes.push(`<div class="check-bloque">
            <h3><i class="ph ph-gear"></i> Contra los ajustes de Moodle</h3>
            <ul class="check-archivos">
                <li>El <strong>nombre de la actividad</strong> contra el «Título del recurso».</li>
                <li>Las <strong>fechas</strong> de apertura y cierre: lo que dice el texto de la introducción contra «Permitir respuestas desde / hasta» y las restricciones de acceso.</li>
                <li>El <strong>tipo de respuesta</strong> («responder una vez») cuando la introducción habla de un intento.</li>
                <li>Si el cuestionario es <strong>anónimo</strong>, cuando el guion pide recabar nombre, ID y correo.</li>
                <li>El <strong>tipo</strong> de cada pregunta, sus <strong>opciones</strong> y los <strong>residuos de Google Docs</strong> en el código.</li>
            </ul></div>`);

        $('#revisar-lista').innerHTML = partes.join('');
    }

    /* --------------------------------------------------------------- Arranque */

    function init() {
        prepararZona('#zona-guion', '#input-guion', cargarGuion);

        document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
            document.querySelectorAll('.tab-content').forEach(c =>
                c.classList.toggle('active', c.id === btn.dataset.target + '-content'));
        }));

        $('#btn-copiar').addEventListener('click', () => {
            const ta = $('#codigo');
            if (!ta.value) return;
            navigator.clipboard.writeText(ta.value).then(() => {
                const i = $('#btn-copiar i');
                i.className = 'ph ph-check';
                setTimeout(() => { i.className = 'ph ph-copy'; }, 1400);
            }).catch(() => { ta.focus(); ta.select(); });
        });

        Reparto.iniciar({
            workspace: '.qa-workspace',
            divisor: '#divisor',
            clave: 'qacq311-col-editor',
            colMin: 340,
            restoMin: 380
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
