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

/**
 * Qué celdas le CAEN ENCIMA a cada fila desde un `rowspan` de una fila anterior.
 *
 * En escritorio el `rowspan` funciona solo: la celda combinada se ve estirada a
 * lo largo de las filas que abarca. Pero en celular el CSS de Moodle vuelve cada
 * `<tr>` una tarjeta con `display: block`, y ahí el `rowspan` deja de existir:
 * la celda pertenece al DOM de UNA sola fila, así que la tarjeta de la semana 1
 * sale completa y las de las semanas 2 y 3 pierden esas columnas.
 *
 * Esto devuelve, por fila, las celdas heredadas y en qué columna real caen, para
 * que quien llame pueda dejar una copia solo-celular en su lugar correcto.
 *
 * @param {HTMLTableRowElement[]} filas Filas a revisar, en orden. Los `rowspan`
 *   que nacen ANTES de la primera de la lista no se cuentan (así el llamador
 *   puede pasar solo el cuerpo y no arrastrar celdas del encabezado).
 * @param {Map<Element, {col:number, colspan:number, rowspan:number}>} mapa
 *   El de `mapaDeColumnas()`.
 * @returns {Map<HTMLTableRowElement, Array<{col:number, celda:Element}>>}
 *   Una entrada por fila (vacía si no hereda nada), ordenada por columna.
 */
function celdasHeredadas(filas, mapa) {
    const heredadas = new Map();
    filas.forEach(fila => heredadas.set(fila, []));

    filas.forEach((fila, r) => {
        [...fila.children].forEach(celda => {
            const pos = mapa.get(celda);
            if (!pos || pos.rowspan < 2) return;
            for (let i = 1; i < pos.rowspan; i++) {
                const destino = filas[r + i];
                if (!destino) break;
                heredadas.get(destino).push({ col: pos.col, celda });
            }
        });
    });

    // Por columna: así las copias se insertan en el orden de la tabla y la
    // tarjeta lee igual que el renglón de escritorio.
    heredadas.forEach(lista => lista.sort((a, b) => a.col - b.col));
    return heredadas;
}
