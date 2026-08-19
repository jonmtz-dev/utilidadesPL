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
        // Para qué encabezado de sección cuenta esta tarjeta.
        card.dataset.grupo = tool.grupo || '';
        card.dataset.search = [tool.title, tool.description, ...(tool.tags || [])]
            .join(' ')
            .toLowerCase();

        if (isReady) {
            card.href = tool.url;
            // El destino sin marca, para poder rearmar la liga cuando se sepa
            // de qué plataforma se entró (ver marcarLigas).
            card.dataset.url = tool.url;
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

    /* Encabezado de grupo. Va DENTRO de la misma rejilla, ocupando el renglón
       entero (`grid-column: 1 / -1`), y no en rejillas separadas: así el brillo
       que sigue al cursor, el filtro y la animación escalonada siguen siendo
       uno solo para todas las tarjetas. */
    function buildGroupHeader(grupo) {
        const cabecera = document.createElement('div');
        cabecera.className = 'grupo-titulo';
        cabecera.dataset.grupo = grupo.clave;
        cabecera.innerHTML = `
            <h2><i class="ph ph-${grupo.icono}"></i> ${grupo.nombre}</h2>
            <span>${grupo.detalle}</span>`;
        return cabecera;
    }

    /* Se dibuja grupo por grupo, y dentro de cada uno en el orden de TOOLS (que
       ya viene por versión de Moodle). Así, al ver todas, cada sección enseña
       primero las de 3.11 y luego las de 5.1, sin barajarse. */
    let indice = 0;
    GRUPOS.forEach(grupo => {
        const suyas = TOOLS.filter(t => t.grupo === grupo.clave);
        if (!suyas.length) return;
        grid.appendChild(buildGroupHeader(grupo));
        suyas.forEach(tool => grid.appendChild(buildCard(tool, indice++)));
    });

    // Una herramienta sin `grupo` no se queda fuera del panel: va al final.
    TOOLS.filter(t => !GRUPOS.some(g => g.clave === t.grupo))
        .forEach(tool => grid.appendChild(buildCard(tool, indice++)));

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
        const porGrupo = {};

        grid.querySelectorAll('.tool-card').forEach(card => {
            const deLaPlataforma = !plataforma || card.dataset.moodle === plataforma;
            const match = deLaPlataforma && (!query || card.dataset.search.includes(query));
            card.classList.toggle('hidden', !match);
            if (match) {
                visible++;
                porGrupo[card.dataset.grupo] = (porGrupo[card.dataset.grupo] || 0) + 1;
            }
        });

        /* El encabezado se esconde si su grupo se quedó sin tarjetas, y también
           si es el único que quedó en pantalla: en Prepa en Línea, que hoy no
           tiene QA, un "Montaje" solitario encima de todo no separa nada. Lo
           mismo al buscar algo que solo cae en un grupo. */
        const gruposEnPantalla = Object.keys(porGrupo).filter(g => g && porGrupo[g]).length;
        grid.querySelectorAll('.grupo-titulo').forEach(cabecera => {
            const tiene = porGrupo[cabecera.dataset.grupo] > 0;
            cabecera.classList.toggle('hidden', !tiene || gruposEnPantalla < 2);
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

    /* ---------------------------------------------------------------------
       De qué plataforma se entró

       Se guarda en el hash de la dirección y se le pega a la liga de cada
       tarjeta. Así el botón de volver de la herramienta —y el atrás del
       navegador— regresan a la lista donde estabas y no a la portada, que
       obligaba a volver a elegir Prepa en Línea o Margarita Maza cada vez.

       En el hash y NO en la query (?plataforma=…) a propósito: el hash no viaja
       en la petición. Con una query, el Service Worker busca en caché por
       dirección completa y sin conexión no encontraría ni index.html ni la
       herramienta; te dejaría en el panel en vez de abrir lo que pediste.
       --------------------------------------------------------------------- */

    const MARCA = 'plataforma=';

    // 'todas' es un valor de verdad: distingue "entré por Ver todas" de "vengo
    // sin marca", que es lo que abre la portada.
    function marcaActual() {
        return '#' + MARCA + (plataforma || 'todas');
    }

    function marcarLigas() {
        const marca = marcaActual();
        grid.querySelectorAll('a.tool-card').forEach(card => {
            card.href = card.dataset.url + marca;
        });
    }

    function recordarPlataforma() {
        // replaceState y no pushState: elegir plataforma no es una página nueva,
        // y con pushState el atrás del navegador se volvía un laberinto.
        history.replaceState(null, '', marcaActual());
    }

    function olvidarPlataforma() {
        history.replaceState(null, '', location.pathname + location.search);
    }

    /* Se llega con marca cuando se vuelve de una herramienta. Se entra directo a
       esa lista y sin la animación de la portada, que ahí sería un parpadeo. */
    function restaurarPlataforma() {
        const hash = decodeURIComponent(location.hash.slice(1));
        if (!hash.startsWith(MARCA)) return;
        const valor = hash.slice(MARCA.length);
        const elegida = PLATAFORMAS.find(p => p.moodle === valor);
        if (!elegida && valor !== 'todas') return;
        mostrarHerramientas(elegida || null, true);
    }

    function cuantasDe(version) {
        const n = TOOLS.filter(t => t.moodle === version).length;
        return `${n} herramienta${n === 1 ? '' : 's'}`;
    }

    function mostrarHerramientas(elegida, alInstante) {
        plataforma = elegida ? elegida.moodle : null;
        const acento = elegida ? elegida.acento : '';
        chip.style.setProperty('--acento', acento || 'var(--accent)');
        chipTexto.textContent = elegida ? `Moodle ${elegida.moodle} · ${elegida.nombre}` : 'Todas las herramientas';

        marcarLigas();
        recordarPlataforma();

        const entrar = () => {
            portada.classList.add('hidden');
            portada.classList.remove('saliendo');
            barra.classList.remove('hidden');
            rejilla.classList.remove('hidden');
            applyFilter();
            reanimarTarjetas();
        };

        // Al volver de una herramienta se entra sin transición: la portada ni
        // llegó a verse y animar su salida sería un parpadeo.
        if (alInstante) return entrar();

        // La portada se va animada y la rejilla entra: sin esto el cambio era un
        // corte seco. Las tarjetas ya traen su propia entrada escalonada.
        portada.classList.add('saliendo');
        setTimeout(entrar, 300);
    }

    function volverAlaPortada() {
        barra.classList.add('hidden');
        rejilla.classList.add('hidden');
        portada.classList.remove('hidden');
        searchInput.value = '';
        plataforma = null;
        olvidarPlataforma();
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

    // Va al final: necesita las tarjetas ya dibujadas para poder marcar sus ligas.
    restaurarPlataforma();

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
