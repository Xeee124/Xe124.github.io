(function () {
  'use strict';

  function loadScript(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () {
        console.warn('[loader] skipped (not found): ' + src);
        resolve();
      };
      document.head.appendChild(s);
    });
  }

  async function boot() {
    var cores = [], effects = [];
    try { cores   = await fetch('js/cores/CORES.json').then(function(r){ return r.json(); }); }
    catch(e) { console.error('[loader] CORES.json failed:', e); }
    try { effects = await fetch('js/effects/EFFECTS.json').then(function(r){ return r.json(); }); }
    catch(e) { console.error('[loader] EFFECTS.json failed:', e); }

    await loadScript('js/utils.js');
    for (var i = 0; i < cores.length;   i++) await loadScript('js/cores/core-'   + cores[i]   + '.js');
    for (var j = 0; j < effects.length; j++) await loadScript('js/effects/fx-'   + effects[j] + '.js');
    await loadScript('js/engine.js');

    if (window.WT && window.WT.initUI) window.WT.initUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
