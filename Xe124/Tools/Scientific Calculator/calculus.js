// File: calculus.js
// 記号微分（完全）と記号/数値積分、Σ・数列。

const Calculus = (function () {
  "use strict";
  const A=AST;

  // ---- 記号微分 d/dvar ----
  function diff(node,v){
    switch(node.t){
      case 'num': case 'const': return A.num(0n);
      case 'var': return A.num(node.name===v?1n:0n);
      case 'neg': return A.neg(diff(node.x,v));
      case 'add': return A.add(diff(node.l,v),diff(node.r,v));
      case 'sub': return A.sub(diff(node.l,v),diff(node.r,v));
      case 'mul': // 積の微分
        return A.add(A.mul(diff(node.l,v),A.clone(node.r)),
                     A.mul(A.clone(node.l),diff(node.r,v)));
      case 'div': { // 商の微分
        const u=node.l,w=node.r;
        return A.div(
          A.sub(A.mul(diff(u,v),A.clone(w)),A.mul(A.clone(u),diff(w,v))),
          A.pow(A.clone(w),A.num(2n)));
      }
      case 'pow': {
        const f=node.l,g=node.r;
        // g が定数なら f^g => g*f^(g-1)*f'
        if(isConstWrt(g,v)){
          return A.mul(A.mul(A.clone(g),
                  A.pow(A.clone(f),A.sub(A.clone(g),A.num(1n)))),
                  diff(f,v));
        }
        if(isConstWrt(f,v)){
          // a^g => a^g * ln(a) * g'
          return A.mul(A.mul(A.pow(A.clone(f),A.clone(g)),
                  A.func('ln',A.clone(f))),diff(g,v));
        }
        // 一般: f^g = exp(g ln f) → (f^g)*(g' ln f + g f'/f)
        const inner=A.add(A.mul(diff(g,v),A.func('ln',A.clone(f))),
                          A.mul(A.clone(g),A.div(diff(f,v),A.clone(f))));
        return A.mul(A.pow(A.clone(f),A.clone(g)),inner);
      }
      case 'func': return diffFunc(node,v);
    }
    throw new Error("微分不能なノード");
  }

  function diffFunc(node,v){
    const u=node.arg, du=diff(u,v);
    const ch=(d)=>A.mul(d,du); // 連鎖律
    switch(node.name){
      case 'sin': return ch(A.func('cos',A.clone(u)));
      case 'cos': return ch(A.neg(A.func('sin',A.clone(u))));
      case 'tan': return ch(A.pow(A.func('sec',A.clone(u)),A.num(2n))); // sec²
      case 'exp': return ch(A.func('exp',A.clone(u)));
      case 'ln':  return ch(A.div(A.num(1n),A.clone(u)));
      case 'log': return ch(A.div(A.num(1n),A.mul(A.clone(u),A.func('ln',A.num(10n)))));
      case 'sqrt':return ch(A.div(A.num(1n),A.mul(A.num(2n),A.func('sqrt',A.clone(u)))));
      case 'sinh':return ch(A.func('cosh',A.clone(u)));
      case 'cosh':return ch(A.func('sinh',A.clone(u)));
      case 'tanh':return ch(A.sub(A.num(1n),A.pow(A.func('tanh',A.clone(u)),A.num(2n))));
      case 'asin':return ch(A.div(A.num(1n),A.func('sqrt',A.sub(A.num(1n),A.pow(A.clone(u),A.num(2n))))));
      case 'acos':return ch(A.neg(A.div(A.num(1n),A.func('sqrt',A.sub(A.num(1n),A.pow(A.clone(u),A.num(2n)))))));
      case 'atan':return ch(A.div(A.num(1n),A.add(A.num(1n),A.pow(A.clone(u),A.num(2n)))));
      case 'abs': return ch(A.div(A.clone(u),A.func('abs',A.clone(u))));
    }
    throw new Error(node.name+" の微分は未対応");
  }

  function isConstWrt(node,v){
    switch(node.t){
      case 'num': case 'const': return true;
      case 'var': return node.name!==v;
      case 'neg': return isConstWrt(node.x,v);
      case 'func': return isConstWrt(node.arg,v);
      default: return isConstWrt(node.l,v)&&isConstWrt(node.r,v);
    }
  }

  function nthDiff(node,v,n){
    let r=node;
    for(let i=0;i<n;i++) r=A.simplify(diff(r,v));
    return r;
  }

  // ---- 記号不定積分（パターンマッチ：基本形のみ） ----
  function integrate(node,v){
    node=A.simplify(node);
    // 線形性
    if(node.t==='add') return A.add(integrate(node.l,v),integrate(node.r,v));
    if(node.t==='sub') return A.sub(integrate(node.l,v),integrate(node.r,v));
    if(node.t==='neg') return A.neg(integrate(node.x,v));
    // 定数 c → c*x
    if(isConstWrt(node,v)) return A.mul(A.clone(node),A.variable(v));
    // 定数*f
    if(node.t==='mul'){
      if(isConstWrt(node.l,v)) return A.mul(A.clone(node.l),integrate(node.r,v));
      if(isConstWrt(node.r,v)) return A.mul(A.clone(node.r),integrate(node.l,v));
    }
    if(node.t==='div'&&isConstWrt(node.r,v)) return A.div(integrate(node.l,v),A.clone(node.r));
    // x^n  (n≠-1)
    if(node.t==='var'&&node.name===v) // ∫x dx = x²/2
      return A.div(A.pow(A.variable(v),A.num(2n)),A.num(2n));
    if(node.t==='pow'&&node.l.t==='var'&&node.l.name===v&&node.r.t==='num'){
      const n=node.r.r;
      if(!(n.n===-1n&&n.d===1n)){
        const np1=A.rAdd(n,A.R(1n,1n));
        return A.div(A.pow(A.variable(v),A.numR(np1)),A.numR(np1));
      }
      return A.func('ln',A.func('abs',A.variable(v))); // ∫x⁻¹=ln|x|
    }
    // 1/x
    if(node.t==='div'&&A.isOne(A.simplify(node.l))&&node.r.t==='var'&&node.r.name===v)
      return A.func('ln',A.func('abs',A.variable(v)));
    // 基本関数 f(x) （引数が x のもの）
    if(node.t==='func'&&node.arg.t==='var'&&node.arg.name===v){
      switch(node.name){
        case 'sin': return A.neg(A.func('cos',A.variable(v)));
        case 'cos': return A.func('sin',A.variable(v));
        case 'exp': return A.func('exp',A.variable(v));
        case 'sinh':return A.func('cosh',A.variable(v));
        case 'cosh':return A.func('sinh',A.variable(v));
        case 'ln': // ∫ln x = x ln x - x
          return A.sub(A.mul(A.variable(v),A.func('ln',A.variable(v))),A.variable(v));
      }
    }
    // exp(a x), sin(a x) など線形引数
    if(node.t==='func'&&node.arg.t==='mul'){
      // 線形 a*x 判定
      const lin=linearCoeff(node.arg,v);
      if(lin){
        const {a}=lin;
        const inv=A.div(A.num(1n),A.numR(a));
        switch(node.name){
          case 'sin': return A.mul(inv,A.neg(A.func('cos',A.clone(node.arg))));
          case 'cos': return A.mul(inv,A.func('sin',A.clone(node.arg)));
          case 'exp': return A.mul(inv,A.func('exp',A.clone(node.arg)));
        }
      }
    }
    throw new Error("この式の不定積分は閉形式で求められません（定積分なら数値計算可能）");
  }

  // a*x の形なら係数 a(有理数)を返す
  function linearCoeff(node,v){
    if(node.t==='mul'){
      if(node.l.t==='num'&&node.r.t==='var'&&node.r.name===v) return {a:node.l.r};
      if(node.r.t==='num'&&node.l.t==='var'&&node.l.name===v) return {a:node.r.r};
    }
    return null;
  }

  return { diff,nthDiff,integrate,isConstWrt };
})();