// File: parser.js
// 再帰下降パーサ。AST を生成。小数入力は禁止（整数・分数のみ）。
// 暗黙乗算 (2x, 3sin(x)) 対応。多重指数 2^3^2 右結合。

const Parser = (function () {
  "use strict";

  const FUNCS=['sin','cos','tan','asin','acos','atan',
    'sinh','cosh','tanh','ln','log','exp','sqrt','abs'];

  function tokenize(src){
    const tk=[]; let i=0;
    const isD=c=>c>='0'&&c<='9';
    const isA=c=>(c>='a'&&c<='z')||(c>='A'&&c<='Z');
    while(i<src.length){
      const c=src[i];
      if(c===' '){ i++; continue; }
      if(c==='.') throw new Error("小数入力は禁止です。分数（例 1/3）で入力してください");
      if(isD(c)){
        let s=""; while(i<src.length&&isD(src[i])) s+=src[i++];
        if(src[i]==='.') throw new Error("小数入力は禁止です。分数で入力してください");
        tk.push({t:'num',v:s}); continue;
      }
      if(c==='√'){ tk.push({t:'func',v:'sqrt'}); i++; continue; }
      if(c==='π'){ tk.push({t:'const',v:'pi'}); i++; continue; }
      if('+-*/^()'.includes(c)){ tk.push({t:c}); i++; continue; }
      if(isA(c)){
        let s=""; while(i<src.length&&isA(src[i])) s+=src[i++];
        if(FUNCS.includes(s)) tk.push({t:'func',v:s});
        else if(s==='pi') tk.push({t:'const',v:'pi'});
        else if(s==='e') tk.push({t:'const',v:'e'});
        else {
          // 多文字は変数列として1文字ずつ（暗黙積）… ただし通常は1文字変数
          for(const ch of s) tk.push({t:'var',v:ch});
        }
        continue;
      }
      throw new Error("不明な文字: "+c);
    }
    return tk;
  }

  function parse(src){
    const tk=tokenize(src);
    let pos=0;
    const peek=()=>tk[pos];
    const next=()=>tk[pos++];

    const startsFactor=t=>t&&['num','var','const','func','('].includes(t.t);

    function expr(){
      let l=term();
      while(peek()&&(peek().t==='+'||peek().t==='-')){
        const op=next().t, r=term();
        l = op==='+'?AST.add(l,r):AST.sub(l,r);
      }
      return l;
    }
    function term(){
      let l=unary();
      while(true){
        const t=peek();
        if(t&&(t.t==='*'||t.t==='/')){
          next(); const r=unary();
          l = t.t==='*'?AST.mul(l,r):AST.div(l,r);
        } else if(startsFactor(t)){
          const r=unary(); l=AST.mul(l,r);
        } else break;
      }
      return l;
    }
    function unary(){
      if(peek()&&peek().t==='-'){ next(); return AST.neg(unary()); }
      if(peek()&&peek().t==='+'){ next(); return unary(); }
      return powExpr();
    }
    function powExpr(){
      let base=primary();
      if(peek()&&peek().t==='^'){
        next();
        const exp=unary(); // 右結合で何重でも
        base=AST.pow(base,exp);
      }
      return base;
    }
    function primary(){
      const t=peek();
      if(!t) throw new Error("式が途中で終了しています");
      if(t.t==='num'){ next(); return AST.num(BigInt(t.v)); }
      if(t.t==='const'){ next(); return AST.konst(t.v); }
      if(t.t==='var'){ next(); return AST.variable(t.v); }
      if(t.t==='func'){
        next();
        if(!peek()||peek().t!=='(') throw new Error(t.v+" の後は ( が必要です");
        next(); const arg=expr();
        if(!peek()||peek().t!==')') throw new Error(") が必要です");
        next();
        return AST.func(t.v,arg);
      }
      if(t.t==='('){
        next(); const e=expr();
        if(!peek()||peek().t!==')') throw new Error(") が必要です");
        next(); return e;
      }
      throw new Error("解析不能: "+t.t);
    }

    const r=expr();
    if(pos<tk.length) throw new Error("余分なトークンがあります");
    return r;
  }

  return { parse,FUNCS };
})();