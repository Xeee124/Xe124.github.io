// File: symbolic.js
// 一般化シンボリックエンジン。
// 式 = 項の和(配列)。項 = { coeff: Rational, factors: Map(key -> {base, exp:Rational}) }
//   factor の base は既約な無理対象:
//     { kind:'rad', n:BigInt }                 → √n （n は平方因子を含まない >1 整数）
//     { kind:'pi' } / { kind:'e' }             → 超越数
//     { kind:'sqrtExpr', expr:[terms] }        → √(一般式)（簡約不能な根）
//   exp は Rational（√n は内部的に exp=1 固定で保持。pi^2 等は exp=整数）

const Sym = (function () {
  "use strict";

  /* ---------- 有理数 ---------- */
  function gcd(a, b) { a = a<0n?-a:a; b = b<0n?-b:b; while (b){[a,b]=[b,a%b];} return a; }
  function R(n, d) {
    n = BigInt(n); d = (d === undefined) ? 1n : BigInt(d);
    if (d === 0n) throw new Error("ゼロ除算");
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    return { n: n/g, d: d/g };
  }
  const rAdd = (a,b)=>R(a.n*b.d+b.n*a.d, a.d*b.d);
  const rSub = (a,b)=>R(a.n*b.d-b.n*a.d, a.d*b.d);
  const rMul = (a,b)=>R(a.n*b.n, a.d*b.d);
  function rDiv(a,b){ if(b.n===0n) throw new Error("ゼロ除算"); return R(a.n*b.d, a.d*b.n); }
  const rIsZero = a => a.n===0n;
  const rIsInt  = a => a.d===1n;
  const rNeg    = a => R(-a.n, a.d);

  /* ---------- 平方根の簡約 ---------- */
  function simplifyRadical(k) {
    let factor=1n, rest=k, i=2n;
    while (i*i <= rest) {
      const sq=i*i;
      while (rest % sq === 0n) { rest/=sq; factor*=i; }
      i+=1n;
    }
    return { factor, rest };
  }

  /* ---------- factor のキー化（同一因子判定） ---------- */
  function baseKey(base) {
    switch (base.kind) {
      case 'rad': return 'rad:' + base.n.toString();
      case 'pi':  return 'pi';
      case 'e':   return 'e';
      case 'sqrtExpr': return 'sqrtE:' + exprKey(base.expr);
    }
  }
  function exprKey(expr) {
    return expr.map(termKey).sort().join(' + ');
  }
  function termKey(t) {
    const fk = [...t.factors.values()]
      .map(f => baseKey(f.base) + '^' + f.exp.n + '/' + f.exp.d)
      .sort().join('*');
    return fk;
  }

  /* ---------- 項生成 ---------- */
  function newTerm(coeff) { return { coeff, factors: new Map() }; }

  // 項に factor を掛ける（指数を加算）。√系は kind 'rad' で exp は常に 1 とし、
  // 累乗は coeff 側へ吸収する設計（√n^2 = n）。
  function termMulFactor(term, base, exp) {
    if (base.kind === 'rad') {
      // exp は整数のみ（パーサが保証）。√n^exp を分解
      let e = exp; // Rational
      // 整数部と端数(0 or 1/2 的なものはここでは扱わない: exp は整数)
      const eInt = e.n / e.d; // 整数前提
      const whole = eInt / 2n;          // (√n)^2 = n
      const rem   = eInt % 2n;          // 0 or 1
      term.coeff = rMul(term.coeff, R(base.n ** (whole<0n? 0n: whole), 1n));
      if (whole < 0n) {
        // 負の指数 → 1/n^|whole|
        term.coeff = rMul(term.coeff, R(1n, base.n ** (-whole)));
      }
      if (rem !== 0n) {
        addRadFactor(term, base.n);
      }
      return;
    }
    // pi, e, sqrtExpr は指数を Map に累積
    const key = baseKey(base);
    if (term.factors.has(key)) {
      const f = term.factors.get(key);
      f.exp = rAdd(f.exp, exp);
      if (rIsZero(f.exp)) term.factors.delete(key);
    } else {
      if (!rIsZero(exp)) term.factors.set(key, { base, exp });
    }
  }

  function addRadFactor(term, n) {
    const { factor, rest } = simplifyRadical(n);
    term.coeff = rMul(term.coeff, R(factor, 1n));
    if (rest > 1n) {
      const key = 'rad:' + rest.toString();
      if (term.factors.has(key)) {
        // √rest * √rest = rest
        const f = term.factors.get(key);
        f.exp = rAdd(f.exp, R(1n,1n));
        if (f.exp.n >= 2n && f.exp.d === 1n) {
          const pairs = f.exp.n / 2n;
          term.coeff = rMul(term.coeff, R(rest ** pairs, 1n));
          f.exp = R(f.exp.n - 2n*pairs, 1n);
        }
        if (rIsZero(f.exp)) term.factors.delete(key);
      } else {
        term.factors.set(key, { base:{kind:'rad', n:rest}, exp:R(1n,1n) });
      }
    }
  }

  /* ---------- 正規化（同類項統合） ---------- */
  function normalize(terms) {
    const map = new Map();
    for (const t of terms) {
      if (rIsZero(t.coeff)) continue;
      const key = termKey(t);
      if (map.has(key)) {
        map.get(key).coeff = rAdd(map.get(key).coeff, t.coeff);
      } else {
        map.set(key, { coeff: t.coeff, factors: new Map(t.factors) });
      }
    }
    const out = [];
    for (const t of map.values()) if (!rIsZero(t.coeff)) out.push(t);
    if (out.length === 0) out.push(newTerm(R(0n,1n)));
    return out;
  }

  /* ---------- 構築子 ---------- */
  function fromInt(n){ return [newTerm(R(BigInt(n),1n))]; }
  function fromRational(n,d){ return [newTerm(R(n,d))]; }
  function piExpr(){ const t=newTerm(R(1n,1n)); termMulFactor(t,{kind:'pi'},R(1n,1n)); return [t]; }
  function eExpr(){ const t=newTerm(R(1n,1n)); termMulFactor(t,{kind:'e'},R(1n,1n)); return [t]; }

  /* ---------- 加減 ---------- */
  function add(A,B){ return normalize([...cloneE(A), ...cloneE(B)]); }
  function sub(A,B){
    const nb = cloneE(B).map(t=>({coeff:rNeg(t.coeff), factors:new Map(t.factors)}));
    return normalize([...cloneE(A), ...nb]);
  }
  function cloneE(E){ return E.map(t=>({coeff:t.coeff, factors:new Map(t.factors)})); }

  /* ---------- 乗算（一般の項×項） ---------- */
  function mulTerm(a, b) {
    const t = { coeff: rMul(a.coeff, b.coeff), factors: new Map() };
    for (const f of a.factors.values()) t.factors.set(baseKey(f.base), {base:f.base, exp:f.exp});
    for (const f of b.factors.values()) {
      const key = baseKey(f.base);
      if (t.factors.has(key)) {
        const e = t.factors.get(key);
        e.exp = rAdd(e.exp, f.exp);
        // √系の自乗整理
        if (f.base.kind === 'rad') {
          while (e.exp.d===1n && e.exp.n>=2n) {
            const pairs = e.exp.n/2n;
            t.coeff = rMul(t.coeff, R(f.base.n ** pairs,1n));
            e.exp = R(e.exp.n - 2n*pairs, 1n);
          }
        }
        if (rIsZero(e.exp)) t.factors.delete(key);
      } else {
        t.factors.set(key, {base:f.base, exp:f.exp});
      }
    }
    return t;
  }
  function mul(A,B){
    const out=[];
    for (const a of A) for (const b of B) out.push(mulTerm(a,b));
    return normalize(out);
  }

  /* ---------- 除算 ---------- */
  // 一般戦略:
  //  (1) 除数が単項 → 各因子の指数を反転して掛ける（pi^-1, √n は有理化）。
  //  (2) 除数が多項(例 1+√2) → 共役で有理化を反復（√因子が1種類なら成功）。
  //  (3) それでも残る場合 → 未評価の '商' として近似展開に委ねる（除算ノードを保持）。
  function reciprocalTerm(t) {
    // 1 / (coeff * Πfactor^exp)
    const out = newTerm(rDiv(R(1n,1n), t.coeff));
    for (const f of t.factors.values()) {
      if (f.base.kind === 'rad') {
        // 1/√n = √n / n
        out.coeff = rMul(out.coeff, R(1n, f.base.n));
        addRadFactor(out, f.base.n);
      } else {
        // pi^-exp 等
        out.factors.set(baseKey(f.base), {base:f.base, exp:rNeg(f.exp)});
      }
    }
    return out;
  }

  function isPureRational(E){ return E.length===1 && E[0].factors.size===0; }

  function div(A, B) {
    B = normalize(B);
    if (B.length === 1) {
      return normalize(A.map(a => mulTerm(a, reciprocalTerm(B[0]))));
    }
    // 多項の有理化: 単一の √rad 因子のみを含む2項なら共役で消去
    const radSet = new Set();
    let onlyRad = true;
    for (const t of B) {
      for (const f of t.factors.values()) {
        if (f.base.kind === 'rad' && f.exp.d===1n && f.exp.n===1n) radSet.add(f.base.n.toString());
        else onlyRad = false;
      }
    }
    if (onlyRad && radSet.size === 1 && B.length === 2) {
      // 共役 = (有理項) - (√項)
      const conj = B.map(t=>{
        const hasRad = [...t.factors.values()].some(f=>f.base.kind==='rad');
        return hasRad ? {coeff:rNeg(t.coeff), factors:new Map(t.factors)}
                      : {coeff:t.coeff, factors:new Map(t.factors)};
      });
      const denom = mul(B, conj);           // 有理数になるはず
      if (isPureRational(denom)) {
        const num = mul(A, conj);
        return div(num, denom);
      }
    }
    // 厳密化不能 → 未評価商ノードとして1項に包む
    const quotientFactor = { kind:'quotient', num: normalize(A), den: B };
    const t = newTerm(R(1n,1n));
    t.factors.set('quot:' + Math.random().toString(36).slice(2),
                  { base: quotientFactor, exp: R(1n,1n) });
    return [t];
  }

  /* ---------- べき乗 ---------- */
  function powInt(A, e) {
    if (e === 0) return fromInt(1n);
    if (e < 0) {
      const pos = powInt(A, -e);
      return div(fromInt(1n), pos);
    }
    let r = fromInt(1n);
    for (let i=0;i<e;i++) r = mul(r, A);
    return r;
  }

  // √(一般式)。簡約不能なら sqrtExpr 因子として保持。
  function sqrtExpr(E) {
    E = normalize(E);
    if (isPureRational(E)) {
      const r = E[0].coeff;
      if (r.n < 0n) throw new Error("負数の平方根は未対応");
      // √(n/d) = √(n d)/d
      const t = newTerm(R(1n, r.d));
      addRadFactor(t, r.n * r.d);
      return normalize([t]);
    }
    // 一般式の根 → sqrtExpr 因子
    const t = newTerm(R(1n,1n));
    t.factors.set('sqrtE:' + exprKey(E), { base:{kind:'sqrtExpr', expr:E}, exp:R(1n,1n) });
    return [t];
  }

  /* ---------- 表示 ---------- */
  function ratStr(r){ return r.d===1n ? r.n.toString() : r.n.toString()+"/"+r.d.toString(); }

  function baseStr(base) {
    switch (base.kind) {
      case 'rad': return "√" + base.n.toString();
      case 'pi':  return "π";
      case 'e':   return "e";
      case 'sqrtExpr': return "√(" + toString(base.expr) + ")";
      case 'quotient': return "(" + toString(base.num) + ")/(" + toString(base.den) + ")";
    }
  }
  function factorStr(f) {
    const b = baseStr(f.base);
    if (f.exp.d===1n && f.exp.n===1n) return b;
    if (f.exp.d===1n) return b + "^" + f.exp.n.toString();
    return b + "^(" + ratStr(f.exp) + ")";
  }
  function termStr(t) {
    const fs = [...t.factors.values()].map(factorStr);
    if (fs.length === 0) return ratStr(t.coeff);
    let pre = ratStr(t.coeff);
    const body = fs.join("·");
    if (t.coeff.d===1n && t.coeff.n===1n) return body;
    if (t.coeff.d===1n && t.coeff.n===-1n) return "-" + body;
    if (t.coeff.d!==1n) return "(" + pre + ")·" + body;
    return pre + "·" + body;
  }
  function toString(E) {
    E = normalize(E);
    let s = "";
    E.forEach((t,i)=>{
      const ts = termStr(t);
      if (i===0) s += ts;
      else if (ts.startsWith("-")) s += " − " + ts.slice(1);
      else s += " + " + ts;
    });
    return s;
  }

  /* ---------- 高精度10進展開 ---------- */
  function evalBaseFixed(base, scale) {
    const SCALE = BigNum.pow10(scale);
    switch (base.kind) {
      case 'rad': return BigNum.fixedSqrtRational(base.n, 1n, scale);
      case 'pi':  return BigNum.fixedPi(scale);
      case 'e':   return BigNum.fixedE(scale);
      case 'sqrtExpr': {
        const inner = evalExprFixed(base.expr, scale); // 固定小数点
        if (inner < 0n) throw new Error("負数の平方根（数値）");
        // √(inner/SCALE) を固定小数点に: √inner * √SCALE
        // = fixedSqrtRational(inner, SCALE) だが両方固定小数点なので:
        return BigNum.fixedSqrtRational(inner, SCALE, scale);
      }
      case 'quotient': {
        const num = evalExprFixed(base.num, scale);
        const den = evalExprFixed(base.den, scale);
        return BigNum.fdiv(num, den, scale);
      }
    }
  }
  function evalExprFixed(E, scale) {
    E = normalize(E);
    const SCALE = BigNum.pow10(scale);
    let acc = 0n;
    for (const t of E) {
      let val = SCALE; // 1.0
      for (const f of t.factors.values()) {
        let bf = evalBaseFixed(f.base, scale);
        // 指数（整数 or 1/2 等）。ここでは整数指数 + 1/d 乗を nthRoot で。
        if (f.exp.d === 1n) {
          const e = f.exp.n;
          if (e >= 0n) val = BigNum.fmul(val, BigNum.fpow(bf, Number(e), scale), scale);
          else val = BigNum.fdiv(val, BigNum.fpow(bf, Number(-e), scale), scale);
        } else {
          // 一般の有理指数: (bf)^(n/d) = nthRoot_d(bf^n)
          let p = BigNum.fpow(bf, Number(f.exp.n<0n?-f.exp.n:f.exp.n), scale);
          let root = BigNum.fixedNthRoot(p, Number(f.exp.d), scale);
          if (f.exp.n < 0n) val = BigNum.fdiv(val, root, scale);
          else val = BigNum.fmul(val, root, scale);
        }
      }
      // coeff
      val = val * t.coeff.n / t.coeff.d;
      acc += val;
    }
    return acc;
  }
  function toDecimal(E, scale) {
    return BigNum.fixedToString(evalExprFixed(E, scale), scale);
  }

  return {
    R, fromInt, fromRational, piExpr, eExpr,
    add, sub, mul, div, powInt, sqrtExpr,
    normalize, toString, toDecimal
  };
})();