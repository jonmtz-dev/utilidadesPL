/* ==========================================================================
   Registro de herramientas del panel.
   Para agregar una herramienta nueva: crea su carpeta en /tools/<slug>/ con su
   index.html y añade un objeto aquí. El launcher se dibuja solo a partir de esto.

   status: 'ready' -> la tarjeta abre la herramienta
           'soon'  -> la tarjeta se muestra en gris como "Próximamente"
   icon:   nombre de icono Phosphor (https://phosphoricons.com) sin el prefijo 'ph-'
   accent: par de colores del degradado del icono
   moodle: version de Moodle para la que sirve ('3.11' o '5.1'). FUENTE UNICA:
           de aqui salen tanto la insignia de la tarjeta como la del encabezado
           de la herramienta. No la repitas en el HTML o se desincronizan.
   ========================================================================== */

const TOOLS = [
    {
        slug: 'convertidor-tablas',
        moodle: '5.1',
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
        moodle: '3.11',
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
        moodle: '5.1',
        title: 'Micrositio a Página',
        description: 'Convierte un micrositio .zip en un recurso Página: reescribe las imágenes a @@PLUGINFILE@@ y avisa qué se rompe.',
        icon: 'package',
        accent: ['#7048e8', '#22b8cf'],
        tags: ['Micrositios', 'Imágenes', 'ZIP'],
        url: 'tools/micrositio-a-pagina/index.html',
        status: 'ready'
    },
    {
        slug: 'adaptador-rubricas',
        moodle: '3.11',
        title: 'Adaptador de Rúbricas Moodle',
        description: 'Pega la tabla de una rúbrica (Word) y genera un script que la vacía en "Definir rúbrica": compara por nombre de criterio, nunca a ciegas.',
        icon: 'list-checks',
        accent: ['#0f9d58', '#5cc98a'],
        tags: ['Rúbricas', 'Calificación', 'Script'],
        url: 'tools/adaptador-rubricas/index.html',
        status: 'ready'
    },
    {
        slug: 'integrador-html-311',
        moodle: '3.11',
        title: 'Integrador HTML',
        description: 'Maqueta actividades por bloques, importa la estructura del Word y genera HTML con QA de textos y enlaces.',
        icon: 'layout',
        accent: ['#934C98', '#F05825'],
        tags: ['Actividades', 'Word', 'HTML', 'QA'],
        url: 'tools/integrador-html-311/index.html',
        status: 'ready'
    },
    {
        slug: 'bibliografias-margarita',
        moodle: '5.1',
        title: 'Bibliografías Margarita Maza',
        description: 'Agrega la clase nomediaplugin a los enlaces de YouTube para que Moodle no los convierta en reproductor incrustado.',
        icon: 'youtube-logo',
        accent: ['#FF0000', '#B20000'],
        tags: ['YouTube', 'Enlaces', 'HTML'],
        url: 'tools/bibliografias-margarita/index.html',
        status: 'ready'
    }
];
