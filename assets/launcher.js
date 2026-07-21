function initLauncher() {
    const grid = document.getElementById('tools-grid');
    const searchInput = document.getElementById('search-input');
    const noResults = document.getElementById('no-results');

    function buildCard(tool, index) {
        const isReady = tool.status === 'ready' && tool.url;
        const card = document.createElement(isReady ? 'a' : 'div');

        card.className = `tool-card glass-panel ${isReady ? 'tool-card--ready' : 'tool-card--soon'}`;
        card.style.animationDelay = `${index * 60}ms`;
        card.dataset.slug = tool.slug;
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

    function applyFilter() {
        const query = searchInput.value.trim().toLowerCase();
        let visible = 0;

        grid.querySelectorAll('.tool-card').forEach(card => {
            const match = !query || card.dataset.search.includes(query);
            card.classList.toggle('hidden', !match);
            if (match) visible++;
        });

        noResults.classList.toggle('hidden', visible > 0);
    }

    searchInput.addEventListener('input', applyFilter);

    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key === 'Escape' && document.activeElement === searchInput) {
            searchInput.value = '';
            applyFilter();
            searchInput.blur();
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
