(function () {
  'use strict';
  const { BIN_MAX, TAU, blankFrame, clamp01 } = window.WT;

  window.WT.CORES = window.WT.CORES || {};
  window.WT.CORES['fractal'] = {
    label: 'Fractal（自己相似的なスケール構造）',
    fn: function coreFractal(pos) {
      const f = blankFrame();
      const scale1 = 2 + Math.floor(Math.random() * 4);
      const scale2 = scale1 * (3 + Math.floor(Math.random() * 3));
      const scale3 = scale2 * (2 + Math.floor(Math.random() * 2));
      const ph0 = Math.random() * TAU;
      for (let k = 1; k <= BIN_MAX; k++) {
        const x = k / BIN_MAX;
        const r1 = Math.random(), r2 = Math.random();
        const e1 = 0.5 + 0.5 * Math.sin(k * TAU / scale1 + ph0 + pos * 0.1);
        const e2 = 0.5 + 0.5 * Math.sin(k * TAU / scale2 + ph0 * 1.7 + pos * 0.2);
        const e3 = 0.5 + 0.5 * Math.sin(k * TAU / scale3 + ph0 * 2.3 + pos * 0.35);
        const bassEnh = x < 0.12 ? 0.6 * (1 - x / 0.12) : 0;
        const base = (1 - x) * Math.pow(r1, 1.3);
        f.amp[k] = clamp01(base * (0.4 * e1 + 0.35 * e2 + 0.25 * e3) + bassEnh * r1);
        f.phase[k] = r2 * TAU + Math.sin(k / scale1 + pos * 0.15) * 0.5;
      }
      return f;
    }
  };
})();
