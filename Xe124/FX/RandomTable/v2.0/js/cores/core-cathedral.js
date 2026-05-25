(function () {
  'use strict';
  const { BIN_MAX, TAU, blankFrame, clamp01 } = window.WT;

  window.WT.CORES = window.WT.CORES || {};
  window.WT.CORES['cathedral'] = {
    label: 'Cathedral（倍音が深く広い残響系）',
    fn: function coreCathedral(pos) {
      const f = blankFrame();
      const nModes = 5 + Math.floor(Math.random() * 5);
      const modes = Array.from({ length: nModes }, () => ({
        k: 2 + Math.floor(Math.random() * 200),
        w: 8 + Math.random() * 40,
        gain: 0.4 + Math.random() * 0.8
      }));
      for (let k = 1; k <= BIN_MAX; k++) {
        const x = k / BIN_MAX;
        const r1 = Math.random(), r2 = Math.random();
        const base = Math.pow(1 - x, 1.0) * (0.3 + 0.5 * Math.pow(r1, 1.8));
        let modeSum = 0;
        for (const m of modes) {
          modeSum += m.gain * Math.exp(-0.5 * Math.pow((k - m.k) / m.w, 2));
        }
        f.amp[k] = clamp01(base + 0.5 * modeSum * (0.7 + 0.3 * r1));
        f.phase[k] = r2 * TAU + Math.sin(k * 0.05 + pos * 0.07) * 0.4;
      }
      return f;
    }
  };
})();
