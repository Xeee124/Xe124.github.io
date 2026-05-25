
import { rms, toDb } from './Delta_core.js';

export const category = '位相(左右)';

export function analyzePhaseLR(proc) {
  const { left, right } = proc;
  const len = Math.min(left.length, right.length);
  let sumL = 0, sumR = 0;
  for (let i = 0; i < len; i++) {
    sumL += left[i];
    sumR += right[i];
  }
  const meanL = sumL / (len || 1);
  const meanR = sumR / (len || 1);

  let num = 0, denL = 0, denR = 0;
  let midSq = 0, sideSq = 0;
  let invNum = 0;

  for (let i = 0; i < len; i++) {
    const a = left[i] - meanL;
    const b = right[i] - meanR;
    num += a * b;
    denL += a * a;
    denR += b * b;
    const m = (left[i] + right[i]) * 0.5;
    const s = (left[i] - right[i]) * 0.5;
    midSq += m * m;
    sideSq += s * s;
    invNum += a * (-b);
  }

  const corr = num / Math.sqrt(denL * denR + 1e-12);
  const corrInv = invNum / Math.sqrt(denL * denR + 1e-12);
  const widthLin = Math.sqrt((sideSq + 1e-12) / (midSq + 1e-12));
  const widthDb = toDb(Math.sqrt(sideSq / Math.max(midSq, 1e-12)));
  const phaseAngle = Math.acos(Math.max(-1, Math.min(1, corr))) * 180 / Math.PI;
  const balance = toDb(Math.sqrt(denL / Math.max(denR, 1e-12)));

  return [
    { id: 'corr', label: 'L/R相関', value: corr, precision: 3, unit: '' },
    { id: 'widthLin', label: 'ステレオ幅(線形)', value: widthLin, precision: 3, unit: '' },
    { id: 'widthDb', label: 'ステレオ幅(dB)', value: widthDb, precision: 2, unit: 'dB' },
    { id: 'phaseAngle', label: '位相角(相関由来)', value: phaseAngle, precision: 1, unit: '°' },
    { id: 'invertCorr', label: '反転相関', value: corrInv, precision: 3, unit: '' },
    { id: 'lrBalance', label: 'L/Rバランス', value: balance, precision: 2, unit: 'dB' }
  ];
}
