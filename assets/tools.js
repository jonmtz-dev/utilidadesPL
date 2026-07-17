/* ==========================================================================
   Registro de herramientas del panel.
   Para agregar una herramienta nueva: crea su carpeta en /tools/<slug>/ con su
   index.html y añade un objeto aquí. El launcher se dibuja solo a partir de esto.

   status: 'ready' -> la tarjeta abre la herramienta
           'soon'  -> la tarjeta se muestra en gris como "Próximamente"
   icon:   nombre de icono Phosphor (https://phosphoricons.com) sin el prefijo 'ph-'
   accent: par de colores del degradado del icono
   ========================================================================== */

const TOOLS = [
    {
        slug: 'convertidor-tablas',
        title: 'Convertidor de Tablas',
        description: 'Convierte tablas de Word o HTML crudo al formato responsivo de tarjetas (data-label) para Moodle.',
        icon: 'table',
        accent: ['#0066cc', '#00c6ff'],
        tags: ['Tablas', 'Responsive', 'HTML'],
        url: 'tools/convertidor-tablas/index.html',
        status: 'ready'
    },
    {
        slug: 'generador-bibliografias',
        title: 'Generador de Bibliografías',
        description: 'Convierte fuentes de consulta en párrafos HTML con sangría francesa y enlaces, sin vistas previas de YouTube.',
        icon: 'books',
        accent: ['#8C6793', '#D98522'],
        tags: ['Bibliografía', 'Enlaces', 'HTML'],
        url: 'tools/generador-bibliografias/index.html',
        status: 'ready'
    },
    {
        slug: 'micrositio-a-pagina',
        title: 'Micrositio a Página',
        description: 'Convierte un micrositio .zip en un recurso Página: reescribe las imágenes a @@PLUGINFILE@@ y avisa qué se rompe.',
        icon: 'package',
        accent: ['#7048e8', '#22b8cf'],
        tags: ['Micrositios', 'Imágenes', 'ZIP'],
        url: 'tools/micrositio-a-pagina/index.html',
        status: 'ready'
    }
];
