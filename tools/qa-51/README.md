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
- La palabra **rúbrica** quedó enlazada, al archivo correcto y en pestaña nueva.
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
- **Se entra por el `<h1>`.** Todo lo anterior del guion son fichas de control
  editorial (módulo, elaboradores, indicaciones para producción) y no se publica;
  empezar antes producía veinte "textos faltantes" que nadie tenía que montar.

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
