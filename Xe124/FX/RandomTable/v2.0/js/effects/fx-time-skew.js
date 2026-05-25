(function () {
  'use strict';
  const { clamp01, resampleFrames } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['time-skew'] = {
    label: 'TimeSkew',
    applyLayer: function (frames, strength) {
      const skew = 0.35 + 2.6 * clamp01(strength);
      return resampleFrames(frames, function (t) { return Math.pow(t, skew); });
    }
  };
})();
