/* ==========================================================================
   Lector de .docx compartido entre herramientas.

   Vive en assets/ y no dentro de una herramienta porque ya lo necesitan dos
   (Adaptador de Rúbricas lee tablas, Generador de Bibliografías lee párrafos),
   y duplicarlo es exactamente cómo se nos quedó vivo el hex #d8a7b6 en el
   Convertidor de Tablas: se arregla en una copia y la otra se queda atrás.

   Lo original: solo lo necesario para sacar las TABLAS de una rúbrica.

   Un .docx es un ZIP; adentro, `word/document.xml` trae el contenido. No hace
   falta ninguna librería: el navegador ya sabe inflar (DecompressionStream) y
   parsear XML (DOMParser). Fiel al proyecto: sin build, sin dependencias.

   ⚠️ Construido leyendo un .docx REAL de rúbrica (M17_S3_AI6), no a ciegas.
   Lo que se encontró ahí y define el diseño:
     · La tabla es de 7 columnas: criterio + 6 niveles.
     · Cada criterio ocupa DOS filas: la de arriba tiene los textos y la de
       abajo SOLO los puntos ("40 puntos"). Se relacionan por `w:vMerge` en la
       celda del criterio (`restart` arriba, `continue` abajo).
     · Al final hay una fila "Total" que NO es un criterio.
   ========================================================================== */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
// Las ecuaciones del editor de Word (OMML) viven en su propio espacio de
// nombres, con sus propios runs (`m:r` con `m:t`). Por eso NO las veía nadie:
// todo el lector busca `w:r`, y una fórmula no tiene ni uno solo.
const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

// No todos los DOM resuelven igual el selector con namespaces usado por
// `closest('*|tbl')`. Recorrer los padres separa de forma estable las tablas
// reales de las tablas anidadas.
function tablaAncestro(nodo) {
    let actual = nodo && nodo.parentNode;
    while (actual) {
        if (actual.localName === 'tbl') return actual;
        actual = actual.parentNode;
    }
    return null;
}

/** Lee el directorio central del ZIP y devuelve Map<nombre, Uint8Array>. */
async function leerZip(buffer) {
    const datos = new Uint8Array(buffer);
    const dv = new DataView(buffer);

    // El End Of Central Directory está al final; se busca su firma hacia atrás.
    let eocd = -1;
    for (let i = datos.length - 22; i >= 0 && i > datos.length - 65558; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('No parece un archivo .docx válido (no se encontró el índice del ZIP).');

    const totalEntradas = dv.getUint16(eocd + 10, true);
    let puntero = dv.getUint32(eocd + 16, true);
    const archivos = new Map();

    for (let i = 0; i < totalEntradas; i++) {
        if (dv.getUint32(puntero, true) !== 0x02014b50) break;
        const metodo = dv.getUint16(puntero + 10, true);
        const tamComprimido = dv.getUint32(puntero + 20, true);
        const largoNombre = dv.getUint16(puntero + 28, true);
        const largoExtra = dv.getUint16(puntero + 30, true);
        const largoComentario = dv.getUint16(puntero + 32, true);
        const offsetLocal = dv.getUint32(puntero + 42, true);
        const nombre = new TextDecoder().decode(datos.subarray(puntero + 46, puntero + 46 + largoNombre));

        // La cabecera local repite el nombre y el extra, con longitudes propias.
        const nombreLocal = dv.getUint16(offsetLocal + 26, true);
        const extraLocal = dv.getUint16(offsetLocal + 28, true);
        const inicioDatos = offsetLocal + 30 + nombreLocal + extraLocal;
        archivos.set(nombre, { metodo, bytes: datos.subarray(inicioDatos, inicioDatos + tamComprimido) });

        puntero += 46 + largoNombre + largoExtra + largoComentario;
    }
    return archivos;
}

async function inflar(entrada) {
    if (entrada.metodo === 0) return entrada.bytes;          // guardado sin comprimir
    if (entrada.metodo !== 8) throw new Error('Compresión del .docx no soportada (método ' + entrada.metodo + ').');
    const stream = new Blob([entrada.bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Texto de una celda, conservando el salto de línea entre párrafos (las
 * definiciones de nivel son listas de viñetas y esos saltos importan).
 *
 * Con `opciones.formatosLista` (el mapa de leerFormatosListaDocx) además
 * **reescribe la viñeta como texto**: Word no guarda el "•" ni el "1." en el
 * párrafo, los pinta a partir de numbering.xml, así que al leer solo los `w:t`
 * la lista se convertía en un montón de renglones sueltos. En el editor de
 * rúbricas de Moodle la definición es un campo de texto plano: si la viñeta no
 * va escrita, no existe.
 *
 * Es opcional a propósito: quien genera HTML (Guion Instruccional a Página)
 * quiere la lista como estructura, no un "• " literal dentro del párrafo.
 */
function textoDeCelda(tc, opciones) {
    const formatos = opciones && opciones.formatosLista;
    const tabla = tablaAncestro(tc);
    const parrafos = [...tc.getElementsByTagNameNS(W_NS, 'p')]
        .filter(p => tablaAncestro(p) === tabla);

    // Un contador por lista y nivel, para que una numerada diga 1., 2., 3.
    const contadores = new Map();

    return parrafos
        .map(p => {
            const texto = [...p.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent || '').join('');
            if (!formatos || !texto.trim()) return texto;

            const numPr = p.getElementsByTagNameNS(W_NS, 'numPr')[0];
            if (!numPr) {
                // Un párrafo normal corta la numeración: lo que siga vuelve a 1.
                contadores.clear();
                return texto;
            }

            const nodoNum = numPr.getElementsByTagNameNS(W_NS, 'numId')[0];
            const numId = nodoNum && nodoNum.getAttributeNS(W_NS, 'val');
            const ilvl = numPr.getElementsByTagNameNS(W_NS, 'ilvl')[0];
            const nivel = Number(ilvl && ilvl.getAttributeNS(W_NS, 'val')) || 0;
            const formato = formatos[`${numId}:${nivel}`] || { tipo: 'vinetas', nivelVisual: nivel };

            const clave = `${numId}:${nivel}`;
            const n = (contadores.get(clave) || 0) + 1;
            contadores.set(clave, n);

            const marca = formato.tipo === 'vinetas' ? '• '
                : (formato.tipo === 'letras' ? `${String.fromCharCode(96 + n)}. ` : `${n}. `);
            const sangria = '  '.repeat(Math.max(0, formato.nivelVisual || 0));
            return sangria + marca + texto;
        })
        .join('\n')
        .trim();
}

/** Abre el .docx y devuelve su document.xml ya parseado. */
async function abrirDocumentoDocx(file) {
    const archivos = await leerZip(await file.arrayBuffer());
    const entrada = archivos.get('word/document.xml');
    if (!entrada) throw new Error('El archivo no contiene word/document.xml (¿es realmente un .docx?).');

    const xml = new TextDecoder('utf-8').decode(await inflar(entrada));
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('No se pudo leer el XML interno del .docx.');
    return doc;
}

/**
 * Párrafos sueltos del documento (los que NO están dentro de una tabla).
 * Es lo que necesita una bibliografía: cada entrada es un párrafo.
 *
 * ⚠️ Word mete espacios duros (U+00A0) por todos lados —medidos 50 en un
 * archivo real de bibliografía, varios pegados a las URLs
 * ("línea], https://… (consultado")—. Se normalizan a espacio normal
 * y se colapsan: si no, el HTML de salida quedaría con nbsp literales donde
 * Moodle tiene espacios normales, y cualquier comparación posterior fallaría
 * por una diferencia invisible.
 */
async function leerParrafosDeDocx(file) {
    const doc = await abrirDocumentoDocx(file);
    const body = doc.getElementsByTagNameNS(W_NS, 'body')[0] || doc.documentElement;

    return [...body.getElementsByTagNameNS(W_NS, 'p')]
        .filter(p => !tablaAncestro(p))   // fuera lo que va en tablas
        .map(p => [...p.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent || '').join(''))
        .map(t => t.replace(/ /g, ' ').replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean);
}

/**
 * Comentarios de revisión del Word (word/comments.xml). En las actividades se
 * usan como indicaciones de montaje ("Vincular el PDF descargable ...") ancladas
 * a una palabra del texto ("rúbrica"): NO es un enlace real, es una nota. No es
 * contenido publicable, pero el montaje no debe olvidarlo. Se entrega el texto
 * de la nota junto con la palabra que señala.
 *   [{ id, autor, texto, ancla }]
 *
 * `id` es el del propio Word (`w:id`): permite localizar el comentario en el
 * documento (`w:commentRangeStart` / `w:commentReference`) cuando el ancla
 * viene vacía. Pasa de verdad: en los guiones de cuestionario, el LaTeX se
 * comenta sobre una celda vacía y `ancla` sale en blanco, así que la única
 * forma de saber a qué reactivo pertenece es la posición, no el texto.
 */
async function leerComentariosDeDocx(file) {
    const archivos = await leerZip(await file.arrayBuffer());
    const entradaComentarios = archivos.get('word/comments.xml');
    if (!entradaComentarios) return [];
    const parsear = async (entrada) => new DOMParser().parseFromString(
        new TextDecoder('utf-8').decode(await inflar(entrada)), 'application/xml');

    const docComentarios = await parsear(entradaComentarios);
    const porId = new Map();
    for (const c of [...docComentarios.getElementsByTagNameNS(W_NS, 'comment')]) {
        const texto = [...c.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent || '')
            .join('').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
        porId.set(c.getAttributeNS(W_NS, 'id'), { autor: (c.getAttributeNS(W_NS, 'author') || '').trim(), texto });
    }

    // El texto señalado va entre <w:commentRangeStart> y <w:commentRangeEnd> con
    // el mismo id; se recorre el documento en orden acumulando el <w:t> que quede
    // dentro de cada rango abierto.
    const entradaDoc = archivos.get('word/document.xml');
    const anclas = new Map();
    if (entradaDoc) {
        const doc = await parsear(entradaDoc);
        const abiertos = new Set();
        const recorrer = (nodo) => {
            for (const n of [...nodo.childNodes]) {
                if (n.nodeType !== 1 || n.namespaceURI !== W_NS) { if (n.nodeType === 1) recorrer(n); continue; }
                if (n.localName === 'commentRangeStart') abiertos.add(n.getAttributeNS(W_NS, 'id'));
                else if (n.localName === 'commentRangeEnd') abiertos.delete(n.getAttributeNS(W_NS, 'id'));
                else if (n.localName === 't' && abiertos.size) { const t = n.textContent || ''; abiertos.forEach(id => anclas.set(id, (anclas.get(id) || '') + t)); }
                else recorrer(n);
            }
        };
        recorrer(doc.getElementsByTagNameNS(W_NS, 'body')[0] || doc.documentElement);
    }

    return [...porId.entries()]
        .filter(([, c]) => c.texto)
        .map(([id, c]) => ({ id, ...c, ancla: (anclas.get(id) || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim() }));
}

/**
 * Extrae las tablas del .docx como una estructura neutral:
 *   [{ filas: [{ celdas: [{ texto, vMergeInicio, vMergeSigue }] }] }]
 * La misma forma que produce el lector de HTML pegado, para que el análisis
 * de la rúbrica sea UNO SOLO y no dos caminos que puedan divergir.
 */
async function leerTablasDeDocx(file) {
    const doc = await abrirDocumentoDocx(file);
    // Las rúbricas describen los niveles con listas; sin numbering.xml la
    // viñeta se pierde, porque Word no la guarda dentro del párrafo.
    const formatosLista = await leerFormatosListaDocx(file);

    return [...doc.getElementsByTagNameNS(W_NS, 'tbl')].map(tbl => {
        // Solo las filas de ESTA tabla (no las de tablas anidadas).
        const filas = [...tbl.getElementsByTagNameNS(W_NS, 'tr')]
            .filter(tr => tablaAncestro(tr) === tbl);

        return {
            filas: filas.map(tr => ({
                celdas: [...tr.getElementsByTagNameNS(W_NS, 'tc')]
                    .filter(tc => tablaAncestro(tc) === tbl).map(tc => {
                    const tcPr = tc.getElementsByTagNameNS(W_NS, 'tcPr')[0];
                    const vMerge = tcPr && tcPr.getElementsByTagNameNS(W_NS, 'vMerge')[0];
                    const val = vMerge && (vMerge.getAttributeNS(W_NS, 'val') || 'continue');
                    return {
                        texto: textoDeCelda(tc, { formatosLista }),
                        vMergeInicio: val === 'restart',
                        vMergeSigue: val === 'continue'
                    };
                })
            }))
        };
    });
}

/* ==========================================================================
   Fórmulas: OMML → LaTeX

   Los guiones traen las ecuaciones como objetos del editor de Word (OMML) y,
   al lado, un comentario de revisión "Código para producción: <latex>" con el
   código que el área de producción escribió a mano. Hasta ahora el lector
   perdía las dos cosas: el texto de una fórmula vive en `m:t` (espacio de
   nombres de matemáticas) y ningún recorrido lo miraba, así que "el límite
   cuando m→0, m→3 y m→6" llegaba a Moodle como "el límite cuando , y .".

   Manda SIEMPRE el comentario: es el código autorizado. La conversión de aquí
   es el respaldo para las fórmulas sin comentario —las variables sueltas en
   medio de la prosa ("después de m minutos"), que nadie comenta y que se
   estaban borrando— y por eso la herramienta avisa cuántas convirtió sola.
   ========================================================================== */

/* Word guarda el símbolo, no su comando. En LaTeX un "→" suelto no compila.
   Solo están los que aparecen en guiones de cálculo y estadística; agregar
   uno nuevo es una línea. */
const SIMBOLOS_LATEX = {
    '→': '\\rightarrow ', '←': '\\leftarrow ', '↔': '\\leftrightarrow ',
    '⇒': '\\Rightarrow ', '⇐': '\\Leftarrow ', '⇔': '\\Leftrightarrow ',
    '∞': '\\infty ', '≤': '\\leq ', '≥': '\\geq ', '≠': '\\neq ',
    '≈': '\\approx ', '≡': '\\equiv ', '±': '\\pm ', '∓': '\\mp ',
    '×': '\\times ', '÷': '\\div ', '·': '\\cdot ', '∙': '\\cdot ',
    '∑': '\\sum ', '∏': '\\prod ', '∫': '\\int ', '∂': '\\partial ',
    '∈': '\\in ', '∉': '\\notin ', '⊂': '\\subset ', '⊆': '\\subseteq ',
    '∪': '\\cup ', '∩': '\\cap ', '∅': '\\emptyset ',
    '∀': '\\forall ', '∃': '\\exists ', '…': '\\dots ', '°': '^{\\circ}',
    'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ',
    'ε': '\\varepsilon ', 'θ': '\\theta ', 'λ': '\\lambda ', 'μ': '\\mu ',
    'π': '\\pi ', 'ρ': '\\rho ', 'σ': '\\sigma ', 'τ': '\\tau ',
    'φ': '\\phi ', 'ω': '\\omega ',
    'Δ': '\\Delta ', 'Ω': '\\Omega ', 'Σ': '\\Sigma ', 'Π': '\\Pi '
};

function textoMatematicoALatex(texto) {
    let salida = '';
    for (const c of String(texto || '')) salida += (SIMBOLOS_LATEX[c] || c);
    /* "1 440" es el separador de millares que teclea el elaborador. En LaTeX el
       espacio normal se colapsa y saldría "1440"; `\,` es el espacio fino que
       usan los códigos de producción escritos a mano ("1\,000m"). */
    return salida.replace(/(\d)[\s ](?=\d)/g, '$1\\,');
}

/** Símbolo del operador grande de un `m:nary` (∑, ∏, ∫…) a su comando. */
const NARY_LATEX = { '∑': '\\sum', '∏': '\\prod', '∫': '\\int', '∬': '\\iint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap' };

/**
 * Convierte un nodo OMML a LaTeX. Cubre lo que aparece en los guiones:
 * fracciones, potencias, subíndices, raíces, paréntesis, sumatorias y
 * límites. Lo que no reconoce se aplana concatenando sus hijos, que es peor
 * que exacto pero mucho mejor que perder el texto.
 */
function omathALatex(nodo) {
    if (!nodo || nodo.nodeType !== 1) return '';
    // Un nodo de otro espacio de nombres dentro de la fórmula solo trae formato
    // (`w:rPr`, `w:sz`): no aporta texto.
    if (nodo.namespaceURI !== M_NS) return '';

    const local = nodo.localName;
    // Todo lo que termina en "Pr" son propiedades (m:fPr, m:ctrlPr, m:rPr…).
    if (/Pr$/.test(local)) return '';
    if (local === 't') return textoMatematicoALatex(nodo.textContent);

    const hijos = [...nodo.childNodes].filter(n => n.nodeType === 1);
    const unir = (lista) => lista.map(omathALatex).join('');
    const parte = (nombre) => {
        const n = hijos.find(x => x.namespaceURI === M_NS && x.localName === nombre);
        return n ? unir([...n.childNodes].filter(c => c.nodeType === 1)) : '';
    };
    const atributo = (contenedor, nombre) => {
        const pr = hijos.find(x => x.namespaceURI === M_NS && x.localName === contenedor);
        const n = pr && [...pr.childNodes].find(c => c.nodeType === 1 && c.localName === nombre);
        return n ? (n.getAttributeNS(M_NS, 'val') || '') : '';
    };

    if (local === 'f') return `\\frac{${parte('num')}}{${parte('den')}}`;
    if (local === 'sSup') return `{${parte('e')}}^{${parte('sup')}}`;
    if (local === 'sSub') return `{${parte('e')}}_{${parte('sub')}}`;
    if (local === 'sSubSup') return `{${parte('e')}}_{${parte('sub')}}^{${parte('sup')}}`;
    if (local === 'sPre') return `{}_{${parte('sub')}}^{${parte('sup')}}{${parte('e')}}`;
    if (local === 'rad') {
        const grado = parte('deg');
        return grado ? `\\sqrt[${grado}]{${parte('e')}}` : `\\sqrt{${parte('e')}}`;
    }
    if (local === 'd') {
        const abre = atributo('dPr', 'begChr') || '(';
        const cierra = atributo('dPr', 'endChr') || ')';
        const separa = atributo('dPr', 'sepChr') || ',';
        const partes = hijos.filter(x => x.localName === 'e').map(e => unir([...e.childNodes].filter(c => c.nodeType === 1)));
        // Las llaves son comando en LaTeX; el resto del par va tal cual.
        const par = (c) => (c === '{' || c === '}' ? `\\${c}` : c);
        return `\\left${par(abre)}${partes.join(separa)}\\right${par(cierra)}`;
    }
    if (local === 'nary') {
        const chr = atributo('naryPr', 'chr') || '∑';
        const sub = parte('sub'), sup = parte('sup');
        return `${NARY_LATEX[chr] || textoMatematicoALatex(chr)}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''}{${parte('e')}}`;
    }
    if (local === 'limLow' || local === 'limUpp') {
        const base = parte('e').trim();
        const limite = parte('lim');
        // "lim" es una función, no tres letras multiplicadas: sin \lim saldría
        // en cursiva y con el subíndice mal colocado.
        const raiz = /^(lim|max|min|sup|inf)$/i.test(base) ? `\\${base.toLowerCase()}` : `{${base}}`;
        return `${raiz}${local === 'limLow' ? '_' : '^'}{${limite}}`;
    }
    if (local === 'bar') return `\\overline{${parte('e')}}`;
    if (local === 'acc') return `\\hat{${parte('e')}}`;

    return unir(hijos);
}

/* La marca con que producción escribe el código de una fórmula en un
   comentario del Word. Se comparte para que el Integrador pueda apartar esos
   comentarios de las indicaciones de montaje: ya son contenido, no un recado. */
const MARCA_LATEX_COMENTARIO = /^\s*c[oó]digo\s+para\s+producci[oó]n\s*:?\s*/i;

/** ¿El comentario del Word es un código de fórmula y no una indicación? */
function esComentarioDeLatex(texto) { return MARCA_LATEX_COMENTARIO.test(String(texto || '')); }

/**
 * Map<idDeComentario, latex> con los códigos de producción del Word.
 * El id es el `w:id` del comentario, el mismo con que `w:commentRangeStart`
 * señala la fórmula dentro del párrafo: así se sabe QUÉ ecuación describe cada
 * comentario sin adivinar por el texto (el ancla de una fórmula sale vacía).
 */
async function leerLatexDeComentariosDocx(file) {
    const mapa = new Map();
    for (const c of await leerComentariosDeDocx(file)) {
        if (!esComentarioDeLatex(c.texto)) continue;
        const latex = c.texto.replace(MARCA_LATEX_COMENTARIO, '').trim();
        if (latex) mapa.set(c.id, latex);
    }
    return mapa;
}

/**
 * Las piezas de texto de un párrafo, en orden: `{ run }` para un `w:r` normal
 * y `{ math, comentarios }` para una ecuación.
 *
 * Sin fórmulas se conserva EXACTAMENTE lo de siempre —todos los `w:r`
 * descendientes— porque tres herramientas dependen de ese recorrido. Con
 * fórmulas hay que bajar por el árbol en orden: un `getElementsByTagName` no
 * dice si la ecuación va antes o después del texto que la rodea, y "cuando
 * m→0, m→3 y m→6" depende justo de eso.
 *
 * `comentarios` son los ids abiertos (`w:commentRangeStart`) sobre la fórmula:
 * ahí es donde el Word guarda el "Código para producción". Se rastrean dentro
 * del párrafo, que es donde producción los ancla; un rango abierto en un
 * párrafo anterior no se sigue, y entonces la fórmula cae en la conversión
 * automática, que es el respaldo correcto.
 */
function unidadesDeParrafo(p, conLatex) {
    if (!conLatex) return [...p.getElementsByTagNameNS(W_NS, 'r')].map(run => ({ run }));
    const salida = [];
    const abiertos = new Set();
    const recorrer = (nodo) => {
        for (const n of [...nodo.childNodes]) {
            if (n.nodeType !== 1) continue;
            if (n.namespaceURI === M_NS && n.localName === 'oMath') {
                salida.push({ math: n, comentarios: [...abiertos] });
                continue;
            }
            if (n.namespaceURI === W_NS) {
                if (n.localName === 'r') { salida.push({ run: n }); continue; }
                if (n.localName === 'commentRangeStart') { abiertos.add(n.getAttributeNS(W_NS, 'id')); continue; }
                if (n.localName === 'commentRangeEnd') { abiertos.delete(n.getAttributeNS(W_NS, 'id')); continue; }
                // Las propiedades del párrafo no traen texto y sí traen `w:rPr`.
                if (n.localName === 'pPr') continue;
            }
            recorrer(n);
        }
    };
    recorrer(p);
    return salida;
}

/**
 * Texto de un párrafo conservando las negritas como marcas `**texto**` y, si se
 * piden, las cursivas como `*texto*` (una sola estrella, como en markdown).
 * Word parte un mismo texto en varios runs (por el corrector, por ediciones);
 * aquí se fusionan los runs contiguos con el mismo formato para no generar
 * `**guárdalo** **en tu equipo**`. Los espacios de orilla quedan FUERA de las
 * marcas: un `** texto**` no se reconocería al convertirlo a <strong>.
 */
function textoDeParrafoConNegritas(p, opciones) {
    /* `saltos` conserva los saltos de línea manuales (Shift+Enter, que en el XML
       son `w:br`) como `\n`. Va apagado por omisión a propósito: quien parte
       listas por renglón —el Integrador HTML— convertiría un salto dentro de un
       elemento en dos elementos. Lo pide quien sí los necesita: en la celda de
       una ventana emergente, "Periodo: …" y "Descubrimientos:" son dos renglones
       del mismo párrafo y sin esto salían pegados en una sola frase. */
    const saltos = Boolean(opciones && opciones.saltos);
    /* Las cursivas van APAGADAS por omisión, como los saltos: quien ya usa esta
       función espera solo `**` y una marca inesperada se publicaría tal cual en
       el HTML del Integrador. Lo pide quien lo necesita —el QA 5.1, que coteja
       el formato contra lo montado en Moodle—.

       La marca es `*texto*` y NO `_texto_` a propósito: los guiones piden
       guardar el archivo como "Apellidos_Nombre_SM02S1AA1", y con guiones bajos
       ese nombre se leería como una cursiva que nadie escribió. */
    const cursivas = Boolean(opciones && opciones.cursivas);
    /* Las fórmulas también van APAGADAS por omisión, como los saltos y las
       cursivas: quien no las pidió no espera ver `$$…$$` dentro de su texto, y
       en el editor de rúbricas de Moodle esos signos se publicarían literales.
       Lo pide quien genera HTML para una página (el Integrador 3.11). */
    const conLatex = Boolean(opciones && opciones.latex);
    const latexPorComentario = (opciones && opciones.latexPorComentario) || null;
    const segmentos = [];
    for (const unidad of unidadesDeParrafo(p, conLatex)) {
        if (unidad.math) {
            /* El comentario manda: es el código que autorizó producción. La
               conversión automática es el respaldo (`auto` deja que la
               herramienta avise cuáles conviene revisar). */
            let latex = '', auto = false;
            for (const id of unidad.comentarios) {
                const codigo = latexPorComentario && latexPorComentario.get(id);
                if (codigo) { latex = codigo; break; }
            }
            if (!latex) { latex = omathALatex(unidad.math).trim(); auto = true; }
            // Un `$$…$$` NUNCA se fusiona con el texto de al lado: si entrara al
            // segmento vecino, las marcas `**` podrían acabar dentro del código.
            if (latex) segmentos.push({ texto: `$$${latex}$$`, negrita: false, cursiva: false, math: true, auto });
            continue;
        }
        const r = unidad.run;
        const texto = saltos
            ? [...r.childNodes]
                .filter(n => n.nodeType === 1 && (n.localName === 't' || n.localName === 'br'))
                .map(n => n.localName === 'br' ? '\n' : (n.textContent || ''))
                .join('')
            : [...r.getElementsByTagNameNS(W_NS, 't')].map(t => t.textContent || '').join('');
        if (!texto) continue;
        const rPr = r.getElementsByTagNameNS(W_NS, 'rPr')[0];
        const encendido = (nodo) => {
            if (!nodo) return false;
            const val = nodo.getAttributeNS(W_NS, 'val') || 'true';
            return val !== 'false' && val !== '0' && val !== 'none';
        };
        const negrita = encendido(rPr && rPr.getElementsByTagNameNS(W_NS, 'b')[0]);
        const cursiva = cursivas && encendido(rPr && rPr.getElementsByTagNameNS(W_NS, 'i')[0]);
        const previo = segmentos[segmentos.length - 1];
        if (previo && !previo.math && previo.negrita === negrita && previo.cursiva === cursiva) previo.texto += texto;
        else segmentos.push({ texto, negrita, cursiva });
    }
    return segmentos.map(s => {
        if (!s.texto.trim() || (!s.negrita && !s.cursiva)) return s.texto;
        // Los espacios de orilla quedan FUERA de las marcas: un `** texto**` no
        // se reconocería al convertirlo a <strong>.
        const m = s.texto.match(/^(\s*)([\s\S]*?)(\s*)$/);
        let dentro = m[2];
        if (s.cursiva) dentro = `*${dentro}*`;
        if (s.negrita) dentro = `**${dentro}**`;
        return `${m[1]}${dentro}${m[3]}`;
    }).join('');
}

/**
 * Lee el cuerpo de un Word en el orden en que aparece. Sirve para documentos
 * de actividades: las barras grises son tablas de una celda y el texto que
 * sigue pertenece a esa sección. No intenta reproducir el diseño de Word;
 * entrega una estructura neutral para que cada herramienta decida qué hacer.
 */
async function leerBloquesDeDocx(file, opciones) {
    const doc = await abrirDocumentoDocx(file);
    const body = doc.getElementsByTagNameNS(W_NS, 'body')[0] || doc.documentElement;
    const formatosLista = await leerFormatosListaDocx(file);
    const sangriasDeEstilo = await leerSangriasDeEstilosDocx(file);
    /* Con `opciones.latex` los códigos de producción del Word entran como un
       campo más de las opciones del párrafo. Se leen aquí y no adentro porque
       viven en otra parte del ZIP (word/comments.xml) y esto sí es async. */
    const opcionesTexto = opciones && opciones.latex
        ? Object.assign({}, opciones, { latexPorComentario: await leerLatexDeComentariosDocx(file) })
        : opciones;

    const bloqueDesdeNodo = n => {
        if (n.localName === 'p') {
            const texto = textoDeParrafoConNegritas(n, opcionesTexto)
                .replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
            const numPr = n.getElementsByTagNameNS(W_NS, 'numPr')[0];
            const ilvl = numPr && numPr.getElementsByTagNameNS(W_NS, 'ilvl')[0];
            const numId = numPr && numPr.getElementsByTagNameNS(W_NS, 'numId')[0];
            const jc = n.getElementsByTagNameNS(W_NS, 'jc')[0];
            // Sangría izquierda del Word (w:ind), en twips. Sirve para el texto de
            // cuerpo que va indentado bajo un punto de lista ("1. ..." y debajo un
            // párrafo alineado con su texto). Se entrega crudo; la herramienta decide.
            const ind = n.getElementsByTagNameNS(W_NS, 'ind')[0];
            const sangria = ind ? Math.max(0, Number(ind.getAttributeNS(W_NS, 'left') || ind.getAttributeNS(W_NS, 'start') || 0)) : 0;
            /* Sangria FRANCESA (la primera linea sale a la izquierda del resto):
               es `w:hanging`, o un `w:firstLine` negativo. Va como campo NUEVO
               —`sangriaColgante` en twips y `sangriaFrancesa` ya resuelto— para
               no tocar `sangria`, que tres herramientas ya leen como "cuanto se
               corre el parrafo".
               Cuando el parrafo no la trae escrita encima, se hereda del estilo
               (los Word de bibliografia suelen definirla en un estilo propio). */
            const colganteDirecto = ind && ind.hasAttributeNS(W_NS, 'hanging')
                ? Number(ind.getAttributeNS(W_NS, 'hanging') || 0) : 0;
            const primeraDirecta = ind && ind.hasAttributeNS(W_NS, 'firstLine')
                ? Number(ind.getAttributeNS(W_NS, 'firstLine') || 0) : 0;
            const traeIndPropio = Boolean(ind
                && (ind.hasAttributeNS(W_NS, 'hanging') || ind.hasAttributeNS(W_NS, 'firstLine')));
            const pStyle = n.getElementsByTagNameNS(W_NS, 'pStyle')[0];
            const delEstilo = pStyle ? sangriasDeEstilo[pStyle.getAttributeNS(W_NS, 'val')] : 0;
            const colgante = Math.round(traeIndPropio
                ? Math.max(colganteDirecto, primeraDirecta < 0 ? -primeraDirecta : 0)
                : (delEstilo || 0));
            const idLista = numId && numId.getAttributeNS(W_NS, 'val');
            const nivel = Number(ilvl && ilvl.getAttributeNS(W_NS, 'val') || 0);
            // Algunos Word no incrementan `ilvl` al anidar. En su lugar crean
            // otro numId y guardan la sangría visual en numbering.xml. Usa esa
            // información como respaldo para no aplanar la jerarquía.
            const formatoLista = formatosLista[`${idLista}:${nivel}`];
            const nivelVisual = formatoLista && typeof formatoLista === 'object' ?
                Number.isFinite(formatoLista.nivelVisual) ? formatoLista.nivelVisual : nivel : nivel;
            // Las imágenes van como <a:blip r:embed="rIdN"> dentro del párrafo.
            // Se entrega el id para que la herramienta las resuelva con
            // leerImagenesDeDocx (aquí no se cargan bytes: no siempre se usan).
            const imagenes = [...n.getElementsByTagNameNS(A_NS, 'blip')]
                .map(b => b.getAttributeNS(REL_NS, 'embed')).filter(Boolean);
            return {
                tipo: 'parrafo',
                texto,
                imagenes,
                sangria,
                sangriaColgante: colgante,
                sangriaFrancesa: colgante > 0,
                lista: Boolean(numPr),
                idLista,
                tipoLista: (formatoLista && typeof formatoLista === 'object' ? formatoLista.tipo : formatoLista) || 'ordenada',
                nivelLista: nivelVisual,
                alineacion: jc && jc.getAttributeNS(W_NS, 'val') === 'center' ? 'centro' :
                    (jc && jc.getAttributeNS(W_NS, 'val') === 'right' ? 'derecha' :
                        (jc && jc.getAttributeNS(W_NS, 'val') === 'both' ? 'justificado' : 'izquierda'))
            };
        }
        if (n.localName === 'tbl') {
            const filasXml = [...n.getElementsByTagNameNS(W_NS, 'tr')]
                .filter(tr => tablaAncestro(tr) === n);
            const celdas = filasXml.flatMap(tr => [...tr.getElementsByTagNameNS(W_NS, 'tc')]
                .filter(tc => tablaAncestro(tc) === n));
            const texto = celdas.map(textoDeCelda).filter(Boolean).join(' ').replace(/[ \t]+/g, ' ').trim();
            const sombreado = celdas.some(tc => {
                const shd = tc.getElementsByTagNameNS(W_NS, 'shd')[0];
                const fill = shd && (shd.getAttributeNS(W_NS, 'fill') || '').toLowerCase();
                return fill && fill !== 'auto' && fill !== 'ffffff';
            });
            // Estructura real de la tabla, para que una herramienta pueda
            // reconstruirla: texto por celda, columnas que abarca (gridSpan)
            // y color de sombreado. Las de una celda siguen siendo "barras".
            const filas = filasXml.map(tr => [...tr.getElementsByTagNameNS(W_NS, 'tc')]
                .filter(tc => tablaAncestro(tc) === n)
                .map(tc => {
                    const tcPr = tc.getElementsByTagNameNS(W_NS, 'tcPr')[0];
                    const span = tcPr && tcPr.getElementsByTagNameNS(W_NS, 'gridSpan')[0];
                    const shd = tcPr && tcPr.getElementsByTagNameNS(W_NS, 'shd')[0];
                    const fill = shd && (shd.getAttributeNS(W_NS, 'fill') || '').toLowerCase();
                    // `lineas` conserva los saltos de párrafo de la celda: en
                    // los guiones instruccionales cada marca de montaje
                    // (<Figura>, <Pop-up>, <Crear un grupo de botones…>) viene
                    // en su propio renglón, y aplastarlas las vuelve ilegibles.
                    // Quien solo quiera el texto corrido sigue usando `texto`.
                    const lineasCelda = textoDeCelda(tc).split('\n')
                        .map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
                    /* `contenido` conserva el ORDEN real de la celda: sus
                       párrafos propios y las tablas que tenga ANIDADAS,
                       intercalados como en el Word. Es lo que permite montar el
                       apartado de un acordeón con su grupo de tarjetas en su
                       lugar exacto: con solo el texto aplanado (`lineas`) esa
                       tabla anidada se perdía aquí —y reaparecía como un bloque
                       suelto al final de la página—. `lineas` y `texto` no
                       cambian: hay herramientas que solo quieren el texto. */
                    const contenido = [];
                    [...tc.childNodes].filter(x => x.nodeType === 1).forEach(hijo => {
                        if (hijo.localName === 'p') {
                            // Con los saltos de línea del párrafo (irán a <br>);
                            // solo se normalizan espacios y tabuladores.
                            const t = textoDeParrafoConNegritas(hijo, { saltos: true })
                                .replace(/[ \t]+/g, ' ').trim();
                            const imgs = [...hijo.getElementsByTagNameNS(A_NS, 'blip')]
                                .map(b => b.getAttributeNS(REL_NS, 'embed')).filter(Boolean);
                            if (t || imgs.length) contenido.push({ tipo: 'parrafo', texto: t, imagenes: imgs });
                            return;
                        }
                        if (hijo.localName === 'tbl') contenido.push({ tipo: 'tabla', bloque: bloqueDe(hijo) });
                    });
                    return {
                        lineas: lineasCelda,
                        contenido,
                        texto: textoDeCelda(tc).replace(/ /g, ' ').replace(/\s+/g, ' ').trim(),
                        span: Number((span && span.getAttributeNS(W_NS, 'val')) || 1),
                        fondo: fill && fill !== 'auto' && fill !== 'ffffff' ? '#' + fill : ''
                    };
                }));
            return { tipo: 'tabla', texto, celdas: celdas.length, sombreado, filas };
        }
        return { tipo: 'otro', texto: '' };
    };

    const salida = [];
    /* Un nodo, UN bloque. Una tabla anidada se lee dos veces —al armar las
       `filas` de la tabla que la contiene y al recorrer sus celdas—, y si cada
       lectura devolviera un objeto distinto, quien la coloque dentro de su
       apartado no podría reconocerla después en la lista plana para no montarla
       otra vez. Con el caché las dos referencias son el MISMO objeto y basta un
       `Set` para saber qué tabla ya se usó. */
    const cache = new Map();
    const bloqueDe = nodo => {
        if (!cache.has(nodo)) cache.set(nodo, bloqueDesdeNodo(nodo));
        return cache.get(nodo);
    };

    // `dentro` marca los bloques que salieron de las celdas de otra tabla. El
    // texto de esas celdas YA viene en `filas` de la tabla contenedora, así que
    // quien reconstruya la tabla debe saltárselos o duplica el contenido; quien
    // solo quiera el texto corrido puede ignorar el campo.
    const recorrer = (contenedor, dentro) => {
        [...contenedor.childNodes].filter(n => n.nodeType === 1).forEach(n => {
            if (n.localName === 'p') {
                const bloque = bloqueDesdeNodo(n);
                bloque.dentroDeTabla = Boolean(dentro);
                if (bloque.texto || (bloque.imagenes && bloque.imagenes.length)) salida.push(bloque);
                return;
            }
            // Word puede envolver una tabla en `w:sdt` (contenido estructurado)
            // u otro contenedor. Se atraviesan esos nodos, pero las tablas
            // normales no se recorren por dentro para no duplicar sus celdas.
            if (n.localName !== 'tbl') {
                recorrer(n, dentro);
                return;
            }
            const bloque = bloqueDe(n);
            bloque.dentroDeTabla = Boolean(dentro);
            if (bloque.texto || (bloque.imagenes && bloque.imagenes.length)) salida.push(bloque);

            // En algunos Word la tabla de contenido está dentro de una barra
            // de sección de una sola celda. La barra debe conservarse, pero su
            // contenido interno (párrafos y tablas) también debe salir en orden.
            const tablasInternas = [...n.getElementsByTagNameNS(W_NS, 'tbl')]
                .filter(tbl => tablaAncestro(tbl) === n);
            if (tablasInternas.length) {
                [...n.getElementsByTagNameNS(W_NS, 'tc')]
                    .filter(tc => tablaAncestro(tc) === n)
                    .forEach(tc => recorrer(tc, true));
            }
        });
    };
    recorrer(body, false);
    return salida;
}

/**
 * Extrae las imágenes del .docx: Map<rId, { nombre, blob }>.
 * Los rId son los mismos que entrega leerBloquesDeDocx en `imagenes`, así la
 * herramienta puede mostrar la imagen real (URL.createObjectURL) y ofrecerla
 * para descargar. Las tablas "pegadas como imagen" en el Word viven aquí.
 */
async function leerImagenesDeDocx(file) {
    const archivos = await leerZip(await file.arrayBuffer());
    const rels = archivos.get('word/_rels/document.xml.rels');
    if (!rels) return new Map();
    const doc = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(await inflar(rels)), 'application/xml');
    const MIMES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp' };
    const mapa = new Map();
    for (const rel of [...doc.getElementsByTagName('Relationship')]) {
        const destino = rel.getAttribute('Target') || '';
        if (!destino.includes('media/')) continue;
        // El Target es relativo a word/ ("media/image1.png"), pero por si
        // viniera absoluto se intentan las dos rutas.
        const entrada = archivos.get('word/' + destino.replace(/^\.?\//, '')) || archivos.get(destino.replace(/^\//, ''));
        if (!entrada) continue;
        const nombre = destino.split('/').pop();
        const ext = (nombre.split('.').pop() || '').toLowerCase();
        mapa.set(rel.getAttribute('Id'), {
            nombre,
            blob: new Blob([await inflar(entrada)], { type: MIMES[ext] || 'application/octet-stream' })
        });
    }
    return mapa;
}

/** Obtiene el formato real de cada numeración de Word. `numPr` solo dice que
 * hay una lista; esta relación con numbering.xml permite distinguir 1., a. y
 * viñetas sin adivinar por el texto. */
async function leerFormatosListaDocx(file) {
    const archivos = await leerZip(await file.arrayBuffer());
    const entrada = archivos.get('word/numbering.xml');
    if (!entrada) return {};
    const xml = new TextDecoder('utf-8').decode(await inflar(entrada));
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const abstractos = {};
    [...doc.getElementsByTagNameNS(W_NS, 'abstractNum')].forEach(a => {
        const id = a.getAttributeNS(W_NS, 'abstractNumId');
        [...a.getElementsByTagNameNS(W_NS, 'lvl')].forEach(l => {
            const nivel = l.getAttributeNS(W_NS, 'ilvl') || '0';
            const formato = l.getElementsByTagNameNS(W_NS, 'numFmt')[0];
            const valor = formato && formato.getAttributeNS(W_NS, 'val');
            const ind = l.getElementsByTagNameNS(W_NS, 'ind')[0];
            const izquierda = Number(ind && (ind.getAttributeNS(W_NS, 'left') || ind.getAttributeNS(W_NS, 'start')) || 0);
            const nivelNumeracion = Number(nivel) || 0;
            // 720 twips es el primer nivel de Word; cada 720 adicionales
            // representan una sangría más. Si `ilvl` sí cambia, se conserva.
            const nivelVisual = izquierda >= 720 ? Math.max(nivelNumeracion, Math.round(izquierda / 720) - 1) : nivelNumeracion;
            abstractos[`${id}:${nivel}`] = {
                tipo: valor === 'bullet' ? 'vinetas' :
                    (valor === 'lowerLetter' ? 'letras' : (valor === 'lowerRoman' ? 'romana' : 'ordenada')),
                nivelVisual
            };
        });
    });
    const salida = {};
    [...doc.getElementsByTagNameNS(W_NS, 'num')].forEach(n => {
        const id = n.getAttributeNS(W_NS, 'numId');
        const abs = n.getElementsByTagNameNS(W_NS, 'abstractNumId')[0];
        const idAbs = abs && abs.getAttributeNS(W_NS, 'val');
        Object.keys(abstractos).filter(k => k.startsWith(`${idAbs}:`)).forEach(k => {
            salida[`${id}:${k.split(':')[1]}`] = abstractos[k];
        });
    });
    return salida;
}

/**
 * Sangria colgante (francesa) declarada en los ESTILOS: { styleId: twips }.
 *
 * Sirve de respaldo para `sangriaFrancesa` de leerBloquesDeDocx. Los dos Word
 * de bibliografia con los que se construyo esto la traen escrita encima de cada
 * parrafo (`<w:ind w:hanging="720">`), pero Word tambien deja definirla una vez
 * en un estilo —"Bibliografia", "Referencia"— y entonces el parrafo no dice
 * nada. Sin esto, un documento asi se leeria como "ninguna fuente tiene sangria
 * francesa" y el QA reportaria 150 errores inventados.
 *
 * `w:basedOn` se sigue hasta la raiz: un estilo puede heredar la sangria del
 * que lo origina. El limite de saltos es por seguridad, no por profundidad
 * real: un archivo con una herencia circular colgaria el navegador.
 */
async function leerSangriasDeEstilosDocx(file) {
    const archivos = await leerZip(await file.arrayBuffer());
    const entrada = archivos.get('word/styles.xml');
    if (!entrada) return {};
    const xml = new TextDecoder('utf-8').decode(await inflar(entrada));
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    const propias = {};   // lo que declara el estilo mismo
    const padres = {};
    [...doc.getElementsByTagNameNS(W_NS, 'style')].forEach(st => {
        const id = st.getAttributeNS(W_NS, 'styleId');
        if (!id) return;
        const pPr = st.getElementsByTagNameNS(W_NS, 'pPr')[0];
        const ind = pPr && pPr.getElementsByTagNameNS(W_NS, 'ind')[0];
        if (ind) {
            const colgante = Number(ind.getAttributeNS(W_NS, 'hanging') || 0);
            const primera = Number(ind.getAttributeNS(W_NS, 'firstLine') || 0);
            const valor = Math.max(colgante, primera < 0 ? -primera : 0);
            if (ind.hasAttributeNS(W_NS, 'hanging') || ind.hasAttributeNS(W_NS, 'firstLine')) {
                propias[id] = Math.round(valor);
            }
        }
        const base = st.getElementsByTagNameNS(W_NS, 'basedOn')[0];
        if (base) padres[id] = base.getAttributeNS(W_NS, 'val');
    });

    const salida = {};
    Object.keys(padres).concat(Object.keys(propias)).forEach(id => {
        let actual = id;
        let saltos = 0;
        while (actual && saltos < 10) {
            if (propias[actual] !== undefined) { salida[id] = propias[actual]; return; }
            actual = padres[actual];
            saltos++;
        }
        salida[id] = 0;
    });
    return salida;
}
