(function () {
  'use strict';
  const { BIN_MAX, clamp01, cloneFrame, lerp, phaseLerp } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['spectral-smear'] = {
    label: 'Spectral Smear',
    applyFrame: function (frame, strength) {
      const out = cloneFrame(frame);
      const s = clamp01(strength);
      const radius = 1 + Math.round(s * 5);
      const copy = cloneFrame(out);
      for (let k = 1; k <= BIN_MAX; k++) {
        let aSum = 0, phx = 0, phy = 0, wSum = 0;
        for (let j = Math.max(1, k - radius); j <= Math.min(BIN_MAX, k + radius); j++) {
          const w = Math.max(0, 1 - Math.abs(j - k) / (radius + 1));
          aSum += copy.amp[j] * w;
          phx  += Math.cos(copy.phase[j]) * copy.amp[j] * w;
          phy  += Math.sin(copy.phase[j]) * copy.amp[j] * w;
          wSum += w;
        }
        out.amp[k]   = lerp(copy.amp[k], aSum / (wSum + 1e-9), s * 0.75);
        out.phase[k] = phaseLerp(copy.phase[k], Math.atan2(phy, phx), s * 0.55);
      }
      return out;
    },
    applyLayer: function (frames, strength) {
      const s = clamp01(strength);
      const out = frames.map(cloneFrame);
      const depth = frames.length;
      for (let i = 1; i < depth; i++) {
        for (let k = 1; k <= BIN_MAX; k++) {
          out[i].amp[k]   = lerp(frames[i].amp[k], frames[i - 1].amp[k], 0.2 * s);
          out[i].phase[k] = phaseLerp(frames[i].phase[k], frames[i - 1].phase[k], 0.25 * s);
        }
      }
      return out;
    }
  };
})();
