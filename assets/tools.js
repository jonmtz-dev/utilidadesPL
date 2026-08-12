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

// Agrupadas por versión de Moodle a propósito: primero las de 3.11 y al final
// las de 5.1, para que en el panel se vean juntas las de cada plataforma.
// El launcher pinta en este mismo orden.
const TOOLS = [
    /* ---------- Moodle 3.11 ---------- */
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
    /* ---------- Moodle 5.1 ---------- */
    {
        slug: 'guion-a-pagina',
        moodle: '5.1',
        title: 'Guion Instruccional a Página',
        description: 'Arma la página visualmente desde el Word: acordeones, tablas, ventanas emergentes y tarjetas, sin escribir HTML.',
        icon: 'magic-wand',
        accent: ['#9d2248', '#d1607f'],
        tags: ['Guion', 'Word', 'Visual', 'HTML'],
        url: 'tools/guion-a-pagina/index.html',
        status: 'ready'
    },
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
        slug: 'qa-51',
        moodle: '5.1',
        title: 'QA de Actividad y Rúbrica',
        description: 'Coteja lo montado en Moodle contra el guion y la rúbrica en Word: textos, negritas, tablas, criterios y puntajes.',
        icon: 'shield-check',
        accent: ['#0f9d58', '#1f6f4a'],
        tags: ['QA', 'Revisión', 'Rúbricas', 'Word'],
        url: 'tools/qa-51/index.html',
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

/* ==========================================================================
   Plataformas: la pantalla de inicio del panel.

   Las herramientas de 3.11 y de 5.1 no se mezclan en el trabajo real —quien
   monta en Prepa en Línea no toca las de Margarita Maza—, así que el panel
   pregunta primero por la plataforma y luego enseña solo lo que aplica. Esto es
   lo único que hay que tocar para cambiar una imagen o un nombre; las
   herramientas siguen saliendo del campo `moodle` de TOOLS, que es la fuente
   única: aquí no se repite ninguna lista.

   Las imágenes vienen de los banners reales de cada plataforma, recortadas al
   MISMO encuadre (880x425) para que las dos tarjetas se vean igual de grandes.
   ========================================================================== */
const PLATAFORMAS = [
    {
        moodle: '3.11',
        nombre: 'Prepa en Línea SEP',
        // Cómo se llama en el botón de volver de cada herramienta, donde el
        // nombre largo no cabe. Mismo criterio que la insignia: se escribe una
        // sola vez, aquí.
        corto: 'Prepa en Línea',
        detalle: 'Rúbricas, bibliografías y actividades de la plataforma anterior',
        imagen: 'assets/plataformas/prepa-en-linea.webp',
        // El acento tiñe el brillo y el borde al pasar el cursor: es el verde de
        // su banner, no un color inventado.
        acento: '#a8bf2f'
    },
    {
        moodle: '5.1',
        nombre: 'Bachillerato Nacional Margarita Maza',
        corto: 'Margarita Maza',
        detalle: 'Tablas responsivas, micrositios y páginas de la plataforma nueva',
        imagen: 'assets/plataformas/margarita-maza.webp',
        acento: '#9d2248'
    }
];
