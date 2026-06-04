// File: ast.js
// 抽象構文木(AST)。あらゆる式を木として保持し記号的に扱う。
// ノード種別:
//  num  : 厳密有理数 {n:BigInt,d:BigInt}
//  var  : 変数 {name}
//  const: 'pi'|'e'
//  add/sub/mul/div/pow : 二項 {l,r}
//  neg  : 単項
//  func : {name:'sin','cos','tan','ln','log','exp','sqrt', arg}
//  call はparserで生成

const AST = (function () {
  "use strict";

  function gcd(a,b){ a=a<0n?-a:a; b=b<0n?-b:b; while(b){ [a,b]=[b,a%b]; } return a; }

  function R(n,d){
    n=BigInt(n); d=BigInt(d===undefined?1n:d);
    if(d===0n) throw new Error("ゼロ除算");
    if(d<0n){ n=-n; d=-d; }
    const g=gcd(n,d)||1n;
    return {n:n/g,d:d/g};
  }
  const rAdd=(a,b)=>R(a.n*b.d+b.n*a.d,a.d*b.d);
  const rSub=(a,b)=>R(a.n*b.d-b.n*a.d,a.d*b.d);
  const rMul=(a,b)=>R(a.n*b.n,a.d*b.d);
  const rDiv=(a,b)=>{ if(b.n===0n) throw new Error("ゼロ除算"); return R(a.n*b.d,a.d*b.n); };

  // コンストラクタ
  const num=(n,d)=>({t:'num',r:R(n,d)});
  const numR=(r)=>({t:'num',r});
  const variable=(name)=>({t:'var',name});
  const konst=(name)=>({t:'const',name});
  const add=(l,r)=>({t:'add',l,r});
  const sub=(l,r)=>({t:'sub',l,r});
  const mul=(l,r)=>({t:'mul',l,r});
  const div=(l,r)=>({t:'div',l,r});
  const pow=(l,r)=>({t:'pow',l,r});
  const neg=(x)=>({t:'neg',x});
  const func=(name,arg)=>({t:'func',name,arg});

  function isNum(n){ return n.t==='num'; }
  function isZero(n){ return n.t==='num'&&n.r.n===0n; }
  function isOne(n){ return n.t==='num'&&n.r.n===1n&&n.r.d===1n; }

  // ---- 簡約（同類項・約分・恒等式適用） ----
  function simplify(node){
    if(!node) return node;
    switch(node.t){
      case 'num': case 'var': case 'const': return node;
      case 'neg': {
        const x=simplify(node.x);
        if(isNum(x)) return numR(R(-x.r.n,x.r.d));
        if(x.t==='neg') return x.x;
        return neg(x);
      }
      case 'add': {
        const l=simplify(node.l), r=simplify(node.r);
        if(isNum(l)&&isNum(r)) return numR(rAdd(l.r,r.r));
        if(isZero(l)) return r;
        if(isZero(r)) return l;
        return add(l,r);
      }
      case 'sub': {
        const l=simplify(node.l), r=simplify(node.r);
        if(isNum(l)&&isNum(r)) return numR(rSub(l.r,r.r));
        if(isZero(r)) return l;
        if(isZero(l)) return simplify(neg(r));
        return sub(l,r);
      }
      case 'mul': {
        const l=simplify(node.l), r=simplify(node.r);
        if(isNum(l)&&isNum(r)) return numR(rMul(l.r,r.r));
        if(isZero(l)||isZero(r)) return num(0n);
        if(isOne(l)) return r;
        if(isOne(r)) return l;
        return mul(l,r);
      }
      case 'div': {
        const l=simplify(node.l), r=simplify(node.r);
        if(isNum(l)&&isNum(r)) return numR(rDiv(l.r,r.r));
        if(isZero(l)) return num(0n);
        if(isOne(r)) return l;
        return div(l,r);
      }
      case 'pow': {
        const l=simplify(node.l), r=simplify(node.r);
        if(isNum(l)&&isNum(r)&&r.r.d===1n){
          // 整数べきは厳密展開
          const e=r.r.n;
          if(e>=0n){
            let acc=R(1n,1n);
            for(let i=0n;i<e;i++) acc=rMul(acc,l.r);
            return numR(acc);
          }else{
            let acc=R(1n,1n);
            for(let i=0n;i<-e;i++) acc=rMul(acc,l.r);
            return numR(rDiv(R(1n,1n),acc));
          }
        }
        if(isZero(r)) return num(1n);
        if(isOne(r)) return l;
        return pow(l,r);
      }
      case 'func': {
        const a=simplify(node.arg);
        return func(node.name,a);
      }
    }
    return node;
  }

  // ---- 文字列化 ----
  const PREC={num:5,var:5,const:5,func:5,neg:4,pow:4,mul:3,div:3,add:2,sub:2};
  function ratStr(r){ return r.d===1n? r.n.toString() : r.n+"/"+r.d; }
  function toStr(node,parentPrec=0){
    let s, p=PREC[node.t]||5;
    switch(node.t){
      case 'num': s=ratStr(node.r); break;
      case 'var': s=node.name; break;
      case 'const': s=node.name==='pi'?'π':'e'; break;
      case 'neg': s='−'+toStr(node.x,4); break;
      case 'add': s=toStr(node.l,2)+' + '+toStr(node.r,2); break;
      case 'sub': s=toStr(node.l,2)+' − '+toStr(node.r,3); break;
      case 'mul': s=toStr(node.l,3)+'·'+toStr(node.r,3); break;
      case 'div': s=toStr(node.l,3)+'/'+toStr(node.r,4); break;
      case 'pow': s=toStr(node.l,5)+'^'+toStr(node.r,4); break;
      case 'func': {
        const nm=node.name==='ln'?'ln':node.name;
        s=nm+'('+toStr(node.arg,0)+')'; break;
      }
    }
    if(p<parentPrec) return '('+s+')';
    return s;
  }

  // 構造の深いコピー
  function clone(n){
    if(n.t==='num') return numR(R(n.r.n,n.r.d));
    if(n.t==='var') return variable(n.name);
    if(n.t==='const') return konst(n.name);
    if(n.t==='neg') return neg(clone(n.x));
    if(n.t==='func') return func(n.name,clone(n.arg));
    return {t:n.t,l:clone(n.l),r:clone(n.r)};
  }

  return { R,rAdd,rSub,rMul,rDiv,
    num,numR,variable,konst,add,sub,mul,div,pow,neg,func,
    isNum,isZero,isOne,simplify,toStr,ratStr,clone };
})();