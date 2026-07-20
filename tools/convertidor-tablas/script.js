/* mapaDeColumnas(), titulosPorColumna() y traeEstiloPropio() viven en
   assets/tablas.js, compartidas con Micrositio a Página. */

document.addEventListener('DOMContentLoaded', () => {
    const pasteArea = document.getElementById('paste-area');
    const btnProcess = document.getElementById('btn-process');
    const previewContainer = document.getElementById('preview-container');
    const previewEmpty = document.getElementById('preview-empty');
    const outputCode = document.getElementById('output-code');
    const btnCopy = document.getElementById('btn-copy');
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const optBordered = document.getElementById('opt-bordered');
    const optAltColors = document.getElementById('opt-alt-colors');
    const optHeaderColor = document.getElementById('opt-header-color');
    const optMoodleWrap = document.getElementById('opt-moodle-wrap');

    let globalTempDiv = null;
    let globalOriginalTable = null;

    pasteArea.addEventListener('input', () => {
        btnProcess.disabled = pasteArea.innerHTML.trim() === '';
    });

    pasteArea.addEventListener('paste', (e) => {
        setTimeout(() => {
            btnProcess.disabled = pasteArea.innerHTML.trim() === '';
        }, 10);
    });

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(`${tab.dataset.target}-content`).classList.add('active');
        });
    });

    btnProcess.addEventListener('click', () => {
        const rawHTML = pasteArea.innerHTML;
        
        globalTempDiv = document.createElement('div');
        globalTempDiv.innerHTML = rawHTML;

        let tabla = globalTempDiv.querySelector('table');

        // Si no hay tabla como nodo, es que pegaron el HTML como texto (código
        // crudo): el contenteditable lo guarda escapado (&lt;table&gt;…), así que
        // reinterpretamos ese texto como HTML y volvemos a buscar.
        if (!tabla) {
            const comoTexto = globalTempDiv.textContent;
            if (/<table[\s\S]*<\/table>/i.test(comoTexto)) {
                globalTempDiv.innerHTML = comoTexto;
                tabla = globalTempDiv.querySelector('table');
            }
        }

        if (!tabla) {
            alert("⚠️ No se detectó ninguna tabla en el texto pegado.");
            return;
        }

        // Limpiar estilos en línea inyectados por el navegador al copiar.
        // OJO: solo en tablas "desnudas" (Word), donde los style son basura. Si la
        // tabla ya llega maquetada, esos style son DELIBERADOS (los `width: 25%` de
        // los <th>, por ejemplo) y borrarlos descuadraba las columnas.
        const traeDiseno = traeEstiloPropio(tabla);
        globalTempDiv.querySelectorAll('*').forEach(el => {
            if (!traeDiseno) el.removeAttribute('style');
            // A veces Moodle/Chrome inyecta atributos raros al copiar, los quitamos por si acaso
            el.removeAttribute('data-darkreader-inline-color');
            el.removeAttribute('data-darkreader-inline-bgcolor');
        });

        globalOriginalTable = tabla;

        // Al pegar código con indentación, según el navegador esos espacios se
        // vuelven &nbsp; (por eso a unos les pasa y a otros no). El parser de
        // tablas expulsa ese texto suelto FUERA de la tabla (foster parenting), y
        // como conservamos lo que la rodea para no perder títulos, ese bloque de
        // &nbsp; se colaba en la salida. Quitamos los nodos de texto que son solo
        // espacios/nbsp y no están dentro de una celda (ahí sí puede ser querido).
        const enCelda = (nodo) => {
            for (let p = nodo.parentElement; p; p = p.parentElement) {
                if (p.tagName === 'TD' || p.tagName === 'TH') return true;
            }
            return false;
        };
        // .trim() en JS también elimina el &nbsp;, así que un nodo que quede
        // vacío tras recortar es puro relleno.
        const paseo = document.createTreeWalker(globalTempDiv, NodeFilter.SHOW_TEXT);
        const basura = [];
        for (let n = paseo.nextNode(); n; n = paseo.nextNode()) {
            if (!n.textContent.trim() && !enCelda(n)) basura.push(n);
        }
        basura.forEach(n => n.remove());

        // Normaliza el espacio DENTRO de las celdas con texto. Al pegar código
        // indentado, ese sangrado se vuelve &nbsp; pegado al texto; y como
        // innerHTML serializa el nbsp como la entidad "&nbsp;" (empieza por '&'),
        // un .trim() sobre el string ya no lo quita y la celda queda desalineada
        // (sobre todo la 1ª columna y los <th> centrados). Aquí se arregla en el
        // DOM, donde el nbsp sí es un espacio de verdad. Las celdas vacías (solo
        // espacios) NO se tocan: ese &nbsp; les da altura en escritorio.
        globalTempDiv.querySelectorAll('td, th').forEach(celda => {
            if (!celda.textContent.trim()) return;
            const textos = [];
            const w = document.createTreeWalker(celda, NodeFilter.SHOW_TEXT);
            for (let t = w.nextNode(); t; t = w.nextNode()) textos.push(t);
            textos.forEach(t => { t.textContent = t.textContent.replace(/\s+/g, ' '); });
            textos[0].textContent = textos[0].textContent.replace(/^\s+/, '');
            const ult = textos[textos.length - 1];
            ult.textContent = ult.textContent.replace(/\s+$/, '');
        });

        tabs[0].click();
        previewEmpty.classList.add('hidden');
        previewContainer.classList.remove('hidden');
        
        // Colores fijos y no tokens: este banner vive dentro de .preview-container,
        // que es una isla clara en ambos temas. Con var(--accent) el texto blanco
        // perdería contraste en modo oscuro.
        previewContainer.innerHTML = `
            <div style="background-color: #0066cc; color: white; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px; animation: pulse 2s infinite;">
                <i class="ph ph-cursor-click"></i> PASO 2: Haz clic sobre la fila de la tabla que contiene los TÍTULOS (data-labels)
            </div>
        `;
        
        const selectionTable = document.createElement('table');
        selectionTable.className = "selection-table table";
        selectionTable.innerHTML = globalOriginalTable.innerHTML;
        
        const rows = selectionTable.querySelectorAll('tr');
        rows.forEach((row, index) => {
            row.addEventListener('click', () => {
                generateFinalTable(globalOriginalTable, index);
            });
        });
        
        // Muestra también los elementos que estaban fuera de la tabla (ej. títulos)
        const previewWrap = globalTempDiv.cloneNode(true);
        const oldTable = previewWrap.querySelector('table');
        oldTable.parentNode.replaceChild(selectionTable, oldTable);
        
        previewContainer.appendChild(previewWrap);
    });

    /**
     * ANOTA la tabla en su sitio; NO la reconstruye.
     *
     * Antes se armaba una tabla nueva con createElement copiando solo el texto,
     * y todo lo que no se reconstruía explícitamente se perdía: la fila de
     * título con colspan, los bg-primary-10 de los <th>, los width en %, los
     * rowspan, los align-middle… La herramienta es para AGREGAR las tarjetas
     * (data-label + tabla-responsive-cards); el diseño ya vive en la hoja de
     * Moodle y hay que respetarlo tal cual llega.
     */
    function generateFinalTable(sourceTable, headerIndex) {
        const outputDiv = globalTempDiv.cloneNode(true);
        const tabla = outputDiv.querySelector('table');
        if (!tabla) return;

        const filas = Array.from(tabla.querySelectorAll('tr'));
        const headerRow = filas[headerIndex];
        if (!headerRow) return;

        const mapa = mapaDeColumnas(filas);
        const conEstilo = traeEstiloPropio(sourceTable);
        // Los toggles solo actúan sobre tablas "desnudas" (Word). Si la tabla ya
        // llega maquetada, pintarle encima le cambiaría el color que eligió su autor.
        const pintar = !conEstilo;

        const titulos = titulosPorColumna(headerRow, mapa);

        // Cuerpo: lo que va DESPUÉS de la fila de títulos. Las filas anteriores
        // (p. ej. un título con colspan) se quedan intactas y sin data-label.
        let indiceCuerpo = 0;
        filas.slice(headerIndex + 1).forEach(fila => {
            const celdas = Array.from(fila.children)
                .filter(n => n.tagName === 'TD' || n.tagName === 'TH');
            if (!celdas.length) return;

            celdas.forEach(celda => {
                const pos = mapa.get(celda);
                if (pos && titulos[pos.col]) celda.setAttribute('data-label', titulos[pos.col]);
            });

            if (pintar && optAltColors.checked) {
                const primera = celdas[0];
                if (primera) {
                    primera.classList.add(indiceCuerpo % 2 === 0 ? 'bg-primary-10' : 'bg-secondary-10');
                }
            }
            indiceCuerpo++;
        });

        // Lo único que se agrega siempre: las clases que activan las tarjetas.
        tabla.classList.add('table', 'tabla-responsive-cards');

        if (pintar) {
            // Word entrega la fila de títulos como <td> sueltos dentro del tbody.
            // La promovemos a <thead> con <th scope="col">, que es lo semántico y
            // lo que hace que los lectores de pantalla anuncien la columna. En una
            // tabla que ya llega maquetada NO se toca: su autor ya decidió.
            if (!tabla.querySelector('thead')) {
                const thead = document.createElement('thead');
                thead.className = 'thead';
                Array.from(headerRow.children).forEach(celda => {
                    if (celda.tagName === 'TH') return;
                    const th = document.createElement('th');
                    th.setAttribute('scope', 'col');
                    th.className = 'text-center align-middle';
                    if (celda.getAttribute('colspan')) th.setAttribute('colspan', celda.getAttribute('colspan'));
                    if (celda.getAttribute('rowspan')) th.setAttribute('rowspan', celda.getAttribute('rowspan'));
                    th.innerHTML = celda.innerHTML;
                    celda.replaceWith(th);
                });
                thead.appendChild(headerRow);
                tabla.insertBefore(thead, tabla.firstChild);
            }

            if (optBordered.checked) tabla.classList.add('table-bordered', 'border-neutral');
            if (optHeaderColor && optHeaderColor.checked) {
                // Solo la CLASE, nunca un hex: el color lo resuelve el módulo de la
                // página en Moodle (MM, M01, M02…). Aquí había un
                // background-color:#d8a7b6 !important inline —el rosa de MM— que
                // pintaba del color equivocado cualquier página de otro módulo.
                // Mismo bug que ya se quitó en Micrositio a Página (REGLAS.md §6-bis).
                const thead = tabla.querySelector('thead');
                (thead && thead.contains(headerRow) ? thead : headerRow)
                    .classList.add('bg-primary-20');
            }
        }

        // Colores fijos, no tokens: el banner vive en .preview-container, isla clara.
        previewContainer.innerHTML = `
            <div style="background-color: #1e8e3e; color: white; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="ph ph-check-circle"></i> ¡Tabla Procesada Correctamente!
            </div>
            <div style="background-color: ${conEstilo ? '#e7f1ff' : '#fff4e5'}; color: #333; padding: 10px 12px; border-radius: 8px; margin-bottom: 15px; font-size: 14px;">
                ${conEstilo
                    ? '<strong>La tabla ya traía su propio diseño.</strong> Se conservó tal cual (encabezados, colores, anchos, colspan y rowspan) y solo se le agregaron las tarjetas. Los toggles de color no se aplicaron.'
                    : '<strong>La tabla llegó sin diseño</strong> (típico de Word), así que se le aplicaron los toggles de color que tengas encendidos.'}
            </div>
        `;
        previewContainer.appendChild(outputDiv);

        let finalOutputHTML = outputDiv.innerHTML;

        if (optMoodleWrap && optMoodleWrap.checked) {
            // Antes se buscaba 'class="row' como texto. Si la tabla ya venía en su
            // propio contenedor (col-12 > .table-responsive, como el HTML de una
            // página nuestra), no había 'row' y se envolvía otra vez: quedaba un
            // .table-responsive dentro de otro. Ahora se revisa en el DOM.
            const yaEnvuelta = outputDiv.querySelector('.row, .table-responsive');
            if (!yaEnvuelta) {
                finalOutputHTML = `
<!-- Contenedor Moodle -->
<div class="row bloque mt-3">
  <div class="col-12">
    <div class="table-responsive">
      ${finalOutputHTML}
    </div>
  </div>
</div>`;
            }
        }
        
        let beautifiedHTML = formatHTML(finalOutputHTML);
        outputCode.value = beautifiedHTML;
        
        tabs[1].click();
    }

    function formatHTML(html) {
        let formatted = '';
        let indent = '';
        
        html.split(/>\s*</).forEach(function(element) {
            if (element.match(/^\/\w/)) {
                indent = indent.substring(4);
            }
            
            formatted += indent + '<' + element + '>\r\n';
            
            if (element.match(/^<?\w[^>]*[^\/]$/) && !element.startsWith("input") && !element.startsWith("img") && !element.startsWith("br")) {
                indent += '    ';
            }
        });
        
        return formatted.substring(1, formatted.length - 3).trim();
    }

    btnCopy.addEventListener('click', () => {
        outputCode.select();
        document.execCommand('copy');
        
        const icon = btnCopy.querySelector('i');
        icon.className = 'ph ph-check';
        icon.style.color = 'var(--success)';
        
        setTimeout(() => {
            icon.className = 'ph ph-copy';
            icon.style.color = '';
        }, 2000);
    });
});
