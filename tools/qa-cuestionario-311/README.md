# QA de Cuestionarios · Moodle 3.11

Coteja un cuestionario ya montado en Moodle contra el guion Word de producción.
Comparte la interfaz y la forma de entregar el verificador (marcador o consola)
con `QA de Actividad y Rúbrica`, pero **no su lector de Word ni su modelo**: es
otro documento y otra actividad.

## Para qué actividad sirve (y para cuál no)

Sirve para el plugin **Cuestionario** (`mod/questionnaire`): el que Prepa en
Línea usa para los cuestionarios de dudas, de opinión y socioemocionales. No
sirve para los **Exámenes** de Moodle (`mod/quiz`), que tienen otras páginas,
otros formularios y respuesta correcta.

| | Examen (`mod/quiz`) | Cuestionario (`mod/questionnaire`) |
|---|---|---|
| Respuesta correcta | sí | **no** |
| Retroalimentación | por opción | no |
| QA que le toca | `qa-cuestionario-formativo` (5.1) | **este** |

Dos señales para saber cuál es el tuyo: la dirección dice `/mod/questionnaire/`,
y en el menú de la actividad aparece «Retroalimentación» y «No respondentes»,
no «Banco de preguntas».

## Qué toma del Word

La plantilla de **pantallas** de producción. Es una tabla `Pantalla | Contenido`:

| Pantalla | Qué trae | Dónde se coteja |
|---|---|---|
| 1 | Propósito, instrucciones, la línea de fechas y `<Comenzar>` | La **introducción** de la actividad (Ajustes) |
| 2 | `<H2>`, un banner con el título, las instrucciones, las preguntas y `<Enviar todo y terminar>` | Una **Etiqueta** antes de la primera pregunta, y cada pregunta |

Y de las demás tablas: el **Título del recurso** y la fila **MON** de las
indicaciones (lo que se pide montar).

Si el Word no trae esa tabla, el lector lo dice: *«no es un guion de
cuestionario…»*. Un cuestionario formativo con reactivos de cuatro opciones es
otro guion y va en el QA de Moodle 5.1.

## Cómo se reconoce cada cosa en el guion

No se supuso: se midió en un guion real.

| En el Word | Es |
|---|---|
| Un párrafo numerado seguido de `☐` o de un recuadro | una **pregunta** |
| Párrafos que empiezan con `☐` | las **opciones** (con texto o sin él) |
| Una tabla de una sola celda **vacía** tras la pregunta | el recuadro de una **respuesta abierta** |
| `<Comenzar>`, `<H2>`, `<Enviar todo y terminar>` | **marcas de montaje**: nunca contenido |

El **resaltado** manda el papel de un texto, y lo dice el propio guion:

| Color | Significa | Qué hace el QA |
|---|---|---|
| Amarillo | recado de montaje | no se coteja como texto |
| Turquesa | recado para producción | no se coteja como texto |
| Verde | «deberá conservar el estilo» | si falta la negrita o la cursiva, es **error** (no aviso) |

El resaltado se mira **por mayoría**, no por presencia: «Instrucciones: Lee cada
pregunta…» lleva verde solo en partes y sigue siendo contenido.

## De dónde lee Moodle (todo por GET)

Questionnaire guarda su contenido en formularios de edición, y esos abren por GET:

```
course/modedit.php?update=ID                    ajustes + introducción
mod/questionnaire/questions.php?id=ID           el orden de las preguntas
mod/questionnaire/questions.php?id=ID&action=question&qid=QID
                                                cada pregunta (HTML crudo)
```

Se lee el **HTML crudo del formulario** y no la vista previa a propósito: ahí
está lo que se escribió, con sus negritas y sus residuos, no lo que el tema
decidió dibujar.

**Solo lee.** No abre `complete.php` (contestar tiene efectos), no inicia un
intento y no envía formularios. Hace falta una sesión con permiso de edición.
Las preguntas se piden **de tres en tres**, como el QA de 5.1: quince formularios
a la vez saturan el PHP del sitio.

## Qué coteja

| Grupo | Revisa | Severidad |
|---|---|---|
| **TÍTULO** | El nombre de la actividad contra «Título del recurso» | error / aviso |
| **INTRODUCCIÓN** | Cada párrafo del guion contra la introducción, con sus negritas y cursivas | error / aviso |
| **FECHAS** | La fecha escrita en el texto contra «Permitir respuestas desde / hasta» y las restricciones de acceso | error |
| **ENCABEZADO** | El banner y las instrucciones contra la Etiqueta de entrada | error / aviso |
| **PREGUNTA N** | Enunciado, tipo (abierta / opciones), número de opciones y residuos de Google Docs | error / aviso |
| **PREGUNTAS** | Cuántas hay, cuáles faltan o sobran, y lo que piden las indicaciones de montaje | error / aviso |
| **AJUSTES** | «Un intento» contra el tipo de respuesta; si es anónimo cuando el guion pide recabar datos | error |
| **A OJO** | Los comentarios de montaje del Word y el botón de envío | informativo |

**Tres severidades**, como en las demás herramientas de QA: *error* (falta o
cambia algo), *aviso* (coincide salvo puntuación, acentos o mayúsculas, o hay
algo que mirar) e *información* (dato leído sin juicio, o algo que la
herramienta no puede comprobar sola).

### El emparejamiento es global, no párrafo por párrafo

Quien monta a veces agrega un encabezado en medio, y emparejar en orden dejaba
ese solo párrafo de más descuadrando todo lo que viene después. Se calcula el
parecido de **todos contra todos** (coeficiente de Dice sobre las palabras) y se
asignan los pares más parecidos primero. Un par bajo 0.5 no se considera el
mismo texto.

Si Moodle **alarga o acorta** el texto del guion se dice así —*«Moodle agrega
texto al final que el guion no trae»*— y no «no coincide» a secas: casi siempre
es una frase que alguien agregó.

### Las fechas, que es lo que más importa

La introducción lleva una línea como *«disponible a partir del lunes [fecha], a
las 00:00 horas y se cerrará el domingo [fecha], a las 23:59 horas»*. Quien monta
escribe la fecha **en el texto**, pero lo que de verdad abre y cierra el
cuestionario son los **ajustes**. Se comparan los tres sitios:

1. El **guion**: día de la semana y hora (`lunes 00:00` → `domingo 23:59`).
2. El **texto** de la introducción: la fecha completa.
3. Los **ajustes**: «Permitir respuestas desde / hasta» y «Restringir acceso».

Los errores que sale a buscar:

- El texto dice una fecha y los ajustes **no la tienen activada** (el
  cuestionario queda abierto desde ya).
- La fecha de los ajustes **no es la del texto**.
- La hora o el día de la semana **no son los del guion**.
- El día de la semana **no corresponde a la fecha** («martes 5 de octubre» cuando
  el 5 de octubre es lunes).
- Quedó **`[fecha]` sin llenar**.

El texto casi nunca trae el año, así que se usa el de los ajustes si la fecha
está activada y, si no, **el año en que esa fecha queda más cerca de hoy**:
«5 de octubre» escrito en octubre es de este año, y «5 de enero» escrito en
diciembre es del que viene. La primera versión aceptaba «cualquiera de los dos
años» y dejaba pasar dos de cada siete días de la semana equivocados.

## Lo que el guion revisado ya mostró

Probado con *Cuestionario de resolución de dudas de EAA* y su montaje real
(`mod/questionnaire/view.php?id=2828`). Son hallazgos de verdad, no de prueba:

- **Las fechas no están activadas.** El texto dice «lunes 05 de octubre» y
  «domingo 11 de octubre», pero «Permitir respuestas desde / hasta» está
  desactivado y no hay restricción de acceso: el cuestionario está abierto desde
  ya. Los otros tres cuestionarios de dudas del aula están igual.
- **Moodle agrega una frase.** «Cuentas con un intento para responder.» no está
  en el guion. (Coincide con el tipo de respuesta «responder una vez», así que
  parece una adición deliberada, pero se desvía del guion.)
- **«INSTRUCCIONES»** es un encabezado en Moodle que el guion no trae.
- **Dos enunciados con residuo de Google Docs** (`<span id="docs-internal-guid…">`):
  se ven igual, pero es código que sobra.
- **El guion se contradice.** Las indicaciones de montaje piden «cuatro preguntas
  con respuestas abiertas y una de opción múltiple»; el cuerpo trae **tres**
  abiertas y una de opciones, y así está montado. Va como aviso **del guion**.
- **Las opciones del guion no tienen texto**, solo `☐ ☐`: no hay con qué
  cotejarlas, solo se puede comprobar cuántas son (2, y son 2).
- **Una o varias respuestas.** El guion dibuja casillas «☐» y su comentario dice
  «Configurar casilla de opción múltiple»; en Moodle es «Botones de Selección»
  (se elige una sola). No es necesariamente un error, así que va como aviso para
  confirmar.

## Los avisos del guion no cuentan en el veredicto

Se calculan al leer el Word, antes de mirar Moodle: opciones sin texto, una
pregunta sin opciones ni recuadro, las indicaciones que no cuadran con lo que
trae el cuerpo, una fecha entre corchetes que no se pudo leer. Son **del Word, no
del montaje**: salen en su propio bloque ámbar, en el panel y en la evidencia, y
no cambian el «CON ERRORES / TODO CORRECTO». Resolverlos le toca a producción.

## Lo que NO puede comprobar

Se enseña como **A OJO** en vez de callarlo:

- **El botón de envío** («Enviar todo y terminar»). Solo se ve al contestar, y
  contestar tiene efectos. En la vista previa dice «Vista previa del envío».
- **Los comentarios de montaje del Word** (configurar el botón de comenzar,
  «incluir instrucción según la interactividad»…). Se listan como recordatorio.
- **«Recabar nombre, ID y correo».** Se comprueba que el cuestionario **no sea
  anónimo**, pero que el ID y el correo salgan en el reporte hay que mirarlo en
  «Respuestas».
- **El texto de las opciones**, cuando el guion no lo trae.

## Cómo se probó (y una trampa del arnés)

Dos niveles, porque cargar un script en Moodle desde fuera lo bloquea el
navegador:

1. **Fuera de línea.** Se capturaron los datos reales del cuestionario (ajustes,
   introducción, etiqueta y las cinco preguntas) y se sirvieron desde un
   simulador de `fetch`. Ahí se le **inyectaron 15 errores a propósito**
   (enunciado acortado, pregunta de otro tipo, pregunta borrada, pregunta de más,
   título cambiado, tres opciones, cuestionario anónimo, negrita perdida,
   `[fecha]` sin llenar, «responder muchas», párrafo faltante, cursiva perdida,
   cierre a otra hora, apertura otro día, día de la semana equivocado) y el
   verificador detectó **los 15**.
2. **En Moodle de verdad.** Misma corrida contra el cuestionario real: el mismo
   resultado que la simulada.

La trampa: la primera versión del arnés daba «responder muchas» y todas las
preguntas «opcionales». No era el verificador: al serializar una página con
`outerHTML`, las propiedades `selected` y `checked` **no se guardan como
atributos**. Moodle sí los renderiza como atributos, así que en la página real
nunca pasa. Si algún día se rehace el simulador, hay que escribirlos con
`setAttribute('selected', '')`.

## Archivos

```
index.html      Interfaz: carga del guion, resumen, marcador y consola
script.js       Interfaz y entrega del verificador (marcador / consola)
lector.js       Lee el guion: pantallas, preguntas, opciones, fechas, comentarios
verificador.js  Lo que se ejecuta DENTRO de Moodle (se envía con toString())
styles.css      Estilos propios (la .dropzone no es compartida)
```

Comparte con las demás herramientas de QA `assets/evidencia-qa.js` (el PDF) y se
apoya en `assets/docx.js` **sin tocarlo**: usa `abrirDocumentoDocx`,
`segmentosDeParrafo` (que ya devuelve el color de resaltado) y
`leerComentariosDeDocx`. Lo compartido se agrega, no se cambia.

> ⚠️ El verificador se serializa con `toString()` y se ejecuta dentro de Moodle:
> **no puede depender de nada de fuera**. Y no se escriben caracteres invisibles
> (`U+00A0`, `U+200B`, `U+FEFF`…) tal cual en el código: van como `\u00a0`, o un
> editor los borra sin que nadie lo note.
