/**
 * Adaptador de Rúbricas Moodle.
 *
 * El problema: actualizar una rúbrica en "Definir rúbrica" es pegar celda por
 * celda, y con muchas rúbricas pendientes eso es carísimo en tiempo. Se parte
 * en dos:
 *   1) AQUÍ: se lee la rúbrica (subiendo el .docx o pegando la tabla), el
 *      usuario la revisa/corrige, y se genera un script.
 *   2) ALLÁ: ese script se corre en la página de Moodle, que es el único lugar
 *      donde existe el DOM real del formulario.
 *
 * ⚠️ ESTRUCTURA REAL DEL WORD (verificada contra un .docx de rúbrica, no
 * supuesta). Cada criterio ocupa DOS filas:
 *
 *     | Criterio de desempeño | EXPERTO      | CAPACITADO   | ...   <- encabezado
 *     | Cognitivo             | Utiliza...   | Utiliza...   | ...   <- textos
 *     |                       | 40 puntos    | 36 puntos    | ...   <- puntos
 *     | Actitudinal           | Atiende...   | ...
 *     |                       | 20 puntos    | ...
 *     | Total                 | 100 puntos   | ...                  <- NO es criterio
 *
 * Las dos filas de un criterio se relacionan por `vMerge` (en .docx) o por
 * `rowspan` (al pegar desde Word). La primera versión de esta herramienta
 * asumía "texto y puntos en la misma celda" y habría producido basura con los
 * archivos reales; de ahí que el análisis viva en un solo lugar para los dos
 * caminos de entrada.
 *
 * Decisión de seguridad (acordada con el usuario): el script NUNCA agrega ni
 * quita criterios/niveles, ni guarda. Los botones "Añadir nivel"/"Eliminar
 * criterio" son <input type="submit"> y no hay forma de verificar sin una
 * rúbrica real si Moodle los intercepta o si dispararían un envío de verdad.
 * En su lugar, el script REPORTA con precisión qué hay que hacer a mano.
 */

/* ------------------------------------------------------------ utilidades --- */

function normalizarNombre(s) {
    return (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Deriva la actividad de la rúbrica a partir de un texto. Se usa con DOS
 * fuentes, en orden de fiabilidad: el encabezado del Word ("Rúbrica de la
 * actividad integradora 5", que es prosa) y, si ahí no aparece, el nombre del
 * archivo ("M11_S3_AI5_Rubrica" → AI5). El Word de rúbrica no la nombra en el
 * cuerpo; el título vive en el encabezado.
 */
function detectarActividad(texto) {
    const s = texto || '';
    let m;
    // Prosa (encabezado)
    if ((m = s.match(/actividad\s+integradora\s*(\d+)/i))) return 'Actividad integradora ' + m[1];
    if ((m = s.match(/actividad\s+formativa\s*(\d+)/i))) return 'Actividad formativa ' + m[1];
    if (/proyecto\s+integrador/i.test(s)) return 'Proyecto integrador';
    // Códigos del nombre de archivo
    const u = s.toUpperCase();
    if ((m = u.match(/(?:^|[^A-Z])AI[ _-]?(\d+)/))) return 'Actividad integradora ' + m[1];
    if ((m = u.match(/(?:^|[^A-Z])AF[ _-]?(\d+)/))) return 'Actividad formativa ' + m[1];
    if (/(?:^|[^A-Z])PI(?:[^A-Z]|$)/.test(u)) return 'Proyecto integrador';
    return '';
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

/* --------------------------------------------------------------- la app --- */

document.addEventListener('DOMContentLoaded', () => {
    const pasteArea = document.getElementById('paste-area');
    const btnAnalizar = document.getElementById('btn-analizar');
    const inputDocx = document.getElementById('input-docx');
    const dropzone = document.getElementById('dropzone');
    const docxInfo = document.getElementById('docx-info');
    const paso2 = document.getElementById('paso2');
    const filasContainer = document.getElementById('filas-container');

    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const previewEmpty = document.getElementById('preview-empty');
    const previewContainer = document.getElementById('preview-container');
    const scriptEmpty = document.getElementById('script-empty');
    const scriptResultado = document.getElementById('script-resultado');
    const qaEmpty = document.getElementById('qa-empty');
    const qaResultado = document.getElementById('qa-resultado');

    let estructura = null;   // estructura neutral de la tabla elegida
    let matriz = null;       // resultado del análisis
    // Actividad a la que pertenece la rúbrica. Se deriva del nombre del archivo
    // (el Word de rúbrica NO la nombra por dentro) y viaja al script/QA como red
    // de seguridad contra llenar la rúbrica de otra actividad.
    let actividadRubrica = '';
    // Los dos encendidos por defecto:
    //  · anteponerNivel: en las rúbricas reales el primer criterio lleva el
    //    nombre del nivel ("EXPERTO - Utiliza hojas de cálculo…").
    //  · borrarSobrantes: se probó contra un Moodle REAL y borra bien. Si algún
    //    día no pudiera, no rompe nada: aborta, marca en rojo y lo dice.
    let anteponerNivel = true;
    let borrarSobrantes = true;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.target}-content`).classList.add('active');
        });
    });

    function activarTab(nombre) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.target === nombre));
        tabContents.forEach(c => c.classList.toggle('active', c.id === `${nombre}-content`));
    }

    function mostrarError(titulo, detalle) {
        previewEmpty.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        previewContainer.innerHTML = `<div class="aviso aviso-error"><i class="ph ph-warning-octagon"></i>
            <span><strong>${titulo}</strong><br>${detalle}</span></div>`;
        activarTab('preview');
    }

    /* ------------------------------------------------- Entrada A: .docx --- */

    async function cargarDocx(file) {
        if (!/\.docx$/i.test(file.name)) {
            mostrarError('Ese archivo no es un .docx.',
                'Si tu rúbrica está en .doc (formato viejo) ábrela en Word y guárdala como .docx, ' +
                'o copia la tabla y pégala en el área de la derecha.');
            return;
        }
        try {
            const tablas = await leerTablasDeDocx(file);
            if (!tablas.length) {
                mostrarError('El documento no contiene ninguna tabla.',
                    'Revisa que la rúbrica esté como tabla de Word y no como imagen o texto suelto.');
                return;
            }
            // La rúbrica es, con mucho, la tabla más grande del documento.
            const tabla = tablas.reduce((a, b) => (b.filas.length > a.filas.length ? b : a));
            docxInfo.innerHTML = `<i class="ph ph-check-circle"></i> <strong>${escapar(file.name)}</strong> —
                ${tablas.length} tabla(s) en el documento, se usó la de ${tabla.filas.length} filas.`;
            docxInfo.classList.remove('hidden');
            // La actividad se toma del encabezado del Word (donde vive el título
            // "Rúbrica de la actividad integradora 5"); si no, del nombre del
            // archivo. Se propone y queda editable.
            let encabezado = '';
            try { encabezado = await leerEncabezadosDeDocx(file); } catch (e) { /* opcional */ }
            const sugerida = detectarActividad(encabezado) || detectarActividad(file.name);
            if (sugerida) { actividadRubrica = sugerida; const inp = document.getElementById('actividad-rubrica'); if (inp) inp.value = sugerida; }
            usarEstructura(tabla);
        } catch (e) {
            console.error('[rubricas] docx:', e);
            mostrarError('No se pudo leer el .docx.', escapar(e.message));
        }
    }

    inputDocx.addEventListener('change', () => {
        if (inputDocx.files[0]) cargarDocx(inputDocx.files[0]);
    });
    dropzone.addEventListener('click', () => inputDocx.click());
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dropzone--activa');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dropzone--activa'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dropzone--activa');
        if (e.dataTransfer.files[0]) cargarDocx(e.dataTransfer.files[0]);
    });

    /* ------------------------------------------------ Entrada B: pegado --- */

    const inputActividad = document.getElementById('actividad-rubrica');
    if (inputActividad) inputActividad.addEventListener('input', () => { actividadRubrica = inputActividad.value.trim(); });

    pasteArea.addEventListener('input', () => {
        btnAnalizar.disabled = pasteArea.innerHTML.trim() === '';
    });

    btnAnalizar.addEventListener('click', () => {
        try {
            const temp = document.createElement('div');
            temp.innerHTML = pasteArea.innerHTML;
            let tabla = temp.querySelector('table');
            if (!tabla) {
                const comoTexto = temp.textContent;
                if (/<table[\s\S]*<\/table>/i.test(comoTexto)) {
                    temp.innerHTML = comoTexto;
                    tabla = temp.querySelector('table');
                }
            }
            if (!tabla) {
                mostrarError('No se detectó ninguna tabla en lo que pegaste.',
                    'Copia la tabla completa desde Word (selecciónala con el cursor) y vuelve a pegar.');
                return;
            }
            // innerText necesita que el nodo esté en el documento para respetar
            // los saltos de línea; se mide en el área de pegado, que ya lo está.
            docxInfo.classList.add('hidden');
            usarEstructura(tablaHtmlAEstructura(pasteArea.querySelector('table') || tabla));
        } catch (e) {
            console.error('[rubricas] pegado:', e);
            mostrarError('No se pudo leer la tabla pegada.', escapar(e.message));
        }
    });

    /* ------------------------------------------------ Paso 2: encabezado --- */

    function usarEstructura(nueva) {
        estructura = nueva;
        pintarFilas();
        paso2.classList.remove('hidden');

        // Auto-detección: la primera fila suele ser la de niveles. Se preselecciona
        // para ahorrar un clic, pero queda visible y cambiable.
        const filaOpcion = filasContainer.querySelector('.fila-opcion');
        if (filaOpcion) filaOpcion.click();
    }

    function pintarFilas() {
        filasContainer.innerHTML = estructura.filas.map((fila, i) => {
            const resumen = fila.celdas.map(c => (c.texto || '').replace(/\s+/g, ' '))
                .filter(Boolean).join(' · ');
            return `<div class="fila-opcion" data-index="${i}">
                <span class="fila-num">${i + 1}</span>
                <span class="fila-resumen">${escapar(resumen.slice(0, 140) || '(fila vacía)')}</span>
            </div>`;
        }).join('');

        filasContainer.querySelectorAll('.fila-opcion').forEach(el => {
            el.addEventListener('click', () => {
                filasContainer.querySelectorAll('.fila-opcion').forEach(x => x.classList.remove('activa'));
                el.classList.add('activa');
                matriz = analizarRubrica(estructura, parseInt(el.dataset.index, 10));
                pintarPreview();
                activarTab('preview');
            });
        });
    }

    /* -------------------------------------------- Vista previa editable --- */

    function pintarPreview() {
        if (!matriz || !matriz.criterios.length) {
            mostrarError('No se pudieron leer criterios con esa fila de encabezado.',
                'Prueba eligiendo otra fila en el paso 2.');
            return;
        }
        previewEmpty.classList.add('hidden');
        previewContainer.classList.remove('hidden');

        const incluidos = matriz.criterios.filter(c => c.incluir);
        const sinPuntos = incluidos.reduce((acc, c) =>
            acc + c.celdas.filter(x => x.puntos === '').length, 0);
        const totalDetectado = matriz.criterios.find(c => c.esTotal);

        const avisos = [];
        if (totalDetectado) {
            avisos.push(`<div class="aviso aviso-info"><i class="ph ph-info"></i>
                <span>Se detectó una fila <strong>"${escapar(totalDetectado.nombre)}"</strong> y se
                <strong>desmarcó</strong>: es el total de la rúbrica, no un criterio. Si en tu caso sí
                debiera serlo, márcala.</span></div>`);
        }
        if (sinPuntos) {
            avisos.push(`<div class="aviso aviso-warn"><i class="ph ph-warning"></i>
                <span><strong>${sinPuntos} celda(s) sin puntaje detectado.</strong> No se les pone 0 en
                automático (borraría una calificación real sin querer): complétalas abajo.</span></div>`);
        }

        const filasHtml = matriz.criterios.map((crit, ci) => `
            <tr class="${crit.incluir ? '' : 'fila-excluida'}">
                <td class="col-criterio">
                    <label class="check-criterio">
                        <input type="checkbox" class="in-incluir" data-ci="${ci}" ${crit.incluir ? 'checked' : ''}>
                        <span>Actualizar</span>
                    </label>
                    <textarea class="in-criterio" data-ci="${ci}" rows="2">${escapar(crit.nombre)}</textarea>
                </td>
                ${crit.celdas.map((cel, li) => `
                    <td>
                        <textarea class="in-texto" data-ci="${ci}" data-li="${li}" rows="4">${escapar(cel.texto)}</textarea>
                        <div class="in-puntos-wrap">
                            <input class="in-puntos ${cel.puntos === '' ? 'sin-detectar' : ''}"
                                   type="text" inputmode="decimal" data-ci="${ci}" data-li="${li}"
                                   value="${escapar(cel.puntos)}" placeholder="pts">
                            <span class="in-puntos-label">pts</span>
                        </div>
                    </td>`).join('')}
            </tr>`).join('');

        previewContainer.innerHTML = `
            ${avisos.join('')}
            <div class="resumen-puntos" id="resumen-puntos"></div>
            <label class="toggle-switch mb-3">
                <input type="checkbox" id="opt-anteponer-nivel" ${anteponerNivel ? 'checked' : ''}>
                <span class="slider"></span>
                <span class="label-text">Anteponer el nombre del nivel al texto
                    <small>(solo en el primer criterio: <code>EXPERTO - Interpreta…</code>, como en tus rúbricas)</small></span>
            </label>
            <label class="toggle-switch mb-3">
                <input type="checkbox" id="opt-borrar-sobrantes" ${borrarSobrantes ? 'checked' : ''}>
                <span class="slider"></span>
                <span class="label-text">Intentar borrar los criterios que ya no vienen en el Word
                    <small>(si no lo logra, los marca en rojo y te avisa; nunca falla en silencio)</small></span>
            </label>
            <div class="tabla-preview-wrap">
                <table class="tabla-preview">
                    <thead><tr>
                        <th>Criterio</th>
                        ${matriz.niveles.map(n => `<th>${escapar(n)}</th>`).join('')}
                    </tr></thead>
                    <tbody>${filasHtml}</tbody>
                </table>
            </div>
            <div class="acciones-generar mt-4">
                <button id="btn-generar" class="btn-primary">
                    <i class="ph ph-magic-wand"></i> Generar script para Moodle
                </button>
                <button id="btn-generar-qa" class="btn-secondary">
                    <i class="ph ph-shield-check"></i> Generar verificador (QA)
                </button>
            </div>`;

        previewContainer.querySelectorAll('.in-incluir').forEach(el => {
            el.addEventListener('change', () => {
                matriz.criterios[+el.dataset.ci].incluir = el.checked;
                el.closest('tr').classList.toggle('fila-excluida', !el.checked);
                pintarResumenPuntos();
            });
        });
        previewContainer.querySelectorAll('.in-criterio').forEach(el => {
            el.addEventListener('input', () => { matriz.criterios[+el.dataset.ci].nombre = el.value; });
        });
        previewContainer.querySelectorAll('.in-texto').forEach(el => {
            el.addEventListener('input', () => {
                matriz.criterios[+el.dataset.ci].celdas[+el.dataset.li].texto = el.value;
            });
        });
        previewContainer.querySelectorAll('.in-puntos').forEach(el => {
            el.addEventListener('input', () => {
                el.classList.remove('sin-detectar');
                matriz.criterios[+el.dataset.ci].celdas[+el.dataset.li].puntos = normalizarPuntos(el.value);
                pintarResumenPuntos();
            });
        });
        document.getElementById('opt-anteponer-nivel').addEventListener('change', (e) => {
            anteponerNivel = e.target.checked;
        });
        document.getElementById('opt-borrar-sobrantes').addEventListener('change', (e) => {
            borrarSobrantes = e.target.checked;
        });
        document.getElementById('btn-generar').addEventListener('click', generarScript);
        document.getElementById('btn-generar-qa').addEventListener('click', generarQA);

        pintarResumenPuntos();
    }

    /**
     * Suma por nivel de los criterios marcados. Es la red de seguridad contra
     * un error de puntaje: el usuario compara este total con la fila "Total"
     * de su Word y si cuadra, no hubo errores de lectura.
     */
    function pintarResumenPuntos() {
        const cont = document.getElementById('resumen-puntos');
        if (!cont) return;
        const incluidos = matriz.criterios.filter(c => c.incluir);
        const totales = matriz.niveles.map((_, i) =>
            incluidos.reduce((suma, c) => {
                const p = parseFloat(c.celdas[i] ? c.celdas[i].puntos : '');
                return suma + (isNaN(p) ? 0 : p);
            }, 0));

        const filaTotalWord = matriz.criterios.find(c => c.esTotal);
        const comparacion = filaTotalWord ? matriz.niveles.map((_, i) => {
            const esperado = parseFloat(filaTotalWord.celdas[i] ? filaTotalWord.celdas[i].puntos : '');
            return isNaN(esperado) ? null : Math.abs(esperado - totales[i]) < 0.001;
        }) : null;

        const todoCuadra = comparacion && comparacion.every(x => x !== false);

        cont.innerHTML = `
            <div class="aviso ${comparacion ? (todoCuadra ? 'aviso-ok' : 'aviso-error') : 'aviso-info'}">
                <i class="ph ${comparacion ? (todoCuadra ? 'ph-check-circle' : 'ph-warning-octagon') : 'ph-calculator'}"></i>
                <span>
                    <strong>Suma de puntos por nivel (criterios marcados):</strong>
                    ${totales.map((t, i) => `<code>${escapar(matriz.niveles[i] || ('N' + (i + 1)))}: ${t}</code>`).join(' ')}
                    ${comparacion ? (todoCuadra
                        ? '<br>Coincide con la fila "Total" de tu Word. ✔'
                        : '<br><strong>No coincide con la fila "Total" de tu Word</strong> — revisa los puntajes antes de continuar.')
                    : ''}
                </span>
            </div>`;
    }

    /* ------------------------------------------------ Generar el script --- */

    /**
     * Arma la rúbrica que se va a escribir (o a verificar). Es UNA sola función
     * para los dos scripts a propósito: si el QA construyera su propia versión
     * del texto esperado, cualquier diferencia entre ambas daría falsas alarmas
     * (o peor, aprobaría algo mal escrito). El verificador tiene que comparar
     * contra exactamente lo mismo que se escribió.
     *
     * El nombre del nivel (EXPERTO, CAPACITADO…) se antepone SOLO en el primer
     * criterio: así están las rúbricas reales en Moodle —Cognitivo lleva
     * "EXPERTO - Utiliza…" y Actitudinal, Comunicativo y Pensamiento crítico
     * van sin nombre— porque en el Word esos nombres viven en el encabezado de
     * la tabla y solo hacen falta una vez, como referencia de la columna.
     *
     * El separador es " - " en la misma línea (no un salto doble): el editor de
     * rúbricas de Moodle muestra la celda como un bloque corrido, así el nombre
     * del nivel se lee como etiqueta del texto y no como un párrafo suelto.
     */
    function construirDATA() {
        const incluidos = matriz.criterios.filter(c => c.incluir);
        if (!incluidos.length) {
            alert('No hay ningún criterio marcado.');
            return null;
        }
        if (incluidos.some(c => c.celdas.some(x => x.puntos === ''))) {
            alert('Todavía hay celdas sin puntaje. Complétalas en la vista previa antes de continuar.');
            return null;
        }
        return incluidos.map((crit, ci) => ({
            nombre: crit.nombre,
            niveles: crit.celdas.map((cel, li) => ({
                // Sin texto no se deja un guion colgando: queda solo el nombre.
                texto: (anteponerNivel && ci === 0 && matriz.niveles[li])
                    ? (cel.texto ? `${matriz.niveles[li]} - ${cel.texto}` : matriz.niveles[li])
                    : cel.texto,
                puntos: cel.puntos   // string, tal cual venía del Word
            }))
        }));
    }

    function generarScript() {
        const DATA = construirDATA();
        if (!DATA) return;
        pintarScript(construirScriptInyectable(DATA));
        activarTab('script');
    }

    function generarQA() {
        const DATA = construirDATA();
        if (!DATA) return;
        pintarQA(construirScriptQA(DATA));
        activarTab('qa');
    }

    /**
     * Script que corre DENTRO de "Definir rúbrica". Basado en el DOM real de
     * rubric/edit.php (confirmado con un volcado del usuario):
     *
     *   <tr class="criterion" id="rubric-criteria-ID">
     *     <textarea name="rubric[criteria][ID][description]">   <- nombre del criterio
     *     <td class="level">
     *       <textarea name="rubric[criteria][ID][levels][LID][definition]">
     *       <input    name="rubric[criteria][ID][levels][LID][score]">
     *
     * Los campos reales están ocultos (class="hiddenelement") y Moodle muestra
     * un <span class="textvalue"> hasta que se hace clic. Por eso se sincroniza
     * también ese span: si no, se guardaría bien pero se vería el texto viejo.
     */
    function construirScriptInyectable(DATA) {
        return `
(function() {
    var DATA = ${JSON.stringify(DATA)};
    var BORRAR_SOBRANTES = ${borrarSobrantes ? 'true' : 'false'};
    var ACTIVIDAD = ${JSON.stringify(actividadRubrica || '')};

    function normalizar(s) {
        return (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
            .replace(/\\s+/g, ' ').trim();
    }
    // Nombre de la actividad donde está el usuario (rúbrica = subpágina de una
    // actividad): breadcrumb con enlace a mod/*/view.php, o el encabezado.
    function actividadEnMoodle() {
        // El nombre de la actividad es el TEXTO del enlace a mod/*/view.php dentro
        // del breadcrumb (el atributo title="Tarea" es solo el tipo). Nunca se usa
        // el encabezado ni document.title: en "Definir rúbrica" dirían "Definir
        // rúbrica", no la actividad. Sin dato fiable devuelve '' (no se afirma nada).
        var bcs = [].slice.call(document.querySelectorAll('.breadcrumb, ol.breadcrumb, [aria-label="breadcrumb"]'));
        for (var i = 0; i < bcs.length; i++) {
            var a = [].slice.call(bcs[i].querySelectorAll('a')).filter(function (x) {
                return /\\/mod\\/[a-z]+\\/view\\.php/.test(x.getAttribute('href') || '') && (x.textContent || '').trim();
            });
            if (a.length) return (a[a.length - 1].textContent || '').replace(/\\s+/g, ' ').trim();
        }
        var any = [].slice.call(document.querySelectorAll('a')).filter(function (x) {
            return /\\/mod\\/[a-z]+\\/view\\.php/.test(x.getAttribute('href') || '') && (x.textContent || '').trim();
        });
        return any.length ? (any[0].textContent || '').replace(/\\s+/g, ' ').trim() : '';
    }
    // Clave canónica (ai3, pi, af2) para comparar sin depender del subtítulo.
    function claveAct(s) {
        s = (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
        if (/proyecto\\s+integrador/.test(s)) return 'pi';
        var m = s.match(/actividad\\s+integradora\\s*(\\d+)/); if (m) return 'ai' + m[1];
        m = s.match(/actividad\\s+formativa\\s*(\\d+)/); if (m) return 'af' + m[1];
        m = s.match(/\\bai[ _-]?(\\d+)/); if (m) return 'ai' + m[1];
        m = s.match(/\\baf[ _-]?(\\d+)/); if (m) return 'af' + m[1];
        if (/\\bpi\\b/.test(s)) return 'pi';
        return '';
    }

    function fijarValor(el, valor) {
        if (!el) return;
        el.value = valor;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        var envoltura = el.closest('.definition, .score, .description');
        var span = envoltura && envoltura.querySelector('.textvalue');
        if (span) span.textContent = valor;
    }

    var filas = [].slice.call(document.querySelectorAll('tr.criterion')).filter(function (tr) {
        return tr.querySelector('textarea[name*="[criteria]"][name$="[description]"]');
    });
    if (!filas.length) {
        alert('No encontré la tabla de la rúbrica en esta página.\\n' +
            'Confirma que estás en "Calificación avanzada > Definir rúbrica" y vuelve a intentar.');
        return;
    }

    var existentes = filas.map(function (tr) {
        var descTA = tr.querySelector('textarea[name*="[criteria]"][name$="[description]"]');
        var niveles = [].slice.call(tr.querySelectorAll('td.level')).map(function (td) {
            return {
                defTA: td.querySelector('textarea[name*="[levels]"][name$="[definition]"]'),
                scoreInput: td.querySelector('input[name*="[levels]"][name$="[score]"]')
            };
        });
        return { tr: tr, nombre: (descTA.value || '').trim(), niveles: niveles, usado: false };
    });

    function buscarExistente(nombre) {
        var n = normalizar(nombre);
        var i;
        for (i = 0; i < existentes.length; i++) {
            if (!existentes[i].usado && normalizar(existentes[i].nombre) === n) {
                existentes[i].usado = true; return existentes[i];
            }
        }
        for (i = 0; i < existentes.length; i++) {
            if (existentes[i].usado) continue;
            var en = normalizar(existentes[i].nombre);
            if (en && n && (en.indexOf(n) !== -1 || n.indexOf(en) !== -1)) {
                existentes[i].usado = true; return existentes[i];
            }
        }
        return null;
    }

    // 1) Se arma el plan SIN escribir nada.
    var plan = [], faltanCriterio = [];
    DATA.forEach(function (crit) {
        var ex = buscarExistente(crit.nombre);
        if (!ex) { faltanCriterio.push(crit.nombre); return; }
        var n = Math.min(ex.niveles.length, crit.niveles.length);
        plan.push({
            existente: ex, nombre: crit.nombre,
            nuevos: crit.niveles.slice(0, n),
            diferencia: crit.niveles.length - ex.niveles.length
        });
    });

    // Criterios que YA ESTÁN en Moodle pero que el Word ya no trae.
    var sobrantes = existentes.filter(function (e) { return !e.usado; });

    var totalCeldas = plan.reduce(function (a, p) { return a + p.nuevos.length; }, 0);
    var faltanNiveles = plan.filter(function (p) { return p.diferencia > 0; });
    var sobranNiveles = plan.filter(function (p) { return p.diferencia < 0; });

    // Los detalles largos NO van en el diálogo: se marcan sobre la página, que
    // es donde hay que actuar. El aviso solo dice cuántos y qué hacer.
    function marcarEnPagina(tr, etiqueta, color) {
        tr.style.outline = '3px solid ' + color;
        tr.style.outlineOffset = '-3px';
        var celda = tr.querySelector('td.description') || tr.cells[0];
        if (celda && !celda.querySelector('.marca-adaptador')) {
            var b = document.createElement('div');
            b.className = 'marca-adaptador';
            b.textContent = etiqueta;
            b.style.cssText = 'background:' + color + ';color:#fff;font-size:11px;font-weight:700;' +
                'padding:3px 6px;border-radius:4px;margin-top:6px;display:inline-block;line-height:1.3';
            celda.appendChild(b);
        }
    }

    var msg = 'Se llenarán ' + totalCeldas + ' celdas en ' + plan.length + ' criterio(s).';
    var pendientes = [];

    if (sobrantes.length) {
        pendientes.push(sobrantes.length + ' criterio(s) que ya no vienen en el Word' +
            (BORRAR_SOBRANTES ? ': se intentarán borrar' : ': se marcarán en rojo para que los borres'));
    }
    if (faltanCriterio.length) pendientes.push(faltanCriterio.length + ' criterio(s) del Word que no existen aquí: agrégalos con "Añadir criterio"');
    if (faltanNiveles.length) pendientes.push(faltanNiveles.length + ' criterio(s) con niveles de menos: agrégalos con "Añadir nivel"');
    if (sobranNiveles.length) pendientes.push(sobranNiveles.length + ' criterio(s) con niveles de más: se llenan los primeros');

    if (pendientes.length) msg += '\\n\\nPendientes:\\n- ' + pendientes.join('\\n- ');
    msg += '\\n\\nContinuar? Nada se guarda todavía.';

    // Red de seguridad: si el nombre de la rúbrica no cuadra con la actividad
    // donde estás, se avisa ANTES de escribir nada.
    if (ACTIVIDAD) {
        var actM = actividadEnMoodle();
        var kRubrica = claveAct(ACTIVIDAD), kMoodle = claveAct(actM);
        if (actM && kRubrica && kMoodle && kRubrica !== kMoodle) {
            msg = '\\u26A0 CUIDADO: esta rúbrica es de "' + ACTIVIDAD + '", pero estás en la actividad ' +
                '"' + actM + '".\\nVerifica que sea la rúbrica correcta antes de continuar.\\n\\n' + msg;
        } else if (actM) {
            msg = 'Rúbrica (Word): ' + ACTIVIDAD + '\\nActividad (Moodle): ' + actM + '\\n\\n' + msg;
        }
    }

    if (!confirm(msg)) return;

    plan.forEach(function (p) {
        p.nuevos.forEach(function (nivel, i) {
            fijarValor(p.existente.niveles[i].defTA, nivel.texto);
            fijarValor(p.existente.niveles[i].scoreInput, String(nivel.puntos));
        });
        if (p.diferencia > 0) marcarEnPagina(p.existente.tr, 'FALTAN ' + p.diferencia + ' NIVEL(ES)', '#ef6c00');
    });

    /* ------------------------------------------ borrado de los sobrantes ---
     * Moodle pide CONFIRMACIÓN en un diálogo modal (YUI) por cada criterio que
     * se borra, y mientras está abierto tapa la página con una máscara
     * (.moodle-dialogue-lightbox) que bloquea cualquier otro clic.
     *
     * Por eso NO se puede pulsar los botones de golpe: el primero abre el
     * modal y los demás clics se pierden contra la máscara, dejando la página
     * gris y trabada. Hay que ir de UNO EN UNO: pulsar, confirmar el diálogo,
     * esperar a que la fila desaparezca, y recién entonces seguir.
     *
     * Si algo no sale como se espera, se ABORTA el resto (no se insiste a
     * ciegas), se marcan los que quedaron y se dice con claridad qué pasó.    */

    function esperar(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    // OJO: nada de comprobar offsetParent aquí. En un elemento con position
    // fixed —que es justo lo que usa el modal de Moodle— offsetParent vale null
    // aunque esté perfectamente visible, así que el diálogo NUNCA se detectaba y
    // el borrado automático no podía funcionar. Se mide por tamaño real y por
    // estilo calculado. (Y ojo con las comillas invertidas en este comentario:
    // va dentro de un template literal y cerrarían la cadena.)
    function dialogoVisible() {
        var candidatos = document.querySelectorAll(
            '.moodle-dialogue-confirm, .confirmation-dialogue, .moodle-dialogue, [role="dialog"]');
        for (var i = 0; i < candidatos.length; i++) {
            var d = candidatos[i];
            var cs = getComputedStyle(d);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            var r = d.getBoundingClientRect();
            if (r.height > 0 && r.width > 0) return d;
        }
        return null;
    }

    function botonDeConfirmar(dlg) {
        var botones = dlg.querySelectorAll('input[type="button"], input[type="submit"], button');
        for (var i = 0; i < botones.length; i++) {
            var txt = (botones[i].value || botones[i].textContent || '').trim().toLowerCase();
            if (/^(s[ií]|yes|continuar|aceptar|eliminar|borrar|confirmar)$/.test(txt)) return botones[i];
        }
        return dlg.querySelector('input.btn-primary, button.btn-primary');
    }

    function esperarADesaparecer(tr, limiteMs) {
        var pasado = 0;
        return (function ciclo() {
            if (!tr.isConnected) return Promise.resolve(true);
            if (pasado >= limiteMs) return Promise.resolve(false);
            pasado += 120;
            return esperar(120).then(ciclo);
        })();
    }

    async function borrarUno(entrada) {
        var btn = entrada.tr.querySelector('input[name$="[delete]"]:not([name*="[levels]"])');
        if (!btn) return 'sin-boton';

        btn.click();
        await esperar(350);

        var dlg = dialogoVisible();
        if (dlg) {
            var si = botonDeConfirmar(dlg);
            // Si no se identifica el botón de confirmar, se deja el diálogo tal
            // cual para que el usuario decida: nunca se adivina cuál pulsar.
            if (!si) return 'dialogo-desconocido';
            si.click();
            await esperar(300);
        }
        return (await esperarADesaparecer(entrada.tr, 2500)) ? 'ok' : 'no-desaparecio';
    }

    async function borrarSobrantes(lista) {
        var borrados = [], pendientes = [], motivo = null;
        for (var i = 0; i < lista.length; i++) {
            if (motivo) { pendientes.push(lista[i]); continue; }   // ya se abortó
            var res = await borrarUno(lista[i]);
            if (res === 'ok') borrados.push(lista[i]);
            else { motivo = res; pendientes.push(lista[i]); }
        }
        return { borrados: borrados, pendientes: pendientes, motivo: motivo };
    }

    async function terminar() {
        var borrados = [], pendientes = sobrantes, motivo = null;

        if (BORRAR_SOBRANTES && sobrantes.length) {
            var r = await borrarSobrantes(sobrantes);
            borrados = r.borrados; pendientes = r.pendientes; motivo = r.motivo;
        }
        pendientes.forEach(function (e) {
            marcarEnPagina(e.tr, 'BORRAR: ya no viene en el Word', '#c62828');
        });

        var marcado = document.querySelector('.marca-adaptador');
        if (marcado) marcado.scrollIntoView({ behavior: 'smooth', block: 'center' });

        var fin = 'Listo: ' + totalCeldas + ' celdas llenadas.';
        if (borrados.length) fin += '\\n' + borrados.length + ' criterio(s) sobrante(s) borrado(s).';
        if (pendientes.length) {
            fin += '\\n' + pendientes.length + ' criterio(s) marcado(s) en rojo: bórralos con la X.';
            if (motivo === 'dialogo-desconocido') fin += '\\n(Moodle pidió confirmación y no reconocí el botón; te lo dejé abierto.)';
            else if (motivo === 'no-desaparecio') fin += '\\n(El borrado automático no funcionó en este Moodle.)';
        }
        if (faltanNiveles.length) fin += '\\n' + faltanNiveles.length + ' marcado(s) en naranja: les faltan niveles.';
        fin += '\\n\\nRevisa y presiona Guardar. El script no guarda.';
        alert(fin);
    }

    terminar();
})();`.trim();
    }

    /**
     * Verificador (QA). Mismo lector del DOM de Moodle que el script de llenado,
     * pero de SOLO LECTURA: no escribe, no borra, no guarda. Compara lo que hay
     * en la página contra la rúbrica del Word y pinta un informe flotante.
     *
     * Se usa DESPUÉS de guardar: al reabrir "Definir rúbrica" los textareas
     * traen los valores ya guardados, así que verifica lo que quedó de verdad
     * en la base de datos, no lo que se acaba de teclear.
     *
     * Distingue tres grados, en vez de un sí/no que daría falsas alarmas:
     *   · igual             -> coincide carácter por carácter
     *   · solo espacios     -> mismo contenido, distinto espaciado (Moodle y
     *                          Word difieren en saltos y espacios finales)
     *   · DIFIERE           -> el contenido no es el mismo
     */
    function construirScriptQA(DATA) {
        return `
(function() {
    var DATA = ${JSON.stringify(DATA)};
    var ACTIVIDAD = ${JSON.stringify(actividadRubrica || '')};

    function normalizar(s) {
        return (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
            .replace(/\\s+/g, ' ').trim();
    }
    // Para comparar contenido: colapsa espacios y quita el espacio duro que
    // Word mete a menudo, pero respeta mayúsculas y acentos.
    function limpiar(s) {
        return (s || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim();
    }
    // Actividad donde estás (misma lógica que el script de llenado).
    function actividadEnMoodle() {
        // El nombre de la actividad es el TEXTO del enlace a mod/*/view.php dentro
        // del breadcrumb (el atributo title="Tarea" es solo el tipo). Nunca se usa
        // el encabezado ni document.title: en "Definir rúbrica" dirían "Definir
        // rúbrica", no la actividad. Sin dato fiable devuelve '' (no se afirma nada).
        var bcs = [].slice.call(document.querySelectorAll('.breadcrumb, ol.breadcrumb, [aria-label="breadcrumb"]'));
        for (var i = 0; i < bcs.length; i++) {
            var a = [].slice.call(bcs[i].querySelectorAll('a')).filter(function (x) {
                return /\\/mod\\/[a-z]+\\/view\\.php/.test(x.getAttribute('href') || '') && (x.textContent || '').trim();
            });
            if (a.length) return (a[a.length - 1].textContent || '').replace(/\\s+/g, ' ').trim();
        }
        var any = [].slice.call(document.querySelectorAll('a')).filter(function (x) {
            return /\\/mod\\/[a-z]+\\/view\\.php/.test(x.getAttribute('href') || '') && (x.textContent || '').trim();
        });
        return any.length ? (any[0].textContent || '').replace(/\\s+/g, ' ').trim() : '';
    }
    function claveAct(s) {
        s = (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
        if (/proyecto\\s+integrador/.test(s)) return 'pi';
        var m = s.match(/actividad\\s+integradora\\s*(\\d+)/); if (m) return 'ai' + m[1];
        m = s.match(/actividad\\s+formativa\\s*(\\d+)/); if (m) return 'af' + m[1];
        m = s.match(/\\bai[ _-]?(\\d+)/); if (m) return 'ai' + m[1];
        m = s.match(/\\baf[ _-]?(\\d+)/); if (m) return 'af' + m[1];
        if (/\\bpi\\b/.test(s)) return 'pi';
        return '';
    }

    var filas = [].slice.call(document.querySelectorAll('tr.criterion')).filter(function (tr) {
        return tr.querySelector('textarea[name*="[criteria]"][name$="[description]"]');
    });
    if (!filas.length) {
        alert('No encontré la tabla de la rúbrica en esta página.\\n' +
            'Abre "Calificación avanzada > Definir rúbrica" y vuelve a intentar.');
        return;
    }

    var existentes = filas.map(function (tr) {
        var descTA = tr.querySelector('textarea[name*="[criteria]"][name$="[description]"]');
        var niveles = [].slice.call(tr.querySelectorAll('td.level')).map(function (td) {
            var defTA = td.querySelector('textarea[name*="[levels]"][name$="[definition]"]');
            var sc = td.querySelector('input[name*="[levels]"][name$="[score]"]');
            return { td: td, texto: defTA ? defTA.value : '', puntos: sc ? sc.value : '' };
        });
        return { tr: tr, nombre: (descTA.value || '').trim(), niveles: niveles, usado: false };
    });

    function buscar(nombre) {
        var n = normalizar(nombre), i;
        for (i = 0; i < existentes.length; i++)
            if (!existentes[i].usado && normalizar(existentes[i].nombre) === n) {
                existentes[i].usado = true; return existentes[i];
            }
        for (i = 0; i < existentes.length; i++) {
            if (existentes[i].usado) continue;
            var en = normalizar(existentes[i].nombre);
            if (en && n && (en.indexOf(n) !== -1 || n.indexOf(en) !== -1)) {
                existentes[i].usado = true; return existentes[i];
            }
        }
        return null;
    }

    var problemas = [], revisadas = 0, exactas = 0, soloEspacios = 0;
    var criteriosFaltantes = [];

    DATA.forEach(function (crit) {
        var ex = buscar(crit.nombre);
        if (!ex) { criteriosFaltantes.push(crit.nombre); return; }

        crit.niveles.forEach(function (nivel, i) {
            var real = ex.niveles[i];
            if (!real) {
                problemas.push({ criterio: crit.nombre, nivel: i + 1, tipo: 'FALTA EL NIVEL',
                    esperado: nivel.texto, encontrado: '(no existe)', td: null });
                return;
            }
            revisadas++;

            // --- texto
            if (real.texto === nivel.texto) { exactas++; }
            else if (limpiar(real.texto) === limpiar(nivel.texto)) {
                soloEspacios++;
                problemas.push({ criterio: crit.nombre, nivel: i + 1, tipo: 'Solo espacios',
                    esperado: nivel.texto, encontrado: real.texto, td: real.td, leve: true });
            } else {
                problemas.push({ criterio: crit.nombre, nivel: i + 1, tipo: 'TEXTO DISTINTO',
                    esperado: nivel.texto, encontrado: real.texto, td: real.td });
            }

            // --- puntos (se comparan como número: "40" y "40.0" son lo mismo)
            var pEsp = parseFloat(String(nivel.puntos).replace(',', '.'));
            var pReal = parseFloat(String(real.puntos).replace(',', '.'));
            var igualNum = !isNaN(pEsp) && !isNaN(pReal) && Math.abs(pEsp - pReal) < 0.0001;
            if (!igualNum) {
                problemas.push({ criterio: crit.nombre, nivel: i + 1, tipo: 'PUNTOS DISTINTOS',
                    esperado: String(nivel.puntos), encontrado: String(real.puntos), td: real.td });
            }
        });
    });

    var sobrantes = existentes.filter(function (e) { return !e.usado; })
        .map(function (e) { return e.nombre; });

    /* --------------------------------------------------------- informe --- */

    var previo = document.getElementById('qa-rubricas-panel');
    if (previo) previo.remove();
    [].slice.call(document.querySelectorAll('.qa-marca')).forEach(function (m) {
        m.style.outline = ''; m.classList.remove('qa-marca');
    });

    var graves = problemas.filter(function (p) { return !p.leve; });

    problemas.forEach(function (p) {
        if (!p.td) return;
        p.td.style.outline = p.leve ? '2px solid #ef6c00' : '3px solid #c62828';
        p.td.classList.add('qa-marca');
    });

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }
    function recorta(s, n) {
        s = String(s == null ? '' : s);
        return s.length > n ? s.slice(0, n) + '…' : s;
    }

    /* ------------------------------------------- diferencias resaltadas ---
     * Dos muros de texto casi idénticos no dicen DÓNDE está el problema: hay
     * que compararlos palabra por palabra a ojo. Se hace un diff por palabras
     * (LCS) y solo lo que cambia va resaltado en amarillo.
     *
     * Y los espacios se dibujan con símbolos: una diferencia de espaciado es,
     * por definición, invisible —resaltar un espacio en amarillo no se vería—.
     * Es justo el caso de "Solo espacios", que sin esto no hay forma de leer. */
    function trozos(s) { return String(s == null ? '' : s).match(/\\s+|[^\\s]+/g) || []; }

    function juntar(lista, texto, dif) {
        var ultimo = lista[lista.length - 1];
        if (ultimo && ultimo.dif === dif) ultimo.t += texto;
        else lista.push({ t: texto, dif: dif });
    }

    function diffPartes(a, b) {
        var A = trozos(a), B = trozos(b), n = A.length, m = B.length, i, j;
        var dp = [];
        for (i = 0; i <= n; i++) { dp.push([]); for (j = 0; j <= m; j++) dp[i][j] = 0; }
        for (i = n - 1; i >= 0; i--) {
            for (j = m - 1; j >= 0; j--) {
                dp[i][j] = (A[i] === B[j]) ? dp[i + 1][j + 1] + 1
                    : (dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1]);
            }
        }
        var ra = [], rb = [];
        i = 0; j = 0;
        while (i < n && j < m) {
            if (A[i] === B[j]) { juntar(ra, A[i], false); juntar(rb, B[j], false); i++; j++; }
            else if (dp[i + 1][j] >= dp[i][j + 1]) { juntar(ra, A[i], true); i++; }
            else { juntar(rb, B[j], true); j++; }
        }
        while (i < n) { juntar(ra, A[i], true); i++; }
        while (j < m) { juntar(rb, B[j], true); j++; }
        return { a: ra, b: rb };
    }

    function visible(s) {
        return String(s).replace(/\\u00a0/g, '␣').replace(/\\n/g, '⏎')
            .replace(/\\t/g, '⇥').replace(/ /g, '·');
    }

    function pintarDiff(partes) {
        var salida = '', k, p, t;
        for (k = 0; k < partes.length; k++) {
            p = partes[k]; t = p.t;
            if (p.dif) {
                salida += '<mark style="background:#ffe082;color:#000;border-radius:3px;padding:0 2px">' +
                    esc(visible(t)) + '</mark>';
                continue;
            }
            // Los tramos IGUALES largos se recortan: lo que importa es el cambio,
            // no repetir el párrafo entero dos veces en el panel. Se conserva el
            // texto pegado a la diferencia, que es el que se compara a ojo.
            if (t.length > 90) {
                var primero = (k === 0), ultimo = (k === partes.length - 1);
                // Un lado puede no tener diferencias propias (cuando el otro
                // AÑADE algo): ahí el tramo es primero y último a la vez, y
                // recortar solo por el final escondía el inicio de la celda.
                if (primero && ultimo) t = t.slice(0, 45) + ' […] ' + t.slice(-45);
                else if (primero) t = '…' + t.slice(-45);
                else if (ultimo) t = t.slice(0, 45) + '…';
                else t = t.slice(0, 35) + ' […] ' + t.slice(-35);
            }
            salida += esc(t);
        }
        return salida;
    }

    var panel = document.createElement('div');
    panel.id = 'qa-rubricas-panel';
    panel.style.cssText = 'position:fixed;top:12px;right:12px;width:430px;max-height:88vh;overflow:auto;' +
        'z-index:2147483647;background:#fff;color:#222;border-radius:10px;padding:14px 16px;' +
        'box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif;border:1px solid #ddd';

    var estado = graves.length ? 'ERRORES' : (problemas.length ? 'CON AVISOS' : 'TODO CORRECTO');
    var colorEstado = graves.length ? '#c62828' : (problemas.length ? '#ef6c00' : '#2e7d32');

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">' +
        '<strong style="font-size:15px">QA de rúbrica</strong>' +
        '<button id="qa-cerrar" style="border:0;background:#eee;border-radius:6px;padding:4px 9px;cursor:pointer">Cerrar</button></div>';

    html += '<div style="background:' + colorEstado + ';color:#fff;padding:8px 10px;border-radius:7px;font-weight:700;margin-bottom:10px">' +
        estado + '</div>';

    // Identidad: ¿la rúbrica del Word corresponde a la actividad de esta página?
    if (ACTIVIDAD) {
        var actM = actividadEnMoodle();
        var kRubrica = claveAct(ACTIVIDAD), kMoodle = claveAct(actM);
        if (actM && kRubrica && kMoodle && kRubrica !== kMoodle) {
            html += '<div style="background:#fdecea;border-left:3px solid #c62828;padding:8px 10px;border-radius:5px;margin-bottom:10px">' +
                '<strong>\\u26A0 ¿Rúbrica equivocada?</strong><br>Rúbrica (Word): ' + esc(ACTIVIDAD) +
                '<br>Actividad (Moodle): ' + esc(actM) + '</div>';
        } else if (actM) {
            html += '<div style="background:#e8f5e9;border-left:3px solid #2e7d32;padding:8px 10px;border-radius:5px;margin-bottom:10px">' +
                '<strong>Actividad correcta ✓</strong><br>Rúbrica (Word): ' + esc(ACTIVIDAD) +
                '<br>Actividad (Moodle): ' + esc(actM) + '</div>';
        }
    }

    html += '<div style="margin-bottom:10px">' +
        revisadas + ' celdas revisadas · <span style="color:#2e7d32">' + exactas + ' idénticas</span>' +
        (soloEspacios ? ' · <span style="color:#ef6c00">' + soloEspacios + ' solo espacios</span>' : '') +
        (graves.length ? ' · <span style="color:#c62828">' + graves.length + ' con error</span>' : '') +
        '</div>';

    if (criteriosFaltantes.length) {
        html += '<div style="background:#fdecea;border-left:3px solid #c62828;padding:7px 9px;border-radius:5px;margin-bottom:8px">' +
            '<strong>Criterios del Word que no están en Moodle:</strong><br>' +
            criteriosFaltantes.map(esc).join('<br>') + '</div>';
    }
    if (sobrantes.length) {
        html += '<div style="background:#fff4e5;border-left:3px solid #ef6c00;padding:7px 9px;border-radius:5px;margin-bottom:8px">' +
            '<strong>Criterios en Moodle que no vienen en el Word:</strong><br>' +
            sobrantes.map(esc).join('<br>') + '</div>';
    }

    if (!problemas.length && !criteriosFaltantes.length && !sobrantes.length) {
        html += '<div style="background:#e8f5e9;border-left:3px solid #2e7d32;padding:9px;border-radius:5px">' +
            'La rúbrica de Moodle coincide con el Word en todas las celdas.</div>';
    } else if (problemas.length) {
        html += '<strong>Detalle (' + problemas.length + '):</strong>';
        problemas.forEach(function (p) {
            var c = p.leve ? '#ef6c00' : '#c62828';
            html += '<div style="border-left:3px solid ' + c + ';padding:6px 9px;margin:7px 0;background:#fafafa;border-radius:5px">' +
                '<div style="font-weight:700;color:' + c + '">' + esc(p.criterio) + ' · nivel ' + p.nivel + ' · ' + esc(p.tipo) + '</div>';
            if (p.tipo === 'FALTA EL NIVEL') {
                html += '<div style="margin-top:3px"><span style="color:#666">Word:</span> ' + esc(recorta(p.esperado, 160)) + '</div>' +
                    '<div><span style="color:#666">Moodle:</span> (no existe)</div>';
            } else {
                var d = diffPartes(p.esperado, p.encontrado);
                html += '<div style="margin-top:3px"><span style="color:#666">Word:</span> ' + pintarDiff(d.a) + '</div>' +
                    '<div><span style="color:#666">Moodle:</span> ' + pintarDiff(d.b) + '</div>';
            }
            html += '</div>';
        });
        html += '<div style="margin-top:10px;color:#666">Las celdas con diferencia quedaron recuadradas en la página ' +
            '(rojo = error, naranja = solo espacios). En el detalle, lo ' +
            '<mark style="background:#ffe082;color:#000;border-radius:3px;padding:0 2px">resaltado</mark> ' +
            'es justo lo que cambia. Espacios: <code>·</code> normal · <code>␣</code> duro (nbsp) · ' +
            '<code>⏎</code> salto de línea · <code>⇥</code> tabulador.</div>';
    }

    panel.innerHTML = html;
    document.body.appendChild(panel);
    document.getElementById('qa-cerrar').addEventListener('click', function () {
        [].slice.call(document.querySelectorAll('.qa-marca')).forEach(function (m) {
            m.style.outline = ''; m.classList.remove('qa-marca');
        });
        panel.remove();
    });

    var primera = document.querySelector('.qa-marca');
    if (primera) primera.scrollIntoView({ behavior: 'smooth', block: 'center' });
})();`.trim();
    }

    function pintarQA(codigo) {
        qaEmpty.classList.add('hidden');
        qaResultado.classList.remove('hidden');
        const bookmarklet = 'javascript:' + encodeURIComponent(codigo);

        qaResultado.innerHTML = `
            <div class="aviso aviso-info">
                <i class="ph ph-shield-check"></i>
                <span><strong>Verificador de solo lectura.</strong> Úsalo <strong>después de guardar</strong>:
                reabre <em>Definir rúbrica</em> y ejecútalo. Compara celda por celda lo que quedó guardado en
                Moodle contra tu Word, y pinta un informe flotante en la misma página.
                <strong>No escribe, no borra y no guarda nada.</strong></span>
            </div>

            <div class="opcion-entrega">
                <h3><i class="ph ph-bookmark-simple"></i> Opción A — Marcador</h3>
                <p class="campo-nota">Arrástralo a tus marcadores y púlsalo estando en la rúbrica ya guardada.</p>
                <a class="btn-secondary bookmarklet-link" href="${escapar(bookmarklet)}"
                   onclick="return false;" title="Arrastra esto a tus marcadores">
                   <i class="ph ph-shield-check"></i> Verificar rúbrica
                </a>
            </div>

            <div class="opcion-entrega">
                <h3><i class="ph ph-terminal-window"></i> Opción B — Pegar en la consola</h3>
                <p class="campo-nota">F12 → <em>Console</em>. Si Chrome bloquea el pegado, escribe
                    <code>allow pasting</code>, Enter, y vuelve a pegar.</p>
                <div class="code-wrapper">
                    <button class="btn-icon js-copiar-qa" title="Copiar"><i class="ph ph-copy"></i></button>
                    <textarea class="code-output" readonly>${escapar(codigo)}</textarea>
                </div>
                <button class="btn-secondary btn-chico js-copiar-qa" type="button">
                    <i class="ph ph-copy"></i> Copiar verificador
                </button>
            </div>`;

        qaResultado.querySelectorAll('.js-copiar-qa').forEach(btn => {
            btn.addEventListener('click', () => {
                const ta = qaResultado.querySelector('.code-output');
                navigator.clipboard.writeText(ta.value).then(() => {
                    const icono = btn.querySelector('i');
                    const previa = icono.className;
                    icono.className = 'ph ph-check';
                    setTimeout(() => { icono.className = previa; }, 1200);
                }).catch(() => {
                    ta.focus(); ta.select();
                    alert('No se pudo copiar solo. El texto ya quedó seleccionado: usa Ctrl+C.');
                });
            });
        });
    }

    function pintarScript(codigo) {
        scriptEmpty.classList.add('hidden');
        scriptResultado.classList.remove('hidden');
        const bookmarklet = 'javascript:' + encodeURIComponent(codigo);

        scriptResultado.innerHTML = `
            <div class="aviso aviso-ok">
                <i class="ph ph-check-circle"></i>
                <span><strong>Listo.</strong> Abre tu rúbrica en Moodle → <em>Calificación avanzada → Definir
                rúbrica</em> y usa una de las dos opciones. El script <strong>solo llena texto y puntos en cajas
                que ya existen</strong>: nunca agrega, borra ni guarda. Antes de escribir te muestra un resumen
                de lo que hará y puedes cancelar.</span>
            </div>

            <div class="opcion-entrega">
                <h3><i class="ph ph-bookmark-simple"></i> Opción A — Marcador (recomendado)</h3>
                <p class="campo-nota">Arrastra este botón a tu barra de marcadores. Luego, estando en la página de
                    la rúbrica, haz clic en el marcador. Sirve para todas las rúbricas: genera uno por rúbrica.</p>
                <a class="btn-secondary bookmarklet-link" href="${escapar(bookmarklet)}"
                   onclick="return false;" title="Arrastra esto a tus marcadores">
                   <i class="ph ph-magic-wand"></i> Llenar rúbrica
                </a>
            </div>

            <div class="opcion-entrega">
                <h3><i class="ph ph-terminal-window"></i> Opción B — Pegar en la consola</h3>
                <p class="campo-nota">F12 → pestaña <em>Console</em>. Chrome bloquea el pegado la primera vez:
                    pega, y cuando salga el aviso escribe <code>allow pasting</code>, Enter, y vuelve a pegar.</p>
                <div class="code-wrapper">
                    <button class="btn-icon js-copiar-script" title="Copiar"><i class="ph ph-copy"></i></button>
                    <textarea class="code-output" readonly>${escapar(codigo)}</textarea>
                </div>
                <button class="btn-secondary btn-chico js-copiar-script" type="button">
                    <i class="ph ph-copy"></i> Copiar script
                </button>
            </div>`;

        scriptResultado.querySelectorAll('.js-copiar-script').forEach(btn => {
            btn.addEventListener('click', () => {
                const ta = scriptResultado.querySelector('.code-output');
                navigator.clipboard.writeText(ta.value).then(() => {
                    const icono = btn.querySelector('i');
                    const previa = icono.className;
                    icono.className = 'ph ph-check';
                    setTimeout(() => { icono.className = previa; }, 1200);
                }).catch(() => {
                    ta.focus(); ta.select();
                    alert('No se pudo copiar solo. El texto ya quedó seleccionado: usa Ctrl+C.');
                });
            });
        });
    }

    function escapar(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }
});
