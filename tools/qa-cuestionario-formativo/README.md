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

## Dónde va el morado (dos convenciones)

La respuesta correcta se marca con el resaltado magenta, pero los guiones no lo
ponen en el mismo sitio:

| Convención | Dónde está el morado | Ejemplo |
|---|---|---|
| **Sobre la respuesta** | En el texto de la columna `Respuestas` | CF1, CF2, CF3 |
| **Sobre la retroalimentación** | En la palabra `Correcta.` de la tercera columna | CF4 |

Se miran **las dos celdas**. En los cuatro guiones revisados cada uno usa una
sola forma y nunca se contradicen, así que aceptar ambas no afloja nada: la
comprobación cruzada contra la palabra `Correcta.` sigue en pie y salta si el
morado cae sobre una `Incorrecta.`. Cuál se usó se enseña en el resumen; si
aparecieran las dos en el mismo guion, se avisa.

Mirar solo la columna `Respuestas` dejaba el CF4 sin ninguna correcta: treinta
avisos falsos en la herramienta y, en Moodle, la respuesta buena reportada como
«distractor con puntaje».

## Las marcas del guion no son contenido

Todo lo que producción escribe entre `< >` es una instrucción de **montaje**,
nunca contenido publicado —el catálogo está en `tools/guion-a-pagina/README.md`
y termina con: «cualquier otra se guarda como indicación, no se publica»—. En
Moodle está la imagen, la lista o la tabla; no la palabra. Se borran antes de
comparar, igual que `<Latex>` y `<Cod Lat>`.

**Se borra cualquier `<…>`, no una lista de marcas conocidas.** Enumerarlas fue
el primer intento y no aguantó: cada quien las redacta a su manera. En cinco
guiones reales hay **24 marcas distintas** y ninguna es contenido:

| Guion | Marcas |
|---|---|
| CF1 | *(ninguna)* |
| CF2 | `<h2>` · `<Texto centrado>` · `<Texto centrado en negritas>` + cierres |
| CF3 | `<Texto regular centrado>` · `<Texto regular centrado en negritas>` + cierres |
| CF4 | `<Figura>` · `<Figuras>` · `<Texto centrado>` + cierres |
| SM2S1-CF1 | `<Lista numerada>` · `<Tabla con encabezado centrado y texto alineado a la izquierda>` · `<Latex>` · `<Latex#\wedge #>` + cierres |

Ese último llegaba con **20 errores** que eran solo marcas.

Los guardarraíles para no comerse un `a < b` del enunciado: sin saltos de línea
ni corchetes anidados dentro, máximo 120 caracteres (la marca más larga que
existe mide 62) y con al menos una letra. Un `menor que (<)` no tiene cierre y
no se toca. Las reglas de `<Latex>…<Termino Latex>` corren **antes**, porque esas
borran también lo que hay en medio.

Borrar en silencio sería magia invisible, así que la pestaña **Qué se revisa**
lista las marcas que se ignoraron: si alguna era contenido de verdad, se ve ahí.

Aparte, las que **anuncian una imagen** (`<Figura>`, `<Imágenes>`…) alimentan el
aviso de imágenes; `<Lista numerada>` no, porque ahí no va ninguna.

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

Las páginas de edición se piden **de tres en tres**, no todas a la vez. Moodle
abre el formulario completo por cada pregunta y es caro: con quince reactivos,
un `Promise.all` sobre los quince satura el límite de conexiones del navegador y
el PHP del sitio, y las últimas se abortan encoladas —`signal is aborted without
reason`— sin haber llegado a empezar. Con la tanda, cada petición estrena sus 15
segundos de espera, y si aun así no responde se reintenta una vez antes de
avisar. Mientras tanto el panel de carga dice por cuál va.

El emparejamiento inicial es flexible únicamente para localizar cada reactivo y
respuesta aunque estén barajados. Después de emparejarlos, los textos de
preguntas, respuestas y retroalimentaciones deben ser idénticos; cualquier
palabra añadida, eliminada o cambiada produce un error.
En las tablas internas se exige el mismo conjunto exacto de elementos, aunque
el recorrido técnico sea por columnas en Word y por filas en Moodle. La
numeración de lista (`1.`, `2.`, `a)`, `b)`) se quita **por pares de tokens** y
no con una expresión que mire lo que va detrás: esa dependía del orden de
recorrido —el Word da `1. 2. 3. a. b. c.` y Moodle `1. a. 2. b. 3. c.`— y hacía
fallar una tabla que estaba bien.

Dos textos que sean iguales tienen que compararse iguales aunque las comillas
sean tipográficas de un lado y rectas del otro: `limpiar()` endereza `’` al leer
Moodle y el Word llega tal cual, de modo que un `Hi, what’s up?` idéntico se
reportaba como error **y el panel lo pintaba igual en las dos líneas**. La regla
es que la herramienta no puede señalar una diferencia que no sabe enseñar.

Los puntajes son informativos hasta que exista una regla institucional de total.
El verificador no responde, no envía formularios y no guarda cambios.

## La evidencia imprimible

El panel de resultados trae un botón **Generar evidencia (PDF)**: abre una
ventana con el informe maquetado y la manda a imprimir, para guardarla con
*Guardar como PDF*. No usa ninguna librería —un generador de PDF no cabe en un
bookmarklet y Moodle bloquearía el script externo—, así que el PDF lo produce el
propio navegador.

El documento lo arma **`assets/evidencia-qa.js`**, compartido con el *QA de
Actividad y Rúbrica*: es el mismo informe con otros datos y duplicarlo era
garantizar que en tres meses uno de los dos tuviera el pie de página viejo. Como
se serializa dentro del bookmarklet, viaja junto al verificador y se le pasa
como argumento; recibe los textos **ya resaltados** por la `diferencia()` de cada
verificador, así que el PDF enseña exactamente lo mismo que el panel.

Lleva el veredicto y el conteo, una ficha con el guion revisado, los reactivos
cotejados, la fecha, la dirección de Moodle y dónde venía el morado; después los
hallazgos, cada uno con el grupo en una **píldora del color de su nivel**, el
motivo al lado y debajo su “Debe decir / En Moodle” con el mismo resaltado
amarillo del panel. Cierra con dos líneas de firma y la nota de que la revisión
es de solo lectura y qué queda fuera.

Al final va un bloque aparte con los **avisos del guion** —los que salen al leer
el Word, antes de mirar Moodle: reactivos duplicados, celdas vacías, fuera del
rango de la indicación—. Van separados y rotulados «del Word, no del montaje»
porque no son fallas de quien montó y **no cuentan en el veredicto**, pero
forman parte de la revisión y tienen que quedar registrados.

El **título de la ventana es el nombre con que se guarda el PDF**, y usa la clave
del guion: `QA_SM1S4-CF4`, sacada del nombre del Word
(`01S.03_PR_SM1S4-CF4_Comunicacion….docx`). Así la evidencia se empareja con su
guion sin abrirla. El separador entre la sesión y el CF cambia según quién nombre
el archivo —`SM1S4-CF4` y `SM2S1_CF1` son lo mismo—, así que se acepta cualquiera
y la evidencia siempre sale con guion.

**El marcador lleva ese mismo nombre**: al arrastrarlo a la barra, el navegador
usa el texto del enlace como nombre del favorito, así que queda `QA_SM1S4-CF4` y
no un genérico «Verificar cuestionario» —con varios guardados a la vez, se
distinguen—. La clave se calcula **una sola vez**, en `script.js`, y viaja dentro
de los datos: el nombre del marcador y el del PDF salen del mismo sitio y no
pueden desincronizarse. La fecha no va en el nombre —está en la ficha, dentro del
documento—. Si el Word viniera con otro nombre se usa el del archivo saneado,
antes que inventar una clave que no existe; el `QA_` va siempre.

## Las imágenes nunca son error

Una imagen **no se da por buena ni por mala**: se cuenta y se avisa. Comparar la
huella del PNG que Word guarda contra el archivo que Moodle sirve —reescalado, y
a veces un SVG que el navegador pinta distinto— no da idéntico casi nunca, así
que reportarlo como error era marcar en rojo respuestas correctas.

Sale **un aviso por pregunta**, no uno por imagen, y cubre los dos sitios donde
aparecen:

- **El enunciado.** El guion la pide de dos formas —incrustada en la celda o
  anunciada con la marca `<Figura>`— y las dos cuentan. Contar solo las de las
  respuestas dejaba mudas preguntas como la 9 y la 10 del CF4, que llevan la
  imagen arriba.
- **Las respuestas.**

> **Imágenes · La pregunta 13 lleva imagen en el enunciado**
> En Moodle: 3 imágenes en el enunciado. Revísalas a ojo: que sean las del
> guion, que estén bien vinculadas y que no salga el ícono roto.

Cuando el guion pide imagen y en Moodle **no hay ninguna** —el caso de la imagen
que no quedó vinculada— el aviso lo dice con todas sus letras: `NINGUNA imagen
en el enunciado, y el guion sí la pide`. Sigue siendo aviso y no error porque la
herramienta no puede saber si falta o si simplemente no cargó en ese momento.

El resto de la pregunta —enunciado, opciones de texto, porcentajes y
retroalimentaciones— se sigue cotejando con el mismo rigor de siempre.

## Cómo se nombran las cosas en el informe

Los hallazgos se escriben con el vocabulario de la pantalla que hay que ir a
corregir, no con el del HTML. El comportamiento de las preguntas es el caso
claro: Moodle lo marca en el HTML como `immediatefeedback`, pero en *Editar
ajustes* se llama «Retroalimentación inmediata», y así es como se reporta,
diciendo además qué implica y dónde se cambia.

Ese ajuste además es **uno solo para todo el cuestionario**: si está mal, lo está
en las quince preguntas. Se reporta en un único hallazgo —aunque se resalten las
quince en la página— en vez de repetir quince veces el mismo renglón.

## Archivos

- `index.html`: interfaz de carga y entrega.
- `script.js`: lector del guion y generador del verificador.
- `verificador.js`: función autocontenida que se ejecuta en Moodle.
- `styles.css`: reutiliza deliberadamente el diseño del QA 5.1 y añade solo los
  elementos propios de las preguntas.
