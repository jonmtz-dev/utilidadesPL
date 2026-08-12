function initLauncher() {
    const grid = document.getElementById('tools-grid');
    const searchInput = document.getElementById('search-input');
    const noResults = document.getElementById('no-results');
    const portada = document.getElementById('portada');
    const opciones = document.getElementById('portada-opciones');
    const barra = document.getElementById('launcher-toolbar');
    const rejilla = document.getElementById('tools-viewport');
    const chip = document.getElementById('chip-plataforma');
    const chipTexto = document.getElementById('chip-texto');

    // Plataforma elegida en la portada; null = se están viendo todas.
    let plataforma = null;

    function buildCard(tool, index) {
        const isReady = tool.status === 'ready' && tool.url;
        const card = document.createElement(isReady ? 'a' : 'div');

        card.className = `tool-card glass-panel ${isReady ? 'tool-card--ready' : 'tool-card--soon'}`;
        card.style.animationDelay = `${index * 60}ms`;
        card.dataset.slug = tool.slug;
        // Con qué plataforma se filtra desde la portada. Sale del mismo campo
        // `moodle` que las insignias: aquí no se decide nada.
        card.dataset.moodle = tool.moodle || '';
        card.dataset.search = [tool.title, tool.description, ...(tool.tags || [])]
            .join(' ')
            .toLowerCase();

        if (isReady) {
            card.href = tool.url;
        } else {
            card.setAttribute('aria-disabled', 'true');
        }

        const icon = document.createElement('div');
        icon.className = 'tool-icon';
        icon.style.setProperty('--accent-from', tool.accent[0]);
        icon.style.setProperty('--accent-to', tool.accent[1]);
        icon.innerHTML = `<i class="ph ph-${tool.icon}"></i>`;

        // Insignia de versión: no todas las herramientas sirven para el mismo
        // Moodle (el editor de rúbricas y el de libros cambiaron entre 3.11 y
        // 5.1). Sale del campo `moodle` de tools.js, que es la fuente única.
        if (tool.moodle) {
            const badge = document.createElement('span');
            badge.className = `tool-moodle tool-moodle--${tool.moodle.replace('.', '-')}`;
            badge.textContent = `Moodle ${tool.moodle}`;
            badge.title = `Esta herramienta está hecha para Moodle ${tool.moodle}`;
            card.appendChild(badge);
            // Buscable: para poder filtrar escribiendo "3.11" en el buscador.
            card.dataset.search += ` moodle ${tool.moodle}`;
        }

        const title = document.createElement('h2');
        title.textContent = tool.title;

        const desc = document.createElement('p');
        desc.textContent = tool.description;

        const tags = document.createElement('div');
        tags.className = 'tool-tags';
        (tool.tags || []).forEach(label => {
            const tag = document.createElement('span');
            tag.className = 'tool-tag';
            tag.textContent = label;
            tags.appendChild(tag);
        });

        const footer = document.createElement('div');
        footer.className = 'tool-footer';
        footer.innerHTML = isReady
            ? 'Abrir <i class="ph ph-arrow-right"></i>'
            : '<i class="ph ph-clock"></i> Próximamente';

        card.append(icon, title, desc, tags, footer);
        return card;
    }

    TOOLS.forEach((tool, index) => grid.appendChild(buildCard(tool, index)));

    // El brillo radial de cada tarjeta sigue al cursor.
    grid.addEventListener('pointermove', (e) => {
        const card = e.target.closest('.tool-card');
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
        card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
    });

    /* El filtro es uno solo: la plataforma elegida en la portada Y lo que se
       escriba en el buscador. Así al escribir no se cuelan herramientas de la
       otra versión de Moodle, que es justo lo que la portada evita. */
    function applyFilter() {
        const query = searchInput.value.trim().toLowerCase();
        let visible = 0;

        grid.querySelectorAll('.tool-card').forEach(card => {
            const deLaPlataforma = !plataforma || card.dataset.moodle === plataforma;
            const match = deLaPlataforma && (!query || card.dataset.search.includes(query));
            card.classList.toggle('hidden', !match);
            if (match) visible++;
        });

        noResults.classList.toggle('hidden', visible > 0);
    }

    searchInput.addEventListener('input', applyFilter);

    /* ---------------------------------------------------------------------
       Portada: elegir plataforma

       La lista de herramientas NO se duplica aquí: cada tarjeta ya sabe su
       versión (`data-moodle`, que sale del campo `moodle` de TOOLS) y la portada
       solo enciende el filtro.
       --------------------------------------------------------------------- */

    function cuantasDe(version) {
        const n = TOOLS.filter(t => t.moodle === version).length;
        return `${n} herramienta${n === 1 ? '' : 's'}`;
    }

    function mostrarHerramientas(elegida) {
        plataforma = elegida ? elegida.moodle : null;
        const acento = elegida ? elegida.acento : '';
        chip.style.setProperty('--acento', acento || 'var(--accent)');
        chipTexto.textContent = elegida ? `Moodle ${elegida.moodle} · ${elegida.nombre}` : 'Todas las herramientas';

        // La portada se va animada y la rejilla entra: sin esto el cambio era un
        // corte seco. Las tarjetas ya traen su propia entrada escalonada.
        portada.classList.add('saliendo');
        setTimeout(() => {
            portada.classList.add('hidden');
            portada.classList.remove('saliendo');
            barra.classList.remove('hidden');
            rejilla.classList.remove('hidden');
            applyFilter();
            reanimarTarjetas();
        }, 300);
    }

    function volverAlaPortada() {
        barra.classList.add('hidden');
        rejilla.classList.add('hidden');
        portada.classList.remove('hidden');
        searchInput.value = '';
        plataforma = null;
        applyFilter();      // que la rejilla no quede con el filtro anterior puesto
        reanimarPortada();
    }

    // Reinicia la animación de entrada: sin quitar y volver a poner la clase, el
    // navegador no vuelve a correr un keyframe ya consumido.
    function reanimar(nodos, retraso) {
        nodos.forEach((nodo, i) => {
            nodo.style.animation = 'none';
            void nodo.offsetWidth;
            nodo.style.animation = '';
            nodo.style.animationDelay = `${i * retraso}ms`;
        });
    }
    const reanimarTarjetas = () => reanimar([...grid.querySelectorAll('.tool-card:not(.hidden)')], 60);
    const reanimarPortada = () => reanimar([...opciones.querySelectorAll('.plataforma')], 90);

    PLATAFORMAS.forEach((p, i) => {
        const b = document.createElement('button');
        b.className = 'plataforma';
        b.type = 'button';
        b.style.setProperty('--acento', p.acento);
        b.style.animationDelay = `${i * 90}ms`;
        b.setAttribute('aria-label', `Herramientas para Moodle ${p.moodle}: ${p.nombre}`);
        b.innerHTML = `
            <span class="plataforma-foto">
                <img src="${p.imagen}" alt="" width="880" height="425" loading="eager" decoding="async">
            </span>
            <span class="plataforma-cuerpo">
                <span class="plataforma-textos">
                    <span class="plataforma-version"><i class="ph ph-graduation-cap"></i> Moodle ${p.moodle}</span>
                    <span class="plataforma-nombre">${p.nombre}</span>
                    <span class="plataforma-detalle">${p.detalle}</span>
                    <span class="plataforma-cuenta">${cuantasDe(p.moodle)}</span>
                </span>
                <span class="plataforma-flecha"><i class="ph ph-arrow-right"></i></span>
            </span>`;
        b.addEventListener('click', () => mostrarHerramientas(p));
        opciones.appendChild(b);
    });

    document.getElementById('ver-todas').addEventListener('click', () => mostrarHerramientas(null));
    chip.addEventListener('click', volverAlaPortada);

    document.addEventListener('keydown', (e) => {
        // En la portada no hay buscador todavía: el atajo no debe hacer nada.
        const enPortada = !portada.classList.contains('hidden');

        if (e.key === '/' && !enPortada && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key === 'Escape') {
            // Primero limpia la búsqueda (haya foco o no, que es lo que se
            // espera); el segundo Escape ya vuelve a elegir plataforma.
            if (searchInput.value) {
                searchInput.value = '';
                applyFilter();
                return;
            }
            if (!enPortada) {
                searchInput.blur();
                volverAlaPortada();
            }
        }
    });
}

// Si el script llega tarde (DOM ya listo) el evento nunca se dispara, así que
// comprobamos el estado en vez de confiar solo en el listener.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLauncher);
} else {
    initLauncher();
}
