(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, phaseLerp, wrapPhase, seededRand } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['ring-mod'] = {
    label: 'Ring Mod（スペクトルのリングモジュレーション）',
    applyFrame: function (frame, strength, frameIndex, depth, seed) {
      const out      = cloneFrame(frame);
      const s        = clamp01(strength);
      const modHz    = 3 + Math.floor(seededRand(seed) * 20);
      const modDepth = s * 0.7;
      const copy     = cloneFrame(out);
      for (let k = 1; k <= BIN_MAX; k++) {
        const upper = k + modHz;
        const lower = k - modHz;
        const sbAmp = copy.amp[k] * 0.5;
        if (upper <= BIN_MAX) {
          out.amp[upper]   = lerp(out.amp[upper], out.amp[upper] + sbAmp, modDepth);
          out.phase[upper] = phaseLerp(out.phase[upper], wrapPhase(copy.phase[k] + (copy.phase[modHz] || 0)), modDepth * 0.5);
        }
        if (lower >= 1) {
          out.amp[lower]   = lerp(out.amp[lower], out.amp[lower] + sbAmp, modDepth);
          out.phase[lower] = phaseLerp(out.phase[lower], wrapPhase(copy.phase[k] - (copy.phase[modHz] || 0)), modDepth * 0.5);
        }
      }
      for (let k = 1; k <= BIN_MAX; k++) out.amp[k] = clamp01(out.amp[k]);
      return out;
    }
  };
})();
