/* ==========================================================================
   El botón de volver del encabezado de cada herramienta.

   Sin esto siempre regresaba a la portada ("¿para qué plataforma vas a
   maquetar?") y había que volver a elegir Prepa en Línea o Margarita Maza para
   seguir donde estabas. Ahora regresa a la lista de la plataforma con la que se
   entró, y lo dice: "← Margarita Maza".

   Cómo lo sabe: el launcher le pega a la liga de cada tarjeta un
   #plataforma=<versión>. Va en el hash y NO en la query a propósito —el hash no
   viaja en la petición—; con ?plataforma=… el Service Worker buscaría en caché
   por dirección completa, no encontraría la herramienta y sin conexión te
   mandaría al panel en vez de abrirla.

   El nombre sale de PLATAFORMAS (assets/tools.js), que es la fuente única: no
   se escribe en el HTML de ninguna herramienta, igual que la insignia de
   versión (assets/version-moodle.js).

   Si no viene marca —se abrió la herramienta directo, desde un favorito o desde
   la app instalada— no se toca nada: el botón sigue diciendo "Panel" y llevando
   a la portada, que es justo lo que hace falta ahí.
   ========================================================================== */

(function () {
    const MARCA = 'plataforma=';

    function ajustar() {
        const hash = decodeURIComponent(location.hash.slice(1));
        if (!hash.startsWith(MARCA)) return;
        const valor = hash.slice(MARCA.length);

        const volver = document.querySelector('.btn-back');
        if (!volver) return;

        // La liga se rearma siempre que venga marca, incluso con 'todas': así se
        // vuelve a la rejilla completa y no a la portada.
        volver.href = `../../index.html#${MARCA}${valor}`;

        if (typeof PLATAFORMAS === 'undefined') return;   // tools.js no cargó
        const plataforma = PLATAFORMAS.find(p => p.moodle === valor);
        if (!plataforma) return;                          // 'todas': el destino basta

        const nombre = plataforma.corto || plataforma.nombre;
        /* Se cambia solo el nodo de texto: dentro del botón vive el <i> de la
           flecha y reescribir el innerHTML lo borraría. */
        const texto = [...volver.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
        if (texto) texto.nodeValue = ` ${nombre}`;
        volver.title = `Volver a las herramientas de ${plataforma.nombre}`;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ajustar);
    } else {
        ajustar();
    }
})();
