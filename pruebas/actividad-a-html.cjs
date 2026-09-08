/* Pruebas de navegador. Playwright se proporciona desde el entorno de pruebas;
   la aplicación sigue sin build ni dependencias. Ver el README de la herramienta. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const origen = process.env.AA_URL || 'http://localhost:5510';
const ejemplos = process.env.AA_EJEMPLOS_DIR;
const salida = process.env.AA_EVIDENCIA_DIR;
if (!ejemplos || !salida) throw new Error('Define AA_EJEMPLOS_DIR y AA_EVIDENCIA_DIR; los ejemplos no se publican en el repositorio.');
fs.mkdirSync(salida, { recursive: true });

(async () => {
    const navegador = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const contexto = await navegador.newContext({ viewport: { width: 1366, height: 700 }, serviceWorkers: 'block' });
        const pagina = await contexto.newPage();
        const errores = [];
        const dependencias = [];
        pagina.on('request', r => { if (r.url().includes('/guion-a-pagina/')) dependencias.push(r.url()); });
        pagina.on('pageerror', e => errores.push(e.message));
        const abrir = async () => { await pagina.goto(origen + '/tools/actividad-a-html/'); await pagina.locator('#toolbar button').first().waitFor(); };
        const codigo = () => pagina.locator('#code').inputValue();
        const importarWord = async archivo => {
            await pagina.locator('#input-docx').setInputFiles(archivo);
            await pagina.waitForFunction(() => document.querySelector('#import-info').textContent.includes('Actividad importada'));
            await pagina.waitForFunction(() => document.querySelector('#code').value.includes('mainPlantilla23'));
        };
        const archivos = fs.readdirSync(ejemplos, { recursive: true });
        const words = archivos.filter(f => /\.docx$/i.test(f) && !/rubrica|~\$/i.test(f));
        const resultados = [];
        for (const archivo of words) {
            await abrir(); await importarWord(path.join(ejemplos, archivo));
            const datos = await pagina.evaluate(() => {
                const d = new DOMParser().parseFromString(document.querySelector('#code').value, 'text/html');
                return {
                    titulo: d.querySelector('h1').textContent,
                    secciones: d.querySelectorAll('h2').length,
                    pasos: [...d.querySelectorAll('ol.estiloLista')].map(n => n.children.length),
                    incisos: [...d.querySelectorAll('ol[type="a"]')].map(n => n.children.length),
                    tablas: [...d.querySelectorAll('table')].map(n => ({ dentro: !!n.closest('li'), etiquetas: n.querySelectorAll('td[data-label]').length })),
                    notaDentro: [...d.querySelectorAll('p')].filter(p => p.textContent.startsWith('Nota:')).map(p => !!p.closest('li')),
                    scroll: document.documentElement.scrollHeight > innerHeight
                };
            });
            const esperados = /tecnologia/i.test(archivo) ? [6, 4, 0] : /AA1/i.test(archivo) ? [7, 7, 1] : /AA2/i.test(archivo) ? [9, 6, 1] : [11, 8, 0];
            assert.equal(datos.secciones, 5);
            assert.deepEqual(datos.pasos, [esperados[0]]);
            assert.deepEqual(datos.incisos, [esperados[1]]);
            assert.equal(datos.tablas.length, esperados[2]);
            assert(datos.tablas.every(t => t.dentro && t.etiquetas > 0));
            assert.deepEqual(datos.notaDentro, [/aa3/i.test(archivo)]);
            assert.equal(datos.scroll, false);
            assert(!(await codigo()).includes('ms-convertido'));
            assert(!(await codigo()).includes('&lt;Termina'));
            resultados.push({ archivo, ...datos });
        }

        await pagina.locator('[data-target="code"]').click();
        const htmls = archivos.filter(f => /\.txt$/i.test(f) && !/rubrica/i.test(f));
        for (const archivo of htmls) {
            const original = fs.readFileSync(path.join(ejemplos, archivo), 'utf8');
            await pagina.locator('#code').fill(original);
            await pagina.locator('#btn-traer').click();
            const igual = await pagina.evaluate(original => {
                const normalizar = n => {
                    if (n.nodeType === 3) return n.textContent.trim() ? ['texto', n.textContent.replace(/\s+/g, ' ').trim()] : null;
                    if (n.nodeType !== 1) return null;
                    return [n.tagName, [...n.attributes].map(a => [a.name, a.value]).sort(), [...n.childNodes].map(normalizar).filter(Boolean)];
                };
                const leer = t => normalizar(new DOMParser().parseFromString(t, 'text/html').querySelector('.mainPlantilla23'));
                return JSON.stringify(leer(original)) === JSON.stringify(leer(document.querySelector('#code').value));
            }, original);
            assert(igual, 'Cambió el maquetado de ' + archivo);
        }

        // Edición de un paso importado: mantiene los hijos y la nota de entrega.
        const campoPaso = pagina.locator('.aa-paso textarea').first();
        await campoPaso.fill('**Investiga** el material seleccionado para tu sartén.');
        await pagina.waitForFunction(() => document.querySelector('#code').value.includes('material seleccionado para tu sartén'));
        assert((await codigo()).includes('<ol type="a">'));


        // Cada paleta cambia el contenedor; ambas salidas conservan los 11 pasos.
        for (const paleta of ['M01', 'M02', 'M03', 'MM', 'reg']) {
            await pagina.locator('#paleta').selectOption(paleta);
            assert((await codigo()).includes('mainPlantilla23 ' + paleta));
        }
        await pagina.locator('#compacta').check(); assert((await codigo()).includes('pb-0'));
        await pagina.locator('#compacta').uncheck(); assert(!(await codigo()).includes('pb-0'));
        const anterior = await codigo();
        await pagina.locator('#btn-limpiar').click(); await pagina.locator('#btn-deshacer').click();
        assert.equal(await codigo(), anterior);

        // Archivo incorrecto no borra el trabajo y permite reintentar.
        await pagina.locator('#input-docx').setInputFiles({ name: 'roto.docx', mimeType: 'application/octet-stream', buffer: Buffer.from('archivo roto') });
        await pagina.waitForFunction(() => document.querySelector('#import-info').textContent.startsWith('No se pudo importar'));
        assert.equal(await codigo(), anterior);
        const descarga = pagina.waitForEvent('download'); await pagina.locator('#btn-descargar').click();
        assert.equal((await descarga).suggestedFilename(), 'actividad-de-aprendizaje.html');

        await pagina.locator('[data-target="preview"]').click();
        await pagina.waitForTimeout(600);
        await pagina.screenshot({ path: path.join(salida, 'claro.png'), animations: 'disabled' });
        await pagina.evaluate(() => localStorage.setItem('panel-tema', 'dark'));
        await pagina.reload(); await pagina.locator('#toolbar button').first().waitFor();
        await importarWord(path.join(ejemplos, words.find(f => /AA2/i.test(f))));
        await pagina.waitForTimeout(600);
        await pagina.screenshot({ path: path.join(salida, 'oscuro.png'), animations: 'disabled' });
        assert.equal(await pagina.evaluate(() => document.documentElement.scrollHeight > innerHeight), false);
        await pagina.locator('[data-ancho="celular"]').click();
        await pagina.waitForTimeout(300);
        const previa = pagina.frameLocator('#preview-frame');
        assert.equal(await previa.locator('table').evaluate(n => getComputedStyle(n).display), 'block');
        assert.equal(await previa.locator('td').first().evaluate(n => getComputedStyle(n, '::before').content.replace(/\\a ?/g, '\n').includes(n.dataset.label)), true);
        await pagina.setViewportSize({ width: 390, height: 844 });
        await pagina.waitForTimeout(400);
        assert.equal(await pagina.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await pagina.screenshot({ path: path.join(salida, 'movil.png'), fullPage: true, animations: 'disabled' });
        assert.deepEqual(errores, []);
        assert.deepEqual(dependencias, []);
        assert.equal(await pagina.locator('#toolbar button').count(), 7);
        fs.writeFileSync(path.join(salida, 'resultados.json'), JSON.stringify({ words: resultados, htmls: htmls.length, errores }, null, 2));
        console.log('Correcto: cuatro Word, cuatro HTML, edición, paletas, deshacer, error recuperable, descarga, temas y móvil.');
    } finally { await navegador.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

