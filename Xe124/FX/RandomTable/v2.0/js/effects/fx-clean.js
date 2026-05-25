(function () {
  'use strict';
  const { cloneFrame } = window.WT;
  window.WT.EFFECTS = window.WT.EFFECTS || {};
  window.WT.EFFECTS['clean'] = {
    label: 'Clean（エフェクトなし）',
    applyFrame: function (frame) {
      return cloneFrame(frame);
    }
  };
})();
