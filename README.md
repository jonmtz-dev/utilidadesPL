# Panel de Herramientas Moodle

Cajón de apps con utilidades propias para maquetar contenido en Moodle 5.1.
Sin build, sin dependencias, sin `npm install`: son archivos HTML/CSS/JS planos.
Se abre `index.html` en el navegador y funciona.

---

## 1. Para qué existe esto

Moodle 5.1 no hace responsivas las tablas: en celular se desbordan. La solución
adoptada fue un CSS propio en la hoja de estilos del tema de Moodle que, por
debajo de 576px, convierte cada `<tr>` en una tarjeta y usa el atributo
`data-label` de cada `<td>` para imprimir el encabezado de la columna.

**Ese CSS vive en Moodle, no en este repo.** Es el contrato que el generador de
tablas debe respetar (resumen de lo esencial):

```css
@media (max-width: 576px) {
    .tabla-responsive-cards thead { display: none; }
    .tabla-responsive-cards,
    .tabla-responsive-cards tbody,
    .tabla-responsive-cards tr,
    .tabla-responsive-cards th,
    .tabla-responsive-cards td { display: block; width: 100%; }
    .tabla-responsive-cards tr { /* tarjeta: borde, radio, sombra */ }
    .tabla-responsive-cards td[data-label]::before {
        content: attr(data-label);
        display: block;
        font-weight: 700;
    }
}
```

De ahí sale el trabajo real: **convertir a mano todas las tablas ya publicadas
en Moodle a ese formato es lentísimo**, y por eso existe el convertidor. La
misma lógica aplica a las demás herramientas: cada una automatiza un maquetado
repetitivo de la plataforma.

Consecuencia práctica: si cambias el HTML que generan las herramientas,
verifica que siga cuadrando con el CSS que está cargado en Moodle.

---

## 2. Estructura

```
index.html                  Launcher (el cajón de apps)
assets/
  shared.css                Tokens de diseño, temas, shell y componentes de UI
  theme.js                  Tema claro/oscuro + inyecta el switch en el header
  launcher.css              Estilos del launcher
  launcher.js               Dibuja las tarjetas y la búsqueda
  tools.js                  ← Registro de herramientas (la fuente de la verdad)
tools/
  convertidor-tablas/       Tablas de Word/HTML → tarjetas responsivas
    index.html · script.js · styles.css
  generador-bibliografias/  Fuentes de consulta → párrafos <p> con enlaces
    index.html · script.js · styles.css
.claude/launch.json         Config del servidor local para previsualizar
```

El launcher **se dibuja solo** a partir del arreglo `TOOLS` de
`assets/tools.js`. No hay tarjetas escritas a mano en `index.html`.

---

## 3. Las herramientas

### Convertidor de Tablas (`tools/convertidor-tablas/`)

Flujo de dos pasos: pegas la tabla (desde Word o HTML crudo) y luego **haces
clic en la fila que contiene los títulos**. Esa fila se vuelve el `<thead>` y
sus textos se copian al `data-label` de cada celda de las filas siguientes.

Salida típica:

```html
<div class="row bloque mt-3"><div class="col-12"><div class="table-responsive">
  <table class="table tabla-responsive-cards table-bordered border-neutral">
    <thead class="thead bg-primary-20">
      <tr><th scope="col" class="text-center align-middle">Materia</th></tr>
    </thead>
    <tbody>
      <tr class="align-middle">
        <td class="bg-primary-10" data-label="Materia">Álgebra</td>
      </tr>
    </tbody>
  </table>
</div></div></div>
```

Opciones: bordes, colorear la 1ª columna alternando rosa/verde
(`bg-primary-10` / `bg-secondary-10`), y envolver en contenedores Moodle.

### Generador de Bibliografías (`tools/generador-bibliografias/`)

Convierte una lista de fuentes en texto plano (una por renglón) en párrafos
`<p class="prepa-M{n}-textosParrafo">` con las URLs ya convertidas en enlaces.

Tres detalles que **no son adorno**, cada uno resuelve un problema real:

| Opción | Qué hace | Por qué |
| --- | --- | --- |
| Sangría francesa | `text-indent: -30px; position: relative; padding-left: 40px` | Formato requerido para las fuentes de consulta |
| Bloquear vista previa de YouTube | Envuelve el `<a>` en `<span class="nolink">` | Sin eso Moodle incrusta un reproductor en vez de dejar el enlace |
| Cortar URLs largas | `word-break: break-all` | Una URL no tiene espacios: sin esto el navegador no sabe dónde partirla y la baja completa al siguiente renglón, rompiendo la sangría. Con esto se parte justo donde acaba el renglón |

El botón "Ver ejemplo del maquetado" abre un modal con la estructura completa
del recurso y resaltados de color, y refleja los toggles activos.

---

## 4. Sistema de diseño

Estética glass/Apple: fondo con manchas difuminadas, paneles translúcidos con
`backdrop-filter`, radios de 24px, tipografía Inter, iconos
[Phosphor](https://phosphoricons.com) por CDN.

`assets/shared.css` ya trae resueltos los componentes comunes. **Úsalos en vez
de reescribirlos**: `.app-container`, `.glass-panel`, `.app-header`, `.logo`,
`.btn-back`, `.workspace`, `.panel-section`, `.section-header`,
`.toggle-switch` + `.slider`, `.btn-primary`, `.btn-secondary`, `.tabs` +
`.tab-btn` + `.tab-content`, `.empty-state`, `.code-wrapper` + `.code-output`,
`.btn-icon`, `.hidden`.

### Temas

El tema se aplica con `data-theme="light|dark"` en `<html>`. Lo gestiona
`assets/theme.js`, que se carga **en el `<head>` y sin `defer` a propósito**
para aplicar el color antes del primer pintado (si no, hay un destello blanco
al entrar en oscuro). Guarda la elección en `localStorage` bajo `panel-tema`;
si no hay ninguna, sigue la preferencia del sistema operativo. El switch se
inyecta solo en el `.app-header`, así que una herramienta nueva no lo maqueta.

**Regla de oro:** si un color debe cambiar entre claro y oscuro, va como token
en `:root` / `:root[data-theme="dark"]` de `shared.css`. Nunca hardcodeado en
un componente. Tokens disponibles: `--bg-color`, `--mesh-gradient`,
`--shape-opacity`, `--glass-*`, `--text-main`, `--text-muted`, `--accent`,
`--accent-hover`, `--success`, `--danger`, `--warning`, `--surface-raised`,
`--surface-translucent`, `--modal-bg`, `--modal-backdrop`, `--control-bg`,
`--control-border`, `--input-bg`, `--input-bg-focus`, `--input-border`,
`--slider-off`, `--disabled-bg`, `--card-glow`, `--hover-shadow`.

Ojo con las superficies translúcidas: `.glass-panel` aplica `backdrop-filter`,
y un fondo **opaco** anula el desenfoque. Por eso el modal usa `--modal-bg`
(translúcido) y no `--surface-raised` (sólido, para la pestaña activa).

**Excepción importante — las vistas previas son islas claras.** Los
`.preview-container` fijan `--preview-bg` / `--preview-text` / `--preview-border`
y **no cambian con el tema**, porque imitan la página real de Moodle, que
siempre es clara. Lo mismo los `--prepa-*` (rosa/verde de Moodle). Si inyectas
algo por JS dentro de una vista previa, usa colores fijos, no tokens temáticos:
`var(--accent)` en oscuro se aclara y pierde contraste sobre el fondo blanco.

### Layout

En escritorio la app ocupa **exactamente** el alto de la ventana y la página
nunca scrollea; lo que no cabe scrollea dentro de su panel. Esto depende de dos
cosas frágiles, no las rompas:

- El gutter va como `padding` del `body`, **no** como `margin` del
  `.app-container`. Un margen del hijo colapsa con el del body y empuja la
  página 16px de más.
- La cadena de flex necesita `min-height: 0` en cada eslabón
  (`.workspace`, `.panel-section`, `.tab-content`, `.code-wrapper`). Sin eso un
  elemento flex nunca encoge por debajo de su contenido y desborda.

Por debajo de 1024px de ancho (columnas apiladas) o 620px de alto, se devuelve
el scroll normal de página y cada bloque toma su alto natural.

---

## 5. Agregar una herramienta

1. Crea `tools/<slug>/index.html` con su `script.js` y `styles.css`.
2. En el `<head>`, en este orden:

   ```html
   <link rel="stylesheet" href="../../assets/shared.css">
   <link rel="stylesheet" href="styles.css">
   <script src="https://unpkg.com/@phosphor-icons/web"></script>
   <script src="../../assets/theme.js"></script>
   ```

   `shared.css` primero: tu hoja carga después para poder pisarlo.

3. Dentro del `<header class="app-header">` agrega el botón de regreso (el
   switch de tema se inyecta solo, junto a este botón):

   ```html
   <a class="btn-back" href="../../index.html"><i class="ph ph-arrow-left"></i> Panel</a>
   ```

4. Regístrala en `assets/tools.js`:

   ```js
   {
       slug: 'mi-herramienta',
       title: 'Mi Herramienta',
       description: 'Qué hace, en una línea.',
       icon: 'wrench',                    // nombre Phosphor sin el prefijo ph-
       accent: ['#0066cc', '#00c6ff'],    // degradado del icono
       tags: ['Moodle'],
       url: 'tools/mi-herramienta/index.html',
       status: 'ready'                    // 'soon' la pinta gris y no clicable
   }
   ```

5. En tu `script.js` arranca comprobando el estado del DOM, no solo con el
   listener (ver "Trampas conocidas").

---

## 6. Trampas conocidas

Cosas que ya costaron un rato; no las vuelvas a pisar.

- **`DOMContentLoaded` puede no dispararse.** Si el script se ejecuta cuando el
  DOM ya está listo, el listener nunca corre y la página queda vacía. Patrón a
  usar siempre:

  ```js
  if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
  } else {
      init();
  }
  ```

- **El CSS de la herramienta pisa a `shared.css`.** Misma especificidad + carga
  posterior = gana el último. Una media query en `shared.css` sobre `.plain-input`
  NO le gana a un `.plain-input { min-height: 0 }` del CSS de la herramienta. Las
  reglas de selectores propios de una herramienta van en SU hoja.

- **Los campos flexibles necesitan un mínimo.** `min-height: 140px` en las áreas
  de entrada: con la ventana apretada se aplastaban a 30px. El panel scrollea en
  vez de aplastarlas.

- **`display: flex` convierte cada hijo en ítem flex**, incluidos los `<strong>`
  sueltos dentro de un `<p>`. Envuelve el texto en un `<span>` o se parte en
  columnas.

- **Grid: `align-content` es `stretch` por defecto.** En el launcher hacía que
  las tarjetas se estiraran al alto completo; va en `start`.

- El texto que pega el usuario **no se escapa** (comportamiento heredado del
  código original). Con bibliografías normales no estorba, pero un `<` o `&` se
  interpretaría como HTML.

---

## 7. Desarrollo

Basta con abrir `index.html` en el navegador (funciona en `file://`).

Para servirlo por HTTP:

```
python -m http.server 5510
```

y abre <http://localhost:5510>.

> **Nota sobre caché:** el navegador puede quedarse con un CSS viejo aunque el
> archivo ya cambió, y eso se ve como tokens que "no existen" (`var(--x)` cae a
> transparente) o estilos que no aplican. Antes de dar por roto un cambio de
> CSS, recarga sin caché (Ctrl+F5). El preview embebido de algunos entornos es
> especialmente agresivo cacheando `file://`.

### Cómo verificar un cambio

No basta con que el CSS "se vea bien" en un screenshot. Lo que se probó y vale
la pena repetir:

- Convertidor: pegar una tabla, hacer clic en la fila de títulos, y confirmar
  que la salida trae `tabla-responsive-cards` y un `data-label` por celda.
- Bibliografías: generar con los toggles encendidos y apagados, y confirmar que
  el `span.nolink` solo envuelve enlaces de YouTube.
- Layout: con contenido largo (30 filas), comprobar
  `document.documentElement.scrollHeight > innerHeight === false` en escritorio.
- Temas: recargar con `localStorage.setItem('panel-tema','dark')` y revisar que
  las vistas previas sigan claras y legibles.
