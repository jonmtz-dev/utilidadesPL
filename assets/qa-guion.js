/* ==========================================================================
   Del guion de producción al MODELO ESPERADO.

   Lo comparten el QA de Actividad y Rúbrica (Moodle 5.1) y el QA de Actividad
   (Moodle 3.11). El guion es el MISMO documento en las dos: lo que cambia entre
   una versión y otra es la página de Moodle contra la que se coteja, o sea el
   verificador, no la lectura del Word.

   Vive aquí porque duplicarlo sería repetir el error del hex #d8a7b6: se
   arreglaría una trampa del lector —por dónde empieza el guion, qué marcas se
   descartan, cómo se cuentan los marcadores de lista— en un QA y seguiría viva
   en el otro durante meses. Cada cosa aprendida a base de reportes falsos está
   comentada donde se aplica; no las quites sin leer el README de qa-51.

   Entra: los bloques de `leerBloquesDeDocx()` (assets/docx.js).
   Sale:  { titulo, textos, tablas, enlaceRubrica, entrada }.
   ========================================================================== */

/* Marca de montaje: `<h1>`, `<Tabla>`, `<Lista numerada; …>`. Mismo patrón
   que usa Guion Instruccional a Página. */
const MARCA = /^[<«]\s*(.+?)\s*[>»]$/;

/* ---------------------------------------------------------------------
   Del Word al modelo esperado
   --------------------------------------------------------------------- */

/** Separa el texto limpio de sus marcas de formato (`**negrita**`, `*cursiva*`). */
function desmarcar(marcado) {
    const negritas = [];
    const cursivas = [];
    let texto = String(marcado || '');

    texto = texto.replace(/\*\*([\s\S]+?)\*\*/g, (_, dentro) => {
        const plano = dentro.replace(/\*/g, '').trim();
        if (plano) negritas.push(plano);
        return dentro;
    });
    texto = texto.replace(/\*([^*\n]+?)\*/g, (_, dentro) => {
        const plano = dentro.trim();
        if (plano) cursivas.push(plano);
        return dentro;
    });
    return { texto: texto.replace(/\*/g, '').trim(), negritas, cursivas };
}

function agregarTexto(lista, etiqueta, marcado, marcador) {
    const d = desmarcar(marcado);
    if (!d.texto) return;
    lista.push({
        etiqueta, texto: d.texto, negritas: d.negritas, cursivas: d.cursivas,
        // Qué marcador le toca según el Word: `{ tipo, nivel, numero }`.
        // Solo lo llevan los puntos de lista.
        marcador: marcador || null
    });
}

/* La numeración REAL del Word, la que Word dibuja y no está en el texto.
   Cada `numId` lleva su propia cuenta por nivel, y al volver a un nivel
   superior se reinician los de abajo —igual que hace Word—.

   Hace falta porque el guion numera 1…7, mete unas viñetas y SIGUE en 8,
   mientras que al montar cada `<ol>` de Moodle vuelve a empezar en 1 si
   nadie le pone `start`. Como el número del Word no está en el texto y el
   de Moodle lo dibuja el CSS, el cotejo de texto no puede verlo: los dos
   lados se leen idénticos y la actividad salía "TODO CORRECTO" con la
   numeración rota. */
function cuentaDeListas() {
    const cuenta = new Map();
    return (bloque) => {
        if (!bloque.lista) return null;
        const nivel = Number(bloque.nivelLista) || 0;
        const clave = bloque.idLista + ':' + nivel;
        cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
        // Al avanzar un nivel, los de abajo vuelven a empezar.
        [...cuenta.keys()].forEach(k => {
            const [id, n] = k.split(':');
            if (id === String(bloque.idLista) && Number(n) > nivel) cuenta.delete(k);
        });
        return {
            tipo: bloque.tipoLista || 'ordenada',
            nivel,
            numero: cuenta.get(clave)
        };
    };
}

/* Cómo se llama el marcador al escribirlo en un reporte: «8», «b», «iii». */
function marcadorLegible(m) {
    if (!m) return '';
    if (m.tipo === 'vinetas') return 'viñeta';
    if (m.tipo === 'letras') return String.fromCharCode(96 + m.numero);
    if (m.tipo === 'romana') return romano(m.numero);
    return String(m.numero);
}

function romano(n) {
    const tabla = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let salida = '';
    tabla.forEach(([valor, letra]) => { while (n >= valor) { salida += letra; n -= valor; } });
    return salida;
}

/** La marca de un bloque de párrafo (`<h1>`, `<Figura>`), o '' si no lo es. */
function marcaDe(bloque) {
    if (!bloque || bloque.tipo !== 'parrafo') return '';
    const m = (bloque.texto || '').replace(/\*/g, '').trim().match(MARCA);
    return m ? m[1] : '';
}

/* Celdas que solo existen en la hoja de control editorial del guion. Sirven
   para reconocerla cuando el Word no trae NINGUNA marca de encabezado. */
const HOJA_DE_CONTROL = /^(nombre del m[óo]dulo|nombre y n[úu]mero del subm[óo]dulo|n[úu]mero de semana|tipo de recurso|t[íi]tulo del recurso|meta educativa|prop[óo]sito\(s\) formativo\(s\)|elaborador o elaboradora|indicaciones|insumos requeridos|idm\/mon)/i;

/**
 * Dónde empieza lo que SÍ se publica.
 *
 * Se entra por el primer encabezado: todo lo anterior son las fichas de
 * control editorial (módulo, elaboradores, indicaciones para producción) y
 * nunca se publica. Empezar ahí evita reportar cincuenta "textos faltantes"
 * que en realidad nadie tenía que montar.
 *
 * ⚠️ No se busca `<h1>`: **no todos los guiones lo traen.** De tres guiones
 * reales de regularización, dos abren el título con `<h2>` y solo uno con
 * `<h1>`; exigir `<h1>` dejaba entrar la hoja de control entera y el reporte
 * salía con 49 errores inventados sobre una actividad bien montada. Y si no
 * hay ninguna marca de encabezado, se salta la hoja de control por lo que
 * dicen sus celdas.
 */
/* La barra gris del título: una tabla de UNA sola celda. Es la otra forma
   de abrir sección, y su forma la distingue de la hoja de control, cuyas
   fichas son siempre tablas de dos o más columnas. */
function esBarraDeTitulo(b) {
    if (b.tipo !== 'tabla') return false;
    const filas = b.filas || [];
    if (filas.length !== 1 || (filas[0] || []).length !== 1) return false;
    return Boolean(((filas[0][0] || {}).texto || '').trim());
}

/* Para decidir DÓNDE EMPIEZA hace falta además descartar los rótulos de la
   hoja de control, por si alguno viniera suelto en su propia tabla. Ese
   filtro no sirve dentro del cuerpo: «Propósito(s) formativo(s)» es a la
   vez un campo de la ficha editorial y un título real de la actividad, y
   excluirlo ahí lo convertía en una "tabla de contenido" que Moodle nunca
   iba a tener. */
function abreElContenido(b) {
    if (!esBarraDeTitulo(b)) return false;
    return !HOJA_DE_CONTROL.test(((b.filas[0][0] || {}).texto || '').trim());
}

function dondeEmpieza(bloques) {
    /* Manda la que aparezca PRIMERO de las dos formas de abrir. Entrar solo
       por el encabezado marcado fallaba con los guiones mixtos: la AA1 de
       regularización abre sus cuatro secciones con barra de título sin
       marca y trae un único `<h2>` justo antes de "Evidencia de
       aprendizaje", así que el lector arrancaba ahí y se quedaba con 4
       textos de 20. Todo lo demás salía en Moodle como "texto que no está
       en el guion". */
    const enc = bloques.findIndex(b => /^h[1-6]$/i.test(marcaDe(b)));
    const barra = bloques.findIndex(abreElContenido);
    const candidatos = [enc, barra].filter(i => i >= 0);
    if (candidatos.length) {
        const inicio = Math.min.apply(null, candidatos);
        return {
            inicio,
            entrada: inicio === enc ? marcaDe(bloques[enc]).toLowerCase() : 'barra de título'
        };
    }

    let ultima = -1;
    bloques.forEach((b, i) => {
        if (b.tipo !== 'tabla') return;
        const celdas = (b.filas || []).reduce((t, f) => t.concat(f), [])
            .map(c => (c.texto || '').trim());
        if (celdas.some(t => HOJA_DE_CONTROL.test(t))) ultima = i;
    });
    if (ultima >= 0) return { inicio: ultima + 1, entrada: 'hoja de control' };
    return { inicio: 0, entrada: '' };
}

/**
 * Guion → { titulo, textos, tablas, enlaceRubrica }.
 */
function construirActividad(bloques) {
    const arranque = dondeEmpieza(bloques);
    const cuerpo = bloques.slice(arranque.inicio);

    const textos = [];
    const tablas = [];
    let titulo = '';
    let esperando = '';        // 'h1' | 'h2' | 'tabla'
    let enLista = false;
    let enCentrado = false;
    let enFigura = false;      // dentro de <Figura>…<Termina figura>
    let punto = 0;
    let tituloTablaPendiente = '';
    let enlaceRubrica = null;
    const contarLista = cuentaDeListas();

    cuerpo.forEach(bloque => {
        if (bloque.tipo === 'tabla') {
            // Tras un <h1>/<h2>, la tabla de una celda es la barra gris con
            // el título; en cualquier otro sitio es una tabla de contenido.
            const filas = (bloque.filas || []).map(f => f.map(c => (c.texto || '').trim()));
            /* Una tabla de una sola celda es la barra del título, venga
               anunciada por `<h2>` o sin marca ninguna: en Moodle sale como
               encabezado, no como tabla. Sin esto, los guiones que no
               marcan sus secciones convertían cada título en una "tabla de
               contenido" fantasma —de ahí el "Falta la tabla 1 · Evaluación"
               sobre una actividad bien montada—. */
            if (esperando === 'h1' || esperando === 'h2' || esBarraDeTitulo(bloque)) {
                const t = desmarcar(filas.flat().join(' ')).texto;
                // El título es el PRIMER encabezado, venga marcado como
                // <h1> o como <h2>: hay guiones que solo traen <h2>.
                const esPrimero = !titulo;
                if (esPrimero) titulo = t;
                agregarTexto(textos, esPrimero ? 'Título' : 'Subtítulo', t);
                esperando = '';
                return;
            }
            if (!filas.length) return;
            /* La fila de ENCABEZADOS es la primera con más de una celda. Muchas
               tablas del guion abren con un renglón de título combinado a lo
               ancho («Monitoreo de actividades diarias…»), y tomándolo como
               encabezado el QA creía que la tabla tenía UNA columna: contra las
               seis de Moodle, reportaba «la tabla 1 tiene otro número de
               columnas» en un montaje correcto. Ese renglón es el título de la
               tabla, no su encabezado. */
            var iCabecera = 0;
            while (iCabecera < filas.length - 1 && filas[iCabecera].length <= 1) iCabecera++;
            tablas.push({
                titulo: tituloTablaPendiente || (iCabecera > 0 ? filas[0].join(' ') : ''),
                encabezados: filas[iCabecera],
                filas: filas.slice(iCabecera + 1)
            });
            // Cada celda con contenido es un texto que tiene que aparecer.
            filas.forEach((fila, i) => fila.forEach(celda => {
                if (celda) agregarTexto(textos, i === 0 ? 'Encabezado de tabla' : 'Celda', celda);
            }));
            tituloTablaPendiente = '';
            esperando = '';
            return;
        }

        const crudo = (bloque.texto || '').trim();
        if (!crudo) return;
        const plano = crudo.replace(/\*/g, '').trim();
        const m = plano.match(MARCA);

        if (m) {
            const clave = m[1].toLowerCase();
            if (/^h1$/.test(clave)) { esperando = 'h1'; return; }
            if (/^h[2-4]$/.test(clave)) { esperando = 'h2'; return; }
            if (/^termina/.test(clave)) {
                if (/lista/.test(clave)) enLista = false;
                if (/centrado/.test(clave)) enCentrado = false;
                if (/tabla/.test(clave)) esperando = '';
                if (/figura|imagen|v[ií]deo|pop|ventana/.test(clave)) enFigura = false;
                return;
            }
            // "Lista con letras" y "Lista numerada" son las dos listas del
            // guion: numerarlas aparte solo cambia la etiqueta del reporte.
            if (/^lista/.test(clave)) {
                enLista = true;
                if (/numerada/.test(clave)) punto = 0;
                return;
            }
            if (/centrado/.test(clave)) { enCentrado = true; return; }
            if (/^tabla/.test(clave)) { esperando = 'tabla'; return; }
            /* Lo que va DENTRO de <Figura>…<Termina figura> es la DESCRIPCIÓN
               de la imagen para quien la produce ("Profile / Age: 13 years
               old / Nationality: Brazilian…"), no texto de la página: se
               monta como imagen y por eso nunca aparece escrito en Moodle.
               Compararlo daba un "falta el punto 7" en un montaje correcto. */
            if (/^(figura|imagen|v[ií]deo|pop-?up|ventana)/.test(clave)) { enFigura = true; return; }
            // Cualquier otra marca es una indicación para el montador y no
            // se publica. No se compara, pero sí se avisa si aparece.
            return;
        }

        if (enFigura) return;

        // El título de una tabla va en el párrafo de antes, en negritas.
        if (esperando === 'tabla' && !tituloTablaPendiente) {
            tituloTablaPendiente = desmarcar(crudo).texto;
            agregarTexto(textos, 'Título de tabla', crudo);
            return;
        }

        if (enCentrado) { agregarTexto(textos, 'Texto centrado', crudo); return; }
        if (enLista || bloque.lista) {
            punto++;
            const marcador = contarLista(bloque);
            // La etiqueta usa el marcador de verdad cuando el Word lo trae
            // («Punto 8», «Inciso b»); si no, la cuenta corrida de siempre.
            const etiqueta = marcador
                ? (marcador.tipo === 'vinetas' ? 'Viñeta'
                    : (marcador.tipo === 'ordenada' ? 'Punto ' : 'Inciso ') + marcadorLegible(marcador))
                : 'Punto ' + punto;
            agregarTexto(textos, etiqueta, crudo, marcador);
        } else {
            agregarTexto(textos, 'Párrafo', crudo);
        }

        /* "…con base en la siguiente rúbrica, que incluye…": esa palabra
           tiene que quedar enlazada al PDF. Es lo que más se olvida.

           No siempre dice "rúbrica": los foros se evalúan con una **lista de
           cotejo** y ahí la palabra enlazada es esa. Buscando solo "rúbrica"
           la actividad de foro se revisaba sin comprobar ningún enlace. */
        const instrumento = plano.match(/\b(r[úu]bricas?|listas? de cotejo)\b/i);
        if (instrumento && !enlaceRubrica) {
            enlaceRubrica = { texto: instrumento[0], archivo: '' };
        }
    });

    /* El código que el guion pide escribir en el nombre del archivo
       ("Apellidos_Nombre_SM02S3AA3"). Sirve para avisar si el guion y la
       rúbrica que se subieron no son de la misma actividad. */
    const codigo = textos.map(t => t.texto).join(' ')
        .match(/SM\s*0?(\d+)\s*S\s*0?(\d+)\s*AA\s*0?(\d+)/i);

    return {
        titulo, textos, tablas, enlaceRubrica,
        // Por dónde se entró al guion, para poder decirlo en el resumen.
        entrada: arranque.entrada,
        // `clave` normaliza para comparar (SM02S3AA3 y SM2_S3_AA3 dan "2-3-3");
        // `codigoTexto` es lo que el guion dice tal cual, para enseñarlo.
        clave: codigo ? codigo.slice(1, 4).map(Number).join('-') : '',
        codigoTexto: codigo ? codigo[0].replace(/\s+/g, '') : ''
    };
}
