// Chackos Scratch Classic points site.
// Data comes from the Google Sheet named in config.js. If no sheet is set, or it can't be
// reached, the site falls back to the CSV copies in data/.
'use strict';
function parseCSV(text){const rows=[];let row=[],f='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){if(c==='"'){if(text[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;else if(c===','){row.push(f);f=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(f);rows.push(row);row=[];f=''}
    else f+=c}
  if(f!==''||row.length){row.push(f);rows.push(row)}
  const hdr=(rows.shift()||[]).map(h=>h.trim());
  return rows.filter(r=>r.some(x=>x.trim()!=='')).map(r=>Object.fromEntries(hdr.map((h,i)=>[h,(r[i]??'').trim()])));}
function isoDate(s){s=(s||'').trim();let m;
  if(/^\d{5}$/.test(s))return new Date(Date.UTC(1899,11,30)+(+s)*864e5).toISOString().slice(0,10);
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)))return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  if((m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))){const y=m[3].length===2?'20'+m[3]:m[3];return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`}
  const d=new Date(s);return isNaN(d)?s:d.toISOString().slice(0,10);}
const num=v=>{if(v==null)return null;const s=String(v).replace(/[$,\s]/g,'');if(s==='')return null;const n=+s;return isNaN(n)?null:n};
const NAME=s=>(s||'').trim().replace(/\s+/g,' ').toUpperCase();
const yes=v=>/^(y|yes|true|1|x)$/i.test((v||'').trim());
function statusCode(s){s=(s||'').toLowerCase();if(!s)return'';if(s.includes('roll'))return'rolloff';if(s.includes('senior'))return'sr';if(s.includes('female')||s.includes('women'))return'fw';if(s.includes('cut')||s==='yes')return'cut';return''}

const TABS=['results','events','matches','elimination','settings'];
async function loadTables(){
  const C=window.CHACKOS_CONFIG||{},id=(C.sheetId||'').trim(),names=C.tabs||{};
  if(id){try{
    const out=await Promise.all(TABS.map(async t=>{
      const url=`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(names[t]||t)}&_=${Date.now()}`;
      const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(t+': HTTP '+r.status);
      const txt=await r.text();if(/^\s*</.test(txt))throw new Error(t+': sheet is not shared publicly');
      return parseCSV(txt);}));
    return{src:'sheet',t:Object.fromEntries(TABS.map((k,i)=>[k,out[i]]))};
  }catch(err){console.warn('Google Sheet load failed, using bundled data:',err)}}
  const out=await Promise.all(TABS.map(t=>fetch(`data/${t}.csv`,{cache:'no-store'}).then(r=>r.ok?r.text():'').then(parseCSV)));
  return{src:'bundled',t:Object.fromEntries(TABS.map((k,i)=>[k,out[i]]))};}

// Final place when the sheet leaves it blank: finals order first (champion, runner-up, then by the
// round they went out in, latest first; ties in a round go by qualifying position, or that round's
// score for elimination finals), then stepladder seeds with no known scores, then 6-game advancers
// totals, then qualifying totals. Bowlers tied in qualifying share a place.
function computeFinish(e){
  const f=e.finals,placed=new Set(),order=[],by={},idx={};e.rows.forEach((r,i)=>{by[r.name]=r;idx[r.name]=i});
  const push=n=>{if(n&&by[n]&&!placed.has(n)){placed.add(n);order.push(n)}};
  push(f.champion);push(f.runnerUp);
  const qp=n=>idx[n]??999;
  [...(f.rounds||[])].reverse().forEach(rd=>rd.m.map(m=>m[2]).filter(n=>!placed.has(n)).sort((a,b)=>qp(a)-qp(b)).forEach(push));
  [...(f.elim||[])].reverse().forEach(rd=>rd.r.filter(x=>!x[2]&&!placed.has(x[0])).sort((a,b)=>(b[1]??0)-(a[1]??0)||qp(a[0])-qp(b[0])).forEach(x=>push(x[0])));
  (e.step||[]).forEach(push);
  const res={};order.forEach((n,i)=>res[n]=i+1);
  const key=r=>[r.t6!=null?1:0,r.t6||0,r.total||0];
  const rest=e.rows.filter(r=>!placed.has(r.name)).sort((a,b)=>{const x=key(a),y=key(b);return y[0]-x[0]||y[1]-x[1]||y[2]-x[2]});
  let prev=null,rk=0;rest.forEach((r,i)=>{const k=key(r).join();if(k!==prev){rk=order.length+i+1;prev=k}res[r.name]=rk});
  return res;}

function buildEvents(T){
  const byDate=(rows,d)=>rows.filter(r=>isoDate(r.Date)===d);
  const evs=T.events.filter(r=>r.Date).map(r=>({...r,_d:isoDate(r.Date)})).sort((a,b)=>a._d.localeCompare(b._d));
  const out=[];
  evs.forEach(ev=>{
    const d=ev._d,qn=num(ev['Qualifying games']);
    const rows=byDate(T.results,d).map((r,i)=>{
      const games=['G1','G2','G3','G4','G5','G6','G7'].map(k=>num(r[k])).filter(g=>g!=null);
      const nq=qn||games.length,t6=num(r['6-game total']),step=num(r['Stepladder seed']);
      const o={place:num(r.Place)??999,raw:r['Bowler (as printed)']||r.Bowler,name:NAME(r.Bowler||r['Bowler (as printed)']),tags:(r.Tags||'').trim(),
        games,total:num(r.Total)??games.slice(0,nq).reduce((a,b)=>a+b,0),status:statusCode(r.Status),qn:nq,_i:i,_fin:num(r['Final place'])};
      if(t6!=null)o.t6=t6;if(step!=null)o.step=step;if(r.Note)o.flag=r.Note;return o;
    }).filter(r=>r.name).sort((a,b)=>a.place-b.place||a._i-b._i);
    if(!rows.length)return;
    const rounds=[],rmap={};
    byDate(T.matches,d).forEach(m=>{const nmR=m.Round||'Round';if(!rmap[nmR]){rmap[nmR]={name:nmR,m:[]};rounds.push(rmap[nmR])}
      rmap[nmR].m.push([NAME(m.Winner),num(m['Winner score']),NAME(m.Loser),num(m['Loser score'])])});
    const elim=[],emap={};
    byDate(T.elimination,d).forEach(x=>{const nmR=x.Round||'Round';if(!emap[nmR]){emap[nmR]={name:nmR,r:[]};elim.push(emap[nmR])}
      emap[nmR].r.push([NAME(x.Bowler),num(x.Score),yes(x.Advanced)?1:0,num(x.Prize)])});
    let champ=NAME(ev.Champion),ru=NAME(ev['Runner-up']);
    if(!champ&&rounds.length){const fm=rounds.at(-1).m[0];champ=fm[0];ru=ru||fm[2]}
    if(!champ&&elim.length){const fr=[...elim.at(-1).r].sort((a,b)=>b[2]-a[2]||(b[1]??0)-(a[1]??0));champ=fr[0]?.[0];ru=ru||fr[1]?.[0]}
    if(!champ&&!rounds.length&&!elim.length){champ=rows[0].name;ru=ru||rows[1]?.name}
    const fmt=ev.Format||(elim.length?'Elimination finals':rows.some(r=>r.step)?'Advancers + stepladder':rounds.length?'Match play':'Total pinfall');
    const finals={format:fmt,desc:ev.Description||'',champion:champ||'',runnerUp:ru||null,rounds};
    if(elim.length)finals.elim=elim;
    const steps=rows.filter(r=>r.step).sort((a,b)=>a.step-b.step).map(r=>r.name);
    const e={date:d,title:ev.Title||'Chackos Scratch Classic',cash:num(ev['Cut line'])??rows.filter(r=>r.status==='cut'||r.status==='rolloff').length,
      cutlabel:ev['Cut note']||'',out:rows.filter(r=>r.status==='rolloff').map(r=>r.name),
      sr:rows.filter(r=>r.status==='sr').map(r=>r.name),fw:rows.filter(r=>r.status==='fw').map(r=>r.name),flags:{},rows,finals};
    if(steps.length)e.step=steps;
    const auto=computeFinish(e);
    rows.forEach(r=>{r.fin=r._fin??auto[r.name];delete r._fin;delete r._i});
    out.push(e);
  });
  return out;}

function buildSettings(rows){const s=rows[0]||{},g=(k,d)=>{const v=num(s[k]);return v==null?d:v};
  return{cut:g('Made-cut bonus',100),lead:g('Top-qualifier bonus',200),low:g('Points for 106th and lower',40),
    spots:s['Senior/Female spots get cut bonus']==null||s['Senior/Female spots get cut bonus']===''?true:yes(s['Senior/Female spots get cut bonus'])};}

(async()=>{
  try{
    let {src,t}=await loadTables(),EVENTS=[];
    try{EVENTS=buildEvents(t)}catch(err){console.warn(err)}
    if(!EVENTS.length&&src==='sheet'){console.warn('Sheet had no usable events, using bundled data');window.CHACKOS_CONFIG={...window.CHACKOS_CONFIG,sheetId:''};({src,t}=await loadTables());EVENTS=buildEvents(t)}
    if(!EVENTS.length)throw new Error('No events found in the data');
    render(EVENTS,buildSettings(t.settings));
    document.getElementById('foot').textContent=(src==='sheet'?'Live results from the Chackos results sheet':'Showing saved results (the live sheet could not be reached)')+` · loaded ${new Date().toLocaleString()}`;
  }catch(err){console.error(err);const l=document.getElementById('loading');if(l)l.textContent='Could not load results: '+err.message;}
})();

function render(EVENTS,SET){
const HASH0=location.hash;
const $=s=>document.querySelector(s);
const fit=(sel,map)=>{const tbl=typeof sel==='string'?$(sel):sel;const ths=[...tbl.querySelectorAll('thead th')];
  const cls=ths.map(th=>{const t=th.textContent.replace(/[▼▲]/g,'').trim();for(const[lv,list]of Object.entries(map))if(list.some(x=>x instanceof RegExp?x.test(t):x===t))return lv;return''});
  tbl.querySelectorAll('tr').forEach(tr=>[...tr.children].forEach((c,i)=>{if(cls[i])c.classList.add(cls[i])}));};
const G=/^G\d$/;
const FIT={pt:{h1:['Finish pts','Cut bonus','Leader bonus'],h2:[/^\d+\/\d+$/]},
  st:{h1:['Games','Season +/-','Avg qual','Runner-up'],h2:['Best qual','Sr/W spots','Cuts','Finals avg','Top qualifier'],h3:['Avg','High game','Made %','Events'],h4:['Finals']},
  ct:{h1:['Cut +/-','Format','Last in'],h2:['Senior spot','Female spot','Field'],h3:['Top qualifier','Runner-up'],h4:['Cut score']},
  et:{h2:['+/-'],h3:[G],h4:['Status']},
  dl:{h2:['of','Cut score','+/-'],hd:[G],h4:['Status','Finish']}};
const addView=sel=>$(sel).querySelectorAll('tbody td.name').forEach(td=>td.insertAdjacentHTML('beforeend',`<button class="vb" data-p="${td.dataset.p}" aria-label="View results">View</button>`));
const fmtDate=d=>{const[y,m,dd]=d.split('-');return `${+m}/${+dd}/${y.slice(2)}`};
const pmv=(t,n)=>t-200*n, pm=(t,n)=>{const v=pmv(t,n);return v>0?'+'+v:v===0?'even':''+v};
const statusPill={cut:'<span class="pill p-cut">Made cut</span>',sr:'<span class="pill p-sr">Senior spot</span>',fw:'<span class="pill p-fw">Female spot</span>',rolloff:'<span class="pill p-ro">Lost rolloff</span>'};
const title=s=>s.toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase()).replace(/\bIii\b/,'III').replace(/\bIi\b/,'II').replace(/\bPj\b/,'PJ').replace(/\bTj\b/,'TJ').replace(/\bBj\b/,'BJ').replace(/\bJr\b(?= [A-Z])/,'JR').replace(/\bMc([a-z])/g,(m,c)=>'Mc'+c.toUpperCase()).replace(/O'([a-z])/,(m,c)=>"O'"+c.toUpperCase());
const tagTxt=t=>t?` <span class="tag">(${t})</span>`:'';
EVENTS.forEach(e=>{e.n=e.rows[0].qn;const q=e.rows.filter(r=>r.status==='cut');e.cutRow=q[q.length-1];e.field=e.rows.length;e.by={};e.rows.forEach(r=>e.by[r.name]=r);
 const f=e.finals;f.inFinals=new Set();f.rec={};f.fg={};
 const add=(n,s)=>{if(s!=null)(f.fg[n]??=[]).push(s)};
 (f.rounds||[]).forEach((rd,ri)=>rd.m.forEach(([w,ws,l,ls])=>{[w,l].forEach(x=>{f.inFinals.add(x);f.rec[x]??={w:0,l:0,lost:null}});f.rec[w].w++;f.rec[l].l++;f.rec[l].lost=rd.name;add(w,ws);add(l,ls);}));
 (f.elim||[]).forEach(rd=>rd.r.forEach(([n,s,a,p])=>{f.inFinals.add(n);add(n,s);const o=f.rec[n]??={w:0,l:0,lost:null,prize:0};if(!a&&rd.name!=='Final')o.lost=rd.name;if(p)o.prize=(o.prize||0)+p;}));
 if(f.format==='Match play'||f.elim) f.inFinals.add(e.rows[0].name);
 if(e.step) e.step.forEach(n=>f.inFinals.add(n));
});
function finish(e,n){const f=e.finals,r=e.by[n];if(!r)return'';
 if(n===f.champion)return'<span class="pill p-ch">Champion</span>';if(n===f.runnerUp)return'<span class="pill p-ru">Runner-up</span>';
 const rec=f.rec[n];
 if(e.step&&r.step){return `<span class="pill p-st">Stepladder #${r.step}</span>`+(rec?.lost?` <span class="mute">lost ${rec.lost}</span>`:'');}
 if(rec?.lost)return `<span class="mute">Out in ${rec.lost}</span>`;
 if(e.step&&r.t6)return'<span class="mute">Advancers round</span>';
 return '';}
const finishRank=(e,n)=>{const f=e.finals;if(n===f.champion)return 1;if(n===f.runnerUp)return 2;return 99};
$('#sub').textContent=`${EVENTS.length} events · ${fmtDate(EVENTS[0].date)} to ${fmtDate(EVENTS.at(-1).date)} · ${new Set(EVENTS.flatMap(e=>e.rows.map(r=>r.name))).size} bowlers`;
// players
const P={};
EVENTS.forEach((e,ei)=>e.rows.forEach(r=>{const p=P[r.name]??={name:r.name,tags:new Set(),res:[]};if(r.tags)r.tags.replace(/[^A-Z]/g,'').split('').forEach(t=>p.tags.add(t));p.res.push({ei,...r});}));
const players=Object.values(P).map(p=>{const g=p.res.flatMap(r=>r.games.filter(x=>x>1));const pl=p.res.map(r=>r.place);
 let titles=0,ru=0,fin=0,w=0,l=0,fg=[],prize=0;
 p.res.forEach(r=>{const f=EVENTS[r.ei].finals;if(f.champion===p.name)titles++;if(f.runnerUp===p.name)ru++;if(f.inFinals.has(p.name))fin++;const rc=f.rec[p.name];if(rc&&!f.elim){w+=rc.w;l+=rc.l}if(rc?.prize)prize+=rc.prize;fg.push(...(f.fg[p.name]||[]))});
 return{name:p.name,tags:[...p.tags].sort().join(''),res:p.res,events:p.res.length,cuts:p.res.filter(r=>r.status==='cut').length,spots:p.res.filter(r=>r.status==='sr'||r.status==='fw').length,
 games:g.length,avg:g.length?g.reduce((a,b)=>a+b,0)/g.length:0,high:Math.max(...g,...fg,0),best:Math.min(...pl),avgPlace:pl.reduce((a,b)=>a+b,0)/pl.length,
 pm:p.res.reduce((a,r)=>a+pmv(r.total,r.qn),0),titles,ru,fin,w,l,wl:w+l?w/(w+l):-1,fga:fg.length?fg.reduce((a,b)=>a+b,0)/fg.length:0,fgn:fg.length,leads:pl.filter(x=>x===1).length}});
// standings
const COLS=[['name','Bowler','l'],['events','Events'],['cuts','Cuts'],['spots','Sr/W spots'],['made','Total made'],['pct','Made %'],['fin','Finals'],['titles','Titles'],['ru','Runner-up'],['wl','Match W-L'],['fga','Finals avg'],['leads','Top qualifier'],['best','Best qual'],['avgPlace','Avg qual'],['games','Games'],['avg','Avg'],['high','High game'],['pm','Season +/-']];
let sort={k:'made',d:-1};
function drawStand(){const inc=$('#incSpots').checked,q=$('#q').value.toUpperCase().trim(),mo=$('#madeOnly').checked;
 players.forEach(p=>{p.made=p.cuts+(inc?p.spots:0);p.pct=p.made/p.events;});
 let rows=players.filter(p=>(!q||p.name.includes(q))&&(!mo||p.made>0));
 rows.sort((a,b)=>{if(sort.k==='wl')return((a.w-b.w)||(b.l-a.l))*sort.d||b.made-a.made||b.titles-a.titles;let x=a[sort.k],y=b[sort.k];if(typeof x==='string')return sort.d*x.localeCompare(y);const asc=['best','avgPlace'].includes(sort.k);return (x-y)*sort.d*(asc?-1:1)||b.made-a.made||b.titles-a.titles||b.avg-a.avg});
 $('#st thead').innerHTML='<tr><th>#</th>'+COLS.map(([k,l,c])=>`<th class="${c||''} ${sort.k===k?'sorted':''}" data-k="${k}">${l}${sort.k===k?(sort.d<0?' ▼':' ▲'):''}</th>`).join('')+'</tr>';
 $('#st tbody').innerHTML=rows.map((p,i)=>`<tr><td class="mute">${i+1}</td><td class="l name" data-p="${p.name}">${title(p.name)}${tagTxt(p.tags)}</td><td>${p.events}</td><td class="big">${p.cuts}</td><td>${p.spots||''}</td><td class="hi">${p.made}</td><td>${Math.round(p.pct*100)}%</td><td>${p.fin||''}</td><td class="${p.titles?'hi':''}">${p.titles||''}</td><td>${p.ru||''}</td><td>${p.w+p.l?p.w+'-'+p.l:''}</td><td>${p.fgn?p.fga.toFixed(1):''}</td><td>${p.leads||''}</td><td>${p.best}</td><td>${p.avgPlace.toFixed(1)}</td><td>${p.games}</td><td>${p.avg.toFixed(1)}</td><td>${p.high}</td><td>${p.pm>0?'+':''}${p.pm}</td></tr>`).join('');fit('#st',FIT.st);addView('#st');}
$('#st thead').addEventListener('click',e=>{const k=e.target.closest('th')?.dataset.k;if(!k)return;sort=sort.k===k?{k,d:-sort.d}:{k,d:k==='name'?1:-1};drawStand();});
['#q','#madeOnly','#incSpots'].forEach(s=>$(s).addEventListener('input',drawStand));
// events
$('#ev').innerHTML=EVENTS.map((e,i)=>`<option value="${i}">${fmtDate(e.date)}: ${e.title}</option>`).join('');$('#ev').value=EVENTS.length-1;
const nm=n=>`<span class="name" data-p="${n}" style="cursor:pointer">${title(n)}</span>`;
const seed=(e,n)=>{const r=e.by[n];return r?`<span class="mute">${r.place}</span> `:''};
function finalsHtml(e){const f=e.finals;let h=`<div class="fin"><h3>${f.format}</h3><div class="mute">${f.desc}</div><div style="margin:8px 0">🏆 <span class="champ">${nm(f.champion)}</span>${f.runnerUp?` <span class="mute">def. ${title(f.runnerUp)}</span>`:''}</div>`;
 if(e.step)h+=`<div class="mute" style="margin-bottom:6px">Stepladder seeds after 6 games: ${e.step.map((n,i)=>`#${i+1} ${title(n)} (${e.by[n].t6})`).join(' · ')}</div>`;
 if(f.rounds?.length)h+='<div class="rounds">'+f.rounds.map(rd=>`<div class="rnd"><h4>${rd.name}</h4>${rd.m.map(([w,ws,l,ls])=>`<div class="m"><div class="w"><span>${seed(e,w)}${nm(w)}</span><span>${ws??'?'}</span></div><div class="l2"><span>${seed(e,l)}${nm(l)}</span><span>${ls??'?'}</span></div></div>`).join('')}</div>`).join('')+'</div>';
 if(f.elim)h+='<div class="rounds">'+f.elim.map(rd=>`<div class="rnd"><h4>${rd.name}</h4><div class="m">${rd.r.map(([n,s,a,p])=>`<div class="${a?'w':'l2'}"><span>${nm(n)}</span><span>${s}${p?` <span class="pill p-ro">$${p}</span>`:''}</span></div>`).join('')}</div></div>`).join('')+'</div>';
 if(f.format.includes('stepladder')&&!f.rounds.length)h+='<div class="mute">Stepladder scores were not available.</div>';
 return h+'</div>';}
function drawEvent(){const e=EVENTS[$('#ev').value],q=$('#q2').value.toUpperCase().trim();const c=e.cutRow;
 const adv=e.rows.filter(r=>r.status&&r.status!=='rolloff').length,six=!!e.step,ng=six?6:e.n;
 $('#evhead').innerHTML=finalsHtml(e)+`<div class="grid"><div class="stat"><b>${e.field}</b><span>Bowlers</span></div><div class="stat"><b>${e.n}</b><span>Qualifying games</span></div><div class="stat"><b>${e.cash-(e.out?.length||0)}</b><span>${e.n===7?'Cashed':'Made scratch cut'}</span></div><div class="stat"><b>${c.total} <small class="mute">(${pm(c.total,e.n)})</small></b><span>Cut score</span></div><div class="stat"><b>${e.rows[0].total} <small class="mute">(${pm(e.rows[0].total,e.n)})</small></b><span>Top qualifier: ${title(e.rows[0].name)}</span></div><div class="stat"><b>${adv}</b><span>Total advancing</span></div></div><div class="note"><b>Notes on the sheet:</b> ${e.cutlabel||'Last Cash +154'}</div>`;
 $('#et thead').innerHTML=`<tr><th>Place</th><th class="l">Bowler</th>${Array.from({length:ng},(_,i)=>`<th>G${i+1}</th>`).join('')}<th>${six?'4-game':'Total'}</th><th>+/-</th>${six?'<th>6-game</th>':''}<th class="l">Status</th><th class="l">Finish</th></tr>`;
 const hi=Math.max(...e.rows.flatMap(r=>r.games));
 $('#et tbody').innerHTML=e.rows.map((r,i)=>(!q||r.name.includes(q))?`<tr class="${i===e.cash-1&&!q?'cutline':''} ${r.status&&r.status!=='rolloff'?'in':''}"><td>${r.place}</td><td class="l name" data-p="${r.name}">${title(r.name)}${tagTxt(r.tags)}${r.flag?` <span class="flag" title="${r.flag}">⚠</span>`:''}</td>${Array.from({length:ng},(_,k)=>{const g=r.games[k];return`<td class="${g===hi?'hi':''}${g===1?' mute':''}">${g??''}</td>`}).join('')}<td class="big">${r.total}</td><td class="mute">${pm(r.total,r.qn)}</td>${six?`<td class="big">${r.t6??''}</td>`:''}<td class="l">${statusPill[r.status]||''}</td><td class="l">${finish(e,r.name)}</td></tr>`:'').join('');fit('#et',FIT.et);addView('#et');}
['#ev','#q2'].forEach(s=>$(s).addEventListener('input',drawEvent));
// cut summary
function drawCuts(){$('#ct thead').innerHTML='<tr><th class="l">Date</th><th class="l">Format</th><th>Field</th><th>Scratch cut</th><th>Cut score</th><th>Cut +/-</th><th class="l">Last in</th><th class="l">Senior spot</th><th class="l">Female spot</th><th class="l">Top qualifier</th><th class="l">Champion</th><th class="l">Runner-up</th></tr>';
 $('#ct tbody').innerHTML=EVENTS.map((e,i)=>{const s=e.rows.find(r=>r.status==='sr'),f=e.rows.find(r=>r.status==='fw'),F=e.finals;return`<tr><td class="l"><a href="#" data-e="${i}">${fmtDate(e.date)}</a></td><td class="l">${F.format}</td><td>${e.field}</td><td class="big">${e.cash-(e.out?.length||0)}</td><td>${e.cutRow.total}</td><td>${pm(e.cutRow.total,e.n)}</td><td class="l">${title(e.cutRow.name)}</td><td class="l">${s?title(s.name)+' ('+pm(s.total,e.n)+')':'<span class="mute">n/a</span>'}</td><td class="l">${f?title(f.name)+' ('+pm(f.total,e.n)+')':'<span class="mute">n/a</span>'}</td><td class="l">${title(e.rows[0].name)} (${e.rows[0].total})</td><td class="l hi">${title(F.champion)}</td><td class="l">${F.runnerUp?title(F.runnerUp):'<span class="mute">unknown</span>'}</td></tr>`}).join('');fit('#ct',FIT.ct);}
$('#ct').addEventListener('click',ev=>{const a=ev.target.closest('a[data-e]');if(!a)return;ev.preventDefault();$('#ev').value=a.dataset.e;tab('events');drawEvent();});
// player dialog
const dlg=$('#dlg');
document.addEventListener('click',ev=>{const n=ev.target.closest('[data-p]');if(!n||n.closest('#dbody'))return;openPlayer(n.dataset.p)});
function openPlayer(name){const p=players.find(x=>x.name===name);if(!p)return;try{history.replaceState(null,'','#bowler='+encodeURIComponent(title(p.name)))}catch(e){}
 $('#dt').innerHTML=title(p.name)+tagTxt(p.tags);
 const fin=p.res.map(r=>{const e=EVENTS[r.ei],f=e.finals,g=f.fg[p.name];return g?`<div><b>${fmtDate(e.date)}</b> <span class="mute">${f.format}:</span> ${g.join(', ')}</div>`:''}).join('');
 $('#dbody').innerHTML=`<div class="grid"><div class="stat"><b>${p.events}</b><span>Events</span></div><div class="stat"><b>${p.cuts}</b><span>Scratch cuts</span></div><div class="stat"><b>${p.spots}</b><span>Sr/W spots</span></div><div class="stat"><b>${p.titles}</b><span>Titles</span></div><div class="stat"><b>${p.w+p.l?p.w+'-'+p.l:'–'}</b><span>Match W-L</span></div><div class="stat"><b>${p.avg.toFixed(1)}</b><span>Qualifying avg (${p.games})</span></div><div class="stat"><b>${p.high}</b><span>High game</span></div></div>
 <div class="wrap"><table><thead><tr><th class="l">Date</th><th>Place</th><th>of</th>${[1,2,3,4,5,6,7].map(i=>`<th>G${i}</th>`).join('')}<th>Total</th><th>+/-</th><th>Cut score</th><th class="l">Status</th><th class="l">Finish</th><th>Final place</th><th>Pts</th></tr></thead><tbody>${p.res.map(r=>{const e=EVENTS[r.ei];return`<tr><td class="l">${fmtDate(e.date)}</td><td class="big">${r.place}</td><td class="mute">${e.field}</td>${[0,1,2,3,4,5,6].map(i=>`<td class="${r.games[i]===1?'mute':''}">${r.games[i]??''}</td>`).join('')}<td class="big">${r.t6??r.total}</td><td>${pm(r.t6??r.total,r.games.length)}</td><td class="mute">${e.cutRow.total}</td><td class="l">${statusPill[r.status]||'<span class="mute">Missed</span>'}</td><td class="l">${finish(e,p.name)}</td><td>${r.fin}</td><td class="hi">${evPts(r,cfgNow()).tot}</td></tr>`}).join('')}</tbody></table></div>${fin?`<h4 style="margin:14px 0 6px">Finals games</h4>${fin}`:''}`;
 fit($('#dbody table'),FIT.dl);if(!dlg.open)dlg.showModal();}
dlg.addEventListener('close',()=>{try{history.replaceState(null,'','#'+(document.querySelector('nav button.on')?.dataset.t||'pts'))}catch(e){}});
dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});

const PBA=[2500,1500,1150,950,850,775,745,715,685,655,625,595,565,535,505,475,445,425,405,385,365,345,325,305,285,275,265,255,245,235,225,215,205,200,195,190,185,180,175,170,165,160,155,150,145,140,135,130,125,120,115,110,105,100,95,90,85,80,75,70,65,60,55,50];
function finPts(f,low){if(f<=64)return PBA[f-1];if(f<=96)return 45;if(f<=105)return 40;return low;}
function evPts(r,cfg){const fp=finPts(r.fin,cfg.low),cut=(r.status==='cut'||(cfg.spots&&(r.status==='sr'||r.status==='fw')))?cfg.cut:0,lead=r.place===1?cfg.lead:0;return{fp,cut,lead,tot:fp+cut+lead};}
const cfgNow=()=>SET;
$('#scoring').textContent=`Made cut +${SET.cut} · Top qualifier +${SET.lead} · 106th and lower ${SET.low} pts · Senior/Female spots ${SET.spots?'get':'do not get'} the cut bonus`;
function drawPts(){const cfg=cfgNow(),q=$('#q3').value.toUpperCase().trim();
 const list=players.map(p=>{let fp=0,cut=0,lead=0;const per={};p.res.forEach(r=>{const x=evPts(r,cfg);fp+=x.fp;cut+=x.cut;lead+=x.lead;per[r.ei]={...x,fin:r.fin}});return{p,fp,cut,lead,tot:fp+cut+lead,per}}).sort((a,b)=>b.tot-a.tot||b.p.titles-a.p.titles);
 let rk=0,prev=null;list.forEach((x,i)=>{if(x.tot!==prev){rk=i+1;prev=x.tot}x.rk=rk});
 $('#pt thead').innerHTML=`<tr><th>Rank</th><th class="l">Bowler</th><th>Points</th><th>Events</th><th>Finish pts</th><th>Cut bonus</th><th>Leader bonus</th>${EVENTS.map(e=>`<th title="${e.finals.format}">${fmtDate(e.date).slice(0,-3)}</th>`).join('')}</tr>`;
 $('#pt tbody').innerHTML=list.filter(x=>!q||x.p.name.includes(q)).map(x=>`<tr><td class="mute">${x.rk}</td><td class="l name" data-p="${x.p.name}">${title(x.p.name)}${tagTxt(x.p.tags)}</td><td class="hi">${x.tot.toLocaleString()}</td><td>${x.p.events}</td><td>${x.fp.toLocaleString()}</td><td>${x.cut||''}</td><td>${x.lead||''}</td>${EVENTS.map((e,i)=>{const c=x.per[i];return c?`<td class="${c.fin===1?'hi':''}">${c.tot.toLocaleString()} <span class="mute" style="font-size:11px">(${c.fin})</span></td>`:'<td class="mute">–</td>'}).join('')}</tr>`).join('');fit('#pt',FIT.pt);addView('#pt');}
['#q3'].forEach(s=>$(s).addEventListener('input',drawPts));
function drawFinals(){$('#finlist').innerHTML=EVENTS.map((e,i)=>`<h3 style="margin:6px 0"><a href="#" data-e="${i}">${fmtDate(e.date)}</a> <span class="mute" style="font-weight:400">${e.title}</span></h3>`+finalsHtml(e)).reverse().join('');}
$('#finlist').addEventListener('click',ev=>{const a=ev.target.closest('a[data-e]');if(!a)return;ev.preventDefault();$('#ev').value=a.dataset.e;tab('events');drawEvent();});
function tab(t){try{history.replaceState(null,'','#'+t)}catch(e){}document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));['pts','stand','events','cuts','fin'].forEach(s=>$('#'+s).hidden=s!==t);}
document.querySelector('nav').addEventListener('click',e=>{const t=e.target.dataset.t;if(t)tab(t)});
drawStand();drawEvent();drawCuts();drawPts();drawFinals();
$('#plist').innerHTML=players.map(p=>`<option value="${title(p.name)}">`).sort().join('');
const findP=()=>{const v=$('#findp').value.trim().toUpperCase();const p=players.find(x=>x.name===v)||(v.length>2&&players.filter(x=>x.name.includes(v)).length===1?players.find(x=>x.name.includes(v)):null);if(p){openPlayer(p.name);$('#findp').value=''}};
$('#findp').addEventListener('change',findP);$('#findp').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();findP()}});
$('#loading').remove();tab(['pts','stand','events','cuts','fin'].includes(location.hash.slice(1))?location.hash.slice(1):'pts');
{const m=HASH0.match(/^#bowler=(.+)/);if(m){const n=decodeURIComponent(m[1]).toUpperCase();openPlayer(n)}}
}
