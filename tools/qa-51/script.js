/* ==========================================================================
   QA de Actividad y Rúbrica (Moodle 5.1)

   Qué hace: lee el guion y la rúbrica que mandó producción (los dos en Word) y
   arma un verificador que se ejecuta sobre la página YA MONTADA en Moodle para
   cotejar que sea lo mismo.

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

    /* Marca de montaje: `<h1>`, `<Tabla>`, `<Lista numerada; …>`. Mismo patrón
       que usa Guion Instruccional a Página. */
    const MARCA = /^[<«]\s*(.+?)\s*[>»]$/;

    const datos = { actividad: null, rubrica: null };
    const archivos = { guion: '', rubrica: '' };

    /* ---------------------------------------------------------------------
       Del Word al modelo esperado
       --------------------------------------------------------------------- */

    /** Separa el texto limpio de sus marcas de formato (`**negrita**`, `*cursiva*`). */
    function desmarcar(marcado) {
        const negritas = [];
        const cursivas = [];
        let texto = String(marcado || '');

        texto = texto.replace(/\*\*([\s\S]+?)\*\*/g, (_, dentro) => {
            const plano = dentro.replace(/\*/g, '').trim();
            if (plano) negritas.push(plano);
            return dentro;
        });
        texto = texto.replace(/\*([^*\n]+?)\*/g, (_, dentro) => {
            const plano = dentro.trim();
            if (plano) cursivas.push(plano);
            return dentro;
        });
        return { texto: texto.replace(/\*/g, '').trim(), negritas, cursivas };
    }

    function agregarTexto(lista, etiqueta, marcado) {
        const d = desmarcar(marcado);
        if (!d.texto) return;
        lista.push({ etiqueta, texto: d.texto, negritas: d.negritas, cursivas: d.cursivas });
    }

    /** La marca de un bloque de párrafo (`<h1>`, `<Figura>`), o '' si no lo es. */
    function marcaDe(bloque) {
        if (!bloque || bloque.tipo !== 'parrafo') return '';
        const m = (bloque.texto || '').replace(/\*/g, '').trim().match(MARCA);
        return m ? m[1] : '';
    }

    /* Celdas que solo existen en la hoja de control editorial del guion. Sirven
       para reconocerla cuando el Word no trae NINGUNA marca de encabezado. */
    const HOJA_DE_CONTROL = /^(nombre del m[óo]dulo|nombre y n[úu]mero del subm[óo]dulo|n[úu]mero de semana|tipo de recurso|t[íi]tulo del recurso|meta educativa|prop[óo]sito\(s\) formativo\(s\)|elaborador o elaboradora|indicaciones|insumos requeridos|idm\/mon)/i;

    /**
     * Dónde empieza lo que SÍ se publica.
     *
     * Se entra por el primer encabezado: todo lo anterior son las fichas de
     * control editorial (módulo, elaboradores, indicaciones para producción) y
     * nunca se publica. Empezar ahí evita reportar cincuenta "textos faltantes"
     * que en realidad nadie tenía que montar.
     *
     * ⚠️ No se busca `<h1>`: **no todos los guiones lo traen.** De tres guiones
     * reales de regularización, dos abren el título con `<h2>` y solo uno con
     * `<h1>`; exigir `<h1>` dejaba entrar la hoja de control entera y el reporte
     * salía con 49 errores inventados sobre una actividad bien montada. Y si no
     * hay ninguna marca de encabezado, se salta la hoja de control por lo que
     * dicen sus celdas.
     */
    function dondeEmpieza(bloques) {
        const enc = bloques.findIndex(b => /^h[1-6]$/i.test(marcaDe(b)));
        if (enc >= 0) return { inicio: enc, entrada: marcaDe(bloques[enc]).toLowerCase() };

        let ultima = -1;
        bloques.forEach((b, i) => {
            if (b.tipo !== 'tabla') return;
            const celdas = (b.filas || []).reduce((t, f) => t.concat(f), [])
                .map(c => (c.texto || '').trim());
            if (celdas.some(t => HOJA_DE_CONTROL.test(t))) ultima = i;
        });
        if (ultima >= 0) return { inicio: ultima + 1, entrada: 'hoja de control' };
        return { inicio: 0, entrada: '' };
    }

    /**
     * Guion → { titulo, textos, tablas, enlaceRubrica }.
     */
    function construirActividad(bloques) {
        const arranque = dondeEmpieza(bloques);
        const cuerpo = bloques.slice(arranque.inicio);

        const textos = [];
        const tablas = [];
        let titulo = '';
        let esperando = '';        // 'h1' | 'h2' | 'tabla'
        let enLista = false;
        let enCentrado = false;
        let enFigura = false;      // dentro de <Figura>…<Termina figura>
        let punto = 0;
        let tituloTablaPendiente = '';
        let enlaceRubrica = null;

        cuerpo.forEach(bloque => {
            if (bloque.tipo === 'tabla') {
                // Tras un <h1>/<h2>, la tabla de una celda es la barra gris con
                // el título; en cualquier otro sitio es una tabla de contenido.
                const filas = (bloque.filas || []).map(f => f.map(c => (c.texto || '').trim()));
                if (esperando === 'h1' || esperando === 'h2') {
                    const t = desmarcar(filas.flat().join(' ')).texto;
                    // El título es el PRIMER encabezado, venga marcado como
                    // <h1> o como <h2>: hay guiones que solo traen <h2>.
                    const esPrimero = !titulo;
                    if (esPrimero) titulo = t;
                    agregarTexto(textos, esPrimero ? 'Título' : 'Subtítulo', t);
                    esperando = '';
                    return;
                }
                if (!filas.length) return;
                tablas.push({
                    titulo: tituloTablaPendiente,
                    encabezados: filas[0],
                    filas: filas.slice(1)
                });
                // Cada celda con contenido es un texto que tiene que aparecer.
                filas.forEach((fila, i) => fila.forEach(celda => {
                    if (celda) agregarTexto(textos, i === 0 ? 'Encabezado de tabla' : 'Celda', celda);
                }));
                tituloTablaPendiente = '';
                esperando = '';
                return;
            }

            const crudo = (bloque.texto || '').trim();
            if (!crudo) return;
            const plano = crudo.replace(/\*/g, '').trim();
            const m = plano.match(MARCA);

            if (m) {
                const clave = m[1].toLowerCase();
                if (/^h1$/.test(clave)) { esperando = 'h1'; return; }
                if (/^h[2-4]$/.test(clave)) { esperando = 'h2'; return; }
                if (/^termina/.test(clave)) {
                    if (/lista/.test(clave)) enLista = false;
                    if (/centrado/.test(clave)) enCentrado = false;
                    if (/tabla/.test(clave)) esperando = '';
                    if (/figura|imagen|v[ií]deo|pop|ventana/.test(clave)) enFigura = false;
                    return;
                }
                // "Lista con letras" y "Lista numerada" son las dos listas del
                // guion: numerarlas aparte solo cambia la etiqueta del reporte.
                if (/^lista/.test(clave)) {
                    enLista = true;
                    if (/numerada/.test(clave)) punto = 0;
                    return;
                }
                if (/centrado/.test(clave)) { enCentrado = true; return; }
                if (/^tabla/.test(clave)) { esperando = 'tabla'; return; }
                /* Lo que va DENTRO de <Figura>…<Termina figura> es la DESCRIPCIÓN
                   de la imagen para quien la produce ("Profile / Age: 13 years
                   old / Nationality: Brazilian…"), no texto de la página: se
                   monta como imagen y por eso nunca aparece escrito en Moodle.
                   Compararlo daba un "falta el punto 7" en un montaje correcto. */
                if (/^(figura|imagen|v[ií]deo|pop-?up|ventana)/.test(clave)) { enFigura = true; return; }
                // Cualquier otra marca es una indicación para el montador y no
                // se publica. No se compara, pero sí se avisa si aparece.
                return;
            }

            if (enFigura) return;

            // El título de una tabla va en el párrafo de antes, en negritas.
            if (esperando === 'tabla' && !tituloTablaPendiente) {
                tituloTablaPendiente = desmarcar(crudo).texto;
                agregarTexto(textos, 'Título de tabla', crudo);
                return;
            }

            if (enCentrado) { agregarTexto(textos, 'Texto centrado', crudo); return; }
            if (enLista || bloque.lista) {
                punto++;
                agregarTexto(textos, 'Punto ' + punto, crudo);
            } else {
                agregarTexto(textos, 'Párrafo', crudo);
            }

            /* "…con base en la siguiente rúbrica, que incluye…": esa palabra
               tiene que quedar enlazada al PDF. Es lo que más se olvida.

               No siempre dice "rúbrica": los foros se evalúan con una **lista de
               cotejo** y ahí la palabra enlazada es esa. Buscando solo "rúbrica"
               la actividad de foro se revisaba sin comprobar ningún enlace. */
            const instrumento = plano.match(/\b(r[úu]bricas?|listas? de cotejo)\b/i);
            if (instrumento && !enlaceRubrica) {
                enlaceRubrica = { texto: instrumento[0], archivo: '' };
            }
        });

        /* El código que el guion pide escribir en el nombre del archivo
           ("Apellidos_Nombre_SM02S3AA3"). Sirve para avisar si el guion y la
           rúbrica que se subieron no son de la misma actividad. */
        const codigo = textos.map(t => t.texto).join(' ')
            .match(/SM\s*0?(\d+)\s*S\s*0?(\d+)\s*AA\s*0?(\d+)/i);

        return {
            titulo, textos, tablas, enlaceRubrica,
            // Por dónde se entró al guion, para poder decirlo en el resumen.
            entrada: arranque.entrada,
            // `clave` normaliza para comparar (SM02S3AA3 y SM2_S3_AA3 dan "2-3-3");
            // `codigoTexto` es lo que el guion dice tal cual, para enseñarlo.
            clave: codigo ? codigo.slice(1, 4).map(Number).join('-') : '',
            codigoTexto: codigo ? codigo[0].replace(/\s+/g, '') : ''
        };
    }

    /**
     * Rúbrica → { criterios, total, descriptores }.
     *
     * La tabla de la rúbrica 5.1 gasta DOS filas por criterio: una con el texto
     * del criterio y los nombres de los niveles, y otra —"Escala de valoración"—
     * con los puntos. La fila "Total" no es un criterio: es la comprobación de
     * que la suma da lo que debe.
     */
    function construirRubrica(tablas, bloques) {
        const tabla = tablas[0];
        const criterios = [];
        let total = '';
        let pendiente = null;

        const clave = (s) => String(s || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

        (tabla ? tabla.filas : []).forEach(fila => {
            const celdas = fila.celdas.map(c => (c.texto || '').trim());
            const primera = clave(celdas[0]);

            if (primera.startsWith('escala de valoracion')) {
                if (pendiente) {
                    pendiente.puntos = celdas.slice(1).map(x => x.replace(/[^\d.,-]/g, ''));
                    criterios.push(pendiente);
                    pendiente = null;
                }
                return;
            }
            if (primera === 'total') {
                total = (celdas[1] || '').replace(/[^\d.,-]/g, '');
                return;
            }
            // Encabezado de la tabla: "Categorías e indicadores | Niveles de logro".
            if (celdas.length < 3) return;
            pendiente = { nombre: celdas[0], niveles: celdas.slice(1), puntos: [] };
        });

        // Los descriptores cualitativos son los párrafos de después de la tabla.
        const NIVELES = ['No evaluable', 'Requiere apoyo', 'Suficiente', 'Satisfactorio', 'Destacado'];
        const descriptores = [];
        bloques.forEach(b => {
            if (b.tipo !== 'parrafo') return;
            const d = desmarcar(b.texto);
            const nivel = NIVELES.find(n => clave(d.texto).indexOf(clave(n)) === 0);
            if (nivel && d.texto.length > nivel.length + 10) {
                descriptores.push({ nivel, texto: d.texto });
            }
        });

        return { criterios, total, descriptores };
    }

    /* ---------------------------------------------------------------------
       Carga de los dos Word
       --------------------------------------------------------------------- */

    /** "SM2_S3_AA3_Rubrica.docx" -> "2-3-3", para compararla con la del guion. */
    function claveDeArchivo(nombre) {
        const m = String(nombre || '').match(/SM\s*0?(\d+)\s*_?\s*S\s*0?(\d+)\s*_?\s*AA\s*0?(\d+)/i);
        return m ? m.slice(1, 4).map(Number).join('-') : '';
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
            if (datos.actividad.enlaceRubrica && archivos.rubrica) {
                datos.actividad.enlaceRubrica.archivo = archivos.rubrica.replace(/\.docx$/i, '');
            }
            $('#zona-guion').classList.add('dropzone--cargada');
            avisar('');
        } catch (e) {
            avisar('No se pudo leer el guion: ' + e.message, true);
        }
        dibujar();
    }

    async function cargarRubrica(file) {
        avisar('Leyendo la rúbrica…');
        try {
            const [tablas, bloques] = await Promise.all([
                leerTablasDeDocx(file),
                leerBloquesDeDocx(file, { saltos: true })
            ]);
            datos.rubrica = construirRubrica(tablas, bloques);
            archivos.rubrica = file.name;
            if (datos.actividad && datos.actividad.enlaceRubrica) {
                datos.actividad.enlaceRubrica.archivo = file.name.replace(/\.docx$/i, '');
            }
            $('#zona-rubrica').classList.add('dropzone--cargada');
            avisar('');
        } catch (e) {
            avisar('No se pudo leer la rúbrica: ' + e.message, true);
        }
        dibujar();
    }

    function quitar(cual) {
        datos[cual] = null;
        archivos[cual === 'actividad' ? 'guion' : 'rubrica'] = '';
        const zona = $(cual === 'actividad' ? '#zona-guion' : '#zona-rubrica');
        zona.classList.remove('dropzone--cargada');
        $(cual === 'actividad' ? '#input-guion' : '#input-rubrica').value = '';
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

    function codigoVerificador() {
        // La función se envía tal cual y se invoca con los datos ya resueltos.
        return '(' + window.VERIFICADOR_QA.toString() + ')(' + JSON.stringify(datos) + ');';
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
            `<span class="${datos.rubrica ? 'puesto' : ''}">${datos.rubrica ? '✓' : '○'} Rúbrica</span>`;

        const codigo = codigoVerificador();
        $('#codigo').value = codigo;
        $('#marcador').setAttribute('href', 'javascript:' + encodeURIComponent(codigo));
        dibujarRevision();
    }

    /* Se enseña por dónde entró el guion porque es lo que explica un conteo raro
       de textos: si dice "hoja de control" es que el Word no traía ni <h1> ni
       <h2> y el corte se adivinó. */
    function entradaLegible(entrada) {
        if (/^h\d$/.test(entrada || '')) return `la marca <${entrada}>`;
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
            const suma = r.criterios.reduce((n, c) => n + (Number(c.puntos[0]) || 0), 0);
            partes.push(`
                <div class="resumen-bloque">
                    <h3><span class="resumen-titulo"><i class="ph ph-list-checks"></i> Rúbrica</span>
                        <button class="btn-quitar" type="button" data-quitar="rubrica"
                                title="Quitar la rúbrica"><i class="ph ph-x"></i></button></h3>
                    <div class="resumen-dato"><span>Archivo</span><span><code>${escapar(archivos.rubrica)}</code></span></div>
                    <div class="resumen-dato"><span>Criterios</span><span>${r.criterios.length}</span></div>
                    <div class="resumen-dato"><span>Total del Word</span><span>${escapar(r.total || '—')}</span></div>
                    <div class="resumen-dato"><span>Suma del nivel más alto</span><span>${suma}${r.total && suma !== Number(r.total) ? ' ⚠️ no cuadra' : ''}</span></div>
                    <div class="resumen-dato"><span>Descriptores</span><span>${r.descriptores.length} de 5</span></div>
                </div>`);
        }
        /* Los dos Word tienen que ser de la MISMA actividad: con el guion de una
           y la rúbrica de otra, el verificador reporta errores que no existen. Se
           comparan los códigos (SM02S3AA3 contra SM2_S3_AA3_Rubrica.docx). */
        if (datos.actividad && datos.rubrica) {
            const a = datos.actividad.clave;
            const b = claveDeArchivo(archivos.rubrica);
            if (a && b && a !== b) {
                partes.unshift(`
                    <div class="aviso-pareja"><i class="ph ph-warning-circle"></i>
                    <span><strong>Estos dos Word no parecen de la misma actividad.</strong>
                    El guion pide guardar el archivo como
                    <code>${escapar(datos.actividad.codigoTexto)}</code> y la rúbrica se llama
                    <code>${escapar(archivos.rubrica)}</code>. Revisa antes de verificar.</span></div>`);
            }
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
        if (datos.rubrica) {
            const r = datos.rubrica;
            partes.push(`<div class="check-bloque">
                <h3><i class="ph ph-list-checks"></i> Criterios de la rúbrica (${r.criterios.length})</h3>
                <div class="qa-lista-textos">${r.criterios.map((c, i) => `
                    <div class="qa-linea"><span class="qa-etiqueta">Criterio ${i + 1}</span>
                    <span class="qa-texto">${escapar(c.nombre.split('\n')[0])}
                    <strong>· ${escapar(c.puntos.join(' / '))}</strong></span></div>`).join('')}
                </div>
                <p class="check-nota">Se coteja el texto del criterio, los cinco niveles con sus puntos y que la suma
                del nivel más alto dé ${escapar(r.total || 'el total del Word')}.</p></div>`);
        }
        caja.innerHTML = partes.join('');
    }

    /* --------------------------------------------------------------- Arranque */

    function init() {
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
