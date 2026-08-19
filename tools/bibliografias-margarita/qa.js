/* ==========================================================================
   QA de bibliografías (Moodle 5.1) — el motor de la revisión.

   Coteja el Word de fuentes contra el HTML de la página YA MONTADA en Moodle y
   devuelve datos; no dibuja nada. Quien pinta el informe es `script.js`, y así
   esta parte se puede probar sola desde la consola:

       QaBibliografia.revisar({ fuentes: [...], html: '<div…>' })

   Qué se revisa, y por qué justo eso:

   · **Que diga lo mismo.** Cada fuente del Word tiene que estar montada, con su
     texto exacto. Un acento perdido o una palabra cambiada es un error; una
     coma o un espacio de más, un aviso (el editor de Moodle endereza comillas y
     junta espacios al pegar, y eso no es falta de nadie).
   · **Que los enlaces abran en pestaña nueva** (`target="_blank"`). Sin él,
     Moodle se lleva al estudiante fuera del curso.
   · **Que los de YouTube estén protegidos** (`span.nolink`, o el
     `nomediaplugin` de las páginas viejas). Sin la marca, Moodle cambia el
     enlace por un reproductor incrustado a media lista.
   · **Que la sangría francesa coincida con el Word.** Es la clase `fuente`
     (`text-indent:-25px; padding-left:25px`). Si el Word la trae, la página
     también; si no la trae, la página tampoco.

   Los dos formatos de guion caben aquí sin decir cuál es cuál: el que solo
   manda las fuentes y el que las manda detrás de una hoja de control (módulo,
   elaboradores, indicaciones). Esa hoja vive en TABLAS y el lector de Word ya
   no entrega su texto como párrafo, así que se cae sola. Lo demás que sobra
   —el título "Bibliografía" y las marcas de producción tipo `<h1>`— se quita
   por nombre en `fuentesDeBloques()`.
   ========================================================================== */

window.QaBibliografia = (function () {
    'use strict';

    /* Encabezados que el Word trae al inicio y NO son una fuente. Misma lista
       que usa el modo "Desde Word" de script.js. */
    const RE_TITULO = /^(bibliograf[ií]a|referencias?|fuentes?( de consulta)?|para saber m[áa]s)\.?$/i;

    /* Marcas de producción del guion: `<h1>`, `<p>`, `<Figura>`… El guion las
       usa para decirle al montador qué etiqueta poner. Nunca son una fuente, y
       si llegan a Moodle salen impresas en la página. */
    const RE_MARCA = /^<[^<>]{1,60}>$/;

    const RE_URL = /https?:\/\/[^\s<>"']+/gi;
    const RE_YOUTUBE = /youtube\.com|youtu\.be/i;

    /* ------------------------------------------------------------- Texto */

    function limpiar(s) {
        return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    }

    /* Comillas curvas, guiones largos y puntos suspensivos: el editor de Moodle
       los endereza al pegar. Comparar sin plancharlos primero llenaba el informe
       de "errores" que nadie tecleó. */
    function planchar(s) {
        return limpiar(s)
            .replace(/[‘’‛′]/g, "'")
            .replace(/[“”‟″]/g, '"')
            .replace(/[–—−]/g, '-')
            .replace(/…/g, '...');
    }

    /* Las cursivas del Word viajan como *texto* (ver assets/docx.js). Aquí no se
       cotejan: se quitan para que la marca no cuente como carácter distinto. */
    function sinMarcasDeFormato(s) {
        return String(s == null ? '' : s).replace(/\*{1,3}([\s\S]+?)\*{1,3}/g, '$1');
    }

    const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

    /* Clave de emparejado: sin acentos, sin puntuación y en minúsculas. Solo
       sirve para saber QUÉ fuente es cuál. Las diferencias reales —incluido un
       acento perdido— se reportan después comparando los textos de verdad. */
    function clave(s) {
        return sinAcentos(planchar(sinMarcasDeFormato(s)).toLowerCase())
            .replace(/[^a-z0-9]+/g, ' ').trim();
    }

    /* Firma blanda: conserva las letras con su acento y tira la puntuación y los
       espacios. Si dos textos comparten firma, lo único que cambió fue la
       puntuación: eso es un aviso, no un error. */
    function firmaBlanda(s) {
        return planchar(sinMarcasDeFormato(s)).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    }

    /** Parecido por palabras compartidas (0 a 1). Empareja "casi la misma
        fuente" cuando cambió una palabra y la clave exacta ya no coincide. */
    function similitud(a, b) {
        const pa = clave(a).split(' ').filter(Boolean);
        const pb = clave(b).split(' ').filter(Boolean);
        if (!pa.length || !pb.length) return 0;
        const usados = {};
        let iguales = 0;
        pa.forEach(x => {
            const j = pb.findIndex((y, i) => !usados[i] && y === x);
            if (j >= 0) { usados[j] = true; iguales++; }
        });
        return (2 * iguales) / (pa.length + pb.length);
    }

    /** Las URL de un texto, sin la puntuación con la que termina la ficha. */
    function urlsDe(texto) {
        const encontradas = String(texto || '').match(RE_URL) || [];
        return encontradas.map(u => u.replace(/[.,;:)\]]+$/, ''));
    }

    /* Para comparar la URL del Word con el href del montaje: el protocolo, la
       diagonal final y las mayúsculas del dominio no cambian a dónde lleva. */
    function urlNormal(u) {
        return String(u || '').trim().toLowerCase()
            .replace(/^https?:\/\//, '').replace(/\/+$/, '');
    }

    /* ------------------------------------------------- El Word: las fuentes */

    /**
     * De los bloques de `leerBloquesDeDocx` a la lista de fuentes.
     *
     * Sirve para los dos formatos de guion. Se queda solo con los párrafos de
     * primer nivel: lo que vive en una celda es la hoja de control (módulo,
     * elaboradores, indicaciones para producción) y no se monta.
     *
     * Devuelve además lo que se descartó, para poder decirlo en el resumen: un
     * conteo que no cuadra con el Word se explica casi siempre aquí.
     */
    function fuentesDeBloques(bloques) {
        const fuentes = [];
        const descartados = [];
        (bloques || []).forEach(b => {
            if (b.tipo !== 'parrafo' || b.dentroDeTabla) return;
            const texto = limpiar(b.texto);
            if (!texto) return;
            const pelado = limpiar(sinMarcasDeFormato(texto));
            if (RE_MARCA.test(pelado)) { descartados.push(pelado); return; }
            if (RE_TITULO.test(pelado) && !urlsDe(pelado).length) { descartados.push(pelado); return; }
            fuentes.push({
                texto,
                // Campo nuevo de assets/docx.js: `w:hanging` (o un `w:firstLine`
                // negativo), heredado del estilo cuando el párrafo no lo trae.
                sangriaFrancesa: Boolean(b.sangriaFrancesa)
            });
        });
        return { fuentes, descartados };
    }

    /**
     * El número de hipervínculos que declara la hoja de control del guion largo
     * ("Interactividad del recurso" → Hipervínculos | Audios | Videos…).
     * Es un dato que escribe producción a mano: cotejarlo contra los enlaces
     * montados caza una fuente perdida aunque el Word y Moodle coincidan entre
     * sí. Devuelve null cuando el guion no trae esa tabla.
     */
    function hipervinculosDeclarados(bloques) {
        let valor = null;
        (bloques || []).forEach(b => {
            if (b.tipo !== 'tabla' || !b.filas) return;
            b.filas.forEach((fila, i) => {
                const celdas = fila.map(c => limpiar(sinAcentos(String(c && c.texto || c || ''))).toLowerCase());
                const col = celdas.findIndex(c => /^hipervinculos?$/.test(c));
                if (col < 0) return;
                const siguiente = b.filas[i + 1];
                if (!siguiente || !siguiente[col]) return;
                const crudo = limpiar(String(siguiente[col].texto || siguiente[col] || ''));
                if (/^\d+$/.test(crudo)) valor = Number(crudo);
            });
        });
        return valor;
    }

    /* --------------------------------------------- Moodle: lo ya montado */

    /** ¿Este párrafo lleva sangría francesa? */
    function conSangria(nodo) {
        if (nodo.classList && nodo.classList.contains('fuente')) return true;
        // Algunos montajes viejos la escriben a mano en el atributo style.
        const estilo = (nodo.getAttribute && nodo.getAttribute('style')) || '';
        return /text-indent\s*:\s*-/.test(estilo);
    }

    /** Los párrafos de la página montada, en orden. */
    function parrafosDeHtml(doc) {
        const nodos = [...doc.body.querySelectorAll('p, li')]
            // Un <li> con <p> adentro se contaría dos veces.
            .filter(n => !n.querySelector('p, li'));
        return nodos.map((n, i) => ({
            indice: i,
            nodo: n,
            texto: limpiar(n.textContent),
            html: n.innerHTML,
            sangria: conSangria(n),
            enlaces: [...n.querySelectorAll('a[href]')]
        }));
    }

    /* ------------------------------------------------------- Emparejado */

    /**
     * Empareja las fuentes del Word con los párrafos de Moodle.
     *
     * Dos pasadas, y el orden importa: primero por clave exacta —así una fuente
     * repetida en el Word se casa con su repetición y no con la primera que
     * pase—, y solo con lo que sobró se busca por parecido. Al revés, un cambio
     * de una palabra se habría llevado la pareja de otra fuente.
     */
    function emparejar(fuentes, parrafos) {
        const parejas = [];
        const librePorClave = new Map();
        parrafos.forEach(p => {
            const k = clave(p.texto);
            if (!librePorClave.has(k)) librePorClave.set(k, []);
            librePorClave.get(k).push(p);
        });
        const usados = new Set();

        fuentes.forEach((f, i) => {
            const cola = librePorClave.get(clave(f.texto));
            const p = cola && cola.shift();
            if (p) { usados.add(p.indice); parejas.push({ i, fuente: f, parrafo: p, exacta: true }); }
            else parejas.push({ i, fuente: f, parrafo: null, exacta: false });
        });

        const sueltos = parrafos.filter(p => !usados.has(p.indice));
        parejas.filter(x => !x.parrafo).forEach(x => {
            let mejor = null;
            let mejorPunto = 0;
            sueltos.forEach(p => {
                if (usados.has(p.indice)) return;
                const punto = similitud(x.fuente.texto, p.texto);
                if (punto > mejorPunto) { mejorPunto = punto; mejor = p; }
            });
            // .72 salió de probar contra fuentes reales: por debajo empezaba a
            // casar fichas distintas del mismo autor ("Real Academia Española.
            // (s.f.-a)…" con "…(s.f.-b)…"), que es peor que declararlas perdidas.
            if (mejor && mejorPunto >= 0.72) {
                usados.add(mejor.indice);
                x.parrafo = mejor;
                x.parecido = mejorPunto;
            }
        });

        return { parejas, sobrantes: parrafos.filter(p => !usados.has(p.indice)) };
    }

    /* ------------------------------------------------------- El informe */

    function nuevoInforme() {
        return { hallazgos: [], resumen: {} };
    }

    /* `suelto` marca el hallazgo que vale por sí mismo —el orden, los párrafos
       vacíos, el conteo de la hoja de control— frente a los que solo existen si
       reunieron casos. Sin esa distinción, al limpiar los vacíos se iban también
       los que sí tenían algo que decir. */
    /* `etiquetas` nombra las dos columnas del caso. Por omisión es Word contra
       Moodle, que es lo que se coteja casi siempre; pero en un enlace sin
       `target` no hay nada del Word que enseñar —lo que falta es una regla del
       montaje— y "Word: target=_blank" no se entendía. */
    function anotar(informe, nivel, grupo, titulo, nota, suelto) {
        const h = {
            nivel, grupo, titulo, nota: nota || '', items: [],
            suelto: Boolean(suelto), uno: false,
            etiquetas: ['Word', 'Moodle'], sinLadoActual: false
        };
        informe.hallazgos.push(h);
        return h;
    }

    /**
     * ¿Este párrafo montado parece una ficha bibliográfica?
     *
     * Sirve para lo que está en Moodle y no en el Word. Un subtítulo colado
     * ("Bibliografía Submódulo 01") no es lo mismo que una fuente inventada:
     * el primero se quita, la segunda hay que buscarla en otro guion. Una ficha
     * trae año entre paréntesis o una URL.
     */
    function pareceFuente(texto) {
        return /\(\s*(s\.\s*f\.?|\d{4})/i.test(texto) || urlsDe(texto).length > 0;
    }

    function revisar(datos) {
        const informe = nuevoInforme();
        const fuentes = (datos && datos.fuentes) || [];
        const html = (datos && datos.html) || '';
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const parrafos = parrafosDeHtml(doc);
        const conTexto = parrafos.filter(p => p.texto);

        /* ---------- Estructura: solo se informa, no se juzga ----------
           A veces se pega la página entera y a veces solo el bloque de fuentes.
           Decir "falta el envoltorio" en el segundo caso sería mentir. */
        const contenedor = doc.querySelector('.mainPlantilla23');
        const paleta = contenedor
            ? [...contenedor.classList].find(c => /^(M\d{2}|MM|reg)$/.test(c)) || ''
            : '';
        const h1 = doc.querySelector('.tituloUnidad h1, h1');
        informe.resumen.estructura = {
            envoltorio: Boolean(contenedor),
            paleta,
            titulo: h1 ? limpiar(h1.textContent) : '',
            columnas: Boolean(doc.querySelector('.text-multicol')),
            lineaEntreColumnas: Boolean(doc.querySelector('.text-multicol-rule'))
        };

        /* ---------------------- Las fuentes ---------------------- */
        const { parejas, sobrantes } = emparejar(fuentes, conTexto);

        const faltantes = anotar(informe, 'error', 'Fuentes', 'No se montaron',
            'Están en el Word y no aparecen en la página.');
        const distintas = anotar(informe, 'error', 'Fuentes', 'El texto no coincide',
            'Cambian palabras, letras o acentos respecto del Word.');
        const puntuacion = anotar(informe, 'aviso', 'Fuentes', 'Cambia solo la puntuación',
            'Mismas palabras; cambian comas, paréntesis o espacios. Revisa si fue una corrección de estilo.');
        const invasoras = anotar(informe, 'error', 'Fuentes', 'Están en Moodle y no en el Word',
            'Nadie las mandó en este guion: sobran, o vienen de otro documento.');
        const coladas = anotar(informe, 'aviso', 'Fuentes', 'No parecen una fuente',
            'Texto montado dentro de la lista que no tiene año ni URL: casi siempre un subtítulo o una nota que se coló.');
        const repetidas = anotar(informe, 'aviso', 'Fuentes', 'Repetidas en la página',
            'La misma ficha aparece más de una vez en Moodle.');

        let iguales = 0;
        parejas.forEach(x => {
            if (!x.parrafo) {
                // Sin las marcas de cursiva: en el informe se compara contra lo
                // que se ve en Moodle, y ahí `*` no existe.
                faltantes.items.push({ esperado: planchar(sinMarcasDeFormato(x.fuente.texto)), actual: '' });
                return;
            }
            const esperado = planchar(sinMarcasDeFormato(x.fuente.texto));
            const actual = planchar(x.parrafo.texto);
            if (esperado === actual) { iguales++; return; }
            if (firmaBlanda(esperado) === firmaBlanda(actual)) {
                puntuacion.items.push({ esperado, actual });
                return;
            }
            distintas.items.push({ esperado, actual });
        });

        sobrantes.forEach(p => {
            (pareceFuente(p.texto) ? invasoras : coladas).items.push({ esperado: '', actual: p.texto });
        });

        // Repetidas: se cuentan sobre lo montado, contra lo que trae el Word.
        const vecesWord = new Map();
        fuentes.forEach(f => vecesWord.set(clave(f.texto), (vecesWord.get(clave(f.texto)) || 0) + 1));
        const vecesMoodle = new Map();
        conTexto.forEach(p => {
            const k = clave(p.texto);
            if (!vecesMoodle.has(k)) vecesMoodle.set(k, { veces: 0, texto: p.texto });
            vecesMoodle.get(k).veces++;
        });
        vecesMoodle.forEach((dato, k) => {
            if (dato.veces > 1 && dato.veces > (vecesWord.get(k) || 0)) {
                repetidas.items.push({
                    esperado: (vecesWord.get(k) || 0) + ' vez/veces en el Word',
                    actual: dato.veces + ' veces en Moodle · ' + dato.texto
                });
            }
        });

        /* Orden: se compara contra el ORDEN DEL WORD, no contra el alfabeto. La
           bibliografía se manda ya ordenada; si en la página va en otro orden,
           lo que hubo fue un pegado a mano fuera de sitio. */
        const posiciones = parejas.filter(x => x.parrafo).map(x => x.parrafo.indice);
        let fueraDeOrden = 0;
        for (let i = 1; i < posiciones.length; i++) {
            if (posiciones[i] < posiciones[i - 1]) fueraDeOrden++;
        }
        if (fueraDeOrden) {
            anotar(informe, 'aviso', 'Fuentes', 'El orden no es el del Word',
                fueraDeOrden + ' fuente(s) aparecen en la página en distinto lugar que en el documento.', true);
        }

        /* ---------------------- Los enlaces ---------------------- */
        const anclas = [...doc.body.querySelectorAll('a[href]')];
        const sinPestana = anotar(informe, 'error', 'Enlaces', 'No abren en pestaña nueva',
            'Les falta target="_blank": el enlace se lleva al estudiante fuera del curso.');
        const sinProteger = anotar(informe, 'error', 'Enlaces', 'YouTube sin proteger',
            'Sin <span class="nolink"> dentro del enlace, Moodle lo cambia por un reproductor incrustado.');
        const textoDistinto = anotar(informe, 'error', 'Enlaces', 'El texto no coincide con su destino',
            'Lo que se lee en la página y a dónde lleva el enlace no son la misma dirección.');
        const noEnlazadas = anotar(informe, 'error', 'Enlaces', 'La URL quedó como texto plano',
            'Está escrita en la fuente montada, pero no es un enlace.');
        const sinNoopener = anotar(informe, 'aviso', 'Enlaces', 'Sin rel="noopener"',
            'El montaje del área lo lleva en todos los enlaces. No rompe nada, pero queda distinto.');
        const urlRota = anotar(informe, 'aviso', 'Enlaces', 'La dirección viene partida en el Word',
            'Trae un espacio en medio: el enlace montado no llevará a ningún lado. Se corrige en el Word.');

        sinPestana.etiquetas = ['Debe llevar', 'El enlace'];
        sinNoopener.etiquetas = ['Debe llevar', 'El enlace'];
        sinProteger.etiquetas = ['Debe ser', 'En la página'];
        textoDistinto.etiquetas = ['Dice', 'Lleva a'];
        noEnlazadas.etiquetas = ['La URL', 'En la fuente montada'];
        urlRota.etiquetas = ['En el Word', ''];
        urlRota.sinLadoActual = true;

        let youtube = 0;
        anclas.forEach(a => {
            const href = a.getAttribute('href') || '';
            const visible = limpiar(a.textContent);
            if ((a.getAttribute('target') || '') !== '_blank') {
                sinPestana.items.push({ esperado: 'target="_blank"', actual: visible || href });
            }
            if (RE_YOUTUBE.test(href)) {
                youtube++;
                const protegido = a.querySelector('.nolink, .nomediaplugin')
                    || (a.classList.contains('nomediaplugin'));
                if (!protegido) {
                    sinProteger.items.push({ esperado: '<span class="nolink">' + href + '</span>', actual: visible || href });
                }
            }
            if (!(a.getAttribute('rel') || '').includes('noopener')) {
                sinNoopener.items.push({ esperado: 'rel="noopener"', actual: visible || href });
            }
            // Solo cuando el texto visible ES una dirección: en las fichas se
            // escribe la URL completa, pero un enlace sobre una palabra es
            // legítimo y no hay nada que comparar.
            if (/^(https?:\/\/|www\.)\S+$/i.test(visible) && urlNormal(visible) !== urlNormal(href)) {
                textoDistinto.items.push({ esperado: visible, actual: href });
            }
        });

        /* Las URL que el Word trae y que en la página no quedaron enlazadas. Se
           mira dentro de la fuente que le toca, no en toda la página: una misma
           dirección puede repetirse en dos fichas. */
        parejas.forEach(x => {
            if (!x.parrafo) return;
            const hrefs = x.parrafo.enlaces.map(a => urlNormal(a.getAttribute('href')));
            urlsDe(x.fuente.texto).forEach(u => {
                if (!hrefs.includes(urlNormal(u))) {
                    noEnlazadas.items.push({ esperado: u, actual: x.parrafo.texto });
                }
            });
        });

        fuentes.forEach(f => {
            if (/https?:\/\/\s+\S/.test(f.texto)) {
                urlRota.items.push({ esperado: planchar(sinMarcasDeFormato(f.texto)), actual: '' });
            }
        });

        /* ------------------- La sangría francesa -------------------
           El criterio lo manda el Word. Cuando el propio Word viene mezclado
           —pasa: 108 fuentes con sangría y 32 sin ella en un guion real— no se
           reportan 32 errores del montaje: se avisa que el Word no es
           consistente y se coteja contra su mayoría, que es lo que el montador
           iba a hacer de todas formas. */
        const conSangriaWord = fuentes.filter(f => f.sangriaFrancesa).length;
        const mayoria = conSangriaWord * 2 >= fuentes.length;
        const mezclado = conSangriaWord > 0 && conSangriaWord < fuentes.length;
        informe.resumen.sangria = {
            word: fuentes.length ? (mezclado ? 'mezclada' : (mayoria ? 'sí' : 'no')) : '',
            wordCon: conSangriaWord,
            wordTotal: fuentes.length,
            moodleCon: conTexto.filter(p => p.sangria).length,
            moodleTotal: conTexto.length,
            criterio: mayoria
        };
        if (mezclado) {
            const desviadas = anotar(informe, 'aviso', 'Sangría', 'El Word no es consistente',
                conSangriaWord + ' de ' + fuentes.length + ' fuentes traen sangría francesa. Se coteja '
                + 'contra la mayoría (' + (mayoria ? 'con' : 'sin') + ' sangría); conviene emparejarlo en el Word.');
            /* Cuenta como UN aviso aunque liste 30 fuentes: es un problema del
               Word, no 30 fallas del montaje. Sin esto, el veredicto de una
               página impecable decía "31 avisos". */
            desviadas.uno = true;
            desviadas.etiquetas = ['Criterio', 'En el Word'];
            fuentes.filter(f => f.sangriaFrancesa !== mayoria).slice(0, 40).forEach(f => {
                desviadas.items.push({
                    esperado: (mayoria ? 'con' : 'sin') + ' sangría francesa',
                    actual: (f.sangriaFrancesa ? 'con' : 'sin') + ' sangría · '
                        + planchar(sinMarcasDeFormato(f.texto))
                });
            });
        }

        const sangriaMal = anotar(informe, 'error', 'Sangría',
            mayoria ? 'Falta la sangría francesa' : 'Sobra la sangría francesa',
            mayoria
                ? 'El Word la trae y el párrafo montado no lleva class="fuente".'
                : 'El Word no la trae y el párrafo montado sí lleva class="fuente".');
        sangriaMal.etiquetas = ['Debe ser', 'El párrafo'];
        parejas.forEach(x => {
            if (!x.parrafo) return;
            if (x.parrafo.sangria !== mayoria) {
                sangriaMal.items.push({
                    esperado: mayoria ? '<p class="fuente">' : '<p>',
                    actual: x.parrafo.texto
                });
            }
        });

        /* --------------------- Marcas y vacíos --------------------- */
        const marcas = anotar(informe, 'error', 'Montaje', 'Marcas del guion publicadas',
            'Texto de producción que no debía llegar a la página.');
        marcas.etiquetas = ['', 'En la página'];
        conTexto.forEach(p => {
            if (RE_MARCA.test(p.texto)) marcas.items.push({ esperado: '', actual: p.texto });
        });
        const vacios = parrafos.length - conTexto.length;
        if (vacios) {
            anotar(informe, 'aviso', 'Montaje', 'Párrafos vacíos',
                vacios + ' párrafo(s) sin texto en la página. Suelen ser saltos del editor.', true);
        }

        /* ------------------ El conteo de producción ------------------ */
        const declarados = datos && datos.hipervinculos;
        if (typeof declarados === 'number') {
            const enWord = fuentes.reduce((n, f) => n + urlsDe(f.texto).length, 0);
            if (declarados !== anclas.length || declarados !== enWord) {
                anotar(informe, 'aviso', 'Enlaces', 'No cuadra con la hoja de control',
                    'El guion declara ' + declarados + ' hipervínculo(s); el Word trae ' + enWord
                    + ' y en la página hay ' + anclas.length + '.', true);
            }
        }

        /* ------------------------- El resumen ------------------------- */
        informe.resumen.fuentesWord = fuentes.length;
        informe.resumen.fuentesMoodle = conTexto.length;
        informe.resumen.iguales = iguales;
        informe.resumen.enlaces = anclas.length;
        informe.resumen.youtube = youtube;
        informe.resumen.urlsWord = fuentes.reduce((n, f) => n + urlsDe(f.texto).length, 0);

        // Un hallazgo sin casos no es un hallazgo.
        informe.hallazgos = informe.hallazgos.filter(h => h.items.length || h.suelto);

        // Se cuentan CASOS, no bloques: cada uno es una corrección distinta en
        // Moodle. Salvo los marcados `uno`, que son un solo problema con varios
        // ejemplos.
        const cuenta = (nivel) => informe.hallazgos
            .filter(h => h.nivel === nivel)
            .reduce((n, h) => n + (h.uno ? 1 : Math.max(1, h.items.length)), 0);
        informe.errores = cuenta('error');
        informe.avisos = cuenta('aviso');
        return informe;
    }

    return {
        revisar,
        fuentesDeBloques,
        hipervinculosDeclarados,
        // Se exponen para poder probarlas desde la consola.
        _internas: { clave, firmaBlanda, similitud, urlsDe, planchar }
    };
})();
