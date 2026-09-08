---
product_register: tool
design_model: B
canonical_sources:
  - assets/shared.css
  - tools/guion-a-pagina/vista-previa.js
  - tools/micrositio-a-pagina/hoja-moodle-default.js
---

# Sistema visual del panel de herramientas

## Dirección

El panel es una utilidad de escritorio clara, compacta y confiable. Su lenguaje
visual existente manda: superficies de vidrio para la aplicación y una isla
blanca, deliberadamente separada del tema, para representar Moodle con fidelidad.
Las funciones nuevas deben sentirse como extensiones del mismo instrumento, no
como micrositios con identidad propia.

## Fuentes de verdad

- `assets/shared.css` define tokens, temas y componentes compartidos de la interfaz.
- La salida HTML usa únicamente el vocabulario existente de Moodle y Bootstrap.
- `vista-previa.js` solo copia el subconjunto de Bootstrap necesario para que el
  iframe reproduzca las clases que genera la herramienta.
- No se duplican colores, versiones de Moodle ni estados interactivos en línea.

## Tokens y tipografía

- Interfaz: Inter con las fuentes de sistema ya declaradas.
- Previa de Moodle: Atkinson Hyperlegible, Roboto, Helvetica y Arial.
- Acento claro: `--accent: #0066cc`; hover: `--accent-hover: #004499`.
- Acento oscuro: `--accent: #4da3ff`; hover: `--accent-hover: #7cbcff`.
- Paneles: `--glass-bg`, `--glass-border` y `--glass-shadow`; radio de 24 px.
- Controles: tokens `--control-*` e `--input-*`; no crear colores locales.
- La previa permanece clara mediante `--preview-*`, incluso en tema oscuro.

## Componentes y comportamiento

- Reutilizar `.glass-panel`, `.btn-primary`, `.tabs`, `.code-output`, campos y
  patrones de scroll compartidos antes de crear reglas locales.
- Los controles se nombran con acciones o resultados en español.
- La interacción debe conservar foco visible, teclado, estados vacío/error y
  respuesta adaptable sin desplazar el contenido al cargar.
- Las rejillas de contenido publicado se expresan con clases Bootstrap; cualquier
  clase nueva generada también debe existir en el subconjunto de la previa.
- En series de imagen + acción, reservar una zona Bootstrap `ratio` común y
  contener la imagen sin deformarla para mantener alineados los controles. La
  medida editorial de los montajes de vocabulario es 400 × 400 con `img-fluid`;
  nunca se hereda el tamaño de visualización que traía Word.
- Las imágenes necesitan texto alternativo cuando son el único disparador. Si un
  botón contiguo ya nombra la acción, el `alt` puede quedar vacío si es decorativa.

## Límites

- Sin framework, build, npm en ejecución ni estilos en línea nuevos.
- Sin rutas absolutas: la PWA se publica dentro de un subdirectorio.
- Sin alterar estilos ya compartidos para resolver una sola herramienta.
- Todo cambio visual se verifica en escritorio, móvil, tema claro y tema oscuro;
  la vista previa debe conservar el aspecto claro de Moodle.

## Actividades de aprendizaje

La herramienta sigue la disposición del Integrador HTML: formularios visibles a
la izquierda, vista previa y código a la derecha. El catálogo se limita a sección,
texto, pasos, lista, tabla, imagen y enlace. Su código es independiente de Guion
a Página. La vista previa usa el tema real del aula Moodle 5.1.

| Capacidad | Fuente canónica | Variante de actividad | Verificación |
| --- | --- | --- | --- |
| Campos | Editor propio `actividad-a-html/script.js` | Bloques y pasos editables en línea | Edición y etiquetas asociadas |
| Opciones | Select nativo y `assets/paletas.js` | Cinco paletas; espacio inferior | Paletas y HTML generado |
| Scroll | `assets/shared.css`, `reparto.js` | Panel completo desplazable | Escritorio y móvil |
| Estado y avisos | `import-info`, `revision` | Enlace pendiente y Word incorrecto | Error recuperable y Deshacer |
| Importación | `assets/docx.js` y modelo propio | Marcas, incisos manuales y notas | Cuatro Word y cuatro HTML |

## Aviso de actualización

`assets/pwa.js` ofrece un diálogo modal centrado con los tokens glass compartidos.
Permanece abierto hasta Actualizar: no tiene cierre por Escape ni por fondo.
El diálogo nativo mantiene el foco y bloquea la interacción con el fondo.
Durante la activación se muestra progreso indeterminado, sin porcentaje ficticio;
la recarga ocurre tras la confirmación del SW. Si tarda, ofrece reintentar.
La animación respeta movimiento reducido y el cuadro cabe en móvil.

Las tablas de AA parten del montaje entregado (sin MW-auto) y ofrecen anchos,
bordes, encabezado y banda de color con formularios propios. La primera columna
usa las clases del tema para alternar color de aula y verde claro; nunca hex
fijos. Guion y Convertidor sirven de referencia, sin modificar sus editores.
