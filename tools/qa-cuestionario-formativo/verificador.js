/* ==========================================================================
   Verificador que se ejecuta DENTRO de Moodle.

   Es autocontenido porque `script.js` lo serializa con `toString()`. Solo hace
   lecturas del DOM y solicitudes GET del mismo origen; nunca envía formularios,
   nunca responde preguntas y nunca guarda cambios.
   ========================================================================== */

window.VERIFICADOR_CF = async function (DATOS, evidencia) {
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
            /* El espacio del final no es decorativo: el guion no es constante
               con el espaciado alrededor de la marca (`∧<Latex#\wedge #> (1)`
               contra `⇒ <Latex#\Rightarrow #>(3)`) y borrarla sin dejar nada
               pegaba el símbolo al paréntesis. `limpiar()` junta los sobrantes.
               Copia literal de la de `script.js`. */
            .replace(/(\S+)\s*<\s*latex\s*#([\s\S]*?)#\s*>/gi, '$1 ')
            .replace(/<\s*latex\s*#([\s\S]*?)#\s*>/gi, ' $1 ')
            .replace(/<\s*(?:termina\s+)?ecuaci[oó]n\s*>/gi, ' ')
            /* Marcas del guion: TODO lo que producción escribe entre < > es una
               instrucción de montaje, nunca contenido publicado. Se enumeraban
               las conocidas y no alcanzó: en cinco guiones reales hay 24 marcas
               distintas —`<Lista numerada>`, `<Tabla con encabezado centrado y
               texto alineado a la izquierda>`, `<Texto regular centrado>`…— y
               ninguna es contenido. Guardarraíles para no comerse un `a < b`:
               sin saltos ni anidamiento, máximo 120 caracteres y con letra
               dentro. Va al final, después de las reglas de `<Latex>`, que
               borran también lo que hay en medio. Copia literal de la de
               `script.js`: los dos lados tienen que borrar lo mismo. */
            .replace(/<[^<>\n]{1,120}>/g, function (marca) {
                return /\p{L}/u.test(marca) ? ' ' : marca;
            })
            /* La raíz se escribe de tres formas —`\sqrt{2}`, `√(2)` y `√2`— y
               las tres son la misma. Se llevan a una forma interna común para
               que ninguna combinación entre el Word y la página se reporte como
               diferencia. Copia literal de la de `script.js`. */
            .replace(/\\sqrt\s*\{([^{}]+)\}/gi, ' raizde$1 ')
            .replace(/√\s*\(\s*([^()]*?)\s*\)/g, ' raizde$1 ')
            .replace(/√\s*(\S+)/g, ' raizde$1 ')
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

    /* Las comillas tipogr\u00e1ficas se igualan aqu\u00ed a prop\u00f3sito, y no es una
       tolerancia: `limpiar()` ya convierte \u201c \u201d \u2018 \u2019 en comillas rectas al leer
       Moodle, mientras que el texto del Word llega tal cual desde el guion. Sin
       esto, un `Hi, what\u2019s up?` id\u00e9ntico en los dos lados se reportaba como
       error \u2014y el panel lo pintaba igual en \u201cEsperado\u201d y \u201cEn Moodle\u201d, porque
       para mostrarlo vuelve a pasar por `limpiar()`\u2014. La regla es que la
       herramienta no puede se\u00f1alar una diferencia que no sabe ense\u00f1ar. */
    function limpiarRetroalimentacion(s) {
        return String(s == null ? '' : s)
            .replace(/[\u00a0\u200b\u200c\u200d\u00ad\ufeff]/g, ' ')
            .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"')
            .replace(/[\u2018\u2019]/g, "'")
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

    /* Tokens de una tabla, ya sin los números y letras de lista (1., 2., a),
       b)…). Esa numeración es formato automático —de Word o de Moodle—, no
       contenido, y `normalizarTextoPregunta` la quita mirando lo que va
       DESPUÉS, así que depende del orden de recorrido: el Word va por columnas
       (1. 2. 3. y luego a. b. c.) y Moodle por filas (1. a. 2. b.). Con eso, la
       misma tabla daba distinto según de dónde se leyera —le pasó al reactivo
       13 de CF4, que estaba bien—. Aquí se quitan por pares de tokens, que no
       depende del orden, y se ordena para comparar como conjunto. */
    function tokensDeTabla(s) {
        var brutos = tokensContenidoExacto(normalizarTextoPregunta(s));
        var salida = [];
        for (var i = 0; i < brutos.length; i++) {
            var siguiente = brutos[i + 1];
            // Un solo dígito o una sola letra seguidos de "." o ")": enumeración.
            if (/^(?:\p{N}{1,2}|\p{L})$/u.test(brutos[i]) && (siguiente === '.' || siguiente === ')')) {
                i++;
                continue;
            }
            salida.push(brutos[i]);
        }
        return salida.sort();
    }

    /* Qué parte de la pregunta cambió, o null si está bien. Antes esto solo
       decía sí/no y el panel enseñaba la celda entera del Word contra el texto
       ya normalizado de Moodle: en una pregunta con tabla eso son peras contra
       manzanas y no se distingue "falta el enunciado" de "cambió una fila".
       Pasó de verdad en CF3, donde Moodle se había comido la frase "Relaciona
       cada instrucción con la imagen que la representa". */
    function diferenciaDePregunta(esperada, actual) {
        if (esperada.tieneTabla || actual.tieneTabla) {
            if (!esperada.tieneTabla) {
                return { parte: 'La pregunta trae una tabla que no está en el Word',
                    esperado: esperada.texto, actual: actual.contenidoTabular };
            }
            if (!actual.tieneTabla) {
                return { parte: 'Falta la tabla de la pregunta',
                    esperado: esperada.contenidoTabular, actual: actual.texto };
            }
            if (!contenidosIguales(normalizarTextoPregunta(esperada.textoPrincipal), actual.textoPrincipal)) {
                return { parte: 'Cambia el enunciado de la pregunta',
                    esperado: esperada.textoPrincipal, actual: actual.textoPrincipal };
            }
            // Las tablas se comparan como conjunto: el recorrido tecnico es por
            // columnas en Word y por filas en Moodle.
            var tablaEsperada = tokensDeTabla(esperada.contenidoTabular);
            var tablaActual = tokensDeTabla(actual.contenidoTabular);
            if (tablaEsperada.join('') !== tablaActual.join('')) {
                return { parte: 'Cambia la tabla de la pregunta',
                    esperado: esperada.contenidoTabular, actual: actual.contenidoTabular };
            }
            return null;
        }
        if (!contenidosIguales(normalizarTextoPregunta(esperada.texto), actual.texto)) {
            return { parte: 'Texto de la pregunta', esperado: esperada.texto, actual: actual.texto };
        }
        return null;
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

    /* Moodle nombra el comportamiento de las preguntas con una clase técnica en
       el HTML (`immediatefeedback`), pero en su propia pantalla de ajustes lo
       llama por su nombre. El informe tiene que hablar como la pantalla que hay
       que ir a corregir, no como el HTML. */
    var COMPORTAMIENTOS = {
        deferredfeedback: 'Retroalimentación diferida',
        deferredcbm: 'Retroalimentación diferida con CBM',
        immediatefeedback: 'Retroalimentación inmediata',
        immediatecbm: 'Retroalimentación inmediata con CBM',
        interactive: 'Interactiva con varios intentos',
        interactivecountback: 'Interactiva con varios intentos',
        adaptive: 'Modo adaptativo',
        adaptivenopenalty: 'Modo adaptativo (sin penalización)',
        manualgraded: 'Calificación manual'
    };

    function nombreDeComportamiento(clases) {
        var encontrado = '';
        String(clases || '').split(/\s+/).forEach(function (c) {
            if (COMPORTAMIENTOS[c]) encontrado = COMPORTAMIENTOS[c];
        });
        return encontrado;
    }

    // “A y B”, “1, 2 y 3”: un listado que se lee en voz alta sin tropezar.
    function enumerar(lista) {
        if (lista.length < 2) return lista.join('');
        return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
    }

    /* El motivo del hallazgo, en una píldora del color de su nivel y con el
       título en grande al lado. Antes era una línea en negrita del mismo tamaño
       que el resto: con quince hallazgos seguidos había que leerlos uno por uno
       para saber de qué iba cada cual. Copia literal de la del QA de Actividad
       y Rúbrica, para que los dos paneles se lean igual. */
    function encabezadoDeHallazgo(h, color) {
        return '<div style="display:flex;gap:7px;align-items:baseline;flex-wrap:wrap">'
            + '<span style="flex-shrink:0;padding:2px 9px;border-radius:999px;background:' + color + ';'
            + 'color:#fff;font-size:10.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase">'
            + esc(h.grupo) + '</span>'
            + '<strong style="font-size:13.5px;color:' + color + '">' + esc(h.titulo) + '</strong>'
            + '</div>';
    }

    /* ------------------------------------------------------------- Fórmulas
       Lo que SÍ se puede afirmar de una fórmula sin inventar nada.

       Si el guion escribió la fórmula en LaTeX, en Moodle tiene que quedar
       RENDERIZADA por el filtro de matemáticas, no como texto. Tres defectos
       distintos, tres reglas:

         1. El guion pide fórmula y en la página no hay nada de matemáticas:
            se montó como texto plano o como `<sup>`.  → error
         2. El LaTeX se ve CRUDO: el delimitador sin renderizar, un comando
            suelto o la marca del guion pegada tal cual.  → error
         3. La fórmula sí se renderizó, pero en modo bloque (`$$…$$`) en medio
            de una frase: MathJax la baja de renglón y la centra.  → aviso

       Los dos delimitadores NO son intercambiables, y es la confusión más
       común del montaje:
         \( … \)   en línea, dentro de la frase — no rompe el renglón
         $$ … $$   en bloque, fórmula sola y centrada — sí rompe el renglón */
    var LATEX_CRUDO = /\$\$[\s\S]{1,200}?\$\$|\\\(|\\\[|<\s*latex\b[^>]*>|<\s*cod\s+lat\b[^>]*>|\\(?:wedge|vee|Rightarrow|Leftrightarrow|leftrightarrow|rightarrow|frac|sqrt|cdot|times|div|pi|alpha|beta|gamma|theta|leq|geq|neq|approx|sum|prod|int|infty)\b/i;

    /* ¿Moodle renderizó la fórmula? Cuando el filtro de matemáticas hace su
       trabajo, la página deja huella: el envoltorio del filtro, el contenedor
       de MathJax, el MathML de accesibilidad o la imagen del filtro TeX. Si el
       guion pide fórmula y no hay ninguna de esas huellas, la fórmula se montó
       como texto —o como `<sup>`— y no como LaTeX. */
    function tieneMatematicasRenderizadas(nodo) {
        if (!nodo) return false;
        if (nodo.querySelector('.filter_mathjaxloader_equation, mjx-container, .MathJax,'
                + ' mjx-assistive-mml, math, img.texrender, img.Xtexrender, [data-mathml]')) {
            return true;
        }
        // Sin filtro activo, el delimitador se queda a la vista: también cuenta
        // como "hay fórmula", aunque mal montada; de eso avisa otra regla.
        return /\$\$[\s\S]{1,200}?\$\$|\\\(|\\\[/.test(nodo.textContent || '');
    }

    /* La fórmula que el guion pone en la RETROALIMENTACIÓN no se puede cotejar:
       la vista previa no la muestra hasta que alguien responde. Se avisa para
       que se revise a mano, nunca se marca como error —sería un falso positivo
       garantizado—. Solo se avisa si además la parte visible no trae fórmula;
       si ya la trae, el montaje evidentemente entendió la convención. */
    function revisarFormulasDeRetro(parejas) {
        var reactivos = [];
        var nodos = [];
        parejas.forEach(function (p) {
            if (!p.actual || !p.esperada) return;
            if (!p.esperada.pideFormulaRetro || p.esperada.pideFormula) return;
            if (tieneMatematicasRenderizadas(p.actual.nodo)) return;
            reactivos.push(String(p.indiceEsperado + 1));
            nodos.push(p.actual.nodo);
        });
        if (!reactivos.length) return;
        anotar('aviso', 'Fórmulas',
            'El guion pide fórmula en la retroalimentación de '
                + (reactivos.length === 1 ? 'la pregunta ' : 'las preguntas ') + enumerar(reactivos),
            'La fórmula de la retroalimentación también va en LaTeX, entre \\( y \\)',
            'No se puede comprobar desde aquí: la retroalimentación no se ve '
                + 'hasta responder. Ábrela y confirma que la fórmula se dibuje.',
            nodos);
    }

    function revisarFormulasSinMontar(actuales, parejas) {
        parejas.forEach(function (p) {
            if (!p.actual || !p.esperada || !p.esperada.pideFormula) return;
            if (tieneMatematicasRenderizadas(p.actual.nodo)) return;
            anotar('error', 'Fórmulas',
                'La pregunta ' + (p.indiceEsperado + 1) + ' no montó la fórmula como LaTeX',
                comoEscribirla(p.esperada.formulas),
                'La fórmula está puesta como texto normal (caracteres sueltos, '
                    + '«sub», «sup» o símbolos), no como ecuación.',
                p.actual.nodo);
        });
    }

    /* La sugerencia concreta: el código del guion ya envuelto en su
       delimitador, listo para pegar en el editor de Moodle. Si el guion no dejó
       código —solo una ecuación de Word— se explica la regla y ya.

       Siempre `\( … \)`: es el que deja la fórmula dentro de la frase y no
       rompe el renglón, y es lo que hace el único montaje bien hecho de los
       revisados. `$$ … $$` se menciona como la excepción a mano, porque cuál de
       los dos toca no se puede deducir del Word (ver el README). */
    var REGLA_DELIMITADOR = 'Solo si quieres la fórmula sola y centrada en su '
        + 'propio renglón, cámbialo por $$ … $$';

    function comoEscribirla(formulas) {
        var lista = (formulas || []).slice(0, 4);
        if (!lista.length) {
            return 'La fórmula va en LaTeX, entre \\( y \\). ' + REGLA_DELIMITADOR;
        }
        var escritas = lista.map(function (codigo) { return '\\(' + codigo + '\\)'; });
        var sobran = (formulas.length > lista.length)
            ? ' (y ' + (formulas.length - lista.length) + ' más del mismo reactivo)' : '';
        return 'Escríbelo así en Moodle: ' + escritas.join('   ') + sobran
            + ' · ' + REGLA_DELIMITADOR;
    }

    /* Lo que la herramienta NO puede afirmar, dicho en el panel y no escondido
       en el README: cuál de los dos delimitadores toca en cada fórmula. El
       guion parte la marca a un párrafo aparte, así que su maquetado no dice si
       la fórmula va dentro de la frase o sola en su renglón. Se sugiere siempre
       `\( … \)` —el que no rompe el renglón— y se avisa para que se mire.

       Solo se avisa de los reactivos donde la fórmula SÍ está renderizada: si
       falta, ya hay un error arriba y el aviso sobraría. */
    function avisarDelDelimitador(parejas) {
        var reactivos = [];
        var nodos = [];
        parejas.forEach(function (p) {
            if (!p.actual || !p.esperada || !p.esperada.pideFormula) return;
            if (!tieneMatematicasRenderizadas(p.actual.nodo)) return;
            reactivos.push(String(p.indiceEsperado + 1));
            nodos.push(p.actual.nodo);
        });
        if (!reactivos.length) return;
        anotar('aviso', 'Fórmulas',
            'Revisa a ojo cómo cae la fórmula en '
                + (reactivos.length === 1 ? 'la pregunta ' : 'las preguntas ') + enumerar(reactivos),
            'La fórmula dentro de la frase con \\( … \\); sola y centrada con $$ … $$',
            'La fórmula sí se dibuja, pero cuál de los dos delimitadores toca no '
                + 'se puede deducir del guion. Mira que no baje de renglón donde '
                + 'debería ir en la frase, ni al revés.',
            nodos);
    }

    /* Modo bloque donde debería ir en línea. `$$…$$` le dice a MathJax que la
       fórmula va sola: la baja de renglón y la centra. Si a los lados hay texto
       en el mismo párrafo, el autor quería `\( … \)`. Se pide texto de VERDAD a
       ambos lados —no solo espacios— para no marcar la fórmula que sí va sola. */
    function revisarFormulasEnBloque(actuales) {
        actuales.forEach(function (ap, i) {
            if (!ap.nodo) return;
            var sueltas = [];
            var cajas = ap.nodo.querySelectorAll('mjx-container[display="true"],'
                + ' mjx-container[jax][display], math[display="block"]');
            [].forEach.call(cajas, function (caja) {
                if (caja.getAttribute('display') === 'false') return;
                if (caja.localName === 'math' && caja.closest('mjx-assistive-mml')) return;
                var parrafo = caja.closest('p, li, td, div');
                if (!parrafo) return;
                var alrededor = (parrafo.textContent || '')
                    .replace(caja.textContent || '', '').replace(/\s+/g, '');
                if (alrededor.length > 3) sueltas.push(caja);
            });
            if (!sueltas.length) return;
            anotar('aviso', 'Fórmulas',
                'La pregunta ' + (i + 1) + ' baja la fórmula de renglón',
                'Una fórmula dentro de la frase va entre \\( y \\), que la deja en línea',
                'Está entre $$ y $$, que es el modo bloque: MathJax la manda '
                    + 'sola a un renglón aparte y la centra.',
                sueltas[0]);
        });
    }

    function revisarFormulasCrudas(actuales) {
        actuales.forEach(function (ap, i) {
            var partes = [ap.texto].concat(ap.opciones.map(function (o) { return o.texto; }));
            var encontrado = '';
            partes.forEach(function (t) {
                if (encontrado) return;
                var m = String(t || '').match(LATEX_CRUDO);
                if (m) encontrado = m[0];
            });
            if (!encontrado) return;
            anotar('error', 'Fórmulas',
                'La pregunta ' + (i + 1) + ' muestra código LaTeX sin convertir',
                'El símbolo ya convertido, como en el resto del cuestionario',
                'En la página se lee «' + encontrado + '». O falta el filtro de '
                    + 'fórmulas, o se pegó el código del guion en vez del símbolo.',
                ap.nodo);
        });
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
            + '<div style="margin-top:9px;color:#555">Cotejando contenido y consultando la configuración…</div>'
            + '<div id="qacf-progreso" style="margin-top:6px;color:#888;font-size:12px"></div>';
        document.body.appendChild(panel);
    }

    // Las páginas de edición se piden de tres en tres y con 15 reactivos la
    // espera se nota: sin este renglón parece que se colgó.
    function progreso(texto) {
        var n = document.getElementById('qacf-progreso');
        if (n) n.textContent = texto;
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
        var otroComportamiento = [];
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
            var cambio = diferenciaDePregunta(ep, ap);
            if (cambio) {
                anotar('error', 'Reactivos', cambio.parte + ' ' + (i + 1),
                    cambio.esperado, cambio.actual, ap.nodo);
            }
            // El comportamiento se ajusta UNA vez para todo el cuestionario: si
            // está mal, lo está en las quince preguntas. Se junta al final en un
            // solo hallazgo en lugar de repetir quince veces lo mismo.
            if (!ap.diferida) otroComportamiento.push({ numero: i + 1, nodo: ap.nodo, clases: ap.nodo.className });
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

            /* Las respuestas con imagen NO se dan por buenas ni por malas.
               Comparar la huella del PNG que Word guarda contra el archivo que
               Moodle sirve —reescalado, y a veces un SVG que el navegador pinta
               distinto— nunca da idéntico, así que reportarlo como error era
               marcar en rojo respuestas correctas. Se cuentan y se avisa una
               sola vez por pregunta: esa comparación la hace el ojo. */
            var asignados = {};
            var respuestasConImagen = 0;
            /* PRIMERO las que son idénticas, y solo después las parecidas. Dos
               opciones con los mismos elementos en otro orden —«6, 2, 3» y
               «6, 3, 2»— tienen la misma firma, así que para el parecido valen
               lo mismo y el emparejador voraz las cruzaba: reportaba dos
               respuestas cambiadas donde las dos estaban bien puestas. */
            var emparejado = {};
            for (var j0 = 0; j0 < ap.opciones.length; j0++) {
                // Solo con texto: dos respuestas que son imagen tienen las dos
                // el texto vacío y «vacío = vacío» no las empareja, las revuelve.
                if (!limpiar(ap.opciones[j0].texto)) continue;
                for (var k0 = 0; k0 < ep.opciones.length; k0++) {
                    if (asignados[k0]) continue;
                    if (!limpiar(ep.opciones[k0].texto)) continue;
                    if (!contenidosIguales(ep.opciones[k0].texto, ap.opciones[j0].texto)) continue;
                    asignados[k0] = true;
                    emparejado[j0] = k0;
                    break;
                }
            }
            for (var j = 0; j < ap.opciones.length; j++) {
                var mejorO = -1, indiceO = -1;
                if (emparejado[j] !== undefined) { mejorO = 1; indiceO = emparejado[j]; }
                else for (var k = 0; k < ep.opciones.length; k++) {
                    if (asignados[k]) continue;
                    var so = await similitudOpcion(ep.opciones[k], ap.opciones[j]);
                    if (so > mejorO) { mejorO = so; indiceO = k; }
                }
                var conImagen = Boolean(ap.opciones[j].imagenes.length)
                    || (indiceO >= 0 && Boolean(ep.opciones[indiceO].imagenes.length));
                if (indiceO >= 0 && mejorO >= .56) {
                    asignados[indiceO] = true;
                    if (emparejado[j] !== undefined) { continue; }   // idéntica: nada que reportar
                    if (conImagen) { respuestasConImagen++; continue; }
                    if (!contenidosIguales(ep.opciones[indiceO].texto, ap.opciones[j].texto)) {
                        anotar('error', 'Respuestas', 'Cambia una respuesta de la pregunta ' + (i + 1),
                            ep.opciones[indiceO].texto, ap.opciones[j].texto, ap.opciones[j].nodo);
                    }
                } else if (conImagen) {
                    respuestasConImagen++;
                } else {
                    anotar('error', 'Respuestas', 'Opción distinta en la pregunta ' + (i + 1),
                        'Una de las cuatro opciones del Word', ap.opciones[j].texto || 'Imagen', ap.opciones[j].nodo);
                }
            }
            /* Un solo aviso por pregunta con TODAS sus imágenes, las del
               enunciado y las de las respuestas. Las del enunciado se contaban
               fuera y por eso preguntas como la 9 y la 10 —que llevan la imagen
               arriba, no en las opciones— pasaban sin decir nada. */
            var qtext = ap.nodo.querySelector('.qtext');
            var imagenesEnMoodle = qtext ? qtext.querySelectorAll('img').length : 0;
            var esperaEnunciado = Boolean(ep.imagenesEnunciado) || Boolean(ep.esperaFigura);
            var imagenesEnGuion = ep.opciones.filter(function (o) { return o.imagenes.length; }).length;

            var dice = [];
            var pide = [];
            if (esperaEnunciado || imagenesEnMoodle) {
                pide.push('el enunciado');
                dice.push(imagenesEnMoodle
                    ? imagenesEnMoodle + (imagenesEnMoodle === 1 ? ' imagen' : ' imágenes') + ' en el enunciado'
                    : 'NINGUNA imagen en el enunciado, y el guion sí la pide');
            }
            if (respuestasConImagen || imagenesEnGuion) {
                pide.push('las respuestas');
                dice.push(respuestasConImagen
                    ? respuestasConImagen + (respuestasConImagen === 1 ? ' respuesta con imagen' : ' respuestas con imagen')
                        + (imagenesEnGuion && respuestasConImagen !== imagenesEnGuion
                            ? ' (el guion trae ' + imagenesEnGuion + ')' : '')
                    : 'NINGUNA respuesta con imagen, y el guion trae ' + imagenesEnGuion);
            }
            if (dice.length) {
                anotar('aviso', 'Imágenes',
                    'La pregunta ' + (i + 1) + ' lleva imagen en ' + enumerar(pide),
                    'El guion pone imagen en ' + enumerar(pide),
                    dice.join(' · ') + '. Revísalas a ojo: que sean las del guion, '
                        + 'que estén bien vinculadas y que no salga el ícono roto.', ap.nodo);
            }
        }
        revisarFormulasCrudas(actuales);
        revisarFormulasSinMontar(actuales, parejas);
        revisarFormulasDeRetro(parejas);
        avisarDelDelimitador(parejas);
        revisarFormulasEnBloque(actuales);
        if (otroComportamiento.length) {
            var nombres = [];
            otroComportamiento.forEach(function (x) {
                var n = nombreDeComportamiento(x.clases) || 'Otro comportamiento';
                if (nombres.indexOf(n) < 0) nombres.push(n);
            });
            var cuantas = otroComportamiento.length === actuales.length
                ? 'Las ' + actuales.length + ' preguntas están en «' + nombres.join('» y «') + '»'
                : enumerar(otroComportamiento.map(function (x) { return String(x.numero); }))
                    + (otroComportamiento.length === 1 ? ' está' : ' están')
                    + ' en «' + nombres.join('» y «') + '»';
            anotar('error', 'Configuración',
                'Las preguntas no se revisan al final, sino al momento de responder',
                'Comportamiento «Retroalimentación diferida»: el alumnado responde todo y hasta '
                    + 'enviar ve si acertó',
                cuantas + '. Se cambia en Editar ajustes → Comportamiento de las preguntas.',
                otroComportamiento.map(function (x) { return x.nodo; }));
        }
        actuales.forEach(function (ap, i) {
            if (!usados[i]) anotar('error', 'Reactivos', 'Pregunta adicional que no está en el Word', '', ap.texto, ap.nodo);
        });
        return { actuales: actuales, parejas: parejas };
    }

    var ESPERA = 15000;

    async function traerDocumento(url, reintento) {
        var u = new URL(url, location.href);
        if (u.origin !== location.origin) throw new Error('el enlace pertenece a otro origen');
        var controlador = new AbortController();
        var reloj = setTimeout(function () { controlador.abort(); }, ESPERA);
        try {
            var respuesta = await fetch(u.href, { credentials: 'same-origin', signal: controlador.signal });
            if (!respuesta.ok) throw new Error('respuesta HTTP ' + respuesta.status);
            return new DOMParser().parseFromString(await respuesta.text(), 'text/html');
        } catch (e) {
            // El navegador aborta con “signal is aborted without reason”, que no
            // le dice nada a quien revisa. Un reintento porque el sitio pudo
            // estar ocupado justo en ese momento.
            if (e.name === 'AbortError') {
                if (!reintento) return traerDocumento(url, true);
                throw new Error('Moodle no respondió en ' + (ESPERA / 1000) + ' s');
            }
            throw e;
        } finally { clearTimeout(reloj); }
    }

    /* Moodle abre la página de edición COMPLETA por cada pregunta y es cara.
       Pedirlas todas de golpe con un Promise.all sobre los 15 reactivos satura
       el límite de conexiones del navegador y el PHP del sitio: las últimas se
       quedan encoladas mientras su reloj ya corre, y se abortan sin haber
       llegado a empezar. De tres en tres cada petición estrena su espera. */
    async function enTanda(lista, cuantas, tarea) {
        var resultados = new Array(lista.length);
        var siguiente = 0;
        async function trabajador() {
            while (siguiente < lista.length) {
                var i = siguiente++;
                resultados[i] = await tarea(lista[i], i);
            }
        }
        var hilos = [];
        for (var k = 0; k < Math.min(cuantas, lista.length); k++) hilos.push(trabajador());
        await Promise.all(hilos);
        return resultados;
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
                // Misma regla que arriba: una respuesta que es imagen no se
                // puede emparejar por texto, así que no se declara error.
                var soloImagen = eo.imagenes && eo.imagenes.length && !eo.texto;
                anotar(soloImagen ? 'aviso' : 'error', 'Configuración interna',
                    soloImagen
                        ? 'No se pudo emparejar una respuesta con imagen de la pregunta ' + numero
                        : 'No se encontró una opción del Word en la pregunta ' + numero,
                    soloImagen ? 'Una respuesta del guion es una imagen' : eo.texto,
                    soloImagen ? 'Revísala a ojo: que esté puesta y que apunte al archivo correcto' : '',
                    ap.nodo);
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
            var leidas = 0;
            var resultados = await enTanda(enlaces, 3, async function (p) {
                try { return await revisarPreguntaInterna(p); }
                catch (e) { return { error: e.message, numero: p.indiceEsperado + 1 }; }
                finally { progreso('Leyendo la edición de las preguntas: ' + (++leidas) + ' de ' + enlaces.length); }
            });
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

    /* Arma la evidencia imprimible con el generador compartido
       (`assets/evidencia-qa.js`), que llega serializado junto al verificador.
       Los textos se le pasan ya resaltados por `diferencia()` para que el PDF
       enseñe exactamente lo mismo que el panel. */
    function generarEvidencia(resumen, estado, color) {
        if (typeof evidencia !== 'function') {
            alert('Este verificador se generó con una versión anterior de la herramienta. '
                + 'Vuelve a copiarlo desde el panel para poder generar la evidencia.');
            return;
        }
        evidencia({
            tipo: 'Cuestionario formativo',
            herramienta: 'QA de Cuestionario Formativo',
            titulo: esperado.titulo || document.title || 'Cuestionario formativo',
            subtitulo: 'Cotejo del cuestionario montado en Moodle contra el guion de producción',
            clave: esperado.clave || 'evidencia',
            estado: estado,
            color: color,
            resumen: resumen + '.',
            etiquetaEsperado: 'Debe decir',
            ficha: [
                ['Guion revisado', esperado.archivo || '—'],
                ['Reactivos', String(esperado.preguntas.length) + ' cotejados'],
                ['Respuesta correcta', esperado.lectura
                    ? 'Morado ' + esperado.lectura.marca : 'Resaltado morado del guion']
            ],
            textoTodoBien: 'El contenido, las respuestas correctas, las retroalimentaciones y la '
                + 'configuración revisada coinciden con el guion.',
            // Los que salieron al leer el Word, en el panel de la herramienta.
            avisosDelGuion: esperado.avisos || [],
            notaAlcance: 'Cubre el contenido visible, las respuestas correctas y la configuración que la '
                + 'sesión permitió consultar; lo que no se pudo leer aparece como aviso. Las imágenes y el '
                + 'puntaje total se revisan a ojo.',
            hallazgos: hallazgos.map(function (x) {
                var d = diferencia(x.esperado, x.actual);
                return {
                    nivel: x.nivel, grupo: x.grupo, titulo: x.titulo,
                    esperadoHtml: x.esperado ? d.esperado : '',
                    actualHtml: (x.esperado || x.actual) ? d.actual : ''
                };
            })
        });
    }

    function pintar(resumen) {
        limpiarMarcas();
        var errores = hallazgos.filter(function (h) { return h.nivel === 'error'; });
        var avisos = hallazgos.filter(function (h) { return h.nivel === 'aviso'; });
        var infos = hallazgos.filter(function (h) { return h.nivel === 'info'; });
        hallazgos.forEach(function (h) {
            if (!h.nodo || h.nivel === 'info') return;
            // Un hallazgo puede señalar varias preguntas a la vez: el
            // comportamiento del cuestionario las afecta a todas.
            var nodos = [].concat(h.nodo);
            nodos.forEach(function (n) {
                if (!n) return;
                n.style.outline = '3px solid ' + (h.nivel === 'error' ? '#c62828' : '#ef6c00');
                n.classList.add('qacf-marca');
            });
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
            + estado + '</div><div style="color:#555;margin-bottom:10px">' + esc(resumen) + '</div>'
            + '<button id="qacf-evidencia" style="width:100%;border:1px solid ' + color + ';background:#fff;color:'
            + color + ';border-radius:8px;padding:8px 10px;margin-bottom:10px;cursor:pointer;font:inherit;'
            + 'font-weight:700">Generar evidencia (PDF)</button>';

        [['error', 'Errores', '#c62828', '#fff5f5'], ['aviso', 'Avisos', '#ef6c00', '#fff9ed'], ['info', 'Información', '#1565c0', '#f3f8ff']]
            .forEach(function (tipo) {
                var lista = hallazgos.filter(function (h) { return h.nivel === tipo[0]; });
                if (!lista.length) return;
                html += '<h4 style="margin:14px 0 6px;color:' + tipo[2] + '">' + tipo[1] + ' (' + lista.length + ')</h4>';
                lista.forEach(function (h) {
                    var d = diferencia(h.esperado, h.actual);
                    html += '<div style="border-left:3px solid ' + tipo[2] + ';padding:7px 9px;margin:6px 0;background:' + tipo[3] + ';border-radius:0 6px 6px 0">'
                        + encabezadoDeHallazgo(h, tipo[2]);
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
        document.getElementById('qacf-evidencia').onclick = function () {
            generarEvidencia(resumen, estado, color);
        };
        var primero = document.querySelector('.qacf-marca');
        if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { errores: errores.length, avisos: avisos.length, informacion: infos.length };
    }

    panelCargando();
    var resultado = await cotejarContenido();
    await cotejarPaginasInternas(resultado);
    return pintar(esperado.preguntas.length + ' reactivos del Word cotejados · los puntajes son informativos');
};
