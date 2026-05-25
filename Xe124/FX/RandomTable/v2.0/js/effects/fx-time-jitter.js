(function () {
  'use strict';
  const { clamp01, clamp, resampleFrames, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['time-jitter'] = {
    label: 'Time Jitter',
    applyLayer: function (frames, strength, layerIndex, seed) {
      const amount = 0.02 + 0.12 * clamp01(strength);
      return resampleFrames(frames, function (t, i) {
        return clamp(t + (hash01(seed + i * 12.7) - 0.5) * amount, 0, 1);
      });
    }
  };
})();
