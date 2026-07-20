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

    let estructura = null;   // estructura neutral de la tabla elegida
    let matriz = null;       // resultado del análisis
    // Los dos encendidos por defecto:
    //  · anteponerNivel: en las rúbricas reales el primer criterio lleva el
    //    nombre del nivel ("EXPERTO\n\nUtiliza hojas de cálculo…").
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
                    <small>(solo en el primer criterio: "EXPERTO", "CAPACITADO"… como en tus rúbricas)</small></span>
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
            <button id="btn-generar" class="btn-primary mt-4">
                <i class="ph ph-magic-wand"></i> Generar script para Moodle
            </button>`;

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

    function generarScript() {
        const incluidos = matriz.criterios.filter(c => c.incluir);
        if (!incluidos.length) {
            alert('No hay ningún criterio marcado para actualizar.');
            return;
        }
        const faltaPuntos = incluidos.some(c => c.celdas.some(x => x.puntos === ''));
        if (faltaPuntos) {
            alert('Todavía hay celdas sin puntaje. Complétalas en la vista previa antes de generar el script.');
            return;
        }

        // El nombre del nivel (EXPERTO, CAPACITADO…) se antepone SOLO en el
        // primer criterio. No es un capricho: así están las rúbricas reales en
        // Moodle —Cognitivo lleva "EXPERTO\n\nUtiliza…" y Actitudinal,
        // Comunicativo y Pensamiento crítico van sin nombre— porque en el Word
        // esos nombres viven en el encabezado de la tabla y solo hacen falta una
        // vez, como referencia de la columna.
        const DATA = incluidos.map((crit, ci) => ({
            nombre: crit.nombre,
            niveles: crit.celdas.map((cel, li) => ({
                texto: (anteponerNivel && ci === 0 && matriz.niveles[li])
                    ? `${matriz.niveles[li]}\n\n${cel.texto}`
                    : cel.texto,
                puntos: cel.puntos   // string, tal cual venía del Word
            }))
        }));

        pintarScript(construirScriptInyectable(DATA));
        activarTab('script');
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

    function normalizar(s) {
        return (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
            .replace(/\\s+/g, ' ').trim();
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
