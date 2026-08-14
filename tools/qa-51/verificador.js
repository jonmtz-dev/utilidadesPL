/* ==========================================================================
   El verificador que se ejecuta DENTRO de Moodle.

   Vive aquí como una función normal y se envía a Moodle con `toString()`
   (script.js la envuelve con los datos del Word). Se escribe así, y no como
   una plantilla de texto, porque una plantilla obliga a escapar cada acento
   grave y cada `${` del código: fue justo lo que dejó ilegible al QA de 3.11.

   Reglas que no hay que deshacer:

   1. NUNCA escribe en la página. Solo lee, enmarca y dibuja su panel. Se
      ejecuta sobre una actividad ya guardada y sobre la rúbrica ya montada.
   2. Compara TEXTO VISIBLE, no etiquetas. Moodle reescribe p/li/h2 al guardar
      (TinyMCE envuelve el contenido de una viñeta en <li><p>…</p></li>), así que
      exigir la etiqueta del guion produce errores que no existen.
   3. Tres severidades. Un acento o una coma de más no es lo mismo que un
      criterio faltante, y mezclarlos hace que nadie lea el reporte.

   Como la función se serializa, no puede depender de NADA de fuera: todo lo que
   usa va dentro.
   ========================================================================== */

window.VERIFICADOR_QA = function (DATOS) {
    'use strict';

    /* ------------------------------------------------------------ Normalizar
       Lo que se perdona al comparar, y por qué. Todo esto salió de cotejar tres
       actividades ya montadas y correctas contra su guion. */

    function limpiar(s) {
        return String(s == null ? '' : s)
            // Espacios que no se ven: duro, de ancho cero, guion suave.
            .replace(/[\u00a0\u200b\u200c\u200d\u00ad\ufeff]/g, ' ')
            // Word escribe comillas y apóstrofos curvos; el editor a veces los
            // endereza al guardar. No es una diferencia editorial.
            .replace(/[\u201c\u201d\u00ab\u00bb]/g, '"')
            .replace(/[\u2018\u2019]/g, "'")
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

    /* El guion trae el prefijo de la lista escrito a mano ("a. ", "1. ", "• ")
       y al montarlo se vuelve la lista de HTML, que ya lo dibuja sola. */
    function sinPrefijoDeLista(s) {
        return String(s || '').replace(/^\s*(?:[•·-]|\d+[.)]|[a-z][.)])\s+/i, '');
    }

    /* Los indicadores de un criterio salen en Moodle con "- " al frente porque
       en el Word son viñetas. El guion (o el lector) los entrega sin marca o
       con "• ". Se quitan las tres formas antes de comparar. */
    function sinVinetas(s) {
        return String(s || '').split('\n').map(function (l) {
            return l.replace(/^\s*[-•·]\s*/, '');
        }).join('\n');
    }

    /* Etiquetas que van DENTRO de una frase. Todo lo demás que cuelgue de un
       nodo es un bloque aparte, con su propio texto esperado. */
    var EN_LINEA = { A: 1, B: 1, STRONG: 1, I: 1, EM: 1, SPAN: 1, CODE: 1, SUP: 1,
                     SUB: 1, U: 1, SMALL: 1, MARK: 1, BR: 1, ABBR: 1, TIME: 1 };

    /* El texto propio de un nodo, sin lo que aporten los bloques anidados.

       Hace falta porque en el montaje real un <li> se lleva dentro la tabla
       entera ("Completa la tabla…" + las 24 celdas) o su sublista a/b/c: con
       textContent, esa frase NUNCA coincide con la del guion y salía como
       "falta el punto 5" en una actividad perfectamente montada.

       Devuelve una LISTA porque un mismo <li> puede tener dos textos suyos con
       un bloque en medio: en la AA3 el punto "Guarda el archivo…" lleva dentro
       los tres párrafos centrados del nombre y, después de ellos, la "Nota: al
       nombrar tu archivo…" suelta. Son dos frases del guion en un solo nodo. */
    function trozosPropios(nodo) {
        var trozos = [];
        var actual = [];
        var cerrar = function () {
            var t = limpiar(actual.join(''));
            if (t) trozos.push(t);
            actual = [];
        };
        [].slice.call(nodo.childNodes).forEach(function (h) {
            if (h.nodeType === 3) { actual.push(h.nodeValue); return; }
            if (h.nodeType !== 1) return;
            // Un <br> separa dos renglones de la misma celda ("Optica" y
            // "Medicina"): sin el espacio quedaban pegados.
            if (h.tagName === 'BR') { actual.push(' '); return; }
            // Lo que va en linea se pega TAL CUAL: agregarle un espacio separaba
            // la coma de su palabra ("<strong>rubrica</strong>," -> "rubrica ,").
            if (EN_LINEA[h.tagName]) { actual.push(h.textContent); return; }
            cerrar();   // un bloque anidado corta el trozo
        });
        cerrar();
        // Sin trozos propios el contenido ES el de los hijos: <li><p>texto</p></li>.
        if (!trozos.length) {
            var todo = limpiar(nodo.textContent);
            if (todo) trozos.push(todo);
        }
        return trozos;
    }

    /** Firma sin plurales: "listas de cotejo" y "lista de cotejo" dan lo mismo. */
    function sinPlural(s) {
        return firma(s).split(' ').map(function (p) { return p.replace(/s$/, ''); }).join(' ');
    }

    /* "SM2_S3_AA3_Rubrica" / "PR_SM1S1-RU_Rubrica_AA3.pdf" -> "3". Sin `\b`
       delante: en esos nombres el guion bajo es carácter de palabra y no hay
       frontera entre "_" y "AA". */
    function numeroDeActividad(s) {
        var m = String(s || '').match(/A[AC]\s*_?\s*0?(\d+)/i);
        return m ? m[1] : '';
    }

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    /* ------------------------------------------------- Diferencia resaltada
       Se recortan el prefijo y el sufijo comunes y se pinta lo de en medio: es
       lo único que hace legible un "casi igual" de 300 caracteres. */
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
    var hallazgos = [];   // { nivel: 'error'|'aviso', grupo, titulo, esperado, actual, nodo }

    function anotar(nivel, grupo, titulo, esperado, actual, nodo) {
        hallazgos.push({
            nivel: nivel, grupo: grupo, titulo: titulo,
            esperado: esperado, actual: actual, nodo: nodo || null
        });
    }

    /* ------------------------------------------------ ¿En qué página estamos?
       El verificador es uno solo: reconoce por sí mismo si lo ejecutaron en la
       actividad o en la pantalla de la rúbrica. Pedirle al usuario que elija
       antes de copiar era una oportunidad más de equivocarse. */
    var esRubrica = Boolean(document.querySelector('#rubric-criteria, .gradingform_rubric'));
    var raizActividad = document.querySelector('.mainPlantilla23')
        || document.querySelector('.activity-description')
        || document.querySelector('#intro')
        || document.querySelector('#region-main');

    /* ============================================================ ACTIVIDAD */

    function revisarActividad(esperado) {
        var raiz = raizActividad || document.body;
        var nodos = [].slice.call(raiz.querySelectorAll('h1,h2,h3,h4,p,li,td,th'))
            .map(function (n) {
                return trozosPropios(n).map(function (t) {
                    return { n: n, t: t, f: firma(t), usado: false };
                });
            })
            .reduce(function (todos, unos) { return todos.concat(unos); }, []);

        /* Un nodo se descarta si su texto está contenido en el de un hijo suyo:
           TinyMCE deja <li><p>mismo texto</p></li> y contarlos como dos hace que
           uno salga siempre como "texto de más". */
        /* Al montar, "Tabla de afirmaciones…" se vuelve "Tabla 1. Afirmaciones…":
           el equipo numera las tablas de la página. Es correcto, así que se
           reconoce por el resto del título y se reporta como aviso, no como
           falta. */
        function claveDeTitulo(s) {
            return firma(s).replace(/^(tabla|figura|cuadro)\s*(\d+)?\s*(de la|del|de)?\s*/, '');
        }

        /* Qué tanto se parecen dos textos, contando palabras en común.

           Hace falta porque al montar se corrige alguna palabra suelta
           ("…información personal inglés" -> "…información personal EN inglés").
           Sin esto el mismo párrafo salía DOS veces —como "falta" y como
           "sobra"—, así que un cambio de una palabra abultaba el reporte al
           doble y escondía los errores de verdad. */
        function parecidoDe(a, b) {
            var pa = a.split(' ').filter(Boolean);
            var pb = b.split(' ').filter(Boolean);
            var largo = Math.max(pa.length, pb.length);
            // Frases cortas no: "Ejemplo:" se parece a cualquier cosa.
            if (pa.length < 5 || pb.length < 5) return 0;
            if (Math.min(pa.length, pb.length) / largo < 0.7) return 0;
            var resto = pb.slice();
            var comunes = 0;
            pa.forEach(function (p) {
                var i = resto.indexOf(p);
                if (i >= 0) { resto.splice(i, 1); comunes++; }
            });
            return comunes / largo;
        }

        function buscar(txt) {
            var esperadoLimpio = limpiar(sinPrefijoDeLista(txt));
            var claveEsperada = firma(esperadoLimpio);
            var exacto = null, parecido = null;
            for (var i = 0; i < nodos.length; i++) {
                var x = nodos[i];
                if (x.usado) continue;
                var propio = limpiar(sinPrefijoDeLista(x.t));
                if (propio === esperadoLimpio) { exacto = x; break; }
                if (!parecido && firma(propio) === claveEsperada) parecido = x;
            }
            var elegido = exacto || parecido;
            if (elegido) elegido.usado = true;
            return { nodo: elegido, exacto: Boolean(exacto) };
        }

        /** El nodo libre que más se parezca. Solo para la segunda pasada. */
        function buscarCasi(txt) {
            var claveEsperada = firma(limpiar(sinPrefijoDeLista(txt)));
            var casi = null, mejor = 0.85;
            nodos.forEach(function (x) {
                if (x.usado) return;
                var p = parecidoDe(claveEsperada, firma(limpiar(sinPrefijoDeLista(x.t))));
                if (p > mejor) { mejor = p; casi = x; }
            });
            if (casi) casi.usado = true;
            return casi;
        }

        var correctos = 0;
        /* El parecido es SEGUNDA pasada, nunca primera: si compite con las
           coincidencias exactas se queda con el nodo de otro. En la AA1 el
           "Título de tabla" se llevaba el punto 9 ("La tabla de afirmaciones…"),
           que era casi idéntico, y entonces el punto 9 salía como faltante y el
           título numerado como sobrante. Dos errores inventados por adelantarse. */
        var pendientes = [];

        esperado.textos.forEach(function (item) {
            var r = buscar(item.texto);
            /* El equipo numera las tablas de la página al montarlas, con o sin
               la palabra "Tabla" en el guion: "Análisis de fertilizantes…" se
               monta como "Tabla 1. Análisis de fertilizantes…". Se reconoce por
               el resto del título y se avisa; no es un error de montaje. */
            if (!r.nodo && (item.etiqueta === 'Título de tabla'
                    || /^(tabla|figura|cuadro)/i.test(item.texto))) {
                var clave = claveDeTitulo(item.texto);
                var numerado = nodos.find(function (x) { return !x.usado && claveDeTitulo(x.t) === clave; });
                if (numerado) {
                    numerado.usado = true;
                    anotar('aviso', 'Textos', item.etiqueta + ' — se numeró al montar',
                        item.texto, numerado.t, numerado.n);
                    return;
                }
            }
            if (!r.nodo) {
                pendientes.push(item);
                return;
            }
            if (!r.exacto) {
                anotar('aviso', 'Textos', item.etiqueta + ' — cambia la puntuación o los espacios',
                    item.texto, r.nodo.t, r.nodo.n);
            } else {
                correctos++;
            }
            revisarFormato(item, r.nodo);
        });

        /* Segunda pasada: lo que no apareció, ¿está con una palabra cambiada?
           Al montar se corrige alguna ("…información personal inglés" ->
           "…personal EN inglés"), y sin emparejarlas el mismo párrafo salía dos
           veces, como "falta" y como "sobra". */
        pendientes.forEach(function (item) {
            var casi = buscarCasi(item.texto);
            if (!casi) {
                anotar('error', 'Textos', item.etiqueta, item.texto, '', null);
                return;
            }
            anotar('aviso', 'Textos', item.etiqueta + ' — cambia una palabra al montar',
                item.texto, casi.t, casi.n);
            revisarFormato(item, casi);
        });

        /* Negritas y cursivas: el Word marca las corridas, el montaje las
           convierte en <strong>/<em>. Se comparan por firma porque el montaje
           deja la coma fuera de la negrita ("**rúbrica,**" -> "<strong>rúbrica</strong>,"). */
        function revisarFormato(item, nodo) {
            [['negritas', 'strong,b', 'negrita'], ['cursivas', 'em,i', 'cursiva']].forEach(function (par) {
                var esperadas = (item[par[0]] || []).map(firma).filter(Boolean);
                if (!esperadas.length) return;
                var casa = function (lista, f) {
                    return lista.some(function (p) {
                        return p === f || (p.length > 3 && f.indexOf(p) === 0) || (f.length > 3 && p.indexOf(f) === 0);
                    });
                };
                var deTexto = function (sel) {
                    return [].slice.call(nodo.n.querySelectorAll(sel))
                        .map(function (e) { return firma(e.textContent); }).filter(Boolean);
                };
                var enPagina = deTexto(par[1]);
                var enlazadas = deTexto('a');
                esperadas.forEach(function (f) {
                    if (casa(enPagina, f)) return;
                    /* La negrita que se volvió ENLACE no es un error: el guion
                       resalta así la palabra que hay que enlazar ("…la siguiente
                       **rúbrica**") y en las seis páginas de ejemplo esa palabra
                       va como <a>, nunca como <strong>. Marcarlo como error lo
                       ponía en el 100% de los montajes correctos. Pero tampoco se
                       calla: sale como aviso, con su nombre, para que se vea. */
                    if (casa(enlazadas, f)) {
                        anotar('aviso', 'Formato', 'La ' + par[2] + ' de «' + f + '» quedó como enlace, no como formato',
                            f, nodo.t, nodo.n);
                        return;
                    }
                    anotar('error', 'Formato', 'Falta la ' + par[2] + ' en «' + item.etiqueta + '»',
                        f, nodo.t, nodo.n);
                });
            });
        }

        /* Texto de más: solo cuenta si NO forma parte de nada esperado. Un <li>
           y su <p> interno comparten texto y solo uno queda "usado". */
        var firmasEsperadas = esperado.textos.map(function (x) { return firma(x.texto); })
            .filter(function (f) { return f.length > 2; });
        nodos.filter(function (x) { return !x.usado; }).forEach(function (x) {
            var parteDeAlgo = firmasEsperadas.some(function (f) {
                return f === x.f
                    || (x.f.length > 12 && f.indexOf(x.f) !== -1)
                    || (f.length > 12 && x.f.indexOf(f) !== -1);
            });
            if (!parteDeAlgo) anotar('aviso', 'Sobra', 'Texto que no está en el guion', '', x.t, x.n);
        });

        /* Marcas del guion publicadas. Son indicaciones para el montador
           (<Tabla>, <Lista numerada; son las instrucciones>) y jamás deben
           quedar visibles en la página. */
        var textoPagina = limpiar(raiz.textContent);
        var marcas = textoPagina.match(/[<«][^<>«»]{3,60}[>»]/g) || [];
        marcas.forEach(function (m) {
            anotar('error', 'Marcas', 'Quedó publicada una marca del guion', '', m, null);
        });

        /* El enlace de la rúbrica: la palabra tiene que ser un <a> al PDF, en
           pestaña nueva. Es lo que más se olvida al montar. */
        if (esperado.enlaceRubrica) {
            /* En singular o en plural es el mismo enlace: el guion dice tanto
               "la siguiente rúbrica" como "las rúbricas", y comparando la firma
               tal cual, un plural daba «no quedó enlazada» sobre un enlace que
               estaba perfecto. */
            var ancla = [].slice.call(raiz.querySelectorAll('a')).find(function (a) {
                return sinPlural(a.textContent) === sinPlural(esperado.enlaceRubrica.texto);
            });
            if (!ancla) {
                anotar('error', 'Enlaces', 'La palabra «' + esperado.enlaceRubrica.texto + '» no quedó enlazada',
                    esperado.enlaceRubrica.archivo || '(archivo de la rúbrica)', '', null);
            } else {
                var href = limpiar(ancla.getAttribute('href'));
                var archivo = (href.split('?')[0].split('/').pop() || '').toLowerCase();
                /* El PDF que se sube a Moodle casi nunca se llama igual que el
                   Word de la rúbrica: "rubrica aa3.docx" se publica como
                   "PR_SM1S1-RU_Rubrica_AA3.pdf". Exigir que el nombre coincidiera
                   marcaba como error un enlace correcto. Lo que sí tiene que
                   coincidir —y es lo que caza el enlace pegado de otra
                   actividad— es el número de la AA. */
                var deEsta = numeroDeActividad(esperado.enlaceRubrica.archivo);
                var deEnlace = numeroDeActividad(archivo);
                if (deEsta && deEnlace && deEsta !== deEnlace) {
                    anotar('error', 'Enlaces', 'El enlace apunta a la rúbrica de otra actividad',
                        esperado.enlaceRubrica.archivo, href, ancla);
                }
                if ((ancla.getAttribute('target') || '').toLowerCase() !== '_blank') {
                    anotar('aviso', 'Enlaces', 'El enlace de «' + esperado.enlaceRubrica.texto + '» no abre en pestaña nueva',
                        'target="_blank"', href, ancla);
                }
            }
        }

        /* Tablas: número de columnas y el data-label de cada celda, que es lo
           que convierte la tabla en tarjetas en el celular. Sin él, en un
           teléfono la tabla se lee como una lista sin encabezados. */
        var tablasPagina = [].slice.call(raiz.querySelectorAll('table'));
        (esperado.tablas || []).forEach(function (tabla, i) {
            var t = tablasPagina[i];
            if (!t) {
                anotar('error', 'Tablas', 'Falta la tabla ' + (i + 1), tabla.encabezados.join(' | '), '', null);
                return;
            }
            var ths = [].slice.call(t.querySelectorAll('thead th')).map(function (x) { return limpiar(x.textContent); });
            if (ths.length !== tabla.encabezados.length) {
                anotar('error', 'Tablas', 'La tabla ' + (i + 1) + ' tiene otro número de columnas',
                    tabla.encabezados.length + ' columnas', ths.length + ' columnas', t);
            }
            var sinEtiqueta = [].slice.call(t.querySelectorAll('tbody td')).filter(function (td) {
                return !td.getAttribute('data-label');
            });
            if (sinEtiqueta.length) {
                anotar('aviso', 'Tablas', 'La tabla ' + (i + 1) + ' tiene celdas sin data-label (no se vuelve tarjeta en celular)',
                    'data-label en cada celda', sinEtiqueta.length + ' celdas sin él', t);
            }
        });

        return { revisados: esperado.textos.length, correctos: correctos };
    }

    /* ============================================================== RÚBRICA */

    function revisarRubrica(esperado) {
        var filas = [].slice.call(document.querySelectorAll('#rubric-criteria tr.criterion, .criteria tr.criterion'));
        var enPagina = filas.map(function (tr) {
            var desc = tr.querySelector('td.description');
            var niveles = [].slice.call(tr.querySelectorAll('td.levels .level-wrapper')).map(function (w) {
                var def = w.querySelector('.definition');
                var pts = w.querySelector('.scorevalue');
                return {
                    nombre: limpiar(def ? def.textContent : ''),
                    puntos: limpiar(pts ? pts.textContent : ''),
                    nodo: w
                };
            });
            return { nombre: limpiar(desc ? desc.textContent : ''), crudo: desc ? desc.textContent : '', niveles: niveles, nodo: tr };
        });

        if (enPagina.length !== esperado.criterios.length) {
            anotar('error', 'Rúbrica',
                'La rúbrica montada tiene ' + enPagina.length + ' criterios y la del Word tiene ' + esperado.criterios.length,
                esperado.criterios.length + ' criterios', enPagina.length + ' criterios',
                document.querySelector('#rubric-criteria'));
        }

        esperado.criterios.forEach(function (c, i) {
            var m = enPagina[i];
            if (!m) {
                anotar('error', 'Rúbrica', 'Falta el criterio ' + (i + 1), c.nombre, '', null);
                return;
            }
            var esperadoNombre = limpiar(sinVinetas(c.nombre));
            var actualNombre = limpiar(sinVinetas(m.crudo));
            if (esperadoNombre !== actualNombre) {
                anotar(firma(esperadoNombre) === firma(actualNombre) ? 'aviso' : 'error',
                    'Rúbrica', 'Criterio ' + (i + 1), esperadoNombre, actualNombre, m.nodo);
            }
            if (m.niveles.length !== c.niveles.length) {
                anotar('error', 'Rúbrica',
                    'El criterio ' + (i + 1) + ' tiene ' + m.niveles.length + ' niveles y debería tener ' + c.niveles.length,
                    c.niveles.join(' · '), m.niveles.map(function (x) { return x.nombre; }).join(' · '), m.nodo);
            }
            c.niveles.forEach(function (nivel, j) {
                var mn = m.niveles[j];
                if (!mn) return;
                if (firma(nivel) !== firma(mn.nombre)) {
                    anotar('error', 'Rúbrica', 'Nivel ' + (j + 1) + ' del criterio ' + (i + 1),
                        nivel, mn.nombre, mn.nodo);
                }
                var puntosEsperados = String(c.puntos[j] == null ? '' : c.puntos[j]).replace(',', '.');
                var puntosPagina = String(mn.puntos || '').replace(',', '.');
                if (puntosEsperados && Number(puntosEsperados) !== Number(puntosPagina)) {
                    anotar('error', 'Rúbrica',
                        'Puntos del nivel «' + nivel + '» en el criterio ' + (i + 1),
                        puntosEsperados, puntosPagina, mn.nodo);
                }
            });
        });

        /* La suma del nivel más alto tiene que dar el total del Word. Es la
           comprobación que caza un criterio olvidado aunque los demás estén
           perfectos: sin ella, una rúbrica de 70 puntos se ve bien. */
        if (esperado.total) {
            var suma = 0;
            enPagina.forEach(function (c) {
                var mejor = 0;
                c.niveles.forEach(function (n) {
                    var v = Number(String(n.puntos).replace(',', '.'));
                    if (isFinite(v) && v > mejor) mejor = v;
                });
                suma += mejor;
            });
            if (Number(esperado.total) !== suma) {
                anotar('error', 'Rúbrica', 'La rúbrica no suma el total del Word',
                    esperado.total + ' puntos', suma + ' puntos', document.querySelector('#rubric-criteria'));
            }
        }

        /* Descriptores cualitativos. Al montarlos se corrigen comas y
           concordancias, así que una diferencia de puntuación es aviso. */
        var parrafos = [].slice.call(document.querySelectorAll(
            '.gradingform_rubric-description p, .definition-preview p'));
        (esperado.descriptores || []).forEach(function (d) {
            var clave = firma(d.nivel);
            var p = parrafos.find(function (x) { return firma(x.textContent).indexOf(clave) === 0; });
            if (!p) {
                anotar('error', 'Descriptores', 'Falta el descriptor de «' + d.nivel + '»', d.texto, '', null);
                return;
            }
            var actual = limpiar(p.textContent);
            var esperadoTexto = limpiar(d.texto);
            if (actual !== esperadoTexto) {
                anotar(firma(actual) === firma(esperadoTexto) ? 'aviso' : 'aviso',
                    'Descriptores', 'Descriptor de «' + d.nivel + '»', esperadoTexto, actual, p);
            }
            var fuerte = p.querySelector('strong,b');
            if (!fuerte) {
                anotar('aviso', 'Descriptores', 'El nombre del nivel «' + d.nivel + '» no quedó en negrita',
                    d.nivel, actual.slice(0, 40), p);
            }
        });

        return { revisados: esperado.criterios.length, correctos: 0 };
    }

    /* ================================================================ Panel */

    function pintar(modo, resumen) {
        [].slice.call(document.querySelectorAll('.qa51-marca')).forEach(function (n) {
            n.style.outline = '';
            n.classList.remove('qa51-marca');
        });
        var viejo = document.getElementById('qa51-panel');
        if (viejo) viejo.remove();

        var errores = hallazgos.filter(function (h) { return h.nivel === 'error'; });
        var avisos = hallazgos.filter(function (h) { return h.nivel === 'aviso'; });

        hallazgos.forEach(function (h) {
            if (!h.nodo) return;
            h.nodo.style.outline = '3px solid ' + (h.nivel === 'error' ? '#c62828' : '#ef6c00');
            h.nodo.classList.add('qa51-marca');
        });

        var estado = errores.length ? 'CON ERRORES' : (avisos.length ? 'REVISAR AVISOS' : 'TODO CORRECTO');
        var color = errores.length ? '#c62828' : (avisos.length ? '#ef6c00' : '#2e7d32');

        var panel = document.createElement('div');
        panel.id = 'qa51-panel';
        panel.style.cssText = 'position:fixed;top:12px;right:12px;width:460px;max-height:90vh;overflow:auto;'
            + 'z-index:2147483647;background:#fff;color:#222;border:1px solid #ddd;border-radius:12px;'
            + 'padding:14px 16px;box-shadow:0 12px 44px rgba(0,0,0,.35);font:13px/1.5 system-ui,sans-serif';

        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
            + '<strong style="font-size:15px">QA ' + esc(modo) + ' · Moodle 5.1</strong>'
            + '<button id="qa51-cerrar" style="border:0;background:#eee;border-radius:6px;padding:4px 10px;cursor:pointer">Cerrar</button></div>'
            + '<div style="background:' + color + ';color:#fff;padding:9px 11px;border-radius:8px;font-weight:700;margin-bottom:10px">'
            + estado + '</div>'
            + '<div style="color:#555;margin-bottom:10px">' + resumen + '</div>';

        if (!hallazgos.length) {
            html += '<div style="background:#e8f5e9;border-left:3px solid #2e7d32;padding:10px;border-radius:6px">'
                + 'Todo lo del Word aparece en Moodle, con el mismo texto y el mismo formato.</div>';
        }

        [['error', 'Errores', '#c62828', '#fff5f5'], ['aviso', 'Avisos', '#ef6c00', '#fff9ed']].forEach(function (t) {
            var lista = hallazgos.filter(function (h) { return h.nivel === t[0]; });
            if (!lista.length) return;
            html += '<h4 style="margin:14px 0 6px;color:' + t[2] + '">' + t[1] + ' (' + lista.length + ')</h4>';
            lista.forEach(function (h) {
                var d = diferencia(h.esperado, h.actual);
                html += '<div style="border-left:3px solid ' + t[2] + ';padding:7px 9px;margin:6px 0;background:' + t[3] + ';border-radius:0 6px 6px 0">'
                    + '<strong>' + esc(h.grupo) + ' · ' + esc(h.titulo) + '</strong>';
                if (h.esperado || h.actual) {
                    html += '<div style="margin-top:4px;white-space:pre-wrap">'
                        + (h.esperado ? '<strong>En el Word:</strong> ' + d.esperado + '<br>' : '')
                        + '<strong>En Moodle:</strong> ' + d.actual + '</div>';
                }
                html += '</div>';
            });
        });

        panel.innerHTML = html;
        document.body.appendChild(panel);
        document.getElementById('qa51-cerrar').onclick = function () {
            [].slice.call(document.querySelectorAll('.qa51-marca')).forEach(function (n) {
                n.style.outline = '';
                n.classList.remove('qa51-marca');
            });
            panel.remove();
        };
        var primero = document.querySelector('.qa51-marca');
        if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { errores: errores.length, avisos: avisos.length };
    }

    /* ================================================================ Arranque */

    if (esRubrica) {
        if (!DATOS.rubrica) {
            alert('Esta es la pantalla de la rúbrica, pero el verificador se generó sin el Word de la rúbrica.');
            return;
        }
        var r = revisarRubrica(DATOS.rubrica);
        return pintar('de rúbrica', r.revisados + ' criterios del Word cotejados');
    }

    if (!DATOS.actividad) {
        alert('Esta parece la página de la actividad, pero el verificador se generó sin el Word del guion.');
        return;
    }
    if (!raizActividad) {
        alert('No se encontró el contenido de la actividad en esta página. Ábrela ya guardada, no en el editor.');
        return;
    }
    var a = revisarActividad(DATOS.actividad);
    return pintar('de actividad', a.revisados + ' textos del guion cotejados · ' + a.correctos + ' idénticos');
};
