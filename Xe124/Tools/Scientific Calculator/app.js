// File: app.js
// UI 統合制御。モード別計算とDesmosライク入力。

(function () {
  "use strict";
  const A=AST;

  let exprStr="";
  let mode="calc";

  const $=id=>document.getElementById(id);
  const exprLine=$("exprLine"), symbolicOut=$("symbolicOut"),
    decimalOut=$("decimalOut"), errOut=$("errOut"),
    precInput=$("precision"), xvalInput=$("xval");

  function renderExpr(){
    const shown=exprStr.replace(/sqrt/g,"√").replace(/pi/g,"π");
    exprLine.innerHTML=esc(shown)+'<span class="caret"></span>';
  }
  const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  function insert(t){ exprStr+=t; renderExpr(); }
  function backspace(){
    for(const tok of ['sqrt(','sqrt','sin(','cos(','tan(','ln(','log(','exp(','pi','π','√']){
      if(exprStr.endsWith(tok)){ exprStr=exprStr.slice(0,-tok.length); renderExpr(); return; }
    }
    exprStr=exprStr.slice(0,-1); renderExpr();
  }
  function clearAll(){
    exprStr=""; renderExpr();
    symbolicOut.textContent="—"; decimalOut.textContent="—"; errOut.textContent="";
  }

  function getPrec(){
    let p=parseInt(precInput.value,10);
    if(isNaN(p)||p<1) p=50; if(p>2000) p=2000; return p;
  }

  // x の評価値を固定小数点に（式入力可）
  function parseXVal(scale){
    const raw=xvalInput.value.trim();
    if(raw==="") return null;
    const ast=Parser.parse(raw);
    return Evaluator.evalFixed(ast,{},scale);
  }

  function showResult(symText,decText){
    symbolicOut.textContent=symText;
    decimalOut.textContent=decText;
  }

  function evaluate(){
    errOut.textContent="";
    if(exprStr.trim()===""){ showResult("—","—"); return; }
    const scale=getPrec();
    try{
      const ast=Parser.parse(exprStr);

      if(mode==="calc"){
        const s=A.simplify(ast);
        symbolicOut.textContent=A.toStr(s);
        const env={};
        const xv=parseXVal(scale);
        if(xv!==null) env['x']=xv;
        try{
          const val=Evaluator.evalFixed(s,env,scale);
          decimalOut.textContent=BigNum.fixedToString(val,scale);
        }catch(e){
          decimalOut.textContent="（変数を含むため x の評価値を指定してください）";
        }
      }

      else if(mode==="diff"){
        const v=$("diffVar").value||'x';
        const order=parseInt($("diffOrder").value,10)||1;
        const d=Calculus.nthDiff(ast,v,order);
        symbolicOut.textContent=A.toStr(d);
        const env={}; const xv=parseXVal(scale);
        if(xv!==null) env[v]=xv;
        try{ decimalOut.textContent=BigNum.fixedToString(Evaluator.evalFixed(d,env,scale),scale); }
        catch(e){ decimalOut.textContent="（"+v+" の評価値を指定すると数値表示）"; }
      }

      else if(mode==="integ"){
        const v=$("integVar").value||'x';
        const loRaw=$("integLo").value.trim(), hiRaw=$("integHi").value.trim();
        if(loRaw===""||hiRaw===""){
          // 不定積分
          const F=A.simplify(Calculus.integrate(ast,v));
          symbolicOut.textContent="∫ = "+A.toStr(F)+" + C";
          decimalOut.textContent="（不定積分：定数 C を含む）";
        }else{
          const lo=Evaluator.evalFixed(Parser.parse(loRaw),{},scale);
          const hi=Evaluator.evalFixed(Parser.parse(hiRaw),{},scale);
          const val=Evaluator.definiteIntegral(ast,v,lo,hi,scale);
          // 記号積分も試みる
          let symTxt;
          try{
            const F=A.simplify(Calculus.integrate(ast,v));
            symTxt="∫["+loRaw+","+hiRaw+"] = [ "+A.toStr(F)+" ]";
          }catch(e){ symTxt="定積分（数値法）"; }
          symbolicOut.textContent=symTxt;
          decimalOut.textContent=BigNum.fixedToString(val,scale);
        }
      }

      else if(mode==="sum"){
        const idx=$("sumIdx").value||'k';
        const lo=parseInt($("sumLo").value,10);
        const hi=parseInt($("sumHi").value,10);
        if(hi<lo) throw new Error("終了は開始以上に");
        if(hi-lo>200000) throw new Error("項数が多すぎます");
        // 厳密有理数で和を取れるか試行、無理ならば固定小数点
        let exact=true, accR=A.R(0n,1n);
        let accFixed=0n;
        for(let k=lo;k<=hi;k++){
          const env={}; 
          const sub=substituteVar(ast,idx,A.num(BigInt(k)));
          const simp=A.simplify(sub);
          if(simp.t==='num'&&exact){ accR=A.rAdd(accR,simp.r); }
          else { exact=false; accFixed+=Evaluator.evalFixed(simp,{},scale); }
        }
        if(exact){
          symbolicOut.textContent="Σ = "+A.ratStr(accR);
          const val=accR.n*BigNum.pow10(scale)/accR.d;
          decimalOut.textContent=BigNum.fixedToString(val,scale);
        }else{
          // 全項を固定小数点で再計算
          let total=0n;
          for(let k=lo;k<=hi;k++){
            const sub=substituteVar(ast,idx,A.num(BigInt(k)));
            total+=Evaluator.evalFixed(A.simplify(sub),{},scale);
          }
          symbolicOut.textContent="Σ_{"+idx+"="+lo+"}^{"+hi+"} （数値）";
          decimalOut.textContent=BigNum.fixedToString(total,scale);
        }
      }

      else if(mode==="ode"){
        const x0=Evaluator.evalFixed(Parser.parse($("odeX0").value),{},scale);
        const y0=Evaluator.evalFixed(Parser.parse($("odeY0").value),{},scale);
        const xend=Evaluator.evalFixed(Parser.parse($("odeXend").value),{},scale);
        const steps=parseInt($("odeSteps").value,10)||1000;
        const y=Evaluator.solveODE(ast,x0,y0,xend,steps,scale);
        symbolicOut.textContent="y'="+A.toStr(A.simplify(ast))+" の RK4 数値解";
        decimalOut.textContent="y("+$("odeXend").value+") ≈ "+BigNum.fixedToString(y,scale);
      }

      else if(mode==="laplace"){
        const dir=document.querySelector('input[name=lap]:checked').value;
        if(dir==="fwd"){
          const F=A.simplify(Laplace.forward(ast,'t'));
          symbolicOut.textContent="L[f(t)] = "+A.toStr(F);
          decimalOut.textContent="（s の関数）";
        }else{
          const f=A.simplify(Laplace.inverse(ast,'s'));
          symbolicOut.textContent="L⁻¹[F(s)] = "+A.toStr(f);
          decimalOut.textContent="（t の関数）";
        }
      }

    }catch(err){
      showResult("—","—");
      errOut.textContent="エラー: "+err.message;
    }
  }

  // 変数を式で置換
  function substituteVar(node,name,repl){
    switch(node.t){
      case 'num': case 'const': return A.clone(node);
      case 'var': return node.name===name?A.clone(repl):A.clone(node);
      case 'neg': return A.neg(substituteVar(node.x,name,repl));
      case 'func': return A.func(node.name,substituteVar(node.arg,name,repl));
      default: return {t:node.t,
        l:substituteVar(node.l,name,repl),
        r:substituteVar(node.r,name,repl)};
    }
  }

  // タブ切替
  document.querySelectorAll(".tab").forEach(tab=>{
    tab.addEventListener("click",()=>{
      document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
      tab.classList.add("active");
      mode=tab.dataset.mode;
      document.querySelectorAll(".mode-panel").forEach(p=>p.classList.add("hidden"));
      $("panel-"+mode).classList.remove("hidden");
    });
  });

  // キーパッド
  const keys=[
    {l:'7',a:()=>insert('7')},{l:'8',a:()=>insert('8')},{l:'9',a:()=>insert('9')},
    {l:'÷',c:'op',a:()=>insert('/')},{l:'sin',c:'fn',a:()=>insert('sin(')},
    {l:'cos',c:'fn',a:()=>insert('cos(')},{l:'tan',c:'fn',a:()=>insert('tan(')},
    {l:'ln',c:'fn',a:()=>insert('ln(')},

    {l:'4',a:()=>insert('4')},{l:'5',a:()=>insert('5')},{l:'6',a:()=>insert('6')},
    {l:'×',c:'op',a:()=>insert('*')},{l:'log',c:'fn',a:()=>insert('log(')},
    {l:'exp',c:'fn',a:()=>insert('exp(')},{l:'√',c:'fn',a:()=>insert('sqrt(')},
    {l:'x^n',c:'op',a:()=>insert('^')},

    {l:'1',a:()=>insert('1')},{l:'2',a:()=>insert('2')},{l:'3',a:()=>insert('3')},
    {l:'−',c:'op',a:()=>insert('-')},{l:'(',c:'fn',a:()=>insert('(')},
    {l:')',c:'fn',a:()=>insert(')')},{l:'x',c:'cst',a:()=>insert('x')},
    {l:'y',c:'cst',a:()=>insert('y')},

    {l:'0',a:()=>insert('0')},{l:'/',c:'op',a:()=>insert('/')},
    {l:'π',c:'cst',a:()=>insert('pi')},{l:'e',c:'cst',a:()=>insert('e')},
    {l:'+',c:'op',a:()=>insert('+')},{l:'t',c:'cst',a:()=>insert('t')},
    {l:'⌫',c:'clr',a:backspace},{l:'AC',c:'clr',a:clearAll},

    {l:'=',c:'eq',a:evaluate,span:8},
  ];
  const keypad=$("keypad");
  keys.forEach(k=>{
    const b=document.createElement("button");
    b.className="key"+(k.c?" "+k.c:"");
    b.textContent=k.l;
    if(k.span) b.style.gridColumn="span "+k.span;
    b.addEventListener("click",k.a);
    keypad.appendChild(b);
  });

  document.addEventListener("keydown",ev=>{
    const k=ev.key;
    if(k>='0'&&k<='9') insert(k);
    else if('+-*/^()'.includes(k)) insert(k);
    else if(/[a-z]/.test(k)) insert(k);
    else if(k==='Enter'){ ev.preventDefault(); evaluate(); }
    else if(k==='Backspace'){ ev.preventDefault(); backspace(); }
    else return;
  });

  renderExpr();
})();