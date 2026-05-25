(function () {
  'use strict';
  const { resampleFrames } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['time-pingpong'] = {
    label: 'Ping-Pong',
    applyLayer: function (frames) {
      return resampleFrames(frames, function (t) { const x = t * 2; return x <= 1 ? x : 2 - x; });
    }
  };
})();
