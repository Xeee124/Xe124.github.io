(function () {
  'use strict';
  const { clamp01, resampleFrames } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['time-hold'] = {
    label: 'Time Hold',
    applyLayer: function (frames, strength) {
      const steps = 2 + Math.round(10 * clamp01(strength));
      return resampleFrames(frames, function (t) { return Math.floor(t * steps) / steps; });
    }
  };
})();
