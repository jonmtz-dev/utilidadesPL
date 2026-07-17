/* ==========================================================================
   Tema claro/oscuro compartido por el launcher y todas las herramientas.

   Se carga en el <head> SIN defer a propósito: aplica data-theme en <html>
   antes de que el navegador pinte, si no se vería un destello blanco al
   entrar en modo oscuro.

   El switch se inyecta solo en el .app-header de cada página, así que una
   herramienta nueva no tiene que maquetarlo: basta con incluir este script.
   ========================================================================== */
(function () {
    const STORAGE_KEY = 'panel-tema';
    const root = document.documentElement;

    function preferenciaDelSistema() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function leerTema() {
        // Sin elección guardada seguimos al sistema operativo.
        try {
            return localStorage.getItem(STORAGE_KEY) || preferenciaDelSistema();
        } catch (e) {
            // localStorage puede fallar en file:// con cookies bloqueadas.
            return preferenciaDelSistema();
        }
    }

    function aplicarTema(tema) {
        root.dataset.theme = tema;
        try {
            localStorage.setItem(STORAGE_KEY, tema);
        } catch (e) { /* Sin persistencia, pero el tema igual se aplica */ }
        sincronizarBotones(tema);
    }

    function sincronizarBotones(tema) {
        document.querySelectorAll('.theme-toggle button').forEach(btn => {
            btn.setAttribute('aria-pressed', String(btn.dataset.tema === tema));
        });
    }

    // Se aplica de inmediato, antes del primer pintado.
    root.dataset.theme = leerTema();

    function construirSwitch() {
        const header = document.querySelector('.app-header');
        if (!header || header.querySelector('.theme-toggle')) return;

        // El botón "Panel" ya existe en las herramientas; lo agrupamos con el
        // switch para que ambos queden alineados a la derecha.
        let acciones = header.querySelector('.header-actions');
        if (!acciones) {
            acciones = document.createElement('div');
            acciones.className = 'header-actions';
            header.appendChild(acciones);
        }

        const toggle = document.createElement('div');
        toggle.className = 'theme-toggle';
        toggle.setAttribute('role', 'group');
        toggle.setAttribute('aria-label', 'Tema de la interfaz');

        [
            { tema: 'light', icono: 'sun', titulo: 'Tema claro' },
            { tema: 'dark', icono: 'moon', titulo: 'Tema oscuro' }
        ].forEach(({ tema, icono, titulo }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.dataset.tema = tema;
            btn.title = titulo;
            btn.setAttribute('aria-label', titulo);
            btn.innerHTML = `<i class="ph ph-${icono}"></i>`;
            btn.addEventListener('click', () => aplicarTema(tema));
            toggle.appendChild(btn);
        });

        // El switch va antes del botón "Panel".
        const btnBack = header.querySelector('.btn-back');
        if (btnBack) acciones.appendChild(btnBack);
        acciones.insertBefore(toggle, acciones.firstChild);

        sincronizarBotones(root.dataset.theme);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', construirSwitch);
    } else {
        construirSwitch();
    }
})();
