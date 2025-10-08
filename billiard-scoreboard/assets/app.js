(function(){
  const primaryRoot = (window.BsbSettings && BsbSettings.root) ? BsbSettings.root : (location.origin + '/wp-json/');
  let apiBase = primaryRoot;
  let api = apiBase + 'billiard/v1';
  const POLL = 1200;
  const PREVIEW_MS = 2500; // 2.5s
  function q(s,c){return (c||document).querySelector(s)}
  async function reqJSON(path, options){
    let r = await fetch(api + path, options || {});
    if (r.status === 404) {
      const altBase = location.origin + '/wp-json/';
      if (apiBase !== altBase) {
        try {
          const r2 = await fetch(altBase + 'billiard/v1' + path, options || {});
          if (r2.ok) {
            apiBase = altBase;
            api = apiBase + 'billiard/v1';
            return await r2.json();
          }
        } catch(e){}
      }
      const text = await r.text().catch(()=>'');
      throw new Error('REST 404: ' + text);
    }
    return await r.json();
  }

  function initBoard(root){
    if (root.dataset.bsbInit === '1') return; root.dataset.bsbInit='1';
    root.setAttribute('data-js','on');
    const boardId = root.dataset.boardId || 'default';
    const fsHost = root.closest('.sfondo-tabellone') || root;

    // OFFLINE storage & helpers
    const STORE = 'bsb_state_' + boardId;
    const QUEUE = 'bsb_queue_' + boardId;
    const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('bsb_' + boardId) : null;
    function getQueue(){ try { return JSON.parse(localStorage.getItem(QUEUE) || '[]'); } catch(e){ return []; } }
    function setQueue(arr){ try { localStorage.setItem(QUEUE, JSON.stringify(arr)); } catch(e){} }
    function saveLocalState(d){
      try { localStorage.setItem(STORE, JSON.stringify(d)); } catch(e){}
      if (bc) bc.postMessage({type:'state', payload:d});
    }
    function loadLocalState(){ try { return JSON.parse(localStorage.getItem(STORE) || 'null'); } catch(e){ return null; } }
    function setOffline(on){ if(on) root.setAttribute('data-offline','1'); else root.removeAttribute('data-offline'); }

    let lastSeen=0; let cur1=0, cur2=0; let buf1='', buf2=''; let timer1=null, timer2=null;
    const n1=q('.bsb-p1-name-text',root), n2=q('.bsb-p2-name-text',root);
    const s1=q('.bsb-p1-score',root), s2=q('.bsb-p2-score',root);
    const p1=q('.bsb-prev-p1',root), p2=q('.bsb-prev-p2',root);
    const st1=q('.bsb-sets-p1',root), st2=q('.bsb-sets-p2',root);
    const fsBtn=q('.bsb-btn-fs',root);
    const nameMask=q('.bsb-name-mask',root), nameModal=q('.bsb-name-modal',root), nameInput=q('.bsb-name-input',root);
    const nameSave=q('.bsb-name-save',root), nameCancel=q('.bsb-name-cancel',root);
    const cfmMask=q('.bsb-cfm-mask',root), cfmModal=q('.bsb-cfm-modal',root), cfmYes=q('.bsb-cfm-yes',root), cfmNo=q('.bsb-cfm-no',root);
    let editingPlayer=null;

    async function fetchState(){
      try{
        const d=await reqJSON('/state?board_id='+encodeURIComponent(boardId), {credentials:'same-origin'});
        if(!d) throw new Error('empty');
        saveLocalState(d);
        setOffline(false);
        if(!d.last_updated || d.last_updated===lastSeen) return;
        lastSeen=d.last_updated;
        cur1 = parseInt(d.score1||0,10); cur2 = parseInt(d.score2||0,10);
        if(!buf1){ s1.textContent = cur1; s1.classList.remove('bsb-flash'); }
        if(!buf2){ s2.textContent = cur2; s2.classList.remove('bsb-flash'); }
        n1.textContent=d.player1_name||'Giocatore 1'; n2.textContent=d.player2_name||'Giocatore 2';
        st1.textContent=d.sets1||0; st2.textContent=d.sets2||0;
      }catch(e){
        const local = loadLocalState();
        setOffline(true);
        if (local){
          cur1 = parseInt(local.score1||0,10); cur2 = parseInt(local.score2||0,10);
          if(!buf1){ s1.textContent = cur1; s1.classList.remove('bsb-flash'); }
          if(!buf2){ s2.textContent = cur2; s2.classList.remove('bsb-flash'); }
          n1.textContent=local.player1_name||'Giocatore 1'; n2.textContent=local.player2_name||'Giocatore 2';
          st1.textContent=local.sets1||0; st2.textContent=local.sets2||0;
        }
      }
    }
    async function push(patch){
      const local = loadLocalState() || {
        board_id: boardId, player1_name:n1.textContent, player2_name:n2.textContent,
        score1:cur1, score2:cur2, sets1:parseInt(st1.textContent||'0',10)||0, sets2:parseInt(st2.textContent||'0',10)||0,
        log1:[], log2:[], last_updated: Date.now()
      };
      if ('score1' in patch) local.score1 = patch.score1;
      if ('score2' in patch) local.score2 = patch.score2;
      if ('sets1' in patch)  local.sets1  = patch.sets1;
      if ('sets2' in patch)  local.sets2  = patch.sets2;
      if ('player1_name' in patch) local.player1_name = patch.player1_name;
      if ('player2_name' in patch) local.player2_name = patch.player2_name;
      if ('log_append' in patch) {
        const it = patch.log_append || {};
        if (it.player==='p1') { local.log1 = (local.log1||[]).concat([{delta: it.delta||0, after: it.after||0, ts: Date.now()}]).slice(-200); }
        if (it.player==='p2') { local.log2 = (local.log2||[]).concat([{delta: it.delta||0, after: it.after||0, ts: Date.now()}]).slice(-200); }
      }
      saveLocalState(local);

      try{
        const d=await reqJSON('/state', {method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({board_id:boardId,state:patch})});
        setOffline(false);
        if(d&&d.last_updated){ lastSeen=d.last_updated; }
        return d;
      }catch(e){
        const q = getQueue(); q.push({ts: Date.now(), patch}); setQueue(q); setOffline(true);
        return null;
      }
    }
    async function flushQueue(){
      const q = getQueue(); if (!q.length) return;
      for (let i=0;i<q.length;i++){
        try{
          await reqJSON('/state', {method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({board_id:boardId,state:q[i].patch})});
          q[i]=null;
        }catch(e){ break; }
      }
      setQueue(q.filter(Boolean));
      if (!getQueue().length){ setOffline(false); fetchState(); }
    }
    window.addEventListener('online', flushQueue);
    window.addEventListener('offline', ()=>setOffline(true));

    function showBuffer(player){
      const el = player==='p1'?s1:s2; const buf = player==='p1'?buf1:buf2;
      if(!buf){ el.classList.remove('bsb-flash'); el.textContent = player==='p1'?cur1:cur2; return; }
      el.textContent = buf; el.classList.remove('bsb-flash'); void el.offsetWidth; el.classList.add('bsb-flash');
    }
    function schedule(player){
      if(player==='p1'){ clearTimeout(timer1); timer1=setTimeout(()=>commit('p1'), PREVIEW_MS); }
      else { clearTimeout(timer2); timer2=setTimeout(()=>commit('p2'), PREVIEW_MS); }
    }
    async function commit(player){
      const buf = player==='p1'?buf1:buf2;
      if(buf==='' || buf==='-') { if(player==='p1') buf1=''; else buf2=''; showBuffer(player); return; }
      const delta = parseInt(buf,10); if(isNaN(delta) || delta===0){ if(player==='p1') buf1=''; else buf2=''; showBuffer(player); return; }
      if(player==='p1'){
        p1.textContent='ultimo tiro ' + delta;
        cur1 = cur1 + delta; buf1=''; s1.classList.remove('bsb-flash'); s1.textContent = cur1;
        await push({score1:cur1, log_append:{player:'p1', delta:delta, after:cur1}});
      } else {
        p2.textContent='ultimo tiro ' + delta;
        cur2 = cur2 + delta; buf2=''; s2.classList.remove('bsb-flash'); s2.textContent = cur2;
        await push({score2:cur2, log_append:{player:'p2', delta:delta, after:cur2}});
      }
      flushQueue();
    }

    function openNameModal(which){
      editingPlayer = which; const current = which==='p1'? (n1.textContent||'') : (n2.textContent||'');
      nameInput.value = current; nameMask.classList.add('open'); nameModal.classList.add('open'); nameInput.focus(); nameInput.select();
    }
    function closeNameModal(){ editingPlayer=null; nameMask.classList.remove('open'); nameModal.classList.remove('open'); }
    nameCancel.addEventListener('click', closeNameModal);
    nameMask.addEventListener('click', closeNameModal);
    nameSave.addEventListener('click', async function(){
      const val = (nameInput.value||'').replace(/\s+/g,' ').trim(); if(!val) { closeNameModal(); return; }
      if(editingPlayer==='p1'){ n1.textContent=val; await push({player1_name:val}); }
      if(editingPlayer==='p2'){ n2.textContent=val; await push({player2_name:val}); }
      closeNameModal();
    });

    function openConfirm(text, onYes, details){
      q('.bsb-cfm-text',root).textContent = text || 'Confermi?';
      const sub=q('.bsb-cfm-subtext',root);
      if(sub){ if(details){ sub.textContent=details; sub.style.display='block'; } else { sub.textContent=''; sub.style.display='none'; } }
      cfmMask.classList.add('open'); cfmModal.classList.add('open');
      function cleanup(){ cfmMask.classList.remove('open'); cfmModal.classList.remove('open'); cfmYes.removeEventListener('click', yes); cfmNo.removeEventListener('click', no); }
      function yes(){ cleanup(); onYes && onYes(); }
      function no(){ cleanup(); }
      cfmYes.addEventListener('click', yes, {once:true}); cfmNo.addEventListener('click', no, {once:true});
      cfmMask.addEventListener('click', no, {once:true});
    }

    root.addEventListener('click', async function(e){
      const t = e.target;
      if(t.closest('.bsb-editname-p1')){ openNameModal('p1'); return; }
      if(t.closest('.bsb-editname-p2')){ openNameModal('p2'); return; }

      const keyBtn = t.closest('.bsb-key');
      if(keyBtn){
        const p = keyBtn.dataset.player, k = keyBtn.dataset.key;
        let b = (p==='p1'?buf1:buf2);
        if(k==='C'){ b=''; }
        else if(k==='-'){ b = b.startsWith('-') ? b.slice(1) : (b?('-'+b):'-'); }
        else { b=(b+k).replace(/^-?0+(\d)/,'$1'); }
        if(p==='p1') buf1=b; else buf2=b;
        showBuffer(p); schedule(p); return;
      }

      if(t.closest('.bsb-setplus-p1')){ const v=(parseInt(st1.textContent||'0',10)||0)+1; st1.textContent=v; await push({sets1:v}); return; }
      if(t.closest('.bsb-setminus-p1')){ const v=Math.max(0,(parseInt(st1.textContent||'0',10)||0)-1); st1.textContent=v; await push({sets1:v}); return; }
      if(t.closest('.bsb-setplus-p2')){ const v=(parseInt(st2.textContent||'0',10)||0)+1; st2.textContent=v; await push({sets2:v}); return; }
      if(t.closest('.bsb-setminus-p2')){ const v=Math.max(0,(parseInt(st2.textContent||'0',10)||0)-1); st2.textContent=v; await push({sets2:v}); return; }

      if(t.closest('.bsb-open-history-p1')){ openMemo('p1'); return; }
      if(t.closest('.bsb-open-history-p2')){ openMemo('p2'); return; }
      if(t.closest('.bsb-hist-close')){ closeMemo(); return; }

      if(t.closest('.bsb-btn-newmatch')){
        openConfirm('Vuoi azzerare i punteggi?', async ()=>{
          cur1=0; cur2=0; buf1=''; buf2='';
          s1.classList.remove('bsb-flash'); s2.classList.remove('bsb-flash');
          s1.textContent='0'; s2.textContent='0';
          p1.textContent='ultimo tiro 0'; p2.textContent='ultimo tiro 0';
          await push({score1:0, score2:0, log1:[], log2:[]});
          flushQueue();
        }); return;
      }

      if(t.closest('.bsb-btn-endset')){
        const c1 = cur1, c2 = cur2; let winner = null, winnerName = '';
        if(c1>c2 && c1>0){ winner='p1'; winnerName = n1.textContent || 'Giocatore 1'; }
        else if(c2>c1 && c2>0){ winner='p2'; winnerName = n2.textContent || 'Giocatore 2'; }
        const msg = winner ? ('Assegnare 1 set a ' + winnerName + ' e azzerare i punteggi?') : 'Pareggio o punteggi non positivi: azzerare i punteggi senza assegnare set?';
        openConfirm(msg, async ()=>{
          let patch = {};
          if(winner==='p1'){ const v=(parseInt(st1.textContent||'0',10)||0)+1; st1.textContent=v; patch.sets1=v; }
          else if(winner==='p2'){ const v=(parseInt(st2.textContent||'0',10)||0)+1; st2.textContent=v; patch.sets2=v; }
          cur1=0; cur2=0; s1.textContent=0; s2.textContent=0; buf1=''; buf2='';
          patch.score1=0; patch.score2=0; // azzera CRONOLOGIA (memo) di entrambi
patch.log1 = [];
patch.log2 = [];

// UI: resetta le preview "ultimo tiro"
buf1 = ''; buf2 = ''; cur1 = 0; cur2 = 0;
p1.textContent = 'ultimo tiro 0';
p2.textContent = 'ultimo tiro 0';

 await push(patch);
          flushQueue();
        }); return;
      }

      if(t.closest('.bsb-btn-reset-scores')){ openConfirm('Vuoi azzerare tutto?', async ()=>{ try{
            await reqJSON('/newmatch', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify({board_id:boardId})});
            setOffline(false);
          }catch(e){
            const local = {board_id:boardId, player1_name:'Giocatore 1', player2_name:'Giocatore 2', score1:0, score2:0, sets1:0, sets2:0, log1:[], log2:[], last_updated: Date.now()};
            saveLocalState(local);
            const q = getQueue(); q.push({ts:Date.now(), patch:{score1:0, score2:0, sets1:0, sets2:0, player1_name:'Giocatore 1', player2_name:'Giocatore 2'}}); setQueue(q);
            setOffline(true);
          }
          lastSeen=0; buf1=''; buf2=''; cur1=0; cur2=0;
          p1.textContent='ultimo tiro 0'; p2.textContent='ultimo tiro 0';
          s1.textContent='0'; s2.textContent='0'; n1.textContent='Giocatore 1'; n2.textContent='Giocatore 2'; st1.textContent='0'; st2.textContent='0';
          fetchState(); flushQueue(); }, 'Verranno azzerati: nomi giocatori, punteggi, set e storico.'); return; }

      if(t.closest('.bsb-btn-fs')){
        function fsSupported(){ return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled || document.msFullscreenEnabled); }
        function isFS(){ return document.fullscreenElement===fsHost || document.webkitFullscreenElement===fsHost || document.msFullscreenElement===fsHost; }
        async function enterFS(){ const el=fsHost; if(el.requestFullscreen) return el.requestFullscreen(); if(el.webkitRequestFullscreen) return el.webkitRequestFullscreen(); if(el.msRequestFullscreen) return el.msRequestFullscreen(); }
        function exitFS(){ if(document.exitFullscreen) return document.exitFullscreen(); if(document.webkitExitFullscreen) return document.webkitExitFullscreen(); if(document.msExitFullscreen) return document.msExitFullscreen(); return Promise.resolve(); }
        function updateFsUI(){ const on = isFS() || fsHost.classList.contains('bsb-immersive-host'); if(fsBtn){ fsBtn.classList.toggle('on', on); fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); fsBtn.textContent = on ? '×' : 'Schermo intero'; } }
        ['fullscreenchange','webkitfullscreenchange','msfullscreenchange'].forEach(ev => document.addEventListener(ev, updateFsUI, {once:false}));
        if(isFS()){ await exitFS(); fsHost.classList.remove('bsb-immersive-host'); root.classList.remove('bsb-immersive'); updateFsUI(); return; }
        let ok=false; if(fsSupported()){ try{ await enterFS(); ok=true; }catch(e){ ok=false; } }
        if(!ok){ fsHost.classList.add('bsb-immersive-host'); root.classList.add('bsb-immersive'); }
        updateFsUI(); return;
      }
    });

    const mMask=q('.bsb-hist-mask',root), mModal=q('.bsb-hist-modal',root), mGrid=q('.bsb-hist-grid',root), mB1=q('.bsb-hist-p1',root), mB2=q('.bsb-hist-p2',root), mTitle=q('.bsb-hist-title',root), mT1=q('.bsb-hist-title-p1',root), mT2=q('.bsb-hist-title-p2',root);
    async function openMemo(focus){
      try{
        const d=await reqJSON('/state?board_id='+encodeURIComponent(boardId), {credentials:'same-origin'});
        saveLocalState(d);
        function lastN(arr,n){ const rows=(arr||[]).slice(-n).reverse(); if(rows.length===0) return '<tr><td colspan="3" class="muted">Nessun inserimento</td></tr>'; return rows.map((x,i)=>'<tr><td>'+(rows.length-i)+'</td><td>'+((x.delta>=0?'+':'')+x.delta)+'</td><td>'+x.after+'</td></tr>').join(''); }
        mB1.innerHTML=lastN(d.log1||[],10); mB2.innerHTML=lastN(d.log2||[],10);
        mT1.textContent=d.player1_name||'Giocatore 1'; mT2.textContent=d.player2_name||'Giocatore 2';
      }catch(e){
        const d=loadLocalState()||{};
        function lastN(arr,n){ const rows=(arr||[]).slice(-n).reverse(); if(rows.length===0) return '<tr><td colspan="3" class="muted">Nessun inserimento</td></tr>'; return rows.map((x,i)=>'<tr><td>'+(rows.length-i)+'</td><td>'+((x.delta>=0?'+':'')+x.delta)+'</td><td>'+x.after+'</td></tr>').join(''); }
        mB1.innerHTML=lastN(d.log1||[],10); mB2.innerHTML=lastN(d.log2||[],10);
        mT1.textContent=(d.player1_name||'Giocatore 1'); mT2.textContent=(d.player2_name||'Giocatore 2');
      }
      mGrid.classList.remove('solo-p1','solo-p2');
      if(focus==='p1'){ mGrid.classList.add('solo-p1'); mTitle.textContent='Memo – '+mT1.textContent; }
      if(focus==='p2'){ mGrid.classList.add('solo-p2'); mTitle.textContent='Memo – '+mT2.textContent; }
      mMask.classList.add('open'); mModal.classList.add('open');
    }
    function closeMemo(){ mMask.classList.remove('open'); mModal.classList.remove('open'); }
    mMask && mMask.addEventListener('click', closeMemo);

    fetchState(); setInterval(fetchState, POLL);
    flushQueue();
    if (bc) bc.onmessage = (ev)=>{ if(ev && ev.data && ev.data.type==='state'){ /* optional live react */ } };
  }

  function initOverlay(ov){
    if (ov.dataset.bsbOvInit === '1') return; ov.dataset.bsbOvInit='1';
    const boardId = ov.dataset.boardId || 'default';
    const name1 = ov.querySelector('.ov-p1-name');
    const name2 = ov.querySelector('.ov-p2-name');
    const score1 = ov.querySelector('.ov-p1-score');
    const score2 = ov.querySelector('.ov-p2-score');
    const sets1 = ov.querySelector('.ov-p1-sets');
    const sets2 = ov.querySelector('.ov-p2-sets');
    const bc = ('BroadcastChannel' in window) ? new BroadcastChannel('bsb_' + boardId) : null;
    let last = 0;
    async function pull(){
      try{
        const d=await reqJSON('/state?board_id='+encodeURIComponent(boardId), {credentials:'same-origin'});
        if(!d||!d.last_updated||d.last_updated===last) return; last=d.last_updated;
        if(name1) name1.textContent = d.player1_name||'Giocatore 1';
        if(name2) name2.textContent = d.player2_name||'Giocatore 2';
        if(score1) score1.textContent = d.score1||0;
        if(score2) score2.textContent = d.score2||0;
        if(sets1) sets1.textContent = d.sets1||0;
        if(sets2) sets2.textContent = d.sets2||0;
      }catch(e){}
    }
    pull(); setInterval(pull, 1000);
    if (bc){
      bc.onmessage = (ev)=>{
        if(!ev || !ev.data || ev.data.type!=='state') return;
        const d = ev.data.payload || {};
        if(name1 && 'player1_name' in d) name1.textContent = d.player1_name||'Giocatore 1';
        if(name2 && 'player2_name' in d) name2.textContent = d.player2_name||'Giocatore 2';
        if(score1 && 'score1' in d) score1.textContent = d.score1||0;
        if(score2 && 'score2' in d) score2.textContent = d.score2||0;
        if(sets1 && 'sets1' in d) sets1.textContent = d.sets1||0;
        if(sets2 && 'sets2' in d) sets2.textContent = d.sets2||0;
      };
    }
  }

  function boot(){
    document.querySelectorAll('.bsb-root').forEach(initBoard);
    document.querySelectorAll('.bsb-overlay').forEach(initOverlay);
  }
  window.BSB_BOOT = function(){ try{ boot(); }catch(e){} };
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', window.BSB_BOOT); } else { window.BSB_BOOT(); }
  window.addEventListener('load', window.BSB_BOOT);
  const obs = new MutationObserver(()=>{
    if(document.querySelector('.bsb-root:not([data-bsb-init="1"])') || document.querySelector('.bsb-overlay:not([data-bsb-ov-init="1"])')) window.BSB_BOOT();
  });
  obs.observe(document.documentElement, {subtree:true, childList:true});
})();