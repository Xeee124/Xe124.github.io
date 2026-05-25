(function () {
  'use strict';
  const { clamp01, resampleFrames, hash01 } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['time-jump'] = {
    label: 'Time Jump',
    applyLayer: function (frames, strength, layerIndex, seed) {
      const segments = 3 + Math.round(8 * clamp01(strength));
      return resampleFrames(frames, function (t) {
        const seg = Math.min(segments - 1, Math.floor(t * segments));
        return hash01(seed + seg * 19.7 + layerIndex * 5.1);
      });
    }
  };
})();
