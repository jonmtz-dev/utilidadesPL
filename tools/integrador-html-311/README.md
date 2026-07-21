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
- La numeración se consulta en `word/numbering.xml`, no se adivina por el
  texto. Se distingue viñeta, decimal, letras y romanos, además de su nivel.
- Cada lista conserva `numId`; si una lista decimal vuelve después de una
  sublista de letras, el HTML usa `start="4"` (o el número que corresponda)
  para no reiniciar en 1.
- Las marcas de guía `<h2>` y `<Lista numerada; ...>` se descartan: son
  instrucciones de Word, no contenido publicable.

El Word puede contener imágenes o tablas como imagen. Esas imágenes no tienen
filas, celdas ni texto estructurado, por lo que no se convierten a tabla HTML.
Se agrega una tabla manual desde el editor y se transcribe/revisa allí. El OCR
experimental se retiró porque el navegador de escritorio no garantiza OCR
nativo y el proyecto no incorpora dependencias ni servicios externos.

## Editor por bloques

Los bloques son la fuente única para HTML, vista previa y QA. Tipos actuales:

- **Sección:** barra `h2` más área de contenido.
- **Texto:** párrafos; permite alineación.
- **Lista:** viñetas, decimal, letras o romanos; mantiene el nivel.
- **Tabla:** encabezados y filas separadas por tabulador o `|`.
- **Imagen:** URL y texto alternativo.
- **Enlace:** texto y URL, generado con `target="_blank"`.

Para insertar entre secciones, haz clic en el borde o encabezado de un bloque.
El bloque seleccionado se ilumina en azul y los botones de la barra insertan el
nuevo bloque **después** de él. Sin selección, insertan al final.

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

Las listas llevan `padding-left` explícito para que los números o viñetas no
queden pegados al borde si Moodle restablece estilos por tema.

## QA de actividad

El botón **Generar verificador (QA)** produce código de solo lectura. No
agrega, elimina ni guarda contenido en Moodle.

Antes de comparar fragmentos, el QA exige que el `h1` de la página coincida
con el título generado. Si no coincide, informa **PÁGINA DISTINTA**, no acepta
coincidencias parciales de frases genéricas y encierra en rojo los nodos del
contenido mostrado. Esto evita aprobar accidentalmente otra actividad con una
lista parecida.

Si el título sí coincide, el QA revisa:

- título, encabezados, párrafos, elementos de lista y celdas esperadas;
- enlaces: texto, URL, archivo final de Moodle y `target="_blank"`;
- texto adicional publicado en Moodle que no viene del documento.

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
