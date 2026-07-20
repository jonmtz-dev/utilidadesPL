/* ==========================================================================
   Lector de .docx — solo lo necesario para sacar las TABLAS de una rúbrica.

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

/**
 * Extrae las tablas del .docx como una estructura neutral:
 *   [{ filas: [{ celdas: [{ texto, vMergeInicio, vMergeSigue }] }] }]
 * La misma forma que produce el lector de HTML pegado, para que el análisis
 * de la rúbrica sea UNO SOLO y no dos caminos que puedan divergir.
 */
async function leerTablasDeDocx(file) {
    const archivos = await leerZip(await file.arrayBuffer());
    const entrada = archivos.get('word/document.xml');
    if (!entrada) throw new Error('El archivo no contiene word/document.xml (¿es realmente un .docx?).');

    const xml = new TextDecoder('utf-8').decode(await inflar(entrada));
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('No se pudo leer el XML interno del .docx.');

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
