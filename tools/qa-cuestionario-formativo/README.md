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

## Avisos del guion

Se calculan al soltar el Word, antes de generar el verificador, y salen en la
caja ámbar del resumen —uno por renglón y con la cuenta por delante—. Si no hay
ninguno se dice también, para que el ámbar signifique algo cuando aparezca.

- La pregunta N no tiene 4 opciones.
- La pregunta N no tiene exactamente una respuesta resaltada en morado.
- El morado y el `Correcta.`/`Incorrecta.` de una opción se contradicen.
- **Dos opciones idénticas dentro del mismo reactivo.** Es el bug de los
  reactivos gemelos una celda más abajo: el verificador emparejaría las dos con
  la misma respuesta de Moodle y el error saldría donde no es.
- **Celda de respuesta en blanco** (sin texto y sin imagen) o **sin
  retroalimentación**. Una opción puede no tener texto —las hay solo con
  imagen—, pero entonces tiene que traer la imagen.
- Reactivos fuera del rango de 5 a 10 que piden las indicaciones.
- Dos reactivos con el mismo enunciado.
- Numeración del guion no correlativa.

Los tres primeros y los dos de celdas vacías también marcan el reactivo en la
lista de la pestaña **Qué se revisa**, con la razón en una píldora ámbar
(`3 opciones`, `opciones repetidas`, `opción vacía`…), para ver *cuál* falla sin
leer el texto del aviso.

## Cómo se agrupan las filas (la trampa)

Cada reactivo ocupa varias filas de la tabla y los guiones escriben la celda
`Pregunta` de tres formas distintas:

| Forma | Cómo se ve en el Word |
|---|---|
| **Celda combinada** | El enunciado solo en la primera fila; Word marca las demás con `w:vMerge`. |
| **Celda vacía** | Sin combinar, pero las filas de continuación van en blanco. |
| **Enunciado repetido** | El mismo texto —número incluido— en las cuatro filas. |

Decidir solo por «el texto de la celda cambió» cubría las tres… hasta que
apareció un guion con **dos reactivos consecutivos de enunciado idéntico**
(`Primeros pasos a la Cultura digital`: la 5 y la 6 son iguales palabra por
palabra, solo cambia el número). Los dos se fusionaban en uno: el Word se leía
con 14 reactivos, la 5 quedaba con 8 opciones y en Moodle salían cuatro errores
de «no se encontró una opción del Word».

El orden de decisión de `abreReactivo()` es, por eso:

1. `w:vMerge` de continuación → la fila **sigue** con el reactivo en curso; lo
   dice el propio Word y no se discute.
2. Celda sin texto → sigue.
3. Hay número editorial (`5.`) en las dos → **abre reactivo nuevo si el número
   cambia**, aunque el enunciado sea idéntico.
4. Sin número, se compara el enunciado (es lo único que queda).

El campo `lectura` del modelo guarda con cuál de las tres formas se agrupó y
cuántas filas se leyeron; la pestaña **Qué se revisa** lo enseña. Cuando un
reactivo sale con un número de opciones distinto de 4 o sin respuesta correcta,
la lista lo marca en ámbar: casi siempre significa que dos filas se agruparon
donde no debían, y se ve aquí antes de ir a Moodle.

Dos reactivos con el mismo enunciado se leen bien, pero se avisan: casi siempre
son un descuido del guion.

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
