(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-smooth'] = {
    label: 'Phase Smooth',
    applyFrame: function (frame, strength) {
      const out  = cloneFrame(frame);
      const s    = clamp01(strength);
      const copy = cloneFrame(out);
      for (let k = 1; k <= BIN_MAX; k++) {
        let phx = 0, phy = 0;
        for (let j = Math.max(1, k - 4); j <= Math.min(BIN_MAX, k + 4); j++) {
          const w = 1 - Math.abs(j - k) / 5;
          phx += Math.cos(copy.phase[j]) * w;
          phy += Math.sin(copy.phase[j]) * w;
        }
        out.phase[k] = phaseLerp(copy.phase[k], Math.atan2(phy, phx), 0.35 + 0.5 * s);
      }
      return out;
    }
  };
})();
