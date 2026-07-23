/* ==========================================================================
   Insignia "Moodle X.Y" en el encabezado de cada herramienta.

   No todas sirven para la misma plataforma: el editor de rúbricas y el de
   libros cambiaron entre 3.11 y 5.1, y usar la herramienta equivocada produce
   HTML que se ve bien aquí y falla allá.

   La versión NO se escribe en el HTML de cada herramienta: se lee del campo
   `moodle` de assets/tools.js, que es la fuente única. Si se repitiera en cada
   index.html, tarde o temprano una quedaría desactualizada — que es justo el
   problema que ya nos costó el hex #d8a7b6 duplicado en dos herramientas.

   Deduce a qué herramienta pertenece la página por su carpeta (/tools/<slug>/),
   así no hay que pasarle nada ni tocar el JS de cada herramienta.
   ========================================================================== */

(function () {
    function pintar() {
        if (typeof TOOLS === 'undefined') return;   // tools.js no cargó

        const partes = location.pathname.split('/').filter(Boolean);
        const iTools = partes.lastIndexOf('tools');
        const slug = iTools >= 0 ? partes[iTools + 1] : null;
        if (!slug) return;

        const tool = TOOLS.find(t => t.slug === slug);
        if (!tool || !tool.moodle) return;

        const header = document.querySelector('.app-header');
        if (!header || header.querySelector('.moodle-badge')) return;

        const badge = document.createElement('span');
        badge.className = `moodle-badge moodle-badge--${tool.moodle.replace('.', '-')}`;
        badge.innerHTML = `<i class="ph ph-plug"></i> Moodle ${tool.moodle}`;
        badge.title = `Esta herramienta está hecha para Moodle ${tool.moodle}`;

        // Antes del botón "Panel" para que quede junto al título y no descoloque
        // el botón de regreso, que siempre va al final.
        const volver = header.querySelector('.btn-back');
        if (volver) header.insertBefore(badge, volver);
        else header.appendChild(badge);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', pintar);
    } else {
        pintar();
    }
})();
