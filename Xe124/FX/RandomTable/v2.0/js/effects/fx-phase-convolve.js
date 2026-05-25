(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['phase-convolve'] = {
    label: 'Phase Convolve（スペクトル位相の畳み込み平滑化）',
    applyFrame: function (frame, strength) {
      const out    = cloneFrame(frame);
      const s      = clamp01(strength);
      const radius = 2 + Math.round(s * 8);
      const copy   = cloneFrame(out);
      for (let k = 1; k <= BIN_MAX; k++) {
        let phx = 0, phy = 0, wsum = 0;
        for (let j = Math.max(1, k - radius); j <= Math.min(BIN_MAX, k + radius); j++) {
          const gw = Math.exp(-0.5 * ((j - k) / Math.max(1, radius * 0.5)) ** 2);
          const aw = copy.amp[j] + 0.1;
          const w  = gw * aw;
          phx  += Math.cos(copy.phase[j]) * w;
          phy  += Math.sin(copy.phase[j]) * w;
          wsum += w;
        }
        out.phase[k] = phaseLerp(copy.phase[k], Math.atan2(phy / wsum, phx / wsum), s * 0.6);
      }
      return out;
    }
  };
})();
