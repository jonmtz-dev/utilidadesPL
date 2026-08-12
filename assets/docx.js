/* ==========================================================================
   Lector de .docx compartido entre herramientas.

   Vive en assets/ y no dentro de una herramienta porque ya lo necesitan dos
   (Adaptador de Rúbricas lee tablas, Generador de Bibliografías lee párrafos),
   y duplicarlo es exactamente cómo se nos quedó vivo el hex #d8a7b6 en el
   Convertidor de Tablas: se arregla en una copia y la otra se queda atrás.

   Lo original: solo lo necesario para sacar las TABLAS de una rúbrica.

   Un .docx es un ZIP; adentro, `word/document.xml` trae el contenido. No hace
   falta ninguna librería: el navegador ya sabe inflar (DecompressionStream) y
   parsear XML (DOMParser). Fiel al proyecto: sin build, sin dependencias.

   ⚠️ Construido leyendo un .docx REAL de rúbrica (M17_S3_AI6), no a ciegas.
   Lo que se encontró ahí y define el diseño:
     · La tabla es de 7 columnas: criterio + 6 niveles.
     · Cada criterio ocupa DOS filas: la de arriba tiene los textos y la de
       abajo SOLO los puntos ("40 puntos"). Se relacionan por `w:vMerge` en la
       celda del criterio (`restart` arriba, `continue` abajo).
     · Al final hay una fila "Total" que NO es un criterio.
   ========================================================================== */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// No todos los DOM resuelven igual el selector con namespaces usado por
// `closest('*|tbl')`. Recorrer los padres separa de forma estable las tablas
// reales de las tablas anidadas.
function tablaAncestro(nodo) {
    let actual = nodo && nodo.parentNode;
    while (actual) {
        if (actual.localName === 'tbl') return actual;
        actual = actual.parentNode;
    }
    return null;
}

/** Lee el directorio central del ZIP y devuelve Map<nombre, Uint8Array>. */
async function leerZip(buffer) {
    const datos = new Uint8Array(buffer);
    const dv = new DataView(buffer);

    // El End Of Central Directory está al final; se busca su firma hacia atrás.
    let eocd = -1;
    for (let i = datos.length - 22; i >= 0 && i > datos.length - 65558; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('No parece un archivo .docx válido (no se encontró el índice del ZIP).');

    const totalEntradas = dv.getUint16(eocd + 10, true);
    let puntero = dv.getUint32(eocd + 16, true);
    const archivos = new Map();

    for (let i = 0; i < totalEntradas; i++) {
        if (dv.getUint32(puntero, true) !== 0x02014b50) break;
        const metodo = dv.getUint16(puntero + 10, true);
        const tamComprimido = dv.getUint32(puntero + 20, true);
        const largoNombre = dv.getUint16(puntero + 28, true);
        const largoExtra = dv.getUint16(puntero + 30, true);
        const largoComentario = dv.getUint16(puntero + 32, true);
        const offsetLocal = dv.getUint32(puntero + 42, true);
        const nombre = new TextDecoder().decode(datos.subarray(puntero + 46, puntero + 46 + largoNombre));

        // La cabecera local repite el nombre y el extra, con longitudes propias.
        const nombreLocal = dv.getUint16(offsetLocal + 26, true);
        const extraLocal = dv.getUint16(offsetLocal + 28, true);
        const inicioDatos = offsetLocal + 30 + nombreLocal + extraLocal;
        archivos.set(nombre, { metodo, bytes: datos.subarray(inicioDatos, inicioDatos + tamComprimido) });

        puntero += 46 + largoNombre + largoExtra + largoComentario;
    }
    return archivos;
}

async function inflar(entrada) {
    if (entrada.metodo === 0) return entrada.bytes;          // guardado sin comprimir
    if (entrada.metodo !== 8) throw new Error('Compresión del .docx no soportada (método ' + entrada.metodo + ').');
    const stream = new Blob([entrada.bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Texto de una celda, conservando el salto de línea entre párrafos (las
 * definiciones de nivel son listas de viñetas y esos saltos importan).
 *
 * Con `opciones.formatosLista` (el mapa de leerFormatosListaDocx) además
 * **reescribe la viñeta como texto**: Word no guarda el "•" ni el "1." en el
 * párrafo, los pinta a partir de numbering.xml, así que al leer solo los `w:t`
 * la lista se convertía en un montón de renglones sueltos. En el editor de
 * rúbricas de Moodle la definición es un campo de texto plano: si la viñeta no
 * va escrita, no existe.
 *
 * Es opcional a propósito: quien genera HTML (Guion Instruccional a Página)
 * quiere la lista como estructura, no un "• " literal dentro del párrafo.
 */
function textoDeCelda(tc, opciones) {
    const formatos = opciones && opciones.formatosLista;
    const tabla = tablaAncestro(tc);
    const parrafos = [...tc.getElementsByTagNameNS(W_NS, 'p')]
        .filter(p => tablaAncestro(p) === tabla);

    // Un contador por lista y nivel, para que una numerada diga 1., 2., 3.
    const contadores = new Map();

    return parrafos
        .map(p => {
            const texto = [...p.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent || '').join('');
            if (!formatos || !texto.trim()) return texto;

            const numPr = p.getElementsByTagNameNS(W_NS, 'numPr')[0];
            if (!numPr) {
                // Un párrafo normal corta la numeración: lo que siga vuelve a 1.
                contadores.clear();
                return texto;
            }

            const nodoNum = numPr.getElementsByTagNameNS(W_NS, 'numId')[0];
            const numId = nodoNum && nodoNum.getAttributeNS(W_NS, 'val');
            const ilvl = numPr.getElementsByTagNameNS(W_NS, 'ilvl')[0];
            const nivel = Number(ilvl && ilvl.getAttributeNS(W_NS, 'val')) || 0;
            const formato = formatos[`${numId}:${nivel}`] || { tipo: 'vinetas', nivelVisual: nivel };

            const clave = `${numId}:${nivel}`;
            const n = (contadores.get(clave) || 0) + 1;
            contadores.set(clave, n);

            const marca = formato.tipo === 'vinetas' ? '• '
                : (formato.tipo === 'letras' ? `${String.fromCharCode(96 + n)}. ` : `${n}. `);
            const sangria = '  '.repeat(Math.max(0, formato.nivelVisual || 0));
            return sangria + marca + texto;
        })
        .join('\n')
        .trim();
}

/** Abre el .docx y devuelve su document.xml ya parseado. */
async function abrirDocumentoDocx(file) {
    const archivos = await leerZip(await file.arrayBuffer());
    const entrada = archivos.get('word/document.xml');
    if (!entrada) throw new Error('El archivo no contiene word/document.xml (¿es realmente un .docx?).');

    const xml = new TextDecoder('utf-8').decode(await inflar(entrada));
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('No se pudo leer el XML interno del .docx.');
    return doc;
}

/**
 * Párrafos sueltos del documento (los que NO están dentro de una tabla).
 * Es lo que necesita una bibliografía: cada entrada es un párrafo.
 *
 * ⚠️ Word mete espacios duros (U+00A0) por todos lados —medidos 50 en un
 * archivo real de bibliografía, varios pegados a las URLs
 * ("línea], https://… (consultado")—. Se normalizan a espacio normal
 * y se colapsan: si no, el HTML de salida quedaría con nbsp literales donde
 * Moodle tiene espacios normales, y cualquier comparación posterior fallaría
 * por una diferencia invisible.
 */
async function leerParrafosDeDocx(file) {
    const doc = await abrirDocumentoDocx(file);
    const body = doc.getElementsByTagNameNS(W_NS, 'body')[0] || doc.documentElement;

    return [...body.getElementsByTagNameNS(W_NS, 'p')]
        .filter(p => !tablaAncestro(p))   // fuera lo que va en tablas
        .map(p => [...p.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent || '').join(''))
        .map(t => t.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean);
}

/**
 * Comentarios de revisión del Word (word/comments.xml). En las actividades se
 * usan como indicaciones de montaje ("Vincular el PDF descargable ...") ancladas
 * a una palabra del texto ("rúbrica"): NO es un enlace real, es una nota. No es
 * contenido publicable, pero el montaje no debe olvidarlo. Se entrega el texto
 * de la nota junto con la palabra que señala.
 *   [{ autor, texto, ancla }]
 */
async function leerComentariosDeDocx(file) {
    const archivos = await leerZip(await file.arrayBuffer());
    const entradaComentarios = archivos.get('word/comments.xml');
    if (!entradaComentarios) return [];
    const parsear = async (entrada) => new DOMParser().parseFromString(
        new TextDecoder('utf-8').decode(await inflar(entrada)), 'application/xml');

    const docComentarios = await parsear(entradaComentarios);
    const porId = new Map();
    for (const c of [...docComentarios.getElementsByTagNameNS(W_NS, 'comment')]) {
        const texto = [...c.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent || '')
            .join('').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
        porId.set(c.getAttributeNS(W_NS, 'id'), { autor: (c.getAttributeNS(W_NS, 'author') || '').trim(), texto });
    }

    // El texto señalado va entre <w:commentRangeStart> y <w:commentRangeEnd> con
    // el mismo id; se recorre el documento en orden acumulando el <w:t> que quede
    // dentro de cada rango abierto.
    const entradaDoc = archivos.get('word/document.xml');
    const anclas = new Map();
    if (entradaDoc) {
        const doc = await parsear(entradaDoc);
        const abiertos = new Set();
        const recorrer = (nodo) => {
            for (const n of [...nodo.childNodes]) {
                if (n.nodeType !== 1 || n.namespaceURI !== W_NS) { if (n.nodeType === 1) recorrer(n); continue; }
                if (n.localName === 'commentRangeStart') abiertos.add(n.getAttributeNS(W_NS, 'id'));
                else if (n.localName === 'commentRangeEnd') abiertos.delete(n.getAttributeNS(W_NS, 'id'));
                else if (n.localName === 't' && abiertos.size) { const t = n.textContent || ''; abiertos.forEach(id => anclas.set(id, (anclas.get(id) || '') + t)); }
                else recorrer(n);
            }
        };
        recorrer(doc.getElementsByTagNameNS(W_NS, 'body')[0] || doc.documentElement);
    }

    return [...porId.entries()]
        .filter(([, c]) => c.texto)
        .map(([id, c]) => ({ ...c, ancla: (anclas.get(id) || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim() }));
}

/**
 * Extrae las tablas del .docx como una estructura neutral:
 *   [{ filas: [{ celdas: [{ texto, vMergeInicio, vMergeSigue }] }] }]
 * La misma forma que produce el lector de HTML pegado, para que el análisis
 * de la rúbrica sea UNO SOLO y no dos caminos que puedan divergir.
 */
async function leerTablasDeDocx(file) {
    const doc = await abrirDocumentoDocx(file);
    // Las rúbricas describen los niveles con listas; sin numbering.xml la
    // viñeta se pierde, porque Word no la guarda dentro del párrafo.
    const formatosLista = await leerFormatosListaDocx(file);

    return [...doc.getElementsByTagNameNS(W_NS, 'tbl')].map(tbl => {
        // Solo las filas de ESTA tabla (no las de tablas anidadas).
        const filas = [...tbl.getElementsByTagNameNS(W_NS, 'tr')]
            .filter(tr => tablaAncestro(tr) === tbl);

        return {
            filas: filas.map(tr => ({
                celdas: [...tr.getElementsByTagNameNS(W_NS, 'tc')]
                    .filter(tc => tablaAncestro(tc) === tbl).map(tc => {
                    const tcPr = tc.getElementsByTagNameNS(W_NS, 'tcPr')[0];
                    const vMerge = tcPr && tcPr.getElementsByTagNameNS(W_NS, 'vMerge')[0];
                    const val = vMerge && (vMerge.getAttributeNS(W_NS, 'val') || 'continue');
                    return {
                        texto: textoDeCelda(tc, { formatosLista }),
                        vMergeInicio: val === 'restart',
                        vMergeSigue: val === 'continue'
                    };
                })
            }))
        };
    });
}

/**
 * Texto de un párrafo conservando las negritas como marcas `**texto**` y, si se
 * piden, las cursivas como `*texto*` (una sola estrella, como en markdown).
 * Word parte un mismo texto en varios runs (por el corrector, por ediciones);
 * aquí se fusionan los runs contiguos con el mismo formato para no generar
 * `**guárdalo** **en tu equipo**`. Los espacios de orilla quedan FUERA de las
 * marcas: un `** texto**` no se reconocería al convertirlo a <strong>.
 */
function textoDeParrafoConNegritas(p, opciones) {
    /* `saltos` conserva los saltos de línea manuales (Shift+Enter, que en el XML
       son `w:br`) como `\n`. Va apagado por omisión a propósito: quien parte
       listas por renglón —el Integrador HTML— convertiría un salto dentro de un
       elemento en dos elementos. Lo pide quien sí los necesita: en la celda de
       una ventana emergente, "Periodo: …" y "Descubrimientos:" son dos renglones
       del mismo párrafo y sin esto salían pegados en una sola frase. */
    const saltos = Boolean(opciones && opciones.saltos);
    /* Las cursivas van APAGADAS por omisión, como los saltos: quien ya usa esta
       función espera solo `**` y una marca inesperada se publicaría tal cual en
       el HTML del Integrador. Lo pide quien lo necesita —el QA 5.1, que coteja
       el formato contra lo montado en Moodle—.

       La marca es `*texto*` y NO `_texto_` a propósito: los guiones piden
       guardar el archivo como "Apellidos_Nombre_SM02S1AA1", y con guiones bajos
       ese nombre se leería como una cursiva que nadie escribió. */
    const cursivas = Boolean(opciones && opciones.cursivas);
    const segmentos = [];
    for (const r of [...p.getElementsByTagNameNS(W_NS, 'r')]) {
        const texto = saltos
            ? [...r.childNodes]
                .filter(n => n.nodeType === 1 && (n.localName === 't' || n.localName === 'br'))
                .map(n => n.localName === 'br' ? '\n' : (n.textContent || ''))
                .join('')
            : [...r.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent || '').join('');
        if (!texto) continue;
        const rPr = r.getElementsByTagNameNS(W_NS, 'rPr')[0];
        const encendido = (nodo) => {
            if (!nodo) return false;
            const val = nodo.getAttributeNS(W_NS, 'val') || 'true';
            return val !== 'false' && val !== '0' && val !== 'none';
        };
        const negrita = encendido(rPr && rPr.getElementsByTagNameNS(W_NS, 'b')[0]);
        const cursiva = cursivas && encendido(rPr && rPr.getElementsByTagNameNS(W_NS, 'i')[0]);
        const previo = segmentos[segmentos.length - 1];
        if (previo && previo.negrita === negrita && previo.cursiva === cursiva) previo.texto += texto;
        else segmentos.push({ texto, negrita, cursiva });
    }
    return segmentos.map(s => {
        if (!s.texto.trim() || (!s.negrita && !s.cursiva)) return s.texto;
        // Los espacios de orilla quedan FUERA de las marcas: un `** texto**` no
        // se reconocería al convertirlo a <strong>.
        const m = s.texto.match(/^(\s*)([\s\S]*?)(\s*)$/);
        let dentro = m[2];
        if (s.cursiva) dentro = `*${dentro}*`;
        if (s.negrita) dentro = `**${dentro}**`;
        return `${m[1]}${dentro}${m[3]}`;
    }).join('');
}

/**
 * Lee el cuerpo de un Word en el orden en que aparece. Sirve para documentos
 * de actividades: las barras grises son tablas de una celda y el texto que
 * sigue pertenece a esa sección. No intenta reproducir el diseño de Word;
 * entrega una estructura neutral para que cada herramienta decida qué hacer.
 */
async function leerBloquesDeDocx(file, opciones) {
    const doc = await abrirDocumentoDocx(file);
    const body = doc.getElementsByTagNameNS(W_NS, 'body')[0] || doc.documentElement;
    const formatosLista = await leerFormatosListaDocx(file);

    const bloqueDesdeNodo = n => {
        if (n.localName === 'p') {
            const texto = textoDeParrafoConNegritas(n, opciones)
                .replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
            const numPr = n.getElementsByTagNameNS(W_NS, 'numPr')[0];
            const ilvl = numPr && numPr.getElementsByTagNameNS(W_NS, 'ilvl')[0];
            const numId = numPr && numPr.getElementsByTagNameNS(W_NS, 'numId')[0];
            const jc = n.getElementsByTagNameNS(W_NS, 'jc')[0];
            // Sangría izquierda del Word (w:ind), en twips. Sirve para el texto de
            // cuerpo que va indentado bajo un punto de lista ("1. ..." y debajo un
            // párrafo alineado con su texto). Se entrega crudo; la herramienta decide.
            const ind = n.getElementsByTagNameNS(W_NS, 'ind')[0];
            const sangria = ind ? Math.max(0, Number(ind.getAttributeNS(W_NS, 'left') || ind.getAttributeNS(W_NS, 'start') || 0)) : 0;
            const idLista = numId && numId.getAttributeNS(W_NS, 'val');
            const nivel = Number(ilvl && ilvl.getAttributeNS(W_NS, 'val') || 0);
            // Algunos Word no incrementan `ilvl` al anidar. En su lugar crean
            // otro numId y guardan la sangría visual en numbering.xml. Usa esa
            // información como respaldo para no aplanar la jerarquía.
            const formatoLista = formatosLista[`${idLista}:${nivel}`];
            const nivelVisual = formatoLista && typeof formatoLista === 'object' ?
                Number.isFinite(formatoLista.nivelVisual) ? formatoLista.nivelVisual : nivel : nivel;
            // Las imágenes van como <a:blip r:embed="rIdN"> dentro del párrafo.
            // Se entrega el id para que la herramienta las resuelva con
            // leerImagenesDeDocx (aquí no se cargan bytes: no siempre se usan).
            const imagenes = [...n.getElementsByTagNameNS(A_NS, 'blip')]
                .map(b => b.getAttributeNS(REL_NS, 'embed')).filter(Boolean);
            return {
                tipo: 'parrafo',
                texto,
                imagenes,
                sangria,
                lista: Boolean(numPr),
                idLista,
                tipoLista: (formatoLista && typeof formatoLista === 'object' ? formatoLista.tipo : formatoLista) || 'ordenada',
                nivelLista: nivelVisual,
                alineacion: jc && jc.getAttributeNS(W_NS, 'val') === 'center' ? 'centro' :
                    (jc && jc.getAttributeNS(W_NS, 'val') === 'right' ? 'derecha' :
                        (jc && jc.getAttributeNS(W_NS, 'val') === 'both' ? 'justificado' : 'izquierda'))
            };
        }
        if (n.localName === 'tbl') {
            const filasXml = [...n.getElementsByTagNameNS(W_NS, 'tr')]
                .filter(tr => tablaAncestro(tr) === n);
            const celdas = filasXml.flatMap(tr => [...tr.getElementsByTagNameNS(W_NS, 'tc')]
                .filter(tc => tablaAncestro(tc) === n));
            const texto = celdas.map(textoDeCelda).filter(Boolean).join(' ').replace(/[ \t]+/g, ' ').trim();
            const sombreado = celdas.some(tc => {
                const shd = tc.getElementsByTagNameNS(W_NS, 'shd')[0];
                const fill = shd && (shd.getAttributeNS(W_NS, 'fill') || '').toLowerCase();
                return fill && fill !== 'auto' && fill !== 'ffffff';
            });
            // Estructura real de la tabla, para que una herramienta pueda
            // reconstruirla: texto por celda, columnas que abarca (gridSpan)
            // y color de sombreado. Las de una celda siguen siendo "barras".
            const filas = filasXml.map(tr => [...tr.getElementsByTagNameNS(W_NS, 'tc')]
                .filter(tc => tablaAncestro(tc) === n)
                .map(tc => {
                    const tcPr = tc.getElementsByTagNameNS(W_NS, 'tcPr')[0];
                    const span = tcPr && tcPr.getElementsByTagNameNS(W_NS, 'gridSpan')[0];
                    const shd = tcPr && tcPr.getElementsByTagNameNS(W_NS, 'shd')[0];
                    const fill = shd && (shd.getAttributeNS(W_NS, 'fill') || '').toLowerCase();
                    // `lineas` conserva los saltos de párrafo de la celda: en
                    // los guiones instruccionales cada marca de montaje
                    // (<Figura>, <Pop-up>, <Crear un grupo de botones…>) viene
                    // en su propio renglón, y aplastarlas las vuelve ilegibles.
                    // Quien solo quiera el texto corrido sigue usando `texto`.
                    const lineasCelda = textoDeCelda(tc).split('\n')
                        .map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
                    /* `contenido` conserva el ORDEN real de la celda: sus
                       párrafos propios y las tablas que tenga ANIDADAS,
                       intercalados como en el Word. Es lo que permite montar el
                       apartado de un acordeón con su grupo de tarjetas en su
                       lugar exacto: con solo el texto aplanado (`lineas`) esa
                       tabla anidada se perdía aquí —y reaparecía como un bloque
                       suelto al final de la página—. `lineas` y `texto` no
                       cambian: hay herramientas que solo quieren el texto. */
                    const contenido = [];
                    [...tc.childNodes].filter(x => x.nodeType === 1).forEach(hijo => {
                        if (hijo.localName === 'p') {
                            // Con los saltos de línea del párrafo (irán a <br>);
                            // solo se normalizan espacios y tabuladores.
                            const t = textoDeParrafoConNegritas(hijo, { saltos: true })
                                .replace(/[ \t]+/g, ' ').trim();
                            const imgs = [...hijo.getElementsByTagNameNS(A_NS, 'blip')]
                                .map(b => b.getAttributeNS(REL_NS, 'embed')).filter(Boolean);
                            if (t || imgs.length) contenido.push({ tipo: 'parrafo', texto: t, imagenes: imgs });
                            return;
                        }
                        if (hijo.localName === 'tbl') contenido.push({ tipo: 'tabla', bloque: bloqueDe(hijo) });
                    });
                    return {
                        lineas: lineasCelda,
                        contenido,
                        texto: textoDeCelda(tc).replace(/ /g, ' ').replace(/\s+/g, ' ').trim(),
                        span: Number((span && span.getAttributeNS(W_NS, 'val')) || 1),
                        fondo: fill && fill !== 'auto' && fill !== 'ffffff' ? '#' + fill : ''
                    };
                }));
            return { tipo: 'tabla', texto, celdas: celdas.length, sombreado, filas };
        }
        return { tipo: 'otro', texto: '' };
    };

    const salida = [];
    /* Un nodo, UN bloque. Una tabla anidada se lee dos veces —al armar las
       `filas` de la tabla que la contiene y al recorrer sus celdas—, y si cada
       lectura devolviera un objeto distinto, quien la coloque dentro de su
       apartado no podría reconocerla después en la lista plana para no montarla
       otra vez. Con el caché las dos referencias son el MISMO objeto y basta un
       `Set` para saber qué tabla ya se usó. */
    const cache = new Map();
    const bloqueDe = nodo => {
        if (!cache.has(nodo)) cache.set(nodo, bloqueDesdeNodo(nodo));
        return cache.get(nodo);
    };

    // `dentro` marca los bloques que salieron de las celdas de otra tabla. El
    // texto de esas celdas YA viene en `filas` de la tabla contenedora, así que
    // quien reconstruya la tabla debe saltárselos o duplica el contenido; quien
    // solo quiera el texto corrido puede ignorar el campo.
    const recorrer = (contenedor, dentro) => {
        [...contenedor.childNodes].filter(n => n.nodeType === 1).forEach(n => {
            if (n.localName === 'p') {
                const bloque = bloqueDesdeNodo(n);
                bloque.dentroDeTabla = Boolean(dentro);
                if (bloque.texto || (bloque.imagenes && bloque.imagenes.length)) salida.push(bloque);
                return;
            }
            // Word puede envolver una tabla en `w:sdt` (contenido estructurado)
            // u otro contenedor. Se atraviesan esos nodos, pero las tablas
            // normales no se recorren por dentro para no duplicar sus celdas.
            if (n.localName !== 'tbl') {
                recorrer(n, dentro);
                return;
            }
            const bloque = bloqueDe(n);
            bloque.dentroDeTabla = Boolean(dentro);
            if (bloque.texto || (bloque.imagenes && bloque.imagenes.length)) salida.push(bloque);

            // En algunos Word la tabla de contenido está dentro de una barra
            // de sección de una sola celda. La barra debe conservarse, pero su
            // contenido interno (párrafos y tablas) también debe salir en orden.
            const tablasInternas = [...n.getElementsByTagNameNS(W_NS, 'tbl')]
                .filter(tbl => tablaAncestro(tbl) === n);
            if (tablasInternas.length) {
                [...n.getElementsByTagNameNS(W_NS, 'tc')]
                    .filter(tc => tablaAncestro(tc) === n)
                    .forEach(tc => recorrer(tc, true));
            }
        });
    };
    recorrer(body, false);
    return salida;
}

/**
 * Extrae las imágenes del .docx: Map<rId, { nombre, blob }>.
 * Los rId son los mismos que entrega leerBloquesDeDocx en `imagenes`, así la
 * herramienta puede mostrar la imagen real (URL.createObjectURL) y ofrecerla
 * para descargar. Las tablas "pegadas como imagen" en el Word viven aquí.
 */
async function leerImagenesDeDocx(file) {
    const archivos = await leerZip(await file.arrayBuffer());
    const rels = archivos.get('word/_rels/document.xml.rels');
    if (!rels) return new Map();
    const doc = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(await inflar(rels)), 'application/xml');
    const MIMES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp' };
    const mapa = new Map();
    for (const rel of [...doc.getElementsByTagName('Relationship')]) {
        const destino = rel.getAttribute('Target') || '';
        if (!destino.includes('media/')) continue;
        // El Target es relativo a word/ ("media/image1.png"), pero por si
        // viniera absoluto se intentan las dos rutas.
        const entrada = archivos.get('word/' + destino.replace(/^\.?\//, '')) || archivos.get(destino.replace(/^\//, ''));
        if (!entrada) continue;
        const nombre = destino.split('/').pop();
        const ext = (nombre.split('.').pop() || '').toLowerCase();
        mapa.set(rel.getAttribute('Id'), {
            nombre,
            blob: new Blob([await inflar(entrada)], { type: MIMES[ext] || 'application/octet-stream' })
        });
    }
    return mapa;
}

/** Obtiene el formato real de cada numeración de Word. `numPr` solo dice que
 * hay una lista; esta relación con numbering.xml permite distinguir 1., a. y
 * viñetas sin adivinar por el texto. */
async function leerFormatosListaDocx(file) {
    const archivos = await leerZip(await file.arrayBuffer());
    const entrada = archivos.get('word/numbering.xml');
    if (!entrada) return {};
    const xml = new TextDecoder('utf-8').decode(await inflar(entrada));
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const abstractos = {};
    [...doc.getElementsByTagNameNS(W_NS, 'abstractNum')].forEach(a => {
        const id = a.getAttributeNS(W_NS, 'abstractNumId');
        [...a.getElementsByTagNameNS(W_NS, 'lvl')].forEach(l => {
            const nivel = l.getAttributeNS(W_NS, 'ilvl') || '0';
            const formato = l.getElementsByTagNameNS(W_NS, 'numFmt')[0];
            const valor = formato && formato.getAttributeNS(W_NS, 'val');
            const ind = l.getElementsByTagNameNS(W_NS, 'ind')[0];
            const izquierda = Number(ind && (ind.getAttributeNS(W_NS, 'left') || ind.getAttributeNS(W_NS, 'start')) || 0);
            const nivelNumeracion = Number(nivel) || 0;
            // 720 twips es el primer nivel de Word; cada 720 adicionales
            // representan una sangría más. Si `ilvl` sí cambia, se conserva.
            const nivelVisual = izquierda >= 720 ? Math.max(nivelNumeracion, Math.round(izquierda / 720) - 1) : nivelNumeracion;
            abstractos[`${id}:${nivel}`] = {
                tipo: valor === 'bullet' ? 'vinetas' :
                    (valor === 'lowerLetter' ? 'letras' : (valor === 'lowerRoman' ? 'romana' : 'ordenada')),
                nivelVisual
            };
        });
    });
    const salida = {};
    [...doc.getElementsByTagNameNS(W_NS, 'num')].forEach(n => {
        const id = n.getAttributeNS(W_NS, 'numId');
        const abs = n.getElementsByTagNameNS(W_NS, 'abstractNumId')[0];
        const idAbs = abs && abs.getAttributeNS(W_NS, 'val');
        Object.keys(abstractos).filter(k => k.startsWith(`${idAbs}:`)).forEach(k => {
            salida[`${id}:${k.split(':')[1]}`] = abstractos[k];
        });
    });
    return salida;
}
