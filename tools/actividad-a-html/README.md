# Actividad de aprendizaje a HTML

Editor independiente de actividades para Moodle 5.1. Sigue la disposición del
Integrador HTML con siete bloques: sección, texto, pasos, lista, tabla, imagen
y enlace. No carga el editor ni el catálogo de Guion a Página.

Importa Word `.docx`, permite editar y reordenar los bloques y genera HTML para
la descripción de la actividad. Los pasos admiten incisos, textos, tablas e
imágenes. La evaluación permite completar un enlace; no convierte rúbricas.
El botón Estructura de AA ofrece las cinco secciones habituales.

`modelo.js` interpreta las marcas de los Word y genera las clases del aula:
`mainPlantilla23`, `estiloLista`, `tabla-responsive-cards` y `data-label`.
Las paletas proceden de `assets/paletas.js`; la vista previa combina una base
Bootstrap mínima con la hoja real de Moodle de Micrositio a Página. No se
modifica esa hoja. La salida no agrega `ms-convertido`; `pb-0` es opcional.

Al abrir HTML existente, los bloques sin editar conservan sus etiquetas y
atributos. Los formatos especiales quedan como HTML editable. Al modificar un
bloque, se genera con los componentes de AA. Se eliminan scripts y atributos
activos. Las imágenes extraídas del Word se pueden descargar: hay que subirlas
a Moodle y comprobar sus rutas. Los enlaces pendientes aparecen en un aviso.

Las referencias Word y HTML no siempre tienen el mismo contenido editorial:
se conserva el texto del Word al importarlo. Las tablas de título de una celda
marcan el inicio; los documentos sin esa estructura muestran un aviso y
conservan el trabajo abierto.

## Verificación

Servir la raíz con `python -m http.server 5510`. Playwright se proporciona desde
el entorno de desarrollo; no es dependencia de la aplicación.

```powershell
$env:PLAYWRIGHT_PATH = 'ruta/al/modulo/playwright'
$env:AA_EJEMPLOS_DIR = 'ruta/a/Ejemplos AA y rubricas moodle 5.1'
$env:AA_EVIDENCIA_DIR = 'ruta/temporal/para/evidencias'
node pruebas/actividad-a-html.cjs
```

La prueba comprueba cuatro Word, la conservación del DOM de cuatro HTML,
edición de pasos, paletas, espacio inferior, deshacer, archivo incorrecto,
descarga, temas y tablas móviles. Verifica que no se carguen archivos del Guion.
La comprobación del montaje final en Moodle requiere pegarlo en la plataforma.
