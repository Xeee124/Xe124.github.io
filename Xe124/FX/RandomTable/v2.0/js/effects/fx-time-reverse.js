(function () {
  'use strict';
  const { cloneFrame } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['time-reverse'] = {
    label: 'Time Reverse',
    applyLayer: function (frames) {
      return [...frames].reverse().map(cloneFrame);
    }
  };
})();
