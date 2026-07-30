/* ==========================================================================
   Escritura de .zip sin librerías, compartida entre herramientas.

   Vive en assets/ por la misma razón que docx.js y tablas.js: la usaban
   Micrositio a Página (para bajar las imágenes de una conversión) y ahora
   también Guion Instruccional a Página. Duplicarla es como se nos quedó vivo
   meses el hex #d8a7b6 en una copia ya corregida en la otra.

   Aquí va solo la ESCRITURA. Cada herramienta conserva su lector, porque leen
   cosas distintas (un .docx y un micrositio) y con reglas propias.

   Las firmas SIG_* las usan también los lectores; por eso viven aquí y no
   dentro de la función.
   ========================================================================== */

const SIG_EOCD = 0x06054b50;   // fin del directorio central
const SIG_CD = 0x02014b50;     // entrada del directorio central
const SIG_LOCAL = 0x04034b50;  // cabecera local de archivo

const CRC_TABLA = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Arma un .zip "stored" (sin compresión). Los PNG/JPG ya vienen comprimidos,
 * así que comprimir de nuevo no ahorra nada. Marca los nombres como UTF-8
 * (bit 11) para respetar acentos.
 *
 * @param {{nombre: string, datos: Uint8Array}[]} entradas
 * @returns {Blob}
 */
function armarZipStored(entradas) {
    const enc = new TextEncoder();
    const datosLocales = [];
    const central = [];
    let offset = 0;

    for (const { nombre, datos } of entradas) {
        const nombreBytes = enc.encode(nombre);
        const crc = crc32(datos);
        const tam = datos.length;

        const lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, SIG_LOCAL, true);
        lh.setUint16(4, 20, true);       // versión necesaria
        lh.setUint16(6, 0x0800, true);   // bandera: nombres UTF-8
        lh.setUint16(8, 0, true);        // método 0 = stored
        lh.setUint32(14, crc, true);
        lh.setUint32(18, tam, true);     // tam comprimido
        lh.setUint32(22, tam, true);     // tam sin comprimir
        lh.setUint16(26, nombreBytes.length, true);
        datosLocales.push(new Uint8Array(lh.buffer), nombreBytes, datos);

        const cd = new DataView(new ArrayBuffer(46));
        cd.setUint32(0, SIG_CD, true);
        cd.setUint16(4, 20, true);       // versión que lo creó
        cd.setUint16(6, 20, true);       // versión necesaria
        cd.setUint16(8, 0x0800, true);   // bandera UTF-8
        cd.setUint16(10, 0, true);       // método stored
        cd.setUint32(16, crc, true);
        cd.setUint32(20, tam, true);
        cd.setUint32(24, tam, true);
        cd.setUint16(28, nombreBytes.length, true);
        cd.setUint32(42, offset, true);  // offset de la cabecera local
        central.push(new Uint8Array(cd.buffer), nombreBytes);

        offset += 30 + nombreBytes.length + tam;
    }

    const centralTam = central.reduce((s, c) => s + c.length, 0);
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, SIG_EOCD, true);
    eocd.setUint16(8, entradas.length, true);
    eocd.setUint16(10, entradas.length, true);
    eocd.setUint32(12, centralTam, true);
    eocd.setUint32(16, offset, true);    // inicio del directorio central

    return new Blob([...datosLocales, ...central, new Uint8Array(eocd.buffer)],
        { type: 'application/zip' });
}
