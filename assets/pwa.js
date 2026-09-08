/* ==========================================================================
   PWA: registra el Service Worker, avisa cuando hay versión nueva y ofrece
   instalar la app.

   OJO: los Service Workers solo corren en HTTPS o localhost. Abriendo el
   index.html con doble clic (file://) la app funciona igual, pero NO se
   instala ni cachea. Para probar de verdad: GitHub Pages o
   python -m http.server.
   ========================================================================== */
(function () {
    // La app vive en un subdirectorio en GitHub Pages, así que la raíz se
    // deduce de la URL de este mismo script (…/assets/pwa.js -> …/) en vez de
    // asumir '/'.
    const RAIZ = new URL('../', document.currentScript.src);

    /* ---------------------------------------------------------------- Aviso */

    function mostrarAviso({ texto, accion, alAceptar, novedades = [], modal = false, version = '' }) {
        if (modal) return mostrarActualizacion({ texto, accion, alAceptar, novedades, version });
        document.querySelector('.toast')?.remove();

        const toast = document.createElement('div');
        toast.className = 'toast glass-panel';
        toast.setAttribute('role', 'status');

        const msg = document.createElement(novedades.length ? 'div' : 'span');
        msg.className = 'toast-texto';
        msg.textContent = texto;
        if (novedades.length) {
            toast.classList.add('toast-novedades');
            const lista = document.createElement('ul');
            lista.className = 'toast-resumen';
            novedades.forEach(texto => {
                const item = document.createElement('li');
                item.textContent = texto;
                lista.appendChild(item);
            });
            msg.appendChild(lista);
        }

        const btn = document.createElement('button');
        btn.className = 'toast-btn';
        btn.type = 'button';
        btn.textContent = accion;
        btn.addEventListener('click', () => {
            toast.remove();
            alAceptar();
        });

        const cerrar = document.createElement('button');
        cerrar.className = 'toast-cerrar';
        cerrar.type = 'button';
        cerrar.title = 'Cerrar';
        cerrar.setAttribute('aria-label', 'Cerrar');
        cerrar.innerHTML = '<i class="ph ph-x"></i>';
        cerrar.addEventListener('click', () => toast.remove());

        toast.append(msg, btn, cerrar);
        document.body.appendChild(toast);
    }

    function mostrarActualizacion({ texto, accion, alAceptar, novedades, version }) {
        if (document.querySelector('.pwa-actualizacion')) return;
        const cuadro = document.createElement('dialog');
        cuadro.className = 'pwa-actualizacion';
        cuadro.setAttribute('aria-labelledby', 'pwa-titulo');
        cuadro.setAttribute('aria-describedby', 'pwa-notas');
        cuadro.innerHTML = '<div class="pwa-emblema" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="5" y="5" width="22" height="22" rx="5"/><path d="M5 12h22M13 12v15M17 19h6m-3-3v6"/></svg></div><p class="pwa-version"></p><h2 id="pwa-titulo"></h2><div id="pwa-notas"></div><div class="pwa-progreso" aria-hidden="true"><span></span></div><p class="pwa-estado" role="status"></p><button type="button" class="btn-primary pwa-aceptar"></button>';
        cuadro.querySelector('.pwa-version').textContent = version ? 'Novedades · ' + version : 'Novedades';
        cuadro.querySelector('h2').textContent = texto;
        const notas = cuadro.querySelector('#pwa-notas');
        novedades.forEach(texto => { const p = document.createElement('p'); p.textContent = texto; notas.appendChild(p); });
        const boton = cuadro.querySelector('button');
        const estado = cuadro.querySelector('.pwa-estado');
        boton.textContent = accion;
        cuadro.addEventListener('cancel', e => e.preventDefault());
        cuadro.addEventListener('keydown', e => {
            if (e.key === 'Tab') { e.preventDefault(); boton.focus(); }
        });
        boton.addEventListener('click', () => {
            if (boton.disabled) return;
            boton.disabled = true;
            cuadro.classList.add('actualizando');
            boton.textContent = 'Actualizando…';
            estado.textContent = 'Aplicando la nueva versión. La página se recargará en un momento.';
            const reintentar = () => {
                cuadro.classList.remove('actualizando');
                boton.disabled = false;
                boton.textContent = 'Reintentar actualización';
                estado.textContent = 'La actualización está tardando. Puedes volver a intentarlo.';
            };
            // No cerrar el cuadro antes de que el SW confirme la activación.
            try { alAceptar(); setTimeout(reintentar, 15000); }
            catch { reintentar(); }
        });
        document.body.appendChild(cuadro);
        cuadro.showModal();
        boton.focus({ preventScroll: true });
    }

    /* ------------------------------------------------------ Service Worker */

    function registrarSW() {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.register(new URL('sw.js', RAIZ), { scope: RAIZ })
            .then((reg) => {
                // Si ya hay uno esperando (por ejemplo, se instaló en otra
                // pestaña), avisamos de una vez.
                if (reg.waiting && navigator.serviceWorker.controller) {
                    avisarActualizacion(reg.waiting);
                }

                reg.addEventListener('updatefound', () => {
                    const nuevo = reg.installing;
                    if (!nuevo) return;

                    nuevo.addEventListener('statechange', () => {
                        // Sin controller es la primera instalación, no una
                        // actualización: ahí no hay nada que avisar.
                        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
                            avisarActualizacion(nuevo);
                        }
                    });
                });

                // Buscar versión nueva al volver a la pestaña y cada 30 min.
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') reg.update();
                });
                setInterval(() => reg.update(), 30 * 60 * 1000);
            })
            .catch((err) => console.warn('[PWA] No se pudo registrar el SW:', err));

        // El SW nuevo tomó el control -> recargamos para estrenar la versión.
        let recargando = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (recargando) return;
            recargando = true;
            const cuadro = document.querySelector('.pwa-actualizacion');
            if (cuadro) {
                cuadro.classList.add('actualizando');
                cuadro.querySelector('button').disabled = true;
                cuadro.querySelector('.pwa-estado').textContent = 'Versión lista. Recargando la aplicación…';
            }
            // Dar un instante al navegador para pintar la transición de recarga.
            setTimeout(() => location.reload(), cuadro ? 650 : 0);
        });
    }

    async function avisarActualizacion(worker) {
        // Consultar al SW en espera evita mostrar las notas de la versión activa.
        // Un SW anterior puede no responder: conservar el aviso básico en ese caso.
        const datos = await new Promise(resolve => {
            const canal = new MessageChannel();
            const terminar = datos => {
                clearTimeout(limite);
                canal.port1.close();
                resolve(datos);
            };
            const limite = setTimeout(() => terminar(null), 1500);
            canal.port1.onmessage = e => terminar(e.data);
            try { worker.postMessage('CONSULTAR_NOVEDADES', [canal.port2]); }
            catch { terminar(null); }
        });
        if (worker.state !== 'installed') return;
        mostrarAviso({
            texto: 'Se actualizó la aplicación',
            modal: true,
            version: datos?.version || '',
            novedades: Array.isArray(datos?.novedades) ? datos.novedades.filter(n => typeof n === 'string') : [],
            accion: 'Actualizar',
            alAceptar: () => worker.postMessage('SKIP_WAITING')
        });
    }

    /* ---------------------------------------------------------- Instalación */

    let promptInstalar = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        // Evita el mini-infobar del navegador; lo ofrecemos nosotros.
        e.preventDefault();
        promptInstalar = e;
        construirBotonInstalar();
    });

    window.addEventListener('appinstalled', () => {
        promptInstalar = null;
        document.querySelector('.btn-install')?.remove();
    });

    function construirBotonInstalar() {
        const header = document.querySelector('.app-header');
        if (!header || header.querySelector('.btn-install')) return;

        // theme.js crea .header-actions; si aún no existe, la creamos.
        let acciones = header.querySelector('.header-actions');
        if (!acciones) {
            acciones = document.createElement('div');
            acciones.className = 'header-actions';
            header.appendChild(acciones);
        }

        const btn = document.createElement('button');
        btn.className = 'btn-install';
        btn.type = 'button';
        btn.innerHTML = '<i class="ph ph-download-simple"></i> Instalar';
        btn.addEventListener('click', async () => {
            if (!promptInstalar) return;
            promptInstalar.prompt();
            const { outcome } = await promptInstalar.userChoice;
            promptInstalar = null;
            if (outcome === 'accepted') btn.remove();
        });

        acciones.insertBefore(btn, acciones.firstChild);
    }

    /* ---------------------------------------------------------------- Init */

    function init() {
        registrarSW();
        // Si beforeinstallprompt llegó antes de que el DOM estuviera listo.
        if (promptInstalar) construirBotonInstalar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
