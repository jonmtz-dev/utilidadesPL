/* ==========================================================================
   Verificador que se ejecuta DENTRO de Moodle.

   Es autocontenido porque `script.js` lo serializa con `toString()`. Solo hace
   lecturas del DOM y solicitudes GET del mismo origen; nunca envía formularios,
   nunca responde preguntas y nunca guarda cambios.
   ========================================================================== */

window.VERIFICADOR_CF = async function (DATOS) {
    'use strict';

    var esperado = DATOS && DATOS.cuestionario;
    if (!esperado) {
        alert('El verificador se generó sin un cuestionario formativo.');
        return;
    }

    function limpiar(s) {
        return String(s == null ? '' : s)
            .replace(/[\u00a0\u200b\u200c\u200d\u00ad\ufeff]/g, ' ')
            .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/\s+/g, ' ').trim().normalize('NFC');
    }

    function normalizarTextoPregunta(s) {
        return limpiar(s)
            // “8. Relaciona…”: numeración editorial del reactivo en el Word.
            .replace(/^\s*(?:pregunta\s+)?\d{1,3}\s*[.)\-–—]{1,3}(?=\s|[\p{L}¿¡])\s*/iu, '')
            // Moodle sí imprime los números automáticos de listas/tablas que
            // Word guarda como formato y no como texto: se ignoran al cotejar.
            .replace(/(^|\s)\d{1,2}\s*[.)](?=\s*[\p{L}¿¡])/gu, '$1')
            .replace(/(^|\s)[a-z]\s*[.)](?=\s*[\p{L}¿¡])/giu, '$1')
            .replace(/\s+/g, ' ').trim();
    }

    function textoEstructurado(nodo) {
        if (!nodo) return '';
        var partes = [];
        var separadores = { BR: true, P: true, DIV: true, LI: true, TD: true, TH: true, TR: true };
        var recorrer = function (n) {
            [].slice.call(n.childNodes).forEach(function (h) {
                if (h.nodeType === 3) {
                    partes.push(h.textContent || '');
                    return;
                }
                if (h.nodeType !== 1) return;
                if (h.tagName !== 'BR') recorrer(h);
                if (separadores[h.tagName]) partes.push(' ');
            });
        };
        recorrer(nodo);
        return limpiar(partes.join(''));
    }

    function partesDePregunta(nodo) {
        if (!nodo) return { textoPrincipal: '', contenidoTabular: '', tieneTabla: false };
        var copia = nodo.cloneNode(true);
        var tablasCopia = [].slice.call(copia.querySelectorAll('table'));
        tablasCopia.forEach(function (tabla) { tabla.remove(); });
        var tablas = [].slice.call(nodo.querySelectorAll('table')).filter(function (tabla) {
            return !tabla.parentElement.closest('table');
        });
        return {
            textoPrincipal: normalizarTextoPregunta(textoEstructurado(copia)),
            contenidoTabular: tablas.map(textoEstructurado).join(' '),
            tieneTabla: tablas.length > 0
        };
    }

    function normalizarNotacion(s) {
        return String(s == null ? '' : s)
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

    function textoDeHtml(s) {
        var div = document.createElement('div');
        div.innerHTML = String(s || '');
        return limpiar(div.textContent);
    }

    function limpiarRetroalimentacion(s) {
        return String(s == null ? '' : s)
            .replace(/[\u00a0\u200b\u200c\u200d\u00ad\ufeff]/g, ' ')
            .replace(/\s+/g, ' ').trim().normalize('NFC');
    }

    function retroalimentacionDeHtml(s) {
        var div = document.createElement('div');
        div.innerHTML = String(s || '');
        [].slice.call(div.querySelectorAll('br, p, div, li, td, th, tr')).forEach(function (n) {
            n.appendChild(document.createTextNode(' '));
        });
        return limpiarRetroalimentacion(div.textContent);
    }

    function similitud(a, b) {
        var fa = firma(a), fb = firma(b);
        if (!fa && !fb) return 1;
        if (fa === fb) return 1;
        if (fa.length > 12 && fb.indexOf(fa) !== -1) return .97;
        if (fb.length > 12 && fa.indexOf(fb) !== -1) return .97;
        var aa = fa.split(' ').filter(Boolean), bb = fb.split(' ').filter(Boolean);
        if (!aa.length || !bb.length) return 0;
        var usados = {};
        var iguales = 0;
        aa.forEach(function (x) {
            var j = bb.findIndex(function (y, i) { return !usados[i] && y === x; });
            if (j >= 0) { usados[j] = true; iguales++; }
        });
        return (2 * iguales) / (aa.length + bb.length);
    }

    function similitudPregunta(a, b) {
        return similitud(normalizarTextoPregunta(a), normalizarTextoPregunta(b));
    }

    function equivalentes(a, b) { return similitud(a, b) >= .92; }

    function firmaContenidoExacto(s) {
        return tokensContenidoExacto(s).join('\u001f');
    }

    function tokensContenidoExacto(s) {
        var texto = limpiarRetroalimentacion(normalizarNotacion(s));
        return texto.match(/[\p{L}\p{M}]+|\p{N}+(?:[.,]\p{N}+)?|[^\s]/gu) || [];
    }

    function contenidosIguales(a, b) {
        return firmaContenidoExacto(a) === firmaContenidoExacto(b);
    }

    function preguntasIguales(esperada, actual) {
        if (esperada.tieneTabla || actual.tieneTabla) {
            if (!esperada.tieneTabla || !actual.tieneTabla) return false;
            if (!contenidosIguales(normalizarTextoPregunta(esperada.textoPrincipal), actual.textoPrincipal)) return false;
            var tablaEsperada = tokensContenidoExacto(normalizarTextoPregunta(esperada.contenidoTabular)).sort();
            var tablaActual = tokensContenidoExacto(normalizarTextoPregunta(actual.contenidoTabular)).sort();
            return tablaEsperada.join('\u001f') === tablaActual.join('\u001f');
        }
        return contenidosIguales(normalizarTextoPregunta(esperada.texto), actual.texto);
    }

    function firmaRetroalimentacion(s) {
        return limpiarRetroalimentacion(normalizarNotacion(s));
    }

    function retroalimentacionesIguales(a, b) {
        return firmaRetroalimentacion(a) === firmaRetroalimentacion(b);
    }

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function diferencia(a, b) {
        a = limpiar(a); b = limpiar(b);
        var i = 0, fa = a.length, fb = b.length;
        while (i < fa && i < fb && a[i] === b[i]) i++;
        while (fa > i && fb > i && a[fa - 1] === b[fb - 1]) { fa--; fb--; }
        var marca = function (s) {
            return s ? '<mark style="background:#ffe082;padding:0 2px;border-radius:2px">' + esc(s) + '</mark>' : '';
        };
        return {
            esperado: esc(a.slice(0, i)) + marca(a.slice(i, fa)) + esc(a.slice(fa)),
            actual: b ? esc(b.slice(0, i)) + marca(b.slice(i, fb)) + esc(b.slice(fb)) : '<em>no aparece</em>'
        };
    }

    var hallazgos = [];
    function anotar(nivel, grupo, titulo, debe, actual, nodo) {
        hallazgos.push({ nivel: nivel, grupo: grupo, titulo: titulo,
            esperado: debe || '', actual: actual || '', nodo: nodo || null });
    }

    function limpiarMarcas() {
        [].slice.call(document.querySelectorAll('.qacf-marca')).forEach(function (n) {
            n.style.outline = '';
            n.classList.remove('qacf-marca');
        });
        var viejo = document.getElementById('qacf-panel');
        if (viejo) viejo.remove();
    }

    function panelCargando() {
        limpiarMarcas();
        var panel = document.createElement('div');
        panel.id = 'qacf-panel';
        panel.style.cssText = 'position:fixed;top:12px;right:12px;width:390px;z-index:2147483647;'
            + 'background:#fff;color:#222;border:1px solid #ddd;border-radius:12px;padding:14px 16px;'
            + 'box-shadow:0 12px 44px rgba(0,0,0,.35);font:13px/1.5 system-ui,sans-serif';
        panel.innerHTML = '<strong style="font-size:15px">QA de Cuestionario · Moodle 5.1</strong>'
            + '<div style="margin-top:9px;color:#555">Cotejando contenido y consultando la configuración…</div>';
        document.body.appendChild(panel);
    }

    function extraerPreguntas() {
        return [].slice.call(document.querySelectorAll('.que.multichoice')).map(function (que) {
            var qtext = que.querySelector('.qtext');
            var partes = partesDePregunta(qtext);
            var opciones = [].slice.call(que.querySelectorAll('.answer [data-region="answer-label"]')).map(function (etiqueta) {
                var contenido = etiqueta.querySelector('.flex-fill') || etiqueta;
                var fila = etiqueta.closest('.r0, .r1') || etiqueta.parentElement;
                var control = fila ? fila.querySelector('input[type="radio"], input[type="checkbox"]') : null;
                return {
                    texto: limpiar(contenido.textContent),
                    nodo: contenido,
                    tipoControl: control ? String(control.getAttribute('type') || control.type || '').toLowerCase() : '',
                    imagenes: [].slice.call(contenido.querySelectorAll('img'))
                };
            });
            return {
                texto: normalizarTextoPregunta(textoEstructurado(qtext)),
                textoPrincipal: partes.textoPrincipal,
                contenidoTabular: partes.contenidoTabular,
                tieneTabla: partes.tieneTabla,
                nodo: que,
                opciones: opciones,
                enlaceEdicion: que.querySelector('.editquestion a[href], a[href*="editquestion/question.php"]'),
                diferida: que.classList.contains('deferredfeedback')
            };
        });
    }

    async function huellaImagen(img) {
        try {
            if (!img.complete) await new Promise(function (resolve, reject) {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', reject, { once: true });
            });
            var lado = 12;
            var canvas = document.createElement('canvas');
            canvas.width = lado; canvas.height = lado;
            var ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, lado, lado);
            ctx.drawImage(img, 0, 0, lado, lado);
            var px = ctx.getImageData(0, 0, lado, lado).data;
            var grises = [];
            for (var i = 0; i < px.length; i += 4) {
                grises.push(Math.round((px[i] * .299 + px[i + 1] * .587 + px[i + 2] * .114) / 8) * 8);
            }
            return grises;
        } catch (_) { return []; }
    }

    function distanciaHuellas(a, b) {
        if (!a || !b || !a.length || a.length !== b.length) return Infinity;
        var total = 0;
        for (var i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
        return total / a.length;
    }

    async function similitudOpcion(a, b) {
        if (a.imagenes && a.imagenes.length) {
            if (!b.imagenes || b.imagenes.length !== a.imagenes.length) return 0;
            var reales = await Promise.all(b.imagenes.map(huellaImagen));
            var mejor = Infinity;
            a.imagenes.forEach(function (e) {
                reales.forEach(function (r) { mejor = Math.min(mejor, distanciaHuellas(e.huella, r)); });
            });
            return mejor <= 18 ? 1 : (mejor <= 35 ? .8 : .1);
        }
        return similitud(a.texto, b.texto);
    }

    async function cotejarContenido() {
        var actuales = extraerPreguntas();
        if (!actuales.length) {
            anotar('error', 'Página', 'No se encontraron preguntas de opción múltiple',
                'Vista previa completa del cuestionario', document.title, document.body);
            return { actuales: [], parejas: [] };
        }
        if (actuales.length !== esperado.preguntas.length) {
            anotar('error', 'Reactivos', 'La cantidad de preguntas no coincide',
                esperado.preguntas.length + ' preguntas', actuales.length + ' preguntas', document.querySelector('#region-main'));
        }

        var descripcion = document.querySelector('.que.description .qtext, .informationitem .qtext');
        if (esperado.instruccion) {
            if (!descripcion) {
                anotar('error', 'Instrucciones', 'Falta la instrucción general', esperado.instruccion, '', null);
            } else if (!equivalentes(esperado.instruccion, descripcion.textContent)) {
                anotar('error', 'Instrucciones', 'La instrucción general cambia',
                    esperado.instruccion, descripcion.textContent, descripcion);
            }
        }

        var usados = {};
        var parejas = [];
        for (var i = 0; i < esperado.preguntas.length; i++) {
            var ep = esperado.preguntas[i];
            var mejor = -1, indice = -1;
            actuales.forEach(function (ap, j) {
                if (usados[j]) return;
                var s = similitudPregunta(ep.texto, ap.texto);
                if (s > mejor) { mejor = s; indice = j; }
            });
            if (indice < 0 || mejor < .56) {
                anotar('error', 'Reactivos', 'Falta la pregunta ' + (i + 1), ep.texto, '', null);
                parejas.push({ esperada: ep, actual: null, indiceEsperado: i });
                continue;
            }
            usados[indice] = true;
            var ap = actuales[indice];
            parejas.push({ esperada: ep, actual: ap, indiceEsperado: i, indiceActual: indice });
            if (!preguntasIguales(ep, ap)) {
                anotar('error', 'Reactivos', 'Texto de la pregunta ' + (i + 1),
                    ep.texto, ap.texto, ap.nodo);
            }
            if (!ap.diferida) {
                anotar('error', 'Configuración', 'La pregunta ' + (i + 1) + ' no usa retroalimentación diferida',
                    'deferredfeedback', ap.nodo.className, ap.nodo);
            }
            if (ap.opciones.length !== esperado.perfil.opcionesPorPregunta) {
                anotar('error', 'Respuestas', 'La pregunta ' + (i + 1) + ' tiene otra cantidad de opciones',
                    esperado.perfil.opcionesPorPregunta + ' opciones', ap.opciones.length + ' opciones', ap.nodo);
            }
            var tiposControl = ap.opciones.map(function (opcion) { return opcion.tipoControl; });
            var controlesSinIdentificar = tiposControl.filter(function (tipo) { return !tipo; }).length;
            var controlesNoUnicos = tiposControl.filter(function (tipo) { return tipo && tipo !== 'radio'; });
            if (esperado.perfil.respuestaUnica && controlesNoUnicos.length) {
                var usaCasillas = controlesNoUnicos.some(function (tipo) { return tipo === 'checkbox'; });
                anotar('error', 'Respuestas', 'La pregunta ' + (i + 1) + ' permite seleccionar varias respuestas',
                    'Botones de opción (una sola respuesta)',
                    usaCasillas ? 'Casillas de verificación (varias respuestas)' : 'Controles: ' + controlesNoUnicos.join(', '), ap.nodo);
            } else if (esperado.perfil.respuestaUnica && controlesSinIdentificar) {
                anotar('aviso', 'Respuestas', 'No se pudo identificar el control de ' + controlesSinIdentificar
                    + (controlesSinIdentificar === 1 ? ' opción' : ' opciones') + ' en la pregunta ' + (i + 1),
                    'Botones de opción', 'Control no visible en el HTML', ap.nodo);
            }

            var asignados = {};
            for (var j = 0; j < ap.opciones.length; j++) {
                var mejorO = -1, indiceO = -1;
                for (var k = 0; k < ep.opciones.length; k++) {
                    if (asignados[k]) continue;
                    var so = await similitudOpcion(ep.opciones[k], ap.opciones[j]);
                    if (so > mejorO) { mejorO = so; indiceO = k; }
                }
                if (indiceO >= 0 && mejorO >= .56) {
                    asignados[indiceO] = true;
                    var imagenExacta = !ep.opciones[indiceO].imagenes.length || mejorO === 1;
                    if (!contenidosIguales(ep.opciones[indiceO].texto, ap.opciones[j].texto) || !imagenExacta) {
                        anotar('error', 'Respuestas', 'Cambia una respuesta de la pregunta ' + (i + 1),
                            ep.opciones[indiceO].texto || 'Imagen del Word',
                            ap.opciones[j].texto || 'Imagen de Moodle', ap.opciones[j].nodo);
                    }
                } else {
                    anotar('error', 'Respuestas', 'Opción distinta en la pregunta ' + (i + 1),
                        'Una de las cuatro opciones del Word', ap.opciones[j].texto || 'Imagen', ap.opciones[j].nodo);
                }
            }
        }
        actuales.forEach(function (ap, i) {
            if (!usados[i]) anotar('error', 'Reactivos', 'Pregunta adicional que no está en el Word', '', ap.texto, ap.nodo);
        });
        return { actuales: actuales, parejas: parejas };
    }

    async function traerDocumento(url) {
        var u = new URL(url, location.href);
        if (u.origin !== location.origin) throw new Error('el enlace pertenece a otro origen');
        var controlador = new AbortController();
        var reloj = setTimeout(function () { controlador.abort(); }, 12000);
        try {
            var respuesta = await fetch(u.href, { credentials: 'same-origin', signal: controlador.signal });
            if (!respuesta.ok) throw new Error('respuesta HTTP ' + respuesta.status);
            return new DOMParser().parseFromString(await respuesta.text(), 'text/html');
        } finally { clearTimeout(reloj); }
    }

    function camposPorNombre(doc, prefijo) {
        return [].slice.call(doc.querySelectorAll('[name]')).filter(function (n) {
            return n.name === prefijo || n.name.indexOf(prefijo + '[') === 0;
        });
    }

    function valorControl(n) {
        if (!n) return '';
        if (n.tagName === 'SELECT') {
            var op = n.options[n.selectedIndex];
            return { valor: n.value, texto: limpiar(op ? op.textContent : '') };
        }
        return { valor: n.value || '', texto: limpiar(n.value || '') };
    }

    function estaMarcado(n) {
        if (!n) return false;
        if (n.type === 'checkbox' || n.type === 'radio') return n.checked || n.hasAttribute('checked');
        return String(n.value) === '1';
    }

    async function revisarPreguntaInterna(pareja) {
        var ep = pareja.esperada, ap = pareja.actual, numero = pareja.indiceEsperado + 1;
        if (!ap || !ap.enlaceEdicion) return false;
        var doc = await traerDocumento(ap.enlaceEdicion.href);
        var respuestas = camposPorNombre(doc, 'answer').filter(function (n) {
            return /\[text\]$/.test(n.name) || /^answer\[\d+\]$/.test(n.name);
        });
        var fracciones = camposPorNombre(doc, 'fraction');
        var retro = camposPorNombre(doc, 'feedback').filter(function (n) { return /\[text\]$/.test(n.name); });
        if (!respuestas.length || !fracciones.length) {
            throw new Error('la página de edición no expuso los campos de respuestas');
        }

        var single = doc.querySelector('[name="single"]');
        if (single) {
            var vSingle = valorControl(single);
            if (!(String(vSingle.valor) === '1' || /una|one/i.test(vSingle.texto))) {
                anotar('error', 'Configuración interna', 'La pregunta ' + numero + ' permite varias respuestas',
                    'Solo una respuesta', vSingle.texto || vSingle.valor, ap.nodo);
            }
        }

        var editadas = respuestas.map(function (campo, i) {
            var fr = valorControl(fracciones[i]);
            return {
                texto: textoDeHtml(campo.value),
                fraccion: Number(String(fr.valor || '0').replace(',', '.')),
                retro: retroalimentacionDeHtml(retro[i] ? retro[i].value : '')
            };
        });
        var usadas = {};
        ep.opciones.forEach(function (eo, indiceEsperado) {
            var mejor = -1, indice = -1;
            editadas.forEach(function (mo, j) {
                if (usadas[j]) return;
                var s = eo.imagenes && eo.imagenes.length && !eo.texto ? (j === indiceEsperado ? .7 : .1) : similitud(eo.texto, mo.texto);
                if (s > mejor) { mejor = s; indice = j; }
            });
            if (indice < 0 || mejor < .55) {
                anotar('error', 'Configuración interna', 'No se encontró una opción del Word en la pregunta ' + numero,
                    eo.texto || 'Respuesta con imagen', '', ap.nodo);
                return;
            }
            usadas[indice] = true;
            var mo = editadas[indice];
            if (eo.correcta && mo.fraccion < .999) {
                anotar('error', 'Respuesta correcta', 'La respuesta morada de la pregunta ' + numero + ' no vale 100%',
                    '100%', (mo.fraccion * 100) + '%', ap.nodo);
            }
            if (!eo.correcta && Math.abs(mo.fraccion) > .0001) {
                anotar('error', 'Respuesta correcta', 'Un distractor de la pregunta ' + numero + ' tiene puntaje',
                    '0%', (mo.fraccion * 100) + '%', ap.nodo);
            }
            if (!retroalimentacionesIguales(eo.retroalimentacion, mo.retro)) {
                anotar('error', 'Retroalimentación', 'Cambia la retroalimentación de la pregunta ' + numero
                    + ', opción ' + String.fromCharCode(65 + indiceEsperado) + ' del Word',
                    eo.retroalimentacion, mo.retro, ap.nodo);
            }
        });
        return true;
    }

    function baseYcmid(actuales) {
        var candidatos = [];
        var form = document.querySelector('form[action*="/mod/quiz/"]');
        if (form && form.action) candidatos.push(form.action);
        actuales.forEach(function (q) { if (q.enlaceEdicion) candidatos.push(q.enlaceEdicion.href); });
        for (var i = 0; i < candidatos.length; i++) {
            try {
                var u = new URL(candidatos[i], location.href);
                var cmid = u.searchParams.get('cmid');
                var corte = u.pathname.indexOf('/mod/quiz/');
                if (corte < 0) corte = u.pathname.indexOf('/question/');
                if (cmid && corte >= 0) return { origen: u.origin, base: u.pathname.slice(0, corte), cmid: cmid };
            } catch (_) { /* siguiente */ }
        }
        return null;
    }

    function valorPorNombre(doc, nombre) {
        return valorControl(doc.querySelector('[name="' + nombre + '"]'));
    }

    function parteFecha(doc, base, parte) {
        var n = doc.querySelector('[name="' + base + '[' + parte + ']"], [id="id_' + base + '_' + parte + '"]');
        return n ? Number(valorControl(n).valor) : NaN;
    }

    function revisarConfiguracionDoc(doc) {
        var intentos = valorPorNombre(doc, 'attempts');
        if (intentos.valor && Number(intentos.valor) !== esperado.perfil.intentos) {
            anotar('error', 'Configuración', 'Intentos permitidos', String(esperado.perfil.intentos), intentos.texto || intentos.valor, null);
        }
        var metodo = valorPorNombre(doc, 'grademethod');
        if (esperado.perfil.metodoCalificacion === 'highest' && metodo.valor
                && !(String(metodo.valor) === '1' || /m[aá]s alta|highest/i.test(metodo.texto))) {
            anotar('error', 'Configuración', 'Método de calificación', 'Calificación más alta', metodo.texto || metodo.valor, null);
        }
        var comportamiento = valorPorNombre(doc, 'preferredbehaviour');
        if (comportamiento.valor && !/deferredfeedback/.test(comportamiento.valor)
                && !/retroalimentaci[oó]n diferida|deferred feedback/i.test(comportamiento.texto)) {
            anotar('error', 'Configuración', 'Comportamiento de las preguntas',
                'Retroalimentación diferida', comportamiento.texto || comportamiento.valor, null);
        }
        var correccion = camposPorNombre(doc, 'reviewcorrectness').filter(estaMarcado).length;
        var respuesta = camposPorNombre(doc, 'reviewrightanswer').filter(estaMarcado).length;
        var especifica = camposPorNombre(doc, 'reviewspecificfeedback').filter(estaMarcado).length;
        if (esperado.perfil.mostrarCorreccion && camposPorNombre(doc, 'reviewcorrectness').length && !correccion) {
            anotar('error', 'Opciones de revisión', 'No se muestra si la respuesta es correcta o incorrecta', 'Activado', 'Desactivado', null);
        }
        if (!esperado.perfil.mostrarRespuestaCorrecta && respuesta) {
            anotar('error', 'Opciones de revisión', 'Moodle revela cuál era la respuesta correcta', 'Desactivado', 'Activado', null);
        }
        if (esperado.perfil.mostrarRetroalimentacionEspecifica
                && camposPorNombre(doc, 'reviewspecificfeedback').length && !especifica) {
            anotar('error', 'Opciones de revisión', 'No se muestran las retroalimentaciones de las respuestas', 'Activado', 'Desactivado', null);
        }

        [['timeopen', esperado.perfil.apertura, 'Apertura'], ['timeclose', esperado.perfil.cierre, 'Cierre']].forEach(function (x) {
            var habilitar = doc.querySelector('[name="' + x[0] + '[enabled]"], [id="id_' + x[0] + '_enabled"]');
            if (habilitar && !estaMarcado(habilitar)) {
                anotar('error', 'Fechas', x[2] + ' del cuestionario', 'Activada', 'Desactivada', null);
                return;
            }
            var hora = parteFecha(doc, x[0], 'hour'), minuto = parteFecha(doc, x[0], 'minute');
            if (!isFinite(hora) || !isFinite(minuto)) return;
            var actual = String(hora).padStart(2, '0') + ':' + String(minuto).padStart(2, '0');
            if (actual !== x[1]) anotar('error', 'Fechas', 'Hora de ' + x[2].toLowerCase(), x[1], actual, null);
        });
        if (esperado.perfil.cierreEnDomingo) {
            var y = parteFecha(doc, 'timeclose', 'year');
            var m = parteFecha(doc, 'timeclose', 'month');
            var d = parteFecha(doc, 'timeclose', 'day');
            if (isFinite(y) && isFinite(m) && isFinite(d) && new Date(y, m - 1, d).getDay() !== 0) {
                anotar('error', 'Fechas', 'La fecha de cierre no cae en domingo', 'Domingo', d + '/' + m + '/' + y, null);
            }
        }
    }

    function revisarPuntajesDoc(doc) {
        var maximos = [].slice.call(doc.querySelectorAll('input[name^="maxmark"], input.question-max-mark'))
            .map(function (n) { return Number(String(n.value).replace(',', '.')); }).filter(isFinite);
        var maxgrade = doc.querySelector('[name="maxgrade"], #id_maxgrade');
        if (maximos.length) {
            var suma = maximos.reduce(function (a, b) { return a + b; }, 0);
            anotar('info', 'Puntajes', 'Puntajes asignados en el cuestionario', '',
                maximos.join(' · ') + ' (suma: ' + suma + ')', null);
        }
        if (maxgrade) anotar('info', 'Puntajes', 'Calificación máxima del cuestionario', '', valorControl(maxgrade).valor, null);
    }

    async function cotejarPaginasInternas(resultado) {
        var enlaces = resultado.parejas.filter(function (p) { return p.actual && p.actual.enlaceEdicion; });
        if (!enlaces.length) {
            anotar('aviso', 'Configuración interna', 'No hay enlaces de edición en esta vista',
                'Abrir la vista previa como docente', 'Solo se pudo revisar lo visible', null);
        } else {
            var resultados = await Promise.all(enlaces.map(async function (p) {
                try { return await revisarPreguntaInterna(p); }
                catch (e) { return { error: e.message, numero: p.indiceEsperado + 1 }; }
            }));
            var fallos = resultados.filter(function (r) { return r && r.error; });
            if (fallos.length) {
                anotar('aviso', 'Configuración interna', 'No se pudieron leer ' + fallos.length + ' preguntas',
                    'Campos de respuesta y retroalimentación', fallos.map(function (f) { return 'P' + f.numero + ': ' + f.error; }).join(' · '), null);
            }
        }

        var sitio = baseYcmid(resultado.actuales);
        if (!sitio || sitio.origen !== location.origin) {
            anotar('aviso', 'Configuración', 'No se pudo localizar la configuración del cuestionario',
                'Vista previa abierta desde Moodle', 'Solo se revisó el contenido visible', null);
            return;
        }
        try {
            var config = await traerDocumento(sitio.origen + sitio.base + '/course/modedit.php?update=' + encodeURIComponent(sitio.cmid) + '&return=1');
            revisarConfiguracionDoc(config);
        } catch (e) {
            anotar('aviso', 'Configuración', 'No se pudo consultar “Editar ajustes”',
                'Sesión docente con permiso de edición', e.message, null);
        }
        try {
            var preguntas = await traerDocumento(sitio.origen + sitio.base + '/mod/quiz/edit.php?cmid=' + encodeURIComponent(sitio.cmid));
            revisarPuntajesDoc(preguntas);
        } catch (e) {
            anotar('aviso', 'Puntajes', 'No se pudo consultar la pantalla “Preguntas”',
                'Puntajes como información', e.message, null);
        }
    }

    function pintar(resumen) {
        limpiarMarcas();
        var errores = hallazgos.filter(function (h) { return h.nivel === 'error'; });
        var avisos = hallazgos.filter(function (h) { return h.nivel === 'aviso'; });
        var infos = hallazgos.filter(function (h) { return h.nivel === 'info'; });
        hallazgos.forEach(function (h) {
            if (!h.nodo || h.nivel === 'info') return;
            h.nodo.style.outline = '3px solid ' + (h.nivel === 'error' ? '#c62828' : '#ef6c00');
            h.nodo.classList.add('qacf-marca');
        });
        var estado = errores.length ? 'CON ERRORES' : (avisos.length ? 'REVISAR AVISOS' : 'TODO CORRECTO');
        var color = errores.length ? '#c62828' : (avisos.length ? '#ef6c00' : '#2e7d32');
        var panel = document.createElement('div');
        panel.id = 'qacf-panel';
        panel.style.cssText = 'position:fixed;top:12px;right:12px;width:480px;max-height:90vh;overflow:auto;'
            + 'z-index:2147483647;background:#fff;color:#222;border:1px solid #ddd;border-radius:12px;'
            + 'padding:14px 16px;box-shadow:0 12px 44px rgba(0,0,0,.35);font:13px/1.5 system-ui,sans-serif';
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
            + '<strong style="font-size:15px">QA de Cuestionario · Moodle 5.1</strong>'
            + '<button id="qacf-cerrar" style="border:0;background:#eee;border-radius:6px;padding:4px 10px;cursor:pointer">Cerrar</button></div>'
            + '<div style="background:' + color + ';color:#fff;padding:9px 11px;border-radius:8px;font-weight:700;margin-bottom:10px">'
            + estado + '</div><div style="color:#555;margin-bottom:10px">' + esc(resumen) + '</div>';

        [['error', 'Errores', '#c62828', '#fff5f5'], ['aviso', 'Avisos', '#ef6c00', '#fff9ed'], ['info', 'Información', '#1565c0', '#f3f8ff']]
            .forEach(function (tipo) {
                var lista = hallazgos.filter(function (h) { return h.nivel === tipo[0]; });
                if (!lista.length) return;
                html += '<h4 style="margin:14px 0 6px;color:' + tipo[2] + '">' + tipo[1] + ' (' + lista.length + ')</h4>';
                lista.forEach(function (h) {
                    var d = diferencia(h.esperado, h.actual);
                    html += '<div style="border-left:3px solid ' + tipo[2] + ';padding:7px 9px;margin:6px 0;background:' + tipo[3] + ';border-radius:0 6px 6px 0">'
                        + '<strong>' + esc(h.grupo) + ' · ' + esc(h.titulo) + '</strong>';
                    if (h.esperado || h.actual) {
                        html += '<div style="margin-top:4px;white-space:pre-wrap">'
                            + (h.esperado ? '<strong>Esperado:</strong> ' + d.esperado + '<br>' : '')
                            + '<strong>En Moodle:</strong> ' + d.actual + '</div>';
                    }
                    html += '</div>';
                });
            });
        if (!errores.length && !avisos.length) {
            html += '<div style="background:#e8f5e9;border-left:3px solid #2e7d32;padding:10px;border-radius:6px">'
                + 'Contenido, respuestas correctas, retroalimentaciones y configuración coinciden con el Word.</div>';
        }
        panel.innerHTML = html;
        document.body.appendChild(panel);
        document.getElementById('qacf-cerrar').onclick = function () { limpiarMarcas(); };
        var primero = document.querySelector('.qacf-marca');
        if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { errores: errores.length, avisos: avisos.length, informacion: infos.length };
    }

    panelCargando();
    var resultado = await cotejarContenido();
    await cotejarPaginasInternas(resultado);
    return pintar(esperado.preguntas.length + ' reactivos del Word cotejados · los puntajes son informativos');
};
