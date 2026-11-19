(function(){
'use strict';
const NATIVE=window.PS_NATIVE||null;
const WEB_VERSION='1.3.2';
const SITE_URL='https://pourfect-sommelier.kumao.app/';
const APP_URL='https://apps.apple.com/jp/app/id6834156070?pt=129314143&ct=web&mt=8';
const IOS_DEVICE=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const VERSION_LABEL=NATIVE?`iOS 版 ${NATIVE.version}`:`ブラウザ版 ${WEB_VERSION}`;
const LOCAL=/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const API=(NATIVE&&NATIVE.api)||(LOCAL&&new URLSearchParams(location.search).get('ranking')==='local'?'http://127.0.0.1:8792':'https://pourfectsommelier-ranking.saikyo-eigo.workers.dev');
const VER='p1', TERMS_VERSION=2, NAME_MAX=10, BOARD_SIZE=50, TIMEOUT_MS=8000;
const KEY={rank:'pourfect-sommelier.ranking',pending:'pourfect-sommelier.pending',probe:'pourfect-sommelier.probe',save:'pourfect-sommelier.v1',badges:'pourfect-sommelier.badges'};
const TRIAL=['debug','stage','gallery'].some(k=>new URLSearchParams(location.search).has(k));
const TERMS_PROMO='ランキングの名前と組の数を、運営がゲームの紹介（X などの SNS）に載せることがあります。載せてほしくないときは、お問い合わせからお知らせください。';
const TERMS=[
  'ランキングには、決めた名前と、ご満足いただけた組の数が表示されます。',
  TERMS_PROMO,
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
class HttpError extends Error{ constructor(status,code,reason){ super(code||`HTTP ${status}`); this.status=status; this.code=code; this.reason=reason; } }
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
  get termsAgreed(){ return this.state.terms||1; },
  get needsTerms(){ return this.joined&&this.termsAgreed<TERMS_VERSION&&(this.state.asked||0)<TERMS_VERSION; },
  async call(method,path,body){
    if(method!=='GET') boardCache.clear();
    if(NATIVE){
      let r=null; try{ r=await NATIVE.fetch(method,API+path,body?JSON.stringify(body):null,TIMEOUT_MS); }catch(e){}
      if(!r||!r.status) throw new HttpError(0,'offline');
      let j={}; try{ j=JSON.parse(r.body); }catch(e){}
      if(r.status<200||r.status>=300) throw new HttpError(r.status,j.error,j.reason);
      return j;
    }
    const ctl=new AbortController(), timer=setTimeout(()=>ctl.abort(),TIMEOUT_MS);
    try{
      const res=await fetch(API+path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined,signal:ctl.signal,cache:'no-store'});
      let j={}; try{ j=await res.json(); }catch(e){}
      if(!res.ok) throw new HttpError(res.status,j.error,j.reason);
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
      let out=this.lastSent||null;
      while(this.pending&&this.joined){
        const rec=this.pending, uid=this.state.uid;
        if(rec.ver!==VER){ this.pending=null; drop(KEY.pending); continue; }
        try{
          out=await this.call('POST','/v1/submit',{uid,ver:VER,cleared:rec.cleared,stages:rec.stages,...(NATIVE?{src:'ios'}:{})});
          this.lastSent=out;
          if(this.pending===rec){ this.pending=null; drop(KEY.pending); }
        }catch(e){
          if(e.status===409){
            if(this.state.uid===uid) this.forget();
            return {gone:true};
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
      this.state={joined:true,name:r.name||name,uid,pid:r.pid||'',terms:TERMS_VERSION}; save(KEY.rank,this.state);
      if(last&&resultOpen()&&!this.pending&&!this.lastSent) this.enqueue(last);
      this.push().then(r2=>{ if(resultOpen()) reportRank(r2); }).catch(()=>{});
      return null;
    }catch(e){
      if(e.code==='ng name'&&e.reason==='taken') return this.joined?['その名前は、','ほかの人が使っています']:['その名前は、ほかの人が使っています。','別の端末の自分の名前なら、','一覧の下の「引き継ぎコードで戻す」から'];
      if(e.code==='ng name'||e.code==='bad name') return 'その名前は使えません';
      if(e.status===429) return '少し時間をおいて試してください';
      return 'つながりませんでした';
    }
  },
  async agree(){
    const uid=this.state.uid;
    try{
      let name=this.state.name;
      const b=await this.call('GET',`/v1/board?${new URLSearchParams({ver:VER,uid,limit:'1'})}`);
      if(b&&b.mine&&b.mine.name) name=b.mine.name;
      const r=await this.call('POST','/v1/register',{uid,name,terms:TERMS_VERSION});
      if(this.state.uid===uid){ this.state={...this.state,joined:true,name:r.name||name,pid:r.pid||this.state.pid||'',terms:TERMS_VERSION}; save(KEY.rank,this.state); }
      return null;
    }catch(e){
      if(e.code==='ng name'||e.code==='bad name') return '今の名前では送れません。「名前を変える」から変えてください';
      if(e.status===429) return '少し時間をおいて試してください';
      return 'つながりませんでした';
    }
  },
  async code(rotate){
    const uid=this.state.uid;
    try{ const r=await this.call('POST',rotate?'/v1/code/rotate':'/v1/code',{uid}); return {code:r.code}; }
    catch(e){
      if(e.status===409){ if(this.state.uid===uid) this.forget(); return {err:GONE_MSG.join('')}; }
      return {err:e.status===429?'少し時間をおいて試してください':'つながりませんでした'};
    }
  },
  async restore(raw){
    const t=String(raw||'').normalize('NFKC'), code=t.toUpperCase().replace(/[^A-Z0-9]/g,'');
    if(/[\u3040-\u30ff\u4e00-\u9fff]/.test(t.replace(/ー/g,''))) return 'かなになっています。英字（ABC）のキーボードで入れてください';
    if(code.length!==12) return 'コードは 12 文字です（- は無くてもかまいません）';
    try{
      const r=await this.call('POST','/v1/code/use',{code,ver:VER});
      const carry=last&&resultOpen()&&!this.pending&&!this.lastSent;
      this.state={joined:true,uid:r.uid,name:r.name,pid:r.pid||'',terms:r.terms||1}; save(KEY.rank,this.state); this.lastSent=null; drop(KEY.badges);
      if(carry) this.enqueue(last);
      try{ const sv=load(KEY.save)||{}; if((r.best||0)>(sv.bestStage||0)){ sv.bestStage=r.best; save(KEY.save,sv); } }catch(e){}
      return null;
    }catch(e){
      if(e.status===404) return 'そのコードは見つかりません。作り直したコードは、前のものが使えなくなります';
      if(e.status===400) return 'コードの形が違います（英字と数字の 12 文字）';
      if(e.status===429) return '少し時間をおいて試してください';
      return 'つながりませんでした';
    }
  },
  later(){ this.state={...this.state,asked:TERMS_VERSION}; save(KEY.rank,this.state); },
  async leave(){
    try{
      await this.call('POST','/v1/leave',{uid:this.state.uid});
      this.forget();
      return null;
    }catch(e){ return 'つながりませんでした。もう一度試してください'; }
  },
  forget(){ this.state={}; drop(KEY.rank); this.pending=null; drop(KEY.pending); this.lastSent=null; drop(KEY.badges); showBadges(null); },
};
const GONE_MSG=['この名前はランキングを','やめています','（ほかの端末でやめたなど）'];
const resultOpen=()=>!$('result').hidden&&!$('rkOpen').hidden;
function setStatus(text){
  const s=$('rkStatus');
  if(Array.isArray(text)) s.replaceChildren(...text.map(t=>el('span','nb',t))); else s.textContent=text||'';
  s.hidden=!(Array.isArray(text)?text.length:text);
}
function refreshResultButton(){
  $('rkOpen').textContent=!Rank.joined&&last?'ランキングに載せる':'ランキングを見る';
}
function reportRank(r){
  if(!r){ setStatus(Rank.pending?'記録はあとで送ります（いまはつながりません）':''); return; }
  if(r.rejected){ setStatus('記録を送れませんでした'); return; }
  if(r.gone){ setStatus(GONE_MSG); refreshResultButton(); return; }
  if(r.hidden) setStatus('記録を送りました');
  else if(r.ranks&&r.ranks.today&&r.ranks.week) setStatus(`今日 ${r.ranks.today}位・今週 ${r.ranks.week}位・全期間 ${r.ranks.all}位`);
  else setStatus(`ランキング ${r.rank} 位（${r.total} 人中）`);
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
const TABS=[['today','今日'],['week','今週'],['all','全期間']];
let rankTab='today';
const boardCache=new Map(), BOARD_TTL=20000;
function badgeText(b){ const t=[]; if(b&&b.day) t.push(`🍷×${b.day}`); if(b&&b.week) t.push(`🏆×${b.week}`); return t.join(' '); }
function renderTabs(show){
  const box=$('rkTabs'); if(!box) return;
  box.hidden=!show; box.innerHTML='';
  if(!show) return;
  for(const [id,label] of TABS){
    const b=el('button','rk-tab'+(id===rankTab?' on':''),label); b.type='button'; b.setAttribute('aria-pressed',String(id===rankTab));
    b.onclick=()=>{ if(rankTab===id) return; tap(); rankTab=id; openRank(); };
    box.append(b);
  }
}
let behind=[];
function openRank(view){
  const my=++rankSeq, sheet=$('rankSheet');
  if(sheet.hidden){ behind=Array.from($('app').children).filter(c=>c!==sheet&&!c.inert); for(const c of behind) c.inert=true; }
  sheet.hidden=false;
  const body=$('rankBody'); body.innerHTML=''; body.scrollTop=0;
  const boardView=!(view==='join'||view==='rename'||view==='restore')&&!(!view&&Rank.needsTerms);
  renderTabs(boardView);
  if(view==='restore') renderRestore(body);
  else if(view==='join'||view==='rename') renderJoin(body,view==='rename');
  else if(!view&&Rank.needsTerms) renderNewTerms(body);
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
    const tab=rankTab, q=new URLSearchParams({ver:VER,board:tab,limit:String(BOARD_SIZE)});
    if(Rank.joined) q.set('uid',Rank.state.uid);
    const ck=`${tab}:${Rank.joined?Rank.state.uid:''}`, hit=boardCache.get(ck);
    const r=hit&&Date.now()-hit.t<BOARD_TTL?hit.r:await Rank.call('GET',`/v1/board?${q}`);
    if(!hit||hit.r!==r) boardCache.set(ck,{t:Date.now(),r});
    if(my!==rankSeq) return;
    body.innerHTML='';
    if(tab!=='all'&&r.board!==tab){ body.append(el('p','rk-empty','今日・今週のランキングは、もうすぐ始まります')); return; }
    if(tab==='week'&&r.from&&r.to){ const pd=el('p','rk-period'); pd.append(el('span','nb',`${mdw(r.from)}〜`),el('span','nb',mdw(r.to))); body.append(pd); }
    const head=el('div','rk-head');
    head.append(el('span',null,`${tab==='today'?'今日の参加':tab==='week'?'今週の参加':'参加'} ${r.total} 人`));
    if(Rank.joined){ const me=el('button','rk-link'); me.append(nameFont(el('span',null,Rank.state.name),Rank.state.name),document.createTextNode('（名前を変える）')); me.onclick=()=>{ tap(); openRank('rename'); }; head.append(me); }
    body.append(head);
    if(r.mine&&r.mine.hidden) body.append(el('p','rk-small','あなたの名前は運営が確認中のため、ほかの人には表示されていません'));
    const top=Array.isArray(r.top)?r.top:[];
    if(!top.length) body.append(el('p','rk-empty',tab==='today'?'今日は まだ誰の記録もありません。いちばん乗りのチャンス！':tab==='week'?'今週は まだ誰の記録もありません':'まだ誰の記録もありません'));
    else {
      const list=el('ol','rk-list');
      for(const e of top){
        const li=el('li','rk-row'+(e.mine?' mine':''));
        const score=el('span','rk-score'); score.append(el('b',null,String(e.cleared)),document.createTextNode(' 組'));
        const who=el('span','rk-who'); who.append(nameFont(el('span','rk-name',e.name),e.name));
        const bt=badgeText(e.badges); if(bt) who.append(el('span','rk-badges',bt));
        li.append(el('span','rk-rank',String(e.rank)),who,score);
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
    if(Rank.joined&&!top.some(e=>e.mine)) body.append(el('p','rk-mine',r.myRank&&r.mine?`あなたは ${r.myRank} 位（${r.mine.cleared} 組）${badgeText(r.mine.badges)?' '+badgeText(r.mine.badges):''}`:tab==='all'?'あなたの記録はまだありません。1 組でもご満足いただけると載ります':tab==='today'?'今日の記録はまだありません':'今週の記録はまだありません'));
    if(!Rank.joined){
      const rec=last||Rank.pending;
      if(rec){ if(!last) last=rec; const b=el('button','btn',`${rec.cleared} 組の記録を載せる`); b.onclick=()=>{ tap(); openRank('join'); }; body.append(b); }
      else body.append(el('p','rk-small','1 組でもご満足いただけると、終わったときの画面から記録を載せられます'));
      const back=el('button','rk-link','引き継ぎコードで戻す'); back.onclick=()=>{ tap(); openRank('restore'); }; body.append(back);
    }
    const bx=el('p','rk-small rk-badgenote');
    for(const t of ['ソムリエバッジ：','毎日 23:59 で締めて','その日の 1 位に🍷、','毎週木曜 23:59 で締めて','その週（金〜木）の 1 位に🏆を 1 個。',
      'この端末の記録に付くので、','ランキングをやめたり',NATIVE?'アプリを消したりすると、':'ブラウザのデータが消えたりすると、','バッジも消えます。']) bx.append(el('span','nb',t));
    body.append(bx);
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
function termsBox(markNew){
  const terms=el('div','rk-terms'); terms.append(el('b',null,'利用規約'));
  const ul=el('ul');
  for(const t of TERMS){
    const li=el('li',null,t);
    if(markNew&&t===TERMS_PROMO){ li.className='new'; li.prepend(el('span','rk-new','新')); }
    ul.append(li);
  }
  terms.append(ul);
  return terms;
}
function renderNewTerms(body){
  const box=el('div','rk-join');
  box.append(el('p','rk-lead','利用規約が新しくなりました'));
  const lead=el('p','rk-small');
  for(const t of ['ランキングの名前と組の数を、','ゲームの紹介に載せることがある、','という一文を足しました。']) lead.append(el('span','nb',t));
  box.append(lead,termsBox(true));
  const msg=el('p','rk-error'), go=el('button','btn','同意する'), later=el('button','rk-link','同意しないで続ける');
  go.onclick=async()=>{
    tap(); go.disabled=true; later.disabled=true; go.textContent='送っています…';
    const my=rankSeq, err=await Rank.agree();
    if(my!==rankSeq) return;
    if(err){ msg.textContent=err; go.disabled=false; later.disabled=false; go.textContent='同意する'; return; }
    openRank();
  };
  later.onclick=()=>{ tap(); Rank.later(); openRank(); };
  const note2=el('p','rk-small');
  for(const t of ['同意しなくても、今までどおり遊べて、','ランキングにも載ります（紹介には使いません）。']) note2.append(el('span','nb',t));
  box.append(msg,go,note2,later);
  body.append(box);
}
function renderJoin(body,renaming){
  const box=el('div',renaming?'rk-join renaming':'rk-join');
  box.append(el('p','rk-lead',renaming?'新しい名前':'ランキングに出る名前を決めてください'));
  const input=el('input','rk-input'); input.type='text'; input.maxLength=40; input.placeholder='名前'; input.autocomplete='off'; input.value=renaming?Rank.state.name:'';
  const count=el('div','rk-count'), upd=()=>{ const n=graphemes(cleanText(input.value)).length, over=n>NAME_MAX; count.textContent=`${n} / ${NAME_MAX} 文字`+(over?`（${NAME_MAX} 文字まで）`:''); count.classList.toggle('over',over); nameFont(input,input.value); };
  input.oninput=upd; upd();
  box.append(input,count);
  box.append(termsBox(false));
  const row=el('label','rk-agree'), agree=el('input'); agree.type='checkbox'; row.append(agree,document.createTextNode(' 利用規約に同意する'));
  box.append(row);
  const msg=el('p','rk-error'), label=renaming?'この名前にする':'この名前で載せる', go=el('button','btn',label);
  go.onclick=async()=>{
    if(!agree.checked){ msg.textContent='利用規約に同意してください'; return; }
    tap(); go.disabled=true; go.textContent='送っています…';
    const my=rankSeq, err=await Rank.join(input.value);
    if(my!==rankSeq) return;
    if(err){ msg.replaceChildren(...[].concat(err).map(t=>el('span','nb',t))); go.disabled=false; go.textContent=label; return; }
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
    box.append(codeBox(),leave,el('p','rk-id',`ID（問い合わせのときに使います）: ${Rank.state.pid}`));
  }
  body.append(box);
}
const fmtCode=c=>String(c||'').replace(/(.{4})(?=.)/g,'$1-');
function codeBox(){
  const box=el('div','rk-codebox');
  box.append(el('b',null,'引き継ぎコード'));
  const desc=el('p','rk-small');
  for(const t of ['別のブラウザや端末（iPhone アプリも）で','「引き継ぎコードで戻す」に入れると、','名前・記録・ソムリエバッジ・ベストの記録が移ります。','どちらの端末でも遊べます。']) desc.append(el('span','nb',t));
  const area=el('div','rk-codearea'), msg=el('p','rk-error');
  const show=el('button','btn ghost','引き継ぎコードを出す');
  const put=(code)=>{
    area.innerHTML='';
    const out=el('input','rk-input rk-code'); out.readOnly=true; out.value=fmtCode(code); out.setAttribute('aria-label','引き継ぎコード');
    out.onfocus=()=>{ try{ out.select(); }catch(e){} };
    const copy=el('button','btn ghost','コピー');
    copy.onclick=async()=>{ tap(); try{ await navigator.clipboard.writeText(out.value); copy.textContent='コピーしました'; }catch(e){ out.focus(); out.select(); copy.textContent='長押しでコピーしてください'; } };
    const warn=el('p','rk-small');
    for(const t of ['コードを知っている人は、','あなたとして記録を載せられます。','人に教えないでください。']) warn.append(el('span','nb',t));
    const remake=el('button','rk-link','コードを作り直す'); let armed=false;
    remake.onclick=async()=>{
      if(!armed){ armed=true; remake.textContent='もう一度押すと作り直します（前のコードは使えなくなります）'; return; }
      remake.disabled=true; const r=await Rank.code(true); remake.disabled=false; armed=false;
      if(r.err){ msg.textContent=r.err; remake.textContent='コードを作り直す'; return; }
      msg.textContent=''; put(r.code);
    };
    area.append(out,copy,warn,remake);
  };
  show.onclick=async()=>{
    tap(); show.disabled=true; show.textContent='出しています…';
    const r=await Rank.code(false);
    if(r.err){ msg.textContent=r.err; show.disabled=false; show.textContent='引き継ぎコードを出す'; return; }
    show.remove(); msg.textContent=''; put(r.code);
  };
  const other=el('button','rk-link','別の端末の記録に切り替える'); other.onclick=()=>{ tap(); openRank('restore'); };
  box.append(desc,show,area,msg,other);
  return box;
}
function renderRestore(body){
  const box=el('div','rk-join');
  box.append(el('p','rk-lead','引き継ぎコードで戻す'));
  const lead=el('p','rk-small');
  for(const t of ['前の端末の「名前を変える」で出したコードを入れると、','名前・記録・ソムリエバッジ・ベストの記録が','この端末に移ります。']) lead.append(el('span','nb',t));
  box.append(lead);
  if(Rank.joined){
    const w=el('p','rk-small rk-warn');
    for(const t of [`いまの名前「${Rank.state.name}」から切り替わります。`,'いまの名前の記録はサーバーに残ります。']) w.append(el('span','nb',t));
    box.append(w);
  }
  const input=el('input','rk-input rk-code'); input.type='text'; input.maxLength=20; input.placeholder='XXXX-XXXX-XXXX'; input.autocomplete='off'; input.setAttribute('autocapitalize','characters'); input.spellcheck=false; input.setAttribute('autocorrect','off');
  const msg=el('p','rk-error'), go=el('button','btn','引き継ぐ');
  const say=t=>msg.replaceChildren(...(String(t||'').match(/[^。]+。?/g)||[]).map(x=>el('span','nb',x)));
  input.oninput=()=>say('');
  go.onclick=async()=>{
    tap(); go.disabled=true; go.textContent='引き継いでいます…';
    const my=rankSeq, err=await Rank.restore(input.value);
    if(my!==rankSeq) return;
    if(err){ say(err); go.disabled=false; go.textContent='引き継ぐ'; return; }
    go.textContent='引き継ぎました';
    setTimeout(()=>location.reload(),700);
  };
  const back=el('button','rk-link','もどす'); back.onclick=()=>{ tap(); openRank(Rank.joined?'rename':undefined); };
  box.append(input,msg,go,back);
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
let quitBehind=[];
function quitOK(){ try{ return !!(g&&g.canQuit&&g.canQuit()); }catch(e){ return false; } }
function quitButton(){ const b=$('psQuit'); if(b) b.disabled=!quitOK(); }
function openQuit(){
  const sheet=$('quitSheet'); if(!sheet||!sheet.hidden||!quitOK()) return;
  quitBehind=Array.from($('app').children).filter(c=>c!==sheet&&!c.inert); for(const c of quitBehind) c.inert=true;
  sheet.hidden=false;
  $('qtNo').focus({preventScroll:true});
}
function closeQuit(){
  const sheet=$('quitSheet'); if(!sheet||sheet.hidden) return;
  sheet.hidden=true; for(const c of quitBehind) c.inert=false; quitBehind=[];
}
function quitNow(){
  closeQuit();
  let done=false; try{ done=!!(g&&g.quit&&g.quit()); }catch(e){}
  if(done&&NATIVE&&NATIVE.gameOver){ try{ NATIVE.gameOver(true); }catch(e){} }
}
const QUIT_HTML=`
<div id="quitSheet" class="rk-overlay" hidden><div class="rsheet" role="dialog" aria-modal="true" aria-labelledby="qtTitle">
  <h2 id="qtTitle">ゲームをやめますか？</h2>
  <p class="st-lead"><span class="nb">この回はここで終わりにして、</span><span class="nb">タイトルに戻ります。</span><span class="nb">ランキングには載りません。</span></p>
  <button id="qtYes" class="btn">やめてタイトルへ</button>
  <button id="qtNo" class="btn ghost rk-close">続ける</button>
</div></div>`;
let meAt=0, toastQ=[];
const WD='日月火水木金土';
const mdOf=(d)=>{ const [y,m,dd]=String(d).split('-').map(Number); return `${m}/${dd}`; };
const mdw=(d)=>{ const [y,m,dd]=String(d).split('-').map(Number); return `${m}/${dd}（${WD[new Date(Date.UTC(y,m-1,dd)).getUTCDay()]}）`; };
function showBadges(b){
  const line=$('psBadges'); if(!line) return;
  const t=b?badgeText(b):'';
  line.textContent=t?`ソムリエバッジ ${t}`:''; line.hidden=!t;
}
async function refreshMe(force){
  if(!Rank.joined||TRIAL) return;
  if(!force&&Date.now()-meAt<60000) return;
  meAt=Date.now();
  const uid=Rank.state.uid;
  let r=null;
  try{ r=await Rank.call('GET',`/v1/me?${new URLSearchParams({ver:VER,uid})}`); }
  catch(e){ if(e.status===409&&Rank.state.uid===uid) Rank.forget(); return; }
  if(!r||Rank.state.uid!==uid) return;
  const old=load(KEY.badges), first=!old, seen=new Set(old&&Array.isArray(old.seen)?old.seen:[]);
  const fresh=(r.recent||[]).filter(x=>!seen.has(`${x.kind}:${x.key}`)&&(!first||Date.now()-x.at<3*86400000));
  for(const x of r.recent||[]) seen.add(`${x.kind}:${x.key}`);
  save(KEY.badges,{day:r.badges.day,week:r.badges.week,seen:[...seen].slice(-60)});
  showBadges(r.badges);
  if(fresh.length){ toastQ.push(...fresh.reverse()); showToast(); }
}
function showToast(){
  const t=$('psToast'); if(!t||!toastQ.length||!t.hidden) return;
  if(!g||g.phase()!=='title') return;
  if(document.hidden){ if(!showToast.wait){ showToast.wait=true; document.addEventListener('visibilitychange',function v(){ if(document.hidden) return; document.removeEventListener('visibilitychange',v); showToast.wait=false; showToast(); }); } return; }
  const items=toastQ.splice(0);
  t.innerHTML='';
  t.append(el('b',null,items.length>1?`ソムリエバッジを ${items.length} 個もらいました`:'ソムリエバッジをもらいました'));
  for(const x of items){
    const when=x.kind==='day'?`${mdw(x.from)}の 1 位`:`${mdOf(x.from)}〜${mdOf(x.to)} の週の 1 位`;
    t.append(el('span',null,`${x.kind==='day'?'🍷':'🏆'} ${when}（${x.cleared} 組）`));
  }
  t.append(el('small',null,'押すと閉じます'));
  t.hidden=false; void t.offsetWidth; t.classList.add('on');
  let closed=false;
  const close=()=>{ if(closed) return; closed=true; clearTimeout(showToast.tm); t.classList.remove('on'); setTimeout(()=>{ t.hidden=true; showToast(); },250); };
  t.onclick=()=>{ tap(); close(); };
  showToast.close=close;
  clearTimeout(showToast.tm); showToast.tm=setTimeout(close,7000);
}
function toastAway(p){ if(p!=='title'&&showToast.close) showToast.close(); }
const SHEET_HTML=`
<div id="rankSheet" class="rk-overlay" hidden><div class="rsheet" role="dialog" aria-modal="true" aria-labelledby="rkTitle">
  <p class="cap">ライフ 3 つ · ご満足いただけた組の数</p>
  <h2 id="rkTitle">ランキング</h2>
  <div id="rkTabs" class="rk-tabs" role="group" aria-label="ランキングの期間" hidden></div>
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
  const foot=el('p','ps-foot'); foot.innerHTML=`${VERSION_LABEL}${NATIVE?'<span id="psAdsSep" hidden> · </span><button id="psAdsLink" type="button" hidden>広告を消す</button>':''}${!NATIVE&&IOS_DEVICE?` · <a id="psAppLink" href="${APP_URL}" target="_blank" rel="noopener">iPhone版（App Store）</a>`:''} · <a href="${NATIVE?(NATIVE.privacyURL||SITE_URL+'privacy.html'):'privacy.html'}">プライバシー</a>`;
  $('tBest').after(foot);
  const bl=el('p','ps-badges'); bl.id='psBadges'; bl.hidden=true; $('tBest').after(bl);
  { const c=load(KEY.badges); if(Rank.joined&&c) showBadges(c); }
  const toast=el('div','ps-toast'); toast.id='psToast'; toast.hidden=true; toast.setAttribute('role','status'); $('app').append(toast);
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
  if(NATIVE&&g&&g.quit&&g.canQuit){
    const qb=el('button','iconbtn','×'); qb.id='psQuit'; qb.type='button'; qb.setAttribute('aria-label','ゲームをやめてタイトルへ'); qb.disabled=true;
    $('hud').append(qb); $('app').classList.add('ps-quit');
    $('app').insertAdjacentHTML('beforeend',QUIT_HTML);
    qb.onclick=()=>{ if(!quitOK()) return; tap(); openQuit(); };
    $('qtYes').onclick=()=>{ tap(); quitNow(); };
    $('qtNo').onclick=()=>{ tap(); closeQuit(); };
    $('quitSheet').addEventListener('click',e=>{ if(e.target===$('quitSheet')) closeQuit(); });
    document.addEventListener('keydown',e=>{ const s=$('quitSheet'); if(s&&e.key==='Escape'&&!e.isComposing&&!s.hidden){ e.preventDefault(); closeQuit(); } });
    quitButton();
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
    g=api; build(); persist(); refreshMe(true);
    if(Rank.joined&&Rank.pending) Rank.push().catch(()=>{});
    if('serviceWorker' in navigator&&location.protocol==='https:') navigator.serviceWorker.register('sw.js').catch(()=>{});
  },
  onResult,
  haptic:NATIVE?(name,p)=>{ try{ NATIVE.haptic(name,p); }catch(e){} }:undefined,
  onRunStart:NATIVE?()=>{ try{ NATIVE.runStart(!!(g&&g.soundOn&&g.soundOn())); }catch(e){} }:undefined,
  hold(on){ try{ if(g&&g.hold) g.hold(!!on); }catch(e){} },
  onTitle(){ last=null; sleepOK(); if($('rankSheet')) closeRank(); closeQuit(); refreshMe(false); showToast(); },
  onPhase(p){ toastAway(p); if(NATIVE){ quitButton(); if(!quitOK()) closeQuit(); } },
  onStore(s){ if(!s) return; store=s; storeLink(); if($('storeSheet')&&!$('storeSheet').hidden&&!storeBusy) renderStore(); },
};
if(LOCAL) window.PS_WEB._rank=Rank;
})();
