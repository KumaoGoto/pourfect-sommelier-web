(function(){
'use strict';
const NATIVE=window.PS_NATIVE||null;
const WEB_VERSION='1.1.2';
const SITE_URL='https://pourfect-sommelier.kumao.app/';
const VERSION_LABEL=NATIVE?`iOS 版 ${NATIVE.version}`:`ブラウザ版 ${WEB_VERSION}`;
const LOCAL=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const API=(NATIVE&&NATIVE.api)||(LOCAL&&new URLSearchParams(location.search).get('ranking')==='local'?'http://127.0.0.1:8792':'https://pourfectsommelier-ranking.saikyo-eigo.workers.dev');
const VER='p1', TERMS_VERSION=1, NAME_MAX=10, BOARD_SIZE=50, TIMEOUT_MS=8000;
const KEY={rank:'pourfect-sommelier.ranking',pending:'pourfect-sommelier.pending',probe:'pourfect-sommelier.probe'};
const TRIAL=['debug','stage','gallery'].some(k=>new URLSearchParams(location.search).has(k));
const TERMS=[
  'ランキングには、決めた名前と、ご満足いただけた組の数が表示されます。',
  '記録を確かめるため、その回の各ステージのグラスの形と、注いだ量もサーバーに送ります。',
  '人を傷つける言葉、性的な言葉、他人の権利を侵す名前は使わないでください。見つけたものは予告なく非表示や変更にすることがあります。',
  'ふさわしくない名前やありえない記録は「通報」できます。通報した相手は、あなたの画面に出なくなります。運営が確かめて非表示にすることがあります。',
  '「名前を変える」の「ランキングをやめて記録を消す」で、名前と記録をいつでもサーバーから消せます。',
  NATIVE?'このアプリを消すと、同じ名前でも別の人として数えられ、前の記録を自分では消せなくなります。消すときは先に「ランキングをやめる」を。'
        :'このブラウザのデータが消えると（しばらく開かないと消えるブラウザもあります）、同じ名前でも別の人として数えられ、前の記録を自分では消せなくなります。消すときは先に「ランキングをやめる」を。',
  'お問い合わせ: support.kumaogoto@gmail.com',
];
let g=null;
let last=null;
let lastCleared=0;
const load=k=>{ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } };
const save=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
const drop=k=>{ try{ localStorage.removeItem(k); }catch(e){} };
const $=id=>document.getElementById(id);
function el(tag,cls,text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
const tap=()=>{ try{ if(g){ g.auInit(); g.sfx('tap'); } }catch(e){} };
class HttpError extends Error{ constructor(status,code){ super(code||`HTTP ${status}`); this.status=status; this.code=code; } }
function graphemes(t){ return typeof Intl!=='undefined'&&Intl.Segmenter?Array.from(new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(t),x=>x.segment):Array.from(t); }
function cleanText(s){
  return String(s||'').replace(/[\u0000-\u001f\u007f-\u009f​‎‏‪-‮⁠-⁩﻿]/g,'').trim();
}
function cleanName(s){ return graphemes(cleanText(s)).slice(0,NAME_MAX).join(''); }
const PLAIN_NAME=/^[\u0020-\u007e\u3000-\u30ff\uff01-\uff5e]*$/;
function nameFont(e,name){ e.classList.toggle('rk-sys',!PLAIN_NAME.test(String(name||''))); return e; }
function newUid(){ const a=new Uint8Array(16); crypto.getRandomValues(a); return Array.from(a,x=>x.toString(16).padStart(2,'0')).join(''); }
function loadPending(){ const p=load(KEY.pending); if(p&&p.ver!==VER){ drop(KEY.pending); return null; } return p; }
const Rank={
  state:load(KEY.rank)||{},
  pending:loadPending(),
  lastSent:null,
  get joined(){ return !!(this.state.joined&&this.state.uid&&this.state.name); },
  async call(method,path,body){
    if(NATIVE){
      let r=null; try{ r=await NATIVE.fetch(method,API+path,body?JSON.stringify(body):null,TIMEOUT_MS); }catch(e){}
      if(!r||!r.status) throw new HttpError(0,'offline');
      let j={}; try{ j=JSON.parse(r.body); }catch(e){}
      if(r.status<200||r.status>=300) throw new HttpError(r.status,j.error);
      return j;
    }
    const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),TIMEOUT_MS);
    try{
      const res=await fetch(API+path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:ctl.signal,cache:'no-store'});
      let j={}; try{ j=await res.json(); }catch(e){}
      if(!res.ok) throw new HttpError(res.status,j.error);
      return j;
    }catch(e){
      if(e instanceof HttpError) throw e;
      throw new HttpError(0,'offline');
    }finally{ clearTimeout(timer); }
  },
  enqueue(rec){ if(!this.pending||this.pending.ver!==VER||rec.cleared>this.pending.cleared){ this.pending={...rec,ver:VER}; save(KEY.pending,this.pending); } },
  push(){
    if(this.pushing) return this.pushing;
    this.pushing=(async()=>{
      let again=true, out=this.lastSent||null;
      while(this.pending&&this.joined){
        const rec=this.pending;
        if(rec.ver!==VER){ this.pending=null; drop(KEY.pending); continue; }
        try{
          out=await this.call('POST','/v1/submit',{uid:this.state.uid,ver:VER,cleared:rec.cleared,stages:rec.stages,...(NATIVE?{src:'ios'}:{})});
          this.lastSent=out;
          if(this.pending===rec){ this.pending=null; drop(KEY.pending); }
        }catch(e){
          if(e.status===409&&again){
            again=false;
            const {uid,name}=this.state;
            try{
              const r=await this.call('POST','/v1/register',{uid,name,terms:TERMS_VERSION});
              if(this.state.uid===uid&&this.state.name===name){ this.state={joined:true,name:r.name||name,uid,pid:r.pid||this.state.pid||''}; save(KEY.rank,this.state); }
            }catch(e2){ return null; }
            continue;
          }
          if(e.status===0||e.status===429||e.status>=500) return null;
          if(this.pending===rec){ this.pending=null; drop(KEY.pending); }
          return {rejected:true};
        }
      }
      return out;
    })().finally(()=>{ this.pushing=null; });
    return this.pushing;
  },
  async join(raw){
    const name=cleanName(raw);
    if(!name) return '名前を入れてください';
    const uid=this.state.uid||newUid();
    try{
      const r=await this.call('POST','/v1/register',{uid,name,terms:TERMS_VERSION});
      this.state={joined:true,name:r.name||name,uid,pid:r.pid||''}; save(KEY.rank,this.state);
      if(last&&resultOpen()&&!this.pending&&!this.lastSent) this.enqueue(last);
      this.push().then(r2=>{ if(resultOpen()) reportRank(r2); }).catch(()=>{});
      return null;
    }catch(e){
      if(e.code==='ng name'||e.code==='bad name') return 'その名前は使えません';
      if(e.status===429) return '少し時間をおいて試してください';
      return 'つながりませんでした';
    }
  },
  async leave(){
    try{
      await this.call('POST','/v1/leave',{uid:this.state.uid});
      this.state={}; drop(KEY.rank); this.pending=null; drop(KEY.pending); this.lastSent=null;
      return null;
    }catch(e){ return 'つながりませんでした。もう一度試してください'; }
  },
};
const resultOpen=()=>!$('result').hidden&&!$('rkOpen').hidden;
function setStatus(text){ const s=$('rkStatus'); s.textContent=text||''; s.hidden=!text; }
function refreshResultButton(){
  $('rkOpen').textContent=!Rank.joined&&last?'ランキングに載せる':'ランキングを見る';
}
function reportRank(r){
  if(!r){ setStatus(Rank.pending?'記録はあとで送ります（いまはつながりません）':''); return; }
  if(r.rejected){ setStatus('記録を送れませんでした'); return; }
  setStatus(r.hidden?'記録を送りました':`ランキング ${r.rank} 位（${r.total} 人中）`);
}
function onResult(o){
  const over=!!o.over;
  $('rkOpen').hidden=!over; $('psShare').hidden=!over; $('psRow').hidden=!over; setStatus('');
  if(over){ lastCleared=o.cleared||0; persist(); sleepOK(); }
  if(over&&NATIVE&&NATIVE.gameOver){ try{ NATIVE.gameOver(); }catch(e){} }
  last=null; Rank.lastSent=null;
  if(!over) return;
  if(!TRIAL&&o.official&&o.cleared>=1&&Array.isArray(o.stages)&&o.stages.length===o.cleared){
    last={cleared:o.cleared,stages:o.stages};
    if(Rank.joined){
      Rank.enqueue(last); setStatus('記録を送っています…');
      Rank.push().then(reportRank).catch(()=>setStatus(''));
    }
  }
  refreshResultButton();
}
async function share(){
  const url=(NATIVE&&NATIVE.shareURL)||SITE_URL;
  const text=lastCleared>0?`Pourfect Sommelier で ${lastCleared} 組のお客様にご満足いただけました。\n${url}`:`ボトルのワインを、人数分ぴったりに注ぎ分ける「Pourfect Sommelier」。\n${url}`, data={text};
  if(NATIVE){ try{ await NATIVE.share(text); }catch(e){} return; }
  if(navigator.share&&(!navigator.canShare||navigator.canShare(data))){
    try{ await navigator.share(data); return; }catch(e){ if(e&&e.name==='AbortError') return; }
  }
  window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
}
function persist(){ if(NATIVE) return; try{ if(navigator.storage&&navigator.storage.persist&&!/Firefox\//.test(navigator.userAgent)) navigator.storage.persist().catch(()=>{}); }catch(e){} }
let lock=null;
async function wake(){ if(NATIVE){ NATIVE.keepAwake(true); return; } try{ if(navigator.wakeLock&&!lock&&!document.hidden){ lock=await navigator.wakeLock.request('screen'); lock.addEventListener('release',()=>{ lock=null; }); } }catch(e){} }
function sleepOK(){ if(NATIVE){ NATIVE.keepAwake(false); return; } if(lock){ lock.release().catch(()=>{}); lock=null; } }
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&g&&g.phase()!=='title'&&g.phase()!=='result') wake(); });
function storageOK(){ try{ localStorage.setItem(KEY.probe,'1'); localStorage.removeItem(KEY.probe); return true; }catch(e){ return false; } }
let rankSeq=0;
let behind=[];
function openRank(view){
  const my=++rankSeq, sheet=$('rankSheet');
  if(sheet.hidden){ behind=Array.from($('app').children).filter(c=>c!==sheet&&!c.inert); for(const c of behind) c.inert=true; }
  sheet.hidden=false;
  const body=$('rankBody'); body.innerHTML=''; body.scrollTop=0;
  if(view==='join'||view==='rename') renderJoin(body,view==='rename');
  else renderBoard(body,my);
  if(!sheet.contains(document.activeElement)){ const b=sheet.querySelector('button'); if(b) b.focus({preventScroll:true}); }
}
function closeRank(){
  rankSeq++; $('rankSheet').hidden=true;
  for(const c of behind) c.inert=false;
  behind=[];
  if(resultOpen()) refreshResultButton();
}
async function renderBoard(body,my){
  body.append(el('p','rk-empty','読み込み中…'));
  try{
    if(Rank.joined) await Rank.push().catch(()=>{});
    const q=new URLSearchParams({ver:VER,limit:String(BOARD_SIZE)});
    if(Rank.joined) q.set('uid',Rank.state.uid);
    const r=await Rank.call('GET',`/v1/board?${q}`);
    if(my!==rankSeq) return;
    body.innerHTML='';
    const head=el('div','rk-head');
    head.append(el('span',null,`参加 ${r.total} 人`));
    if(Rank.joined){ const me=el('button','rk-link'); me.append(nameFont(el('span',null,Rank.state.name),Rank.state.name),document.createTextNode('（名前を変える）')); me.onclick=()=>{ tap(); openRank('rename'); }; head.append(me); }
    body.append(head);
    if(r.mine&&r.mine.hidden) body.append(el('p','rk-small','あなたの名前は運営が確認中のため、ほかの人には表示されていません'));
    const top=Array.isArray(r.top)?r.top:[];
    if(!top.length) body.append(el('p','rk-empty','まだ誰の記録もありません'));
    else {
      const list=el('ol','rk-list');
      for(const e of top){
        const li=el('li','rk-row'+(e.mine?' mine':''));
        const score=el('span','rk-score'); score.append(el('b',null,String(e.cleared)),document.createTextNode(' 組'));
        li.append(el('span','rk-rank',String(e.rank)),nameFont(el('span','rk-name',e.name),e.name),score);
        if(!e.mine&&Rank.joined){
          li.classList.add('tap'); li.tabIndex=0; li.setAttribute('aria-expanded','false');
          li.onclick=()=>rowDetail(list,li,e);
          li.onkeydown=ev=>{ if(ev.target===li&&(ev.key==='Enter'||ev.key===' ')){ ev.preventDefault(); li.click(); } };
        }
        list.append(li);
      }
      body.append(list);
      if(Rank.joined) body.append(el('p','rk-small','名前を押すと、通報・表示しないができます'));
    }
    if(Rank.joined&&!top.some(e=>e.mine)) body.append(el('p','rk-mine',r.myRank&&r.mine?`あなたは ${r.myRank} 位（${r.mine.cleared} 組）`:'あなたの記録はまだありません。1 組でもご満足いただけると載ります'));
    if(!Rank.joined){
      const rec=last||Rank.pending;
      if(rec){ if(!last) last=rec; const b=el('button','btn',`${rec.cleared} 組の記録を載せる`); b.onclick=()=>{ tap(); openRank('join'); }; body.append(b); }
      else body.append(el('p','rk-small','1 組でもご満足いただけると、終わったときの画面から記録を載せられます'));
    }
  }catch(e){
    if(my!==rankSeq) return;
    body.innerHTML='';
    body.append(el('p','rk-empty','つながりませんでした'));
    const again=el('button','btn ghost','もう一度読む'); again.onclick=()=>{ tap(); openRank(); }; body.append(again);
  }
}
function rowDetail(list,li,e){
  const open=li.querySelector('.rk-detail');
  for(const d of list.querySelectorAll('.rk-detail')){ d.parentNode.setAttribute('aria-expanded','false'); d.remove(); }
  if(open) return;
  const box=el('div','rk-detail'); box.append(rowMenu(li,e));
  li.append(box); li.setAttribute('aria-expanded','true');
  try{ box.scrollIntoView({block:'nearest',behavior:'smooth'}); }catch(_){}
}
function rowMenu(li,e){
  const m=el('div','rk-menu'), act=(label,path,extra,done)=>{
    const b=el('button',null,label);
    b.onclick=async ev=>{ ev.stopPropagation(); b.disabled=true; try{ await Rank.call('POST',path,{uid:Rank.state.uid,pid:e.pid,...extra}); li.remove(); note(done); }catch(_){ b.disabled=false; note('つながりませんでした'); } };
    m.append(b);
  };
  act('この人を表示しない','/v1/block',{},`「${e.name}」を表示しないにしました`);
  act('通報する（名前）','/v1/report',{reason:'name'},'通報しました。ありがとうございます');
  act('通報する（ありえない記録）','/v1/report',{reason:'cheat'},'通報しました。ありがとうございます');
  return m;
}
function note(text){ const t=el('div','rk-note',text); $('rankSheet').querySelector('.rsheet').append(t); setTimeout(()=>t.remove(),2400); }
function renderJoin(body,renaming){
  const box=el('div',renaming?'rk-join renaming':'rk-join');
  box.append(el('p','rk-lead',renaming?'新しい名前':'ランキングに出る名前を決めてください'));
  const input=el('input','rk-input'); input.type='text'; input.maxLength=40; input.placeholder='名前'; input.autocomplete='off'; input.value=renaming?Rank.state.name:'';
  const count=el('div','rk-count'), upd=()=>{ const n=graphemes(cleanText(input.value)).length, over=n>NAME_MAX; count.textContent=`${n} / ${NAME_MAX} 文字`+(over?`（${NAME_MAX} 文字まで）`:''); count.classList.toggle('over',over); nameFont(input,input.value); };
  input.oninput=upd; upd();
  box.append(input,count);
  const terms=el('div','rk-terms'); terms.append(el('b',null,'利用規約'));
  const ul=el('ul'); for(const t of TERMS) ul.append(el('li',null,t)); terms.append(ul);
  box.append(terms);
  const row=el('label','rk-agree'), agree=el('input'); agree.type='checkbox'; row.append(agree,document.createTextNode(' 利用規約に同意する'));
  box.append(row);
  const msg=el('p','rk-error'), label=renaming?'この名前にする':'この名前で載せる', go=el('button','btn',label);
  go.onclick=async()=>{
    if(!agree.checked){ msg.textContent='利用規約に同意してください'; return; }
    tap(); go.disabled=true; go.textContent='送っています…';
    const my=rankSeq, err=await Rank.join(input.value);
    if(my!==rankSeq) return;
    if(err){ msg.textContent=err; go.disabled=false; go.textContent=label; return; }
    openRank();
  };
  box.append(msg,go);
  const back=el('button','rk-link','もどす'); back.onclick=()=>{ tap(); openRank(); }; box.append(back);
  if(renaming){
    const leave=el('button','rk-danger','ランキングをやめて記録を消す'); let armed=false;
    leave.onclick=async()=>{
      if(!armed){ armed=true; leave.textContent='もう一度押すと、名前と記録を消します'; return; }
      leave.disabled=true; leave.textContent='消しています…';
      const my=rankSeq, err=await Rank.leave();
      if(my!==rankSeq) return;
      if(err){ msg.textContent=err; leave.disabled=false; armed=false; leave.textContent='ランキングをやめて記録を消す'; return; }
      if(!resultOpen()) last=null;
      openRank();
    };
    box.append(leave,el('p','rk-id',`ID（問い合わせのときに使います）: ${Rank.state.pid}`));
  }
  body.append(box);
}
let store=null, storeBusy='', storeMsg='', storeBehind=[];
const STORE_MSG={
  purchased:'', cancelled:'',
  pending:'承認を待っています。承認されると広告が消えます',
  nothingToRestore:'この Apple アカウントには、復元できる購入がありません',
  unavailable:'いまストアにつながりません。通信を確かめて、もう一度試してください',
  failed:'購入を確かめられませんでした。もう一度試してください',
};
function storeLink(){
  const a=$('psAdsLink'), sep=$('psAdsSep'); if(!a) return;
  const show=!!(store&&store.ads&&!store.removed);
  a.hidden=!show; if(sep) sep.hidden=!show;
}
function openStore(){
  const sheet=$('storeSheet');
  if(sheet.hidden){ storeBehind=Array.from($('app').children).filter(c=>c!==sheet&&!c.inert); for(const c of storeBehind) c.inert=true; }
  sheet.hidden=false; storeMsg=''; renderStore();
  NATIVE.storeOpen().then(s=>{ if(s){ store=s; storeLink(); if(!$('storeSheet').hidden&&!storeBusy) renderStore(); } }).catch(()=>{});
  const b=sheet.querySelector('button'); if(b) b.focus({preventScroll:true});
}
function closeStore(){
  const sheet=$('storeSheet'); if(!sheet||sheet.hidden) return;
  sheet.hidden=true; for(const c of storeBehind) c.inert=false; storeBehind=[];
}
function renderStore(){
  const body=$('storeBody'); body.innerHTML='';
  if(store&&store.removed){
    body.append(el('p','st-lead','広告を消しました。ありがとうございます。'),el('p','rk-small','遊べる内容は変わりません。'));
    return;
  }
  const price=(store&&store.price)||'¥300';
  body.append(el('p','st-lead','上のバナーと、5 回遊び終えるごとの全画面の広告が出なくなります。'),el('p','rk-small','遊べる内容は変わりません。買い切りで、そのあとお金はかかりません。'));
  const buy=el('button','btn',storeBusy==='buy'?'購入しています…':`広告を消す（${price}）`); buy.disabled=!!storeBusy;
  buy.onclick=()=>storeRun('buy');
  const st=el('p','rk-status',storeMsg); st.hidden=!storeMsg; st.setAttribute('aria-live','polite');
  const rs=el('button','rk-link',storeBusy==='restore'?'確かめています…':'購入を復元'); rs.disabled=!!storeBusy;
  rs.onclick=()=>storeRun('restore');
  body.append(buy,st,rs,el('p','rk-small','前に買ったことがあれば、同じ Apple アカウントで「購入を復元」を押すと戻ります。'));
}
async function storeRun(kind){
  if(storeBusy) return;
  tap(); storeBusy=kind; storeMsg=''; renderStore();
  let r='failed';
  try{ r=await (kind==='buy'?NATIVE.buy():NATIVE.restore()); }catch(e){}
  storeBusy=''; storeMsg=STORE_MSG[r]||'';
  if(r==='purchased'&&store) store.removed=true;
  storeLink(); if(!$('storeSheet').hidden) renderStore();
}
const STORE_HTML=`
<div id="storeSheet" class="rk-overlay" hidden><div class="rsheet" role="dialog" aria-modal="true" aria-labelledby="stTitle">
  <p class="cap">買い切り</p>
  <h2 id="stTitle">広告を消す</h2>
  <div id="storeBody" class="st-body"></div>
  <button id="stClose" class="btn ghost rk-close">閉じる</button>
</div></div>`;
const SHEET_HTML=`
<div id="rankSheet" class="rk-overlay" hidden><div class="rsheet" role="dialog" aria-modal="true" aria-labelledby="rkTitle">
  <p class="cap">ライフ 3 つ · ご満足いただけた組の数</p>
  <h2 id="rkTitle">ランキング</h2>
  <div id="rankBody"></div>
  <button id="rkClose" class="btn ghost rk-close">閉じる</button>
</div></div>`;
function moreHint(){ const b=$('rankBody'); if(b) b.style.setProperty('--more',Math.max(0,Math.min(34,b.scrollHeight-b.scrollTop-b.clientHeight))+'px'); }
function build(){
  $('app').insertAdjacentHTML('beforeend',SHEET_HTML);
  { const b=$('rankBody'); b.addEventListener('scroll',moreHint,{passive:true});
    new MutationObserver(moreHint).observe(b,{childList:true,subtree:true,characterData:true});
    if(typeof ResizeObserver!=='undefined') new ResizeObserver(moreHint).observe(b); }
  const tb=el('button','btn ghost','ランキング'); tb.id='rkTitleBtn'; $('btnStart').after(tb);
  tb.onclick=()=>{ if(!g||g.phase()!=='title') return; tap(); openRank(); };
  const st=el('p','rk-status'); st.id='rkStatus'; st.hidden=true; st.setAttribute('aria-live','polite');
  const ob=el('button','btn ghost','ランキングを見る'); ob.id='rkOpen'; ob.hidden=true;
  const row=el('div','ps-row2'); row.id='psRow'; row.hidden=true; row.append(ob);
  const btns=$('btnRetry').parentNode; btns.before(st); $('btnRetry').after(row);
  ob.onclick=()=>{ if(!g||g.phase()!=='result') return; tap(); openRank(!Rank.joined&&last?'join':undefined); };
  const sh=el('button','btn ghost','結果をシェア'); sh.id='psShare'; sh.hidden=true; row.append(sh);
  sh.onclick=()=>{ if(!g||g.phase()!=='result') return; tap(); share(); };
  const foot=el('p','ps-foot'); foot.innerHTML=`${VERSION_LABEL}${NATIVE?'<span id="psAdsSep" hidden> · </span><button id="psAdsLink" type="button" hidden>広告を消す</button>':''} · <a href="${NATIVE?(NATIVE.privacyURL||SITE_URL+'privacy.html'):'privacy.html'}">プライバシー</a>`;
  $('tBest').after(foot);
  if(!storageOK()){ const n=el('p','ps-note','このタブでは記録が残りません（シークレットのタブなど）'); foot.before(n); }
  for(const id of ['btnStart','btnRetry','btnNext']) $(id).addEventListener('click',wake);
  $('rkClose').onclick=()=>{ tap(); closeRank(); };
  if(NATIVE&&NATIVE.storeOpen){
    $('app').insertAdjacentHTML('beforeend',STORE_HTML);
    $('psAdsLink').onclick=()=>{ if(!g||g.phase()!=='title') return; tap(); openStore(); };
    $('stClose').onclick=()=>{ tap(); closeStore(); };
    $('storeSheet').addEventListener('click',e=>{ if(e.target===$('storeSheet')) closeStore(); });
    storeLink();
  }
  $('rankSheet').addEventListener('click',e=>{ if(e.target===$('rankSheet')) closeRank(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!e.isComposing&&!$('rankSheet').hidden){ e.preventDefault(); closeRank(); } });
  document.addEventListener('keydown',e=>{ const s=$('storeSheet'); if(s&&e.key==='Escape'&&!e.isComposing&&!s.hidden){ e.preventDefault(); closeStore(); } });
}
window.addEventListener('storage',e=>{
  if(e.key===KEY.rank) Rank.state=load(KEY.rank)||{};
  if(e.key===KEY.pending) Rank.pending=load(KEY.pending);
});
window.addEventListener('online',()=>{ if(g&&Rank.joined&&Rank.pending) Rank.push().then(r=>{ if(r&&resultOpen()) reportRank(r); }).catch(()=>{}); });
window.PS_WEB={
  attach(api){
    g=api; build(); persist();
    if(Rank.joined&&Rank.pending) Rank.push().catch(()=>{});
    if('serviceWorker' in navigator&&location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
  },
  onResult,
  haptic:NATIVE?(name,p)=>{ try{ NATIVE.haptic(name,p); }catch(e){} }:undefined,
  onRunStart:NATIVE?()=>{ try{ NATIVE.runStart(!!(g&&g.soundOn&&g.soundOn())); }catch(e){} }:undefined,
  hold(on){ try{ if(g&&g.hold) g.hold(!!on); }catch(e){} },
  onTitle(){ last=null; sleepOK(); if($('rankSheet')) closeRank(); },
  onStore(s){ if(!s) return; store=s; storeLink(); if($('storeSheet')&&!$('storeSheet').hidden&&!storeBusy) renderStore(); },
};
if(LOCAL) window.PS_WEB._rank=Rank;
})();
