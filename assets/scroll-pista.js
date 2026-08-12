/* ==========================================================================
   Pista de scroll compartida.

   Por qué existe: cuando una zona scrollea dentro de un panel, la barra nativa
   sale flotando a media pantalla y no se entiende qué se mueve. Aquí se marca
   cada zona con `mas-arriba` / `mas-abajo` según lo que quede fuera de vista;
   el CSS (`.scroll-sin-barra` + `.scroll-difuso` de shared.css) esconde la barra
   y difumina el borde, y si la zona trae `data-pista="#id"` esa píldora se
   enciende para anunciar que hay más y bajar al pulsarla.

   Uso:
     <div class="lienzo scroll-sin-barra scroll-difuso"
          data-pista-scroll data-pista="#pista-abajo"> …
   Todo `[data-pista-scroll]` se registra solo. Para una zona creada después,
   `window.pistaDeScroll(el)`; para recalcular a mano, `window.actualizarPistas()`.
   ========================================================================== */

(function () {
    'use strict';

    /* Tolerancia en px: sin ella, un scrollHeight con decimales enciende y apaga
       el difuminado solo en cada cuadro. */
    const MARGEN = 4;
    /* La píldora pide más: es un cartel que se mueve, y anunciarlo por el borde
       recortado de una tarjeta molesta más de lo que ayuda. */
    const MARGEN_PISTA = 24;

    const zonas = new Set();

    function medir(el) {
        const falta = el.scrollHeight - el.clientHeight - el.scrollTop;
        el.classList.toggle('mas-arriba', el.scrollTop > MARGEN);
        el.classList.toggle('mas-abajo', falta > MARGEN);
        const pista = el.dataset.pista && document.querySelector(el.dataset.pista);
        if (pista) pista.classList.toggle('hidden', falta <= MARGEN_PISTA);
    }

    let pendiente = false;
    function programar() {
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(() => {
            pendiente = false;
            zonas.forEach(medir);
        });
    }

    function registrar(el) {
        if (!el || zonas.has(el)) return;
        zonas.add(el);

        el.addEventListener('scroll', programar, { passive: true });

        /* Cambian por su cuenta las dos medidas del cálculo: el alto de la zona
           (la ventana) y el de su contenido (el launcher filtra tarjetas, el
           lienzo se redibuja entero). Hay que mirar ambas. El observador de
           atributos incluye a la propia zona, cuyas clases toca `medir`: eso
           dispara un cuadro extra y ahí se queda, porque la segunda medida ya no
           cambia nada. */
        new ResizeObserver(programar).observe(el);
        new MutationObserver(programar).observe(el, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });

        const pista = el.dataset.pista && document.querySelector(el.dataset.pista);
        if (pista) {
            pista.addEventListener('click', () => {
                el.scrollBy({ top: Math.round(el.clientHeight * 0.85), behavior: 'smooth' });
            });
        }

        medir(el);
    }

    function arrancar() {
        document.querySelectorAll('[data-pista-scroll]').forEach(registrar);
        window.addEventListener('resize', programar);
    }

    window.pistaDeScroll = registrar;
    window.actualizarPistas = programar;

    // Mismo patrón que el resto del proyecto: si el DOM ya está listo el evento
    // no vuelve a dispararse y la pista nunca se registraría.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', arrancar);
    } else {
        arrancar();
    }
})();
