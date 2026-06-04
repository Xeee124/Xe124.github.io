// File: evaluator.js
// AST の高精度数値評価（BigInt固定小数点）と定積分・ODE数値解。

const Evaluator = (function () {
  "use strict";
  const A=AST;

  // 環境: 変数名 → 固定小数点BigInt(値/10^scale)
  // すべての中間値を固定小数点(scale桁)で扱う。
  function evalFixed(node,env,scale){
    const ONE=BigNum.pow10(scale);
    switch(node.t){
      case 'num': return node.r.n*ONE/node.r.d;
      case 'const':
        if(node.name==='pi') return BigNum.fixedPi(scale);
        if(node.name==='e') return BigNum.fixedE(scale);
        break;
      case 'var':
        if(env[node.name]===undefined) throw new Error("変数 "+node.name+" の値が未指定です");
        return env[node.name];
      case 'neg': return -evalFixed(node.x,env,scale);
      case 'add': return evalFixed(node.l,env,scale)+evalFixed(node.r,env,scale);
      case 'sub': return evalFixed(node.l,env,scale)-evalFixed(node.r,env,scale);
      case 'mul': return evalFixed(node.l,env,scale)*evalFixed(node.r,env,scale)/ONE;
      case 'div': {
        const d=evalFixed(node.r,env,scale);
        if(d===0n) throw new Error("ゼロ除算");
        return evalFixed(node.l,env,scale)*ONE/d;
      }
      case 'pow': {
        const b=evalFixed(node.l,env,scale);
        // 整数指数は厳密反復
        if(node.r.t==='num'&&node.r.r.d===1n){
          let e=node.r.r.n, neg=e<0n; if(neg) e=-e;
          let acc=ONE;
          for(let i=0n;i<e;i++) acc=acc*b/ONE;
          return neg?ONE*ONE/acc:acc;
        }
        // 一般 b^e = exp(e*ln b)
        const lb=lnFixed(b,scale);
        const ex=evalFixed(node.r,env,scale);
        return BigNum.fixedExp(ex*lb/ONE,scale);
      }
      case 'func': return evalFunc(node,env,scale);
    }
    throw new Error("評価不能ノード");
  }

  function lnFixed(xFixed,scale){
    // 固定小数点 x>0 を有理近似して ln。x ≈ xFixed/10^scale
    if(xFixed<=0n) throw new Error("対数は正の数のみ");
    return BigNum.fixedLnRational(xFixed,BigNum.pow10(scale),scale);
  }

  function evalFunc(node,env,scale){
    const ONE=BigNum.pow10(scale);
    const x=evalFixed(node.arg,env,scale);
    switch(node.name){
      case 'exp': return BigNum.fixedExp(x,scale);
      case 'ln':  return lnFixed(x,scale);
      case 'log': return lnFixed(x,scale)*ONE/lnFixed(10n*ONE,scale);
      case 'sqrt':{
        if(x<0n) throw new Error("負数の平方根");
        return BigNum.fixedSqrtRational(x,ONE,scale);
      }
      case 'abs': return x<0n?-x:x;
      case 'sin': return trigSin(x,scale);
      case 'cos': return trigCos(x,scale);
      case 'tan': {
        const c=trigCos(x,scale);
        if(c===0n) throw new Error("tan発散");
        return trigSin(x,scale)*ONE/c;
      }
      case 'sinh':{
        const ex=BigNum.fixedExp(x,scale);
        return (ex-ONE*ONE/ex)/2n;
      }
      case 'cosh':{
        const ex=BigNum.fixedExp(x,scale);
        return (ex+ONE*ONE/ex)/2n;
      }
      case 'tanh':{
        const ex=BigNum.fixedExp(2n*x,scale);
        return (ex-ONE)*ONE/(ex+ONE);
      }
      case 'atan': return atanFixed(x,scale);
      case 'asin': {
        // asin(x)=atan(x/sqrt(1-x²))
        const x2=x*x/ONE;
        const denom=BigNum.fixedSqrtRational(ONE-x2,ONE,scale);
        return atanFixed(x*ONE/denom,scale);
      }
      case 'acos': {
        const half=BigNum.fixedPi(scale)/2n;
        const x2=x*x/ONE;
        const denom=BigNum.fixedSqrtRational(ONE-x2,ONE,scale);
        return half-atanFixed(x*ONE/denom,scale);
      }
    }
    throw new Error(node.name+" は数値評価未対応");
  }

  // sin/cos 級数（範囲縮小: 2π剰余）
  function trigReduce(x,scale){
    const ONE=BigNum.pow10(scale);
    const twoPi=2n*BigNum.fixedPi(scale);
    let r=x%twoPi;
    if(r>twoPi/2n) r-=twoPi;
    if(r<-twoPi/2n) r+=twoPi;
    return r;
  }
  function trigSin(x,scale){
    const ONE=BigNum.pow10(scale);
    let r=trigReduce(x,scale);
    let term=r, sum=r, n=1n;
    const r2=r*r/ONE;
    while(term!==0n){
      term=-term*r2/ONE;
      term=term/((2n*n)*(2n*n+1n));
      sum+=term; n++;
      if(n>5000n) break;
    }
    return sum;
  }
  function trigCos(x,scale){
    const ONE=BigNum.pow10(scale);
    let r=trigReduce(x,scale);
    let term=ONE, sum=ONE, n=1n;
    const r2=r*r/ONE;
    while(term!==0n){
      term=-term*r2/ONE;
      term=term/((2n*n-1n)*(2n*n));
      sum+=term; n++;
      if(n>5000n) break;
    }
    return sum;
  }
  function atanFixed(x,scale){
    const ONE=BigNum.pow10(scale);
    // |x|>1 は atan(x)=pi/2 - atan(1/x)
    let neg=x<0n; let ax=neg?-x:x;
    let big=ax>ONE;
    let v=big?ONE*ONE/ax:ax;
    let term=v,sum=v,n=1n; const v2=v*v/ONE; let sign=-1n;
    while(term!==0n){
      term=term*v2/ONE;
      sum+=sign*term/(2n*n+1n); sign=-sign; n++;
      if(n>20000n) break;
    }
    let res=sum;
    if(big) res=BigNum.fixedPi(scale)/2n-res;
    return neg?-res:res;
  }

  // ---- 定積分（適応シンプソン, 固定小数点） ----
  function definiteIntegral(node,v,lo,hi,scale){
    const ONE=BigNum.pow10(scale);
    const N=2000n; // 偶数分割
    const h=(hi-lo)/N;
    const f=(xf)=>{ const env={}; env[v]=xf; return evalFixed(node,env,scale); };
    let sum=f(lo)+f(hi);
    for(let i=1n;i<N;i++){
      const xf=lo+h*i;
      sum+= (i%2n===1n?4n:2n)*f(xf);
    }
    return sum*h/3n;
  }

  // ---- ODE: y'=f(x,y) を RK4（固定小数点） ----
  function solveODE(fnode,x0,y0,xend,steps,scale){
    const ONE=BigNum.pow10(scale);
    const n=BigInt(steps);
    const h=(xend-x0)/n;
    let x=x0,y=y0;
    const f=(xf,yf)=>{ const env={x:xf,y:yf}; return evalFixed(fnode,env,scale); };
    for(let i=0n;i<n;i++){
      const k1=f(x,y);
      const k2=f(x+h/2n,y+h*k1/2n/ONE);
      const k3=f(x+h/2n,y+h*k2/2n/ONE);
      const k4=f(x+h,y+h*k3/ONE);
      y=y+h*(k1+2n*k2+2n*k3+k4)/6n/ONE;
      x=x+h;
    }
    return y;
  }

  return { evalFixed,definiteIntegral,solveODE };
})();