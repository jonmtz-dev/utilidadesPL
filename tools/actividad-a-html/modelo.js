/* Modelo e importación exclusivos de las actividades. El HTML usa el contrato
   mainPlantilla23 del aula; no depende del editor ni del catálogo del Guion. */
(function () {
    'use strict';
    const limpio = t => String(t || '').replace(/\*/g, '').trim();
    const seccion = /^(Propósito(?:\(s\))?s? formativo|Situación de aprendizaje|Ruta de aprendizaje|Evidencia de aprendizaje|Evaluación)/i;
    const escapar = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const segura = t => /^(https?:\/\/|mailto:|@@PLUGINFILE@@\/|#)/i.test(String(t || '').trim()) ? escapar(t.trim()) : '#';
    function marcas(t) {
        return escapar(t).replace(/\[([^\]]+)\]\(([^\s)]+)\)/g, (_, texto, url) => {
            const enlace = `<a href="${segura(url)}" target="_blank" rel="noopener" class="nomediaplugin">${texto}</a>`;
            return /youtu\.?be/i.test(url) ? `<span class="nolink">${enlace}</span>` : enlace;
        }).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/\n/g, '<br>');
    }
    const nombres = { titulo: 'Sección', texto: 'Texto', pasos: 'Pasos', lista: 'Lista', tabla: 'Tabla', imagen: 'Imagen', evaluacionAA: 'Enlace', crudo: 'HTML conservado' };
    const bloque = (tipo, datos = {}) => Object.assign({ tipo }, {
        titulo: { texto: '', nivel: 'h2' }, texto: { texto: '', alineacion: 'izquierda', aaMulticol: false },
        pasos: { caja: true, items: [{ texto: '', hijos: [] }] }, lista: { estilo: 'vinetas', items: ['', ''] },
        tabla: { titulo: '', encabezados: ['Columna 1', 'Columna 2'], filas: [['', ''], ['', '']], colorear: 'alternado', encabezadoColor: false },
        imagen: { src: '', alt: '', pie: '' },
        evaluacionAA: { antes: '', enlace: 'rúbrica', url: '', negrita: true, despues: '' }, crudo: { html: '' }
    }[tipo], datos);
    const firma = b => JSON.stringify(b, (k, v) => ['id', 'abierto', 'aaOriginal', 'aaFirma'].includes(k) ? undefined : v);
    const conservar = (b, nodo) => Object.assign(b, { aaOriginal: nodo.outerHTML, aaFirma: firma(b) });
    const fila = t => `<div class="row bloque"><div class="col-12">${t}</div></div>`;
    const parrafos = b => String(b.texto).split(/\n{2,}/).filter(t => t.trim()).map(t => `<p${b.alineacion === 'centro' ? ' class="text-center"' : b.alineacion === 'derecha' ? ' class="text-end"' : b.alineacion === 'justificado' ? ' style="text-align: justify;"' : ''}>${marcas(t)}</p>`).join('\n');
    function htmlBloque(b, desnudo = false) {
        if (b.aaOriginal && b.aaFirma === firma(b)) return b.aaOriginal;
        switch (b.tipo) {
            case 'titulo': return b.nivel === 'h1' ? fila(`<div class="tituloUnidad"><h1 class="text-primary">${marcas(b.texto)}</h1></div>`) : `<div class="row bloque"><div class="tituloUnidad mt-4"><h2 class="text-primary">${marcas(b.texto)}</h2></div></div>`;
            case 'texto': return b.aaMulticol && !desnudo ? `<div class="row bloque"><div class="col-12 text-multicol">${marcas(b.texto)}</div></div>` : desnudo ? parrafos(b) : fila(parrafos(b));
            case 'lista': {
                const tag = b.estilo === 'vinetas' ? 'ul' : 'ol';
                const contenido = `<${tag}${b.estilo === 'letras' ? ' type="a"' : b.estilo === 'romana' ? ' type="i"' : ''}>${b.items.map(t => `<li>${marcas(t)}</li>`).join('\n')}</${tag}>`;
                return desnudo ? contenido : fila(contenido);
            }
            case 'pasos': {
                const lista = `<ol class="estiloLista">${b.items.map(it => `<li>${marcas(it.texto)}${it.hijos.map(h => htmlBloque(h, true)).join('\n')}</li>`).join('\n')}</ol>`;
                return fila(b.caja ? `<div class="card-body col-sm-12 p-4 bg-primary-10 rounded-2"><div class="card-text">${lista}</div></div>` : lista);
            }
            case 'tabla': {
                const cabecera = b.encabezados.map(t => `<th scope="col" class="text-center align-middle${b.encabezadoColor ? ' bg-primary-10' : ''}">${marcas(t)}</th>`).join('');
                const filas = b.filas.map((f, i) => `<tr class="align-middle">${f.map((t, j) => `<td${j === 0 && b.colorear !== 'no' ? ` class="${b.colorear === 'verde' ? 'bg-secondary-10' : b.colorear === 'rosa' || i % 2 === 0 ? 'bg-primary-10' : 'bg-secondary-10'}"` : ''} data-label="${escapar(limpio(b.encabezados[j]))}">${marcas(t) || '&nbsp;'}</td>`).join('')}</tr>`).join('\n');
                return `<div class="row bloque mt-3"><div class="col-10 mx-auto"><div class="table-responsive">${b.titulo ? `<div class="container-fluid bg-neutral-claro-50 border border-neutral-claro-50 rounded-1 rounded-top"><p class="text-muted my-2 text-center">${marcas(b.titulo)}</p></div>` : ''}<table class="table table-bordered MW-auto tabla-responsive-cards"><thead class="thead bg-primary-20"><tr>${cabecera}</tr></thead><tbody>${filas}</tbody></table></div></div></div>`;
            }
            case 'imagen': return fila(`<img class="img-fluid d-block mx-auto" src="${segura(b.src)}" alt="${escapar(b.alt)}">${b.pie ? `<p class="text-muted text-center">${marcas(b.pie)}</p>` : ''}`);
            case 'evaluacionAA': {
                let enlace = marcas(b.enlace);
                if (b.url) enlace = `<a href="${segura(b.url)}" target="_blank" rel="noopener">${enlace}</a>`;
                if (/youtu\.?be/i.test(b.url)) enlace = `<span class="nolink">${enlace}</span>`;
                if (b.negrita) enlace = `<strong>${enlace}</strong>`;
                return fila(`<p>${marcas(b.antes)}${enlace}${marcas(b.despues)}</p>`);
            }
            case 'crudo': return sanear(b.html);
            default: return '';
        }
    }
    function generar(p) {
        if (!p.titulo.trim() && !p.bloques.some(b => b.tipo !== 'texto' || b.texto.trim())) return '';
        const clases = ['container-fluid', 'mainPlantilla23', p.paleta, ...(p.clasesExtra || []), ...(p.compacta ? ['pb-0'] : [])];
        return `<div class="${[...new Set(clases)].join(' ')}" style="max-width: 100% !important;">\n${p.titulo ? htmlBloque(bloque('titulo', { nivel: 'h1', texto: p.titulo })) + '\n<hr>\n' : ''}${p.bloques.map(b => htmlBloque(b)).join('\n')}\n</div>`;
    }
    function sanear(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script,object,embed,base,link,meta,iframe').forEach(n => n.remove());
        doc.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
            if (/^on/i.test(a.name) || a.name === 'srcdoc' || (/^(href|src)$/i.test(a.name) && /^(javascript|vbscript|data):/i.test(a.value.replace(/\s/g, '')))) n.removeAttribute(a.name);
        }));
        return doc.body.innerHTML;
    }
    function leerTabla(nodo) {
        const tabla = nodo.matches('table') ? nodo : nodo.querySelector('table');
        // Una tabla combinada se conserva completa; no se aplana al editar.
        if (!tabla.rows.length || tabla.querySelector('[rowspan],[colspan]')) return bloque('crudo', { html: nodo.outerHTML });
        const filas = [...tabla.rows];
        return bloque('tabla', { titulo: nodo.querySelector('.table-responsive > div p')?.textContent || '',
            encabezados: [...filas[0].cells].map(aMarcas), filas: filas.slice(1).map(f => [...f.cells].map(aMarcas)) });
    }
    function desdeWord(entrada, imagenes = new Map()) {
        const inicio = entrada.findIndex(b => b.tipo === 'tabla' && b.celdas === 1 && limpio(b.texto));
        if (inicio < 0) throw new Error('No se encontró el título de la actividad en una tabla de una celda. Puedes empezar con los bloques y pegar el contenido.');
        const datos = prepararWord(entrada.slice(inicio));
        const pagina = { titulo: '', bloques: [], avisos: [] };
        let ruta = null, paso = null, numero = null, sublista = null, centrado = false, esperaTabla = false, tituloTabla = '';
        const destino = () => paso ? paso.hijos : pagina.bloques;
        const texto = (t, alineacion = 'izquierda') => {
            const lista = destino(), ultimo = lista.at(-1);
            if (ultimo?.tipo === 'texto' && ultimo.alineacion === alineacion) ultimo.texto += '\n\n' + t;
            else lista.push(bloque('texto', { texto: t, alineacion }));
        };
        const cerrar = () => { ruta = null; paso = null; numero = null; sublista = null; };
        for (const dato of datos) {
            if (dato.dentroDeTabla) continue;
            const t = limpio(dato.texto), rico = dato.texto || '';
            if (dato.tipo === 'tabla') {
                if (dato.celdas === 1) {
                    cerrar();
                    if (!pagina.titulo) pagina.titulo = t;
                    else pagina.bloques.push(bloque('titulo', { texto: t }));
                } else {
                    const celda = c => (c.contenido || []).filter(p => p.tipo === 'parrafo').map(p => p.texto).join('\n') || c.texto || '';
                    destino().push(bloque('tabla', { titulo: tituloTabla, encabezados: dato.filas[0].map(celda), filas: dato.filas.slice(1).map(f => f.map(celda)) }));
                    esperaTabla = false; tituloTabla = ''; sublista = null;
                }
                continue;
            }
            if (/^<.*>$/.test(t)) {
                if (/lista numerada/i.test(t)) {
                    if (/^<Termina/i.test(t)) cerrar();
                    else { cerrar(); ruta = bloque('pasos', { items: [] }); pagina.bloques.push(ruta); }
                } else if (/centrado/i.test(t)) centrado = !/^<Termina/i.test(t);
                else if (/^<Tabla/i.test(t)) esperaTabla = true;
                else if (/^<Termina tabla/i.test(t)) esperaTabla = false;
                else if (!/^<\/?h[1-4]>$/i.test(t)) pagina.avisos.push('Indicación de montaje: ' + t);
                continue;
            }
            if (esperaTabla && t && !dato.lista) { tituloTabla = t; continue; }
            if (dato.lista) {
                const estilo = { letras: 'letras', vinetas: 'vinetas', romana: 'romana', ordenada: 'numerada' }[dato.tipoLista] || 'numerada';
                if (ruta && (numero === null || (dato.idLista === numero && !dato.nivelLista))) {
                    numero = dato.idLista; paso = { texto: rico, hijos: [] }; ruta.items.push(paso); sublista = null;
                } else {
                    if (!sublista || sublista.estilo !== estilo || sublista.num !== dato.idLista) {
                        sublista = bloque('lista', { estilo, items: [], num: dato.idLista }); destino().push(sublista);
                    }
                    sublista.items.push(rico);
                }
                continue;
            }
            sublista = null;
            if (t) {
                if (ruta && !centrado && !dato.sangria) cerrar();
                texto(rico, centrado || dato.alineacion === 'centro' ? 'centro' : 'izquierda');
            }
            (dato.imagenes || []).forEach(id => {
                const img = imagenes.get(id);
                if (img) destino().push(bloque('imagen', { src: '@@PLUGINFILE@@/' + img.nombre }));
            });
        }
        despuesWord(pagina.bloques);
        return pagina;
    }
    // Funciones de lectura de las AA cotejadas se incorporan a continuación.
    function prepararWord(entrada) {
        const datos = entrada.filter(b => !b.dentroDeTabla || b.tipo === 'tabla');
        let enRuta = false, letraEsperada = 0;
        return datos.filter((b, i) => !(/^<h[1-4]>$/i.test(limpio(b.texto)) && datos[i + 1]?.tipo === 'tabla' && datos[i + 1].celdas === 1))
            .map((b, i, todos) => {
                let t = limpio(b.texto);
                if (b.tipo === 'tabla' && b.celdas === 1 && (seccion.test(t) || /^Actividad de aprendizaje/i.test(t))) b.sombreado = true;
                if (/^<(?:Termina )?lista numerada/i.test(t)) enRuta = !/^<Termina/i.test(t);
                if (/^<(?:Termina )?texto.*centrado/i.test(t)) {
                    b.texto = /^<Termina/i.test(t) ? '<Termina texto regular centrado>' : '<Texto regular centrado>';
                    b.tramos = [];
                }
                if (enRuta && !b.lista) {
                    // Solo secuencias a., b., c. dentro de la ruta: no se adivina
                    // una lista a partir de cualquier párrafo que empieza por letra.
                    const m = t.match(/^([a-z])[.)]\s+(.+)/i);
                    const siguiente = limpio(todos[i + 1]?.texto);
                    if (m && (m[1].toLowerCase().charCodeAt(0) === letraEsperada || (m[1].toLowerCase() === 'a' && /^b[.)]\s/i.test(siguiente)))) {
                        letraEsperada = m[1].toLowerCase().charCodeAt(0) + 1;
                        b.texto = b.texto.replace(/^\s*(?:\*\*)?[a-z][.)](?:\*\*)?\s*/i, '');
                        b.tramos = [];
                        Object.assign(b, { lista: true, tipoLista: 'letras', idLista: 'aa-incisos', nivelLista: 1, sangria: 1440 });
                    } else letraEsperada = 0;
                    // La nota de AA3 precede otro paso; en AA1/AA2 cierra la caja.
                    if (/^Nota:/i.test(t)) {
                        const cierre = todos.slice(i + 1).findIndex(x => /^<Termina lista|^<h[12]>|^Evidencia de aprendizaje/i.test(limpio(x.texto)));
                        const despues = todos.slice(i + 1, cierre < 0 ? undefined : i + 1 + cierre);
                        if (despues.some(x => x.lista && x.tipoLista === 'ordenada')) b.sangria = 720;
                    }
                }
                return b;
            });
    }

    function despuesWord(nuevos) {
        // Se conserva literalmente la redacción del Word. La URL queda pendiente
        // cuando el Word no la contiene: jamás se toma la de otra actividad.
        let evaluacion = false;
        nuevos.forEach((b, i) => {
            if (b.tipo === 'titulo') evaluacion = /^Evaluación/i.test(limpio(b.texto));
            else if (evaluacion && b.tipo === 'texto') {
                const t = b.texto || '';
                const m = t.match(/(?:\*\*)?rúbrica(?:\*\*)?/i);
                if (m && !/\[[^\]]*rúbrica/i.test(t)) nuevos[i] = Object.assign(bloque('evaluacionAA'), {
                    id: b.id, antes: t.slice(0, m.index), enlace: 'rúbrica',
                    despues: t.slice(m.index + m[0].length), negrita: m[0].includes('**')
                });
            }
        });
    }

    function aMarcas(nodo) {
        return [...nodo.childNodes].map(n => {
            if (n.nodeType === 3) return n.textContent.replace(/\s+/g, ' ');
            if (n.nodeType !== 1) return '';
            const t = aMarcas(n);
            if (/^(STRONG|B)$/.test(n.tagName)) return `**${t}**`;
            if (/^(EM|I)$/.test(n.tagName)) return `*${t}*`;
            if (n.tagName === 'BR') return '\n';
            if (n.tagName === 'A') return `[${t}](${n.getAttribute('href') || ''})`;
            return t;
        }).join('');
    }

    function leerNodo(nodo) {
        const h = nodo.matches('h1,h2') ? nodo : nodo.querySelector('h1,h2');
        if (h && !nodo.querySelector('ol,table')) return conservar(bloque('titulo', { nivel: h.tagName.toLowerCase(), texto: aMarcas(h) }), nodo);
        const ol = nodo.matches('ol.estiloLista') ? nodo : nodo.querySelector('ol.estiloLista');
        if (ol) {
            const items = [...ol.children].filter(n => n.tagName === 'LI').map(li => {
                const cabecera = li.ownerDocument.createElement('div');
                let despues = false;
                const hijos = [];
                let cola = li.ownerDocument.createElement('p');
                const vaciarCola = () => {
                    if (cola.textContent.trim()) hijos.push(leerNodo(cola));
                    cola = li.ownerDocument.createElement('p');
                };
                [...li.childNodes].forEach(n => {
                    if (n.nodeType === 1 && /^(DIV|P|OL|UL|TABLE)$/.test(n.tagName)) {
                        despues = true; vaciarCola(); hijos.push(leerNodo(n));
                    } else (despues ? cola : cabecera).append(n.cloneNode(true));
                });
                vaciarCola();
                return { texto: aMarcas(cabecera).trim(), hijos };
            });
            return conservar(bloque('pasos', { caja: Boolean(nodo.querySelector('.card-body')), items }), nodo);
        }
        if (nodo.matches('ol,ul')) return conservar(bloque('lista', {
            estilo: nodo.tagName === 'UL' ? 'vinetas' : nodo.getAttribute('type') === 'a' ? 'letras' : 'numerada',
            items: [...nodo.children].map(n => aMarcas(n).trim())
        }), nodo);
        if (nodo.matches('table') || nodo.querySelector('table')) {
            return conservar(leerTabla(nodo), nodo);
        }
        if (!nodo.querySelector('img,iframe,button,details,.modal') && nodo.textContent.trim()) {
            const enlace = [...nodo.querySelectorAll('a')].find(a => /rúbrica/i.test(a.textContent));
            if (enlace && /La valoración de tu actividad/.test(nodo.textContent)) {
                const p = enlace.closest('p');
                const texto = p ? aMarcas(p) : '';
                const marca = `[${aMarcas(enlace)}](${enlace.getAttribute('href') || ''})`;
                const posicion = texto.indexOf(marca);
                if (posicion >= 0) {
                    let antes = texto.slice(0, posicion), despues = texto.slice(posicion + marca.length);
                    const negrita = antes.endsWith('**') && despues.startsWith('**');
                    if (negrita) { antes = antes.slice(0, -2); despues = despues.slice(2); }
                    return conservar(bloque('evaluacionAA', { antes, despues, negrita, enlace: aMarcas(enlace), url: enlace.getAttribute('href') || '' }), nodo);
                }
            }
            const ps = nodo.matches('p') ? [nodo] : [...nodo.querySelectorAll('p')];
            const texto = (ps.length ? ps.map(p => aMarcas(p)).join('\n\n') : aMarcas(nodo)).trim();
            return conservar(bloque('texto', { texto,
                alineacion: nodo.matches('.text-center') || (ps.length && ps.every(p => p.matches('.text-center'))) ? 'centro' : 'izquierda',
                aaMulticol: nodo.matches('.text-multicol') || Boolean(nodo.querySelector('.text-multicol')) }), nodo);
        }
        return bloque('crudo', { html: nodo.outerHTML });
    }

    function importarActividad(html) {
        const doc = new DOMParser().parseFromString(sanear(html), 'text/html');
        const raiz = doc.querySelector('.mainPlantilla23');
        if (!raiz) return { bloques: [], titulo: '', avisos: ['Pega el HTML de la actividad que incluya su contenedor mainPlantilla23.'] };
        // El HTML se previsualiza aquí: descarta código activo, nunca el contenido.
        raiz.querySelectorAll('script,object,embed,base,link,meta').forEach(n => n.remove());
        raiz.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
            if (/^on/i.test(a.name) || a.name === 'srcdoc' || (/^(href|src|action)$/i.test(a.name) && /^\s*(javascript|vbscript|data):/i.test(a.value))) n.removeAttribute(a.name);
        }));
        const bloques = [...raiz.children].map(leerNodo);
        let titulo = '';
        if (bloques[0]?.tipo === 'titulo' && bloques[0].nivel === 'h1') {
            titulo = bloques.shift().texto;
            if (/^<hr\b/i.test(bloques[0]?.html || '')) bloques.shift();
        }
        const paleta = PALETAS.find(p => raiz.classList.contains(p.clase))?.clase;
        return { bloques, titulo, paleta, salida: raiz.classList.contains('pb-0') ? 'compacta' : 'completa',
            clasesExtra: [...raiz.classList].filter(c => !['container-fluid', 'mainPlantilla23', 'M01', 'M02', 'M03', 'MM', 'reg', 'pb-0'].includes(c)),
            avisos: ['Se conserva el maquetado de cada bloque sin editar. Los bloques editados se generan con los componentes del aula.'] };
    }


    window.AA = { nombres, bloque, escapar, segura, marcas, generar, htmlBloque, desdeWord, importarHTML: importarActividad, sanear };
})();
