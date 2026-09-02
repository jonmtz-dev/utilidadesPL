/* ==========================================================================
   Del Word de la RÚBRICA a la matriz criterio × nivel.

   Lo comparten Adaptador de Rúbricas —que la escribe en «Definir rúbrica»— y
   QA de Actividad y Rúbrica 3.11, que la coteja. El texto esperado tiene que
   salir de la MISMA función en los dos: si el QA construyera su propia versión,
   cualquier diferencia entre ambas daría falsas alarmas, o peor, aprobaría algo
   mal escrito.

   ⚠️ ESTRUCTURA REAL DEL WORD (verificada contra un .docx, no supuesta). Cada
   criterio ocupa DOS filas:

       | Criterio de desempeño | EXPERTO      | CAPACITADO   | ...   <- encabezado
       | Cognitivo             | Utiliza...   | Utiliza...   | ...   <- textos
       |                       | 40 puntos    | 36 puntos    | ...   <- puntos
       | Total                 | 100 puntos   | ...                  <- NO es criterio

   Pero no siempre: hay rúbricas con el texto y los puntos en la MISMA celda, y
   por eso `analizarRubrica` mira las dos formas antes de decidir.
   ========================================================================== */

/* ------------------------------------------------------------ utilidades --- */

function normalizarNombre(s) {
    return (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Una celda es "de puntos" si SOLO contiene algo como "40 puntos" / "-6.25 puntos". */
const RE_SOLO_PUNTOS = /^\s*([+-]?\d+(?:[.,]\d+)?)\s*puntos?\.?\s*$/i;

/** Puntos al FINAL de un texto largo (caso "todo en una celda"). */
const RE_PUNTOS_AL_FINAL = /^([\s\S]*?)\s*([+-]?\d+(?:[.,]\d+)?)\s*puntos?\.?\s*$/i;

/**
 * Los puntos se guardan como TEXTO tal cual venían (solo se cambia la coma
 * decimal por punto, que es lo que Moodle espera). Nunca se pasan por
 * parseFloat para volver a imprimirlos: así "18.75" o "-6.25" llegan idénticos
 * y no hay forma de que un redondeo cambie una calificación.
 */
function normalizarPuntos(txt) {
    return (txt || '').trim().replace(',', '.');
}

/* ------------------------------------------- entrada: tabla HTML pegada --- */

/**
 * Convierte una <table> HTML a la MISMA estructura neutral que produce el
 * lector de .docx, resolviendo los `rowspan` a marcas vMergeInicio/vMergeSigue.
 */
function tablaHtmlAEstructura(tabla) {
    const filasTr = [...tabla.querySelectorAll('tr')];
    const ocupado = []; // ocupado[fila][col] = celda que la cubre por rowspan

    const filas = filasTr.map(() => ({ celdas: [] }));

    filasTr.forEach((tr, r) => {
        let c = 0;
        [...tr.children]
            .filter(n => n.tagName === 'TD' || n.tagName === 'TH')
            .forEach(celda => {
                while (ocupado[r] && ocupado[r][c]) c++;
                const colspan = parseInt(celda.getAttribute('colspan'), 10) || 1;
                const rowspan = parseInt(celda.getAttribute('rowspan'), 10) || 1;
                const texto = (celda.innerText !== undefined ? celda.innerText : celda.textContent || '')
                    .replace(/ /g, ' ').trim();

                filas[r].celdas[c] = { texto, vMergeInicio: rowspan > 1, vMergeSigue: false };

                for (let i = 0; i < rowspan; i++) {
                    ocupado[r + i] = ocupado[r + i] || [];
                    for (let j = 0; j < colspan; j++) {
                        ocupado[r + i][c + j] = true;
                        // Las filas de abajo cubiertas por el rowspan heredan la marca.
                        if (i > 0 && filas[r + i] && j === 0) {
                            filas[r + i].celdas[c] = { texto: '', vMergeInicio: false, vMergeSigue: true };
                        }
                    }
                }
                c += colspan;
            });
    });

    // Compactar huecos (celdas nunca escritas) preservando el orden de columna.
    filas.forEach(f => {
        for (let i = 0; i < f.celdas.length; i++) {
            if (!f.celdas[i]) f.celdas[i] = { texto: '', vMergeInicio: false, vMergeSigue: false };
        }
    });
    return { filas };
}

/* ------------------------------------------------- análisis de la rúbrica --- */

/**
 * A partir de la estructura neutral arma la matriz criterio x nivel.
 * Devuelve { niveles, criterios: [{ nombre, esTotal, incluir, celdas:[{texto,puntos}] }] }
 */
function analizarRubrica(estructura, headerIndex) {
    const filas = estructura.filas;
    const header = filas[headerIndex];
    if (!header) return null;

    const niveles = header.celdas.slice(1).map(c => (c.texto || '').replace(/\s+/g, ' ').trim());

    // Agrupar filas por criterio: una fila con vMergeSigue pertenece al criterio de arriba.
    const grupos = [];
    filas.slice(headerIndex + 1).forEach(fila => {
        const primera = fila.celdas[0] || { texto: '', vMergeSigue: false };
        if (primera.vMergeSigue && grupos.length) {
            grupos[grupos.length - 1].filas.push(fila);
        } else {
            grupos.push({ nombre: (primera.texto || '').replace(/\s+/g, ' ').trim(), filas: [fila] });
        }
    });

    const criterios = grupos.map(grupo => {
        // Dentro del grupo: ¿qué fila trae los puntos y cuál los textos?
        const filaPuntos = grupo.filas.find(f =>
            f.celdas.slice(1).some(c => c.texto) &&
            f.celdas.slice(1).every(c => !c.texto || RE_SOLO_PUNTOS.test(c.texto)));
        const filaTexto = grupo.filas.find(f => f !== filaPuntos) || grupo.filas[0];

        const celdas = niveles.map((_, i) => {
            const celdaTexto = (filaTexto.celdas[i + 1] || {}).texto || '';
            if (filaPuntos) {
                const m = ((filaPuntos.celdas[i + 1] || {}).texto || '').match(RE_SOLO_PUNTOS);
                return { texto: celdaTexto.trim(), puntos: m ? normalizarPuntos(m[1]) : '' };
            }
            // Caso alterno: texto y puntos en la MISMA celda.
            const m = celdaTexto.match(RE_PUNTOS_AL_FINAL);
            return m
                ? { texto: m[1].trim(), puntos: normalizarPuntos(m[2]) }
                : { texto: celdaTexto.trim(), puntos: '' };
        });

        // La fila "Total" no es un criterio: se detecta y se DESMARCA, pero se
        // muestra igual para que el usuario vea que se identificó (y pueda
        // incluirla si en alguna rúbrica rara sí fuera un criterio).
        const esTotal = /^total(es)?$/.test(normalizarNombre(grupo.nombre));
        return { nombre: grupo.nombre, esTotal, incluir: !esTotal && !!grupo.nombre, celdas };
    }).filter(c => c.nombre || c.celdas.some(x => x.texto));

    return { niveles, criterios };
}
