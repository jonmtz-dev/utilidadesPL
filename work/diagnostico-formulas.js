/* Pegar en la consola (F12) con la pagina de Moodle abierta.
   Devuelve TEXTO plano: la consola no lo pliega y se puede copiar tal cual. */
(() => {
  const m = document.querySelector('math.tml-display');
  if (!m) return 'No hay ninguna formula en esta pagina.';
  const filas = [];
  for (const hoja of document.styleSheets) {
    let reglas;
    try { reglas = hoja.cssRules; } catch (e) { filas.push('  (hoja bloqueada) ' + (hoja.href || '')); continue; }
    for (const r of reglas) {
      if (!r.selectorText || !r.style || !r.style.display) continue;
      try { if (!m.matches(r.selectorText)) continue; } catch (e) { continue; }
      filas.push('  ' + (hoja.href || 'en la pagina').split('/').pop()
        + '  ||  ' + r.selectorText
        + '  ->  display: ' + r.style.display
        + (r.style.getPropertyPriority('display') ? ' !IMPORTANT' : ''));
    }
  }
  return [
    'GANA           : ' + getComputedStyle(m).display,
    'style en linea : ' + m.getAttribute('style'),
    'soporta        : ' + CSS.supports('display', 'block math'),
    'REGLAS (' + filas.length + '):',
    filas.join('\n')
  ].join('\n');
})()
