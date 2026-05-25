
import { estimateLag, toDb, rms } from './Delta_core.js';

export const category = 'その他';

export function analyzeOther(proc, compare) {
  return [
    { id: 'sampleRate', label: 'サンプルレート', value: proc.sampleRate, precision: 0, unit: 'Hz' },
    { id: 'sampleCount', label: 'サンプル数', value: proc.mono.length, precision: 0, unit: '' },
    { id: 'channels', label: 'チャンネル数', value: proc.channels, precision: 0, unit: '' },
    { id: 'mode', label: '処理モード', value: compare.modeLabel, precision: 0, unit: '' },
    { id: 'sampleRateMatch', label: 'サンプルレート一致', value: compare.sampleRateMatch ? 1 : 0, precision: 0, unit: compare.sampleRateMatch ? 'YES' : 'NO' },
    { id: 'sampleCountMatch', label: 'サンプル数一致', value: compare.sampleCountMatch ? 1 : 0, precision: 0, unit: compare.sampleCountMatch ? 'YES' : 'NO' },
    { id: 'lagMs', label: '推定ずれ', value: compare.lagMs, precision: 1, unit: 'ms' },
    { id: 'alignmentCorr', label: '整列相関', value: compare.alignedCorr, precision: 3, unit: '' },
    { id: 'nullDepth', label: '残差深度', value: compare.nullDepthDb, precision: 1, unit: 'dB' },
    { id: 'residualRms', label: '残差RMS', value: compare.residualRmsDb, precision: 2, unit: 'dBFS' },
    { id: 'levelMatchedResidual', label: 'RMS一致残差', value: compare.rmsMatchedResidualDb, precision: 2, unit: 'dBFS' },
    { id: 'diffRms', label: '差分RMS', value: compare.diffRmsDb, precision: 2, unit: 'dBFS' }
  ];
}
