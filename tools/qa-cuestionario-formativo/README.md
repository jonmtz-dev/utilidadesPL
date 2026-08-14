# QA de Cuestionario Formativo · Moodle 5.1

Compara un cuestionario formativo ya montado en Moodle contra el guion Word de
producción. Comparte la interfaz y el patrón de verificador serializado del
`QA de Actividad y Rúbrica`, pero usa un modelo específico para cuestionarios.

## Qué toma del Word

- La tabla anidada cuyo encabezado es `Pregunta | Respuestas | Retroalimentación`.
- La respuesta correcta marcada con el resaltado magenta de Word.
- La palabra `Correcta.` de la retroalimentación como comprobación adicional.
- Las cuatro respuestas, sus retroalimentaciones, fórmulas e imágenes.
- Las indicaciones generales: entre 5 y 10 reactivos, dos intentos, calificación
  más alta, retroalimentación diferida, respuestas barajables, apertura a las
  00:00 y cierre en domingo a las 23:59.

Si el color magenta contradice `Correcta.` o el número de reactivos queda fuera
del rango, la herramienta lo avisa antes de generar el verificador.

## Qué hace dentro de Moodle

En la vista previa completa coteja el contenido visible sin depender del orden
de las opciones, ya que Moodle puede barajarlas. La numeración editorial al
inicio del enunciado (`6. Texto…`) y los números automáticos de listas o tablas
no se consideran parte del contenido. Las marcas editoriales de fórmulas
(`<Latex>`, `<Cod Lat>` y sus cierres) se comparan contra su representación
renderizada en Moodle. Con los enlaces de edición de la sesión docente realiza únicamente
solicitudes GET para leer:

- la edición de cada pregunta: respuesta única, porcentaje correcto y
  retroalimentación. Esta última debe ser idéntica —incluidas mayúsculas,
  acentos y puntuación— después de normalizar únicamente espacios y marcas
  técnicas de HTML; no usa el umbral flexible empleado para localizar
  preguntas y respuestas barajadas;
- `Editar ajustes`: intentos, método, comportamiento, opciones de revisión y
  fechas;
- `Preguntas`: puntajes individuales, suma y calificación máxima.

El emparejamiento inicial es flexible únicamente para localizar cada reactivo y
respuesta aunque estén barajados. Después de emparejarlos, los textos de
preguntas, respuestas y retroalimentaciones deben ser idénticos; cualquier
palabra añadida, eliminada o cambiada produce un error.
En las tablas internas se exige el mismo conjunto exacto de elementos, aunque
el recorrido técnico sea por columnas en Word y por filas en Moodle.

Los puntajes son informativos hasta que exista una regla institucional de total.
El verificador no responde, no envía formularios y no guarda cambios.

## Archivos

- `index.html`: interfaz de carga y entrega.
- `script.js`: lector del guion y generador del verificador.
- `verificador.js`: función autocontenida que se ejecuta en Moodle.
- `styles.css`: reutiliza deliberadamente el diseño del QA 5.1 y añade solo los
  elementos propios de las preguntas.
