/* ========================================================================== 
   Integrador HTML 3.11. El documento es fuente editorial; los bloques son la
   fuente de verdad para HTML, vista previa y QA. Así no pueden divergir.
   ========================================================================== */
(function () {
    // La paleta vive en assets/modulos-311.js (fuente única compartida con el
    // Generador de Bibliografías).
    const MODULOS = MODULOS_311;
    let blocks = [];
    let serial = 0;
    let selectedBlockId = null;
    const $ = (s) => document.querySelector(s);
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const clean = (s) => String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const key = (s) => clean(s).toLocaleLowerCase('es-MX');
    // Las negritas viajan como marcas **texto** (así las entrega el importador
    // y así se pueden teclear a mano). Se convierten DESPUÉS de escapar.
    const negritas = (html) => String(html).replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    // Para el QA y otras comparaciones: el texto como lo mostrará Moodle.
    const sinMarcas = (s) => String(s || '').replace(/\*\*/g, '');

    function init() {
        const modulo = $('#modulo');
        Object.keys(MODULOS).forEach(n => modulo.insertAdjacentHTML('beforeend', `<option value="${n}"${n === '17' ? ' selected' : ''}>Módulo ${n}</option>`));
        actualizarPaleta();
        // renderEditor: los selectores de color de las tablas muestran el color
        // del módulo cuando no hay uno propio, y deben refrescarse al cambiarlo.
        modulo.addEventListener('change', () => { actualizarPaleta(); renderEditor(); actualizar(); });
        $('#titulo').addEventListener('input', actualizar);
        document.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => agregar(b.dataset.add)));
        $('#btn-generate').addEventListener('click', () => { actualizar(); activarTab('code'); });
        $('#btn-generate-qa').addEventListener('click', generarQA);
        $('#btn-copy').addEventListener('click', copiarHTML);
        document.querySelectorAll('.tab-btn').forEach(t => t.addEventListener('click', () => activarTab(t.dataset.target)));
        configurarImportador();
        $('#btn-ampliar-editor').addEventListener('click', alternarEditorAmpliado);
        // Deja una sección inicial para que el flujo sea evidente sin imponer contenido.
        agregar('text');
    }

    function actualizarPaleta() {
        const c = MODULOS[$('#modulo').value];
        $('#paleta').innerHTML = c.map(x => `<i style="background:${x}"></i>`).join('');
    }
    function nuevo(tipo, datos) { return Object.assign({ id: ++serial, tipo, titulo: '', texto: '', href: '', alt: '', encabezados: '', filas: '', tituloTabla: '', colorEncabezado: '', archivoImagen: '', urlLocal: '', alineacion: 'izquierda', tipoLista: 'vinetas', nivelLista: 0, inicioLista: 1 }, datos || {}); }
    function agregar(tipo, datos) {
        const bloque = nuevo(tipo, datos);
        const posicion = selectedBlockId == null ? -1 : blocks.findIndex(b => b.id === selectedBlockId);
        if (posicion < 0) blocks.push(bloque); else blocks.splice(posicion + 1, 0, bloque);
        selectedBlockId = bloque.id;
        renderEditor(); actualizar();
    }
    function borrar(id) { blocks = blocks.filter(b => b.id !== id); if (selectedBlockId === id) selectedBlockId = null; renderEditor(); actualizar(); }
    function seleccionarBloque(id) { selectedBlockId = id; renderEditor(); }
    function alternarEditorAmpliado() {
        const activo = document.querySelector('.integrador-workspace').classList.toggle('editor-ampliado');
        $('#btn-ampliar-editor').innerHTML = activo ? '<i class="ph ph-arrows-in"></i> Reducir edición' : '<i class="ph ph-arrows-out"></i> Ampliar edición';
    }

    function renderEditor() {
        const holder = $('#blocks');
        if (!blocks.length) { holder.innerHTML = '<div class="empty-state"><i class="ph ph-plus-circle"></i><p>Agrega un bloque para empezar.</p></div>'; return; }
        $('#insert-hint').textContent = selectedBlockId == null ? 'Selecciona un bloque para insertar después de él. Sin selección, se agrega al final.' : 'Los botones agregan el nuevo bloque justo después del bloque seleccionado.';
        holder.innerHTML = blocks.map((b, idx) => {
            const head = `<div class="block-head"><i class="ph ${icono(b.tipo)}"></i>${nombre(b.tipo)}<span class="block-tools"><button class="block-move" data-move="${b.id}:-1" title="Subir bloque"${idx === 0 ? ' disabled' : ''}><i class="ph ph-caret-up"></i></button><button class="block-move" data-move="${b.id}:1" title="Bajar bloque"${idx === blocks.length - 1 ? ' disabled' : ''}><i class="ph ph-caret-down"></i></button><button class="block-remove" data-remove="${b.id}" title="Eliminar bloque"><i class="ph ph-trash"></i></button></span></div>`;
            const clase = `block${selectedBlockId === b.id ? ' block--seleccionado' : ''}`;
            if (b.tipo === 'section') return `<article class="${clase}" data-id="${b.id}">${head}<input class="block-field block-title" data-field="titulo" placeholder="Título de sección (ej. Propósito)" value="${esc(b.titulo)}"><textarea class="block-field" data-field="texto" rows="4" placeholder="Contenido de la sección. Un renglón en blanco crea otro párrafo. **texto** = negritas.">${esc(b.texto)}</textarea>${controlAlineacion(b)}</article>`;
            if (b.tipo === 'text') return `<article class="${clase}" data-id="${b.id}">${head}<textarea class="block-field" data-field="texto" rows="5" placeholder="Pega o escribe el texto introductorio... **texto** = negritas.">${esc(b.texto)}</textarea>${controlAlineacion(b)}</article>`;
            if (b.tipo === 'list') return `<article class="${clase}" data-id="${b.id}">${head}<textarea class="block-field" data-field="texto" rows="5" placeholder="Un elemento por renglón">${esc(b.texto)}</textarea><div class="block-controls"><label>Tipo <select class="block-field" data-field="tipoLista"><option value="vinetas"${b.tipoLista==='vinetas'?' selected':''}>Viñetas</option><option value="ordenada"${b.tipoLista==='ordenada'?' selected':''}>Numerada (1, 2)</option><option value="letras"${b.tipoLista==='letras'?' selected':''}>Letras (a, b)</option><option value="romana"${b.tipoLista==='romana'?' selected':''}>Romana (i, ii)</option></select></label><label>Nivel <select class="block-field" data-field="nivelLista"><option value="0"${Number(b.nivelLista)===0?' selected':''}>Principal</option><option value="1"${Number(b.nivelLista)===1?' selected':''}>Segundo</option><option value="2"${Number(b.nivelLista)===2?' selected':''}>Tercero</option></select></label></div><small>Un elemento por renglón. Se conserva la numeración y el nivel del Word. **texto** = negritas.</small></article>`;
            if (b.tipo === 'table') { const paleta = MODULOS[$('#modulo').value]; return `<article class="${clase}" data-id="${b.id}">${head}<div class="table-fields"><input class="block-field" data-field="tituloTabla" placeholder="Fila título que abarca todas las columnas (opcional)" value="${esc(b.tituloTabla)}"><input class="block-field" data-field="encabezados" placeholder="Encabezados separados por tabulador o |" value="${esc(b.encabezados)}"><textarea class="block-field" data-field="filas" rows="4" placeholder="Una fila por renglón; celdas separadas por tabulador o |">${esc(b.filas)}</textarea></div><div class="block-controls"><label>Color de encabezado <input type="color" class="block-field" data-field="colorEncabezado" value="${esc(b.colorEncabezado || paleta[1])}" title="Color de fondo de encabezados y fila título"></label>${b.colorEncabezado ? `<button class="btn-secondary btn-chico" data-color-modulo="${b.id}" type="button">Usar color del módulo</button>` : ''}</div><small>Un encabezado vacío se combina con el anterior (colspan). Un renglón con solo "|" crea una fila vacía de plantilla.</small></article>`; }
            if (b.tipo === 'image') return `<article class="${clase}" data-id="${b.id}">${head}${b.urlLocal ? `<div class="img-word"><img src="${esc(b.urlLocal)}" alt=""><div class="img-word-info"><strong>${esc(b.archivoImagen)}</strong> viene del Word.<span>Descárgala y arrástrala al editor de Moodle: el HTML ya la llama por su nombre (@@PLUGINFILE@@). Si prefieres URL, pégala abajo.</span><a class="btn-secondary btn-chico" href="${esc(b.urlLocal)}" download="${esc(b.archivoImagen)}"><i class="ph ph-download-simple"></i> Descargar imagen</a></div></div>` : ''}<input class="block-field" data-field="href" placeholder="${b.urlLocal ? 'URL en Moodle (opcional: sin URL se usa @@PLUGINFILE@@)' : 'URL de la imagen'}" value="${esc(b.href)}"><input class="block-field" data-field="alt" placeholder="Texto alternativo" value="${esc(b.alt)}"></article>`;
            return `<article class="${clase}" data-id="${b.id}">${head}<input class="block-field" data-field="texto" placeholder="Texto visible del enlace" value="${esc(b.texto)}"><input class="block-field" data-field="href" placeholder="https://..." value="${esc(b.href)}"><small>Se generará con target="_blank".</small></article>`;
        }).join('');
        holder.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => borrar(Number(b.dataset.remove))));
        holder.querySelectorAll('[data-move]').forEach(btn => btn.addEventListener('click', () => {
            const [id, delta] = btn.dataset.move.split(':').map(Number);
            const i = blocks.findIndex(b => b.id === id), j = i + delta;
            if (i < 0 || j < 0 || j >= blocks.length) return;
            [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
            selectedBlockId = id;
            renderEditor(); actualizar();
        }));
        holder.querySelectorAll('[data-color-modulo]').forEach(btn => btn.addEventListener('click', () => {
            const block = blocks.find(b => b.id === Number(btn.dataset.colorModulo));
            if (block) { block.colorEncabezado = ''; renderEditor(); actualizar(); }
        }));
        holder.querySelectorAll('.block').forEach(b => b.addEventListener('click', (e) => {
            if (e.target.closest('input, textarea, select, button')) return;
            seleccionarBloque(Number(b.dataset.id));
        }));
        holder.querySelectorAll('[data-field]').forEach(input => input.addEventListener('input', e => {
            const block = blocks.find(b => b.id === Number(e.target.closest('.block').dataset.id));
            block[e.target.dataset.field] = e.target.value;
            actualizar();
        }));
        // Al cerrar el selector de color aparece el botón "Usar color del módulo".
        // Se re-renderiza en change (no en input) para no robar el foco al teclear.
        holder.querySelectorAll('[data-field="colorEncabezado"]').forEach(input => input.addEventListener('change', renderEditor));
    }
    function controlAlineacion(b) { return `<div class="block-controls"><label>Alineación <select class="block-field" data-field="alineacion"><option value="izquierda"${b.alineacion==='izquierda'?' selected':''}>Izquierda</option><option value="justificado"${b.alineacion==='justificado'?' selected':''}>Justificada</option><option value="centro"${b.alineacion==='centro'?' selected':''}>Centrada</option><option value="derecha"${b.alineacion==='derecha'?' selected':''}>Derecha</option></select></label></div>`; }
    function icono(t) { return ({section:'ph-text-h-two',text:'ph-text-t',list:'ph-list-bullets',table:'ph-table',image:'ph-image',link:'ph-link'})[t]; }
    function nombre(t) { return ({section:'Sección',text:'Texto',list:'Lista',table:'Tabla',image:'Imagen',link:'Enlace'})[t]; }
    function activarTab(target) { document.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x.dataset.target === target)); document.querySelectorAll('.tab-content').forEach(x => x.classList.toggle('active', x.id === `${target}-content`)); }

    function parrafos(texto, alineacion) {
        const valor = alineacion === 'centro' ? 'center' : (alineacion === 'derecha' ? 'right' : (alineacion === 'justificado' ? 'justify' : 'left'));
        const style = alineacion && alineacion !== 'izquierda' ? ` style="text-align: ${valor};"` : '';
        return String(texto || '').split(/\n\s*\n/).map(clean).filter(Boolean).map(t => `<p${style}>${negritas(esc(t)).replace(/\n/g, '<br>')}</p>`).join('');
    }
    function celdas(linea) { return String(linea || '').split(/\t|\|/).map(clean); }
    // Texto negro o blanco según la luminosidad del fondo: los sombreados del
    // Word suelen ser claros (#dde6f2, #f7bf77) y el blanco fijo era ilegible.
    function contrasteTexto(hex) {
        const h = String(hex || '').replace('#', '');
        if (h.length < 6) return '#ffffff';
        const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16));
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#000000' : '#ffffff';
    }
    function tablaHTML(b, paleta) {
        // Se conservan las filas vacías de plantilla ("| | |"): en las
        // actividades son los renglones que el estudiante debe llenar.
        const headers = celdas(b.encabezados);
        while (headers.length && !headers[headers.length - 1]) headers.pop();
        const rows = String(b.filas || '').split('\n').filter(l => clean(l)).map(celdas);
        const tituloTabla = clean(b.tituloTabla);
        if (!headers.some(Boolean) && !rows.length && !tituloTabla) return '';
        const n = Math.max(headers.length, ...rows.map(r => r.length), 1);
        const fondo = clean(b.colorEncabezado) || paleta[1];
        const th = `style="background-color:${fondo};color:${contrasteTexto(fondo)};text-align:center;"`;
        // Un encabezado vacío se combina con el anterior (colspan), igual que
        // las celdas combinadas del Word ("Clases (rangos de edad)" sobre dos columnas).
        const grupos = [];
        for (let i = 0; i < n; i++) {
            const t = headers[i] || '';
            if (!t && grupos.length) grupos[grupos.length - 1].span++;
            else grupos.push({ t, span: 1 });
        }
        const filaTitulo = tituloTabla ? `<tr><th colspan="${n}" scope="colgroup" ${th}>${esc(tituloTabla)}</th></tr>` : '';
        const filaEncabezados = headers.some(Boolean) ? `<tr>${grupos.map(g => `<th${g.span > 1 ? ` colspan="${g.span}"` : ''} scope="col" ${th}>${esc(g.t) || '&nbsp;'}</th>`).join('')}</tr>` : '';
        const thead = filaTitulo || filaEncabezados ? `<thead>${filaTitulo}${filaEncabezados}</thead>` : '';
        const cuerpo = rows.map(r => `<tr>${Array.from({ length: n }, (_, i) => `<td>${esc(r[i] || '') || '&nbsp;'}</td>`).join('')}</tr>`).join('');
        // Responsive sin depender del CSS del tema 3.11: las tablas anchas van a
        // 100% con un mínimo por columna, y el contenedor scrollea en pantallas
        // chicas en vez de aplastar el texto (el width:0px de Word hacía justo eso).
        // Las angostas quedan centradas a su ancho natural, como en el Word.
        const ancha = n >= 4;
        const estiloTabla = ancha
            ? `border-collapse:collapse;width:100%;min-width:${n * 110}px;`
            : 'border-collapse:collapse;margin:0 auto;min-width:280px;';
        return `<div style="overflow-x:auto;"><table border="1" cellspacing="0" cellpadding="8" style="${estiloTabla}">${thead}<tbody>${cuerpo}</tbody></table></div>`;
    }
    function contenidoBloque(b, paleta, paraPreview) {
        if (b.tipo === 'text' || b.tipo === 'section') return parrafos(b.texto, b.alineacion);
        if (b.tipo === 'list') { const tag = b.tipoLista === 'vinetas' ? 'ul' : 'ol'; const estilo = b.tipoLista === 'letras' ? 'lower-alpha' : (b.tipoLista === 'romana' ? 'lower-roman' : 'decimal'); const reglas = [`padding-left: ${38 + Number(b.nivelLista) * 30}px`, `list-style-type: ${estilo}`]; const start = tag === 'ol' && Number(b.inicioLista) > 1 ? ` start="${Number(b.inicioLista)}"` : ''; return `<${tag}${start} style="${reglas.join('; ')};">${String(b.texto || '').split('\n').map(clean).filter(Boolean).map(x => `<li>${negritas(esc(x))}</li>`).join('')}</${tag}>`; }
        if (b.tipo === 'table') return tablaHTML(b, paleta);
        if (b.tipo === 'image') {
            // Sin URL manual, una imagen importada del Word sale como
            // @@PLUGINFILE@@/nombre: Moodle la resuelve sola cuando el archivo
            // descargado se arrastra al editor (mismo flujo que Micrositio a Página).
            // La vista previa usa la imagen local, que @@PLUGINFILE@@ no puede pintar.
            const src = paraPreview
                ? (b.urlLocal || clean(b.href))
                : (clean(b.href) || (b.archivoImagen ? `@@PLUGINFILE@@/${b.archivoImagen}` : ''));
            return src ? `<p style="text-align:center;"><img src="${esc(src)}" alt="${esc(b.alt)}" style="max-width:100%;height:auto;"></p>` : '';
        }
        if (b.tipo === 'link') return b.href || b.texto ? `<p><a href="${esc(b.href)}" target="_blank">${esc(b.texto || b.href)}</a></p>` : '';
        return '';
    }
    function buildHTML() {
        const m = $('#modulo').value, paleta = MODULOS[m], titulo = clean($('#titulo').value);
        const cuerpo = blocks.filter(b => contenidoBloque(b, paleta) || (b.tipo === 'section' && clean(b.titulo))).map(b => {
            const head = b.tipo === 'section' && clean(b.titulo) ? `<h2 class="prepa-M${m}-subTema"><span>${esc(clean(b.titulo))}</span></h2>` : '';
            return `<div class="prepa-M${m}-bloqueContenidos">${head}<div class="prepa-M${m}-contenidosTexto-Imagen">${contenidoBloque(b, paleta)}</div></div>`;
        }).join('\n');
        return `<div class="prepa-M${m}-body">\n<div class="prepa-M${m}-Tema">\n<h1 class="prepa-M${m}-tituloTema"><span>${esc(titulo)}</span></h1>\n</div>\n${cuerpo}\n</div>`;
    }
    function previewHTML() {
        const m = $('#modulo').value, p = MODULOS[m], title = esc(clean($('#titulo').value) || 'Título de la actividad');
        const cuerpo = blocks.map(b => {
            const content = contenidoBloque(b, p, true); if (!content && !(b.tipo === 'section' && clean(b.titulo))) return '';
            const head = b.tipo === 'section' && clean(b.titulo) ? `<h2 class="subtema" style="background:${p[1]}">${esc(clean(b.titulo))}</h2>` : '';
            return `${head}<div class="content" style="background:${p[2]}">${content}</div>`;
        }).join('');
        return `<div class="moodle-preview" style="background:${p[0]}"><h1 class="tema" style="background:${p[1]}">${title}</h1>${cuerpo}</div>`;
    }
    function actualizar() {
        const hay = blocks.some(b => clean(b.texto) || clean(b.titulo) || clean(b.href) || clean(b.encabezados) || clean(b.filas) || clean(b.tituloTabla) || b.urlLocal);
        $('#code').value = buildHTML();
        $('#preview').innerHTML = previewHTML();
        $('#preview').classList.toggle('hidden', !hay); $('#preview-empty').classList.toggle('hidden', hay);
    }
    function copiarHTML() { const c = $('#code'); if (!c.value.trim()) return; navigator.clipboard.writeText(c.value).then(() => { const i=$('#btn-copy i'); i.className='ph ph-check'; setTimeout(()=>i.className='ph ph-copy',1200); }).catch(()=>{c.focus();c.select();}); }

    function configurarImportador() {
        const input = $('#input-docx'), zone = $('#dropzone');
        zone.addEventListener('click', () => input.click()); input.addEventListener('change', () => input.files[0] && importarWord(input.files[0]));
        ['dragenter','dragover'].forEach(e => zone.addEventListener(e, x => { x.preventDefault(); zone.classList.add('dropzone--active'); }));
        ['dragleave','drop'].forEach(e => zone.addEventListener(e, x => { x.preventDefault(); zone.classList.remove('dropzone--active'); }));
        zone.addEventListener('drop', e => e.dataTransfer.files[0] && importarWord(e.dataTransfer.files[0]));
    }
    async function importarWord(file) {
        if (!/\.docx$/i.test(file.name)) return infoImport('El archivo debe ser .docx.', false);
        try {
            const fuente = await leerBloquesDeDocx(file);
            const imagenesWord = await leerImagenesDeDocx(file);
            // El inicio no es una "página" (Word no guarda páginas fiables): es la primera
            // tabla de una celda, que es exactamente la primera barra gris del formato de actividades.
            const inicio = fuente.findIndex(x => x.tipo === 'tabla' && x.celdas === 1 && x.texto);
            if (inicio < 0) throw new Error('No encontré la primera barra de título (tabla de una celda).');
            const leidos = fuente.slice(inicio);
            const nuevos = []; let actual = null; let esTitulo = true;
            const contadoresLista = new Map();
            leidos.forEach(x => {
                if (x.tipo === 'tabla' && x.celdas === 1) {
                    if (esTitulo) { $('#titulo').value = x.texto; esTitulo = false; actual = nuevo('text'); nuevos.push(actual); }
                    else { actual = nuevo('section', { titulo:x.texto }); nuevos.push(actual); }
                } else if (x.tipo === 'tabla' && x.filas && x.filas.length) {
                    // Tabla real de contenido (caso AI3/PI). Se respeta lo que trae
                    // el Word: celdas combinadas, color de sombreado y filas vacías
                    // de plantilla que el estudiante llenará.
                    nuevos.push(bloqueDesdeTablaWord(x));
                    actual = null;
                } else if (x.tipo === 'parrafo' && x.imagenes && x.imagenes.length && !x.texto) {
                    // Imagen suelta (caso AI4: la tabla pegada como captura). Se
                    // extrae del Word para verla, descargarla y referenciarla.
                    x.imagenes.forEach(id => {
                        const img = imagenesWord.get(id);
                        if (img) nuevos.push(nuevo('image', { archivoImagen: img.nombre, urlLocal: URL.createObjectURL(img.blob) }));
                    });
                    actual = null;
                } else if (x.tipo === 'parrafo' && x.texto) {
                    // Son marcas visuales del formato Word, no contenido que deba llegar a Moodle.
                    const marca = clean(sinMarcas(x.texto)).toLocaleLowerCase('es-MX');
                    if (marca === '<h2>' || marca === '</h2>' || marca.includes('lista numerada')) return;
                    if (x.lista) {
                        const llave = `${x.idLista}:${x.nivelLista}`;
                        const siguiente = (contadoresLista.get(llave) || 0) + 1;
                        let l = nuevos[nuevos.length - 1];
                        if (!l || l.tipo !== 'list' || l.tipoLista !== x.tipoLista || Number(l.nivelLista) !== Number(x.nivelLista) || l.idLista !== x.idLista) {
                            l = nuevo('list', { tipoLista:x.tipoLista, nivelLista:x.nivelLista, idLista:x.idLista, inicioLista:siguiente });
                            nuevos.push(l);
                        }
                        l.texto += (l.texto ? '\n' : '') + x.texto;
                        contadoresLista.set(llave, siguiente);
                        actual = null;
                    }
                    else {
                        if (!actual || (actual.texto && actual.alineacion !== x.alineacion)) { actual = nuevo('text', { alineacion:x.alineacion }); nuevos.push(actual); }
                        if (!actual.texto) actual.alineacion = x.alineacion;
                        actual.texto += (actual.texto ? '\n\n' : '') + x.texto;
                    }
                }
            });
            blocks = nuevos.filter(b => clean(b.texto) || clean(b.titulo) || clean(b.encabezados) || clean(b.filas) || clean(b.tituloTabla) || b.urlLocal);
            selectedBlockId = null; renderEditor(); actualizar();
            $('#dropzone').classList.add('dropzone--loaded');
            const tablas = blocks.filter(b => b.tipo === 'table').length;
            const imagenes = blocks.filter(b => b.tipo === 'image').length;
            const extras = [tablas ? `${tablas} tabla(s)` : '', imagenes ? `${imagenes} imagen(es): descárgalas y arrástralas al editor de Moodle` : ''].filter(Boolean).join(' · ');
            infoImport(`${file.name}: ${blocks.length} bloque(s) creados${extras ? ` (${extras})` : ''}. Revisa tablas, imágenes y enlaces antes de generar.`, true);
        } catch (e) { console.error(e); infoImport(`No se pudo importar: ${e.message}`, false); }
    }
    /* La tabla del Word llega con celdas combinadas (gridSpan) y sombreados.
       Aquí se traduce al modelo del bloque Tabla:
       - cada celda combinada se expande en columnas vacías, que al generar se
         vuelven de nuevo un colspan;
       - una primera fila de una sola celda combinada es la fila título
         (caso "Variable:" del Proyecto Integrador);
       - el color de sombreado del Word se conserva como color de encabezado. */
    function bloqueDesdeTablaWord(x) {
        const filas = x.filas.map(f => f.flatMap(c => [c.texto, ...Array(c.span - 1).fill('')]));
        const total = Math.max(...filas.map(f => f.length), 1);
        let tituloTabla = '', resto = filas;
        if (x.filas.length > 1 && x.filas[0].length === 1 && x.filas[0][0].span >= total) {
            tituloTabla = filas[0][0];
            resto = filas.slice(1);
        }
        const colorEncabezado = (x.filas.flat().find(c => c.fondo) || {}).fondo || '';
        return nuevo('table', {
            tituloTabla,
            colorEncabezado,
            encabezados: (resto[0] || []).join(' | '),
            filas: resto.slice(1).map(f => f.join(' | ')).join('\n')
        });
    }
    function infoImport(msg, ok) { const el=$('#import-info'); el.textContent=msg; el.classList.remove('hidden'); el.style.color=ok?'var(--success)':'var(--danger)'; }

    function datosQA() {
        const textos = [], links = [];
        if (clean($('#titulo').value)) textos.push({ etiqueta:'Título', texto:clean($('#titulo').value), selector:'h1' });
        blocks.forEach((b, n) => {
            const etiqueta = b.tipo === 'section' ? (clean(b.titulo) || `Sección ${n+1}`) : `${nombre(b.tipo)} ${n+1}`;
            if (b.tipo === 'section' && clean(b.titulo)) textos.push({etiqueta:`Encabezado: ${etiqueta}`,texto:clean(b.titulo),selector:'h2'});
            if (b.tipo === 'text' || b.tipo === 'section') String(b.texto||'').split(/\n\s*\n/).map(clean).filter(Boolean).forEach(t => textos.push({etiqueta,texto:sinMarcas(t),selector:'p'}));
            if (b.tipo === 'list') String(b.texto||'').split('\n').map(clean).filter(Boolean).forEach(t => textos.push({etiqueta,texto:sinMarcas(t),selector:'li'}));
            if (b.tipo === 'table') { if (clean(b.tituloTabla)) textos.push({etiqueta:`Tabla ${n+1}`,texto:clean(b.tituloTabla),selector:'th,td'}); celdas(b.encabezados).filter(Boolean).forEach(t=>textos.push({etiqueta:`Tabla ${n+1}`,texto:t,selector:'th,td'})); String(b.filas||'').split('\n').flatMap(celdas).filter(Boolean).forEach(t=>textos.push({etiqueta:`Tabla ${n+1}`,texto:t,selector:'td,th'})); }
            if (b.tipo === 'link' && (clean(b.texto)||clean(b.href))) links.push({etiqueta, texto:clean(b.texto||b.href), href:clean(b.href)});
        }); return { modulo:$('#modulo').value, textos, links };
    }
    /* MUERTA v1: NO se usa. Solo corre la última scriptQA de este archivo (una
       declaración de función posterior sustituye a la anterior). Renombrada para
       que solo exista un scriptQA activo y nadie edite la copia equivocada. */
    function scriptQA_MUERTA_1(data) { return `(function () {
    var DATA = ${JSON.stringify(data)};
    var raiz = document.querySelector('.prepa-M' + DATA.modulo + '-body') || document.querySelector('[class*="prepa-M"][class$="-body"]') || document.querySelector('#region-main') || document.body;
    function limpiar(s) { return String(s || '').replace(/\\u00a0/g, ' ').replace(/\\s+/g, ' ').trim(); }
    function clave(s) { return limpiar(s).toLocaleLowerCase('es-MX'); }
    var nodos = Array.prototype.slice.call(raiz.querySelectorAll('h1,h2,p,li,td,th')).map(function(n){return {n:n,t:limpiar(n.textContent),usado:false};});
    function encontrar(item) { var k=clave(item.texto), candidatos=nodos.filter(function(x){return !x.usado && (!item.selector || x.n.matches(item.selector));}); var x=candidatos.find(function(x){return x.t===limpiar(item.texto);}) || candidatos.find(function(x){return clave(x.t)===k;}); if(x)x.usado=true; return x; }
    var faltan=[], encontrados=0, links=[];
    DATA.textos.forEach(function(item){var x=encontrar(item); if(x)encontrados++; else faltan.push(item);});
    DATA.links.forEach(function(item){var anclas=Array.prototype.slice.call(raiz.querySelectorAll('a')); var a=anclas.find(function(a){return clave(a.textContent)===clave(item.texto);}); if(!a){links.push({item:item,error:'No aparece el enlace'});return;} var h=limpiar(a.getAttribute('href')); var esperado=limpiar(item.href); var archivo=function(x){return (x.split('?')[0].split('/').pop()||'').toLowerCase();}; var coincide=h===esperado || (archivo(h)&&archivo(h)===archivo(esperado)); if(!coincide)links.push({item:item,error:'URL distinta',pagina:h}); else if((a.getAttribute('target')||'').toLowerCase()!=='_blank')links.push({item:item,error:'No abre en pestaña nueva',pagina:h});});
    Array.prototype.slice.call(document.querySelectorAll('.integrador-qa-marca')).forEach(function(n){n.style.outline='';n.classList.remove('integrador-qa-marca');});
    var panelViejo=document.getElementById('integrador-qa-panel');if(panelViejo)panelViejo.remove();
    function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
    faltan.forEach(function(item){var candidatos=nodos.filter(function(x){return x.n.matches(item.selector||'*');});if(candidatos[0]){candidatos[0].n.style.outline='3px solid #c62828';candidatos[0].n.classList.add('integrador-qa-marca');}});
    var errores=faltan.length+links.length, estado=errores?'ERRORES':'TODO CORRECTO', color=errores?'#c62828':'#2e7d32';
    var panel=document.createElement('div');panel.id='integrador-qa-panel';panel.style.cssText='position:fixed;top:12px;right:12px;width:430px;max-height:88vh;overflow:auto;z-index:2147483647;background:#fff;color:#222;border:1px solid #ddd;border-radius:10px;padding:14px 16px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif';
    var html='<div style="display:flex;justify-content:space-between;margin-bottom:10px"><strong style="font-size:15px">QA de actividad</strong><button id="integrador-qa-cerrar" style="border:0;background:#eee;border-radius:6px;padding:4px 9px;cursor:pointer">Cerrar</button></div><div style="background:'+color+';color:#fff;padding:8px 10px;border-radius:7px;font-weight:700;margin-bottom:10px">'+estado+'</div><div>'+DATA.textos.length+' textos esperados · '+encontrados+' correctos · '+DATA.links.length+' enlaces revisados</div>';
    if(!errores) html+='<div style="margin-top:10px;background:#e8f5e9;border-left:3px solid #2e7d32;padding:9px;border-radius:5px">Los textos y enlaces coinciden con lo generado.</div>';
    if(faltan.length) html+='<h4 style="margin:12px 0 5px;color:#c62828">Textos faltantes o distintos ('+faltan.length+')</h4>'+faltan.map(function(x){return '<div style="border-left:3px solid #c62828;padding:5px 8px;margin:5px 0;background:#fff5f5"><strong>'+esc(x.etiqueta)+'</strong><br>'+esc(x.texto)+'</div>';}).join('');
    if(links.length) html+='<h4 style="margin:12px 0 5px;color:#c62828">Enlaces con problema ('+links.length+')</h4>'+links.map(function(x){return '<div style="border-left:3px solid #c62828;padding:5px 8px;margin:5px 0;background:#fff5f5"><strong>'+esc(x.error)+': '+esc(x.item.texto)+'</strong><br>Esperado: '+esc(x.item.href)+(x.pagina?'<br>En página: '+esc(x.pagina):'')+'</div>';}).join('');
    panel.innerHTML=html;document.body.appendChild(panel);document.getElementById('integrador-qa-cerrar').onclick=function(){Array.prototype.slice.call(document.querySelectorAll('.integrador-qa-marca')).forEach(function(n){n.style.outline='';n.classList.remove('integrador-qa-marca');});panel.remove();};var primera=document.querySelector('.integrador-qa-marca');if(primera)primera.scrollIntoView({behavior:'smooth',block:'center'});
})();`; }
    function generarQA() { const data=datosQA(); if(!data.textos.length && !data.links.length){alert('Agrega contenido antes de generar el QA.');return;} const code=scriptQA(data), bookmark='javascript:'+encodeURIComponent(code); $('#qa-empty').classList.add('hidden'); const out=$('#qa-result'); out.classList.remove('hidden'); out.innerHTML=`<div class="qa-aviso"><strong>Verificador de solo lectura.</strong> En Moodle, abre la actividad ya guardada y ejecútelo desde la consola (F12). Compara bloque por bloque y revisa los enlaces. No escribe ni guarda nada.</div><div class="opcion-entrega"><h3><i class="ph ph-bookmark-simple"></i> Marcador</h3><p class="field-hint">Arrástralo a tus marcadores y ejecútalo en la actividad publicada.</p><a class="btn-secondary btn-chico bookmarklet-link" href="${esc(bookmark)}" onclick="return false;">Verificar actividad</a></div><div class="opcion-entrega"><h3><i class="ph ph-terminal-window"></i> Consola</h3><p class="field-hint">F12 → Console. Copia este código; no modifica el contenido.</p><div class="code-wrapper"><button class="btn-icon js-copy-qa" title="Copiar"><i class="ph ph-copy"></i></button><textarea class="code-output" readonly>${esc(code)}</textarea></div><button class="btn-secondary btn-chico js-copy-qa"><i class="ph ph-copy"></i> Copiar verificador</button></div>`; out.querySelectorAll('.js-copy-qa').forEach(b=>b.addEventListener('click',()=>{const ta=out.querySelector('textarea');navigator.clipboard.writeText(ta.value).then(()=>{const i=b.querySelector('i');i.className='ph ph-check';setTimeout(()=>i.className='ph ph-copy',1200);}).catch(()=>{ta.focus();ta.select();});})); activarTab('qa'); }
    /* Versión estricta del QA. Se declara después de la primera para sustituirla:
       la identidad de la actividad (H1) es requisito previo, no una coincidencia
       más entre muchos fragmentos de texto. */
    function scriptQA_MUERTA_2(data) { return `(function () {
    var DATA=${JSON.stringify(data)};
    var raiz=document.querySelector('.prepa-M'+DATA.modulo+'-body')||document.querySelector('[class*="prepa-M"][class$="-body"]')||document.querySelector('#region-main')||document.body;
    function limpiar(s){return String(s||'').replace(/\\u00a0/g,' ').replace(/\\s+/g,' ').trim();}
    function clave(s){return limpiar(s).toLocaleLowerCase('es-MX');}
    function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
    var nodos=[].slice.call(raiz.querySelectorAll('h1,h2,p,li,td,th')).map(function(n){return {n:n,t:limpiar(n.textContent),usado:false};});
    var esperado=(DATA.textos.filter(function(x){return x.etiqueta==='Título';})[0]||{}).texto||'';
    // Moodle puede conservar el título con su clase institucional aunque cambie
    // la etiqueta HTML. Primero se busca esa clase; h1 es solo el último respaldo.
    var h1=raiz.querySelector('[class*="-tituloTema"],[class*="-Tema"] h1,[class*="-Tema"],h1'), tituloPagina=h1?limpiar(h1.textContent):'(sin título)';
    var paginaDistinta=Boolean(esperado&&clave(esperado)!==clave(tituloPagina));
    function buscar(item){var candidatos=nodos.filter(function(x){return !x.usado&&x.n.matches(item.selector||'*');}),k=clave(item.texto);var x=candidatos.find(function(x){return x.t===limpiar(item.texto);})||candidatos.find(function(x){return clave(x.t)===k;});if(x)x.usado=true;return x;}
    var faltan=[],correctos=0,links=[];
    if(paginaDistinta){faltan=DATA.textos.slice();links=DATA.links.map(function(x){return {item:x,error:'No se verifica: página de otra actividad'};});}
    else {DATA.textos.forEach(function(x){if(buscar(x))correctos++;else faltan.push(x);});DATA.links.forEach(function(item){var a=[].slice.call(raiz.querySelectorAll('a')).find(function(a){return clave(a.textContent)===clave(item.texto);});if(!a){links.push({item:item,error:'No aparece el enlace'});return;}var h=limpiar(a.getAttribute('href')),e=limpiar(item.href),f=function(x){return (x.split('?')[0].split('/').pop()||'').toLowerCase();};if(!(h===e||(f(h)&&f(h)===f(e))))links.push({item:item,error:'URL distinta',pagina:h});else if((a.getAttribute('target')||'').toLowerCase()!=='_blank')links.push({item:item,error:'No abre en pestaña nueva',pagina:h});});}
    // Moodle puede repetir el mismo texto en li/p o partir un párrafo en
    // nodos hijos. Un sobrante solo es real si no coincide ni forma parte de
    // ningún texto esperado; así no se reportan viñetas correctas dos veces.
    var firmasEsperadas=DATA.textos.map(function(x){return firma(x.texto);}).filter(function(x){return x.length>2;});
    var sobrantes=nodos.filter(function(x){return !x.usado&&x.t&&!firmasEsperadas.some(function(f){return f===x.f||(x.f.length>12&&f.indexOf(x.f)!==-1)||(f.length>12&&x.f.indexOf(f)!==-1);});});
    [].slice.call(document.querySelectorAll('.integrador-qa-marca')).forEach(function(n){n.style.outline='';n.classList.remove('integrador-qa-marca');});var viejo=document.getElementById('integrador-qa-panel');if(viejo)viejo.remove();
    if(paginaDistinta){nodos.forEach(function(x){x.n.style.outline='3px solid #c62828';x.n.classList.add('integrador-qa-marca');});}
    else faltan.forEach(function(item){var candidato=nodos.find(function(x){return x.n.matches(item.selector||'*');});if(candidato){candidato.n.style.outline='3px solid #c62828';candidato.n.classList.add('integrador-qa-marca');}});
    var error=paginaDistinta||faltan.length||links.length,estado=paginaDistinta?'PÁGINA DISTINTA':(error?'ERRORES':'TODO CORRECTO'),color=error?'#c62828':'#2e7d32';
    var panel=document.createElement('div');panel.id='integrador-qa-panel';panel.style.cssText='position:fixed;top:12px;right:12px;width:440px;max-height:88vh;overflow:auto;z-index:2147483647;background:#fff;color:#222;border:1px solid #ddd;border-radius:10px;padding:14px 16px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif';
    var html='<div style="display:flex;justify-content:space-between;margin-bottom:10px"><strong style="font-size:15px">QA de actividad</strong><button id="integrador-qa-cerrar" style="border:0;background:#eee;border-radius:6px;padding:4px 9px;cursor:pointer">Cerrar</button></div><div style="background:'+color+';color:#fff;padding:8px 10px;border-radius:7px;font-weight:700;margin-bottom:10px">'+estado+'</div><div>'+DATA.textos.length+' textos esperados · '+correctos+' correctos · '+DATA.links.length+' enlaces revisados</div>';
    if(paginaDistinta)html+='<div style="margin-top:10px;background:#fdecea;border-left:3px solid #c62828;padding:9px;border-radius:5px"><strong>Esta NO es la actividad del QA.</strong><br>Esperado: '+esc(esperado)+'<br>En Moodle: '+esc(tituloPagina)+'<br>No se aceptan coincidencias parciales.</div>';
    if(!error)html+='<div style="margin-top:10px;background:#e8f5e9;border-left:3px solid #2e7d32;padding:9px;border-radius:5px">Textos y enlaces coinciden con lo generado.</div>';
    if(faltan.length)html+='<h4 style="margin:12px 0 5px;color:#c62828">Textos faltantes o distintos ('+faltan.length+')</h4>'+faltan.map(function(x){return '<div style="border-left:3px solid #c62828;padding:5px 8px;margin:5px 0;background:#fff5f5"><strong>'+esc(x.etiqueta)+'</strong><br>'+esc(x.texto)+'</div>';}).join('');
    if(!paginaDistinta&&sobrantes.length)html+='<h4 style="margin:12px 0 5px;color:#ef6c00">Texto extra en Moodle ('+sobrantes.length+')</h4>'+sobrantes.slice(0,20).map(function(x){return '<div style="border-left:3px solid #ef6c00;padding:5px 8px;margin:5px 0;background:#fff9ed">'+esc(x.t)+'</div>';}).join('')+(sobrantes.length>20?'<p>Se muestran los primeros 20.</p>':'');
    if(links.length)html+='<h4 style="margin:12px 0 5px;color:#c62828">Enlaces con problema ('+links.length+')</h4>'+links.map(function(x){return '<div style="border-left:3px solid #c62828;padding:5px 8px;margin:5px 0;background:#fff5f5"><strong>'+esc(x.error)+': '+esc(x.item.texto)+'</strong><br>Esperado: '+esc(x.item.href)+(x.pagina?'<br>En Moodle: '+esc(x.pagina):'')+'</div>';}).join('');
    panel.innerHTML=html;document.body.appendChild(panel);document.getElementById('integrador-qa-cerrar').onclick=function(){[].slice.call(document.querySelectorAll('.integrador-qa-marca')).forEach(function(n){n.style.outline='';n.classList.remove('integrador-qa-marca');});panel.remove();};var primero=document.querySelector('.integrador-qa-marca');if(primero)primero.scrollIntoView({behavior:'smooth',block:'center'});
})();`; }
    /* El HTML que persiste Moodle puede cambiar h1 por div/span. Esta versión
       valida una huella completa de contenido: el título es una señal fuerte,
       pero no invalida una página cuyo contenido sí coincide casi por completo. */
    function scriptQA(data) { return `(function () {
    var DATA=${JSON.stringify(data)};
    var raiz=document.querySelector('.prepa-M'+DATA.modulo+'-body')||document.querySelector('[class*="prepa-M"][class$="-body"]')||document.querySelector('#region-main')||document.body;
    function limpiar(s){return String(s||'').replace(/[\\u00a0\\u200b\\u00ad]/g,' ').replace(/\\s+/g,' ').trim();}
    function firma(s){return limpiar(s).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLocaleLowerCase('es-MX').replace(/[^\\p{L}\\p{N}]+/gu,' ').replace(/\\s+/g,' ').trim();}
    function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
    var nodos=[].slice.call(raiz.querySelectorAll('[class*="-tituloTema"],[class*="-subTema"],h1,h2,h3,p,li,td,th')).map(function(n){return {n:n,t:limpiar(n.textContent),f:firma(n.textContent),usado:false};}).filter(function(x){return x.t;});
    // Moodle cambia p/h2/li según el editor y el tema. El QA editorial compara
    // el texto visible, no la etiqueta que haya sobrevivido al guardado.
    function buscar(item){var candidatos=nodos.filter(function(x){return !x.usado;}),f=firma(item.texto);var x=candidatos.find(function(x){return x.f===f;});if(!x&&f.length>20)x=candidatos.find(function(x){return x.f.indexOf(f)!==-1||f.indexOf(x.f)!==-1;});if(x)x.usado=true;return x;}
    var faltan=[],correctos=0,coincidencias=[];
    DATA.textos.forEach(function(item){var x=buscar(item);if(x){correctos++;coincidencias.push({item:item,nodo:x});}else faltan.push(item);});
    var titulo=(DATA.textos.filter(function(x){return x.etiqueta==='Título';})[0]||{});var tituloCoincide=coincidencias.some(function(x){return x.item===titulo;});
    var proporcion=DATA.textos.length?correctos/DATA.textos.length:0;
    // Menos de 55% Y sin título reconocido significa otro contenido. Una página
    // con casi todo su texto correcto no se rechaza porque Moodle cambie etiquetas.
    var paginaDistinta=!tituloCoincide&&proporcion<.55;
    var links=[];
    if(!paginaDistinta)DATA.links.forEach(function(item){var a=[].slice.call(raiz.querySelectorAll('a')).find(function(a){return firma(a.textContent)===firma(item.texto);});if(!a){links.push({item:item,error:'No aparece el enlace'});return;}var h=limpiar(a.getAttribute('href')),e=limpiar(item.href),archivo=function(x){return (x.split('?')[0].split('/').pop()||'').toLowerCase();};if(!(h===e||(archivo(h)&&archivo(h)===archivo(e))))links.push({item:item,error:'URL distinta',pagina:h});else if((a.getAttribute('target')||'').toLowerCase()!=='_blank')links.push({item:item,error:'No abre en pestaña nueva',pagina:h});});
    else links=DATA.links.map(function(x){return {item:x,error:'No se verifica: página de otra actividad'};});
    // Un "sobrante" solo es real si su texto NO forma parte de lo esperado.
    // TinyMCE envuelve el contenido de una viñeta en <li><p>texto</p></li>: el
    // <li> y su <p> son DOS nodos con el mismo texto, y como buscar() marca solo
    // uno, el otro salía como "extra" aunque la viñeta sí estaba en el Word.
    // Comparar por firma (no por etiqueta) los descarta.
    var firmasEsperadas=DATA.textos.map(function(x){return firma(x.texto);}).filter(function(x){return x.length>2;});
    var sobrantes=nodos.filter(function(x){return !x.usado&&x.t&&!firmasEsperadas.some(function(f){return f===x.f||(x.f.length>12&&f.indexOf(x.f)!==-1)||(f.length>12&&x.f.indexOf(f)!==-1);});});
    [].slice.call(document.querySelectorAll('.integrador-qa-marca')).forEach(function(n){n.style.outline='';n.classList.remove('integrador-qa-marca');});var viejo=document.getElementById('integrador-qa-panel');if(viejo)viejo.remove();
    if(paginaDistinta)nodos.forEach(function(x){x.n.style.outline='3px solid #c62828';x.n.classList.add('integrador-qa-marca');});
    else faltan.forEach(function(item){var n=nodos.find(function(x){return !x.usado;});if(n){n.n.style.outline='3px solid #c62828';n.n.classList.add('integrador-qa-marca');}});
    var error=paginaDistinta||faltan.length||links.length,estado=paginaDistinta?'PÁGINA DISTINTA':(error?'ERRORES':'TODO CORRECTO'),color=error?'#c62828':'#2e7d32';
    var panel=document.createElement('div');panel.id='integrador-qa-panel';panel.style.cssText='position:fixed;top:12px;right:12px;width:440px;max-height:88vh;overflow:auto;z-index:2147483647;background:#fff;color:#222;border:1px solid #ddd;border-radius:10px;padding:14px 16px;box-shadow:0 10px 40px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif';
    var html='<div style="display:flex;justify-content:space-between;margin-bottom:10px"><strong style="font-size:15px">QA de actividad</strong><button id="integrador-qa-cerrar" style="border:0;background:#eee;border-radius:6px;padding:4px 9px;cursor:pointer">Cerrar</button></div><div style="background:'+color+';color:#fff;padding:8px 10px;border-radius:7px;font-weight:700;margin-bottom:10px">'+estado+'</div><div>'+DATA.textos.length+' textos esperados · '+correctos+' correctos ('+Math.round(proporcion*100)+'%) · '+DATA.links.length+' enlaces revisados</div>';
    if(paginaDistinta)html+='<div style="margin-top:10px;background:#fdecea;border-left:3px solid #c62828;padding:9px;border-radius:5px"><strong>La huella del contenido no coincide.</strong><br>Menos de 55% de textos encontrados y título no reconocido. No se aceptan coincidencias parciales.</div>';
    else if(!tituloCoincide)html+='<div style="margin-top:10px;background:#fff4e5;border-left:3px solid #ef6c00;padding:9px;border-radius:5px"><strong>Aviso de título:</strong> Moodle cambió o no expuso su etiqueta, pero la huella del contenido coincide ('+Math.round(proporcion*100)+'%).</div>';
    if(!error)html+='<div style="margin-top:10px;background:#e8f5e9;border-left:3px solid #2e7d32;padding:9px;border-radius:5px">Textos y enlaces coinciden con lo generado.</div>';
    if(faltan.length)html+='<h4 style="margin:12px 0 5px;color:#c62828">Textos faltantes o distintos ('+faltan.length+')</h4>'+faltan.map(function(x){return '<div style="border-left:3px solid #c62828;padding:5px 8px;margin:5px 0;background:#fff5f5"><strong>'+esc(x.etiqueta)+'</strong><br>'+esc(x.texto)+'</div>';}).join('');
    if(!paginaDistinta&&sobrantes.length)html+='<h4 style="margin:12px 0 5px;color:#ef6c00">Texto extra en Moodle ('+sobrantes.length+')</h4>'+sobrantes.slice(0,20).map(function(x){return '<div style="border-left:3px solid #ef6c00;padding:5px 8px;margin:5px 0;background:#fff9ed">'+esc(x.t)+'</div>';}).join('')+(sobrantes.length>20?'<p>Se muestran los primeros 20.</p>':'');
    if(links.length)html+='<h4 style="margin:12px 0 5px;color:#c62828">Enlaces con problema ('+links.length+')</h4>'+links.map(function(x){return '<div style="border-left:3px solid #c62828;padding:5px 8px;margin:5px 0;background:#fff5f5"><strong>'+esc(x.error)+': '+esc(x.item.texto)+'</strong><br>Esperado: '+esc(x.item.href)+(x.pagina?'<br>En Moodle: '+esc(x.pagina):'')+'</div>';}).join('');
    panel.innerHTML=html;document.body.appendChild(panel);document.getElementById('integrador-qa-cerrar').onclick=function(){[].slice.call(document.querySelectorAll('.integrador-qa-marca')).forEach(function(n){n.style.outline='';n.classList.remove('integrador-qa-marca');});panel.remove();};var primero=document.querySelector('.integrador-qa-marca');if(primero)primero.scrollIntoView({behavior:'smooth',block:'center'});
})();`; }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
