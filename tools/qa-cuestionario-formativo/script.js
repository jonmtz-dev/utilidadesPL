/* ==========================================================================
   QA de Cuestionario Formativo (Moodle 5.1)

   Lee el formato Word usado por producción y construye un modelo neutral del
   cuestionario. El verificador se serializa con `toString()` y se ejecuta en
   Moodle, igual que el QA de Actividad y Rúbrica.

   La respuesta correcta sale del resaltado `w:highlight="magenta"`. La palabra
   "Correcta." de la retroalimentación se usa como comprobación independiente:
   si ambas señales no coinciden, el problema ya está en el guion.
   ========================================================================== */

(function () {
    'use strict';

    const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
    const $ = (s) => document.querySelector(s);
    const datos = { cuestionario: null };
    let nombreArchivo = '';

    function limpiar(s) {
        return String(s == null ? '' : s)
            .replace(/[\u00a0\u200b\u200c\u200d\u00ad\ufeff]/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\s*\n\s*/g, '\n')
            .trim();
    }

    // Algunos guiones escriben “6. Texto…” dentro de la celda Pregunta. Ese
    // número identifica el reactivo; no forma parte del enunciado publicado.
    // Se exige puntuación después del número para no tocar cantidades como 2.5.
    function sinNumeroDePregunta(s) {
        return limpiar(s).replace(/^\s*(?:pregunta\s+)?\d{1,3}\s*[.)\-–—]{1,3}(?=\s|[\p{L}¿¡])\s*/iu, '').trim();
    }

    function normalizarNotacion(s) {
        return String(s == null ? '' : s)
            // Cuando el guion trae símbolo visible + código alternativo, el
            // segundo es una duplicación editorial y Moodle solo muestra uno.
            .replace(/<\s*latex\s*>([\s\S]*?)<\s*termino\s+latex\s*>/gi, ' ')
            .replace(/<\s*cod\s+lat\s*>[\s\S]*?<\s*termina\s+cod\s+lat\s*>/gi, ' ')
            .replace(/(\S+)\s*<\s*latex\s*#([\s\S]*?)#\s*>/gi, '$1')
            .replace(/<\s*latex\s*#([\s\S]*?)#\s*>/gi, ' $1 ')
            .replace(/<\s*(?:termina\s+)?ecuaci[oó]n\s*>/gi, ' ')
            .replace(/\\sqrt\s*\{([^{}]+)\}/gi, '$1')
            .replace(/[_^]\{([^{}]+)\}/g, '$1')
            .replace(/\\cdot\b|\u00b7|\u22c5/gi, ' operadorproducto ')
            .replace(/\\_/g, ' marcadorvacio ')
            .replace(/_+/g, ' marcadorvacio ')
            .replace(/\\,/g, ' ')
            .replace(/\\pi\b|\u03c0/gi, ' pi ');
    }

    function firma(s) {
        return limpiar(normalizarNotacion(s)).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('es-MX').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    }

    function textoNodo(nodo) {
        if (!nodo) return '';
        const partes = [];
        const recorrer = (n) => {
            [...n.childNodes].forEach(h => {
                if (h.nodeType !== 1) return;
                if ((h.namespaceURI === W_NS || h.namespaceURI === MATH_NS) && h.localName === 't') {
                    partes.push(h.textContent || '');
                    return;
                }
                if (h.namespaceURI === W_NS && (h.localName === 'br' || h.localName === 'tab')) {
                    partes.push(h.localName === 'br' ? '\n' : ' ');
                    return;
                }
                recorrer(h);
                // Los párrafos y las filas de tablas anidadas necesitan un
                // separador: sin él, “1. Inorgánica” y “2. Óptica” terminaban
                // convertidos en una sola palabra al comparar con Moodle.
                if (h.namespaceURI === W_NS && (h.localName === 'p' || h.localName === 'tr')) partes.push('\n');
            });
        };
        recorrer(nodo);
        return limpiar(partes.join(''));
    }

    function partesDePregunta(celda, tablaPrincipal) {
        const parrafos = [...celda.getElementsByTagNameNS(W_NS, 'p')]
            .filter(p => tablaAncestro(p) === tablaPrincipal);
        const tablas = [...celda.getElementsByTagNameNS(W_NS, 'tbl')]
            .filter(t => tablaAncestro(t) === tablaPrincipal);
        return {
            textoPrincipal: sinNumeroDePregunta(parrafos.map(textoNodo).filter(Boolean).join(' ')),
            contenidoTabular: tablas.map(textoNodo).filter(Boolean).join(' '),
            tieneTabla: tablas.length > 0
        };
    }

    function filasDirectas(tabla) {
        return [...tabla.getElementsByTagNameNS(W_NS, 'tr')]
            .filter(tr => tablaAncestro(tr) === tabla);
    }

    function celdasDirectas(fila, tabla) {
        return [...fila.getElementsByTagNameNS(W_NS, 'tc')]
            .filter(tc => tablaAncestro(tc) === tabla);
    }

    function buscarTablaPreguntas(doc) {
        return [...doc.getElementsByTagNameNS(W_NS, 'tbl')].find(tabla => {
            const primera = filasDirectas(tabla)[0];
            if (!primera) return false;
            const encabezados = celdasDirectas(primera, tabla).map(c => firma(textoNodo(c)));
            return encabezados.length >= 3
                && encabezados[0] === 'pregunta'
                && encabezados[1] === 'respuestas'
                && encabezados[2] === 'retroalimentacion';
        }) || null;
    }

    function resaltadoMagenta(celda) {
        return [...celda.getElementsByTagNameNS(W_NS, 'r')].some(run => {
            // Word puede dejar runs vacíos con el resaltado anterior. Solo
            // cuenta el morado aplicado a texto visible (la letra de una
            // opción con imagen también es texto y se conserva).
            const texto = [...run.getElementsByTagNameNS(W_NS, 't')]
                .map(t => t.textContent || '').join('').trim();
            if (!texto) return false;
            return [...run.getElementsByTagNameNS(W_NS, 'highlight')].some(h =>
                /^(magenta|darkmagenta)$/i.test(h.getAttributeNS(W_NS, 'val') || ''));
        });
    }

    function idsImagenes(celda) {
        return [...celda.getElementsByTagNameNS(A_NS, 'blip')]
            .map(b => b.getAttributeNS(REL_NS, 'embed')).filter(Boolean);
    }

    function sinLetraDeOpcion(s) {
        return limpiar(s).replace(/^\s*[A-D][).]\s*/i, '').trim();
    }

    async function huellaDeBlob(blob) {
        let bitmap = null;
        let url = '';
        try {
            if ('createImageBitmap' in window) bitmap = await createImageBitmap(blob);
            else {
                url = URL.createObjectURL(blob);
                bitmap = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = reject;
                    img.src = url;
                });
            }
            const lado = 12;
            const canvas = document.createElement('canvas');
            canvas.width = lado;
            canvas.height = lado;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, lado, lado);
            ctx.drawImage(bitmap, 0, 0, lado, lado);
            const px = ctx.getImageData(0, 0, lado, lado).data;
            const grises = [];
            for (let i = 0; i < px.length; i += 4) {
                grises.push(Math.round((px[i] * .299 + px[i + 1] * .587 + px[i + 2] * .114) / 8) * 8);
            }
            return grises;
        } catch (_) {
            return [];
        } finally {
            if (url) URL.revokeObjectURL(url);
            if (bitmap && typeof bitmap.close === 'function') bitmap.close();
        }
    }

    async function resolverImagenes(ids, mapa) {
        return Promise.all(ids.map(async id => {
            const imagen = mapa.get(id);
            if (!imagen) return { nombre: id, huella: [] };
            return { nombre: imagen.nombre, huella: await huellaDeBlob(imagen.blob) };
        }));
    }

    function valorDespuesDeEtiqueta(doc, etiqueta) {
        const clave = firma(etiqueta);
        for (const tabla of [...doc.getElementsByTagNameNS(W_NS, 'tbl')]) {
            for (const fila of filasDirectas(tabla)) {
                const celdas = celdasDirectas(fila, tabla);
                for (let i = 0; i < celdas.length - 1; i++) {
                    if (firma(textoNodo(celdas[i])) === clave) return textoNodo(celdas[i + 1]);
                }
            }
        }
        return '';
    }

    function parrafoQueEmpieza(doc, inicio) {
        const clave = firma(inicio);
        const p = [...doc.getElementsByTagNameNS(W_NS, 'p')].find(n =>
            firma(textoNodo(n)).indexOf(clave) === 0);
        return p ? textoNodo(p) : '';
    }

    async function construirCuestionario(file) {
        const [doc, imagenesDocx] = await Promise.all([
            abrirDocumentoDocx(file),
            leerImagenesDeDocx(file)
        ]);
        const tabla = buscarTablaPreguntas(doc);
        if (!tabla) throw new Error('No se encontró la tabla “Pregunta · Respuestas · Retroalimentación”.');

        const preguntas = [];
        let actual = null;
        for (const fila of filasDirectas(tabla).slice(1)) {
            const celdas = celdasDirectas(fila, tabla);
            if (celdas.length < 3) continue;
            const pregunta = sinNumeroDePregunta(textoNodo(celdas[0]));
            if (pregunta && (!actual || firma(pregunta) !== firma(actual.texto))) {
                const partes = partesDePregunta(celdas[0], tabla);
                actual = {
                    texto: pregunta,
                    textoPrincipal: partes.textoPrincipal,
                    contenidoTabular: partes.contenidoTabular,
                    tieneTabla: partes.tieneTabla,
                    opciones: []
                };
                preguntas.push(actual);
            }
            if (!actual) continue;
            const retroalimentacion = textoNodo(celdas[2]);
            const correctaPorColor = resaltadoMagenta(celdas[1]);
            const correctaPorRetro = /^correcta\b/i.test(limpiar(retroalimentacion));
            actual.opciones.push({
                texto: sinLetraDeOpcion(textoNodo(celdas[1])),
                retroalimentacion,
                correcta: correctaPorColor,
                correctaPorColor,
                correctaPorRetro,
                imagenes: await resolverImagenes(idsImagenes(celdas[1]), imagenesDocx)
            });
        }

        const avisos = [];
        preguntas.forEach((p, i) => {
            if (p.opciones.length !== 4) avisos.push(`La pregunta ${i + 1} tiene ${p.opciones.length} opciones; se esperaban 4.`);
            const porColor = p.opciones.filter(o => o.correctaPorColor).length;
            if (porColor !== 1) avisos.push(`La pregunta ${i + 1} tiene ${porColor} respuestas resaltadas en morado.`);
            p.opciones.forEach((o, j) => {
                if (o.correctaPorColor !== o.correctaPorRetro) {
                    avisos.push(`Pregunta ${i + 1}, opción ${String.fromCharCode(65 + j)}: el morado y “Correcta/Incorrecta” no coinciden.`);
                }
            });
        });
        if (preguntas.length < 5 || preguntas.length > 10) {
            avisos.push(`El guion tiene ${preguntas.length} reactivos; sus indicaciones permiten de 5 a 10.`);
        }

        const todo = [...doc.getElementsByTagNameNS(W_NS, 'p')]
            .map(textoNodo).filter(Boolean).join('\n');
        const intentos = todo.match(/Intentos\s+permitidos\s*:\s*(\d+)/i);
        const apertura = todo.match(/disponible[\s\S]{0,120}?a\s+las\s+(\d{1,2}:\d{2})/i);
        const cierre = todo.match(/cerrar[áa][\s\S]{0,120}?a\s+las\s+(\d{1,2}:\d{2})/i);
        const instruccionCruda = parrafoQueEmpieza(doc, 'Instrucciones');

        return {
            archivo: file.name,
            titulo: valorDespuesDeEtiqueta(doc, 'Título del recurso:'),
            instruccion: instruccionCruda.replace(/^\s*Instrucciones\s*:\s*/i, ''),
            preguntas,
            avisos,
            perfil: {
                minimoReactivos: 5,
                maximoReactivos: 10,
                opcionesPorPregunta: 4,
                respuestaUnica: true,
                intentos: intentos ? Number(intentos[1]) : 2,
                metodoCalificacion: /calificaci[oó]n\s+m[aá]s\s+alta/i.test(todo) ? 'highest' : '',
                comportamiento: 'deferredfeedback',
                mostrarCorreccion: /su respuesta es correcta[\s\S]{0,80}su respuesta es incorrecta/i.test(todo),
                mostrarRespuestaCorrecta: false,
                mostrarRetroalimentacionEspecifica: true,
                apertura: apertura ? apertura[1] : '00:00',
                cierre: cierre ? cierre[1] : '23:59',
                cierreEnDomingo: /se cerrar[áa]\s+el domingo/i.test(todo)
            }
        };
    }

    function avisar(mensaje, error) {
        const p = $('#aviso-lectura');
        p.textContent = mensaje || '';
        p.style.color = error ? 'var(--danger)' : '';
    }

    async function cargarGuion(file) {
        avisar('Leyendo preguntas, respuestas, retroalimentaciones e imágenes…');
        try {
            datos.cuestionario = await construirCuestionario(file);
            nombreArchivo = file.name;
            $('#zona-guion').classList.add('dropzone--cargada');
            avisar('');
        } catch (e) {
            datos.cuestionario = null;
            nombreArchivo = '';
            $('#zona-guion').classList.remove('dropzone--cargada');
            avisar('No se pudo leer el cuestionario: ' + e.message, true);
        }
        dibujar();
    }

    function quitar() {
        datos.cuestionario = null;
        nombreArchivo = '';
        $('#input-guion').value = '';
        $('#zona-guion').classList.remove('dropzone--cargada');
        dibujar();
    }

    function prepararZona() {
        const zona = $('#zona-guion');
        const input = $('#input-guion');
        zona.addEventListener('click', () => input.click());
        zona.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
        });
        input.addEventListener('change', () => input.files[0] && cargarGuion(input.files[0]));
        ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault(); zona.classList.add('dropzone--active');
        }));
        ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault(); zona.classList.remove('dropzone--active');
        }));
        zona.addEventListener('drop', e => {
            const file = e.dataTransfer.files[0];
            if (file && /\.docx$/i.test(file.name)) cargarGuion(file);
            else avisar('El archivo debe ser .docx', true);
        });
    }

    const escapar = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function codigoVerificador() {
        return 'void (' + window.VERIFICADOR_CF.toString() + ')(' + JSON.stringify(datos) + ');';
    }

    function dibujar() {
        const hay = Boolean(datos.cuestionario);
        $('#verificador-vacio').classList.toggle('hidden', hay);
        $('#verificador-caja').classList.toggle('hidden', !hay);
        $('#revisar-vacio').classList.toggle('hidden', hay);
        $('#revisar-lista').classList.toggle('hidden', !hay);
        dibujarResumen();
        if (!hay) return;

        $('#incluye').innerHTML = '<span class="puesto">✓ Contenido</span>'
            + '<span class="puesto">✓ Respuestas correctas</span>'
            + '<span class="puesto">✓ Configuración</span>';
        const codigo = codigoVerificador();
        $('#codigo').value = codigo;
        $('#marcador').setAttribute('href', 'javascript:' + encodeURIComponent(codigo));
        dibujarRevision();
    }

    function dibujarResumen() {
        const caja = $('#resumen');
        const q = datos.cuestionario;
        if (!q) { caja.innerHTML = ''; return; }
        const correctas = q.preguntas.filter(p => p.opciones.filter(o => o.correcta).length === 1).length;
        const imagenes = q.preguntas.reduce((n, p) => n + p.opciones.reduce((m, o) => m + o.imagenes.length, 0), 0);
        caja.innerHTML = `<div class="resumen-bloque">
            <h3><span class="resumen-titulo"><i class="ph ph-exam"></i> Cuestionario</span>
                <button class="btn-quitar" type="button" id="btn-quitar" title="Quitar el guion"><i class="ph ph-x"></i></button></h3>
            <div class="resumen-dato"><span>Archivo</span><span><code>${escapar(nombreArchivo)}</code></span></div>
            <div class="resumen-dato"><span>Título</span><span>${escapar(q.titulo || '—')}</span></div>
            <div class="resumen-dato"><span>Reactivos</span><span>${q.preguntas.length}</span></div>
            <div class="resumen-dato"><span>Correctas identificadas</span><span>${correctas} de ${q.preguntas.length}</span></div>
            <div class="resumen-dato"><span>Imágenes en respuestas</span><span>${imagenes}</span></div>
            <div class="resumen-dato"><span>Perfil</span><span>${q.perfil.intentos} intentos · calificación más alta · respuestas barajables</span></div>
            ${q.avisos.length ? `<div class="resumen-alerta"><i class="ph ph-warning-circle"></i><span>${escapar(q.avisos.join(' '))}</span></div>` : ''}
        </div>`;
        $('#btn-quitar').addEventListener('click', quitar);
    }

    function dibujarRevision() {
        const q = datos.cuestionario;
        $('#revisar-lista').innerHTML = `<div class="check-bloque">
            <h3><i class="ph ph-sliders-horizontal"></i> Configuración solicitada</h3>
            <p class="check-nota">${q.perfil.intentos} intentos · calificación más alta · retroalimentación diferida ·
            mostrar correcta/incorrecta · ocultar la respuesta correcta · respuestas barajables ·
            apertura ${escapar(q.perfil.apertura)} · cierre ${escapar(q.perfil.cierre)}${q.perfil.cierreEnDomingo ? ' en domingo' : ''}.</p>
            <p class="check-nota"><strong>Puntajes:</strong> se muestran como información; todavía no se exige un total.</p>
        </div>
        <div class="check-bloque">
            <h3><i class="ph ph-list-numbers"></i> Reactivos (${q.preguntas.length})</h3>
            <div class="qa-lista-textos">${q.preguntas.map((p, i) => `
                <div class="qa-linea"><span class="qa-etiqueta">Pregunta ${i + 1}</span>
                    <span class="qa-texto">${escapar(p.texto.slice(0, 180))}${p.texto.length > 180 ? '…' : ''}
                    <span class="qa-opciones">${p.opciones.map((o, j) => `
                        <span class="qa-opcion ${o.correcta ? 'qa-opcion--correcta' : ''}"
                              title="${escapar(o.texto || (o.imagenes.length ? 'Respuesta con imagen' : 'Sin texto'))}">
                            ${String.fromCharCode(65 + j)}${o.correcta ? ' ✓' : ''} · ${escapar(o.texto || (o.imagenes.length ? 'Imagen' : '—'))}
                        </span>`).join('')}</span></span></div>`).join('')}
            </div>
        </div>`;
    }

    function init() {
        prepararZona();
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
            clave: 'qa-cf-col-editor',
            colMin: 340,
            restoMin: 380
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
