# QA de Actividad y Rúbrica (Moodle 5.1)

Compara lo que **montó el responsable** contra lo que **mandó producción**: el
guion de la actividad y la rúbrica, los dos en Word.

No es un convertidor. No escribe nada en Moodle: lee la página ya montada,
enmarca lo que no coincide y dibuja un panel con el resultado.

---

## Cómo funciona

1. Se suben los dos `.docx`. La herramienta arma el **modelo esperado**: cada
   texto que debe aparecer (con sus negritas y cursivas), las tablas, y los
   criterios de la rúbrica con sus niveles y puntos.
2. Genera un **verificador**: un marcador (bookmarklet) o un pegote para la
   consola.
3. Se ejecuta **en la página de Moodle**. El verificador reconoce solo si está
   en la actividad o en la pantalla de la rúbrica y compara lo que toca.

> El verificador vive en `verificador.js` como una función normal y se manda con
> `toString()`. Escribirlo dentro de una plantilla de texto obliga a escapar cada
> acento grave y cada `${`: es lo que dejó ilegible al QA de 3.11.

---

## Un solo verificador para los dos Word

Se sube el guion, la rúbrica o los dos: **siempre sale un único verificador**,
con dentro lo que se haya cargado. Al ejecutarlo reconoce solo si está en la
actividad o en la pantalla de la rúbrica y compara lo que toca. Las píldoras de
arriba (`✓ Actividad · ✓ Rúbrica`) dicen qué lleva el que se va a copiar.

Subir otro Word del mismo tipo **reemplaza** al anterior; la ✕ de cada tarjeta lo
quita. Y si el guion y la rúbrica no son de la misma actividad, se avisa antes de
verificar: se comparan los códigos (`SM02S3AA3` del guion contra el nombre
`SM2_S3_AA3_Rubrica.docx`). Con el guion de una actividad y la rúbrica de otra, el
verificador reportaría errores que no existen.

## Qué se revisa

**En la actividad**

- Cada texto del guion aparece en la página (título, párrafos, puntos de la
  lista, celdas de tabla, textos centrados).
- Las **negritas y cursivas** están en las mismas palabras.
- No quedó publicada ninguna **marca del guion** (`<Tabla>`,
  `<Lista numerada; son las instrucciones>`…).
- La palabra **rúbrica** (o **lista de cotejo**, en los foros) quedó enlazada, a
  un PDF de la misma actividad y en pestaña nueva.
- Las tablas tienen el número de columnas correcto y **`data-label` en cada
  celda** (sin él no se vuelven tarjetas en el celular).
- Texto que está en Moodle pero **no** en el guion.

**En la rúbrica**

- Mismo número de criterios, y el texto de cada uno.
- Los cinco niveles en orden, con sus puntos.
- **La suma del nivel más alto da el total del Word.** Es la comprobación que
  caza un criterio olvidado aunque todo lo demás esté perfecto.
- Los cinco descriptores cualitativos, con el nombre del nivel en negrita.

---

## Lo que NO se marca como error (y por qué)

Esta tabla salió de cotejar tres actividades **ya montadas y correctas** contra
su guion. Cada renglón es una diferencia real que aparece siempre y que sería
ruido si se reportara como error.

| En el Word | En Moodle | Qué es |
|---|---|---|
| `Tabla de afirmaciones…` | `Tabla 1. Afirmaciones…` | El equipo numera las tablas al montar. Se reconoce por el resto del título → **aviso** |
| `**Completa **la tabla` | `<strong>Completa</strong> la tabla` | El espacio sale de la negrita |
| `del  bloqueador` | `del bloqueador` | Espacios dobles |
| `a. La investigación…` | `<li>La investigación…` | El prefijo se vuelve la lista de HTML |
| `Indicador: Identifica…` | `Indicador:` + `- Identifica…` | Las viñetas del indicador salen con `- ` |
| Celda vacía | `&nbsp;` | Relleno del editor |
| Comillas curvas | Comillas rectas | El editor las endereza |
| `y por tanto no es posible` | `y, por tanto, no es posible` | Corrección de estilo al montar → **aviso** |
| `…información personal inglés` | `…información personal **en** inglés` | Se corrige una palabra al montar → **aviso**, emparejado (ver §*segunda pasada*) |
| `la siguiente **rúbrica**` | `la siguiente <a>rúbrica</a>` | El guion resalta en negritas la palabra que hay que **enlazar**; al montarla se vuelve `<a>`, no `<strong>` → **aviso**, no error. No se calla: sale con su nombre para poder verlo |
| `SM2_S3_AA3_Rubrica.docx` | `PR_SM1S1-RU_Rubrica_AA3.pdf` | El PDF de Moodle casi nunca se llama como el Word. Solo se compara el **número de la AA** |

**Tres severidades**, y esa es la razón de que el reporte se lea: *error* (falta
o sobra contenido, cambia un puntaje, falta un criterio, falta el enlace),
*aviso* (coincide salvo puntuación o espacios) y *correcto*.

---

## Trampas que costaron y conviene no deshacer

- **Se compara el texto PROPIO del nodo, no `textContent`.** Un `<li>` del
  montaje se lleva dentro la tabla entera o su sublista a/b/c; comparado
  completo, "Completa la tabla…" no coincidía nunca y salía como *falta el punto
  5* en una actividad perfecta.
- **Y ese texto propio es una LISTA de trozos**, cortada por cada bloque
  anidado: en la AA3 el punto "Guarda el archivo…" lleva dentro los tres
  párrafos centrados del nombre y, después de ellos, la "Nota: al nombrar tu
  archivo…" suelta. Son **dos** frases del guion dentro de un mismo `<li>`.
- **Un `<br>` separa con espacio; lo demás en línea se pega tal cual.** Una
  celda con `Óptica<br>Medicina` daba "ÓpticaMedicina"; y meter espacio después
  de cada `<strong>` separaba la coma de su palabra ("rúbrica ,").
- **La cursiva del Word se marca `*texto*`, no `_texto_`** (ver `assets/docx.js`).
  Los guiones piden guardar el archivo como `Apellidos_Nombre_SM02S1AA1`: con
  guiones bajos, ese nombre se leería como una cursiva que nadie escribió.
- **Se entra por el PRIMER ENCABEZADO, no por el `<h1>`.** Todo lo anterior del
  guion son fichas de control editorial (módulo, elaboradores, indicaciones para
  producción) y no se publica; empezar antes producía veinte "textos faltantes"
  que nadie tenía que montar. Pero **no todos los guiones traen `<h1>`**: de tres
  guiones de regularización, dos abren el título con `<h2>`. Buscando solo `<h1>`
  entraba la hoja de control entera y el reporte salía con **49 errores
  inventados** sobre una actividad bien montada. Si el Word no trae ninguna marca
  de encabezado, se salta la hoja de control reconociendo sus celdas (`Nombre del
  módulo:`, `Elaborador o elaboradora`, `Indicaciones`…). El resumen dice por
  dónde entró, que es lo que explica un conteo de textos raro.
- **El título es el primer encabezado que aparezca**, venga marcado `<h1>` o
  `<h2>`. Antes solo lo tomaba del `<h1>` y en esos guiones salía vacío.
- **Lo que va dentro de `<Figura>`…`<Termina figura>` no se coteja.** Es la
  descripción de la imagen para quien la produce (`Profile / Age: 13 years old /
  Nationality: Brazilian…`): se monta como imagen y por eso nunca aparece
  escrita en Moodle. Compararla daba un "falta el punto 7" en un montaje
  correcto. Igual con `<Video>`, `<Pop-up>` y `<Imagen>`.
- **El instrumento de evaluación no siempre es una rúbrica.** Los foros se
  evalúan con **lista de cotejo** y ahí la palabra enlazada es esa; buscando solo
  "rúbrica", la actividad de foro se revisaba sin comprobar ningún enlace.
- **El parecido es SEGUNDA pasada, nunca primera.** Cuando se busca a la vez lo
  exacto y lo parecido, un texto se queda con el nodo de otro: en la AA1 el
  "Título de tabla" se llevaba el punto 9 ("La tabla de afirmaciones…"), casi
  idéntico, y entonces el punto 9 salía como faltante y el título numerado como
  sobrante. **Dos errores inventados por adelantarse.** Primero se resuelve todo
  lo exacto; lo que queda sin pareja se busca por parecido en una pasada aparte.

### Por dónde empieza el guion (la trampa más cara)

Lo que se publica empieza después de la hoja de control, y hay **dos** formas de
abrir sección:

- con la marca `<h1>`/`<h2>`, o
- con la **barra de título**: una tabla de **una sola celda**. Esa forma la
  distingue de la hoja de control, cuyas fichas son siempre tablas de dos o más
  columnas.

Manda **la que aparezca primero**. Entrar solo por la marca de encabezado
reventaba con los guiones mixtos: la `AA1` de regularización abre sus cuatro
secciones con barra de título sin marcar y trae un único `<h2>` justo antes de
*Evidencia de aprendizaje*, en el bloque 36 de 40. El lector arrancaba ahí y se
quedaba con **4 textos de 29**; en Moodle, la actividad entera salía como
«Sobra · Texto que no está en el guion» —23 avisos sobre un montaje correcto—.

Ojo con el filtro de la hoja de control: sirve para decidir **dónde empieza**,
no para clasificar dentro del cuerpo. `Propósito(s) formativo(s)` es a la vez un
campo de la ficha editorial y un título real de la actividad; excluirlo también
en el cuerpo lo convertía en una «tabla de contenido» que Moodle nunca iba a
tener, y salía «Falta la tabla 1».

El resumen dice siempre por dónde entró. **Si un guion reporta un número de
textos sospechosamente bajo, eso es lo primero que hay que mirar.**

---

## La evidencia imprimible

El panel de resultados trae un botón **Generar evidencia (PDF)**: abre una
ventana con el informe maquetado y la manda a imprimir, para guardarla con
*Guardar como PDF*. No hay librería —un generador de PDF no cabe en un
bookmarklet y Moodle bloquearía el script externo—, así que el PDF lo produce el
navegador.

El documento lo arma **`assets/evidencia-qa.js`**, compartido con el *QA de
Cuestionario Formativo*: es el mismo informe con otros datos. Se serializa
dentro del bookmarklet, viaja junto al verificador y se le pasa como argumento;
recibe los textos **ya resaltados** por la `diferencia()` de este verificador,
así que el PDF enseña exactamente lo mismo que el panel. Aquí la columna
izquierda se llama **«En el Word»**, no «Debe decir», porque eso es literalmente
lo que dice el guion.

Sirve para los dos modos: en la pantalla de la actividad sale la ficha con los
textos del guion y el código; en la de la rúbrica, los criterios y el puntaje.

### El nombre del archivo (y el del marcador)

El `<title>` de la ventana es el nombre con que se guarda el PDF, y sale de la
clave del Word. **El marcador lleva ese mismo nombre**: al arrastrarlo a la
barra, el navegador usa el texto del enlace como nombre del favorito, así que
queda `QA_SM1S1_AA1` en vez de un genérico «Verificar en Moodle» —con varios
guardados a la vez, se distinguen—.

La clave se calcula **una sola vez**, en `script.js`, y viaja dentro de los
datos del verificador: el nombre del marcador y el del PDF salen del mismo sitio
y no pueden desincronizarse.

| Word | PDF |
|---|---|
| `01S.03_PR_SM1S1-AA1_La_tecnologia_en_tu_entorno.docx` | `QA_SM1S1_AA1` |
| `01S.03_PR_SM2S3_AA3_….docx` | `QA_SM2S3_AA3` |
| `01S.03_PR_SM02S03_AA03_….docx` | `QA_SM2S3_AA3` |
| `AA5_sin_clave.docx` | `QA_AA5_sin_clave` |

El separador que traiga el archivo da igual (`SM1S1-AA1`, `SM1S1_AA1`,
`SM1S1AA1`) y los ceros a la izquierda se quitan.

**Solo esta forma**, a propósito. Los guiones de módulo (`M17_AI3`,
`M17_S3_AI5_Rubrica`) son de Moodle 3.11 y esta herramienta es de 5.1:
reconocerlos le pondría un nombre creíble a una evidencia hecha con la
herramienta equivocada, y eso es justo lo que no debe pasar desapercibido. Sin
clave se usa el nombre del archivo saneado —y ahí se nota—; el `QA_` va siempre.

---

## Pruebas mínimas

Con los tres ejemplos de `Ejemplos AA y rubricas moodle 5.1` (guion + rúbrica +
los dos montajes ya correctos), el resultado tiene que ser:

| | Actividad | Rúbrica |
|---|---|---|
| AA1 | 0 errores · 1 aviso (tabla numerada) | 0 errores · 2 avisos (comas de los descriptores) |
| AA2 | 0 errores · 1 aviso (tabla numerada) | 0 errores · 1 aviso |
| AA3 | 0 errores · 2 avisos (puntos finales) | **4 errores** |

Los cuatro de la AA3 son de verdad: a esa rúbrica montada le faltan los
criterios *actitud y ética* y *presentación y formato*, y suma **70 de 100**.
Si algún día ese caso deja de reportarse, el QA se rompió.

Y con los tres de `AA regularizacion` (guiones con otro formato: dos abren con
`<h2>`, uno con `<h1>`):

| | Actividad | Qué es |
|---|---|---|
| AA1 | 1 error · 1 aviso | Real: el montaje perdió la **cursiva** de *Viento del Este, Viento del Oeste*. El aviso es la negrita de "lista de cotejo" que quedó como enlace |
| AA2 | **0 errores** · 1 aviso | Montaje limpio; el aviso es la negrita de "rúbrica" que quedó como enlace |
| AA3 | 1 error · 2 avisos | Real: se perdió la cursiva de *to be*. Los avisos son la negrita enlazada y la palabra "en" que se añadió al montar |

Antes de arreglar la entrada por encabezado, esas tres daban **49, 49 y 4
errores**. Si vuelven a subir de golpe, lo primero que hay que mirar es por dónde
dice el resumen que empezó el guion.
