(function () {
  'use strict';
  const { TAU, clamp01, clamp, resampleFrames, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['time-warp'] = {
    label: 'Time Warp',
    applyLayer: function (frames, strength, layerIndex, seed) {
      const amount = 0.15 + 0.35 * clamp01(strength);
      return resampleFrames(frames, function (t, i) {
        return clamp(t + Math.sin((t * TAU) * (1.2 + amount) + layerIndex) * amount * 0.4 + (hash01(seed + i * 3.3) - 0.5) * 0.03, 0, 1);
      });
    }
  };
})();
