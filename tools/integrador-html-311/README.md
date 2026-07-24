# Integrador HTML para Moodle 3.11

Herramienta visual para convertir el contenido editorial de actividades y
proyectos integradores en HTML compatible con el CSS institucional de Moodle
3.11. No intenta sustituir el criterio de maquetación: acelera la estructura
repetitiva, conserva las señales útiles del Word y deja el resultado editable.

## Para qué sirve

Los documentos Word de actividades contienen dos zonas distintas:

1. Portada, control editorial e indicaciones internas que **no** se publican.
2. Contenido para Moodle: una tabla de una celda sombreada para el título y
   otras tablas iguales como barras de sección, seguidas de texto, listas,
   tablas, imágenes y enlaces.

La herramienta toma la primera barra como inicio del contenido Moodle. El
usuario escoge el módulo y obtiene sus clases `prepa-M{n}-*`, por lo que el
color no se escribe manualmente ni se desincroniza del CSS 3.11.

## Flujo de trabajo

1. Selecciona el módulo. La paleta representa fondo, barra y contenido.
2. Importa el `.docx`. Se ignora lo anterior a la primera tabla de una celda.
3. Revisa los bloques importados y corrige lo necesario.
4. Comprueba la vista previa, que es una isla clara porque Moodle 3.11 se ve
   claro aunque el panel esté en tema oscuro.
5. Genera el HTML y pégalo en la vista de código de Moodle.
6. Guarda y abre la actividad publicada. Genera un QA nuevo y ejecútalo desde
   la consola o el marcador.

## Lectura del Word

`assets/docx.js` lee el XML del `.docx` sin bibliotecas externas. Para esta
herramienta expone `leerBloquesDeDocx()` en el mismo orden del documento.

- Una tabla de una celda es título principal o barra de sección.
- Los párrafos mantienen su texto y alineación: izquierda, justificada,
  centrada o derecha.
- Las **negritas** del Word se conservan como marcas `**texto**` (los runs
  contiguos con el mismo formato se fusionan). Al generar se vuelven
  `<strong>`; también se pueden teclear a mano en cualquier bloque de texto,
  sección o lista. El QA compara el texto sin las marcas, como lo muestra
  Moodle.
- La numeración se consulta en `word/numbering.xml`, no se adivina por el
  texto. Se distingue viñeta, decimal, letras y romanos, además de su nivel.
- Cada lista conserva `numId`; si una lista decimal vuelve después de una
  sublista de letras, el HTML usa `start="4"` (o el número que corresponda)
  para no reiniciar en 1.
- Las marcas de guía `<h2>` y `<Lista numerada; ...>` se descartan: son
  instrucciones de Word, no contenido publicable.
- Las **tablas reales de contenido** (más de una celda) se importan como
  bloques Tabla respetando lo que trae el Word: celdas combinadas
  (`gridSpan` → colspan), el color de sombreado del encabezado, una primera
  fila combinada como fila título ("Variable:") y las filas vacías de
  plantilla que el estudiante llenará.
- Las **imágenes** (incluidas las tablas pegadas como captura) se extraen del
  `.docx` y se importan como bloques Imagen: miniatura en el editor, botón de
  descarga y `@@PLUGINFILE@@/nombre` en el HTML. El flujo es el mismo que en
  Micrositio a Página: descargar la imagen, arrastrarla al editor de Moodle y
  pegar el HTML; Moodle la resuelve por nombre. Si se prefiere una URL fija,
  se pega en el campo y sustituye al `@@PLUGINFILE@@`.

Una tabla pegada como imagen no tiene filas ni texto estructurado, así que NO
se convierte a tabla HTML: queda como imagen (o se transcribe a mano en un
bloque Tabla). El OCR experimental se retiró porque el navegador de escritorio
no garantiza OCR nativo y el proyecto no incorpora dependencias ni servicios
externos.

## Editor por bloques

Los bloques son la fuente única para HTML, vista previa y QA. Tipos actuales:

- **Sección:** barra `h2` más área de contenido.
- **Texto:** párrafos; permite alineación.
- **Lista:** viñetas, decimal, letras o romanos; mantiene el nivel. El control
  **Nivel / sangría** conserva la jerarquía Principal → Segundo → Tercero del
  Word, incluso cuando el archivo usa distintos `numId` para representar la
  sangría en lugar de aumentar `ilvl`. Genera `ul` para viñetas y `ol` para
  numeradas. La lista, sus `li` y el texto interno usan `font-size:14px` para
  homologarse con los párrafos; la familia y la altura de línea se heredan del
  contenido de Moodle.
- **Tabla:** encabezados y filas separadas por tabulador o `|`. Además: fila
  título opcional (abarca todas las columnas), color de encabezado (por
  defecto el del módulo; al importar, el del Word) con texto negro o blanco
  según contraste, un encabezado vacío se combina con el anterior (colspan) y
  un renglón con solo `|` crea una fila vacía de plantilla. La salida es
  responsive sin depender del CSS del tema: tablas de 4+ columnas van a
  `width:100%` con `min-width` por columna dentro de un contenedor con
  `overflow-x:auto` (en celular scrollean en vez de aplastarse); las angostas
  quedan centradas a su ancho natural, como en el Word.
- **Imagen:** URL y texto alternativo. Si viene del Word trae miniatura,
  descarga y `@@PLUGINFILE@@/nombre` automático.
- **Enlace:** texto y URL, generado con `target="_blank"`.

Para insertar entre secciones, haz clic en el borde o encabezado de un bloque.
El bloque seleccionado se ilumina en azul y los botones de la barra insertan el
nuevo bloque **después** de él. Sin selección, insertan al final. Además, cada
bloque tiene botones ▲ ▼ para subirlo o bajarlo un lugar (p. ej. para sustituir
una tabla-imagen: selecciona el bloque Imagen, inserta la Tabla, acomódala y
borra la imagen).

### Ampliar edición

El botón **Ampliar edición** no oculta la referencia: cambia la proporción a
una vista dividida amplia, con más espacio para bloques a la izquierda y la
vista previa todavía visible a la derecha. **Reducir edición** restaura la
proporción normal.

## HTML generado

La estructura base es:

```html
<div class="prepa-M17-body">
  <div class="prepa-M17-Tema">
    <h1 class="prepa-M17-tituloTema"><span>Título</span></h1>
  </div>
  <div class="prepa-M17-bloqueContenidos">
    <h2 class="prepa-M17-subTema"><span>Propósito</span></h2>
    <div class="prepa-M17-contenidosTexto-Imagen">...</div>
  </div>
</div>
```

Las listas llevan `padding-left` explícito por nivel para que los números o
viñetas respeten la jerarquía y no queden pegados al borde si Moodle restablece
estilos por tema. El formato se fija en la salida (`disc`, `decimal`,
`lower-alpha` o `lower-roman`), el tamaño se fija en 14 px y la familia
tipográfica se deja heredada del contenido.

## QA de actividad

El botón **Generar verificador (QA)** produce código de solo lectura. No
agrega, elimina ni guarda contenido en Moodle.

El QA compara el texto visible completo. Tolera que Moodle cambie la etiqueta
HTML, los espacios, los saltos de línea o las entidades, pero no acepta
fragmentos, palabras borradas ni cambios de puntuación. También revisa el
título visible de la actividad fuera del bloque HTML (primero
`[data-region="activity-information"][data-activityname]`), porque ese nombre
puede quedar truncado aunque el encabezado interno siga completo. Las
diferencias se muestran con resaltado amarillo en el reporte y el nodo
correspondiente de Moodle queda marcado con un contorno amarillo. Solo informa
**PÁGINA DISTINTA** si el título interno no se reconoce **y** menos del 55% de
los textos esperados coinciden.

Si el título sí coincide, el QA revisa:

- título, encabezados, párrafos, elementos de lista y celdas esperadas;
- enlaces: texto, URL, archivo final de Moodle y `target="_blank"`;
- texto adicional publicado en Moodle que no viene del documento.

Los elementos repetidos por Moodle (`li` con un `p` interno, o un párrafo
partido en nodos) no se consideran texto extra: el QA compara también las
firmas contenidas en el texto esperado antes de reportarlos.

Regenera siempre el QA después de importar/corregir bloques: el código incluye
los textos y enlaces de ese estado exacto.

## Mantenimiento

- La herramienta se registra en `assets/tools.js` con `moodle: '3.11'`.
  Esa es la fuente única de la insignia de versión.
- Cada cambio publicado requiere subir `VERSION` de `sw.js`, porque la PWA
  necesita invalidar la caché offline.
- El panel respeta tema claro/oscuro mediante tokens; la vista previa no los
  hereda intencionalmente.

## Pruebas mínimas

1. Importar un Word real y confirmar que inicia en su primera barra gris.
2. Confirmar que una lista `1, 2, 3 → a, b → 4` no vuelve a 1.
3. Confirmar un texto centrado y uno justificado.
4. Seleccionar un bloque e insertar una tabla después de él.
5. Alternar edición ampliada y confirmar que la vista previa permanece.
6. Generar HTML y comprobar sus clases `prepa-M{n}`.
7. Ejecutar QA en la actividad correcta y en una distinta: la segunda debe
   marcarse como `PÁGINA DISTINTA` y no aprobar coincidencias parciales.
8. Borrar una palabra o un signo del título visible de Moodle y de un párrafo:
   debe mostrar `ERRORES` y el texto esperado como faltante o distinto.
9. Importar un Word con tabla real (AI3/PI de M17): debe crear bloques Tabla
   con el color del Word, el colspan del encabezado combinado y las filas
   vacías de plantilla; angostar la ventana debe scrollear la tabla ancha, no
   aplastarla.
10. Importar un Word con tabla pegada como imagen (AI4 de M17): debe crear un
   bloque Imagen con miniatura y descarga, y el HTML debe referenciarla como
   `@@PLUGINFILE@@/nombre`.
