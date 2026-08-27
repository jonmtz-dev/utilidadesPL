/* ==========================================================================
   Service Worker del Panel de Herramientas.

   ⚠️ AL PUBLICAR UNA VERSIÓN NUEVA: sube VERSION.
   El navegador detecta que este archivo cambió, instala el SW nuevo y la app
   muestra el aviso de "nueva versión". Si no la subes, el aviso no aparece.

   Va en la RAÍZ a propósito: un SW solo controla su carpeta y las de abajo, y
   necesitamos que controle también /tools/.

   Estrategia: red primero, caché como respaldo. Así el contenido siempre está
   fresco al tener internet (nadie se queda con una versión vieja pegada) y la
   app sigue abriendo sin conexión.
   ========================================================================== */

const VERSION = '1.57.0';
const CACHE = `panel-herramientas-v${VERSION}`;

// Rutas relativas a propósito: en GitHub Pages la app vive en un subdirectorio
// (/<nombre-del-repo>/), no en la raíz del dominio. Así el mismo código sirve
// en cualquier cuenta/repo sin tocar nada.
const APP_SHELL = [
    './',
    'index.html',
    'manifest.json',
    'assets/shared.css',
    'assets/launcher.css',
    'assets/launcher.js',
    'assets/tools.js',
    'assets/version-moodle.js',
    'assets/volver.js',
    'assets/reparto.js',
    'assets/paletas.js',
    'assets/tablas.js',
    'assets/zip.js',
    'assets/theme.js',
    'assets/pwa.js',
    'assets/scroll-pista.js',
    // La evidencia imprimible que comparten las dos herramientas de QA.
    'assets/evidencia-qa.js',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png',
    'assets/icons/icon-maskable-512.png',
    'assets/icons/apple-touch-icon.png',
    'assets/icons/favicon-32.png',
    // Los banners de la portada: sin ellos, la primera pantalla del panel se ve
    // vacía sin conexión.
    'assets/plataformas/prepa-en-linea.webp',
    'assets/plataformas/margarita-maza.webp',
    'tools/convertidor-tablas/index.html',
    'tools/convertidor-tablas/script.js',
    'tools/convertidor-tablas/styles.css',
    'tools/generador-bibliografias/index.html',
    'tools/generador-bibliografias/script.js',
    'tools/generador-bibliografias/styles.css',
    'tools/micrositio-a-pagina/index.html',
    'tools/micrositio-a-pagina/script.js',
    'tools/micrositio-a-pagina/styles.css',
    'tools/micrositio-a-pagina/hoja-moodle-default.js',
    'tools/adaptador-rubricas/index.html',
    'tools/adaptador-rubricas/script.js',
    'assets/docx.js',
    'tools/adaptador-rubricas/styles.css',
    'tools/integrador-html-311/index.html',
    'tools/integrador-html-311/script.js',
    'tools/integrador-html-311/styles.css',
    // Faltaban: sin ellos estas dos herramientas no abrían sin conexión.
    'assets/modulos-311.js',
    'tools/bibliografias-margarita/index.html',
    'tools/bibliografias-margarita/script.js',
    'tools/bibliografias-margarita/qa.js',
    'tools/bibliografias-margarita/verificador.js',
    'tools/bibliografias-margarita/styles.css',
    'tools/guion-a-pagina/index.html',
    'tools/guion-a-pagina/script.js',
    'tools/guion-a-pagina/componentes.js',
    'tools/guion-a-pagina/importar-html.js',
    'tools/guion-a-pagina/vista-previa.js',
    'tools/guion-a-pagina/styles.css',
    'tools/qa-51/index.html',
    'tools/qa-51/script.js',
    'tools/qa-51/verificador.js',
    'tools/qa-51/styles.css',
    'tools/qa-cuestionario-formativo/index.html',
    'tools/qa-cuestionario-formativo/script.js',
    'tools/qa-cuestionario-formativo/verificador.js',
    'tools/qa-cuestionario-formativo/styles.css'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE).then((cache) =>
            // addAll falla entero si un archivo falla; los pedimos uno por uno
            // para que un recurso caído no tumbe la instalación completa.
            Promise.all(
                APP_SHELL.map((url) =>
                    cache.add(new Request(url, { cache: 'reload' }))
                        .catch((err) => console.warn('[SW] No se pudo cachear', url, err))
                )
            )
        )
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((claves) => Promise.all(
                claves
                    .filter((clave) => clave.startsWith('panel-herramientas-') && clave !== CACHE)
                    .map((clave) => caches.delete(clave))
            ))
            .then(() => self.clients.claim())
    );
});

// La página pide activar el SW en espera cuando el usuario acepta actualizar.
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    if (req.method !== 'GET') return;

    const mismoOrigen = new URL(req.url).origin === self.location.origin;

    if (mismoOrigen) {
        // Red primero: siempre lo más nuevo si hay internet.
        event.respondWith(
            fetch(req)
                .then((res) => {
                    if (res && res.ok) {
                        const copia = res.clone();
                        caches.open(CACHE).then((c) => c.put(req, copia));
                    }
                    return res;
                })
                .catch(async () => {
                    /* `ignoreSearch` porque hay ligas del panel que llevan
                       query: la tarjeta de QA de Bibliografías abre la misma
                       herramienta con `?modo=qa`. Buscando por dirección
                       completa esa entrada no está en caché y sin conexión
                       caía al launcher en vez de abrir la herramienta. La query
                       aquí solo elige una pestaña; el archivo es el mismo. */
                    const cacheado = await caches.match(req, { ignoreSearch: true });
                    if (cacheado) return cacheado;
                    // Navegación sin conexión y sin caché: mandamos el launcher.
                    if (req.mode === 'navigate') {
                        const shell = await caches.match('index.html');
                        if (shell) return shell;
                    }
                    return Response.error();
                })
        );
        return;
    }

    // CDN (fuentes e iconos Phosphor): caché primero, así funcionan sin
    // conexión después de la primera visita.
    event.respondWith(
        caches.match(req).then((cacheado) =>
            cacheado ||
            fetch(req).then((res) => {
                const copia = res.clone();
                caches.open(CACHE).then((c) => c.put(req, copia));
                return res;
            }).catch(() => cacheado)
        )
    );
});
