/* ==========================================================================
   Evidencia imprimible de una revisión de QA.

   La usan las dos herramientas de QA (Cuestionario Formativo y Actividad y
   Rúbrica). Vive aquí y no dentro de cada verificador porque el informe es el
   mismo documento con otros datos: duplicarlo era garantizar que en tres meses
   uno de los dos tuviera el pie de página viejo. Es el mismo error que dejó el
   componente `.aviso` copiado en dos herramientas.

   IMPORTANTE — esta función se SERIALIZA con `toString()` y se ejecuta dentro
   de Moodle, igual que los verificadores. Tiene que ser autocontenida: no puede
   usar nada de fuera de su propio cuerpo. Por eso recibe el texto de los
   hallazgos ya resaltado (`esperadoHtml` / `actualHtml`), que cada verificador
   arma con su propia función `diferencia()`: así el PDF enseña exactamente lo
   mismo que el panel, sin repetir aquí esa lógica.

   Abre una ventana y la manda a imprimir; el navegador ofrece "Guardar como
   PDF". No hay librería: un generador de PDF no cabe en un bookmarklet y de
   todas formas Moodle bloquearía el script externo.

   El <title> de la ventana es el nombre con que se guarda el archivo, y por eso
   `clave` importa: `QA_SM1S4-CF4`, `QA_M17_AI3`.
   ========================================================================== */

window.EVIDENCIA_QA = function (info) {
    'use strict';

    var ventana = window.open('', '_blank');
    if (!ventana) {
        alert('El navegador bloqueó la ventana de la evidencia.\n\n'
            + 'Permite las ventanas emergentes de este sitio y vuelve a pulsar “Generar evidencia”.');
        return;
    }

    // Se escapa con el documento de ESTA página, no con el de la ventana nueva:
    // esa todavía no tiene contenido cuando se arma el HTML.
    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function fechaLarga(d) {
        try {
            return d.toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
        } catch (_) { return d.toISOString().slice(0, 16).replace('T', ' '); }
    }

    var estilo = [
        '@page { size: A4; margin: 15mm 14mm; }',
        '* { box-sizing: border-box; }',
        'body { margin:0; font:12px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;',
        '  color:#1d1d1f; background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }',
        '.hoja { max-width: 780px; margin: 0 auto; padding: 26px 22px 40px; }',
        '.cabecera { display:flex; justify-content:space-between; align-items:flex-start; gap:18px;',
        '  border-bottom:2px solid #1d1d1f; padding-bottom:14px; margin-bottom:18px; }',
        '.marca { font-size:10.5px; letter-spacing:.13em; text-transform:uppercase; color:#6b6b70; font-weight:700; }',
        'h1 { font-size:21px; margin:5px 0 3px; letter-spacing:-.01em; }',
        '.subtitulo { color:#6b6b70; font-size:12px; }',
        '.veredicto { text-align:right; flex-shrink:0; }',
        '.sello { display:inline-block; padding:7px 14px; border-radius:999px; color:#fff;',
        '  font-weight:800; font-size:12.5px; letter-spacing:.04em; white-space:nowrap; }',
        '.conteo { margin-top:7px; font-size:11px; color:#6b6b70; }',
        '.ficha { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 22px;',
        '  border:1px solid #e3e3e6; border-radius:9px; padding:12px 14px; margin-bottom:20px; }',
        '.ficha div { display:flex; gap:8px; padding:3.5px 0; font-size:11.5px; border-bottom:1px solid #f2f2f4; }',
        '.ficha div:nth-last-child(-n+2) { border-bottom:0; }',
        '.ficha b { color:#6b6b70; font-weight:600; min-width:104px; flex-shrink:0; }',
        '.ficha span { color:#1d1d1f; word-break:break-word; }',
        'h2 { font-size:13px; margin:22px 0 9px; padding-bottom:5px; border-bottom:1px solid #e3e3e6;',
        '  display:flex; justify-content:space-between; align-items:baseline; }',
        'h2 em { font-style:normal; font-size:11px; color:#6b6b70; font-weight:500; }',
        '.item { border:1px solid #e3e3e6; border-left-width:4px; border-radius:0 8px 8px 0;',
        '  padding:9px 12px; margin:7px 0; break-inside:avoid; page-break-inside:avoid; }',
        '.item .que { display:flex; gap:7px; align-items:baseline; flex-wrap:wrap; }',
        '.item .grupo { flex-shrink:0; padding:2px 8px; border-radius:999px; color:#fff;',
        '  font-size:9px; font-weight:800; letter-spacing:.05em; text-transform:uppercase; }',
        '.item .motivo { font-weight:700; font-size:12.5px; }',
        '.err .grupo { background:#c62828; } .err .motivo { color:#c62828; }',
        '.avi .grupo { background:#ef6c00; } .avi .motivo { color:#ef6c00; }',
        '.inf .grupo { background:#1565c0; } .inf .motivo { color:#1565c0; }',
        '.linea { margin-top:5px; font-size:11.5px; white-space:pre-wrap; word-break:break-word; }',
        '.linea b { color:#6b6b70; font-weight:600; }',
        '.err { border-left-color:#c62828; background:#fffafa; }',
        '.avi { border-left-color:#ef6c00; background:#fffcf6; }',
        '.inf { border-left-color:#1565c0; background:#f8fbff; }',
        '.ok { border:1px solid #b7e0bf; background:#f2fbf4; border-radius:9px; padding:14px 16px; }',
        '.ok strong { color:#1e6b34; }',
        // Los avisos del guion son del Word, no de Moodle: bloque aparte para
        // que nadie los lea como fallas del montaje.
        'table.latex { width:100%; border-collapse:collapse; margin:6px 0 2px; font-size:10.5px; }',
        'table.latex th { text-align:left; font-weight:600; color:#5b6472; border-bottom:1px solid #d8dde3;',
        '  padding:4px 6px; font-size:9.5px; text-transform:uppercase; letter-spacing:.04em; }',
        'table.latex td { padding:4px 6px; border-bottom:1px solid #eceff2; vertical-align:top; }',
        'table.latex code { font-family:ui-monospace,Consolas,monospace; font-size:10.5px; }',
        'table.latex tr.malo td { background:#fdf1f1; color:#8c2b2b; }',
        'table.latex tr.malo code { font-weight:700; }',
        '.guion { border:1px solid #f0c98a; border-left-width:4px; background:#fffcf6;',
        '  border-radius:0 9px 9px 0; padding:11px 14px; margin-top:8px; break-inside:avoid; }',
        '.guion ul { margin:0; padding:0; list-style:none; }',
        '.guion li { position:relative; padding-left:13px; margin-top:4px; font-size:11.5px; }',
        '.guion li::before { content:""; position:absolute; left:2px; top:.5em; width:5px; height:5px;',
        '  border-radius:50%; background:#ef6c00; }',
        '.pie { margin-top:26px; padding-top:12px; border-top:1px solid #e3e3e6;',
        '  font-size:10.5px; color:#8a8a8f; line-height:1.6; }',
        '.firma { margin-top:22px; display:grid; grid-template-columns:1fr 1fr; gap:26px; break-inside:avoid; }',
        '.firma div { border-top:1px solid #b9b9be; padding-top:6px; font-size:10.5px; color:#6b6b70; }',
        'mark { background:#ffe082; padding:0 2px; border-radius:2px; }',
        '.barra { position:sticky; top:0; background:#1d1d1f; color:#fff; padding:9px 14px;',
        '  display:flex; gap:10px; align-items:center; justify-content:center; font-size:12px; }',
        '.barra button { border:0; border-radius:6px; padding:6px 14px; font:inherit; font-weight:600; cursor:pointer; }',
        '@media print { .barra { display:none; } .hoja { padding-top:0; } }'
    ].join('\n');

    var ahora = new Date();
    var hallazgos = info.hallazgos || [];
    var cuenta = function (nivel) {
        return hallazgos.filter(function (h) { return h.nivel === nivel; }).length;
    };
    var errores = cuenta('error'), avisos = cuenta('aviso'), infos = cuenta('info');
    var etiquetaEsperado = info.etiquetaEsperado || 'Debe decir';

    var h = [];
    h.push('<div class="barra"><span>Usa <b>Guardar como PDF</b> como destino de impresión.</span>');
    h.push('<button onclick="window.print()">Imprimir o guardar en PDF</button></div>');
    h.push('<div class="hoja">');
    h.push('<div class="cabecera"><div>');
    h.push('<div class="marca">Evidencia de revisión · ' + esc(info.tipo || 'QA') + '</div>');
    h.push('<h1>' + esc(info.titulo || 'Sin título') + '</h1>');
    h.push('<div class="subtitulo">' + esc(info.subtitulo || '') + '</div>');
    h.push('</div><div class="veredicto">');
    h.push('<span class="sello" style="background:' + (info.color || '#6b6b70') + '">'
        + esc(info.estado || '') + '</span>');
    h.push('<div class="conteo">' + errores + ' errores · ' + avisos + ' avisos'
        + (infos ? ' · ' + infos + ' informativos' : '') + '</div>');
    h.push('</div></div>');

    var ficha = (info.ficha || []).concat([
        ['Fecha de la revisión', fechaLarga(ahora)],
        ['Dirección revisada', location.href],
        ['Herramienta', 'Panel de Herramientas · ' + (info.herramienta || 'QA')]
    ]);
    h.push('<div class="ficha">');
    ficha.forEach(function (f) {
        h.push('<div><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></div>');
    });
    h.push('</div>');

    [['error', 'Errores', 'err', 'Hay que corregirlos en Moodle antes de liberar'],
        ['aviso', 'Avisos', 'avi', 'Requieren una mirada; no siempre son fallas'],
        ['info', 'Información', 'inf', 'Datos leídos de Moodle, sin juicio']]
        .forEach(function (tipo) {
            var lista = hallazgos.filter(function (x) { return x.nivel === tipo[0]; });
            if (!lista.length) return;
            h.push('<h2>' + tipo[1] + ' (' + lista.length + ')<em>' + tipo[3] + '</em></h2>');
            lista.forEach(function (x) {
                h.push('<div class="item ' + tipo[2] + '">');
                // Mismo encabezado que el panel: el motivo en una píldora del
                // color del nivel y el título al lado.
                h.push('<div class="que"><span class="grupo">' + esc(x.grupo) + '</span>'
                    + '<span class="motivo">' + esc(x.titulo) + '</span></div>');
                if (x.esperadoHtml) {
                    h.push('<div class="linea"><b>' + esc(etiquetaEsperado) + ':</b> ' + x.esperadoHtml + '</div>');
                }
                if (x.esperadoHtml || x.actualHtml) {
                    h.push('<div class="linea"><b>En Moodle:</b> ' + (x.actualHtml || '') + '</div>');
                }
                h.push('</div>');
            });
        });

    if (!errores && !avisos) {
        h.push('<div class="ok"><strong>Sin observaciones.</strong> '
            + esc(info.textoTodoBien || 'Lo revisado coincide con el Word.') + '</div>');
    }

    /* Lo que se detectó al LEER el Word, antes de mirar Moodle: reactivos
       duplicados, celdas vacías, fuera del rango de la indicación… No son
       fallas del montaje y por eso no entran en el conteo del veredicto, pero
       forman parte de la revisión y tienen que quedar en la evidencia. */
    var delGuion = info.avisosDelGuion || [];
    if (delGuion.length) {
        h.push('<h2>Avisos del guion (' + delGuion.length + ')'
            + '<em>Del Word, no del montaje: no cuentan en el veredicto</em></h2>');
        h.push('<div class="guion"><ul>');
        delGuion.forEach(function (a) { h.push('<li>' + esc(a) + '</li>'); });
        h.push('</ul></div>');
    }

    /* Inventario de fórmulas LaTeX. Lo pidió el área explícitamente: no basta
       con marcar los errores, la evidencia tiene que decir CUÁNTAS fórmulas se
       detectaron y CUÁLES, para poder contrastar contra el guion sin volver a
       abrir Moodle. Cada una se imprime ya envuelta en su delimitador para que
       se lea igual que en el editor. */
    var latex = info.latex || null;
    if (latex && latex.formulas && latex.formulas.length) {
        var mal = latex.formulas.filter(function (f) { return !f.correcto; }).length;
        h.push('<h2>Fórmulas LaTeX (' + latex.formulas.length + ')'
            + '<em>' + (mal
                ? mal + (mal === 1 ? ' con delimitador incorrecto' : ' con delimitador incorrecto')
                : 'todas entre \( y \), como debe ser') + '</em></h2>');
        h.push('<table class="latex"><thead><tr><th>Reactivo</th><th>Dónde</th>'
            + '<th>Fórmula</th><th>Delimitador</th></tr></thead><tbody>');
        latex.formulas.forEach(function (f) {
            h.push('<tr' + (f.correcto ? '' : ' class="malo"') + '>'
                + '<td>' + esc(String(f.numero)) + '</td>'
                + '<td>' + esc(f.donde || '') + '</td>'
                + '<td><code>' + esc(f.codigo || '') + '</code></td>'
                + '<td><code>' + esc(f.delimitador || '') + '</code>'
                + (f.correcto ? '' : ' ✗') + '</td></tr>');
        });
        h.push('</tbody></table>');
    } else if (latex && latex.nota) {
        h.push('<h2>Fórmulas LaTeX (0)<em>' + esc(latex.nota) + '</em></h2>');
    }

    h.push('<div class="firma"><div>Revisó (nombre y firma)</div><div>Visto bueno</div></div>');
    h.push('<div class="pie">' + esc(info.resumen || '') + '<br>');
    h.push('Esta revisión es automática y de <b>solo lectura</b>: no responde, no envía formularios y no '
        + 'guarda cambios en Moodle. ' + esc(info.notaAlcance || '') + '</div>');
    h.push('</div>');

    ventana.document.open();
    ventana.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8">'
        + '<title>QA_' + esc(info.clave || 'evidencia') + '</title>'
        + '<style>' + estilo + '</style></head><body>' + h.join('\n') + '</body></html>');
    ventana.document.close();
    // Sin la espera, Chrome imprime la hoja antes de aplicar los estilos.
    ventana.setTimeout(function () { ventana.focus(); ventana.print(); }, 400);
};
