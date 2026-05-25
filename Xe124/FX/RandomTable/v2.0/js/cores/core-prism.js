(function () {
  'use strict';
  const { BIN_MAX, TAU, blankFrame, clamp01 } = window.WT;

  window.WT.CORES = window.WT.CORES || {};
  window.WT.CORES['prism'] = {
    label: 'Prism（高域に向かって密になる虹彩系）',
    fn: function corePrism(pos) {
      const f = blankFrame();
      const bands = 6 + Math.floor(Math.random() * 6);
      const bandPhase = Math.random() * TAU;
      for (let k = 1; k <= BIN_MAX; k++) {
        const x = k / BIN_MAX;
        const r1 = Math.random(), r2 = Math.random();
        const rippleFreq = 2 + x * bands * 8;
        const ripple = 0.5 + 0.5 * Math.sin(x * TAU * rippleFreq + bandPhase + pos * 0.25);
        const sparseLow = x < 0.1 ? (k % 3 === 1 ? 1.0 : 0.08) : 1.0;
        const base = Math.pow(r1, 2.0 - x * 1.5) * (0.2 + 0.8 * x * ripple);
        f.amp[k] = clamp01(base * sparseLow * (0.6 + 0.4 * r1));
        f.phase[k] = r2 * TAU + x * TAU * 0.5 + pos * 0.12;
      }
      return f;
    }
  };
})();
