// File: ScaleFunction_y.js
// XY平面で半径(音量)を 0..1 に正規化する表示スケール関数。
// ここを差し替えるだけでシステム全体の半径スケーリングが変わる。
// 順方向 scaleFunction_y: 音量(0以上) -> 0..1
// 逆関数 invScaleFunction: 0..1 -> 音量  (完全可逆 = 情報は失われない)

const ScaleFunction = (() => {

  // 曲率。大きいほど静かな部分を持ち上げて点分布を見やすくする(可逆な目盛り変更)。
  let K = 8.0;

  // 事前計算できる定数は数値として保持(効率化)
  let LOG_1K = Math.log(1 + K);
  let INV_LOG_1K = 1 / LOG_1K;

  function setK(k){
    K = k;
    LOG_1K = Math.log(1 + K);
    INV_LOG_1K = 1 / LOG_1K;
  }

  // 順: y = log(1 + K*x) / log(1+K)
  function scaleFunction_y(x){
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return Math.log(1 + K * x) * INV_LOG_1K;
  }

  // 逆: x = (exp(y*log(1+K)) - 1) / K
  function invScaleFunction(y){
    if (y <= 0) return 0;
    if (y >= 1) return 1;
    return (Math.exp(y * LOG_1K) - 1) / K;
  }

  return {
    scaleFunction_y, invScaleFunction, setK,
    get K(){ return K; }
  };
})();

if (typeof window !== 'undefined') window.ScaleFunction = ScaleFunction;