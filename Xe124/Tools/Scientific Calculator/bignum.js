// File: bignum.js
// BigInt 固定小数点高精度演算。Number の四則は一切使わない。

const BigNum = (function () {
  "use strict";

  function abs(b){ return b<0n?-b:b; }

  function pow10(n){
    let r=1n, base=10n, e=BigInt(n);
    while(e>0n){ if(e&1n) r*=base; base*=base; e>>=1n; }
    return r;
  }

  function isqrt(n){
    if(n<0n) throw new Error("負数の平方根");
    if(n<2n) return n;
    let x=n, y=(x+1n)>>1n;
    while(y<x){ x=y; y=(x+n/x)>>1n; }
    return x;
  }

  // sqrt(num/den) を scale 桁固定小数点で
  function fixedSqrtRational(num,den,scale){
    const guard=5n;
    const sc=BigInt(scale)+guard;
    const inside=num*pow10(Number(2n*sc))/den;
    let r=isqrt(inside);
    return r/pow10(Number(guard));
  }

  // π (マチンの公式)
  function fixedPi(scale){
    const guard=12n, sc=Number(BigInt(scale)+guard), ONE=pow10(sc);
    function arctanInv(x){
      const xb=BigInt(x), x2=xb*xb;
      let term=ONE/xb, sum=term, k=1n, sign=-1n;
      while(term!==0n){ term=term/x2; sum+=sign*term/(2n*k+1n); sign=-sign; k++; }
      return sum;
    }
    return (16n*arctanInv(5)-4n*arctanInv(239))/pow10(Number(guard));
  }

  // e
  function fixedE(scale){
    const guard=12n, sc=Number(BigInt(scale)+guard), ONE=pow10(sc);
    let term=ONE, sum=ONE, n=1n;
    while(term!==0n){ term=term/n; sum+=term; n++; }
    return sum/pow10(Number(guard));
  }

  // ln を固定小数点で。x>0 の有理数 num/den。
  // atanh級数: ln(y)=2*sum( ((y-1)/(y+1))^(2k+1)/(2k+1) )
  // 収束加速のため y を [2/3,3/2] に正規化（2のべきを括り出す）。
  function fixedLnRational(num,den,scale){
    if(num<=0n||den<=0n) throw new Error("対数は正の数のみ");
    const guard=15n, sc=Number(BigInt(scale)+guard), ONE=pow10(sc);
    // value = num/den。 2^p で正規化: ln(v)=ln(v/2^p)+p*ln2
    // まず v を固定小数点に
    let v = num*ONE/den;        // v*ONE
    const ln2 = fixedLn2(sc, ONE);
    let p=0n;
    const HI = 3n*ONE/2n, LO=2n*ONE/3n;
    while(v>HI){ v=v/2n; p++; }
    while(v<LO){ v=v*2n; p--; }
    // atanh級数  u=(v-1)/(v+1)
    const num2=(v-ONE), den2=(v+ONE);
    let u=num2*ONE/den2;            // u*ONE
    const u2=u*u/ONE;
    let term=u, sum=u, k=1n;
    while(term!==0n){
      term=term*u2/ONE;
      sum+=term/(2n*k+1n);
      k++;
    }
    let ln=2n*sum + p*ln2;
    return ln/pow10(Number(guard));
  }
  function fixedLn2(sc,ONE){
    // ln2 via atanh u=1/3
    let u=ONE/3n, u2=u*u/ONE, term=u, sum=u, k=1n;
    while(term!==0n){ term=term*u2/ONE; sum+=term/(2n*k+1n); k++; }
    return 2n*sum;
  }

  // exp(x) 固定小数点。x は固定小数点 BigInt(値=x/ONE)。
  function fixedExp(xFixed, scale){
    const guard=15n, sc=Number(BigInt(scale)+guard), ONE=pow10(sc);
    // 入力を sc にスケール調整
    let x = xFixed*ONE/pow10(scale);
    let term=ONE, sum=ONE, n=1n;
    // 範囲縮小: x = k*ln2 + r → exp(x)=2^k * exp(r)
    const ln2=fixedLn2(sc,ONE);
    let k = x/ln2;
    let r = x - k*ln2;
    term=ONE; sum=ONE; n=1n;
    while(term!==0n){ term=term*r/(ONE*n); n++; if(n>5000n) break; }
    // 上の縮約で改めて計算
    term=ONE; sum=ONE; n=1n;
    while(term!==0n){ term=term*r/(ONE*n); sum+=term; n++; if(n>5000n) break; }
    // 2^k 掛ける（k は BigInt）
    if(k>=0n) sum=sum*(2n**k);
    else sum=sum/(2n**(-k));
    return sum/pow10(Number(guard));
  }

  // 文字列化
  function fixedToString(v,scale){
    const neg=v<0n; let a=abs(v);
    const denom=pow10(scale);
    const ip=a/denom, fp=a%denom;
    let out=ip.toString();
    if(scale>0) out+="."+fp.toString().padStart(scale,"0");
    return (neg?"-":"")+out;
  }

  return { abs,pow10,isqrt,fixedSqrtRational,fixedPi,fixedE,
    fixedLnRational,fixedExp,fixedToString };
})();