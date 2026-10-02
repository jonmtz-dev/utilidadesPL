/* ==========================================================================
   El verificador que se ejecuta DENTRO de Moodle 3.11, para el plugin
   Questionnaire (`mod/questionnaire`).

   Vive aquí como función normal y se envía con `toString()` (script.js la
   envuelve con los datos del Word). Mismas reglas que el resto de los QA:

   1. SOLO LEE. Todo son peticiones GET a páginas que el docente ya puede
      abrir. No responde, no envía formularios, no guarda nada. Tampoco abre
      `complete.php` ni inicia un intento: ahí sí hay efectos secundarios.
   2. Compara TEXTO, no etiquetas: Moodle reescribe p/li/h2 al guardar.
   3. Tres severidades: error (falta o cambia algo), aviso (coincide salvo
      puntuación, acentos o mayúsculas, o hay algo que mirar) e info (dato leído
      de Moodle sin juicio, o algo que no se puede comprobar solo y queda «a
      ojo»).

   DE DÓNDE SALE CADA COSA. Questionnaire guarda todo en formularios de
   edición, y esos formularios abren por GET:

     course/modedit.php?update=ID                       ajustes + introducción
     mod/questionnaire/questions.php?id=ID              el orden de las preguntas
     mod/questionnaire/questions.php?id=ID&action=question&qid=QID
                                                        cada pregunta (HTML crudo)

   Se lee el HTML CRUDO del formulario y no la vista previa a propósito: ahí
   está lo que se escribió, con sus negritas y sus residuos, no lo que el tema
   decidió dibujar.

   Como la función se serializa, no puede depender de NADA de fuera.
   ========================================================================== */

window.VERIFICADOR_QA_CUESTIONARIO_311 = function (DATOS, evidencia) {
    'use strict';

    var G = DATOS.guion;
    var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    var TIPOS = {
        1: 'Sí/No', 2: 'Caja de texto', 3: 'Caja para ensayo', 4: 'Botones de Selección',
        5: 'Casillas de selección', 6: 'Caja desplegable', 8: 'Valorar (escala)', 9: 'Fecha',
        10: 'Numérico', 99: 'Salto de página', 100: 'Etiqueta'
    };

    /* ------------------------------------------------------------ Normalizar */

    function limpiar(s) {
        return String(s == null ? '' : s)
            .replace(/[\u00a0\u200b\u200c\u200d\u00ad\ufeff]/g, ' ')
            .replace(/[“”«»]/g, '"')
            .replace(/[‘’]/g, "'")
            .replace(/\s+/g, ' ')
            .trim()
            .normalize('NFC');
    }

    /** Clave tolerante: sin acentos, sin puntuación, en minúsculas. */
    function firma(s) {
        return limpiar(s)
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('es-MX')
            .replace(/[^\p{L}\p{N}]+/gu, ' ')
            .trim();
    }

    /** Parecido entre dos textos (0 a 1): coeficiente de Dice sobre sus palabras. */
    function similitud(a, b) {
        var A = firma(a).split(' ').filter(Boolean), B = firma(b).split(' ').filter(Boolean);
        if (!A.length || !B.length) return 0;
        var usadas = {}, comunes = 0;
        B.forEach(function (w) { usadas[w] = (usadas[w] || 0) + 1; });
        A.forEach(function (w) { if (usadas[w] > 0) { comunes++; usadas[w]--; } });
        return (2 * comunes) / (A.length + B.length);
    }

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    /** Quita el número que se tecleó a mano al principio del enunciado: `2. ¿Qué…?`. */
    function sinNumero(s) {
        var t = limpiar(s);
        var m = /^(\d{1,2})\s*[.)\-–]\s*(.*)$/.exec(t);
        return m ? { numero: Number(m[1]), texto: m[2] } : { numero: null, texto: t };
    }

    /** El último signo de puntuación no distingue una negrita de otra («Importante:» / «Importante»). */
    function sinColaDePuntuacion(s) {
        return firma(String(s).replace(/[\s:;,.]+$/, ''));
    }

    /** Si Moodle ALARGA o ACORTA el texto del guion se dice así, y no «no coincide» a secas. */
    function tituloDeDiferencia(esperado, actual, generico) {
        var fe = firma(esperado), fa = firma(actual);
        if (fe && fa.indexOf(fe) === 0) return 'Moodle agrega texto al final que el guion no trae';
        if (fa && fe.indexOf(fa) === 0) return 'Moodle omite el final del texto del guion';
        return generico;
    }

    /* ------------------------------------------------- Diferencia resaltada */

    function diferencia(esperado, actual) {
        esperado = limpiar(esperado);
        actual = limpiar(actual);
        var i = 0, fe = esperado.length, fa = actual.length;
        while (i < fe && i < fa && esperado[i] === actual[i]) i++;
        while (fe > i && fa > i && esperado[fe - 1] === actual[fa - 1]) { fe--; fa--; }
        var marca = function (s) {
            return s ? '<mark style="background:#ffe082;padding:0 2px;border-radius:2px">' + esc(s) + '</mark>' : '';
        };
        return {
            esperado: esc(esperado.slice(0, i)) + marca(esperado.slice(i, fe)) + esc(esperado.slice(fe)),
            actual: actual ? esc(actual.slice(0, i)) + marca(actual.slice(i, fa)) + esc(actual.slice(fa))
                : '<em>no aparece</em>'
        };
    }

    /* ------------------------------------------------------------ Hallazgos */
    var hallazgos = [];   // { nivel, grupo, titulo, esperado, actual, crudo }
    var revisados = 0, correctos = 0;

    function anotar(nivel, grupo, titulo, esperado, actual, crudo) {
        hallazgos.push({ nivel: nivel, grupo: grupo, titulo: titulo, esperado: esperado || '', actual: actual || '', crudo: Boolean(crudo) });
    }

    /* ------------------------------------------------------------------ Red */

    function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    /* Cada petición estrena sus 20 s y se reintenta una vez: Moodle abre el
       formulario completo por cada pregunta y a veces tarda. */
    async function pedir(url) {
        var ultimo;
        for (var intento = 0; intento < 2; intento++) {
            var control = new AbortController();
            var corte = setTimeout(function () { control.abort(); }, 20000);
            try {
                var r = await fetch(url, { credentials: 'include', signal: control.signal });
                clearTimeout(corte);
                if (!r.ok) throw new Error('HTTP ' + r.status);
                if (/\/login\/index\.php/.test(r.url)) throw new Error('la sesión de Moodle expiró');
                return await r.text();
            } catch (e) {
                clearTimeout(corte);
                ultimo = e;
                await esperar(600);
            }
        }
        throw new Error((ultimo && ultimo.name === 'AbortError' ? 'no respondió a tiempo' : (ultimo && ultimo.message)) + ' · ' + url);
    }

    async function documento(url) {
        return new DOMParser().parseFromString(await pedir(url), 'text/html');
    }

    /** Lotes de N en paralelo: quince formularios a la vez saturan el PHP del sitio. */
    async function enLotes(items, n, fn) {
        var salida = new Array(items.length), i = 0;
        var obreros = [];
        for (var k = 0; k < Math.min(n, items.length); k++) {
            obreros.push((async function () {
                while (i < items.length) { var j = i++; salida[j] = await fn(items[j], j); }
            }()));
        }
        await Promise.all(obreros);
        return salida;
    }

    /* ------------------------------------------------------- HTML a párrafos */

    var SELECTOR_BLOQUE = 'p,li,h1,h2,h3,h4,h5,h6,div,blockquote,table,ul,ol,tr';

    function esNegrita(el) {
        var n = el;
        while (n && n.nodeType === 1) {
            if (/^(STRONG|B)$/.test(n.tagName)) return true;
            if (/font-weight\s*:\s*(bold|[6-9]00)/i.test(n.getAttribute('style') || '')) return true;
            n = n.parentNode;
        }
        return false;
    }
    function esCursiva(el) {
        var n = el;
        while (n && n.nodeType === 1) {
            if (/^(EM|I)$/.test(n.tagName)) return true;
            if (/font-style\s*:\s*italic/i.test(n.getAttribute('style') || '')) return true;
            n = n.parentNode;
        }
        return false;
    }

    /** Los tramos MAXIMALES con un formato: dos `<strong>` pegados cuentan como uno. */
    function tramos(raiz, quien) {
        var salida = [], abierto = '';
        (function recorrer(nodo) {
            [].slice.call(nodo.childNodes).forEach(function (n) {
                if (n.nodeType === 3) {
                    var t = n.nodeValue || '';
                    if (!limpiar(t)) { if (abierto) abierto += t; return; }   // un espacio no corta la negrita
                    if (quien(n.parentNode)) abierto += t;
                    else { if (limpiar(abierto)) salida.push(limpiar(abierto)); abierto = ''; }
                } else if (n.nodeType === 1) recorrer(n);
            });
        }(raiz));
        if (limpiar(abierto)) salida.push(limpiar(abierto));
        return salida;
    }

    function parrafosDeHtml(html) {
        var d = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
        var salida = [];
        (function recorrer(nodo) {
            [].slice.call(nodo.children).forEach(function (el) {
                if (/^(SCRIPT|STYLE)$/.test(el.tagName)) return;
                if (el.querySelector(SELECTOR_BLOQUE)) { recorrer(el); return; }
                var texto = limpiar(el.textContent);
                if (!texto) return;
                salida.push({ texto: texto, negritas: tramos(el, esNegrita), cursivas: tramos(el, esCursiva) });
            });
        }(d.body));
        if (!salida.length && limpiar(d.body.textContent)) {
            salida.push({ texto: limpiar(d.body.textContent), negritas: [], cursivas: [] });
        }
        return salida;
    }

    /* ------------------------------------------------- Leer Moodle (por GET) */

    function valor(doc, nombre) {
        var e = doc.querySelector('[name="' + nombre + '"]');
        if (!e) return null;
        if (e.tagName === 'SELECT') return e.options[e.selectedIndex] ? e.value : null;
        if (e.type === 'checkbox') return e.checked;
        if (e.type === 'radio') { var c = doc.querySelector('[name="' + nombre + '"]:checked'); return c ? c.value : null; }
        return e.value;
    }
    function textoDeSelect(doc, nombre) {
        var e = doc.querySelector('select[name="' + nombre + '"]');
        return e && e.options[e.selectedIndex] ? limpiar(e.options[e.selectedIndex].text) : '';
    }

    function fechaDeAjustes(doc, prefijo) {
        var g = function (c) { return valor(doc, prefijo + '[' + c + ']'); };
        return {
            activa: Boolean(g('enabled')),
            dia: Number(g('day')), mes: Number(g('month')), anio: Number(g('year')),
            hora: Number(g('hour')), min: Number(g('minute'))
        };
    }

    async function leerMoodle(id, progreso) {
        var base = location.origin;
        progreso('Leyendo los ajustes…');
        var ajustes = await documento(base + '/course/modedit.php?update=' + id);
        if (!ajustes.querySelector('[name="introeditor[text]"]')) {
            throw new Error('No se pudieron leer los ajustes. Hace falta una sesión con permiso de edición (docente o editor).');
        }
        var cfg = {
            nombre: limpiar(valor(ajustes, 'name')),
            introHtml: valor(ajustes, 'introeditor[text]') || '',
            qtype: String(valor(ajustes, 'qtype')),
            qtypeTexto: textoDeSelect(ajustes, 'qtype'),
            respondenttype: String(valor(ajustes, 'respondenttype')),
            visible: textoDeSelect(ajustes, 'visible'),
            abre: fechaDeAjustes(ajustes, 'opendate'),
            cierra: fechaDeAjustes(ajustes, 'closedate'),
            restriccion: limpiar(valor(ajustes, 'availabilityconditionsjson') || '')
        };

        progreso('Leyendo la lista de preguntas…');
        var lista = await documento(base + '/mod/questionnaire/questions.php?id=' + id);
        var qids = [].slice.call(lista.querySelectorAll('input[name^="editbutton["]'))
            .map(function (e) { return (/\[(\d+)\]/.exec(e.name) || [])[1]; })
            .filter(Boolean);
        if (!qids.length) throw new Error('El cuestionario no tiene preguntas, o no se pudo leer su lista.');

        var hechas = 0;
        var preguntas = await enLotes(qids, 3, async function (qid) {
            var f = await documento(base + '/mod/questionnaire/questions.php?id=' + id + '&action=question&qid=' + qid);
            progreso('Leyendo las preguntas… ' + (++hechas) + ' de ' + qids.length);
            var tipoId = Number(valor(f, 'type_id'));
            var opciones = limpiar(valor(f, 'allchoices') || '') ? String(valor(f, 'allchoices')).split(/\r?\n/).map(limpiar).filter(Boolean) : [];
            return {
                qid: qid, tipoId: tipoId, tipo: TIPOS[tipoId] || ('tipo ' + tipoId),
                nombre: limpiar(valor(f, 'name')),
                requerida: valor(f, 'required') === 'y',
                contenidoHtml: valor(f, 'content[text]') || '',
                opciones: opciones,
                lineas: textoDeSelect(f, 'length'),
                formato: textoDeSelect(f, 'precise')
            };
        });
        return { cfg: cfg, preguntas: preguntas };
    }

    /* ---------------------------------------------- Cotejar listas de párrafos */

    /**
     * Empareja lo que dice el guion con lo que hay en Moodle y anota lo que no
     * coincide. El emparejamiento es GLOBAL (los pares más parecidos primero) y
     * no párrafo por párrafo: quien monta a veces agrega un encabezado en
     * medio, y emparejando en orden ese solo párrafo de más descuadraba todo lo
     * que viene después.
     */
    function cotejarParrafos(grupo, esperados, reales) {
        var candidatos = [];
        esperados.forEach(function (e, i) {
            reales.forEach(function (r, j) {
                var s = limpiar(e.texto) === limpiar(r.texto) ? 2 : similitud(e.texto, r.texto);
                if (s >= 0.5) candidatos.push({ i: i, j: j, s: s });
            });
        });
        candidatos.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
        var parDe = {}, usado = {};
        candidatos.forEach(function (c) {
            if (parDe[c.i] !== undefined || usado[c.j]) return;
            parDe[c.i] = c.j; usado[c.j] = true;
        });

        var ultimo = -1, desordenado = false;
        esperados.forEach(function (e, i) {
            revisados++;
            var j = parDe[i];
            if (j === undefined) {
                anotar('error', grupo, 'Falta este texto en Moodle', e.texto, '');
                return;
            }
            var r = reales[j];
            if (j < ultimo) desordenado = true;
            ultimo = Math.max(ultimo, j);

            var igual = limpiar(e.texto) === limpiar(r.texto);
            if (igual) correctos++;
            else if (firma(e.texto) === firma(r.texto)) {
                anotar('aviso', grupo, 'El texto coincide salvo puntuación, acentos o mayúsculas', e.texto, r.texto);
            } else {
                anotar('error', grupo, tituloDeDiferencia(e.texto, r.texto, 'El texto no coincide con el guion'), e.texto, r.texto);
            }

            /* Las negritas y cursivas del guion. En un párrafo que el guion
               marca en VERDE («deberá conservar el estilo») que falten es
               error; en los demás, aviso. */
            var grave = e.conservaEstilo ? 'error' : 'aviso';
            [['negritas', 'negrita'], ['cursivas', 'cursiva']].forEach(function (par) {
                (e[par[0]] || []).forEach(function (t) {
                    var buscada = sinColaDePuntuacion(t);
                    var esta = (r[par[0]] || []).some(function (x) {
                        var f = sinColaDePuntuacion(x);
                        return f === buscada || (f && buscada && (f.indexOf(buscada) >= 0 || buscada.indexOf(f) >= 0));
                    });
                    if (!esta) anotar(grave, grupo, 'Falta la ' + par[1] + ' del guion', '«' + t + '» en ' + par[1], '«' + t + '» sin ' + par[1]);
                });
            });
        });
        if (desordenado) anotar('aviso', grupo, 'El orden de los párrafos no es el del guion', '', '');

        reales.forEach(function (r, j) {
            if (usado[j]) return;
            anotar('aviso', grupo, 'Texto en Moodle que el guion no trae', '', r.texto);
        });
        return parDe;
    }

    /* ---------------------------------------------------------------- Fechas */

    function textoDeFecha(f) {
        var dd = function (n) { return String(n).padStart(2, '0'); };
        return dd(f.dia) + ' de ' + MESES[f.mes - 1] + ' de ' + f.anio + ', ' + dd(f.hora) + ':' + dd(f.min);
    }
    /* El texto de la introducción rara vez trae el año. Se usa el de los AJUSTES
       si la fecha está activada y, si no, el año en que esa fecha queda más cerca
       de hoy: así «5 de octubre» escrito en octubre es de este año, y «5 de
       enero» escrito en diciembre es del que viene. Aceptar «cualquiera de los
       dos» dejaba pasar dos de cada siete días de la semana equivocados. */
    function anioProbable(dia, mes) {
        var hoy = new Date(), mejor = hoy.getFullYear(), distancia = Infinity;
        [hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1].forEach(function (a) {
            var d = Math.abs(new Date(a, mes - 1, dia).getTime() - hoy.getTime());
            if (d < distancia) { distancia = d; mejor = a; }
        });
        return mejor;
    }
    function diaDeLaSemana(dia, mes, anio) {
        return DIAS[new Date(anio, mes - 1, dia).getDay()];
    }

    /** Lo que dice el TEXTO de la introducción: «lunes 05 de octubre, a las 00:00 … el domingo 11 de octubre, a las 23:59». */
    function fechasDelTexto(texto) {
        var m = /disponible a partir del\s+(\p{L}+)\s+(\d{1,2})\s+de\s+(\p{L}+)(?:\s+de\s+(\d{4}))?\s*,?\s*a las\s+(\d{1,2}):(\d{2})[^]*?cerrar[aá]\s+el\s+(\p{L}+)\s+(\d{1,2})\s+de\s+(\p{L}+)(?:\s+de\s+(\d{4}))?\s*,?\s*a las\s+(\d{1,2}):(\d{2})/iu.exec(texto);
        if (!m) return null;
        var mes = function (n) { return MESES.indexOf(String(n).toLowerCase()) + 1; };
        return {
            abre: { dia: m[1].toLowerCase(), d: Number(m[2]), mes: mes(m[3]), anio: m[4] ? Number(m[4]) : null, hora: Number(m[5]), min: Number(m[6]) },
            cierra: { dia: m[7].toLowerCase(), d: Number(m[8]), mes: mes(m[9]), anio: m[10] ? Number(m[10]) : null, hora: Number(m[11]), min: Number(m[12]) }
        };
    }

    function revisarFechas(cfg) {
        var textoIntro = parrafosDeHtml(cfg.introHtml).map(function (p) { return p.texto; }).join(' ');
        if (/\[\s*fecha\s*\]/i.test(textoIntro)) {
            anotar('error', 'FECHAS', 'Quedó la fecha sin llenar en la introducción', '', 'La introducción todavía dice «[fecha]»: hay que escribir la fecha.', true);
        }
        var t = fechasDelTexto(textoIntro);
        if (!t) {
            if (G.fechas) anotar('aviso', 'FECHAS', 'No se pudieron leer las fechas del texto de la introducción', 'lunes … a las 00:00 horas … domingo … a las 23:59 horas', '');
            return;
        }

        var coteja = function (lado, texto, ajuste, etiqueta, pedida) {
            var nombre = lado === 'abre' ? 'apertura' : 'cierre';
            var anio = texto.anio || (ajuste.activa && ajuste.anio) || anioProbable(texto.d, texto.mes);
            var diaReal = diaDeLaSemana(texto.d, texto.mes, anio);
            if (diaReal !== texto.dia) {
                anotar('error', 'FECHAS', 'El día de la semana de la ' + nombre + ' no corresponde a la fecha', '',
                    'El texto dice «' + texto.dia + ' ' + texto.d + ' de ' + MESES[texto.mes - 1] + '», pero el ' + texto.d + ' de '
                    + MESES[texto.mes - 1] + ' de ' + anio + ' es ' + diaReal + '.', true);
            }
            if (pedida) {
                var hh = String(texto.hora).padStart(2, '0') + ':' + String(texto.min).padStart(2, '0');
                var horaGuion = lado === 'abre' ? pedida.horaApertura : pedida.horaCierre;
                var diaGuion = lado === 'abre' ? pedida.diaApertura : pedida.diaCierre;
                if (hh !== horaGuion) anotar('error', 'FECHAS', 'La hora de la ' + nombre + ' no es la del guion', 'a las ' + horaGuion, 'a las ' + hh);
                if (diaGuion && diaGuion !== texto.dia) anotar('error', 'FECHAS', 'El día de la semana de la ' + nombre + ' no es el del guion', diaGuion, texto.dia);
            }
            var dd = function (n) { return String(n).padStart(2, '0'); };
            var esperado = texto.dia + ' ' + dd(texto.d) + ' de ' + MESES[texto.mes - 1] + ', ' + dd(texto.hora) + ':' + dd(texto.min);
            revisados++;
            if (!ajuste.activa) {
                anotar('error', 'FECHAS', 'La ' + etiqueta + ' NO está activada en los ajustes de Moodle', '',
                    'El texto de la introducción dice «' + esperado + '», pero en los ajustes «Permitir respuestas '
                    + (lado === 'abre' ? 'desde' : 'hasta') + '» está desactivado.', true);
                return;
            }
            var coincide = ajuste.dia === texto.d && ajuste.mes === texto.mes && ajuste.hora === texto.hora && ajuste.min === texto.min
                && (!texto.anio || ajuste.anio === texto.anio);
            if (coincide) correctos++;
            else anotar('error', 'FECHAS', 'La ' + etiqueta + ' de los ajustes no es la que dice el texto', '',
                'El texto de la introducción dice «' + esperado + '», pero los ajustes tienen «' + textoDeFecha(ajuste) + '».', true);
        };
        coteja('abre', t.abre, cfg.abre, 'fecha de apertura', G.fechas);
        coteja('cierra', t.cierra, cfg.cierra, 'fecha de cierre', G.fechas);

        if ((!cfg.abre.activa || !cfg.cierra.activa) && cfg.restriccion) {
            anotar('info', 'FECHAS', 'Hay una restricción de acceso configurada', '', cfg.restriccion.slice(0, 220), true);
        } else if (!cfg.abre.activa && !cfg.cierra.activa && !cfg.restriccion) {
            anotar('info', 'FECHAS', 'Tampoco hay restricción de acceso por fechas',
                '', 'Ni en «Permitir respuestas» ni en «Restringir acceso»: el cuestionario está abierto para el estudiantado ya.', true);
        }
    }

    /* ----------------------------------------------------------------- Título */

    function revisarTitulo(cfg) {
        if (!G.titulo) { anotar('aviso', 'TÍTULO', 'El guion no trae «Título del recurso»', '', cfg.nombre); return; }
        revisados++;
        if (limpiar(G.titulo) === cfg.nombre) correctos++;
        else if (firma(G.titulo) === firma(cfg.nombre)) anotar('aviso', 'TÍTULO', 'El título coincide salvo puntuación o acentos', G.titulo, cfg.nombre);
        else anotar('error', 'TÍTULO', 'El nombre de la actividad no es el del guion', G.titulo, cfg.nombre);
    }

    /* ----------------------------------------------------------- Introducción */

    function revisarIntro(cfg) {
        var reales = parrafosDeHtml(cfg.introHtml);
        var esperados = [];
        var fecha = null;
        G.intro.forEach(function (p) {
            if (p.rol !== 'contenido') return;
            if (p.plantillaFecha) { fecha = p; return; }
            esperados.push(p);
        });

        /* La línea de las fechas lleva «[fecha]» en el guion y la fecha escrita
           en Moodle: se coteja como patrón (la fecha puede ser cualquiera) y las
           fechas de verdad se revisan aparte contra los ajustes. */
        if (fecha) {
            var patron = new RegExp('^' + limpiar(fecha.texto)
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                .replace(/\\\[\s*fecha\s*\\\]/gi, '.{3,40}?') + '$', 'i');
            var j = -1;
            reales.forEach(function (r, k) { if (j < 0 && patron.test(limpiar(r.texto))) j = k; });
            revisados++;
            if (j >= 0) { correctos++; reales.splice(j, 1); }
            else anotar('error', 'INTRODUCCIÓN', 'Falta o cambia la línea de las fechas', fecha.texto, '');
        }
        cotejarParrafos('INTRODUCCIÓN', esperados, reales);
    }

    /* ------------------------------------------------------------- Encabezado */

    /* El encabezado de la pantalla de preguntas (el título en su banner y las
       instrucciones) vive en las Etiquetas que van ANTES de la primera pregunta. */
    function revisarEncabezado(preguntas) {
        var iniciales = [];
        for (var i = 0; i < preguntas.length && preguntas[i].tipoId === 100; i++) iniciales.push(preguntas[i]);
        var reales = [];
        iniciales.forEach(function (q) { reales = reales.concat(parrafosDeHtml(q.contenidoHtml)); });

        var esperados = [];
        if (G.banner) esperados.push({ texto: G.banner, negritas: [], cursivas: [], conservaEstilo: false });
        G.instrucciones.forEach(function (p) { esperados.push(p); });
        if (!esperados.length && !reales.length) return;
        if (!iniciales.length) {
            anotar('error', 'ENCABEZADO', 'No hay una Etiqueta con el encabezado antes de la primera pregunta',
                (G.banner || 'El título y las instrucciones del guion'), '');
            return;
        }
        cotejarParrafos('ENCABEZADO', esperados, reales);
        if (iniciales.length > 1) {
            anotar('info', 'ENCABEZADO', 'El encabezado está repartido en ' + iniciales.length + ' etiquetas seguidas', '', '', true);
        }
    }

    /* -------------------------------------------------------------- Preguntas */

    function familia(tipoId) {
        if (tipoId === 2 || tipoId === 3) return 'abierta';
        if (tipoId === 4 || tipoId === 5 || tipoId === 6) return 'opciones';
        return 'otra';
    }

    function revisarPreguntas(preguntas) {
        var reales = preguntas.filter(function (q) { return q.tipoId !== 100; }).map(function (q) {
            var s = sinNumero(parrafosDeHtml(q.contenidoHtml).map(function (p) { return p.texto; }).join(' '));
            return { q: q, numeroTecleado: s.numero, texto: s.texto };
        });
        var esperadas = G.preguntas;

        var cuenta = function (lista, f) { return lista.filter(f).length; };
        var resumenGuion = esperadas.length + ' preguntas (' + cuenta(esperadas, function (e) { return e.tipo === 'opciones'; }) + ' de opciones, '
            + cuenta(esperadas, function (e) { return e.tipo === 'abierta'; }) + ' abiertas)';
        var resumenMoodle = reales.length + ' preguntas (' + cuenta(reales, function (r) { return familia(r.q.tipoId) === 'opciones'; }) + ' de opciones, '
            + cuenta(reales, function (r) { return familia(r.q.tipoId) === 'abierta'; }) + ' abiertas)';
        revisados++;
        if (esperadas.length === reales.length) correctos++;
        else anotar('error', 'PREGUNTAS', 'El número de preguntas no es el del guion', resumenGuion, resumenMoodle);

        // Emparejar por parecido del enunciado, no por posición.
        var candidatos = [];
        esperadas.forEach(function (e, i) {
            reales.forEach(function (r, j) {
                var s = firma(e.enunciado) === firma(r.texto) ? 2 : similitud(e.enunciado, r.texto);
                if (s >= 0.5) candidatos.push({ i: i, j: j, s: s });
            });
        });
        candidatos.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
        var parDe = {}, usado = {};
        candidatos.forEach(function (c) { if (parDe[c.i] === undefined && !usado[c.j]) { parDe[c.i] = c.j; usado[c.j] = true; } });

        var guias = [];   // texto del resumen informativo
        esperadas.forEach(function (e, i) {
            var grupo = 'PREGUNTA ' + e.numero;
            var j = parDe[i];
            revisados++;
            if (j === undefined) {
                anotar('error', grupo, 'No se encontró esta pregunta en Moodle', e.enunciado, '');
                return;
            }
            var r = reales[j];

            // El enunciado.
            if (limpiar(e.enunciado) === r.texto) correctos++;
            else if (firma(e.enunciado) === firma(r.texto)) anotar('aviso', grupo, 'El enunciado coincide salvo puntuación, acentos o mayúsculas', e.enunciado, r.texto);
            else anotar('error', grupo, tituloDeDiferencia(e.enunciado, r.texto, 'El enunciado no coincide con el guion'), e.enunciado, r.texto);

            // El número que se tecleó a mano.
            if (r.numeroTecleado != null && r.numeroTecleado !== e.numero) {
                anotar('aviso', grupo, 'El número escrito en el enunciado no es el de su lugar en el guion', 'Pregunta ' + e.numero, 'Dice «' + r.numeroTecleado + '.»');
            }
            if (j !== i && esperadas.length === reales.length) {
                anotar('aviso', grupo, 'Está en otro lugar que en el guion', 'Posición ' + (i + 1), 'Posición ' + (j + 1));
            }

            // El tipo de pregunta.
            var fam = familia(r.q.tipoId);
            revisados++;
            if (e.tipo === 'abierta') {
                if (r.q.tipoId === 3) correctos++;
                else if (r.q.tipoId === 2) anotar('aviso', grupo, 'La respuesta abierta es una Caja de texto (corta), no una Caja para ensayo', 'Recuadro para escribir', r.q.tipo);
                else anotar('error', grupo, 'El tipo de pregunta no es el del guion', 'Abierta (recuadro para escribir)', r.q.tipo);
            } else if (e.tipo === 'opciones') {
                if (fam === 'opciones') {
                    correctos++;
                    if (r.q.tipoId === 4) {
                        anotar('aviso', grupo, 'Confirma si debe elegirse una opción o varias',
                            'El guion solo trae «☐» (y el comentario «Configurar casilla de opción múltiple»); no dice cuántas se eligen',
                            'En Moodle es «Botones de Selección»: se elige una sola');
                    }
                } else anotar('error', grupo, 'El tipo de pregunta no es el del guion', 'Opciones («☐»)', r.q.tipo);
            }

            // Las opciones.
            if (e.tipo === 'opciones') {
                var conTexto = e.opciones.some(function (o) { return o; });
                revisados++;
                if (!conTexto) {
                    if (e.opciones.length === r.q.opciones.length) correctos++;
                    else anotar('error', grupo, 'El número de opciones no es el del guion', e.opciones.length + ' opciones', r.q.opciones.length + ' opciones: ' + r.q.opciones.join(' · '));
                    anotar('info', grupo, 'Sus opciones no se pueden cotejar: el guion no trae su texto',
                        '', 'En Moodle: ' + r.q.opciones.map(function (o) { return '«' + o + '»'; }).join(' · '), true);
                } else {
                    var A = e.opciones.map(firma).sort().join('|'), B = r.q.opciones.map(firma).sort().join('|');
                    if (A === B) correctos++;
                    else anotar('error', grupo, 'Las opciones no son las del guion', e.opciones.join(' · '), r.q.opciones.join(' · '));
                }
            }

            // Residuos de pegar desde Google Docs.
            if (/docs-internal-guid/.test(r.q.contenidoHtml)) {
                anotar('aviso', grupo, 'El enunciado trae un residuo de Google Docs (span con id «docs-internal-guid…»)',
                    '', 'Se ve igual, pero es código que sobra: se quita desde «Editar pregunta» → botón de código fuente');
            }

            guias.push(e.numero + ' · ' + r.q.tipo + (r.q.requerida ? ' · obligatoria' : ' · opcional')
                + (e.tipo === 'opciones' ? ' · ' + r.q.opciones.length + ' opciones' : '')
                + (r.q.tipoId === 3 ? ' · ' + (r.q.lineas || '?') + (r.q.formato ? ' · ' + r.q.formato : '') : ''));
        });

        reales.forEach(function (r, j) {
            if (usado[j]) return;
            anotar('error', 'PREGUNTAS', 'Hay una pregunta en Moodle que el guion no trae', '', 'Pregunta ' + (j + 1) + ' (' + r.q.tipo + '): ' + r.texto);
        });
        if (guias.length) anotar('info', 'PREGUNTAS', 'Cómo quedó cada una', '', guias.join('\n'), true);

        // Lo que PIDEN las indicaciones de montaje contra lo que hay en Moodle.
        var p = G.pedido || {};
        var abiertas = cuenta(reales, function (r) { return familia(r.q.tipoId) === 'abierta'; });
        var cerradas = cuenta(reales, function (r) { return familia(r.q.tipoId) === 'opciones'; });
        if (p.abiertas != null && p.abiertas !== abiertas) {
            anotar('aviso', 'PREGUNTAS', 'Las indicaciones de montaje piden otro número de preguntas abiertas que el que hay',
                p.abiertas + ' abiertas (indicaciones de montaje)', abiertas + ' abiertas en Moodle');
        }
        if (p.opcionMultiple != null && p.opcionMultiple !== cerradas) {
            anotar('aviso', 'PREGUNTAS', 'Las indicaciones de montaje piden otro número de preguntas de opción múltiple que el que hay',
                p.opcionMultiple + ' de opción múltiple (indicaciones de montaje)', cerradas + ' en Moodle');
        }
    }

    /* ---------------------------------------------------------------- Ajustes */

    function revisarAjustes(cfg) {
        var textoIntro = parrafosDeHtml(cfg.introHtml).map(function (p) { return p.texto; }).join(' ');

        // «Cuentas con un intento» contra el tipo de respuesta.
        revisados++;
        if (/un intento/i.test(textoIntro)) {
            if (cfg.qtype === '1') correctos++;
            else anotar('error', 'AJUSTES', 'La introducción dice que hay un intento, pero el cuestionario no es «responder una vez»', '',
                'La introducción dice «Cuentas con un intento para responder», pero el tipo de respuesta es «' + cfg.qtypeTexto + '».', true);
        } else {
            correctos++;
            anotar('info', 'AJUSTES', 'Intentos', '', 'Tipo de respuesta: ' + cfg.qtypeTexto, true);
        }

        // «Recabar datos generales (Nombre, ID, correo)».
        if (G.pedido && G.pedido.recabaDatos) {
            revisados++;
            if (cfg.respondenttype === 'anonymous') {
                anotar('error', 'AJUSTES', 'El guion pide recabar datos de quien responde y el cuestionario es anónimo',
                    'Recabar: ' + G.pedido.recabaDatos, 'Anónimo');
            } else {
                correctos++;
                anotar('info', 'AJUSTES', 'Datos de quien responde: confírmalos a ojo',
                    '', 'No es anónimo (guarda quién responde). El guion pide: ' + G.pedido.recabaDatos
                    + '. Comprueba en «Respuestas» que el nombre, el ID y el correo salen.', true);
            }
        }
    }

    /* ---------------------------------------------------------- A ojo (Word) */

    function revisarAOjo() {
        (G.comentarios || []).forEach(function (c) {
            var ancla = c.ancla ? ' (sobre «' + c.ancla + '»)' : '';
            anotar('info', 'A OJO', 'Indicación del guion: ' + c.texto.replace(/^Montaje:\s*/i, ''), '', 'Comentario de ' + (c.autor || 'producción') + ancla
                + '. La herramienta no puede comprobarlo sola.', true);
        });
        if (G.botones && G.botones.enviar) {
            anotar('info', 'A OJO', 'El botón de envío tiene que decir «Enviar todo y terminar»', '',
                'Se ve al contestar el cuestionario (no se abre desde aquí porque contestar tiene efectos). '
                + 'En la vista previa el botón dice «Vista previa del envío».', true);
        }
    }

    /* -------------------------------------------------------------- Evidencia */

    function estadoGlobal() {
        var errores = hallazgos.filter(function (h) { return h.nivel === 'error'; }).length;
        var avisos = hallazgos.filter(function (h) { return h.nivel === 'aviso'; }).length;
        return {
            errores: errores, avisos: avisos,
            estado: errores ? 'CON ERRORES' : (avisos ? 'REVISAR AVISOS' : 'TODO CORRECTO'),
            color: errores ? '#c62828' : (avisos ? '#ef6c00' : '#2e7d32')
        };
    }

    /** El curso sale de las migas de pan; el título de la pestaña trae el de la ACTIVIDAD. */
    function nombreDelCurso() {
        var miga = document.querySelector('.breadcrumb a[href*="/course/view.php"], nav a[href*="/course/view.php"]');
        if (miga && limpiar(miga.textContent)) return limpiar(miga.textContent);
        var m = /^(.+?):\s/.exec(document.title);
        return m ? limpiar(m[1]) : 'No se pudo leer';
    }

    function generarEvidencia(resumen, st, nombre, nPreguntas) {
        if (typeof evidencia !== 'function') {
            alert('Este verificador se generó con una versión anterior de la herramienta. Vuelve a copiarlo desde el panel para poder generar la evidencia.');
            return;
        }
        evidencia({
            tipo: 'Cuestionario',
            herramienta: 'QA de Cuestionarios 3.11',
            titulo: nombre || G.titulo || 'Cuestionario',
            subtitulo: 'Cotejo del cuestionario montado en Moodle (plugin Questionnaire) contra el guion de producción',
            clave: DATOS.clave || 'cuestionario',
            estado: st.estado, color: st.color,
            resumen: resumen + '.',
            etiquetaEsperado: 'En el Word',
            ficha: [
                ['Word revisado', (DATOS.archivos && DATOS.archivos.guion) || '—'],
                ['Preguntas del guion', String(G.preguntas.length)],
                ['Preguntas en Moodle', String(nPreguntas)],
                ['Curso', nombreDelCurso()]
            ],
            textoTodoBien: 'Lo que dice el Word coincide con lo montado en Moodle.',
            notaAlcance: 'Cubre el título, la introducción, el encabezado, las preguntas y sus opciones, y las fechas contra los ajustes. '
                + 'Los comentarios de montaje del Word y el botón de envío se revisan a ojo.',
            avisosDelGuion: G.avisos || [],
            hallazgos: hallazgos.map(function (x) {
                if (x.crudo) {
                    return { nivel: x.nivel, grupo: x.grupo, titulo: x.titulo, esperadoHtml: x.esperado ? esc(x.esperado) : '', actualHtml: esc(x.actual).replace(/\n/g, '<br>') };
                }
                var d = diferencia(x.esperado, x.actual);
                return { nivel: x.nivel, grupo: x.grupo, titulo: x.titulo, esperadoHtml: x.esperado ? d.esperado : '', actualHtml: (x.esperado || x.actual) ? d.actual : '' };
            })
        });
    }

    /* ------------------------------------------------------------------ Panel */

    var PANEL = 'qacq311-panel';

    function panel() {
        var p = document.getElementById(PANEL);
        if (p) return p;
        p = document.createElement('div');
        p.id = PANEL;
        p.style.cssText = 'position:fixed;top:12px;right:12px;width:480px;max-height:90vh;overflow:auto;z-index:2147483647;'
            + 'background:#fff;color:#222;border:1px solid #ddd;border-radius:12px;padding:14px 16px;'
            + 'box-shadow:0 12px 44px rgba(0,0,0,.35);font:13px/1.5 system-ui,sans-serif';
        document.body.appendChild(p);
        return p;
    }

    function encabezado(h, color) {
        return '<div style="display:flex;gap:7px;align-items:baseline;flex-wrap:wrap">'
            + '<span style="flex-shrink:0;padding:2px 9px;border-radius:999px;background:' + color + ';color:#fff;font-size:10.5px;font-weight:800;'
            + 'letter-spacing:.04em;text-transform:uppercase">' + esc(h.grupo) + '</span>'
            + '<strong style="font-size:13.5px;color:' + color + '">' + esc(h.titulo) + '</strong></div>';
    }

    function mostrarProgreso(texto) {
        var p = panel();
        p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
            + '<strong style="font-size:15px">QA de cuestionario · Moodle 3.11</strong></div>'
            + '<div style="background:#eef3fb;border-left:3px solid #1565c0;padding:10px;border-radius:6px">' + esc(texto) + '</div>';
    }

    function mostrarError(mensaje) {
        var p = panel();
        p.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
            + '<strong style="font-size:15px">QA de cuestionario · Moodle 3.11</strong>'
            + '<button id="' + PANEL + '-x" style="border:0;background:#eee;border-radius:6px;padding:4px 10px;cursor:pointer">Cerrar</button></div>'
            + '<div style="background:#fff5f5;border-left:3px solid #c62828;padding:10px;border-radius:6px"><strong>No se pudo revisar.</strong><br>'
            + esc(mensaje) + '</div>';
        document.getElementById(PANEL + '-x').onclick = function () { p.remove(); };
    }

    function pintar(resumen, nombre, nPreguntas) {
        var st = estadoGlobal();
        var p = panel();
        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
            + '<strong style="font-size:15px">QA de cuestionario · Moodle 3.11</strong>'
            + '<button id="' + PANEL + '-x" style="border:0;background:#eee;border-radius:6px;padding:4px 10px;cursor:pointer">Cerrar</button></div>'
            + '<div style="background:' + st.color + ';color:#fff;padding:9px 11px;border-radius:8px;font-weight:700;margin-bottom:10px">' + st.estado + '</div>'
            + '<div style="color:#555;margin-bottom:10px">' + esc(nombre) + '<br>' + esc(resumen) + '</div>'
            + '<button id="' + PANEL + '-pdf" style="width:100%;border:1px solid ' + st.color + ';background:#fff;color:' + st.color
            + ';border-radius:8px;padding:8px 10px;margin-bottom:10px;cursor:pointer;font:inherit;font-weight:700">Generar evidencia (PDF)</button>';

        if (G.avisos && G.avisos.length) {
            html += '<div style="background:#fffcf6;border-left:3px solid #ef6c00;padding:8px 10px;border-radius:0 6px 6px 0;margin-bottom:8px">'
                + '<strong style="color:#ef6c00">Avisos del guion (' + G.avisos.length + ')</strong>'
                + '<div style="color:#555;font-size:12px;margin-bottom:3px">Son del Word, no del montaje: no cuentan en el veredicto.</div>'
                + '<ul style="margin:4px 0 0;padding-left:18px">' + G.avisos.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') + '</ul></div>';
        }
        if (!st.errores && !st.avisos) {
            html += '<div style="background:#e8f5e9;border-left:3px solid #2e7d32;padding:10px;border-radius:6px">'
                + 'Lo que dice el Word coincide con lo montado en Moodle.</div>';
        }

        [['error', 'Errores', '#c62828', '#fff5f5'], ['aviso', 'Avisos', '#ef6c00', '#fff9ed'], ['info', 'A ojo e información', '#1565c0', '#f4f8fe']]
            .forEach(function (t) {
                var lista = hallazgos.filter(function (h) { return h.nivel === t[0]; });
                if (!lista.length) return;
                html += '<h4 style="margin:14px 0 6px;color:' + t[2] + '">' + t[1] + ' (' + lista.length + ')</h4>';
                lista.forEach(function (h) {
                    var cuerpo = '';
                    if (h.crudo) {
                        cuerpo = '<div style="margin-top:5px;white-space:pre-wrap">'
                            + (h.esperado ? '<strong>Esperado:</strong> ' + esc(h.esperado) + '<br>' : '') + esc(h.actual) + '</div>';
                    } else if (h.esperado || h.actual) {
                        var d = diferencia(h.esperado, h.actual);
                        cuerpo = '<div style="margin-top:5px;white-space:pre-wrap">'
                            + (h.esperado ? '<strong>En el Word:</strong> ' + d.esperado + '<br>' : '')
                            + '<strong>En Moodle:</strong> ' + d.actual + '</div>';
                    }
                    html += '<div style="border-left:3px solid ' + t[2] + ';padding:7px 9px;margin:6px 0;background:' + t[3] + ';border-radius:0 6px 6px 0">'
                        + encabezado(h, t[2]) + cuerpo + '</div>';
                });
            });

        p.innerHTML = html;
        document.getElementById(PANEL + '-x').onclick = function () { p.remove(); };
        document.getElementById(PANEL + '-pdf').onclick = function () { generarEvidencia(resumen, st, nombre, nPreguntas); };
        return { errores: st.errores, avisos: st.avisos };
    }

    /* ---------------------------------------------------------------- Arranque */

    async function arrancar() {
        if (!G) { alert('El verificador se generó sin el guion. Vuelve a copiarlo desde la herramienta.'); return; }
        var id = new URLSearchParams(location.search).get('id');
        if (!/\/mod\/questionnaire\//.test(location.pathname) || !id) {
            alert('Abre cualquier página de ESTE cuestionario (la actividad, «Preguntas» o «Vista previa») y vuelve a ejecutarlo.\n\n'
                + 'Este QA es para el plugin Cuestionario (mod/questionnaire). Si es un «Examen» de Moodle, no es esta herramienta.');
            return;
        }
        try {
            mostrarProgreso('Leyendo el cuestionario en Moodle…');
            var m = await leerMoodle(id, mostrarProgreso);
            mostrarProgreso('Cotejando contra el guion…');
            revisarTitulo(m.cfg);
            revisarIntro(m.cfg);
            revisarFechas(m.cfg);
            revisarEncabezado(m.preguntas);
            revisarPreguntas(m.preguntas);
            revisarAjustes(m.cfg);
            revisarAOjo();

            var nPreg = m.preguntas.filter(function (q) { return q.tipoId !== 100; }).length;
            return pintar(revisados + ' puntos del guion cotejados · ' + correctos + ' idénticos', m.cfg.nombre, nPreg);
        } catch (e) {
            mostrarError(e && e.message ? e.message : String(e));
        }
    }

    return arrancar();
};
