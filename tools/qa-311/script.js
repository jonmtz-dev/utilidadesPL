/* ==========================================================================
   QA de Actividad (Moodle 3.11)

   Qué hace: lee el guion que mandó producción y arma un verificador que se
   ejecuta sobre la página YA MONTADA en Moodle para cotejar que sea lo mismo.

   Es el gemelo del QA de 5.1 y comparte con él TODO el lector del guion
   (`assets/qa-guion.js`): el Word es el mismo documento en las dos versiones.
   Lo que cambia vive en `verificador.js` —la página de Moodle— y aquí abajo:
   el MÓDULO, que en 3.11 decide la clase del contenedor (`prepa-M{n}-body`), y
   las FÓRMULAS, que en 3.11 viajan como `$$…$$` y hay que cotejar aparte.

   La RÚBRICA se lee con `assets/qa-rubrica.js`, el MISMO lector que usa
   Adaptador de Rúbricas para escribirla. Tiene que ser el mismo: si el QA
   armara su propia versión del texto esperado, cualquier diferencia entre las
   dos daría falsas alarmas o, peor, aprobaría algo mal escrito.

   Tres decisiones que conviene no deshacer:

   1. El Word se lee con `assets/docx.js`, el mismo lector que usa Guion
      Instruccional a Página. El HTML que produce esa herramienta es idéntico al
      que monta el equipo, así que el QA y el generador entienden el mismo
      documento: si un día cambia el catálogo de marcas, cambia en un solo lado.
   2. El verificador vive en `verificador.js` como función normal y se envía con
      `toString()`. Escribirlo dentro de una plantilla de texto obliga a escapar
      cada acento grave: es lo que dejó ilegible al QA de 3.11.
   3. Lo que se compara es TEXTO, no etiquetas. Moodle reescribe p/li/h2 al
      guardar. El detalle de qué se perdona (y por qué) está en verificador.js.
   ========================================================================== */

(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);

    const datos = { actividad: null, rubrica: null };
    const archivos = { guion: '', rubrica: '' };
    /* El módulo manda la clase del contenedor en 3.11. Se recuerda porque quien
       revisa suele encadenar varias actividades del mismo módulo. */
    let modulo = Number(localStorage.getItem('qa311-modulo')) || 1;

    /* El lector del guion —desmarcar(), dondeEmpieza(), construirActividad()
       y sus ayudantes— vive en assets/qa-guion.js: lo comparte el QA de
       Actividad de Moodle 3.11. El guion es el MISMO Word en las dos
       versiones; lo que cambia es la página contra la que se coteja. */

    /* La clave con que se nombra la evidencia: `SM1S1_AA1`, sacada de
       `01S.03_PR_SM1S1-AA1_La_tecnologia_en_tu_entorno.docx`. Se calcula UNA
       vez, aquí, y viaja en los datos: da nombre al PDF y también al marcador,
       para que al arrastrarlo a la barra el favorito se llame igual que el
       archivo que va a producir. El separador del archivo da igual
       (`SM1S1-AA1`, `SM1S1_AA1`, `SM1S1AA1`) y los ceros a la izquierda se
       quitan.

       Aquí manda la forma de 3.11 —`M17_AI3`, `M20_S2_AI1`— y se reconoce
       TAMBIÉN la de 5.1 para no dejar sin nombre a un guion mixto. Lo que no
       se hace es inventar: si no coincide ninguna, la evidencia se llama como
       el archivo, y ahí se nota que el guion no tenía la nomenclatura. */
    function claveDeEvidencia(nombre) {
        const texto = String(nombre || '');
        const m311 = texto.match(/M\s*0?(\d+)\s*[_\-\s]?\s*(?:S\s*0?(\d+)\s*[_\-\s]?\s*)?(AI|AA|AC)\s*0?(\d+)/i);
        if (m311) {
            return 'M' + m311[1] + (m311[2] ? 'S' + m311[2] : '') + '_' + m311[3].toUpperCase() + m311[4];
        }
        const clave = texto.match(/SM\s*0?(\d+)\s*[_\-\s]?\s*S\s*0?(\d+)\s*[_\-\s]?\s*AA\s*0?(\d+)/i);
        if (clave) return `SM${clave[1]}S${clave[2]}_AA${clave[3]}`;
        const base = texto.replace(/\.[a-z0-9]+$/i, '').trim();
        if (base) return base.replace(/[\\/:*?"<>|\s]+/g, '_');
        return new Date().toISOString().slice(0, 10);
    }

    function avisar(mensaje, error) {
        const p = $('#aviso-lectura');
        p.textContent = mensaje || '';
        p.style.color = error ? 'var(--danger)' : '';
    }

    async function cargarGuion(file) {
        avisar('Leyendo el guion…');
        try {
            const bloques = await leerBloquesDeDocx(file, { saltos: true, cursivas: true });
            datos.actividad = construirActividad(bloques);
            archivos.guion = file.name;
            $('#zona-guion').classList.add('dropzone--cargada');
            avisar('');
        } catch (e) {
            avisar('No se pudo leer el guion: ' + e.message, true);
        }
        dibujar();
    }

    /* La rúbrica. La fila de encabezado —la de los nombres de nivel— se busca
       sola: es la primera cuyas celdas después de la primera están todas
       llenas y son cortas. Se enseña cuál eligió en el resumen, y se puede
       cambiar, porque en una rúbrica rara puede equivocarse y entonces todos
       los criterios saldrían corridos. */
    function filaDeNiveles(estructura) {
        const filas = estructura.filas || [];
        for (let i = 0; i < filas.length; i++) {
            const resto = (filas[i].celdas || []).slice(1);
            if (resto.length >= 2 && resto.every(c => (c.texto || '').trim())
                && resto.every(c => (c.texto || '').trim().length <= 40)) return i;
        }
        return 0;
    }

    async function cargarRubrica(file) {
        avisar('Leyendo la rúbrica…');
        try {
            const tablas = await leerTablasDeDocx(file);
            if (!tablas.length) throw new Error('el Word no trae ninguna tabla');
            /* La rúbrica es la tabla con más columnas: los Word traen antes la
               hoja de control, que son tablas de dos. */
            const tabla = tablas.slice().sort((a, b) =>
                (b.filas[0] ? b.filas[0].celdas.length : 0) - (a.filas[0] ? a.filas[0].celdas.length : 0))[0];
            const estructura = { filas: tabla.filas };
            const cabecera = filaDeNiveles(estructura);
            datos.rubrica = analizarRubrica(estructura, cabecera);
            datos.rubrica.filaCabecera = cabecera;

            /* El nombre del nivel va ANTEPUESTO en el primer criterio:
               «EXPERTO - Utiliza un procesador…». Así están las rúbricas
               reales en Moodle —en el Word esos nombres viven en el
               encabezado de la tabla y al montar solo hacen falta una vez—, y
               es lo que escribe Adaptador de Rúbricas. Sin esto, el QA
               reportaba los seis niveles del primer criterio como «el texto no
               coincide», resaltando justo el «EXPERTO - » que sí debía estar.
               El separador es " - " en la misma línea, igual que allá. */
            datos.rubrica.criterios.forEach((crit, ci) => {
                if (ci !== 0) return;
                crit.celdas.forEach((celda, li) => {
                    const nivel = datos.rubrica.niveles[li];
                    if (!nivel) return;
                    celda.texto = celda.texto ? `${nivel} - ${celda.texto}` : nivel;
                });
            });
            archivos.rubrica = file.name;
            $('#zona-rubrica').classList.add('dropzone--cargada');
            avisar('');
        } catch (e) {
            avisar('No se pudo leer la rúbrica: ' + e.message, true);
        }
        dibujar();
    }

    function quitar(cual) {
        datos[cual] = null;
        const esGuion = cual === 'actividad';
        archivos[esGuion ? 'guion' : 'rubrica'] = '';
        $(esGuion ? '#zona-guion' : '#zona-rubrica').classList.remove('dropzone--cargada');
        $(esGuion ? '#input-guion' : '#input-rubrica').value = '';
        dibujar();
    }

    function prepararZona(idZona, idInput, alCargar) {
        const zona = $(idZona);
        const input = $(idInput);
        zona.addEventListener('click', () => input.click());
        zona.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
        });
        input.addEventListener('change', () => input.files[0] && alCargar(input.files[0]));
        ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault(); zona.classList.add('dropzone--active');
        }));
        ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault(); zona.classList.remove('dropzone--active');
        }));
        zona.addEventListener('drop', e => {
            const f = e.dataTransfer.files[0];
            if (f && /\.docx$/i.test(f.name)) alCargar(f);
            else avisar('El archivo debe ser .docx', true);
        });
    }

    /* ---------------------------------------------------------------------
       Salida: resumen, verificador y lista de lo que se revisa
       --------------------------------------------------------------------- */

    const escapar = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /* La función se envía tal cual y se invoca con los datos ya resueltos. El
       generador de evidencia vive en `assets/evidencia-qa.js` y lo comparten
       las dos herramientas de QA, así que viaja serializado a su lado y se pasa
       como argumento; no se cuelga de `window` para no dejar rastro en Moodle.
       Los nombres de archivo van dentro de los datos porque dan nombre al PDF. */
    function codigoVerificador() {
        const paquete = Object.assign({}, datos, {
            archivos: archivos,
            // El módulo viaja en los datos: de él sale la clase del contenedor
            // que el verificador busca en la página (`prepa-M{n}-body`).
            modulo: modulo,
            clave: claveDeEvidencia(archivos.guion || archivos.rubrica)
        });
        return 'void (function () {\n'
            + 'var evidencia = ' + window.EVIDENCIA_QA.toString() + ';\n'
            + '(' + window.VERIFICADOR_QA_311.toString() + ')(' + JSON.stringify(paquete) + ', evidencia);\n'
            + '}());';
    }

    function dibujar() {
        const hay = datos.actividad || datos.rubrica;
        $('#verificador-vacio').classList.toggle('hidden', Boolean(hay));
        $('#verificador-caja').classList.toggle('hidden', !hay);
        $('#revisar-vacio').classList.toggle('hidden', Boolean(hay));
        $('#revisar-lista').classList.toggle('hidden', !hay);
        dibujarResumen();
        if (!hay) return;

        $('#incluye').innerHTML =
            `<span class="${datos.actividad ? 'puesto' : ''}">${datos.actividad ? '✓' : '○'} Actividad</span>` +
            `<span class="${datos.rubrica ? 'puesto' : ''}">${datos.rubrica ? '✓' : '○'} Rúbrica</span>` +
            `<span class="puesto">✓ Módulo ${modulo}</span>`;

        const codigo = codigoVerificador();
        $('#codigo').value = codigo;
        $('#marcador').setAttribute('href', 'javascript:' + encodeURIComponent(codigo));
        // El texto del enlace es el nombre que toma el favorito al arrastrarlo
        // a la barra: el mismo del PDF, así el marcador dice de qué guion es.
        $('#marcador-nombre').textContent = 'QA_' + claveDeEvidencia(archivos.guion || archivos.rubrica);
        dibujarRevision();
    }

    /* Se enseña por dónde entró el guion porque es lo que explica un conteo raro
       de textos: si dice "hoja de control" es que el Word no traía ni <h1> ni
       <h2> y el corte se adivinó. */
    function entradaLegible(entrada) {
        if (/^h\d$/.test(entrada || '')) return `la marca <${entrada}>`;
        if (entrada === 'barra de título') return 'la primera barra de título (el guion no la marca con <h1> ni <h2>)';
        if (entrada === 'hoja de control') return 'después de la hoja de control (el guion no trae <h1> ni <h2>)';
        return 'el principio del Word (no se encontró dónde empieza lo publicable)';
    }

    function dibujarResumen() {
        const caja = $('#resumen');
        const partes = [];

        if (datos.actividad) {
            const a = datos.actividad;
            partes.push(`
                <div class="resumen-bloque">
                    <h3><span class="resumen-titulo"><i class="ph ph-file-doc"></i> Guion</span>
                        <button class="btn-quitar" type="button" data-quitar="actividad"
                                title="Quitar el guion"><i class="ph ph-x"></i></button></h3>
                    <div class="resumen-dato"><span>Archivo</span><span><code>${escapar(archivos.guion)}</code></span></div>
                    <div class="resumen-dato"><span>Título</span><span>${escapar(a.titulo || '(no se encontró ningún encabezado)')}</span></div>
                    <div class="resumen-dato"><span>Empieza en</span><span>${escapar(entradaLegible(a.entrada))}</span></div>
                    <div class="resumen-dato"><span>Textos por cotejar</span><span>${a.textos.length}</span></div>
                    <div class="resumen-dato"><span>Tablas</span><span>${a.tablas.length}</span></div>
                    <div class="resumen-dato"><span>Enlace de la rúbrica</span><span>${a.enlaceRubrica ? (a.enlaceRubrica.archivo || 'sí, sin archivo definido') : 'no se menciona'}</span></div>
                </div>`);
        }
        if (datos.rubrica) {
            const r = datos.rubrica;
            const cuenta = r.criterios.filter(c => c.incluir).length;
            partes.push(`
                <div class="resumen-bloque">
                    <h3><span class="resumen-titulo"><i class="ph ph-list-checks"></i> Rúbrica</span>
                        <button class="btn-quitar" type="button" data-quitar="rubrica"
                                title="Quitar la rúbrica"><i class="ph ph-x"></i></button></h3>
                    <div class="resumen-dato"><span>Archivo</span><span><code>${escapar(archivos.rubrica)}</code></span></div>
                    <div class="resumen-dato"><span>Niveles</span><span>${escapar(r.niveles.join(' · '))}</span></div>
                    <div class="resumen-dato"><span>Criterios por cotejar</span><span>${cuenta}</span></div>
                    <div class="resumen-dato"><span>Fila de niveles</span><span>la ${r.filaCabecera + 1}ª de la tabla</span></div>
                </div>`);
        }
        caja.innerHTML = partes.join('');
        caja.querySelectorAll('[data-quitar]').forEach(b =>
            b.addEventListener('click', () => quitar(b.dataset.quitar)));
    }

    function dibujarRevision() {
        const caja = $('#revisar-lista');
        const partes = [];

        if (datos.actividad) {
            const a = datos.actividad;
            partes.push(`<div class="check-bloque">
                <h3><i class="ph ph-article"></i> Textos de la actividad (${a.textos.length})</h3>
                <div class="qa-lista-textos">${a.textos.map(t => `
                    <div class="qa-linea"><span class="qa-etiqueta">${escapar(t.etiqueta)}</span>
                    <span class="qa-texto">${escapar(t.texto.slice(0, 150))}${t.texto.length > 150 ? '…' : ''}
                    ${t.negritas.length ? ` <strong>· negritas: ${escapar(t.negritas.join(' / '))}</strong>` : ''}
                    ${t.cursivas.length ? ` <em>· cursivas: ${escapar(t.cursivas.join(' / '))}</em>` : ''}</span></div>`).join('')}
                </div></div>`);
        }
        caja.innerHTML = partes.join('');
    }

    /* --------------------------------------------------------------- Arranque */

    /* El selector de módulo. La lista sale de assets/modulos-311.js, la misma
       que usan el Integrador HTML y el Generador de Bibliografías: el número de
       módulos no se teclea dos veces. */
    function prepararModulo() {
        const sel = $('#modulo');
        if (!sel || typeof MODULOS_311 === 'undefined') return;
        Object.keys(MODULOS_311).forEach(n => {
            const op = document.createElement('option');
            op.value = n;
            op.textContent = 'Módulo ' + n;
            sel.appendChild(op);
        });
        sel.value = String(modulo);

        /* La muestra de color: fondo, barra y contenido del módulo, el mismo
           componente `.paleta` que enseña el Integrador HTML. No es adorno —es
           lo que deja ver de un vistazo que se eligió el módulo correcto, que
           aquí decide dónde busca el verificador. */
        const eco = $('#modulo-echo');
        const muestra = $('#paleta');
        const refrescar = () => {
            if (eco) eco.textContent = String(modulo);
            if (muestra && typeof MODULOS_311 !== 'undefined') {
                muestra.innerHTML = (MODULOS_311[modulo] || [])
                    .map(c => `<i style="background:${c}"></i>`).join('');
            }
        };
        refrescar();

        sel.addEventListener('change', () => {
            modulo = Number(sel.value) || 1;
            localStorage.setItem('qa311-modulo', String(modulo));
            refrescar();
            // El módulo va DENTRO del verificador: si cambia, hay que rehacerlo.
            dibujar();
        });
    }

    function init() {
        prepararModulo();
        prepararZona('#zona-guion', '#input-guion', cargarGuion);
        prepararZona('#zona-rubrica', '#input-rubrica', cargarRubrica);

        document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
            document.querySelectorAll('.tab-content').forEach(c =>
                c.classList.toggle('active', c.id === btn.dataset.target + '-content'));
        }));

        $('#btn-copiar').addEventListener('click', () => {
            const ta = $('#codigo');
            if (!ta.value) return;
            navigator.clipboard.writeText(ta.value).then(() => {
                const i = $('#btn-copiar i');
                i.className = 'ph ph-check';
                setTimeout(() => { i.className = 'ph ph-copy'; }, 1400);
            }).catch(() => { ta.focus(); ta.select(); });
        });

        Reparto.iniciar({
            workspace: '.qa-workspace',
            divisor: '#divisor',
            clave: 'qa51-col-editor',
            colMin: 340,
            restoMin: 380
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
