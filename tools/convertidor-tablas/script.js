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

        // Limpiar estilos en línea inyectados por el navegador al copiar
        globalTempDiv.querySelectorAll('*').forEach(el => {
            el.removeAttribute('style');
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

    function generateFinalTable(sourceTable, headerIndex) {
        const newTable = document.createElement('table');
        newTable.className = "table tabla-responsive-cards";
        if (optBordered.checked) {
            newTable.classList.add("table-bordered", "border-neutral");
        }
        
        const allSourceRows = Array.from(sourceTable.querySelectorAll('tr'));
        const headerRow = allSourceRows[headerIndex];
        
        if (!headerRow) return;
        
        const thead = document.createElement('thead');
        thead.className = "thead bg-primary-20";
        const newHeaderRow = document.createElement('tr');
        
        const headers = [];
        const headerCells = headerRow.querySelectorAll('th, td');
        
        headerCells.forEach(cell => {
            let text = cell.innerText || cell.textContent || "";
            text = text.trim().replace(/\s+/g, ' '); 
            headers.push(text);
            
            const th = document.createElement('th');
            th.scope = "col";
            th.className = "text-center align-middle";
            th.textContent = text;
            newHeaderRow.appendChild(th);
        });
        
        thead.appendChild(newHeaderRow);
        newTable.appendChild(thead);
        
        const tbody = document.createElement('tbody');
        const dataRows = allSourceRows.slice(headerIndex + 1);
        
        dataRows.forEach((row, rowIndex) => {
            const newRow = document.createElement('tr');
            newRow.className = "align-middle";
            
            const cells = Array.from(row.querySelectorAll('td, th'));
            
            cells.forEach((cell, cellIndex) => {
                const newCell = document.createElement('td');
                
                if (cellIndex === 0 && optAltColors.checked) {
                    if (rowIndex % 2 === 0) {
                        newCell.className = "bg-primary-10";
                    } else {
                        newCell.className = "bg-secondary-10";
                    }
                }
                
                if (headers[cellIndex]) {
                    newCell.setAttribute('data-label', headers[cellIndex]);
                }
                
                const cleanContent = document.createElement('div');
                cleanContent.innerHTML = cell.innerHTML;
                
                const elements = cleanContent.querySelectorAll('*');
                elements.forEach(el => {
                    el.removeAttribute('style');
                    el.removeAttribute('class');
                    el.removeAttribute('lang');
                    el.removeAttribute('dir');
                    el.removeAttribute('valign');
                    el.removeAttribute('width');
                });
                
                newCell.innerHTML = cleanContent.innerHTML.trim();
                newRow.appendChild(newCell);
            });
            
            tbody.appendChild(newRow);
        });
        
        newTable.appendChild(tbody);
        
        // Reemplazar la tabla original en el contenedor completo para no perder el título
        const outputDiv = globalTempDiv.cloneNode(true);
        const oldTableToReplace = outputDiv.querySelector('table');
        oldTableToReplace.parentNode.replaceChild(newTable, oldTableToReplace);
        
        previewContainer.innerHTML = `
            <div style="background-color: #1e8e3e; color: white; padding: 12px; border-radius: 8px; margin-bottom: 15px; font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 8px;">
                <i class="ph ph-check-circle"></i> ¡Tabla Procesada Correctamente!
            </div>
        `;
        previewContainer.appendChild(outputDiv);
        
        let finalOutputHTML = outputDiv.innerHTML;
        
        if (optMoodleWrap && optMoodleWrap.checked) {
            if (!finalOutputHTML.includes('class="row') && !finalOutputHTML.includes("class='row")) {
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
