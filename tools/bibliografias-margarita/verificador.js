/* ==========================================================================
   El verificador de bibliografías que se ejecuta DENTRO de Moodle.

   Vive aquí como una función normal y se envía con `toString()`: script.js la
   envuelve junto con el MOTOR (qa.js) y con el generador de evidencia
   (assets/evidencia-qa.js), y le pasa los dos como argumentos. Se escribe así,
   y no como una plantilla de texto, porque una plantilla obliga a escapar cada
   acento grave y cada `${` del código: fue justo lo que dejó ilegible al QA de
   3.11.

   Reparto de trabajo, y conviene no mezclarlo:

   · El COTEJO no está aquí. Está en el motor, que también usa el modo de pegar
     el HTML de la herramienta. Aquí solo se decide DÓNDE mirar dentro de la
     página de Moodle, se enmarca lo que no cuadra y se dibuja el panel.
   · NUNCA se escribe en la página. Se leen nodos, se les pone un contorno y se
     agrega un panel flotante; el contorno se quita al cerrar.

   Por qué revisar aquí y no solo sobre el HTML pegado: en la página viva ya
   corrieron los filtros de Moodle. Si a un enlace de YouTube le faltó el
   `span.nolink`, aquí se ve **el reproductor ya incrustado**; en el código del
   editor no había nada raro que mirar.

   Como la función se serializa, no puede depender de NADA de fuera: todo lo que
   usa va dentro de su cuerpo o llega por argumento.
   ========================================================================== */

window.VERIFICADOR_BIBLIO = function (DATOS, motor, evidencia) {
    'use strict';

    var MARCA = 'qabib-marca';

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    /* ------------------------------------------------- Dónde está la lista

       Se busca de lo más específico a lo más general. El primer selector es el
       bloque que monta la herramienta (`#fuentes` dentro del envoltorio de la
       plantilla); si la página se armó a mano puede no estar, y entonces sirve
       el contenido del recurso. Lo que NO se hace es tomar `document.body`: el
       menú del curso, el pie y los bloques laterales están llenos de <a> sin
       `target` y el informe salía con cien errores que no son de la página. */
    function raizDeLaBibliografia() {
        var candidatos = [
            '#fuentes',
            '.mainPlantilla23',
            '#region-main .no-overflow',
            '#region-main [role="main"]',
            '#region-main .box.generalbox',
            '#region-main'
        ];
        for (var i = 0; i < candidatos.length; i++) {
            var n = document.querySelector(candidatos[i]);
            // Con menos de dos párrafos no es la bibliografía: es un cascarón.
            if (n && n.querySelectorAll('p, li').length >= 2) return n;
        }
        return null;
    }

    /* ------------------------------------------------- Diferencia resaltada
       Se recortan el prefijo y el sufijo comunes y se pinta lo de en medio: es
       lo único que hace legible un "casi igual" de 300 caracteres. Mismo
       criterio que las otras dos herramientas de QA. */
    function diferencia(esperado, actual) {
        var a = String(esperado || ''), b = String(actual || '');
        var i = 0, fa = a.length, fb = b.length;
        while (i < fa && i < fb && a[i] === b[i]) i++;
        while (fa > i && fb > i && a[fa - 1] === b[fb - 1]) { fa--; fb--; }
        var marca = function (s) {
            return s ? '<mark style="background:#ffe082;padding:0 2px;border-radius:2px">' + esc(s) + '</mark>' : '';
        };
        return {
            esperado: esc(a.slice(0, i)) + marca(a.slice(i, fa)) + esc(a.slice(fa)),
            actual: b ? esc(b.slice(0, i)) + marca(b.slice(i, fb)) + esc(b.slice(fb))
                : '<em>no aparece</em>'
        };
    }

    /* --------------------------------------------------------- Arranque */

    var raiz = raizDeLaBibliografia();
    if (!raiz) {
        alert('No se encontró la bibliografía en esta página.\n\n'
            + 'Ábrela ya guardada (el recurso Página, no el editor) y vuelve a pulsar el marcador.');
        return;
    }
    if (!DATOS.fuentes || !DATOS.fuentes.length) {
        alert('Este marcador se generó sin el Word de las fuentes.');
        return;
    }

    var informe = motor(DATOS, raiz);

    /* --------------------------------------------------------- Enmarcado
       Cada caso trae el nodo que lo provocó. Se le pone un contorno del color
       de su nivel para poder verlo en la página, y se quita al cerrar: la
       revisión no deja rastro. */
    function limpiarMarcas() {
        [].slice.call(document.querySelectorAll('.' + MARCA)).forEach(function (n) {
            n.style.outline = '';
            n.style.outlineOffset = '';
            n.classList.remove(MARCA);
        });
    }

    limpiarMarcas();
    var viejo = document.getElementById('qabib-panel');
    if (viejo) viejo.remove();

    var marcados = 0;
    informe.hallazgos.forEach(function (h) {
        h.items.forEach(function (it) {
            if (!it.nodo || !it.nodo.style) return;
            it.nodo.style.outline = '3px solid ' + (h.nivel === 'error' ? '#c62828' : '#ef6c00');
            it.nodo.style.outlineOffset = '2px';
            it.nodo.classList.add(MARCA);
            marcados++;
        });
    });

    /* ------------------------------------------------------------ Panel */

    var estado = informe.errores ? 'HAY QUE CORREGIR'
        : (informe.avisos ? 'REVISAR AVISOS' : 'TODO CORRECTO');
    var color = informe.errores ? '#c62828' : (informe.avisos ? '#ef6c00' : '#2e7d32');
    var r = informe.resumen;
    var resumen = r.fuentesWord + ' fuentes del Word cotejadas · ' + r.iguales + ' idénticas · '
        + r.enlaces + ' enlaces (' + r.youtube + ' de YouTube)';

    var panel = document.createElement('div');
    panel.id = 'qabib-panel';
    panel.style.cssText = 'position:fixed;top:12px;right:12px;width:460px;max-height:90vh;overflow:auto;'
        + 'z-index:2147483647;background:#fff;color:#222;border:1px solid #ddd;border-radius:12px;'
        + 'padding:14px 16px;box-shadow:0 12px 44px rgba(0,0,0,.35);font:13px/1.5 system-ui,sans-serif';

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
        + '<strong style="font-size:15px">QA de bibliografía · Moodle 5.1</strong>'
        + '<button id="qabib-cerrar" style="border:0;background:#eee;border-radius:6px;padding:4px 10px;cursor:pointer">Cerrar</button></div>'
        + '<div style="background:' + color + ';color:#fff;padding:9px 11px;border-radius:8px;font-weight:700;margin-bottom:10px">'
        + estado + ' · ' + informe.errores + ' error(es), ' + informe.avisos + ' aviso(s)</div>'
        + '<div style="color:#555;margin-bottom:4px">' + esc(resumen) + '</div>'
        + '<div style="color:#555;margin-bottom:10px">Sangría francesa: Word <b>' + esc(r.sangria.word || '—')
        + '</b> · en la página <b>' + r.sangria.moodleCon + ' de ' + r.sangria.moodleTotal + '</b>'
        + (r.estructura.paleta ? ' · paleta <b>' + esc(r.estructura.paleta) + '</b>' : '') + '</div>'
        + '<button id="qabib-evidencia" style="width:100%;border:1px solid ' + color + ';background:#fff;color:'
        + color + ';border-radius:8px;padding:8px 10px;margin-bottom:10px;cursor:pointer;font:inherit;'
        + 'font-weight:700">Generar evidencia (PDF)</button>';

    if (!informe.hallazgos.length) {
        html += '<div style="background:#e8f5e9;border-left:3px solid #2e7d32;padding:10px;border-radius:6px">'
            + 'Todas las fuentes del Word están montadas y con su texto exacto, los enlaces abren en '
            + 'pestaña nueva y la sangría es la del documento.</div>';
    }

    [['error', 'Errores', '#c62828', '#fff5f5'], ['aviso', 'Avisos', '#ef6c00', '#fff9ed']].forEach(function (t) {
        var lista = informe.hallazgos.filter(function (h) { return h.nivel === t[0]; });
        if (!lista.length) return;
        html += '<h4 style="margin:14px 0 6px;color:' + t[2] + '">' + t[1] + '</h4>';
        lista.forEach(function (h) {
            var etiquetas = h.etiquetas || ['Word', 'Moodle'];
            html += '<div style="border-left:3px solid ' + t[2] + ';padding:7px 9px;margin:6px 0;background:'
                + t[3] + ';border-radius:0 6px 6px 0">'
                + '<div><strong>' + esc(h.grupo) + ' · ' + esc(h.titulo) + '</strong>'
                + (h.items.length ? ' <span style="color:#777">(' + h.items.length + ')</span>' : '') + '</div>'
                + '<div style="color:#555;margin-top:2px">' + esc(h.nota) + '</div>';
            /* Los primeros casos, no los cuarenta: el panel tiene que leerse.
               La evidencia en PDF los lleva todos. */
            h.items.slice(0, 12).forEach(function (it) {
                var d = diferencia(it.esperado, it.actual);
                html += '<div style="margin-top:5px;padding-top:5px;border-top:1px dotted #ddd">'
                    + (it.esperado ? '<strong>' + esc(etiquetas[0]) + ':</strong> ' + d.esperado + '<br>' : '')
                    + (h.sinLadoActual ? ''
                        : '<strong>' + esc(etiquetas[1]) + ':</strong> ' + d.actual) + '</div>';
            });
            if (h.items.length > 12) {
                html += '<div style="margin-top:5px;color:#777;font-style:italic">…y '
                    + (h.items.length - 12) + ' más. Están en la evidencia.</div>';
            }
            html += '</div>';
        });
    });

    panel.innerHTML = html;
    document.body.appendChild(panel);

    document.getElementById('qabib-cerrar').onclick = function () {
        limpiarMarcas();
        panel.remove();
    };

    document.getElementById('qabib-evidencia').onclick = function () {
        var hallazgos = [];
        informe.hallazgos.forEach(function (h) {
            if (!h.items.length) {
                hallazgos.push({ nivel: h.nivel, grupo: h.grupo, titulo: h.titulo + ' — ' + h.nota });
                return;
            }
            h.items.forEach(function (it) {
                var d = diferencia(it.esperado, it.actual);
                hallazgos.push({
                    nivel: h.nivel, grupo: h.grupo, titulo: h.titulo,
                    esperadoHtml: it.esperado ? d.esperado : '',
                    actualHtml: h.sinLadoActual ? '' : d.actual
                });
            });
        });
        evidencia({
            hallazgos: hallazgos,
            tipo: 'Bibliografía',
            titulo: r.estructura.titulo || 'Bibliografía',
            subtitulo: DATOS.archivo || '',
            clave: DATOS.clave || 'bibliografia',
            herramienta: 'Bibliografías Margarita Maza',
            estado: estado,
            color: color,
            etiquetaEsperado: 'En el Word',
            ficha: [
                ['Word cotejado', DATOS.archivo || '—'],
                ['Fuentes en el Word', String(r.fuentesWord)],
                ['Párrafos en la página', String(r.fuentesMoodle)],
                ['Fuentes idénticas', String(r.iguales)],
                ['Enlaces montados', r.enlaces + ' (' + r.youtube + ' de YouTube)'],
                ['Sangría francesa', 'Word: ' + (r.sangria.word || '—') + ' · página: '
                    + r.sangria.moodleCon + ' de ' + r.sangria.moodleTotal],
                ['Paleta del aula', r.estructura.paleta || '—']
            ],
            textoTodoBien: 'La bibliografía montada coincide con el Word.',
            resumen: resumen,
            notaAlcance: 'Cubre el texto de cada fuente, los enlaces y la sangría francesa.'
        });
    };

    var primero = document.querySelector('.' + MARCA);
    if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return { errores: informe.errores, avisos: informe.avisos, marcados: marcados };
};
