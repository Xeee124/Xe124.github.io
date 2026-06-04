// File: laplace.js
// ラプラス変換・逆変換（変換表ベース）。

const Laplace = (function () {
  "use strict";
  const A=AST;

  // L[f(t)] : 基本パターンマッチ。結果は s の式(AST)。
  function forward(node,t){
    node=A.simplify(node);
    if(node.t==='add') return A.add(forward(node.l,t),forward(node.r,t));
    if(node.t==='sub') return A.sub(forward(node.l,t),forward(node.r,t));
    if(node.t==='neg') return A.neg(forward(node.x,t));
    // 定数倍
    if(node.t==='mul'){
      if(Calculus.isConstWrt(node.l,t)) return A.mul(A.clone(node.l),forward(node.r,t));
      if(Calculus.isConstWrt(node.r,t)) return A.mul(A.clone(node.r),forward(node.l,t));
    }
    const s=A.variable('s');
    // 定数 c → c/s
    if(Calculus.isConstWrt(node,t)) return A.div(A.clone(node),s);
    // t → 1/s²
    if(node.t==='var'&&node.name===t) return A.div(A.num(1n),A.pow(s,A.num(2n)));
    // t^n → n!/s^(n+1)
    if(node.t==='pow'&&node.l.t==='var'&&node.l.name===t&&node.r.t==='num'&&node.r.r.d===1n){
      const n=node.r.r.n;
      let fact=1n; for(let i=2n;i<=n;i++) fact*=i;
      return A.div(A.num(fact),A.pow(s,A.num(n+1n)));
    }
    // exp(a t) → 1/(s-a)
    if(node.t==='func'&&node.name==='exp'){
      const lin=linCoef(node.arg,t);
      if(lin!==null) return A.div(A.num(1n),A.sub(s,A.numR(lin)));
    }
    // sin(a t) → a/(s²+a²), cos(a t) → s/(s²+a²)
    if(node.t==='func'&&(node.name==='sin'||node.name==='cos')){
      const lin=linCoef(node.arg,t);
      if(lin!==null){
        const a=A.numR(lin);
        const den=A.add(A.pow(s,A.num(2n)),A.pow(A.clone(a),A.num(2n)));
        return node.name==='sin'?A.div(a,den):A.div(s,den);
      }
    }
    // sinh/cosh
    if(node.t==='func'&&(node.name==='sinh'||node.name==='cosh')){
      const lin=linCoef(node.arg,t);
      if(lin!==null){
        const a=A.numR(lin);
        const den=A.sub(A.pow(s,A.num(2n)),A.pow(A.clone(a),A.num(2n)));
        return node.name==='sinh'?A.div(a,den):A.div(s,den);
      }
    }
    throw new Error("この関数のラプラス変換は変換表にありません");
  }

  // a*t または t（係数1）の係数を返す
  function linCoef(node,t){
    if(node.t==='var'&&node.name===t) return A.R(1n,1n);
    if(node.t==='mul'){
      if(node.l.t==='num'&&node.r.t==='var'&&node.r.name===t) return node.l.r;
      if(node.r.t==='num'&&node.l.t==='var'&&node.l.name===t) return node.r.r;
    }
    if(node.t==='neg'){ const c=linCoef(node.x,t); return c?A.R(-c.n,c.d):null; }
    return null;
  }

  // 逆変換（代表的パターン）
  function inverse(node,s){
    node=A.simplify(node);
    if(node.t==='add') return A.add(inverse(node.l,s),inverse(node.r,s));
    if(node.t==='sub') return A.sub(inverse(node.l,s),inverse(node.r,s));
    if(node.t==='mul'){
      if(Calculus.isConstWrt(node.l,s)) return A.mul(A.clone(node.l),inverse(node.r,s));
      if(Calculus.isConstWrt(node.r,s)) return A.mul(A.clone(node.r),inverse(node.l,s));
    }
    const t=A.variable('t');
    // c/s → c
    if(node.t==='div'&&node.r.t==='var'&&node.r.name===s) return A.clone(node.l);
    // 1/s^n → t^(n-1)/(n-1)!
    if(node.t==='div'&&node.r.t==='pow'&&node.r.l.t==='var'&&node.r.l.name===s
        &&node.r.r.t==='num'&&node.r.r.r.d===1n){
      const n=node.r.r.r.n;
      let fact=1n; for(let i=2n;i<n;i++) fact*=i;
      return A.mul(A.clone(node.l),A.div(A.pow(t,A.num(n-1n)),A.num(fact)));
    }
    // 1/(s-a) → exp(a t)
    if(node.t==='div'&&A.isOne(A.simplify(node.l))&&node.r.t==='sub'
        &&node.r.l.t==='var'&&node.r.l.name===s&&node.r.r.t==='num'){
      return A.func('exp',A.mul(A.clone(node.r.r),t));
    }
    throw new Error("この式の逆ラプラス変換は変換表にありません");
  }

  return { forward,inverse };
})();