/* ==========================================================================
   Bibliografías Margarita Maza (Moodle 5.1)

   Dos modos, a propósito:

   1. **Desde Word** — el .docx de fuentes se vuelve la página completa de
      bibliografía: envoltorio `mainPlantilla23`, título con su rayita de color,
      dos columnas con línea divisoria y un `<p class="fuente">` por fuente.
      Es el formato cotejado contra una bibliografía YA PUBLICADA (345 fuentes,
      294 enlaces, todos con target="_blank" y los de YouTube con span.nolink).
   2. **Corregir HTML pegado** — la lógica original de esta herramienta, intacta:
      a los <a> de YouTube les agrega `class="nomediaplugin"`. NO se cambió a
      span.nolink a propósito: hay páginas ya montadas que dependen de ella.
   3. **Revisar lo montado** — el QA. Del Word sale un MARCADOR que se ejecuta
      sobre la página de Moodle y enmarca ahí mismo lo que no cuadra, igual que
      las otras dos herramientas de QA; y, para cuando eso no se puede, el mismo
      cotejo sobre un HTML pegado. El motor del cotejo es UNO (`qa.js`) y viaja
      serializado dentro del marcador: los dos caminos aplican las mismas
      reglas.

   Que los dos primeros modos usen marcas distintas es deliberado, no un
   descuido.

   Lo que se lee del Word lo hace `assets/docx.js` —el mismo lector de las otras
   tres herramientas— y las paletas salen de `assets/paletas.js`.
   ========================================================================== */

(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);

    const REGEX_URL = /(https?:\/\/[^\s<]+)/g;

    // Encabezados que el Word trae al inicio y NO son una fuente.
    const RE_TITULO = /^(bibliograf[ií]a|referencias?|fuentes?( de consulta)?|para saber m[áa]s)\.?$/i;

    const estado = { paleta: 'reg', archivo: '', qa: { fuentes: [], archivo: '', hipervinculos: null, informe: null } };

    /* ---------------------------------------------------------------------
       Modo 1: del Word a la página
       --------------------------------------------------------------------- */

    const escapar = (s) => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    /**
     * Del texto del Word al HTML de la fuente.
     *
     * El orden importa: primero se escapa, luego se convierten las marcas de
     * formato y al final se enlazan las URL. Enlazar antes escaparía el <a>
     * recién puesto, y las marcas tienen que aplicarse sobre texto ya escapado
     * para no romper etiquetas.
     *
     * Las cursivas del Word llegan como *texto* y las negritas como **texto**
     * (ver assets/docx.js). En una ficha bibliográfica la cursiva del título es
     * parte de la norma de citación, así que se conserva.
     */
    function formatear(texto) {
        var t = escapar(texto);
        /* Las tres estrellas van PRIMERO: un run del Word que es negrita y
           cursiva a la vez llega como ***texto***, y si se resolviera antes la
           negrita el sobrante partia las etiquetas (<strong><i>x</strong></i>). */
        t = t.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><i>$1</i></strong>');
        t = t.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/\*([^*\n]+?)\*/g, '<i>$1</i>');
        return enlazar(t);
    }

    /**
     * Enlaza las URL de un texto YA escapado.
     *
     * Los de YouTube van con `<span class="nolink">` DENTRO del <a>, que es la
     * forma exacta de la bibliografía publicada. Sin él, Moodle cambia el enlace
     * por un reproductor incrustado a media lista de fuentes.
     */
    function enlazar(texto) {
        return String(texto).replace(REGEX_URL, (url) => {
            const limpia = url.replace(/[.,;]+$/, '');   // la puntuación final no es del enlace
            const cola = url.slice(limpia.length);
            const esYouTube = /youtube\.com|youtu\.be/i.test(limpia);
            const dentro = esYouTube && $('#opt-nolink').checked
                ? `<span class="nolink">${limpia}</span>`
                : limpia;
            return `<a href="${limpia}" target="_blank">${dentro}</a>${cola}`;
        });
    }

    function fuentes() {
        return $('#input-fuentes').value.split('\n').map(l => l.trim()).filter(Boolean);
    }

    /** El HTML completo de la página, con el envoltorio del montaje real. */
    function construirHTML() {
        const lista = fuentes();
        if (!lista.length) return '';
        const titulo = ($('#titulo-pagina').value || 'Bibliografía').trim();
        // Las dos clases van juntas en el montaje: la primera reparte el texto en
        // columnas y la segunda dibuja la línea punteada entre ellas.
        const columnas = $('#opt-columnas').checked ? ' text-multicol text-multicol-rule' : '';
        /* `.fuente` ES la sangría francesa: el tema la define como
           text-indent:-25px + padding-left:25px. Con el interruptor apagado se
           publica un <p> pelado, sin sangría. */
        const clase = $('#opt-sangria').checked ? ' class="fuente"' : '';
        const parrafos = lista.map(f => `      <p${clase}>${formatear(f)}</p>`).join('\n');

        return `<!-- ============================================================
     CAMBIA AQUÍ EL TEMA: M01 | M02 | M03 | MM | reg
     ============================================================ -->
<div class="container-fluid mainPlantilla23 ${estado.paleta} pb-3 mw-100">

  <div class="row bloque">
    <div class="col-12">
      <div class="tituloUnidad">
        <h1 class="text-primary">${escapar(titulo)}</h1>
      </div>
    </div>
  </div>

  <hr>

  <div class="row bloque mt-4" id="fuentes">
    <div class="col-12${columnas}">
${parrafos}
    </div>
  </div>

</div>`;
    }

    /* La previa va en un <iframe> con la hoja real del tema, como en Guion
       Instruccional a Página: el CSS de Moodle trae selectores globales
       (body, #page…) y meterlo en el panel lo desfiguraría. Además la rayita del
       título y la línea entre columnas SALEN de esa hoja, así que sin ella la
       previa no diría nada. */
    function documentoPrevia(html) {
        return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #fff; color: #333340;
           font-family: "Atkinson Hyperlegible", Roboto, Helvetica, Arial, sans-serif; font-size: 16px; }
    .row { display: flex; flex-wrap: wrap; margin: 0 -12px; }
    .row > [class*="col-"] { padding: 0 12px; width: 100%; }
    .col-12 { flex: 0 0 100%; max-width: 100%; }
    .mt-4 { margin-top: 1.5rem; } .pb-3 { padding-bottom: 1rem; } .mw-100 { max-width: 100%; }
    hr { border: 0; border-top: 1px solid #d5dce3; margin: 1.5rem 0; }
    p { margin: 0 0 1rem; }
    h1 { font-size: 1.9rem; margin: 0 0 .5rem; font-weight: 500; }
</style>
<style>${window.HOJA_MOODLE_DEFAULT || ''}</style>
</head><body class="path-mod-page">${html}</body></html>`;
    }

    function refrescarSalida() {
        const html = construirHTML();
        $('#result-empty').classList.toggle('hidden', Boolean(html));
        $('#result-wrapper').classList.toggle('hidden', !html);
        $('#output-code').value = html;
        $('#preview-empty').classList.toggle('hidden', Boolean(html));
        $('#preview-caja').classList.toggle('hidden', !html);
        if (html) $('#preview-frame').srcdoc = documentoPrevia(html);
        listarEnlaces(html);
    }

    /** La pestaña de enlaces sirve en los dos modos: dice qué se protegió. */
    function listarEnlaces(html) {
        const anclas = [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
        const datos = anclas
            .filter(m => /youtube\.com|youtu\.be/i.test(m[1]))
            .map(m => ({
                url: m[1],
                status: /nolink|nomediaplugin/i.test(m[0]) ? 'existente' : 'nuevo'
            }));
        pintarEnlaces(datos, datos.filter(d => d.status === 'existente').length, 0);
    }

    function pintarEnlaces(datos, protegidos, yaEstaban) {
        $('#stat-corregidos').textContent = protegidos;
        $('#stat-existentes').textContent = yaEstaban;
        const hay = datos.length > 0;
        $('#stats-bar').classList.toggle('hidden', !hay);
        $('#links-list').classList.toggle('hidden', !hay);
        $('#links-empty').classList.toggle('hidden', hay);
        if (!hay) {
            $('#links-empty-text').textContent = 'No se encontraron enlaces de YouTube.';
            return;
        }
        $('#links-list').innerHTML = datos.map(l => `
            <li>
                <i class="ph ph-youtube-logo" style="color:#FF0000;font-size:20px"></i>
                <a href="${escapar(l.url)}" target="_blank" rel="noopener" class="link-url">${escapar(l.url)}</a>
                <span class="badge ${l.status}">${l.status === 'nuevo' ? 'Sin proteger' : 'Protegido'}</span>
            </li>`).join('');
    }

    /* ------------------------------------------------------------ El Word */

    async function cargarDocx(file) {
        if (!/\.docx$/i.test(file.name)) {
            avisoDocx('Ese archivo no es un .docx. Si está en .doc, ábrelo en Word y guárdalo como .docx.', false);
            return;
        }
        try {
            /* Con `cursivas: true` para que los títulos conserven su itálica:
               leerParrafosDeDocx() entrega texto plano y las perdía. */
            const bloques = await leerBloquesDeDocx(file, { cursivas: true });
            /* Quién separa las fuentes de lo que no lo es vive en qa.js, y lo
               usan los dos modos a propósito: así el guion largo —el que trae
               por delante la hoja de control con el módulo, los elaboradores y
               las indicaciones para producción— se lee igual al montar que al
               revisar. Antes ese formato colaba la marca `<h1>` como una fuente
               más. */
            const { fuentes, descartados } = QaBibliografia.fuentesDeBloques(bloques);
            if (!fuentes.length) {
                avisoDocx('El documento no tiene párrafos que se puedan usar como fuentes.', false);
                return;
            }
            estado.archivo = file.name;
            $('#input-fuentes').value = fuentes.map(f => f.texto).join('\n');
            avisoDocx(`${file.name} — ${fuentes.length} fuente(s)` +
                (descartados.length ? `, ${descartados.length} encabezado(s) omitido(s).` : '.') +
                ' Revísalas abajo antes de copiar el HTML.', true);
            refrescarSalida();
        } catch (e) {
            console.error('[biblio] docx:', e);
            avisoDocx('No se pudo leer el .docx: ' + e.message, false);
        }
    }

    function avisoDocx(texto, ok) {
        const p = $('#docx-info');
        p.textContent = texto;
        p.style.color = ok ? 'var(--success)' : 'var(--danger)';
    }

    /* ---------------------------------------------------------------------
       Modo 2: corregir el HTML pegado — LA LÓGICA ORIGINAL, sin cambios

       Sigue poniendo `class="nomediaplugin"` en el <a>, no span.nolink: hay
       páginas montadas con esa marca y cambiarla sería reescribirles el criterio
       a mitad del camino.
       --------------------------------------------------------------------- */

    function corregirPegado() {
        const crudo = $('#input-code').value;
        let corregidos = 0;
        let existentes = 0;
        const datos = [];

        const RE_A = /<a\b([^>]*)href=["']([^"']*(?:youtube\.com|youtu\.be)[^"']*)["']([^>]*)>/gi;

        const salida = crudo.replace(RE_A, (match, antes, url) => {
            if (/\bnomediaplugin\b/.test(match)) {
                existentes++;
                datos.push({ url, status: 'existente' });
                return match;
            }
            corregidos++;
            datos.push({ url, status: 'nuevo' });
            return /class=["']/i.test(match)
                ? match.replace(/class=(["'])/i, 'class=$1nomediaplugin ')
                : match.replace(/<a\b/i, '<a class="nomediaplugin"');
        });

        $('#output-code').value = salida;
        $('#result-empty').classList.add('hidden');
        $('#result-wrapper').classList.remove('hidden');
        pintarEnlaces(datos, corregidos, existentes);
        if (!datos.length) {
            $('#links-empty-text').textContent = 'No se encontraron enlaces de YouTube en el código proporcionado.';
        }
        activarTab('code');
    }

    /* ---------------------------------------------------------------------
       Modo 3: QA de lo montado

       El cotejo vive en `qa.js` y aquí solo se junta lo que necesita: las
       fuentes del Word y el HTML de la página. Se pide el HTML pegado —no un
       marcador que corra dentro de Moodle, como en las otras dos herramientas
       de QA— porque lo que hay que revisar está en el CÓDIGO: el `target` del
       enlace, el `span.nolink` y la clase `fuente`. Eso se lee tal cual en el
       editor de la Página, sin ejecutar nada.
       --------------------------------------------------------------------- */

    async function cargarDocxQa(file) {
        if (!/\.docx$/i.test(file.name)) {
            avisoQa('Ese archivo no es un .docx. Si está en .doc, ábrelo en Word y guárdalo como .docx.', false);
            return;
        }
        try {
            const bloques = await leerBloquesDeDocx(file, { cursivas: true });
            const { fuentes, descartados } = QaBibliografia.fuentesDeBloques(bloques);
            if (!fuentes.length) {
                avisoQa('El documento no tiene párrafos que se puedan usar como fuentes.', false);
                return;
            }
            estado.qa.fuentes = fuentes;
            estado.qa.archivo = file.name;
            // Solo lo trae el guion largo; con el corto se queda en null y ese
            // cotejo no se hace.
            estado.qa.hipervinculos = QaBibliografia.hipervinculosDeclarados(bloques);
            const conSangria = fuentes.filter(f => f.sangriaFrancesa).length;
            $('#zona-word-qa').classList.add('dropzone--cargada');
            avisoQa(`${file.name} — ${fuentes.length} fuente(s), ${conSangria} con sangría francesa` +
                (descartados.length ? `, ${descartados.length} encabezado(s) omitido(s)` : '') +
                (estado.qa.hipervinculos !== null ? `. El guion declara ${estado.qa.hipervinculos} hipervínculo(s)` : '') + '.', true);
            dibujarVerificador();
            revisarSiSePuede();
        } catch (e) {
            console.error('[biblio] docx qa:', e);
            avisoQa('No se pudo leer el .docx: ' + e.message, false);
        }
    }

    function avisoQa(texto, ok) {
        const p = $('#qa-docx-info');
        p.textContent = texto;
        p.style.color = ok ? 'var(--success)' : 'var(--danger)';
    }

    function revisarSiSePuede() {
        const listo = estado.qa.fuentes.length > 0 && $('#input-montado').value.trim() !== '';
        $('#btn-revisar').disabled = !listo;
        // Con el informe ya en pantalla se rehace solo: si acabas de corregir
        // algo en Moodle, pegas de nuevo y ves el resultado sin volver a pulsar.
        if (listo && estado.qa.informe) revisar();
    }

    function revisar() {
        const informe = QaBibliografia.revisar({
            fuentes: estado.qa.fuentes,
            html: $('#input-montado').value,
            hipervinculos: estado.qa.hipervinculos
        });
        estado.qa.informe = informe;
        pintarInforme(informe);
        activarTab('qa');
    }

    /* Diferencia resaltada: se recortan el prefijo y el sufijo comunes y se
       pinta lo de en medio. Es lo único que hace legible un "casi igual" de 300
       caracteres, y es el mismo criterio de las otras dos herramientas de QA. */
    function diferencia(esperado, actual) {
        const a = String(esperado || ''), b = String(actual || '');
        let i = 0, fa = a.length, fb = b.length;
        while (i < fa && i < fb && a[i] === b[i]) i++;
        while (fa > i && fb > i && a[fa - 1] === b[fb - 1]) { fa--; fb--; }
        const marca = (s) => s ? `<mark>${escapar(s)}</mark>` : '';
        return {
            esperado: escapar(a.slice(0, i)) + marca(a.slice(i, fa)) + escapar(a.slice(fa)),
            actual: b ? escapar(b.slice(0, i)) + marca(b.slice(i, fb)) + escapar(b.slice(fb))
                : '<em>no aparece</em>'
        };
    }

    /** El informe en pantalla: veredicto, datos del cotejo y los hallazgos. */
    function pintarInforme(informe) {
        $('#qa-empty').classList.add('hidden');
        $('#qa-informe').classList.remove('hidden');

        const sello = informe.errores ? 'error' : (informe.avisos ? 'aviso' : 'ok');
        const texto = informe.errores ? 'Hay que corregir'
            : (informe.avisos ? 'Revisar avisos' : 'Todo correcto');
        const icono = informe.errores ? 'x-circle' : (informe.avisos ? 'warning' : 'check-circle');
        $('#qa-veredicto').innerHTML =
            `<span class="qa-sello qa-sello--${sello}"><i class="ph ph-${icono}"></i> ${texto}</span>` +
            ` <span class="qa-veredicto-detalle">${informe.errores} error(es) · ${informe.avisos} aviso(s)` +
            `${estado.qa.archivo ? ' · ' + escapar(estado.qa.archivo) : ''}</span>`;

        const r = informe.resumen;
        const s = r.sangria || {};
        const datos = [
            ['file-doc', `<b>${r.fuentesWord}</b> fuentes en el Word`, false],
            ['browser', `<b>${r.fuentesMoodle}</b> párrafos en Moodle`, r.fuentesWord !== r.fuentesMoodle],
            ['check', `<b>${r.iguales}</b> idénticas`, false],
            ['link', `<b>${r.enlaces}</b> enlaces (${r.urlsWord} URL en el Word)`, r.enlaces !== r.urlsWord],
            ['youtube-logo', `<b>${r.youtube}</b> de YouTube`, false],
            ['text-indent', `Sangría francesa: Word <b>${s.word || '—'}</b> · Moodle <b>${s.moodleCon}/${s.moodleTotal}</b>`, false]
        ];
        if (r.estructura.envoltorio) {
            datos.push(['palette', `Paleta <b>${escapar(r.estructura.paleta || '—')}</b>`, !r.estructura.paleta]);
            datos.push(['columns', r.estructura.columnas ? 'Dos columnas' : 'Una columna', false]);
        }
        $('#qa-resumen').innerHTML = datos.map(([i, t, mal]) =>
            `<span class="qa-dato${mal ? ' qa-dato--mal' : ''}"><i class="ph ph-${i}"></i> ${t}</span>`).join('');

        const caja = $('#qa-hallazgos');
        if (!informe.hallazgos.length) {
            caja.innerHTML = '<div class="qa-todo-bien"><i class="ph ph-check-circle"></i>' +
                '<div>La página montada coincide con el Word: no falta ni sobra ninguna fuente, ' +
                'los enlaces abren en pestaña nueva y la sangría es la del documento.</div></div>';
            if (window.actualizarPistas) window.actualizarPistas();
            return;
        }
        const orden = { error: 0, aviso: 1 };
        const lista = informe.hallazgos.slice().sort((a, b) => orden[a.nivel] - orden[b.nivel]);
        caja.innerHTML = lista.map(h => {
            // 40 casos del mismo tipo no se leen; se enseñan los primeros y se
            // dice cuántos quedan. La evidencia imprimible los lleva todos.
            const visibles = h.items.slice(0, 40);
            const [etiEsperado, etiActual] = h.etiquetas || ['Word', 'Moodle'];
            const items = visibles.map(it => {
                const d = diferencia(it.esperado, it.actual);
                const filas = [];
                if (it.esperado) filas.push(`<div class="linea"><b>${escapar(etiEsperado)}:</b> <span>${d.esperado}</span></div>`);
                if (!h.sinLadoActual) {
                    filas.push(`<div class="linea"><b>${escapar(etiActual)}:</b> ` +
                        `<span>${it.actual ? d.actual : '<em>no aparece</em>'}</span></div>`);
                }
                return `<li class="qa-item">${filas.join('')}</li>`;
            }).join('');
            const resto = h.items.length - visibles.length;
            return `<div class="qa-bloque qa-bloque--${h.nivel}">
                <h3><span class="qa-grupo">${escapar(h.grupo)}</span> ${escapar(h.titulo)}
                    ${h.items.length ? `<span class="qa-cuenta">${h.items.length}</span>` : ''}</h3>
                <p class="qa-nota">${escapar(h.nota)}</p>
                ${items ? `<ul class="qa-items">${items}</ul>` : ''}
                ${resto > 0 ? `<p class="qa-mas">…y ${resto} más. Están todos en la evidencia.</p>` : ''}
            </div>`;
        }).join('');
        // La lista se acaba de rellenar: sin esto el difuminado del borde no
        // sabe que ya hay contenido de sobra y no se enciende.
        if (window.actualizarPistas) window.actualizarPistas();
    }

    /** El informe como texto, para pegarlo en un correo o en un ticket. */
    function textoDelInforme(informe) {
        const lineas = [`QA de bibliografía — ${estado.qa.archivo || 'sin archivo'}`,
            `${informe.errores} error(es) · ${informe.avisos} aviso(s)`,
            `${informe.resumen.fuentesWord} fuentes en el Word · ${informe.resumen.fuentesMoodle} párrafos en Moodle`,
            ''];
        informe.hallazgos.forEach(h => {
            lineas.push(`[${h.nivel.toUpperCase()}] ${h.grupo} — ${h.titulo}${h.items.length ? ` (${h.items.length})` : ''}`);
            if (h.nota) lineas.push(`  ${h.nota}`);
            const [etiEsperado, etiActual] = h.etiquetas || ['Word', 'Moodle'];
            h.items.forEach(it => {
                if (it.esperado) lineas.push(`  ${etiEsperado}: ${it.esperado}`);
                if (!h.sinLadoActual) lineas.push(`  ${etiActual}: ${it.actual || '(no aparece)'}`);
                lineas.push('');
            });
            lineas.push('');
        });
        return lineas.join('\n');
    }

    /* La misma evidencia imprimible de las otras dos herramientas de QA
       (assets/evidencia-qa.js): el área la archiva como PDF. */
    function generarEvidencia() {
        const informe = estado.qa.informe;
        if (!informe) return;
        const hallazgos = [];
        informe.hallazgos.forEach(h => {
            if (!h.items.length) {
                hallazgos.push({ nivel: h.nivel, grupo: h.grupo, titulo: h.titulo + ' — ' + h.nota });
                return;
            }
            h.items.forEach(it => {
                const d = diferencia(it.esperado, it.actual);
                hallazgos.push({
                    nivel: h.nivel, grupo: h.grupo, titulo: h.titulo,
                    esperadoHtml: it.esperado ? d.esperado : '',
                    actualHtml: it.actual ? d.actual : '<em>no aparece</em>'
                });
            });
        });
        const r = informe.resumen;
        window.EVIDENCIA_QA({
            hallazgos,
            tipo: 'Bibliografía',
            titulo: r.estructura.titulo || 'Bibliografía',
            subtitulo: estado.qa.archivo,
            clave: (estado.qa.archivo || 'bibliografia').replace(/\.docx$/i, ''),
            herramienta: 'Bibliografías Margarita Maza',
            estado: informe.errores ? 'HAY QUE CORREGIR' : (informe.avisos ? 'CON AVISOS' : 'CORRECTO'),
            color: informe.errores ? '#c62828' : (informe.avisos ? '#ef6c00' : '#2e7d32'),
            url: 'HTML pegado desde el editor de Moodle',
            etiquetaEsperado: 'En el Word',
            ficha: [
                ['Fuentes en el Word', String(r.fuentesWord)],
                ['Párrafos en Moodle', String(r.fuentesMoodle)],
                ['Fuentes idénticas', String(r.iguales)],
                ['Enlaces montados', `${r.enlaces} (${r.youtube} de YouTube)`],
                ['Sangría francesa', `Word: ${r.sangria.word || '—'} · Moodle: ${r.sangria.moodleCon} de ${r.sangria.moodleTotal}`],
                ['Paleta del aula', r.estructura.paleta || '—']
            ],
            textoTodoBien: 'La página montada coincide con el Word.',
            resumen: 'Revisión de la bibliografía montada contra el Word de fuentes.',
            notaAlcance: 'Se coteja el HTML pegado desde el editor de la Página.'
        });
    }

    /* ------------------------------------------------------- El marcador

       Se manda a Moodle el motor del cotejo (`qa.js`), el generador de
       evidencia (`assets/evidencia-qa.js`) y el verificador, los tres con
       `toString()`; los dos primeros van como argumento y NO se cuelgan de
       `window` para no dejar rastro en la página revisada. Es el mismo armado
       que usan QA de Actividad y QA de Cuestionario. */
    function codigoVerificador() {
        const paquete = {
            fuentes: estado.qa.fuentes,
            hipervinculos: estado.qa.hipervinculos,
            archivo: estado.qa.archivo,
            // Da nombre al PDF de la evidencia: QA_<nombre del Word>.
            clave: (estado.qa.archivo || 'bibliografia').replace(/\.docx$/i, '')
        };
        return 'void (function () {\n'
            + 'var motor = ' + window.MOTOR_QA_BIBLIO.toString() + ';\n'
            + 'var evidencia = ' + window.EVIDENCIA_QA.toString() + ';\n'
            + '(' + window.VERIFICADOR_BIBLIO.toString() + ')('
            + JSON.stringify(paquete) + ', motor, evidencia);\n'
            + '}());';
    }

    function dibujarVerificador() {
        const hay = estado.qa.fuentes.length > 0;
        $('#verificador-vacio').classList.toggle('hidden', hay);
        $('#verificador-caja').classList.toggle('hidden', !hay);
        if (!hay) return;
        const codigo = codigoVerificador();
        $('#codigo-verificador').value = codigo;
        $('#marcador').setAttribute('href', 'javascript:' + encodeURIComponent(codigo));
        // El texto del enlace es el nombre que toma el favorito al arrastrarlo.
        $('#marcador-nombre').textContent = 'QA_' + (estado.qa.archivo || 'bibliografia').replace(/\.docx$/i, '');
        if (window.actualizarPistas) window.actualizarPistas();
    }

    /* ---------------------------------------------------------------- UI */

    function activarTab(nombre) {
        document.querySelectorAll('.tab-btn').forEach(t =>
            t.classList.toggle('active', t.dataset.target === nombre));
        document.querySelectorAll('.tab-content').forEach(c =>
            c.classList.toggle('active', c.id === `${nombre}-content`));
    }

    function activarModo(modo) {
        document.querySelectorAll('.modo-btn').forEach(b => {
            const activo = b.dataset.modo === modo;
            b.classList.toggle('active', activo);
            b.setAttribute('aria-selected', String(activo));
        });
        document.querySelectorAll('.modo-panel').forEach(p =>
            p.classList.toggle('activo', p.id === `modo-${modo}`));
        // Cada pestaña declara en qué modos vive (`data-modos` del HTML): la
        // previa no dice nada del HTML pegado, ni el informe fuera del QA.
        document.querySelectorAll('.tab-btn').forEach(t => {
            const modos = (t.dataset.modos || '').split(' ').filter(Boolean);
            t.classList.toggle('hidden', modos.length > 0 && !modos.includes(modo));
        });
        if (modo === 'word') { refrescarSalida(); activarTab('preview'); }
        else if (modo === 'qa') activarTab(estado.qa.informe ? 'qa' : 'verificador');
        else activarTab('code');
    }

    /* El modo con el que se entra. El panel tiene DOS tarjetas para esta
       herramienta —una en Montaje y otra en Revisión · QA— y la segunda apunta
       aquí con `?modo=qa`. Sin esto, quien entrara por la de QA caería en la
       pantalla de montar. */
    function modoDeLaLiga() {
        const pedido = new URLSearchParams(location.search).get('modo') || '';
        return ['word', 'pegar', 'qa'].includes(pedido) ? pedido : '';
    }

    function dibujarPaletas() {
        const caja = $('#modulos');
        PALETAS.forEach(p => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'modulo' + (p.clase === estado.paleta ? ' activo' : '');
            b.dataset.clase = p.clase;
            b.title = `${p.nombre} (clase ${p.clase})`;
            b.innerHTML = `<span class="modulo-color" style="background:${p.color}"></span><span>${p.clase}</span>`;
            b.addEventListener('click', () => {
                estado.paleta = p.clase;
                caja.querySelectorAll('.modulo').forEach(x =>
                    x.classList.toggle('activo', x.dataset.clase === estado.paleta));
                refrescarSalida();
            });
            caja.appendChild(b);
        });
    }

    /* Una sola zona para los dos modos que piden un Word: recibe a quién
       avisar. Antes estaba escrita contra los id del modo 1. */
    function prepararZona(idZona, idInput, cargar) {
        const zona = $(idZona);
        const input = $(idInput);
        zona.addEventListener('click', () => input.click());
        zona.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
        });
        input.addEventListener('change', () => input.files[0] && cargar(input.files[0]));
        ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault(); zona.classList.add('dropzone--active');
        }));
        ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => {
            e.preventDefault(); zona.classList.remove('dropzone--active');
        }));
        zona.addEventListener('drop', e => e.dataTransfer.files[0] && cargar(e.dataTransfer.files[0]));
    }

    function init() {
        dibujarPaletas();
        prepararZona('#dropzone', '#input-docx', cargarDocx);
        prepararZona('#zona-word-qa', '#input-docx-qa', cargarDocxQa);

        document.querySelectorAll('.modo-btn').forEach(b =>
            b.addEventListener('click', () => activarModo(b.dataset.modo)));
        document.querySelectorAll('.tab-btn').forEach(t =>
            t.addEventListener('click', () => activarTab(t.dataset.target)));

        // Modo Word: todo lo que cambie la salida la vuelve a armar.
        ['#input-fuentes', '#titulo-pagina'].forEach(sel =>
            $(sel).addEventListener('input', refrescarSalida));
        ['#opt-columnas', '#opt-nolink', '#opt-sangria'].forEach(sel =>
            $(sel).addEventListener('change', refrescarSalida));

        // Modo pegar: la lógica de siempre.
        $('#input-code').addEventListener('input', () => {
            $('#btn-process').disabled = $('#input-code').value.trim() === '';
        });
        $('#btn-process').addEventListener('click', corregirPegado);

        // Modo QA.
        $('#btn-copiar-verificador').addEventListener('click', () => {
            const ta = $('#codigo-verificador');
            if (!ta.value.trim()) return;
            const i = $('#btn-copiar-verificador i');
            navigator.clipboard.writeText(ta.value).then(() => {
                i.className = 'ph ph-check';
                setTimeout(() => { i.className = 'ph ph-copy'; }, 2000);
            }).catch(() => { ta.focus(); ta.select(); });
        });
        $('#input-montado').addEventListener('input', revisarSiSePuede);
        $('#btn-revisar').addEventListener('click', revisar);
        $('#btn-evidencia').addEventListener('click', generarEvidencia);
        $('#btn-copiar-informe').addEventListener('click', () => {
            if (!estado.qa.informe) return;
            const i = $('#btn-copiar-informe i');
            navigator.clipboard.writeText(textoDelInforme(estado.qa.informe)).then(() => {
                i.className = 'ph ph-check';
                setTimeout(() => { i.className = 'ph ph-copy'; }, 2000);
            }).catch(() => {
                // El portapapeles lo puede negar el navegador (pestaña sin
                // foco, permiso denegado). Sin este aviso el botón se quedaba
                // igual y parecía que sí había copiado.
                i.className = 'ph ph-warning';
                setTimeout(() => { i.className = 'ph ph-copy'; }, 2000);
            });
        });

        $('#btn-copy').addEventListener('click', () => {
            const ta = $('#output-code');
            if (!ta.value.trim()) return;
            navigator.clipboard.writeText(ta.value).then(() => {
                const i = $('#btn-copy i');
                i.className = 'ph ph-check';
                i.style.color = 'var(--success)';
                setTimeout(() => { i.className = 'ph ph-copy'; i.style.color = ''; }, 2000);
            }).catch(() => { ta.focus(); ta.select(); });
        });

        const inicial = modoDeLaLiga();
        if (inicial) activarModo(inicial);

        const reparto = Reparto.iniciar({
            workspace: '#workspace',
            divisor: '#divisor',
            clave: 'biblio-col-editor',
            colMin: 360,
            restoMin: 460,
            botonMax: '#btn-previa-max'
        });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && reparto) reparto.cerrarAmpliado();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
