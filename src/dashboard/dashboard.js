/* ============================================================================
 * ENGINE + UI
 *
 * Reads every model figure from assumptions.js — do not hardcode model numbers
 * here. Contains the quarterly P&L / balance-sheet engine, the charts, and the
 * comments UI. The build concatenates this after assumptions.js inside a single
 * IIFE, so the constants declared there are in scope.
 * ==========================================================================*/

function computeModel(inputs) {
  const { gw, rateTable, spotTable, capexGWTable, mode, longTermRate, convergenceYears } = inputs;
  const f = FIXED;
  const out = { quarters: Q, space:{}, connectivity:{}, ai:{}, total:{}, bs:{} };

  const spRev=[], spCogs=[], spRnd=[], spSga=[], spOpInc=[], spCapex=[];
  let prevSp = f.space.revQ226A;
  for (let t=0;t<N;t++){
    const rev = prevSp*(1+f.space.revGrowth[t]);
    spRev.push(rev);
    spCogs.push(rev*f.space.cogsPct[t]);
    spRnd.push(rev*f.space.rndPct[t]);
    spSga.push(rev*f.space.sgaPct[t]);
    spOpInc.push(rev - spCogs[t]-spRnd[t]-spSga[t]);
    spCapex.push(rev*f.space.capexPct[t]);
    prevSp = rev;
  }
  out.space = {revenue:spRev, cogs:spCogs, rnd:spRnd, sga:spSga, opInc:spOpInc, capex:spCapex};

  const coSubs=[], coConsumerRev=[], coEntGovRev=[], coRev=[], coCogs=[], coRnd=[], coSga=[], coOpInc=[], coCapex=[];
  let prevSubs = f.connectivity.subsQ226A, prevEntGov = f.connectivity.entGovQ226A;
  for (let t=0;t<N;t++){
    const subs = prevSubs + f.connectivity.subAdds[t];
    coSubs.push(subs);
    const consumer = subs*f.connectivity.arpu[t]*3;
    coConsumerRev.push(consumer);
    const entgov = prevEntGov*(1+f.connectivity.entGovGrowth[t]);
    coEntGovRev.push(entgov);
    const rev = consumer+entgov;
    coRev.push(rev);
    coCogs.push(rev*f.connectivity.cogsPct[t]);
    coRnd.push(rev*f.connectivity.rndPct[t]);
    coSga.push(rev*f.connectivity.sgaPct[t]);
    coOpInc.push(rev - coCogs[t]-coRnd[t]-coSga[t]);
    coCapex.push(rev*f.connectivity.capexPct[t]);
    prevSubs = subs; prevEntGov = entgov;
  }
  out.connectivity = {revenue:coRev, cogs:coCogs, rnd:coRnd, sga:coSga, opInc:coOpInc, capex:coCapex, subs:coSubs};

  const monetizable = f.ai.monetizable;
  const nameplate = gw;
  const revGenGW = nameplate.map((g,t)=>g*monetizable[t]);
  const infraRev = new Array(N).fill(0);
  const effRate = new Array(N).fill(0);
  const incrementalGW = new Array(N).fill(0);

  let prevNameplate = f.ai.nameplateQ226A;
  for (let t=0;t<N;t++){
    incrementalGW[t] = Math.max(0, nameplate[t]-prevNameplate);
    prevNameplate = nameplate[t];
  }

  if (mode === 'longterm') {
    for (let t=0;t<N;t++){
      infraRev[t] = revGenGW[t]*rateTable[t];
      effRate[t] = rateTable[t];
    }
  } else {
    const convQ = Math.max(1, convergenceYears*4);
    const vintages = [{origin:-1, size:f.ai.nameplateQ226A, price0:longTermRate}];
    for (let t=0;t<N;t++){
      if (incrementalGW[t] > 1e-9) vintages.push({origin:t, size:incrementalGW[t], price0:spotTable[t]});
      let weightedRevSum = 0, sizeSum = 0;
      for (const v of vintages){
        if (v.origin > t) continue;
        const age = t - v.origin;
        const frac = Math.min(1, age/convQ);
        const price = v.price0 + (longTermRate - v.price0)*frac;
        weightedRevSum += v.size*price;
        sizeSum += v.size;
      }
      const blendedRate = sizeSum>0 ? weightedRevSum/sizeSum : longTermRate;
      effRate[t] = blendedRate;
      infraRev[t] = revGenGW[t]*blendedRate;
    }
  }

  const aiAdvRev = [];
  let prevAd = f.ai.adQ226A;
  for (let t=0;t<N;t++){ const v = prevAd*(1+f.ai.adGrowth[t]); aiAdvRev.push(v); prevAd = v; }

  const aiRev=[], aiCogs=[], aiRnd=[], aiSga=[], aiOpInc=[], aiCapex=[];
  for (let t=0;t<N;t++){
    const rev = infraRev[t] + f.ai.grok[t] + f.ai.cursor[t] + aiAdvRev[t];
    aiRev.push(rev);
    aiCogs.push(rev*f.ai.cogsPct[t]);
    aiRnd.push(rev*f.ai.rndPct[t]);
    aiSga.push(rev*f.ai.sgaPct[t]);
    aiOpInc.push(rev - aiCogs[t]-aiRnd[t]-aiSga[t]);
    aiCapex.push(incrementalGW[t]*capexGWTable[t]);
  }
  out.ai = {revenue:aiRev, infraRev, grok:f.ai.grok, cursor:f.ai.cursor, advertising:aiAdvRev,
            cogs:aiCogs, rnd:aiRnd, sga:aiSga, opInc:aiOpInc, capex:aiCapex,
            nameplateGW:nameplate, revGenGW, effRate, incrementalGW};

  const totRev=[], totCogs=[], totRnd=[], totSga=[], totOpIncBeforeDep=[], totCapex=[];
  for (let t=0;t<N;t++){
    totRev.push(spRev[t]+coRev[t]+aiRev[t]);
    totCogs.push(spCogs[t]+coCogs[t]+aiCogs[t]);
    totRnd.push(spRnd[t]+coRnd[t]+aiRnd[t]);
    totSga.push(spSga[t]+coSga[t]+aiSga[t]);
    totOpIncBeforeDep.push(totRev[t]-totCogs[t]-totRnd[t]-totSga[t]);
    totCapex.push(spCapex[t]+coCapex[t]+aiCapex[t]);
  }

  const rate = f.financing.itShare/f.financing.itLife + (1-f.financing.itShare)/f.financing.facilityLife;
  const depFlow = totCapex.map(c=>c*rate);
  const inServiceCum = new Array(N).fill(0);
  for (let t=0;t<N;t++){
    const prevCum = t>0?inServiceCum[t-1]:0;
    const flowLag2 = t-2>=0 ? depFlow[t-2] : 0;
    inServiceCum[t] = prevCum + flowLag2;
  }
  const totOpInc = totOpIncBeforeDep.map((v,t)=>v-inServiceCum[t]);

  const openingCash=[], intInc=[], openingDebt=[], intExp=[], cfoProxy=[], cashBeforeFin=[], newDebt=[], closingCash=[], closingDebt=[], totalDebtOut=[];
  let prevCash = f.financing.openingCash, prevDebt = 0;
  for (let t=0;t<N;t++){
    openingCash.push(prevCash);
    intInc.push(prevCash*f.financing.cashYield/4);
    openingDebt.push(prevDebt);
    intExp.push(-(f.financing.existingDebt*f.financing.existingRate/4 + prevDebt*f.financing.newRate/4));
    const cfo = totOpIncBeforeDep[t] + f.financing.legacyAddback - f.financing.tax[t] + intInc[t] + intExp[t];
    cfoProxy.push(cfo);
    const cbf = prevCash + cfo - totCapex[t];
    cashBeforeFin.push(cbf);
    const nd = Math.max(0, f.financing.minCash - cbf);
    newDebt.push(nd);
    const cc = cbf+nd;
    closingCash.push(cc);
    const cd = prevDebt+nd;
    closingDebt.push(cd);
    totalDebtOut.push(f.financing.existingDebt+cd);
    prevCash = cc; prevDebt = cd;
  }

  const netIncome=[], pretax=[];
  for (let t=0;t<N;t++){
    const pt = totOpInc[t] + intExp[t] + intInc[t] + f.financing.otherIncome[t];
    pretax.push(pt);
    netIncome.push(pt - f.financing.tax[t]);
  }

  out.total = {revenue:totRev, cogs:totCogs, rnd:totRnd, sga:totSga, opIncBeforeDep:totOpIncBeforeDep,
    dep:inServiceCum, opInc:totOpInc, intExp, intInc, otherIncome:f.financing.otherIncome, pretax, tax:f.financing.tax,
    netIncome, capex:totCapex, cfoProxy, newDebt, closingCash, closingDebt, totalDebtOut, openingCash, openingDebt};

  const otherAssets = f.balanceQ226A.totalAssets - f.balanceQ226A.cash - f.balanceQ226A.securities - f.balanceQ226A.ppe;
  const otherLiab = f.balanceQ226A.totalLiab - f.financing.existingDebt;
  const ppe=[], totalAssets=[], totalLiab=[], equity=[], cumNI=[], otherEquityMovement=[];
  let prevPPE = f.balanceQ226A.ppe, prevEquity = f.balanceQ226A.equity, cum=0;
  for (let t=0;t<N;t++){
    const p = prevPPE + totCapex[t] - inServiceCum[t];
    ppe.push(p);
    const ta = closingCash[t] + p + otherAssets;
    totalAssets.push(ta);
    const tl = totalDebtOut[t] + otherLiab;
    totalLiab.push(tl);
    const eq = ta - tl;
    equity.push(eq);
    cum += netIncome[t];
    cumNI.push(cum);
    otherEquityMovement.push(eq - prevEquity - netIncome[t]);
    prevPPE = p; prevEquity = eq;
  }
  out.bs = {ppe, otherAssets, totalAssets, otherLiab, totalDebtOut, totalLiab, equity, cumNI, otherEquityMovement,
            cash: closingCash};

  return out;
}

/* ============================= STATE ============================= */
const state = {
  gw: [1.8,2.2,3,4.5,7,10,11.5,13,14,15],
  rateTable: CASES[1].rate.slice(),
  spotTable: CASES[1].spot.slice(),
  capexGWTable: CASES[1].capexGW.slice(),
  mode: 'longterm',
  longTermRate: CASES[1].ltr,
  convergenceYears: 4,
  activeCase: 1
};

function currentInputs(){
  return {
    gw: state.gw,
    rateTable: state.mode==='longterm' ? state.rateTable : state.rateTable,
    spotTable: state.spotTable,
    capexGWTable: state.capexGWTable,
    mode: state.mode,
    longTermRate: state.longTermRate,
    convergenceYears: state.convergenceYears
  };
}

function round4(x){ return Math.round(x*10000)/10000; }

/* ============================= FORMATTERS ============================= */
function fmt0(x){ if(x===undefined||x===null||isNaN(x)) return '–'; if(Math.abs(x)<0.5) return '–'; const v=Math.round(x); const s=Math.abs(v).toLocaleString('en-US'); return v<0? '('+s+')': s; }
function fmtPct(x, d){ if(x===undefined||isNaN(x)) return '–'; return (x*100).toFixed(d===undefined?1:d)+'%'; }
function fmtAutoUSD(x){
  const abs=Math.abs(x);
  if(abs>=1000) return (x<0?'-':'')+'$'+(abs/1000).toFixed(abs>=10000?0:1)+'B';
  return (x<0?'-':'')+'$'+Math.round(abs).toLocaleString('en-US')+'M';
}
function fmtGW(x){ return x.toFixed(1)+' GW'; }
function fmtRateB(x){ return '$'+((x*4)/1000).toFixed(1)+'B/GW/yr'; }

/* ============================= INPUT TABLES ============================= */
function buildQTable(container, arr, opts){
  container.innerHTML='';
  const scale = opts.scale||1;
  Q.forEach((q,i)=>{
    const cell = document.createElement('div'); cell.className='qcell';
    const lab = document.createElement('label'); lab.textContent=q.replace("'","’");
    const inp = document.createElement('input'); inp.type='number'; inp.step=opts.step||'1';
    inp.value = round4(arr[i]/scale);
    inp.addEventListener('input', ()=>{
      const v = parseFloat(inp.value);
      arr[i] = isNaN(v)?0:v*scale;
      if(opts.clearsCase){ state.activeCase = null; updatePresetUI(); }
      renderAll();
    });
    cell.appendChild(lab); cell.appendChild(inp); container.appendChild(cell);
  });
}

/* ============================= RENDER: SIDEBAR ============================= */
const tblGW = document.getElementById('tbl-gw');
const tblRate = document.getElementById('tbl-rate');
const tblCapex = document.getElementById('tbl-capex');
const modeHint = document.getElementById('mode-hint');
const spotExtra = document.getElementById('spot-extra');
const ltrInput = document.getElementById('ltr-input');
const ltrVal = document.getElementById('ltr-val');
const convInput = document.getElementById('conv-input');
const convVal = document.getElementById('conv-val');

function activeRateArray(){ return state.mode==='longterm' ? state.rateTable : state.spotTable; }

function buildSidebar(){
  buildQTable(tblGW, state.gw, {step:'0.1'});
  buildQTable(tblRate, activeRateArray(), {step:'200', clearsCase:true, scale:0.25});
  buildQTable(tblCapex, state.capexGWTable, {step:'0.5', clearsCase:true, scale:1000});
  ltrInput.value = round4(state.longTermRate*4);
  ltrVal.textContent = '$'+Math.round(state.longTermRate*4).toLocaleString()+'mm';
  convInput.value = state.convergenceYears;
  convVal.textContent = state.convergenceYears+' yrs';
  updateModeUI();
  updatePresetUI();
}

function updatePresetUI(){
  document.querySelectorAll('.preset-row button[data-case]').forEach(btn=>{
    btn.classList.toggle('primary', Number(btn.dataset.case)===state.activeCase);
  });
}

function updateModeUI(){
  document.querySelectorAll('#mode-toggle button').forEach(b=>b.classList.toggle('active', b.dataset.mode===state.mode));
  if(state.mode==='longterm'){
    modeHint.textContent = "Annual rate, recognized 1/4 per quarter, applied uniformly to the whole revenue-generating GW base — a stable contracted price.";
    spotExtra.style.display='none';
  } else {
    modeHint.textContent = "Annual rate new GW is sold at when it lands. Each vintage glides toward the long-term rate below over your convergence window.";
    spotExtra.style.display='flex';
  }
  buildQTable(tblRate, activeRateArray(), {step:'200', scale:0.25});
}

document.getElementById('mode-toggle').addEventListener('click', (e)=>{
  const btn = e.target.closest('button[data-mode]');
  if(!btn) return;
  state.mode = btn.dataset.mode;
  updateModeUI();
  renderAll();
});

ltrInput.addEventListener('input', ()=>{
  const v = parseFloat(ltrInput.value);
  state.longTermRate = isNaN(v)?0:v/4;
  ltrVal.textContent = '$'+Math.round(isNaN(v)?0:v).toLocaleString()+'mm';
  state.activeCase = null; updatePresetUI();
  renderAll();
});
convInput.addEventListener('input', ()=>{
  state.convergenceYears = parseFloat(convInput.value);
  convVal.textContent = state.convergenceYears+' yrs';
  renderAll();
});

document.querySelectorAll('.preset-row button[data-case]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const c = CASES[btn.dataset.case];
    state.rateTable = c.rate.slice();
    state.spotTable = c.spot.slice();
    state.capexGWTable = c.capexGW.slice();
    state.longTermRate = c.ltr;
    state.activeCase = Number(btn.dataset.case);
    buildSidebar();
    renderAll();
  });
});

document.getElementById('reset-btn').addEventListener('click', ()=>{
  state.gw = [1.8,2.2,3,4.5,7,10,11.5,13,14,15];
  state.rateTable = CASES[1].rate.slice();
  state.spotTable = CASES[1].spot.slice();
  state.capexGWTable = CASES[1].capexGW.slice();
  state.mode = 'longterm';
  state.longTermRate = CASES[1].ltr;
  state.convergenceYears = 4;
  state.activeCase = 1;
  buildSidebar();
  renderAll();
});

/* ============================= TOOLTIP ============================= */
const tooltip = document.getElementById('tooltip');
function showTooltip(html, x, y){
  tooltip.innerHTML = html;
  tooltip.classList.add('show');
  const pad=14; const tw=tooltip.offsetWidth, th=tooltip.offsetHeight;
  let left = x+pad, top = y+pad;
  if(left+tw>window.innerWidth-8) left = x-tw-pad;
  if(top+th>window.innerHeight-8) top = y-th-pad;
  tooltip.style.left = left+'px'; tooltip.style.top = top+'px';
}
function hideTooltip(){ tooltip.classList.remove('show'); }

/* ============================= CHARTS ============================= */
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs){
  const el = document.createElementNS(NS, tag);
  for(const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function colorVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function measureW(container, fallback){
  const w = container.getBoundingClientRect().width;
  return Math.round(w>40 ? w : (fallback||520));
}

/* Show every Nth x-axis label so they never collide on narrow screens. */
function labelStep(n, plotW, approxLabelPx){
  const per = plotW / Math.max(1,n);
  return Math.max(1, Math.ceil((approxLabelPx||36) / Math.max(1,per)));
}

function stackedBarChart(container, labels, series, opts){
  container.innerHTML='';
  const W = measureW(container, opts.width), H = opts.height||220;
  const padL=44, padR=8, padT=10, padB=22;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const n = labels.length;
  const totals = labels.map((_,i)=> series.reduce((s,se)=>s+se.values[i],0));
  const maxV = Math.max(1, ...totals);
  const niceMax = niceCeil(maxV);
  const svg = svgEl('svg',{class:'chart', viewBox:'0 0 '+W+' '+H});
  const gridN=4;
  for(let g=0; g<=gridN; g++){
    const yv = niceMax*g/gridN;
    const y = padT + plotH - (yv/niceMax)*plotH;
    svg.appendChild(svgEl('line',{class:'gridline', x1:padL, x2:W-padR, y1:y, y2:y}));
    const t = svgEl('text',{class:'axis-label', x:padL-6, y:y+3, 'text-anchor':'end'});
    t.textContent = fmtAutoUSD(yv); svg.appendChild(t);
  }
  const bw = plotW/n*0.62;
  const step = plotW/n;
  const lblStep = labelStep(n, plotW);
  for(let i=0;i<n;i++){
    const x = padL + step*i + (step-bw)/2;
    let yCursor = padT+plotH;
    const histFlag = opts.histCount && i<opts.histCount;
    series.forEach((se)=>{
      const v = se.values[i];
      const h = (v/niceMax)*plotH;
      const y = yCursor-h;
      const rect = svgEl('rect',{x:x, y:y, width:bw, height:Math.max(0,h-1), rx:2,
        fill: se.color, opacity: histFlag? 1 : 0.42});
      svg.appendChild(rect);
      yCursor = y;
    });
    const hit = svgEl('rect',{class:'hit', x:padL+step*i, y:padT, width:step, height:plotH});
    hit.addEventListener('mousemove', (ev)=>{
      let rows = series.map(se=>'<div class="tt-row"><span class="k"><span class="swatch" style="background:'+se.color+'; opacity:'+(histFlag?1:0.55)+'"></span>'+se.label+'</span><span>'+fmt0(se.values[i])+'</span></div>').join('');
      showTooltip('<div class="tt-title">'+labels[i]+(histFlag?' · actual':' · projected')+'</div>'+rows+'<div class="tt-row tt-total"><span>Total</span><span>'+fmt0(totals[i])+'</span></div>', ev.clientX, ev.clientY);
    });
    hit.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(hit);
    if(i % lblStep === 0){
      const lt = svgEl('text',{class:'axis-label', x:x+bw/2, y:H-6, 'text-anchor':'middle'});
      lt.textContent = labels[i]; svg.appendChild(lt);
    }
  }
  container.appendChild(svg);
}

function lineChart(container, labels, values, opts){
  container.innerHTML='';
  const W = measureW(container, opts.width), H = opts.height||220;
  const padL=52, padR=10, padT=14, padB=22;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const n = labels.length;
  const histCount = opts.histCount||0;
  const minV = Math.min(0, ...values), maxV = Math.max(0, ...values);
  const niceMax = niceCeil(Math.max(Math.abs(minV), Math.abs(maxV)));
  const scaleY = v => padT + plotH - ((v+niceMax)/(niceMax*2))*plotH;
  const svg = svgEl('svg',{class:'chart', viewBox:'0 0 '+W+' '+H});
  const gridN=4;
  for(let g=-gridN/2; g<=gridN/2; g++){
    const yv = niceMax*g/(gridN/2);
    const y = scaleY(yv);
    svg.appendChild(svgEl('line',{class: g===0?'zeroline':'gridline', x1:padL, x2:W-padR, y1:y, y2:y}));
    const t = svgEl('text',{class:'axis-label', x:padL-6, y:y+3, 'text-anchor':'end'});
    t.textContent = fmtAutoUSD(yv); svg.appendChild(t);
  }
  const step = plotW/(n-1||1);
  const lblStep = labelStep(n, plotW);
  const pts = values.map((v,i)=>[padL+step*i, scaleY(v)]);
  const lineColor = opts.color||colorVar('--accent');
  if(histCount>0){
    const histPts = pts.slice(0, histCount);
    const dh = 'M'+histPts.map(p=>p[0]+' '+p[1]).join(' L');
    svg.appendChild(svgEl('path',{d:dh, fill:'none', stroke:lineColor, 'stroke-width':2}));
  }
  const fcPts = pts.slice(Math.max(0,histCount-1));
  if(fcPts.length>1){
    const df = 'M'+fcPts.map(p=>p[0]+' '+p[1]).join(' L');
    svg.appendChild(svgEl('path',{d:df, fill:'none', stroke:lineColor, 'stroke-width':2, opacity:0.42}));
  }
  pts.forEach((p,i)=>{
    const histFlag = i<histCount;
    const c = values[i]<0 ? colorVar('--bad') : lineColor;
    svg.appendChild(svgEl('circle',{cx:p[0], cy:p[1], r: i===n-1?4:2.6, fill:c, opacity: histFlag?1:0.55}));
    const hit = svgEl('rect',{class:'hit', x:p[0]-step/2, y:padT, width:step, height:plotH});
    hit.addEventListener('mousemove', (ev)=>{
      showTooltip('<div class="tt-title">'+labels[i]+(opts.histCount? (histFlag?' · actual':' · projected'):'')+'</div><div class="tt-row"><span>'+(opts.label||'Value')+'</span><span>'+fmt0(values[i])+'</span></div>', ev.clientX, ev.clientY);
    });
    hit.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(hit);
    if(i % lblStep === 0){
      const lt = svgEl('text',{class:'axis-label', x:p[0], y:H-6, 'text-anchor':'middle'});
      lt.textContent = labels[i]; svg.appendChild(lt);
    }
  });
  container.appendChild(svg);
}

function barChartSimple(container, labels, values, opts){
  container.innerHTML='';
  const W = measureW(container, opts.width), H = opts.height||200;
  const padL=46, padR=8, padT=10, padB=22;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const n=labels.length;
  const maxV = niceCeil(Math.max(1,...values));
  const svg = svgEl('svg',{class:'chart', viewBox:'0 0 '+W+' '+H});
  for(let g=0; g<=4; g++){
    const yv=maxV*g/4; const y=padT+plotH-(yv/maxV)*plotH;
    svg.appendChild(svgEl('line',{class:'gridline', x1:padL, x2:W-padR, y1:y, y2:y}));
    const t=svgEl('text',{class:'axis-label', x:padL-5, y:y+3, 'text-anchor':'end'}); t.textContent=opts.fmt?opts.fmt(yv):fmt0(yv); svg.appendChild(t);
  }
  const step=plotW/n, bw=step*0.55;
  const lblStep = labelStep(n, plotW);
  values.forEach((v,i)=>{
    const x=padL+step*i+(step-bw)/2;
    const h=(v/maxV)*plotH; const y=padT+plotH-h;
    svg.appendChild(svgEl('rect',{x:x,y:y,width:bw,height:Math.max(0,h),rx:2,fill:opts.color||colorVar('--ai')}));
    const hit = svgEl('rect',{class:'hit', x:padL+step*i, y:padT, width:step, height:plotH});
    hit.addEventListener('mousemove',(ev)=>{
      showTooltip('<div class="tt-title">'+labels[i]+'</div><div class="tt-row"><span>'+(opts.label||'Value')+'</span><span>'+(opts.fmt?opts.fmt(v):fmt0(v))+'</span></div>', ev.clientX, ev.clientY);
    });
    hit.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(hit);
    if(i % lblStep === 0){
      const lt=svgEl('text',{class:'axis-label', x:x+bw/2, y:H-6, 'text-anchor':'middle'}); lt.textContent=labels[i]; svg.appendChild(lt);
    }
  });
  container.appendChild(svg);
}

function niceCeil(v){
  if(v<=0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v/mag;
  let n;
  if(norm<=1) n=1; else if(norm<=2) n=2; else if(norm<=5) n=5; else n=10;
  return n*mag;
}

/* ============================= KPI CARDS ============================= */
function pill(text, cls){ return '<span class="pill '+cls+'">'+text+'</span>'; }

function renderKPIs(m){
  const grid = document.getElementById('kpi-grid');
  const lastIdx = N-1;
  const totalRevEnd = m.total.revenue[lastIdx];
  const niEnd = m.total.netIncome[lastIdx];
  const aiRevEnd = m.ai.revenue[lastIdx];
  const aiShare = aiRevEnd/totalRevEnd;
  const gwEnd = m.ai.revGenGW[lastIdx];
  const cashEnd = m.total.closingCash[lastIdx];
  const debtEnd = m.total.totalDebtOut[lastIdx];
  const arrDec26 = m.total.revenue[1]*0.38*12;
  const arrGap = arrDec26-100000;
  const paybackQ426 = state.capexGWTable[1] / ((state.mode==='longterm'?state.rateTable[1]:state.spotTable[1])*4);

  const cards = [
    { label:"Total revenue · Q428", value: fmtAutoUSD(totalRevEnd), sub: (totalRevEnd/m.total.revenue[0]).toFixed(1)+'x vs Q326' },
    { label:"Net income (loss) · Q428", value: fmtAutoUSD(niEnd), sub: pill(niEnd>=0?'Profitable':'Loss-making', niEnd>=0?'good':'bad') },
    { label:"AI revenue · Q428", value: fmtAutoUSD(aiRevEnd), sub: fmtPct(aiShare,0)+' of total revenue' },
    { label:"AI revenue-generating GW · Q428", value: fmtGW(gwEnd), sub: fmtGW(m.ai.nameplateGW[lastIdx])+' nameplate' },
    { label:"Cash &amp; securities · Q428", value: fmtAutoUSD(cashEnd), sub: cashEnd<=15001? pill('At minimum buffer','warn') : pill('Above buffer','good') },
    { label:"Total debt outstanding · Q428", value: fmtAutoUSD(debtEnd), sub: fmtAutoUSD(debtEnd-39364)+' newly raised' },
    { label:"ARR run-rate · Dec 2026E", value: fmtAutoUSD(arrDec26), sub: arrGap>=0? pill('Above $100B guide','good') : pill(fmtAutoUSD(Math.abs(arrGap))+' short of $100B','warn') },
    { label:"New-capacity payback · Q426", value: paybackQ426.toFixed(2)+' yrs', sub: paybackQ426<=1? pill('Meets <1yr guidance','good') : pill('Above 1yr guidance','warn') }
  ];
  grid.innerHTML = cards.map(c=>
    '<div class="kpi"><div class="kpi-label">'+c.label+'</div><div class="kpi-value num">'+c.value+'</div><div class="kpi-sub">'+c.sub+'</div></div>'
  ).join('');
}

/* ============================= TABLES ============================= */
function rowHTML(label, values, opts){
  opts = opts||{};
  const cells = values.map(v=>{
    const cls = ['num']; if(v<0) cls.push('neg');
    return '<td class="'+cls.join(' ')+'">'+(opts.pct? fmtPct(v,1) : fmt0(v))+'</td>';
  }).join('');
  return '<tr class="'+(opts.rowClass||'')+'"><td class="rowlabel">'+label+'</td>'+cells+'</tr>';
}
function sectionRow(label, span){
  return '<tr class="section"><td class="rowlabel">'+label+'</td><td colspan="'+span+'"></td></tr>';
}

function renderPLTable(m){
  const el = document.getElementById('table-pl');
  const allQ = HQ.concat(Q);
  const H = FIXED.historical;

  const cat = (histArr, fArr)=> histArr.concat(fArr);
  const zeros = new Array(3).fill(0);

  let head = '<thead><tr><th class="rowlabel">$mm</th>'+allQ.map((q,i)=>'<th class="num'+(i===3?' divider-col':'')+'">'+q+'</th>').join('')+'</tr></thead>';

  let body = '<tbody>';
  body += sectionRow('Revenue by segment', allQ.length);
  body += rowHTML('Space', cat(H.space, m.space.revenue));
  body += rowHTML('Connectivity', cat(H.connectivity, m.connectivity.revenue));
  body += rowHTML('AI', cat(H.ai, m.ai.revenue));
  const totRevHist = H.space.map((v,i)=>v+H.connectivity[i]+H.ai[i]);
  body += rowHTML('Total revenue', cat(totRevHist, m.total.revenue), {rowClass:'total'});

  body += sectionRow('Costs &amp; expenses', allQ.length);
  body += rowHTML('Cost of revenue', cat(zeros, m.total.cogs));
  body += rowHTML('Research &amp; development', cat(zeros, m.total.rnd));
  body += rowHTML('Selling, general &amp; admin', cat(zeros, m.total.sga));
  body += rowHTML('Depreciation, new capex', cat(zeros, m.total.dep));

  const opIncHist = [-970,-1943,-143];
  body += rowHTML('Income (loss) from operations', cat(opIncHist, m.total.opInc), {rowClass:'total'});
  body += rowHTML('  Operating margin %', cat(opIncHist.map((v,i)=>v/totRevHist[i]), m.total.opInc.map((v,i)=>v/m.total.revenue[i])), {pct:true});

  body += sectionRow('Below the line', allQ.length);
  const intExpHist=[-411,-664,-629], intIncHist=[98,213,340], otherHist=[413,-1876,-86], taxHist=[138,6,23];
  body += rowHTML('Interest expense', cat(intExpHist, m.total.intExp));
  body += rowHTML('Interest income', cat(intIncHist, m.total.intInc));
  body += rowHTML('Other income (expense), net', cat(otherHist, m.total.otherIncome));
  body += rowHTML('Provision for income taxes', cat(taxHist, m.total.tax));
  body += rowHTML('Net income (loss)', cat(H.netIncome, m.total.netIncome), {rowClass:'total'});
  body += rowHTML('  Net margin %', cat(H.netIncome.map((v,i)=>v/totRevHist[i]), m.total.netIncome.map((v,i)=>v/m.total.revenue[i])), {pct:true});

  body += sectionRow('Memo', allQ.length);
  body += rowHTML('AI infrastructure revenue', cat([null,null,2194], m.ai.infraRev), {rowClass:'memo'});
  body += rowHTML('AI nameplate compute (GW)', cat(H.aiNameplateGW, m.ai.nameplateGW), {rowClass:'memo'});
  body += rowHTML('AI realized $/GW/yr (blended)', cat([null,null,null], m.ai.effRate.map(v=>v*4)), {rowClass:'memo'});
  body += rowHTML('Total capex', cat([2825,10107,18369], m.total.capex), {rowClass:'memo'});
  body += rowHTML('  of which AI capex', cat([749,7723,15828], m.ai.capex), {rowClass:'memo'});
  body += rowHTML('ARR (exit-month revenue x 12)', [null,null,null, m.total.revenue[0]*0.38*12].concat(m.total.revenue.slice(1).map(v=>v*0.38*12)), {rowClass:'memo'});
  body += '</tbody>';

  el.innerHTML = head+body;
}

function renderBSTable(m){
  const el = document.getElementById('table-bs');
  const cols = ["Jun 30, 2026A"].concat(Q);
  const B = FIXED.balanceQ226A;
  let head = '<thead><tr><th class="rowlabel">$mm</th>'+cols.map((c,i)=>'<th class="num'+(i===1?' divider-col':'')+'">'+c+'</th>').join('')+'</tr></thead>';

  const cat = (v0, arr)=> [v0].concat(arr);

  let body='<tbody>';
  body += sectionRow('Assets', cols.length);
  body += rowHTML('Cash &amp; securities', cat(B.cash+B.securities, m.bs.cash));
  body += rowHTML('Property, plant &amp; equipment, net', cat(B.ppe, m.bs.ppe));
  body += rowHTML('Other assets (held flat)', cat(m.bs.otherAssets, m.bs.otherAssets===undefined? [] : new Array(N).fill(m.bs.otherAssets)));
  body += rowHTML('Total assets', cat(B.totalAssets, m.bs.totalAssets), {rowClass:'total'});

  body += sectionRow('Liabilities', cols.length);
  body += rowHTML('Total debt (existing + new)', cat(39364, m.bs.totalDebtOut));
  body += rowHTML('Other liabilities (held flat)', cat(m.bs.otherLiab, new Array(N).fill(m.bs.otherLiab)));
  body += rowHTML('Total liabilities', cat(B.totalLiab, m.bs.totalLiab), {rowClass:'total'});

  body += sectionRow("Shareholders&rsquo; equity", cols.length);
  body += rowHTML('Total shareholders&rsquo; equity', cat(B.equity, m.bs.equity), {rowClass:'total'});
  body += rowHTML('Total liabilities &amp; equity', cat(B.totalLiab+B.equity, m.bs.totalLiab.map((v,i)=>v+m.bs.equity[i])), {rowClass:'total'});

  body += sectionRow('Memo: equity bridge', cols.length);
  body += rowHTML('Cumulative net income', cat(0, m.bs.cumNI), {rowClass:'memo'});
  body += rowHTML('Other reconciling items (unmodeled WC/deferred rev/non-cash)', cat(0, m.bs.otherEquityMovement), {rowClass:'memo'});
  body += '</tbody>';

  el.innerHTML = head+body;
}

/* ============================= MAIN RENDER ============================= */
function renderAll(){
  const m = computeModel(currentInputs());

  renderKPIs(m);

  const revLabels = HQ.concat(Q);
  stackedBarChart(document.getElementById('chart-revenue'), revLabels, [
    {label:'Space', color:colorVar('--space'), values: FIXED.historical.space.concat(m.space.revenue)},
    {label:'Connectivity', color:colorVar('--connectivity'), values: FIXED.historical.connectivity.concat(m.connectivity.revenue)},
    {label:'AI', color:colorVar('--ai'), values: FIXED.historical.ai.concat(m.ai.revenue)}
  ], {histCount:3, width:560, height:230});

  lineChart(document.getElementById('chart-netincome'), revLabels, FIXED.historical.netIncome.concat(m.total.netIncome),
    {histCount:3, width:420, height:230, label:'Net income'});

  barChartSimple(document.getElementById('chart-gw'), Q, m.ai.nameplateGW, {color:colorVar('--ai'), label:'Nameplate GW', fmt:v=>Math.round(v)+' GW', width:340, height:190});
  barChartSimple(document.getElementById('chart-rate'), Q, m.ai.effRate.map(v=>v*4), {color:colorVar('--accent'), label:'$B/GW/yr', fmt:v=>'$'+(v/1000).toFixed(1)+'B', width:340, height:190});

  renderPLTable(m);
  renderBSTable(m);
}

buildSidebar();
renderAll();
window.addEventListener('resize', renderAll);

/* ============================= COMMENTS ============================= */
(function(){
  const root = document.getElementById('comments-root');
  const API = '/api/comments';

  let sitekey = null;      // supplied by the API when a bot check is configured
  let turnstileReady = false;
  let widgetId = null;
  let adminToken = null;   // set only after the server validates it

  function storedAdminToken(){
    try { return localStorage.getItem('xmantou_admin_token') || null; } catch { return null; }
  }
  function setStoredAdminToken(t){
    try { if(t) localStorage.setItem('xmantou_admin_token', t); else localStorage.removeItem('xmantou_admin_token'); } catch {}
  }
  async function verifyAdminToken(token){
    try{
      const res = await fetch(API+'/verify', { method:'POST', headers:{'X-Admin-Token': token} });
      return { ok: res.ok, status: res.status };
    } catch { return { ok:false, status:0 }; }
  }
  function adminErrorText(status){
    if(status===429) return 'Too many attempts — wait a few minutes and try again.';
    if(status===501) return 'Admin delete is not configured on this deployment.';
    if(status===0)   return 'Could not reach the server.';
    return 'That token was not accepted.';
  }

  function getMyVotes(){
    try { return JSON.parse(localStorage.getItem('xmantou_my_votes')||'{}'); } catch { return {}; }
  }
  function setMyVote(commentId, direction){
    const v = getMyVotes();
    if(direction===0) delete v[commentId]; else v[commentId] = direction;
    localStorage.setItem('xmantou_my_votes', JSON.stringify(v));
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function timeAgo(iso){
    const d = new Date(iso+(iso.endsWith('Z')?'':'Z'));
    const s = Math.max(1, Math.floor((Date.now()-d.getTime())/1000));
    if(s<60) return s+'s ago';
    const m = Math.floor(s/60); if(m<60) return m+'m ago';
    const h = Math.floor(m/60); if(h<24) return h+'h ago';
    const dd = Math.floor(h/24); if(dd<30) return dd+'d ago';
    return d.toLocaleDateString();
  }

  function renderFallback(){
    root.innerHTML = '<div class="comments-fallback">Comments &amp; voting need the live backend on <a href="https://x-mantou.com" target="_blank" rel="noopener">x-mantou.com</a> — they\'re not available on this preview/artifact link.</div>';
  }

  // Loaded only once the API has confirmed a sitekey, so preview/artifact
  // copies never reach out for a script they cannot use.
  function loadTurnstile(){
    return new Promise((resolve)=>{
      if(turnstileReady || !sitekey) return resolve(turnstileReady);
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true; s.defer = true;
      s.onload = ()=>{ turnstileReady = true; resolve(true); };
      s.onerror = ()=>{ resolve(false); };
      document.head.appendChild(s);
    });
  }

  async function mountTurnstile(){
    const host = document.getElementById('turnstile-host');
    if(!host || !sitekey) return;
    const ok = await loadTurnstile();
    if(!ok || !window.turnstile) return;
    widgetId = window.turnstile.render(host, {
      sitekey: sitekey,
      theme: 'auto',
      size: 'flexible'
    });
  }

  function renderComments(list){
    const myVotes = getMyVotes();
    const formHtml =
      '<form class="comment-form" id="comment-form">'+
        '<div class="comment-form-row"><input type="text" id="comment-author" maxlength="60" placeholder="Name (optional)"></div>'+
        '<textarea id="comment-body" maxlength="2000" placeholder="Add a comment or suggestion…" required></textarea>'+
        (sitekey ? '<div id="turnstile-host" class="turnstile-host"></div>' : '')+
        '<div class="comment-form-footer">'+
          '<span class="comment-char-count" id="comment-char-count">0 / 2000</span>'+
          '<span style="display:flex; align-items:center; gap:10px;">'+
            '<span class="comment-submit-error" id="comment-submit-error"></span>'+
            '<button type="submit" class="btn primary small">Post</button>'+
          '</span>'+
        '</div>'+
      '</form>';

    const adminMode = location.hash === '#admin';
    const adminBarHtml = adminToken
      ? '<div class="admin-bar" id="admin-bar"><span class="admin-badge">Admin mode</span>'+
          '<span class="admin-note">Delete controls are visible on each comment.</span>'+
          '<button type="button" class="btn small" id="admin-signout">Sign out</button></div>'
      : (adminMode
          ? '<div class="admin-bar" id="admin-bar">'+
              '<input type="password" id="admin-token-input" placeholder="Admin token" autocomplete="off">'+
              '<button type="button" class="btn small primary" id="admin-unlock">Unlock</button>'+
              '<span class="admin-msg" id="admin-msg"></span>'+
            '</div>'
          : '');

    const listHtml = list.length===0
      ? '<div class="comments-empty">No comments yet — be the first.</div>'
      : '<div class="comment-list">'+list.map(c=>{
          const mine = myVotes[c.id]||0;
          const score = c.upvotes - c.downvotes;
          return '<div class="comment-item" data-id="'+c.id+'">'+
            '<div class="comment-votes">'+
              '<button class="vote-btn up'+(mine===1?' active':'')+'" data-dir="1" aria-label="Upvote" aria-pressed="'+(mine===1)+'">'+
                '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 2 L10 8 L2 8 Z" fill="currentColor"/></svg>'+
              '</button>'+
              '<span class="vote-score">'+score+'</span>'+
              '<button class="vote-btn down'+(mine===-1?' active':'')+'" data-dir="-1" aria-label="Downvote" aria-pressed="'+(mine===-1)+'">'+
                '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 10 L2 4 L10 4 Z" fill="currentColor"/></svg>'+
              '</button>'+
            '</div>'+
            '<div class="comment-body-col">'+
              '<div class="comment-meta"><span class="comment-author">'+escapeHtml(c.author)+'</span><span class="comment-time">'+timeAgo(c.created_at)+'</span>'+
                (adminToken ? '<button class="comment-delete" data-del="'+c.id+'" aria-label="Delete comment">Delete</button>' : '')+
              '</div>'+
              '<div class="comment-text">'+escapeHtml(c.body)+'</div>'+
            '</div>'+
          '</div>';
        }).join('')+'</div>';

    root.innerHTML = adminBarHtml + formHtml + listHtml;

    const form = document.getElementById('comment-form');
    const bodyInput = document.getElementById('comment-body');
    const charCount = document.getElementById('comment-char-count');
    const submitErr = document.getElementById('comment-submit-error');
    bodyInput.addEventListener('input', ()=>{ charCount.textContent = bodyInput.value.length+' / 2000'; });

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      submitErr.textContent = '';
      const author = document.getElementById('comment-author').value.trim();
      const body = bodyInput.value.trim();
      if(!body){ submitErr.textContent = 'Say something first.'; return; }
      const btn = form.querySelector('button[type=submit]');

      let token = '';
      if(sitekey){
        token = (window.turnstile && widgetId!==null) ? window.turnstile.getResponse(widgetId) : '';
        if(!token){ submitErr.textContent = 'Complete the bot check above first.'; return; }
      }

      btn.disabled = true;
      try{
        const res = await fetch(API, {
          method:'POST', headers:{'content-type':'application/json'},
          body: JSON.stringify({ author, body, turnstileToken: token })
        });
        if(!res.ok){ const e2 = await res.json().catch(()=>({})); throw new Error(e2.error||'Failed to post comment'); }
        await load();
      } catch(err){
        submitErr.textContent = err.message || 'Failed to post comment';
        // A token is single-use; reset so the next attempt gets a fresh one.
        if(window.turnstile && widgetId!==null) window.turnstile.reset(widgetId);
      } finally {
        btn.disabled = false;
      }
    });

    root.querySelectorAll('.comment-delete').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.dataset.del;
        if(!confirm('Delete this comment permanently?')) return;
        btn.disabled = true;
        try{
          const res = await fetch(API+'/'+id, { method:'DELETE', headers:{'X-Admin-Token': adminToken} });
          if(!res.ok){
            const e = await res.json().catch(()=>({}));
            if(res.status===401){ adminToken=null; setStoredAdminToken(null); }
            throw new Error(e.error||'Delete failed');
          }
          await load();
        } catch(err){
          alert(err.message||'Delete failed');
          btn.disabled = false;
        }
      });
    });

    const adminBar = document.getElementById('admin-bar');
    if(adminBar){
      // Only the locked state has these controls; the unlocked state has none.
      const unlockBtn = adminBar.querySelector('#admin-unlock');
      if(unlockBtn) unlockBtn.addEventListener('click', async ()=>{
        const input = adminBar.querySelector('#admin-token-input');
        const msg = adminBar.querySelector('#admin-msg');
        const token = input.value.trim();
        if(!token){ msg.textContent = 'Enter the admin token.'; return; }
        msg.textContent = 'Checking…';
        const check = await verifyAdminToken(token);
        if(check.ok){
          adminToken = token; setStoredAdminToken(token);
          msg.textContent = '';
          await load();
        } else {
          msg.textContent = adminErrorText(check.status);
        }
      });
      const signOut = adminBar.querySelector('#admin-signout');
      if(signOut) signOut.addEventListener('click', async ()=>{
        adminToken = null; setStoredAdminToken(null); await load();
      });
    }

    root.querySelectorAll('.vote-btn').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const item = btn.closest('.comment-item');
        const id = item.dataset.id;
        const dir = Number(btn.dataset.dir);
        item.querySelectorAll('.vote-btn').forEach(b=>b.disabled=true);
        try{
          const res = await fetch(API+'/'+id+'/vote', {
            method:'POST', headers:{'content-type':'application/json'},
            body: JSON.stringify({ direction: dir })
          });
          if(!res.ok) throw new Error('vote failed');
          const data = await res.json();
          setMyVote(id, data.myVote);
          const score = data.comment.upvotes - data.comment.downvotes;
          item.querySelector('.vote-score').textContent = score;
          item.querySelector('.vote-btn.up').classList.toggle('active', data.myVote===1);
          item.querySelector('.vote-btn.down').classList.toggle('active', data.myVote===-1);
        } catch(err){
          /* silent fail, leave UI as-is */
        } finally {
          item.querySelectorAll('.vote-btn').forEach(b=>b.disabled=false);
        }
      });
    });
  }

  async function load(){
    let data;
    // Only a failed fetch means "no backend here" — a rendering error must not
    // be disguised as one, or real bugs show up as a misleading notice.
    try{
      const res = await fetch(API);
      if(!res.ok) throw new Error('bad response');
      data = await res.json();
    } catch(err){
      renderFallback();
      return;
    }
    if(data.turnstileSitekey) sitekey = data.turnstileSitekey;
    renderComments(data.comments||[]);
    mountTurnstile();
  }

  // Re-validate any saved admin token against the server before trusting it.
  (async function init(){
    const saved = storedAdminToken();
    if(saved){
      const check = await verifyAdminToken(saved);
      if(check.ok) adminToken = saved;
      // Only an outright rejection clears the saved token. A rate-limited or
      // unreachable check is transient and must not sign the admin out.
      else if(check.status === 401) setStoredAdminToken(null);
    }
    load();
  })();

  window.addEventListener('hashchange', ()=>{ if(!adminToken) load(); });
})();

