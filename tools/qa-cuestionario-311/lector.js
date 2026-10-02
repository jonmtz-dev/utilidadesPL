/* ==========================================================================
   Lector del guion de un CUESTIONARIO (plugin Questionnaire, Moodle 3.11).

   Es otro documento que el del cuestionario formativo de 5.1. Aquel trae una
   tabla anidada `Pregunta | Respuestas | Retroalimentación` con la respuesta
   correcta en morado; este es una encuesta: no hay respuesta correcta ni
   retroalimentación, y la estructura es la plantilla de PANTALLAS de
   producción:

       Pantalla | Contenido
       1        | Propósito, instrucciones, fechas, <Comenzar>
       2        | <H2>, banner con el título, instrucciones, preguntas,
                | <Enviar todo y terminar>

   Cómo se reconoce cada cosa (medido en un guion real, no supuesto):

   · PREGUNTA   un párrafo numerado (`w:numPr`) seguido de opciones `☐` o de un
                recuadro de respuesta. Word numera solo; el número que se
                compara es el orden.
   · OPCIÓN     un párrafo que empieza con `☐`. Puede traer texto después o no:
                en el guion revisado NO lo trae, y eso ya es un hallazgo.
   · ABIERTA    una tabla de una sola celda VACÍA tras la pregunta: es el
                recuadro donde se escribe.
   · MARCA      `<Comenzar>`, `<H2>`, `<Enviar todo y terminar>`: instrucciones
                de montaje, nunca contenido (mismo criterio que
                tools/guion-a-pagina/README.md).
   · COLOR      el resaltado manda el papel del texto. Lo dice el propio
                guion: amarillo = montaje, turquesa = producción, verde =
                «deberá conservar el estilo».

   Solo LEE. No usa nada que no esté ya en assets/docx.js (abrirDocumentoDocx,
   segmentosDeParrafo, leerComentariosDeDocx): lo compartido se agrega, no se
   cambia.
   ========================================================================== */

(function (global) {
    'use strict';

    const limpio = s => String(s == null ? '' : s)
        .replace(/[\u00a0\u200b\u200c\u200d\u00ad\ufeff]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const COLOR_MONTAJE = ['yellow'];
    const COLOR_PRODUCCION = ['cyan', 'turquoise', 'darkcyan'];
    const COLOR_ESTILO = ['green', 'darkgreen'];

    const NUMEROS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
    const comoNumero = t => {
        const s = String(t || '').toLowerCase();
        return /^\d+$/.test(s) ? Number(s) : (NUMEROS[s] || 0);
    };

    /* --------------------------------------------------------- Bloques */

    const esW = (n, local) => n && n.nodeType === 1 && n.namespaceURI === W_NS && n.localName === local;
    const hijosW = (nodo, local) => [...nodo.childNodes].filter(n => esW(n, local));
    const textoPlano = nodo => limpio([...nodo.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent || '').join(' '));

    function leerParrafo(p) {
        const segs = segmentosDeParrafo(p, { colores: true, cursivas: true });
        const texto = limpio(segs.map(s => s.texto).join(''));

        /* Las negritas y cursivas se juntan en tramos MAXIMALES: con colores
           encendidos Word parte un mismo tramo en negritas por cada cambio de
           resaltado, y compararlo así daría «Lee» y «con atención» como dos
           negritas distintas. */
        const tramos = (campo) => {
            const salida = [];
            let abierto = '';
            segs.forEach(s => {
                if (s.math) return;
                if (s[campo]) abierto += s.texto;
                else { if (limpio(abierto)) salida.push(limpio(abierto)); abierto = ''; }
            });
            if (limpio(abierto)) salida.push(limpio(abierto));
            return salida;
        };

        const peso = { montaje: 0, produccion: 0, estilo: 0, total: 0 };
        segs.forEach(s => {
            const n = limpio(s.texto).length;
            if (!n) return;
            peso.total += n;
            const c = String(s.resaltado || '').toLowerCase();
            if (COLOR_MONTAJE.includes(c)) peso.montaje += n;
            else if (COLOR_PRODUCCION.includes(c)) peso.produccion += n;
            else if (COLOR_ESTILO.includes(c)) peso.estilo += n;
        });
        /* Un recado de montaje está resaltado casi entero; «Instrucciones: Lee
           cada pregunta…» lleva verde solo en partes y sigue siendo contenido. */
        const mayoria = k => peso.total > 0 && peso[k] / peso.total >= 0.5;
        const rol = mayoria('montaje') ? 'montaje' : (mayoria('produccion') ? 'produccion' : 'contenido');

        const pPr = hijosW(p, 'pPr')[0];
        const numPr = pPr && hijosW(pPr, 'numPr')[0];
        const numId = numPr && hijosW(numPr, 'numId')[0];
        const numerado = Boolean(numPr) && !(numId && numId.getAttributeNS(W_NS, 'val') === '0');

        const marca = /^<([^<>]{1,80})>$/.exec(texto);
        const comentarios = [...new Set(segs.flatMap(s => s.comentarios || []))];

        return {
            tipo: 'p', texto, negritas: tramos('negrita'), cursivas: tramos('cursiva'),
            rol, conservaEstilo: peso.estilo > 0, numerado,
            marca: marca ? limpio(marca[1]) : '', comentarios
        };
    }

    /* Los bloques de una celda o del cuerpo, en orden. Los `w:sdt` de bloque se
       abren: Google Docs envuelve párrafos sueltos en ellos al exportar. */
    function bloquesDe(nodo) {
        const salida = [];
        [...nodo.childNodes].forEach(n => {
            if (esW(n, 'p')) salida.push(leerParrafo(n));
            else if (esW(n, 'tbl')) salida.push({ tipo: 'tabla', nodo: n });
            else if (esW(n, 'sdt')) hijosW(n, 'sdtContent').forEach(c => salida.push(...bloquesDe(c)));
        });
        return salida;
    }

    const filasDe = tbl => hijosW(tbl, 'tr');
    const celdasDe = tr => hijosW(tr, 'tc');
    function combinacion(tc) {
        const pr = hijosW(tc, 'tcPr')[0];
        const vm = pr && hijosW(pr, 'vMerge')[0];
        if (!vm) return '';
        return vm.getAttributeNS(W_NS, 'val') === 'restart' ? 'inicio' : 'sigue';
    }
    const esRecuadro = tbl => { const f = filasDe(tbl); return f.length === 1 && celdasDe(f[0]).length === 1; };
    const dimensiones = tbl => { const f = filasDe(tbl); return `${f.length}×${f[0] ? celdasDe(f[0]).length : 0}`; };

    /* ------------------------------------------------------ Indicaciones */

    /* Las instrucciones de montaje viven en la tabla de «Indicaciones», fila
       MON. Esa tabla combina celdas hacia abajo, así que la etiqueta (`DG`,
       `MON`) solo está en la primera fila de su grupo: se arrastra mientras la
       celda siguiente la «continúa». */
    const ETIQUETAS_DE_TABLA = /^(tipo de reactivos|opci[oó]n m[uú]ltiple|abiertos?|correlaci[oó]n|complemento|otro|marcar con x|describir|generales|hiperv[ií]nculos|insumos requeridos)\b/i;

    function leerIndicacionesDeMontaje(tablas) {
        const textos = [];
        tablas.forEach(tbl => {
            let grupo = '';
            filasDe(tbl).forEach(tr => {
                const celdas = celdasDe(tr);
                if (!celdas.length) return;
                const primera = celdas[0];
                const etiqueta = textoPlano(primera);
                if (combinacion(primera) === 'inicio' || (etiqueta && combinacion(primera) !== 'sigue')) grupo = etiqueta.toUpperCase();
                if (grupo !== 'MON') return;
                celdas.slice(1).forEach(tc => {
                    bloquesDe(tc).forEach(b => {
                        if (b.tipo !== 'p' || !b.texto || ETIQUETAS_DE_TABLA.test(b.texto)) return;
                        if (/^las indicaciones para (montaje|producci[oó]n)/i.test(b.texto)) return;
                        if (/^el texto resaltado en/i.test(b.texto)) return;
                        textos.push(b.texto);
                    });
                });
            });
        });
        return textos;
    }

    /* «cuatro preguntas con respuestas abiertas y una respuesta de opción
       múltiple»: lo que el guion PIDE, para contrastarlo con lo que el propio
       guion trae y con lo que hay en Moodle. */
    function pedidoDeMontaje(textos) {
        const junto = textos.join(' | ');
        const cantidad = '(\\d+|un[oa]?|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)';
        const abiertas = new RegExp(`${cantidad}\\s+preguntas?\\s+(?:con\\s+respuestas?\\s+)?abiertas?`, 'i').exec(junto);
        const multiple = new RegExp(`${cantidad}\\s+(?:respuestas?|preguntas?)\\s+de\\s+opci[oó]n\\s+m[uú]ltiple`, 'i').exec(junto);
        return {
            abiertas: abiertas ? comoNumero(abiertas[1]) : null,
            opcionMultiple: multiple ? comoNumero(multiple[1]) : null,
            sinIncorrectas: /no hay respuestas? incorrectas?/i.test(junto),
            recabaDatos: (/recabar[^|]*\(([^)]+)\)/i.exec(junto) || [])[1] || '',
            textos
        };
    }

    /* «disponible a partir del lunes [fecha], a las 00:00 horas y se cerrará el
       domingo [fecha], a las 23:59 horas». El guion deja la fecha entre
       corchetes y quien monta la escribe: se coteja el día y la hora, y la fecha
       completa contra los AJUSTES de Moodle (ver verificador.js). */
    function fechasPedidas(texto) {
        const m = /disponible a partir del\s+(\p{L}+)[^,]*,?\s*a las\s+(\d{1,2}):(\d{2})[^]*?cerrar[aá]\s+el\s+(\p{L}+)[^,]*,?\s*a las\s+(\d{1,2}):(\d{2})/iu.exec(texto);
        if (!m) return null;
        const hh = n => String(n).padStart(2, '0');
        return {
            diaApertura: m[1].toLowerCase(), horaApertura: `${hh(m[2])}:${m[3]}`,
            diaCierre: m[4].toLowerCase(), horaCierre: `${hh(m[5])}:${m[6]}`
        };
    }

    /* ------------------------------------------------------------ Lectura */

    async function leerGuionDeCuestionario(file) {
        const doc = await abrirDocumentoDocx(file);
        const body = doc.getElementsByTagNameNS(W_NS, 'body')[0] || doc.documentElement;
        const comentariosDocx = await leerComentariosDeDocx(file);
        const raiz = bloquesDe(body);
        const tablas = raiz.filter(b => b.tipo === 'tabla').map(b => b.nodo);
        const avisos = [];

        // --- Datos del recurso
        let titulo = '', tipoRecurso = '';
        tablas.forEach(tbl => filasDe(tbl).forEach(tr => {
            const c = celdasDe(tr);
            if (c.length < 2) return;
            const etiqueta = textoPlano(c[0]);
            if (/^t[ií]tulo del recurso/i.test(etiqueta) && !titulo) titulo = textoPlano(c[1]);
            if (/^tipo de recurso/i.test(etiqueta) && !tipoRecurso) tipoRecurso = textoPlano(c[1]);
        }));

        // --- Tabla de pantallas
        const tablaPantallas = tablas.find(tbl => {
            const f = filasDe(tbl)[0];
            const c = f ? celdasDe(f).map(textoPlano) : [];
            return c.length >= 2 && /^pantalla$/i.test(c[0]) && /^contenido$/i.test(c[1]);
        });
        if (!tablaPantallas) {
            throw new Error('no es un guion de cuestionario: falta la tabla «Pantalla | Contenido». '
                + 'Si es un cuestionario formativo con reactivos de cuatro opciones, es el QA de Cuestionario Formativo de Moodle 5.1.');
        }

        const pantallas = [];
        filasDe(tablaPantallas).slice(1).forEach(tr => {
            const c = celdasDe(tr);
            if (c.length < 2) return;
            const numero = textoPlano(c[0]);
            const sigue = combinacion(c[0]) === 'sigue' || !numero;
            if (!sigue || !pantallas.length) pantallas.push({ numero, bloques: [] });
            pantallas[pantallas.length - 1].bloques.push(...bloquesDe(c[1]));
        });
        if (!pantallas.length) throw new Error('la tabla de pantallas está vacía.');

        // --- Pantalla 1: la introducción de la actividad
        const intro = [];
        const botones = { comenzar: false, enviar: false };
        let fechas = null;
        pantallas[0].bloques.forEach(b => {
            if (b.tipo !== 'p' || !b.texto) return;
            if (b.marca) { if (/comenzar/i.test(b.marca)) botones.comenzar = true; return; }
            const plantillaFecha = /\[\s*fecha\s*\]/i.test(b.texto);
            if (plantillaFecha) fechas = fechasPedidas(b.texto);
            intro.push({
                texto: b.texto, negritas: b.negritas, cursivas: b.cursivas, rol: b.rol,
                conservaEstilo: b.conservaEstilo, plantillaFecha
            });
        });

        // --- Pantallas siguientes: encabezado, instrucciones y preguntas
        const cuerpo = pantallas.slice(1).flatMap(p => p.bloques);
        const marcas = [];
        const instrucciones = [];
        const preguntas = [];
        let banner = '';
        let actual = null;
        const esOpcion = b => b && b.tipo === 'p' && /^[☐□▢◻]/.test(b.texto);
        const esCaja = b => b && b.tipo === 'tabla' && esRecuadro(b.nodo);

        cuerpo.forEach((b, i) => {
            if (b.tipo === 'tabla') {
                if (!esRecuadro(b.nodo)) {
                    avisos.push(`Hay una tabla de ${dimensiones(b.nodo)} dentro de las pantallas del cuestionario: la herramienta no la coteja.`);
                    return;
                }
                const t = textoPlano(b.nodo);
                if (!actual && t) { banner = banner || t; return; }
                if (actual && !t) { actual.cajas++; return; }
                if (actual && t) avisos.push(`Pregunta ${actual.numero}: el recuadro de respuesta trae texto («${t.slice(0, 40)}»); se esperaba vacío.`);
                else avisos.push('Hay un recuadro vacío antes de la primera pregunta.');
                return;
            }
            if (!b.texto) return;
            if (b.marca) {
                marcas.push(b.marca);
                if (/enviar/i.test(b.marca)) botones.enviar = true;
                if (/comenzar/i.test(b.marca)) botones.comenzar = true;
                return;
            }
            if (esOpcion(b)) {
                if (!actual) { avisos.push('Hay una opción «☐» antes de la primera pregunta.'); return; }
                actual.opciones.push(limpio(b.texto.replace(/^[☐□▢◻]\s*/, '')));
                return;
            }
            const sig = cuerpo[i + 1];
            const seguidaPorRespuesta = esOpcion(sig) || esCaja(sig);
            const abre = b.rol === 'contenido' && (seguidaPorRespuesta || (b.numerado && /[?¿]/.test(b.texto)));
            if (abre) {
                actual = {
                    numero: preguntas.length + 1, enunciado: b.texto, negritas: b.negritas, cursivas: b.cursivas,
                    opciones: [], cajas: 0, comentarios: b.comentarios, extra: []
                };
                preguntas.push(actual);
                return;
            }
            if (b.rol !== 'contenido') return;   // recado de montaje o de producción: no se publica
            if (!actual) instrucciones.push({ texto: b.texto, negritas: b.negritas, cursivas: b.cursivas, conservaEstilo: b.conservaEstilo });
            else {
                actual.extra.push(b.texto);
                avisos.push(`Pregunta ${actual.numero}: hay un párrafo más después del enunciado («${b.texto.slice(0, 50)}…»). No se coteja.`);
            }
        });

        preguntas.forEach(q => {
            q.tipo = q.opciones.length ? 'opciones' : (q.cajas ? 'abierta' : 'sinRespuesta');
            if (q.tipo === 'sinRespuesta') avisos.push(`Pregunta ${q.numero}: no trae ni opciones «☐» ni recuadro de respuesta; no se sabe de qué tipo es.`);
            if (q.tipo === 'opciones' && q.opciones.every(o => !o)) {
                avisos.push(`Pregunta ${q.numero}: las ${q.opciones.length} opciones del guion están sin texto (solo «☐»). `
                    + 'No hay con qué cotejarlas: solo se puede comprobar cuántas son.');
            } else if (q.tipo === 'opciones' && q.opciones.some(o => !o)) {
                avisos.push(`Pregunta ${q.numero}: alguna de sus opciones está sin texto.`);
            }
        });

        // --- Lo que el guion PIDE contra lo que el propio guion trae
        const pedido = pedidoDeMontaje(leerIndicacionesDeMontaje(tablas));
        const abiertas = preguntas.filter(q => q.tipo === 'abierta').length;
        const cerradas = preguntas.filter(q => q.tipo === 'opciones').length;
        if (pedido.abiertas != null && pedido.abiertas !== abiertas) {
            avisos.push(`Las indicaciones de montaje piden ${pedido.abiertas} preguntas abiertas y el guion trae ${abiertas}.`);
        }
        if (pedido.opcionMultiple != null && pedido.opcionMultiple !== cerradas) {
            avisos.push(`Las indicaciones de montaje piden ${pedido.opcionMultiple} de opción múltiple y el guion trae ${cerradas}.`);
        }
        if (intro.some(i => i.plantillaFecha) && !fechas) {
            avisos.push('El guion tiene una fecha entre corchetes pero no se pudo leer el día y la hora de apertura y cierre.');
        }

        const comentarios = comentariosDocx.map(c => ({ id: c.id, autor: c.autor, texto: c.texto, ancla: c.ancla }));

        return {
            titulo, tipoRecurso, banner, intro, instrucciones, preguntas: preguntas.map(q => {
                const { extra, ...limpia } = q;   // `extra` solo sirve para avisar
                return limpia;
            }),
            marcas, botones, fechas, pedido, comentarios, avisos,
            pantallas: pantallas.length
        };
    }

    global.leerGuionDeCuestionario = leerGuionDeCuestionario;
}(window));
