/* ==========================================================================
   Traer una página de Moodle de vuelta a la herramienta

   El camino inverso de `componentes.js`: recibe el HTML pegado del editor de
   Moodle y devuelve bloques editables.

   LA REGLA QUE LO HACE SEGURO: lo que no se reconoce NO se tira — entra como
   bloque `crudo` y se vuelve a publicar idéntico. Sin eso, importar sería
   apostar a que el lector entienda el 100% del markup, y lo que fallara se
   perdería sin avisar. Con la red puesta, el peor caso es "esto no se puede
   editar por piezas", nunca "esto desapareció".

   Por lo mismo el lector es DELIBERADAMENTE conservador: solo reclama un nodo
   cuando está seguro de reconstruirlo igual. Ante la duda, crudo.
   ========================================================================== */

(function (global) {
    'use strict';

    /** Texto de un nodo, de vuelta a las marcas que entiende la herramienta. */
    function aMarcas(nodo) {
        let salida = '';
        nodo.childNodes.forEach(hijo => {
            if (hijo.nodeType === 3) {
                /* El HTML colapsa CUALQUIER racha de espacios —incluidos los
                   saltos de línea con que viene formateado el archivo— en un
                   solo espacio. Hay que hacerlo aquí: si no, esos saltos llegan
                   como \n y `parrafos()` los publica como <br> de verdad, así
                   que el texto sale cortado exactamente donde el archivo tenía
                   sus renglones. Eso es lo que se veía como "el texto se
                   acomoda distinto". Los <br> de verdad sí se conservan, abajo. */
                salida += hijo.nodeValue.replace(/\s+/g, ' ');
                return;
            }
            if (hijo.nodeType !== 1) return;
            const et = hijo.tagName.toLowerCase();
            const dentro = aMarcas(hijo);
            if (et === 'strong' || et === 'b') salida += `**${dentro}**`;
            else if (et === 'em' || et === 'i') salida += `*${dentro}*`;
            else if (et === 'br') salida += '\n';
            else if (et === 'mark') salida += `==${dentro}==`;
            /* La palabra que abre una ventana. SIN esto se caía a los casos de
               abajo y salía `==**palabra**==`: el resaltado se conservaba y la
               ventana **se perdía en silencio**, tanto al importar como al
               editar en la previa. Se recompone la marca `{{ }}` completa
               yendo a buscar el modal por su `data-bs-target`. */
            else if (et === 'a' && hijo.getAttribute('data-bs-toggle') === 'modal') {
                salida += marcaDeVentana(hijo);
            }
            else if (et === 'a' && hijo.hasAttribute('href')) salida += `[${dentro}](${hijo.getAttribute('href')})`;
            else salida += dentro;
        });
        // El espacio pegado a un salto real (de un <br>) sobra al escribirlo
        // como marca: ahí manda el salto.
        return salida.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    }

    /** El texto pelado de un nodo, con los espacios colapsados. */
    function textoLlano(nodo) {
        return nodo ? String(nodo.textContent || '').replace(/\s+/g, ' ').trim() : '';
    }

    /** El modal que dispara un enlace, buscado por su data-bs-target. */
    function ventanaDe(enlace) {
        const sel = enlace.getAttribute('data-bs-target') || '';
        if (!sel.startsWith('#')) return null;
        return enlace.ownerDocument.getElementById(sel.slice(1));
    }

    /**
     * ¿El contenido de esa ventana cabe en la marca `{{ }}`?
     * Solo si son párrafos: una ventana con una tabla dentro necesita bloques,
     * y eso la marca de texto no lo sabe llevar. Cuando no cabe, el nodo entero
     * se va a `crudo` (ver `leerTexto`) en vez de publicarse a medias.
     */
    function ventanaSimple(modal) {
        const cuerpo = modal && modal.querySelector('.modal-body');
        if (!cuerpo) return false;
        return [...cuerpo.children].every(h => h.tagName.toLowerCase() === 'p');
    }

    /* Modales que YA se metieron dentro de una marca `{{ }}`. Su elemento
       original sobra: si además entrara como bloque, la página acabaría con la
       ventana dos veces. Se vacía en cada importación. */
    let modalesAbsorbidos = new Set();

    /** Reconstruye `{{palabra|Título|Explicación}}` desde el enlace y su modal. */
    function marcaDeVentana(enlace) {
        const palabra = textoLlano(enlace);
        const modal = ventanaDe(enlace);
        if (!modal) return palabra;
        if (modal.id) modalesAbsorbidos.add(modal.id);
        const titulo = textoLlano(modal.querySelector('.modal-title')) || palabra;
        const cuerpo = textoLlano(modal.querySelector('.modal-body'));
        // Sin cuerpo se escribe la marca de dos segmentos, que es la que se
        // llena con bloques; con cuerpo, la de tres.
        return cuerpo ? `{{${palabra}|${titulo}|${cuerpo}}}` : `{{${palabra}|${titulo}}}`;
    }

    /** ¿Hay aquí alguna ventana que la marca de texto no sepa representar? */
    function conVentanaCompleja(el) {
        return [...el.querySelectorAll('a[data-bs-toggle="modal"]')]
            .some(a => !ventanaSimple(ventanaDe(a)));
    }

    /** Los párrafos de un contenedor, separados por línea en blanco. */
    function parrafosDe(nodo) {
        return [...nodo.querySelectorAll(':scope > p')].map(aMarcas).filter(Boolean).join('\n\n');
    }

    const crudo = el => ({ tipo: 'crudo', html: el.outerHTML.trim() });

    /* --- Lectores, en orden. El primero que reclama el nodo se lo queda. --- */

    /**
     * Un título SUELTO, y solo eso.
     *
     * La comprobación estricta no es paranoia: `.col-12` también casa con
     * `.col-12.col-lg-8`, que es la columna izquierda del bloque **Presentación**
     * —y ahí dentro hay un `.tituloUnidad`—. Con el selector suelto, este lector
     * reclamaba la presentación entera y devolvía un triste título: se perdían el
     * antetítulo, los párrafos, el recuadro gris de la derecha y su tabla. **2 640
     * caracteres, sin avisar.**
     *
     * Por eso se exige que la fila traiga UNA sola columna, que esa columna no
     * lleve nada más que el `.tituloUnidad`, y que dentro no haya un antetítulo.
     * Lo que no cumpla se va a `crudo` y se publica idéntico.
     */
    function leerTitulo(el) {
        const columnas = [...el.children];
        if (columnas.length !== 1) return null;

        const col = columnas[0];
        const caja = col.classList.contains('tituloUnidad') ? col : col.firstElementChild;
        if (!caja || !caja.classList.contains('tituloUnidad')) return null;
        // La columna no puede traer nada más (un <hr>, párrafos…).
        if (caja === col.firstElementChild && col.children.length !== 1) return null;

        const encabezados = [...caja.children];
        if (encabezados.length !== 1) return null;   // un h5 de antetítulo descarta

        const h = encabezados[0];
        const et = h.tagName.toLowerCase();
        if (et !== 'h1' && et !== 'h2') return null;
        return { tipo: 'titulo', nivel: et, texto: aMarcas(h) };
    }

    function leerInstruccion(el) {
        const caja = el.querySelector('.instrucciones');
        if (!caja) return null;
        const p = caja.querySelector('p');
        const img = caja.querySelector('img');
        return {
            tipo: 'instruccion',
            texto: p ? aMarcas(p) : '',
            icono: img ? (img.getAttribute('src') || '') : ''
        };
    }

    function leerTexto(el) {
        const col = el.querySelector(':scope > .col-12');
        if (!col) return null;
        // Solo si TODO lo que trae son párrafos: con cualquier otra cosa dentro
        // no se puede prometer que salga igual, y entonces va crudo.
        const hijos = [...col.children];
        if (!hijos.length || !hijos.every(h => h.tagName.toLowerCase() === 'p')) return null;
        // Una ventana con tabla dentro no cabe en la marca de texto: el nodo
        // entero se va a crudo antes que publicarse a medias.
        if (conVentanaCompleja(col)) return null;
        return { tipo: 'texto', texto: parrafosDe(col), destacado: false, centrado: false };
    }

    function leerTabla(el) {
        const tabla = el.querySelector('table');
        if (!tabla) return null;
        const filasEnc = [...tabla.querySelectorAll(':scope > thead > tr')];
        if (!filasEnc.length) return null;

        // Una fila de encabezado con un solo <th colspan> es la banda.
        let banda = '';
        let filaTitulos = filasEnc[filasEnc.length - 1];
        if (filasEnc.length > 1) {
            const primera = filasEnc[0];
            const ths = [...primera.children];
            if (ths.length === 1 && ths[0].hasAttribute('colspan')) banda = aMarcas(ths[0]);
        }
        const encabezados = [...filaTitulos.children].map(aMarcas);
        if (!encabezados.length) return null;

        const filas = [...tabla.querySelectorAll(':scope > tbody > tr')].map(tr =>
            [...tr.children].map(aMarcas));

        /* El título gris que va ARRIBA de la tabla, fuera de ella: la banda
           `.container-fluid.bg-neutral-claro-50` con su `p.text-muted`. Es
           hermano del <table>, así que sin buscarlo aquí se perdía al importar
           —el nodo entero lo reclama este lector y lo que no lea, desaparece—.
           No confundir con `banda`, que es el <th colspan> DENTRO del thead. */
        const bandaGris = el.querySelector('.bg-neutral-claro-50 p, .bg-neutral-claro-50');
        const titulo = bandaGris ? aMarcas(bandaGris) : '';

        return {
            tipo: 'tabla', banda, encabezados, filas, titulo,
            tarjetas: tabla.classList.contains('tabla-responsive-cards'),
            colorear: false,
            encabezadoColor: [...filaTitulos.children].some(t => /bg-primary-\d/.test(t.className))
        };
    }

    function leerAcordeon(el, leerHijos) {
        const acc = el.classList.contains('accordion') ? el : el.querySelector('.accordion');
        if (!acc) return null;
        const items = [...acc.querySelectorAll(':scope > .accordion-item')].map(it => {
            const btn = it.querySelector('.accordion-button');
            const cuerpo = it.querySelector('.accordion-body');
            return {
                titulo: btn ? aMarcas(btn) : '',
                hijos: cuerpo ? leerHijos(cuerpo) : []
            };
        });
        return items.length ? { tipo: 'acordeon', items } : null;
    }

    function leerVideo(el) {
        const marco = el.querySelector('.ratio iframe, iframe');
        if (!marco) return null;
        const src = marco.getAttribute('src') || '';
        if (!/youtube|youtu\.be/i.test(src)) return null;
        return { tipo: 'video', url: src, titulo: marco.getAttribute('title') || 'Video', texto: '' };
    }

    function leerAlerta(el) {
        const caja = el.querySelector('.alert, .enmarcado');
        if (!caja) return null;
        const tono = caja.classList.contains('enmarcado') ? 'enmarcado'
            : (['info', 'warning', 'success', 'danger'].find(t => caja.classList.contains('alert-' + t)) || 'info');
        return { tipo: 'alerta', tono, texto: parrafosDe(caja) || aMarcas(caja) };
    }

    /**
     * Un nodo de primer nivel -> un bloque.
     * `leerHijos` se pasa para poder bajar por los acordeones sin ciclos entre
     * módulos.
     */
    function leerNodo(el, leerHijos) {
        const et = el.tagName.toLowerCase();
        if (et === 'hr') return { tipo: 'separador' };

        /* Un modal entra como `crudo`, no se tira. Antes se descartaba aquí con
           un comentario que decía que se recogía "aparte" — y ese aparte nunca
           existió: los botones con ventana llegaban sin su ventana, así que en
           la herramienta no abrían nada. Como `crudo` conserva el `id`, el
           botón lo sigue encontrando.

           Los que SÍ sobran son los que ya se metieron dentro de una marca
           `{{ }}`; esos se descartan al final, cuando ya se sabe cuáles fueron. */
        if (el.classList.contains('modal')) return crudo(el);

        const lectores = [
            () => leerAcordeon(el, leerHijos),
            () => leerInstruccion(el),
            () => leerTabla(el),
            () => leerVideo(el),
            () => leerAlerta(el),
            () => leerTitulo(el),
            () => leerTexto(el)
        ];
        for (const leer of lectores) {
            let bloque = null;
            // Un lector que truene no debe tumbar la importación entera: ese
            // nodo se va como crudo y lo demás sigue.
            try { bloque = leer(); } catch (e) { bloque = null; }
            if (bloque) return bloque;
        }
        return crudo(el);
    }

    function leerHijos(contenedor) {
        const salida = [];
        [...contenedor.children].forEach(hijo => {
            const bloque = leerNodo(hijo, leerHijos);
            if (bloque) salida.push(bloque);
        });
        return salida;
    }

    /**
     * Punto de entrada. Devuelve { bloques, paleta, titulo, avisos }.
     * Nunca lanza: si algo sale mal, todo el pegado entra como un solo bloque
     * crudo — que se publica idéntico — y se avisa.
     */
    function importarHTML(texto) {
        const avisos = [];
        const limpio = String(texto || '').trim();
        if (!limpio) return { bloques: [], paleta: null, titulo: '', avisos: ['No hay nada que traer.'] };

        let doc;
        try {
            doc = new DOMParser().parseFromString(limpio, 'text/html');
        } catch (e) {
            return { bloques: [{ tipo: 'crudo', html: limpio }], paleta: null, titulo: '', avisos: ['No se pudo leer el HTML; entró tal cual.'] };
        }

        const raiz = doc.querySelector('.mainPlantilla23') || doc.body;
        if (!doc.querySelector('.mainPlantilla23')) {
            avisos.push('No se encontró el contenedor mainPlantilla23; se leyó todo lo pegado.');
        }

        // La paleta del aula sale de la clase del contenedor.
        const paleta = ['M01', 'M02', 'M03', 'MM', 'reg'].find(c => raiz.classList.contains(c)) || null;

        /* Cualquier OTRA clase del envoltorio se conserva. La que importa hoy es
           `ms-convertido`, que le pone Micrositio a Página y que la hoja del tema
           usa para sus propias reglas: perderla cambia cómo se ve la página
           entera, y sin avisar. */
        const propias = ['container-fluid', 'mainPlantilla23', 'M01', 'M02', 'M03', 'MM', 'reg'];
        const clasesExtra = [...raiz.classList].filter(c => !propias.includes(c));

        /* Los `style=` inline que trae la página no se pueden representar como
           bloques —son el "blindaje" que escribe Micrositio a Página, porque
           TinyMCE borra los <style>—. Los bloques que SÍ se reconocen se
           regeneran con sus clases y sin ellos, así que el color puede cambiar.
           No se puede callar: se cuenta y se avisa. */
        const conEstilo = [...raiz.querySelectorAll('[style]')].length;

        modalesAbsorbidos = new Set();
        let bloques = leerHijos(raiz);

        /* Fuera los modales que ya viajan dentro de una marca `{{ }}`. Se filtra
           DESPUÉS de leer todo, no antes: hasta que no se recorrió la página no
           se sabe cuáles quedaron absorbidos, y el modal puede venir escrito
           antes que el párrafo que lo dispara. */
        const sobra = b => b.tipo === 'crudo' &&
            [...modalesAbsorbidos].some(id => new RegExp(`id="${id}"`).test(b.html));
        const limpiar = lista => (lista || []).filter(b => !sobra(b)).map(b => {
            if (b.hijos) b.hijos = limpiar(b.hijos);
            (b.items || []).forEach(it => { if (it.hijos) it.hijos = limpiar(it.hijos); });
            return b;
        });
        bloques = limpiar(bloques);

        /* El primer h1 es el título de la página, que en la herramienta vive
           arriba y no como bloque. Se saca junto con el <hr> que lo sigue —lo
           pone `generarHTML()`—, o al reimportar saldrían duplicados. */
        let titulo = '';
        if (bloques.length && bloques[0].tipo === 'titulo' && bloques[0].nivel === 'h1') {
            titulo = bloques[0].texto;
            bloques.shift();
            if (bloques.length && bloques[0].tipo === 'separador') bloques.shift();
        }

        /* `pb-0` en el envoltorio es la firma de la salida "solo el título" (es
           lo que mata el `padding-bottom: 100px` de la hoja). Solo se lee como
           modo cuando de verdad no venía nada más que el título: en una página
           con bloques, cambiar el modo los sacaría de la salida sin avisar, así
           que ahí `pb-0` se queda como clase del contenedor y ya. */
        const soloTitulo = raiz.classList.contains('pb-0') && Boolean(titulo) && !bloques.length;
        if (soloTitulo) {
            const i = clasesExtra.indexOf('pb-0');
            if (i >= 0) clasesExtra.splice(i, 1);
            avisos.push('Traía pb-0 y solo el título: se leyó como salida «Solo el título».');
        }

        /* La cuenta va HACIA ABAJO: los crudos de dentro de un acordeón son los
           más frecuentes, y contando solo el primer nivel el aviso salía en cero
           justo cuando más falta hacía. */
        const contarCrudos = lista => (lista || []).reduce((n, b) =>
            n + (b.tipo === 'crudo' ? 1 : 0) + contarCrudos(b.hijos) +
            (b.items || []).reduce((m, it) => m + contarCrudos(it.hijos), 0), 0);

        const cuantosCrudos = contarCrudos(bloques);
        if (cuantosCrudos) {
            avisos.push(`${cuantosCrudos} ${cuantosCrudos === 1 ? 'parte quedó' : 'partes quedaron'} ` +
                'como "HTML tal cual": se publican idénticas, pero no se editan por piezas.');
        }
        if (conEstilo) {
            avisos.push(`Ojo: la página traía ${conEstilo} estilo${conEstilo === 1 ? '' : 's'} escrito${conEstilo === 1 ? '' : 's'} a mano ` +
                '(style=). En los bloques que sí se reconocieron se pierden, así que algún color puede verse distinto: ' +
                'ahora lo pone la clase y sigue la paleta del aula.');
        }
        if (clasesExtra.length) {
            avisos.push(`Se conservaron las clases del contenedor: ${clasesExtra.join(', ')}.`);
        }
        return { bloques, paleta, titulo, clasesExtra, salida: soloTitulo ? 'titulo' : 'completa', avisos };
    }

    global.importarHTML = importarHTML;
})(window);
