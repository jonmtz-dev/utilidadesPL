/* ==========================================================================
   Reparto de la pantalla: divisor arrastrable y vista previa ampliada.

   Editar y revisar piden anchos distintos —armar una tabla necesita el editor;
   ver si la página quedó bien necesita la previa—, así que el reparto no puede
   ser una decisión fija de CSS: se arrastra, se recuerda por herramienta y hay
   un clic para dejarle la pantalla entera a la previa.

   Vive aquí y no en el JS de cada herramienta porque la conducta es la misma en
   todas y ya se pagó una vez el precio de duplicar (el hex #d8a7b6 sobrevivió
   meses en una copia). Lo que SÍ decide cada herramienta es el ancho de sus
   columnas: eso va en su CSS, con la variable --col-editor.

   Contrato del CSS (el de la herramienta, no este archivo):

       .mi-workspace {
           grid-template-columns: var(--col-editor, <por omisión>) 20px minmax(0, 1fr);
           gap: 0;                              // el divisor hace de gutter
       }
       .mi-workspace.previa-max { grid-template-columns: minmax(0, 1fr); }
       .mi-workspace.previa-max .editor-panel,
       .mi-workspace.previa-max .divisor { display: none; }

   Uso:

       Reparto.iniciar({
           workspace: '#workspace',
           divisor:   '#divisor',
           editor:    '.editor-panel',
           clave:     'integrador-col-editor',   // dónde se recuerda
           colMin:    360,                        // lo mínimo para el editor
           restoMin:  520,                        // lo que se le reserva a la previa
           botonMax:  '#btn-previa-max'           // opcional
       });
   ========================================================================== */

window.Reparto = (function () {
    'use strict';

    function iniciar(opciones) {
        const ws = document.querySelector(opciones.workspace);
        const divisor = document.querySelector(opciones.divisor);
        if (!ws || !divisor) return null;

        const editor = opciones.editor || '.editor-panel';
        const colMin = opciones.colMin || 360;
        // Lo que se le reserva a la salida aunque se arrastre a lo bestia.
        const restoMin = opciones.restoMin || 480;
        const colMax = opciones.colMax || 760;
        const clave = opciones.clave;

        function fijarCol(px, recordar) {
            const ancho = ws.getBoundingClientRect().width;
            const tope = Math.max(colMin, Math.min(colMax, ancho - restoMin));
            const col = Math.round(Math.min(tope, Math.max(colMin, px)));
            ws.style.setProperty('--col-editor', `${col}px`);
            if (recordar !== false && clave) localStorage.setItem(clave, String(col));
        }

        // Sin recordar: el valor venía de una sesión anterior y volver a
        // guardarlo recortado por una ventana chica lo perdería para siempre.
        const guardado = clave && Number(localStorage.getItem(clave));
        if (guardado) fijarCol(guardado, false);

        let arrastrando = false;
        divisor.addEventListener('pointerdown', e => {
            e.preventDefault();
            arrastrando = true;
            divisor.classList.add('arrastrando');
            /* La captura es lo que permite arrastrar POR ENCIMA de la vista
               previa: cuando es un iframe se queda con los eventos del ratón y
               sin captura el divisor se congela a media pantalla. */
            try { divisor.setPointerCapture(e.pointerId); } catch (err) { /* los movimientos igual llegan a window */ }
        });
        // En window y no en el divisor: son 20px de ancho y el cursor se sale.
        window.addEventListener('pointermove', e => {
            if (arrastrando) fijarCol(e.clientX - ws.getBoundingClientRect().left);
        });
        const soltar = () => {
            arrastrando = false;
            divisor.classList.remove('arrastrando');
        };
        window.addEventListener('pointerup', soltar);
        window.addEventListener('pointercancel', soltar);

        // Doble clic: de vuelta al reparto por omisión (el del CSS).
        divisor.addEventListener('dblclick', () => {
            ws.style.removeProperty('--col-editor');
            if (clave) localStorage.removeItem(clave);
        });

        // Con el teclado: el divisor es enfocable, así que también se mueve.
        divisor.addEventListener('keydown', e => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const paso = (e.shiftKey ? 80 : 24) * (e.key === 'ArrowLeft' ? -1 : 1);
            const actual = document.querySelector(editor).getBoundingClientRect().width;
            fijarCol(actual + paso);
        });

        const boton = opciones.botonMax && document.querySelector(opciones.botonMax);

        function maximizar(forzar) {
            const max = forzar === undefined ? !ws.classList.contains('previa-max') : forzar;
            ws.classList.toggle('previa-max', max);
            if (!boton) return max;
            const icono = boton.querySelector('i');
            if (icono) icono.className = `ph ph-corners-${max ? 'in' : 'out'}`;
            boton.title = max ? 'Volver al editor (Esc)' : 'Ampliar la vista previa';
            boton.setAttribute('aria-pressed', String(max));
            return max;
        }

        if (boton) boton.addEventListener('click', () => maximizar());

        return { fijarCol, maximizar, maximizada: () => ws.classList.contains('previa-max') };
    }

    return { iniciar };
})();
