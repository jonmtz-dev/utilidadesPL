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

/** Texto de una celda, conservando el salto de línea entre párrafos (las
 *  definiciones de nivel son listas de viñetas y esos saltos importan). */
function textoDeCelda(tc) {
    const parrafos = [...tc.getElementsByTagNameNS(W_NS, 'p')];
    return parrafos
        .map(p => [...p.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent || '').join(''))
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
        .filter(p => !p.closest || !p.closest('*|tbl'))   // fuera lo que va en tablas
        .map(p => [...p.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent || '').join(''))
        .map(t => t.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean);
}

/**
 * Extrae las tablas del .docx como una estructura neutral:
 *   [{ filas: [{ celdas: [{ texto, vMergeInicio, vMergeSigue }] }] }]
 * La misma forma que produce el lector de HTML pegado, para que el análisis
 * de la rúbrica sea UNO SOLO y no dos caminos que puedan divergir.
 */
async function leerTablasDeDocx(file) {
    const doc = await abrirDocumentoDocx(file);

    return [...doc.getElementsByTagNameNS(W_NS, 'tbl')].map(tbl => {
        // Solo las filas de ESTA tabla (no las de tablas anidadas).
        const filas = [...tbl.getElementsByTagNameNS(W_NS, 'tr')]
            .filter(tr => tr.closest ? tr.closest('*|tbl') === tbl : true);

        return {
            filas: filas.map(tr => ({
                celdas: [...tr.getElementsByTagNameNS(W_NS, 'tc')].map(tc => {
                    const tcPr = tc.getElementsByTagNameNS(W_NS, 'tcPr')[0];
                    const vMerge = tcPr && tcPr.getElementsByTagNameNS(W_NS, 'vMerge')[0];
                    const val = vMerge && (vMerge.getAttributeNS(W_NS, 'val') || 'continue');
                    return {
                        texto: textoDeCelda(tc),
                        vMergeInicio: val === 'restart',
                        vMergeSigue: val === 'continue'
                    };
                })
            }))
        };
    });
}

/**
 * Lee el cuerpo de un Word en el orden en que aparece. Sirve para documentos
 * de actividades: las barras grises son tablas de una celda y el texto que
 * sigue pertenece a esa sección. No intenta reproducir el diseño de Word;
 * entrega una estructura neutral para que cada herramienta decida qué hacer.
 */
async function leerBloquesDeDocx(file) {
    const doc = await abrirDocumentoDocx(file);
    const body = doc.getElementsByTagNameNS(W_NS, 'body')[0] || doc.documentElement;
    const hijos = [...body.childNodes].filter(n => n.nodeType === 1);
    const formatosLista = await leerFormatosListaDocx(file);

    return hijos.map(n => {
        if (n.localName === 'p') {
            const texto = [...n.getElementsByTagNameNS(W_NS, 't')]
                .map(t => t.textContent || '').join('')
                .replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
            const numPr = n.getElementsByTagNameNS(W_NS, 'numPr')[0];
            const ilvl = numPr && numPr.getElementsByTagNameNS(W_NS, 'ilvl')[0];
            const numId = numPr && numPr.getElementsByTagNameNS(W_NS, 'numId')[0];
            const jc = n.getElementsByTagNameNS(W_NS, 'jc')[0];
            const idLista = numId && numId.getAttributeNS(W_NS, 'val');
            const nivel = Number(ilvl && ilvl.getAttributeNS(W_NS, 'val') || 0);
            return {
                tipo: 'parrafo',
                texto,
                lista: Boolean(numPr),
                idLista,
                tipoLista: formatosLista[`${idLista}:${nivel}`] || 'ordenada',
                nivelLista: nivel,
                alineacion: jc && jc.getAttributeNS(W_NS, 'val') === 'center' ? 'centro' :
                    (jc && jc.getAttributeNS(W_NS, 'val') === 'right' ? 'derecha' :
                        (jc && jc.getAttributeNS(W_NS, 'val') === 'both' ? 'justificado' : 'izquierda'))
            };
        }
        if (n.localName === 'tbl') {
            const filas = [...n.getElementsByTagNameNS(W_NS, 'tr')]
                .filter(tr => tr.closest ? tr.closest('*|tbl') === n : true);
            const celdas = filas.flatMap(tr => [...tr.getElementsByTagNameNS(W_NS, 'tc')]
                .filter(tc => tc.closest ? tc.closest('*|tbl') === n : true));
            const texto = celdas.map(textoDeCelda).filter(Boolean).join(' ').replace(/[ \t]+/g, ' ').trim();
            const sombreado = celdas.some(tc => {
                const shd = tc.getElementsByTagNameNS(W_NS, 'shd')[0];
                const fill = shd && (shd.getAttributeNS(W_NS, 'fill') || '').toLowerCase();
                return fill && fill !== 'auto' && fill !== 'ffffff';
            });
            return { tipo: 'tabla', texto, celdas: celdas.length, sombreado };
        }
        return { tipo: 'otro', texto: '' };
    }).filter(b => b.texto);
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
            abstractos[`${id}:${nivel}`] = valor === 'bullet' ? 'vinetas' :
                (valor === 'lowerLetter' ? 'letras' : (valor === 'lowerRoman' ? 'romana' : 'ordenada'));
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
