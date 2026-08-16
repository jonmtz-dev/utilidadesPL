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

    // El número editorial del reactivo, cuando el guion lo escribe. Es la única
    // señal que distingue dos reactivos con el MISMO enunciado, cosa que pasa
    // de verdad: en “Primeros pasos a la Cultura digital” la 5 y la 6 son
    // idénticas palabra por palabra.
    function numeroDePregunta(s) {
        const m = limpiar(s).match(/^\s*(?:pregunta\s+)?(\d{1,3})\s*[.)\-–—]{1,3}(?=\s|[\p{L}¿¡])/iu);
        return m ? Number(m[1]) : null;
    }

    // Word marca las celdas combinadas verticalmente: la fila donde empieza la
    // combinación lleva <w:vMerge w:val="restart"> y las siguientes un
    // <w:vMerge> sin valor. Se lee del `tcPr` propio de la celda, no de uno de
    // una tabla anidada dentro de ella.
    function continuaCombinacion(celda) {
        const hijoDirecto = (nodo, nombre) => [...nodo.childNodes].find(n =>
            n.nodeType === 1 && n.namespaceURI === W_NS && n.localName === nombre);
        const propiedades = hijoDirecto(celda, 'tcPr');
        const combinacion = propiedades && hijoDirecto(propiedades, 'vMerge');
        if (!combinacion) return false;
        return !/^restart$/i.test(combinacion.getAttributeNS(W_NS, 'val') || '');
    }

    /* Cada reactivo ocupa varias filas y los guiones lo escriben de tres formas:
       con la celda Pregunta combinada verticalmente (el enunciado solo en la
       primera fila), dejando vacías las celdas de continuación, o repitiendo el
       mismo enunciado en las cuatro filas. Decidir solo por “el texto cambió”
       cubría las tres, pero fusionaba dos reactivos consecutivos con el mismo
       enunciado: por eso el Word de Cultura digital se leía con 14 reactivos y
       las respuestas de la 6 acababan colgando de la 5. */
    function abreReactivo(celda, enunciado, actual) {
        if (continuaCombinacion(celda)) return false;   // Word ya dijo que sigue
        if (!enunciado) return false;                   // fila sin enunciado
        if (!actual) return true;
        const numero = numeroDePregunta(enunciado);
        if (numero !== null && actual.numero !== null) return numero !== actual.numero;
        return firma(sinNumeroDePregunta(enunciado)) !== firma(actual.texto);
    }

    /* Marcas del guion: TODO lo que producción escribe entre < > es una
       instrucción de montaje, nunca contenido publicado —así lo dice el
       catálogo en tools/guion-a-pagina/README.md: «cualquier otra se guarda
       como indicación, no se publica»—.

       Se enumeraban las conocidas (`<Figura>`, `<Tabla>`…) y no alcanzó: cada
       quien las redacta a su manera. En cinco guiones reales hay 24 marcas
       distintas —`<Texto centrado>`, `<Texto regular centrado>`, `<Lista
       numerada>`, `<Tabla con encabezado centrado y texto alineado a la
       izquierda>`, `<h2>`…— y NINGUNA es contenido. Perseguir la lista era
       perder siempre, así que se borra cualquier `<…>`.

       Los guardarraíles para no comerse un `a < b` del enunciado: sin saltos de
       línea ni corchetes anidados, como mucho 120 caracteres (la más larga de
       verdad mide 62) y con al menos una letra dentro. Un `menor que (<)` no
       tiene cierre y no se toca. */
    const MARCAS_DEL_GUION = /<[^<>\n]{1,120}>/g;

    function sinMarcasDelGuion(s) {
        return String(s).replace(MARCAS_DEL_GUION, function (marca) {
            return /\p{L}/u.test(marca) ? ' ' : marca;
        });
    }

    // Solo las que anuncian una imagen: `<Lista numerada>` no lleva imagen, y
    // el aviso de “revísala a ojo” sería mentira.
    const MARCAS_DE_IMAGEN =
        /<\s*(?:(?:termina|terminan|termino)\s+)?(?:figuras?|im[aá]gen(?:es)?)\s*>/i;

    function normalizarNotacion(s) {
        return String(s == null ? '' : s)
            // Cuando el guion trae símbolo visible + código alternativo, el
            // segundo es una duplicación editorial y Moodle solo muestra uno.
            .replace(/<\s*latex\s*>([\s\S]*?)<\s*termino\s+latex\s*>/gi, ' ')
            .replace(/<\s*cod\s+lat\s*>[\s\S]*?<\s*termina\s+cod\s+lat\s*>/gi, ' ')
            .replace(/(\S+)\s*<\s*latex\s*#([\s\S]*?)#\s*>/gi, '$1')
            .replace(/<\s*latex\s*#([\s\S]*?)#\s*>/gi, ' $1 ')
            .replace(/<\s*(?:termina\s+)?ecuaci[oó]n\s*>/gi, ' ')
            // Las marcas del guion se van al final, después de las de fórmulas:
            // `<Latex>…<Termino Latex>` borra también lo de en medio y tiene
            // que correr antes de que la regla general se lleve los extremos.
            .replace(MARCAS_DEL_GUION, function (marca) {
                return /\p{L}/u.test(marca) ? ' ' : marca;
            })
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

    // \u201cA y B\u201d, \u201cA, B y C\u201d: los avisos se leen de corrido y un \u201cA y B y C\u201d chirr\u00eda.
    function enumerar(lista) {
        if (lista.length < 2) return lista.join('');
        return lista.slice(0, -1).join(', ') + ' y ' + lista[lista.length - 1];
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

    /* El morado marca la respuesta correcta, pero los guiones no lo ponen en el
       mismo sitio: unos pintan el texto de la respuesta (columna Respuestas) y
       otros la palabra “Correcta.” de la retroalimentación. Se miran las dos
       celdas. En los cuatro guiones revisados cada uno usa una sola de las dos
       formas, nunca las dos ni contradiciéndose, así que aceptar ambas no
       afloja nada: la comprobación cruzada contra la palabra “Correcta.” sigue
       en pie y salta si el morado cae en una “Incorrecta.”. */
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
        // Cómo venía escrito el Word, para poder enseñarlo en el resumen: si la
        // lectura sale mal, lo primero que hay que ver es cómo se agruparon las
        // filas.
        const formas = { combinada: 0, vacia: 0, repetida: 0 };
        // En cuál de las dos celdas apareció el morado, para poder decirlo.
        const marcas = { respuesta: 0, retroalimentacion: 0 };
        let filasLeidas = 0;
        let actual = null;
        for (const fila of filasDirectas(tabla).slice(1)) {
            const celdas = celdasDirectas(fila, tabla);
            if (celdas.length < 3) continue;
            filasLeidas++;
            const crudo = textoNodo(celdas[0]);
            const pregunta = sinNumeroDePregunta(crudo);
            if (abreReactivo(celdas[0], crudo, actual)) {
                const partes = partesDePregunta(celdas[0], tabla);
                actual = {
                    texto: pregunta,
                    numero: numeroDePregunta(crudo),
                    textoPrincipal: partes.textoPrincipal,
                    contenidoTabular: partes.contenidoTabular,
                    tieneTabla: partes.tieneTabla,
                    // El enunciado también puede llevar imagen, y de dos formas:
                    // incrustada en la celda o anunciada con la marca <Figura>
                    // para que producción la coloque. Las dos significan “aquí
                    // va una imagen” y las dos hay que revisarlas a ojo.
                    imagenesEnunciado: idsImagenes(celdas[0]).length,
                    esperaFigura: MARCAS_DE_IMAGEN.test(crudo),
                    opciones: []
                };
                preguntas.push(actual);
            } else if (actual) {
                if (continuaCombinacion(celdas[0])) formas.combinada++;
                else if (!pregunta) formas.vacia++;
                else formas.repetida++;
            }
            if (!actual) continue;
            const retroalimentacion = textoNodo(celdas[2]);
            const moradoEnRespuesta = resaltadoMagenta(celdas[1]);
            const moradoEnRetro = resaltadoMagenta(celdas[2]);
            if (moradoEnRespuesta) marcas.respuesta++;
            if (moradoEnRetro) marcas.retroalimentacion++;
            const correctaPorColor = moradoEnRespuesta || moradoEnRetro;
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
            // Una celda en blanco se lee sin protestar y en Moodle aparece como
            // una opción vacía. Una respuesta puede no tener texto —las hay solo
            // con imagen—, pero entonces tiene que traer la imagen.
            p.opciones.forEach((o, j) => {
                const letra = String.fromCharCode(65 + j);
                if (!o.texto && !o.imagenes.length) {
                    avisos.push(`Pregunta ${i + 1}, opción ${letra}: la celda de respuesta está vacía.`);
                }
                if (!limpiar(o.retroalimentacion)) {
                    avisos.push(`Pregunta ${i + 1}, opción ${letra}: no tiene retroalimentación.`);
                }
            });
            // Dos opciones iguales dentro del mismo reactivo: el mismo descuido
            // que dos reactivos gemelos, una celda más abajo. El verificador las
            // emparejaría con la misma respuesta de Moodle y el error saldría
            // donde no es.
            const porOpcion = new Map();
            p.opciones.forEach((o, j) => {
                const clave = o.texto ? firma(o.texto)
                    : (o.imagenes.length ? 'imagen:' + o.imagenes.map(im => im.nombre).join('|') : '');
                if (!clave) return;   // la vacía ya se avisó arriba
                if (!porOpcion.has(clave)) porOpcion.set(clave, []);
                porOpcion.get(clave).push(String.fromCharCode(65 + j));
            });
            porOpcion.forEach(letras => {
                if (letras.length > 1) {
                    avisos.push(`Pregunta ${i + 1}: las opciones ${enumerar(letras)} son idénticas.`);
                }
            });
        });
        if (preguntas.length < 5 || preguntas.length > 10) {
            avisos.push(`El guion tiene ${preguntas.length} reactivos; sus indicaciones permiten de 5 a 10.`);
        }

        // Dos reactivos con el mismo enunciado se leen bien —los separa el
        // número—, pero casi siempre son un descuido del guion: hay que verlo
        // aquí y no descubrirlo en Moodle.
        const porEnunciado = new Map();
        preguntas.forEach((p, i) => {
            const clave = firma(p.texto);
            if (!porEnunciado.has(clave)) porEnunciado.set(clave, []);
            porEnunciado.get(clave).push(i + 1);
        });
        porEnunciado.forEach(lista => {
            if (lista.length > 1) {
                avisos.push(`Los reactivos ${enumerar(lista.map(String))} tienen el mismo enunciado en el guion.`);
            }
        });
        // La numeración del Word tiene que ir 1, 2, 3… Si salta o se repite, o
        // el guion está mal numerado o una fila se agrupó donde no debía.
        const numerados = preguntas.filter(p => p.numero !== null);
        if (numerados.length === preguntas.length) {
            const desfase = preguntas.filter((p, i) => p.numero !== i + 1);
            if (desfase.length) {
                avisos.push(`La numeración del guion no es correlativa: se leyó `
                    + preguntas.map(p => p.numero).join(', ') + '.');
            }
        }

        const formasLeidas = [];
        if (formas.combinada) formasLeidas.push('celda combinada');
        if (formas.vacia) formasLeidas.push('celda vacía');
        if (formas.repetida) formasLeidas.push('enunciado repetido');

        // Las marcas se borran para comparar, pero anuncian una imagen que la
        // herramienta NO sabe cotejar en el enunciado: hay que mirarla a ojo.
        const conMarca = preguntas
            .map((p, i) => (MARCAS_DE_IMAGEN.test(p.texto + ' ' + p.contenidoTabular) ? i + 1 : 0))
            .filter(Boolean);
        if (conMarca.length) {
            avisos.push(`Revisa a ojo la imagen de ${conMarca.length === 1 ? 'el reactivo' : 'los reactivos'} `
                + `${enumerar(conMarca.map(String))}: el guion la anuncia con una marca `
                + `(<Figura>) y eso no se puede cotejar solo.`);
        }

        const donde = [];
        if (marcas.respuesta) donde.push('sobre la respuesta');
        if (marcas.retroalimentacion) donde.push('sobre la retroalimentación');
        // Las dos a la vez no se han visto; si pasa, mejor saberlo que suponerlo.
        if (donde.length > 1) {
            avisos.push('El morado de la respuesta correcta aparece unas veces sobre la respuesta '
                + 'y otras sobre la retroalimentación.');
        }

        const todo = [...doc.getElementsByTagNameNS(W_NS, 'p')]
            .map(textoNodo).filter(Boolean).join('\n');
        const intentos = todo.match(/Intentos\s+permitidos\s*:\s*(\d+)/i);
        const apertura = todo.match(/disponible[\s\S]{0,120}?a\s+las\s+(\d{1,2}:\d{2})/i);
        const cierre = todo.match(/cerrar[áa][\s\S]{0,120}?a\s+las\s+(\d{1,2}:\d{2})/i);
        const instruccionCruda = parrafoQueEmpieza(doc, 'Instrucciones');

        return {
            archivo: file.name,
            clave: claveDeEvidencia(file.name),
            titulo: valorDespuesDeEtiqueta(doc, 'Título del recurso:'),
            instruccion: instruccionCruda.replace(/^\s*Instrucciones\s*:\s*/i, ''),
            preguntas,
            avisos,
            lectura: {
                filas: filasLeidas,
                formato: formasLeidas.join(' + ') || 'una fila por reactivo',
                marca: donde.join(' y ') || 'sin morado en el guion',
                // Cuáles se ignoraron, para que borrarlas no sea magia
                // invisible: si una era contenido de verdad, se ve aquí. Solo
                // las de los reactivos, que son las que afectan al cotejo.
                marcasIgnoradas: [...new Set(preguntas
                    .map(p => [p.texto, p.contenidoTabular,
                        ...p.opciones.map(o => o.texto + ' ' + o.retroalimentacion)].join(' '))
                    .join(' ')
                    .match(MARCAS_DEL_GUION) || [])].filter(m => /\p{L}/u.test(m)).sort()
            },
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

    /* La clave con que producción nombra el guion: `SM1S4-CF4` dentro de
       `01S.03_PR_SM1S4-CF4_Comunicacion….docx`. Se calcula UNA vez, aquí, y
       viaja en los datos: da nombre al PDF de la evidencia y también al
       marcador, para que al arrastrarlo a la barra el favorito se llame igual
       que el archivo que va a producir.

       El separador cambia según quién nombre el archivo (`SM1S4-CF4`,
       `SM2S1_CF1`): se acepta cualquiera y siempre sale con guion. Sin clave se
       usa el nombre del archivo saneado, antes que inventar una. */
    function claveDeEvidencia(nombre) {
        const texto = String(nombre || '');
        const clave = texto.match(/SM\s*(\d+)\s*S\s*(\d+)\s*[-_ ]?\s*CF\s*(\d+)/i);
        if (clave) return `SM${clave[1]}S${clave[2]}-CF${clave[3]}`;
        const base = texto.replace(/\.[a-z0-9]+$/i, '').trim();
        if (base) return base.replace(/[\\/:*?"<>|\s]+/g, '_');
        return new Date().toISOString().slice(0, 10);
    }

    const escapar = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /* El generador de evidencia vive en `assets/evidencia-qa.js` y lo comparten
       las dos herramientas de QA, así que viaja serializado junto al
       verificador y se le pasa como argumento. No se cuelga de `window` para no
       dejar rastro en la página de Moodle. */
    function codigoVerificador() {
        return 'void (function () {\n'
            + 'var evidencia = ' + window.EVIDENCIA_QA.toString() + ';\n'
            + '(' + window.VERIFICADOR_CF.toString() + ')(' + JSON.stringify(datos) + ', evidencia);\n'
            + '}());';
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
        // El texto del enlace es el nombre que toma el favorito al arrastrarlo
        // a la barra: el mismo del PDF, así el marcador dice de qué guion es.
        $('#marcador-nombre').textContent = 'QA_' + datos.cuestionario.clave;
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
            <div class="resumen-dato"><span>Lectura del Word</span><span>${q.lectura.filas} filas · ${escapar(q.lectura.formato)}</span></div>
            <div class="resumen-dato"><span>Respuesta correcta</span><span>morado ${escapar(q.lectura.marca)}</span></div>
            <div class="resumen-dato"><span>Correctas identificadas</span><span>${correctas} de ${q.preguntas.length}</span></div>
            <div class="resumen-dato"><span>Imágenes en respuestas</span><span>${imagenes}</span></div>
            <div class="resumen-dato"><span>Perfil</span><span>${q.perfil.intentos} intentos · calificación más alta · respuestas barajables</span></div>
            ${q.avisos.length ? `<div class="resumen-alerta">
                <p class="resumen-alerta-titulo">
                    <i class="ph-fill ph-warning"></i>
                    ${q.avisos.length} ${q.avisos.length === 1 ? 'aviso del guion' : 'avisos del guion'}
                </p>
                <ul class="resumen-alerta-lista">
                    ${q.avisos.map(a => `<li>${escapar(a)}</li>`).join('')}
                </ul>
            </div>` : `<div class="resumen-limpio">
                <i class="ph-fill ph-check-circle"></i> El guion se leyó sin avisos.
            </div>`}
        </div>`;
        $('#btn-quitar').addEventListener('click', quitar);
    }

    // Qué le pasa a un reactivo tal como se leyó del Word. Vacío = está bien.
    // El objetivo es que una lectura torcida (dos reactivos fusionados, una
    // correcta sin morado) se vea aquí antes de ir a Moodle.
    function pegasDelReactivo(p) {
        const pegas = [];
        const correctas = p.opciones.filter(o => o.correcta).length;
        if (p.opciones.length !== 4) pegas.push(`${p.opciones.length} opciones`);
        if (correctas !== 1) pegas.push(correctas ? `${correctas} correctas` : 'sin correcta');
        if (p.opciones.some(o => !o.texto && !o.imagenes.length)) pegas.push('opción vacía');
        if (p.opciones.some(o => !limpiar(o.retroalimentacion))) pegas.push('sin retroalimentación');
        const claves = p.opciones.map(o => firma(o.texto)).filter(Boolean);
        if (new Set(claves).size !== claves.length) pegas.push('opciones repetidas');
        return pegas;
    }

    function dibujarRevision() {
        const q = datos.cuestionario;
        const tamanos = [...new Set(q.preguntas.map(p => p.opciones.length))].sort((a, b) => a - b);
        const reparto = tamanos.length === 1
            ? `de ${tamanos[0]} opciones cada uno`
            : `con ${tamanos.join(', ')} opciones según el reactivo`;
        $('#revisar-lista').innerHTML = `<div class="check-bloque">
            <h3><i class="ph ph-file-magnifying-glass"></i> Cómo se leyó el Word</h3>
            <p class="check-nota">Tabla <strong>Pregunta · Respuestas · Retroalimentación</strong> de
            ${q.lectura.filas} filas, agrupadas por <strong>${escapar(q.lectura.formato)}</strong>:
            ${q.preguntas.length} reactivos ${escapar(reparto)}.
            La respuesta correcta se tomó del <strong>morado ${escapar(q.lectura.marca)}</strong>.
            Los puntajes no vienen en el guion: se leen de Moodle y se informan al final.</p>
            ${q.lectura.marcasIgnoradas.length ? `<p class="check-nota"><strong>Marcas de producción
            ignoradas</strong> (son instrucciones de montaje, no contenido; en Moodle no deben aparecer):
            ${q.lectura.marcasIgnoradas.map(m => `<code>${escapar(m)}</code>`).join(' ')}</p>` : ''}
        </div>
        <div class="check-bloque">
            <h3><i class="ph ph-sliders-horizontal"></i> Configuración solicitada</h3>
            <p class="check-nota">${q.perfil.intentos} intentos · calificación más alta · retroalimentación diferida ·
            mostrar correcta/incorrecta · ocultar la respuesta correcta · respuestas barajables ·
            apertura ${escapar(q.perfil.apertura)} · cierre ${escapar(q.perfil.cierre)}${q.perfil.cierreEnDomingo ? ' en domingo' : ''}.</p>
            <p class="check-nota"><strong>Puntajes:</strong> se muestran como información; todavía no se exige un total.</p>
        </div>
        <div class="check-bloque">
            <h3><i class="ph ph-list-numbers"></i> Reactivos (${q.preguntas.length})</h3>
            <div class="qa-lista-textos">${q.preguntas.map((p, i) => {
                const pegas = pegasDelReactivo(p);
                // El número del Word solo se enseña cuando no coincide con la
                // posición: si el guion salta un número, aquí se ve.
                const numero = p.numero !== null && p.numero !== i + 1 ? ` · Word ${p.numero}` : '';
                return `
                <div class="qa-linea${pegas.length ? ' qa-linea--alerta' : ''}">
                    <span class="qa-etiqueta">Pregunta ${i + 1}${numero}</span>
                    <span class="qa-texto">${escapar(p.texto.slice(0, 180))}${p.texto.length > 180 ? '…' : ''}
                    ${pegas.length ? `<span class="qa-pega">${escapar(pegas.join(' · '))}</span>` : ''}
                    <span class="qa-opciones">${p.opciones.map((o, j) => `
                        <span class="qa-opcion ${o.correcta ? 'qa-opcion--correcta' : ''}"
                              title="${escapar(o.texto || (o.imagenes.length ? 'Respuesta con imagen' : 'Sin texto'))}">
                            ${String.fromCharCode(65 + j)}${o.correcta ? ' ✓' : ''} · ${escapar(o.texto || (o.imagenes.length ? 'Imagen' : '—'))}
                        </span>`).join('')}</span></span></div>`;
            }).join('')}
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
