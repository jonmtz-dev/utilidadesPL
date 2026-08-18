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
            else if (et === 'a' && hijo.hasAttribute('href')) salida += `[${dentro}](${hijo.getAttribute('href')})`;
            else salida += dentro;
        });
        // El espacio pegado a un salto real (de un <br>) sobra al escribirlo
        // como marca: ahí manda el salto.
        return salida.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    }

    /** Los párrafos de un contenedor, separados por línea en blanco. */
    function parrafosDe(nodo) {
        return [...nodo.querySelectorAll(':scope > p')].map(aMarcas).filter(Boolean).join('\n\n');
    }

    const crudo = el => ({ tipo: 'crudo', html: el.outerHTML.trim() });

    /* --- Lectores, en orden. El primero que reclama el nodo se lo queda. --- */

    function leerTitulo(el) {
        const h1 = el.querySelector(':scope > .col-12 > .tituloUnidad > h1, :scope > .tituloUnidad > h1');
        if (h1) return { tipo: 'titulo', nivel: 'h1', texto: aMarcas(h1) };
        const h2 = el.querySelector(':scope > .tituloUnidad > h2, :scope > .col-12 > .tituloUnidad > h2');
        if (h2) return { tipo: 'titulo', nivel: 'h2', texto: aMarcas(h2) };
        return null;
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

        return {
            tipo: 'tabla', banda, encabezados, filas, titulo: '',
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
        // Los modales se recogen aparte, con el bloque que los dispara.
        if (el.classList.contains('modal')) return null;

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

        const bloques = leerHijos(raiz);

        /* El primer h1 es el título de la página, que en la herramienta vive
           arriba y no como bloque. Se saca junto con el <hr> que lo sigue —lo
           pone `generarHTML()`—, o al reimportar saldrían duplicados. */
        let titulo = '';
        if (bloques.length && bloques[0].tipo === 'titulo' && bloques[0].nivel === 'h1') {
            titulo = bloques[0].texto;
            bloques.shift();
            if (bloques.length && bloques[0].tipo === 'separador') bloques.shift();
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
        return { bloques, paleta, titulo, clasesExtra, avisos };
    }

    global.importarHTML = importarHTML;
})(window);
