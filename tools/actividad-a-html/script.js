/* Editor de AA: formularios visibles y un catálogo deliberadamente pequeño. */
(function () {
    'use strict';
    const $ = s => document.querySelector(s);
    let pagina = { titulo: '', paleta: 'M01', compacta: false, clasesExtra: [], bloques: [AA.bloque('texto')] };
    let secuencia = 0, seleccionado = null, pendiente = null, leyendo = false;
    let recursos = new Map();
    const historial = [];
    const tipos = ['titulo','texto','pasos','lista','tabla','imagen','evaluacionAA'];
    function ids(lista) { lista.forEach(b => { if (!b.id) b.id = ++secuencia; (b.items || []).forEach(it => { if (it.hijos) ids(it.hijos); }); }); }
    function guardar() { historial.push({ pagina: structuredClone(pagina), recursos: new Map(recursos) }); if (historial.length > 30) historial.shift(); $('#btn-deshacer').disabled = false; }
    function cambiar(fn) { guardar(); fn(); dibujar(); }
    function buscar(id, lista = pagina.bloques) {
        for (let i = 0; i < lista.length; i++) {
            if (lista[i].id === id) return { lista, i };
            for (const it of lista[i].items || []) if (it.hijos) { const hallado = buscar(id,it.hijos); if (hallado) return hallado; }
        }
        return null;
    }
    function boton(texto, accion, padre, titulo) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-secondary btn-chico'; b.textContent = texto;
        if (titulo) { b.title = titulo; b.setAttribute('aria-label',titulo); }
        b.addEventListener('click',accion); padre.append(b); return b;
    }
    function campo(padre, objeto, clave, etiqueta, tipo = 'textarea', opciones) {
        const label = document.createElement('label'); label.className = tipo === 'checkbox' ? 'aa-check' : 'aa-campo';
        const nombre = document.createElement('span'); nombre.textContent = etiqueta;
        const el = document.createElement(tipo === 'select' ? 'select' : tipo === 'textarea' ? 'textarea' : 'input');
        if (tipo === 'select') opciones.forEach(([v,t]) => el.add(new Option(t,v)));
        if (tipo === 'checkbox') { el.type = 'checkbox'; el.checked = !!objeto[clave]; } else el.value = objeto[clave] ?? '';
        if (tipo === 'input') el.type = 'text';
        el.addEventListener('focus',guardar);
        el.addEventListener(tipo === 'checkbox' || tipo === 'select' ? 'change' : 'input', () => {
            objeto[clave] = tipo === 'checkbox' ? el.checked : el.value;
            clearTimeout(pendiente); pendiente = setTimeout(refrescar,180);
        });
        label.append(nombre,el); padre.append(label); return el;
    }
    function listaDeBloques(lista, padre) {
        lista.forEach((b,i) => {
            const caja = document.createElement('article'); caja.className = 'aa-bloque' + (seleccionado === b.id ? ' seleccionado' : ''); caja.dataset.id = b.id;
            caja.addEventListener('focusin',e => { if (e.target.closest('.aa-bloque') !== caja) return; seleccionado = b.id; document.querySelectorAll('.aa-bloque').forEach(n=>n.classList.toggle('seleccionado',Number(n.dataset.id)===b.id)); });
            const cabeza = document.createElement('div'); cabeza.className = 'aa-cabecera'; const nombre = document.createElement('strong'); nombre.textContent = AA.nombres[b.tipo]; cabeza.append(nombre);
            boton('↑',()=>cambiar(()=>lista.splice(i-1,0,lista.splice(i,1)[0])),cabeza,'Subir bloque').disabled = i===0;
            boton('↓',()=>cambiar(()=>lista.splice(i+1,0,lista.splice(i,1)[0])),cabeza,'Bajar bloque').disabled = i===lista.length-1;
            boton('×',()=>cambiar(()=>lista.splice(i,1)),cabeza,'Quitar bloque'); caja.append(cabeza);
            if (b.tipo === 'titulo') campo(caja,b,'texto','Título de sección','input');
            if (b.tipo === 'texto') {
                campo(caja,b,'texto','Texto · **negritas**, *cursivas* y [enlace](URL)');
                campo(caja,b,'alineacion','Alineación','select',[['izquierda','Izquierda'],['centro','Centrada'],['derecha','Derecha'],['justificado','Justificada']]);
                campo(caja,b,'aaMulticol','Texto en columnas del aula','checkbox');
            }
            if (b.tipo === 'lista') {
                campo(caja,b,'estilo','Tipo de lista','select',[['vinetas','Viñetas'],['numerada','1, 2, 3'],['letras','a, b, c'],['romana','i, ii, iii']]);
                const adaptador = { lineas: b.items.join('\n') };
                const area = campo(caja,adaptador,'lineas','Un elemento por renglón');
                area.addEventListener('input',()=>{ b.items = area.value.split('\n'); });
            }
            if (b.tipo === 'pasos') {
                campo(caja,b,'caja','Ruta dentro de la caja de color','checkbox');
                b.items.forEach((it,j) => {
                    const paso = document.createElement('div'); paso.className = 'aa-paso';
                    const cab = document.createElement('div'); cab.className = 'aa-cabecera'; const n = document.createElement('strong'); n.textContent='Paso '+(j+1); cab.append(n);
                    boton('↑',()=>cambiar(()=>b.items.splice(j-1,0,b.items.splice(j,1)[0])),cab,'Subir paso').disabled=j===0;
                    boton('↓',()=>cambiar(()=>b.items.splice(j+1,0,b.items.splice(j,1)[0])),cab,'Bajar paso').disabled=j===b.items.length-1;
                    boton('×',()=>cambiar(()=>b.items.splice(j,1)),cab,'Quitar paso'); paso.append(cab);
                    campo(paso,it,'texto','Instrucción del paso '+(j+1));
                    const hijos=document.createElement('div'); hijos.className='aa-bloques'; listaDeBloques(it.hijos,hijos); paso.append(hijos);
                    const acciones=document.createElement('div');acciones.className='aa-controles';
                    ['texto','lista','tabla','imagen'].forEach(tipo=>boton('+ '+AA.nombres[tipo],()=>cambiar(()=>it.hijos.push(AA.bloque(tipo))),acciones));paso.append(acciones);caja.append(paso);
                });
                boton('+ Agregar paso',()=>cambiar(()=>b.items.push({texto:'',hijos:[]})),caja);
            }
            if (b.tipo === 'tabla') {
                campo(caja,b,'titulo','Título de la tabla','input');
                campo(caja,b,'colorear','Color de la primera columna','select',[['alternado','Alternado'],['rosa','Primario'],['verde','Secundario'],['no','Sin color']]);
                campo(caja,b,'encabezadoColor','Colorear encabezado','checkbox');
                b.encabezados.forEach((t,j)=>{
                    const c=document.createElement('div');c.className='aa-tabla-celda';
                    campo(c,b.encabezados,j,'Columna '+(j+1),'input');
                    boton('Quitar columna',()=>cambiar(()=>{ b.encabezados.splice(j,1);b.filas.forEach(f=>f.splice(j,1)); }),c).disabled=b.encabezados.length<=1;
                    caja.append(c);
                });
                b.filas.forEach((f,j)=>{
                    const c=document.createElement('div');c.className='aa-tabla-celda';
                    b.encabezados.forEach((t,k)=>campo(c,f,k,'Fila '+(j+1)+' · '+t));
                    boton('Quitar fila',()=>cambiar(()=>b.filas.splice(j,1)),c);caja.append(c);
                });
                const acciones=document.createElement('div');acciones.className='aa-controles';
                boton('+ Fila',()=>cambiar(()=>b.filas.push(b.encabezados.map(()=>''))),acciones);
                boton('+ Columna',()=>cambiar(()=>{b.encabezados.push('Nueva columna');b.filas.forEach(f=>f.push(''));}),acciones);caja.append(acciones);
            }
            if (b.tipo === 'imagen') {
                campo(caja,b,'src','Ruta de la imagen en Moodle','input');campo(caja,b,'alt','Descripción de la imagen','input');campo(caja,b,'pie','Pie de imagen','input');
                const recurso=recursos.get(b.src);
                if (recurso) boton('Descargar imagen',()=>descargar(recurso.blob,recurso.nombre),caja);
            }
            if (b.tipo === 'evaluacionAA') {
                campo(caja,b,'antes','Texto antes del enlace');campo(caja,b,'enlace','Texto del enlace','input');
                campo(caja,b,'url','URL o @@PLUGINFILE@@/Rubrica.pdf','input');campo(caja,b,'negrita','Enlace en negritas','checkbox');campo(caja,b,'despues','Texto después del enlace');
            }
            if (b.tipo === 'crudo') {
                const nota=document.createElement('p');nota.className='aa-aviso';nota.textContent='Este fragmento conserva un formato especial del HTML importado. Puedes editar su código.';caja.append(nota);
                campo(caja,b,'html','HTML conservado');
            }
            padre.append(caja);
        });
    }
    function dibujar() {
        ids(pagina.bloques); $('#titulo').value=pagina.titulo;$('#paleta').value=pagina.paleta;$('#compacta').checked=pagina.compacta;
        $('#blocks').replaceChildren();listaDeBloques(pagina.bloques,$('#blocks'));refrescar();
    }
    function refrescar() {
        clearTimeout(pendiente);
        const html=AA.generar(pagina);$('#code').value=html;
        $('#muestra-paleta').style.backgroundColor=PALETAS.find(p=>p.clase===pagina.paleta).color;
        $('#preview-empty').classList.toggle('hidden',!!html);$('#preview-caja').classList.toggle('hidden',!html);
        let previa=AA.sanear(html);recursos.forEach((r,ruta)=>{previa=previa.split(ruta).join(r.url);});
        const frame=$('#preview-frame');const anterior=frame.contentDocument?.scrollingElement?.scrollTop || 0;
        frame.srcdoc='<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><style>'+CSS_PREVIA_AA+'</style><style>'+HOJA_MOODLE_DEFAULT+'</style><style>@import url("https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;500;700&display=swap");</style></head><body>'+previa+'</body></html>';
        frame.onload=()=>{if(frame.contentDocument?.scrollingElement)frame.contentDocument.scrollingElement.scrollTop=anterior;};
        const avisos=[];const recorrer=lista=>lista.forEach(b=>{if(b.tipo==='evaluacionAA'&&(!b.url||AA.segura(b.url)==='#'))avisos.push('Completa el enlace de evaluación.');if(b.tipo==='imagen'&&!b.src)avisos.push('Falta la ruta de una imagen.');(b.items||[]).forEach(it=>{if(it.hijos)recorrer(it.hijos);});});recorrer(pagina.bloques);
        $('#revision').textContent=[...new Set(avisos)].join(' ') || 'El HTML se pega en la Descripción de la actividad. Revisa los archivos enlazados antes de guardar en Moodle.';
    }
    function pestana(nombre) {
        document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.target===nombre));
        document.querySelectorAll('.tab-content').forEach(c=>c.classList.toggle('active',c.id===nombre+'-content'));
    }
    function descargar(blob,nombre) { const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=nombre;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
    async function word(file) {
        if(leyendo||!file)return;const info=$('#import-info');
        if(!/\.docx$/i.test(file.name)){info.textContent='Selecciona un archivo Word .docx.';return;}
        leyendo=true;$('#dropzone').disabled=true;info.textContent='Leyendo la actividad…';
        try {
            const [datos,imgs]=await Promise.all([leerBloquesDeDocx(file,{cursivas:true}),leerImagenesDeDocx(file)]);
            const nueva=AA.desdeWord(datos,imgs);guardar();
            recursos=new Map();imgs.forEach(r=>recursos.set('@@PLUGINFILE@@/'+r.nombre,{...r,url:URL.createObjectURL(r.blob)}));
            pagina={...pagina,titulo:nueva.titulo,bloques:nueva.bloques,clasesExtra:[]};seleccionado=null;dibujar();
            info.textContent=file.name+' · Actividad importada. '+nueva.avisos.join(' ');
        }catch(e){info.textContent='No se pudo importar: '+e.message;}finally{leyendo=false;$('#dropzone').disabled=false;$('#input-docx').value='';}
    }
    function traer(html) {
        const datos=AA.importarHTML(html);if(!datos.titulo&&!datos.bloques.length){$('#import-info').textContent=datos.avisos.join(' ');return;}
        guardar();pagina={titulo:datos.titulo,paleta:datos.paleta||pagina.paleta,bloques:datos.bloques,clasesExtra:datos.clasesExtra||[],compacta:datos.salida==='compacta'};
        seleccionado=null;dibujar();$('#import-info').textContent='HTML importado. Se conserva el formato de los bloques sin editar.';
    }
    function init() {
        PALETAS.forEach(p=>$('#paleta').add(new Option(p.clase+' · '+p.nombre,p.clase)));
        tipos.forEach(t=>boton(AA.nombres[t],()=>cambiar(()=>{const lugar=buscar(seleccionado);const nuevo=AA.bloque(t);if(lugar)lugar.lista.splice(lugar.i+1,0,nuevo);else pagina.bloques.push(nuevo);}),$('#toolbar')));
        $('#titulo').addEventListener('focus',guardar);$('#titulo').addEventListener('input',e=>{pagina.titulo=e.target.value;clearTimeout(pendiente);pendiente=setTimeout(refrescar,180);});
        $('#paleta').addEventListener('change',e=>cambiar(()=>{pagina.paleta=e.target.value;}));$('#compacta').addEventListener('change',e=>cambiar(()=>{pagina.compacta=e.target.checked;}));
        $('#btn-deshacer').onclick=()=>{const antes=historial.pop();if(!antes)return;pagina=antes.pagina;recursos=antes.recursos;seleccionado=null;dibujar();$('#btn-deshacer').disabled=!historial.length;};
        $('#btn-limpiar').onclick=()=>cambiar(()=>{pagina.titulo='';pagina.bloques=[AA.bloque('texto')];pagina.clasesExtra=[];});
        $('#btn-estructura').onclick=()=>cambiar(()=>{
            pagina.bloques=[AA.bloque('texto')];
            ['Propósito formativo','Situación de aprendizaje','Ruta de aprendizaje','Evidencia de aprendizaje','Evaluación'].forEach(t=>{
                pagina.bloques.push(AA.bloque('titulo',{texto:t}));
                pagina.bloques.push(t==='Ruta de aprendizaje'?AA.bloque('pasos'):t==='Evaluación'?AA.bloque('evaluacionAA',{antes:'La valoración de tu actividad se realiza con base en la siguiente ',despues:', que incluye los elementos que tu asesora o asesor virtual tendrá en cuenta al evaluarla.'}):AA.bloque('texto'));
            });
        });
        $('#dropzone').onclick=()=>$('#input-docx').click();$('#input-docx').onchange=e=>word(e.target.files[0]);
        $('#dropzone').ondragover=e=>{e.preventDefault();$('#dropzone').classList.add('arrastrando');};$('#dropzone').ondragleave=()=>$('#dropzone').classList.remove('arrastrando');
        $('#dropzone').ondrop=e=>{e.preventDefault();$('#dropzone').classList.remove('arrastrando');word(e.dataTransfer.files[0]);};
        $('#btn-abrir').onclick=()=>$('#input-html').click();$('#input-html').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{traer(await f.text());}catch(err){$('#import-info').textContent='No se pudo leer el HTML: '+err.message;}finally{e.target.value='';}};
        $('#btn-traer').onclick=()=>traer($('#code').value);
        $('#btn-generate').onclick=()=>{refrescar();pestana('code');};$('#btn-descargar').onclick=()=>{refrescar();if($('#code').value)descargar(new Blob([$('#code').value],{type:'text/html;charset=utf-8'}),'actividad-de-aprendizaje.html');};
        $('#btn-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#code').value);$('#revision').textContent='HTML copiado.';}catch{const c=$('#code');c.focus();c.select();$('#revision').textContent=document.execCommand('copy')?'HTML copiado.':'Selecciona el código y copia con Ctrl+C.';}};
        document.querySelectorAll('.tab-btn').forEach(b=>b.onclick=()=>pestana(b.dataset.target));
        document.querySelectorAll('[data-ancho]').forEach(b=>{if(b.tagName!=='BUTTON')return;b.onclick=()=>{$('#preview-caja').dataset.ancho=b.dataset.ancho;document.querySelectorAll('.aa-anchos button').forEach(n=>{n.classList.toggle('active',n===b);n.setAttribute('aria-pressed',String(n===b));});};});
        Reparto.iniciar({workspace:'#workspace',divisor:'#divisor',clave:'aa-integrador-reparto',colMin:360,restoMin:400,botonMax:'#btn-previa-max'});
        dibujar();
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
