/* ==========================================================================
   Lógica de tablas compartida entre herramientas.

   Vive aquí y no duplicada en cada tools/<slug>/script.js porque ya pasó lo
   contrario: el Convertidor de Tablas y Micrositio a Página tenían cada uno su
   copia, se arregló un bug en una (el hex #d8a7b6 del encabezado, que pintaba
   del color equivocado los módulos que no eran MM) y en la otra siguió vivo
   meses. Cualquier arreglo de tablas va aquí para que le llegue a las dos.
   ========================================================================== */

/**
 * Mapa de la CUADRÍCULA real de la tabla: para cada celda, en qué columna
 * empieza de verdad, contando colspan y rowspan.
 *
 * Sin esto los data-label se asignan por POSICIÓN dentro del <tr>, y con
 * rowspan eso miente: si una celda de la fila 1 baja a la fila 2, la fila 2
 * tiene menos celdas físicas pero ocupan columnas salteadas.
 *
 * Caso real medido: en una tabla con dos celdas con rowspan="2", la 3ª celda de
 * la fila 2 recibía data-label="Propósito formativo" cuando le tocaba
 * "Contenidos formativos". En celular esa tarjeta le mostraba al estudiante un
 * encabezado que no correspondía a su contenido.
 *
 * @param {HTMLTableRowElement[]} filas Todas las <tr> de la tabla, en orden.
 * @returns {Map<Element, {col:number, colspan:number, rowspan:number}>}
 */
function mapaDeColumnas(filas) {
    const ocupado = [];
    const mapa = new Map();

    filas.forEach((fila, r) => {
        let c = 0;
        [...fila.children]
            .filter(n => n.tagName === 'TD' || n.tagName === 'TH')
            .forEach(celda => {
                // Saltamos las columnas que ya cubre un rowspan de una fila de arriba.
                while (ocupado[r] && ocupado[r][c]) c++;

                const colspan = parseInt(celda.getAttribute('colspan'), 10) || 1;
                const rowspan = parseInt(celda.getAttribute('rowspan'), 10) || 1;
                mapa.set(celda, { col: c, colspan, rowspan });

                for (let i = 0; i < rowspan; i++) {
                    ocupado[r + i] = ocupado[r + i] || [];
                    for (let j = 0; j < colspan; j++) ocupado[r + i][c + j] = true;
                }
                c += colspan;
            });
    });

    return mapa;
}

/**
 * Títulos POR COLUMNA REAL a partir de la fila de encabezados: un <th> con
 * colspan titula todas las columnas que abarca.
 */
function titulosPorColumna(headerRow, mapa) {
    const titulos = [];
    [...headerRow.children].forEach(celda => {
        const pos = mapa.get(celda);
        if (!pos) return;
        const texto = (celda.textContent || '').trim().replace(/\s+/g, ' ');
        for (let j = 0; j < pos.colspan; j++) titulos[pos.col + j] = texto;
    });
    return titulos;
}

/**
 * ¿La tabla llega YA maquetada (HTML de una página nuestra) o "desnuda"
 * (pegada desde Word)? De eso depende si conviene pintarle encima.
 *
 * La detección va por CLASES del sistema de diseño, no por `style`: Word
 * también inyecta `style="background:…"` cuando alguien coloreó celdas allá, y
 * eso haría pasar por maquetada una tabla que no lo está. En cambio un
 * `bg-primary-10` o un `table-bordered` solo salen de nuestro HTML.
 */
function traeEstiloPropio(tabla) {
    if (/\b(table|table-bordered|MW-auto|w-auto|tabla-responsive-cards)\b/.test(tabla.className)) return true;
    return !!tabla.querySelector(
        '[class*="bg-primary"], [class*="bg-secondary"], [class*="bg-neutral"], [class*="bg-resalte"],' +
        '[class*="text-primary"], [class*="text-secondary"]');
}
