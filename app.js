const state = {
  data: [], screen: 'home', current: null, choices: [], answered: false,
  questionNo: 1, sortCards: [], sortOrder: [],
  learned: new Set(JSON.parse(localStorage.getItem('historyCatLearned') || '[]').map(String)),
  effects: localStorage.getItem('historyCatEffects') !== 'false',
  speech: localStorage.getItem('historyCatSpeech') !== 'false'
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const screen = $('#screen');

function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { field += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && next === '\n') i++;
      row.push(field); field = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift();
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, values[i] || ''])));
}

function esc(v = '') { return String(v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function randomItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(arr) { return [...arr].sort(() => Math.random() - .5); }
function saveLearned() { localStorage.setItem('historyCatLearned', JSON.stringify([...state.learned])); }
function toggleLearned(no, force) {
  const key = String(no); const next = force ?? !state.learned.has(key);
  next ? state.learned.add(key) : state.learned.delete(key); saveLearned();
}
function unlearnedPool() { const p = state.data.filter(x => !state.learned.has(String(x['番号']))); return p.length ? p : state.data; }
function badges(item) {
  return `<span class="badge">教 ${esc(item['教'])}</span>${item['入試'] ? `<span class="badge exam">入試 ${esc(item['入試'])}</span>` : ''}`;
}
function yearLabel(value) { return /世紀/.test(value) ? value : `${value}年`; }
function setNav(active) { $$('.bottom-nav button').forEach(b => b.classList.toggle('active', b.dataset.go === active)); }
function go(name) {
  speechSynthesis?.cancel(); state.screen = name; state.answered = false; window.scrollTo({top:0, behavior:'smooth'});
  if (name === 'home') renderHome();
  if (name === 'eventYear') newEventYear();
  if (name === 'yearEvent') newYearEvent();
  if (name === 'sort') newSort();
  if (name === 'list') renderList('all');
  if (name === 'learned') renderList('learned');
}

function renderHome() {
  setNav('home'); const learned = state.learned.size; const pct = Math.round(learned / state.data.length * 100);
  screen.innerHTML = `
    <section class="hero"><div><h1>さあ、歴史の旅へ！</h1><p>ねこと一緒に、できごとと年代を少しずつ覚えよう。</p></div><img src="assets/history-cats.png" alt="巻物や地図を持った歴史ねこたち"></section>
    <section class="progress-card"><div class="progress-ring">${pct}%</div><div><b>${learned}／${state.data.length}問 覚えた</b><small>今日も自分のペースで進もう</small></div><div class="progress-bar" aria-label="学習進捗"><i style="width:${pct}%"></i></div></section>
    <div class="section-title"><h2>学習する</h2><small>覚えていない問題から出題</small></div>
    <div class="mode-grid">
      <button class="mode-card" data-mode="eventYear"><span class="mode-icon">📜</span><b>できごと → 年代</b><small>年代を入力して答えよう</small></button>
      <button class="mode-card" data-mode="yearEvent"><span class="mode-icon">⏳</span><b>年代 → できごと</b><small>正しいできごとを4択</small></button>
      <button class="mode-card" data-mode="sort"><span class="mode-icon">↕</span><b>順番に並べる</b><small>古い順に4つをタップ</small></button>
      <button class="mode-card wide" data-mode="list"><span class="mode-icon">📚</span><span><b>年代リスト</b><small>全${state.data.length}件をサーッと確認</small></span><span class="arrow">›</span></button>
    </div>`;
  $$('[data-mode]').forEach(b => b.onclick = () => go(b.dataset.mode));
}

function questionHead(title, subtitle) {
  return `<div class="page-head"><button class="back" data-go="home" aria-label="戻る">‹</button><div><h1>${title}</h1><small>${subtitle}</small></div></div>`;
}
function newEventYear() {
  setNav(''); state.current = randomItem(unlearnedPool()); state.answered = false;
  screen.innerHTML = questionHead('できごと → 年代', `第${state.questionNo}問`) + `
    <section class="question-card"><div class="question-top"><span class="count">このできごとは何年？</span><span class="badges">${badges(state.current)}</span></div>
    <p class="event-text">${esc(state.current['できごと'])}</p>
    <div class="answer-row"><input id="yearAnswer" class="year-input" inputmode="text" autocomplete="off" placeholder="年代を入力"><button id="checkYear" class="primary">答え合わせ</button></div>
    <div id="resultArea"></div></section>`;
  bindGo(); $('#checkYear').onclick = checkEventYear; $('#yearAnswer').addEventListener('keydown', e => { if (e.key === 'Enter') checkEventYear(); }); $('#yearAnswer').focus();
}
function normalizeYear(v) { return String(v).trim().toUpperCase().replace(/[Ａ-Ｚａ-ｚ０-９．]/g, s => String.fromCharCode(s.charCodeAt(0)-0xFEE0)).replace(/\s/g,'').replace(/紀元前/i,'B.C.'); }
function checkEventYear() {
  if (state.answered) return; const input = normalizeYear($('#yearAnswer').value); if (!input) return;
  state.answered = true; const ok = input === normalizeYear(state.current['年代']); playSound(ok);
  showResult($('#resultArea'), ok, state.current); $('#yearAnswer').disabled = true; $('#checkYear').disabled = true;
}

function newYearEvent() {
  setNav(''); state.current = randomItem(unlearnedPool()); state.answered = false;
  const others = shuffle(state.data.filter(x => x['番号'] !== state.current['番号'] && x['できごと'] !== state.current['できごと'])).slice(0,3);
  state.choices = shuffle([state.current, ...others]);
  screen.innerHTML = questionHead('年代 → できごと', `第${state.questionNo}問`) + `
    <section class="question-card"><div class="question-top"><span class="count">この年代のできごとは？</span><span class="badges">${badges(state.current)}</span></div>
    <div class="year-display">${esc(yearLabel(state.current['年代']))}</div><div class="choices">${state.choices.map(x => `<button class="choice" data-no="${x['番号']}">${esc(x['できごと'])}</button>`).join('')}</div>
    <button id="checkChoice" class="primary full" disabled>答え合わせ</button><div id="resultArea"></div></section>`;
  bindGo(); let chosen = null; $$('.choice').forEach(b => b.onclick = () => { if(state.answered)return; chosen=b.dataset.no; $$('.choice').forEach(x=>x.classList.toggle('selected',x===b)); $('#checkChoice').disabled=false; });
  $('#checkChoice').onclick = () => { if (!chosen || state.answered) return; state.answered = true; const ok = chosen === state.current['番号']; playSound(ok); $$('.choice').forEach(b => b.classList.add(b.dataset.no === state.current['番号'] ? 'correct' : (b.dataset.no === chosen ? 'wrong' : ''))); $('#checkChoice').disabled=true; showResult($('#resultArea'), ok, state.current); };
}

function newSort() {
  setNav(''); state.answered = false; state.sortOrder = [];
  const source = shuffle(unlearnedPool()).slice(0,4); state.sortCards = shuffle(source);
  screen.innerHTML = questionHead('順番に並べる', '4つのできごと') + `
    <p class="sort-help">古いと思う順にタップしてください。選び直すときは、もう一度タップすると解除できます。</p>
    <section class="question-card"><div class="sort-list">${state.sortCards.map(x=>`<button class="sort-card" data-no="${x['番号']}"><span class="order">−</span>${esc(x['できごと'])}</button>`).join('')}</div>
    <button id="checkSort" class="primary full" disabled>答え合わせ</button><div id="resultArea"></div></section>`;
  bindGo(); $$('.sort-card').forEach(b => b.onclick = () => selectSort(b)); $('#checkSort').onclick = checkSort;
}
function selectSort(button) {
  if (state.answered) return; const no = button.dataset.no; const index = state.sortOrder.indexOf(no);
  if (index >= 0) state.sortOrder.splice(index, 1); else state.sortOrder.push(no);
  $$('.sort-card').forEach(b => { const i=state.sortOrder.indexOf(b.dataset.no); b.classList.toggle('selected',i>=0); $('.order',b).textContent=i>=0?i+1:'−'; });
  $('#checkSort').disabled = state.sortOrder.length !== 4;
}
function sortKey(x) {
  const y=x['年代']; if (/B\.C\./i.test(y)) return -parseInt(y.replace(/\D/g,''));
  if (/世紀/.test(y)) return parseInt(y)*100-99; return parseInt(y) || 0;
}
function checkSort() {
  if (state.answered || state.sortOrder.length !== 4) return; state.answered=true;
  const correct=[...state.sortCards].sort((a,b)=>sortKey(a)-sortKey(b)||Number(a['番号'])-Number(b['番号']));
  const ok=correct.every((x,i)=>x['番号']===state.sortOrder[i]); playSound(ok);
  const area=$('#resultArea'); area.innerHTML=`<div class="result ${ok?'correct':'wrong'}"><div class="result-title">${ok?'◎ 正解！':'△ おしい！ 正しい順番はこちら'}</div><div class="correct-order">${correct.map((x,i)=>`<div><b>${i+1}. ${esc(yearLabel(x['年代']))}</b>　${esc(x['できごと'])}<br><small>覚え方：${esc(x['暗記法']||'—')}</small></div>`).join('')}</div><div class="result-actions"><button id="speakSort" class="secondary">🔊 暗記法を聞く</button><button id="nextSort" class="primary">次の問題</button></div></div>`;
  $('#speakSort').onclick=()=>speak(correct.map(x=>`${yearLabel(x['年代'])}。${x['暗記法']}`).join('。')); $('#nextSort').onclick=()=>{state.questionNo++;newSort();}; if(state.speech) setTimeout(()=>$('#speakSort').click(),250);
}

function showResult(area, ok, item) {
  area.innerHTML=`<div class="result ${ok?'correct':'wrong'}"><div class="result-title">${ok?'◎ 正解！':'△ おしい！'}</div><p><b>${esc(yearLabel(item['年代']))}</b>　${esc(item['できごと'])}</p><p class="mnemonic"><b>覚え方</b><br>${esc(item['暗記法']||'—')}</p><label class="learn-check"><input id="learnToggle" type="checkbox" ${state.learned.has(String(item['番号']))?'checked':''}>この問題は覚えた！</label><div class="result-actions"><button id="speakOne" class="secondary">🔊 暗記法を聞く</button><button id="nextQuestion" class="primary">次の問題</button></div></div>`;
  $('#learnToggle').onchange=e=>toggleLearned(item['番号'],e.target.checked); $('#speakOne').onclick=()=>speak(`${yearLabel(item['年代'])}。${item['暗記法']}`); $('#nextQuestion').onclick=()=>{state.questionNo++;state.screen==='eventYear'?newEventYear():newYearEvent();}; if(state.speech) setTimeout(()=>$('#speakOne').click(),250);
}

function renderList(mode='all') {
  setNav(mode==='learned'?'learned':'list'); state.screen=mode==='learned'?'learned':'list';
  screen.innerHTML=questionHead(mode==='learned'?'覚えた問題':'年代リスト', mode==='learned'?'チェックした問題を確認':'全項目をサーッと確認')+`
    <div class="tools"><input id="searchInput" class="search" type="search" placeholder="年代・できごとを検索"><select id="listFilter" class="filter-select" aria-label="表示する問題"><option value="${mode==='learned'?'learned':'all'}">${mode==='learned'?'覚えた':'すべて'}</option><option value="unlearned">まだ覚えていない</option>${mode!=='learned'?'<option value="learned">覚えた</option>':'<option value="all">すべて</option>'}</select></div><div id="listArea"></div>`;
  bindGo(); const update=()=>drawList($('#searchInput').value,$('#listFilter').value); $('#searchInput').oninput=update; $('#listFilter').onchange=update; update();
}
function drawList(query, filter) {
  const q=query.trim().toLowerCase(); let items=state.data.filter(x=>!q||Object.values(x).some(v=>String(v).toLowerCase().includes(q)));
  if(filter==='learned')items=items.filter(x=>state.learned.has(String(x['番号']))); if(filter==='unlearned')items=items.filter(x=>!state.learned.has(String(x['番号'])));
  const area=$('#listArea'); if(!items.length){area.innerHTML='<div class="empty"><span class="face">ฅ^•ﻌ•^ฅ</span>該当する問題はありません</div>';return;}
  area.innerHTML=`<div class="list-stats">${items.length}件を表示</div><div class="timeline">${items.map(x=>`<article class="timeline-item"><div class="timeline-year">${esc(yearLabel(x['年代']))}</div><div class="timeline-event">${esc(x['できごと'])}</div><button class="mini-check ${state.learned.has(String(x['番号']))?'done':''}" data-learn="${x['番号']}" aria-label="覚えたを切り替える">✓</button><div class="timeline-meta"><span class="badge">No.${x['番号']}</span>${badges(x)}<span class="badge">覚え方：${esc(x['暗記法']||'—')}</span></div></article>`).join('')}</div>`;
  $$('[data-learn]',area).forEach(b=>b.onclick=()=>{toggleLearned(b.dataset.learn);drawList(query,filter);});
}

function playSound(correct) {
  if(!state.effects)return; const C=window.AudioContext||window.webkitAudioContext; if(!C)return; const ctx=new C(); const now=ctx.currentTime;
  const tone=(freq,start,duration,type='sine')=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,now+start);g.gain.setValueAtTime(.0001,now+start);g.gain.exponentialRampToValueAtTime(.16,now+start+.015);g.gain.exponentialRampToValueAtTime(.0001,now+start+duration);o.connect(g).connect(ctx.destination);o.start(now+start);o.stop(now+start+duration+.02);};
  if(correct){tone(660,0,.18);tone(880,.15,.28);}else{tone(260,0,.18,'triangle');tone(196,.16,.3,'triangle');} setTimeout(()=>ctx.close(),700);
}
function speak(text) { if(!('speechSynthesis'in window))return; speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text);u.lang='ja-JP';u.rate=.9;u.pitch=1.08;speechSynthesis.speak(u); }
function bindGo(){ $$('[data-go]',screen).forEach(b=>b.onclick=()=>go(b.dataset.go)); }

document.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(b&&!screen.contains(b))go(b.dataset.go);});
$('#soundButton').onclick=()=>$('#settingsDialog').showModal();
$('#effectToggle').checked=state.effects;$('#speechToggle').checked=state.speech;
$('#effectToggle').onchange=e=>{state.effects=e.target.checked;localStorage.setItem('historyCatEffects',state.effects);};
$('#speechToggle').onchange=e=>{state.speech=e.target.checked;localStorage.setItem('historyCatSpeech',state.speech);if(!state.speech)speechSynthesis?.cancel();};

fetch('history.csv').then(r=>{if(!r.ok)throw new Error();return r.text();}).then(text=>{state.data=parseCSV(text);if(!state.data.length)throw new Error();$('#loading').hidden=true;$('#app').hidden=false;renderHome();}).catch(()=>{$('#loading').innerHTML='データを読み込めませんでした。<br>GitHub Pagesから開き直してください。';});
