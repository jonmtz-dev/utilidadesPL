function initMargarita() {
    const inputCode = document.getElementById('input-code');
    const btnProcess = document.getElementById('btn-process');
    const btnCopy = document.getElementById('btn-copy');
    const outputCode = document.getElementById('output-code');
    const resultEmpty = document.getElementById('result-empty');
    const resultWrapper = document.getElementById('result-wrapper');
    const statsBar = document.getElementById('stats-bar');
    const statCorregidos = document.getElementById('stat-corregidos');
    const statExistentes = document.getElementById('stat-existentes');
    const linksEmpty = document.getElementById('links-empty');
    const linksEmptyText = document.getElementById('links-empty-text');
    const linksList = document.getElementById('links-list');
    
    const tabs = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    function activateTab(name) {
        tabs.forEach(t => t.classList.toggle('active', t.dataset.target === name));
        tabContents.forEach(c => c.classList.toggle('active', c.id === `${name}-content`));
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => activateTab(tab.dataset.target));
    });

    inputCode.addEventListener('input', () => {
        btnProcess.disabled = inputCode.value.trim() === '';
    });

    btnProcess.addEventListener('click', () => {
        const rawHTML = inputCode.value;
        let fixedCount = 0;
        let existCount = 0;
        const linksData = [];

        // Regex para atrapar la etiqueta <a> completa y su href si contiene youtube.com o youtu.be
        const aRegex = /<a\b([^>]*)href=["']([^"']*(?:youtube\.com|youtu\.be)[^"']*)["']([^>]*)>/gi;

        const finalHTML = rawHTML.replace(aRegex, (match, beforeHref, url, afterHref) => {
            // Verificar si ya tiene la clase nomediaplugin
            if (/\bnomediaplugin\b/.test(match)) {
                existCount++;
                linksData.push({ url, status: 'existente' });
                return match;
            }

            fixedCount++;
            linksData.push({ url, status: 'nuevo' });

            // Si ya tiene un atributo class, agregar nomediaplugin ahí mismo
            if (/class=["']/i.test(match)) {
                return match.replace(/class=(["'])/i, 'class=$1nomediaplugin ');
            } else {
                // Si no tiene class, se la agregamos al principio
                return match.replace(/<a\b/i, '<a class="nomediaplugin"');
            }
        });
        
        outputCode.value = finalHTML;

        // UI Updates
        resultEmpty.classList.add('hidden');
        resultWrapper.classList.remove('hidden');

        statCorregidos.textContent = fixedCount;
        statExistentes.textContent = existCount;

        if (linksData.length > 0) {
            statsBar.classList.remove('hidden');
            linksEmpty.classList.add('hidden');
            linksList.classList.remove('hidden');
            
            linksList.innerHTML = linksData.map(link => `
                <li>
                    <i class="ph ph-youtube-logo" style="color: #FF0000; font-size: 20px;"></i>
                    <a href="${link.url}" target="_blank" class="link-url">${link.url}</a>
                    <span class="badge ${link.status}">${link.status === 'nuevo' ? 'Corregido' : 'Ya tenía clase'}</span>
                </li>
            `).join('');
        } else {
            statsBar.classList.add('hidden');
            linksList.classList.add('hidden');
            linksEmpty.classList.remove('hidden');
            linksEmptyText.textContent = "No se encontraron enlaces de YouTube en el código proporcionado.";
        }

        activateTab('code');
    });

    btnCopy.addEventListener('click', () => {
        if (outputCode.value.trim() === '') return;

        navigator.clipboard.writeText(outputCode.value).then(() => {
            const icon = btnCopy.querySelector('i');
            icon.className = 'ph ph-check';
            icon.style.color = 'var(--success)';
            setTimeout(() => {
                icon.className = 'ph ph-copy';
                icon.style.color = '';
            }, 2000);
        }).catch(err => console.error('Error al copiar: ', err));
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMargarita);
} else {
    initMargarita();
}
