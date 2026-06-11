(() => {
  if (window.GK_APP_INITIALIZED) return;
  window.GK_APP_INITIALIZED = true;

  const SUPABASE_URL = 'https://mgkgehrlualrwfhsdxub.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vAQ0q5bGfHdE_xixKiHCCA_RJnk_4CC';

  if (!window.gkSupabaseClient) {
    window.gkSupabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  const db = window.gkSupabaseClient;

  // ── STATE ──
  let tracks        = [];
  let gallery       = {};
  let timelineData  = [];
  let currentTrack  = -1;
  let isPlaying     = false;
  let isRepeat      = false;
  let lbImages      = [];
  let lbIdx         = 0;
  let startDate     = localStorage.getItem('gk_start_date') || null;
  let selectedFile  = null;
  let selectedAudioFile = null;
  let toastT;

  const audioEl = () => document.getElementById('audio');

  // ================================================================
  // INIT
  // ================================================================
  document.addEventListener('DOMContentLoaded', async () => {
    setupNav();
    setupTabs();
    setupScrollReveal();
    setupHeroPhotoCarousel();
    setupAudioListeners();
    createFloatingPlayer();

    if (startDate) {
      const inp = document.getElementById('d-date');
      if (inp) inp.value = startDate;
      updateCounter(startDate);
    }

    if (!db) { showToast('Erro: Supabase não carregou'); return; }

    await Promise.all([loadTracks(), loadGallery(), loadTimeline(), loadLetter()]);

    const status = document.getElementById('conn-status');
    if (status) { status.textContent = '✓ Conectado ao Supabase'; status.style.color = 'var(--rose)'; }
  });

  // ================================================================
  // FLOATING PLAYER — cria o elemento fixo na tela
  // ================================================================
  function createFloatingPlayer() {
    const fp = document.createElement('div');
    fp.id = 'floating-player';
    fp.innerHTML = `
      <div class="fp-left">
        <div class="fp-art" id="fp-art">💕</div>
        <div class="fp-info">
          <div class="fp-name" id="fp-name">Carregando playlist…</div>
          <div class="fp-artist" id="fp-artist">Nossa música</div>
        </div>
      </div>
      <div class="fp-center">
        <div class="fp-controls">
          <button class="fp-btn" onclick="prevTrack()" title="Anterior">⏮</button>
          <button class="fp-playbtn" id="fp-play" onclick="togglePlay()">▶</button>
          <button class="fp-btn" onclick="nextTrack()" title="Próxima">⏭</button>
        </div>
        <div class="fp-progress-wrap" id="fp-prog-wrap" onclick="seekTrack(event)">
          <div class="fp-progress-fill" id="fp-prog-fill"></div>
        </div>
        <div class="fp-times">
          <span id="fp-cur">0:00</span>
          <span id="fp-tot">0:00</span>
        </div>
      </div>
      <div class="fp-right">
        <div class="fp-vol-row">
          <span class="fp-vol-icon">🔊</span>
          <input type="range" min="0" max="1" step=".05" value=".7"
            class="fp-vol-slider" id="fp-vol" oninput="setVolume(this.value)">
        </div>
        <button class="fp-btn fp-shuffle" onclick="shufflePlay()" title="Aleatório">⇄</button>
        <button class="fp-btn fp-repeat" id="fp-repeat" onclick="toggleRepeat()" title="Repetir">↻</button>
      </div>
    `;
    document.body.appendChild(fp);
  }

  function syncFloatingPlayer() {
    const t = currentTrack >= 0 ? tracks[currentTrack] : null;
    const name   = document.getElementById('fp-name');
    const artist = document.getElementById('fp-artist');
    const art    = document.getElementById('fp-art');
    const btn    = document.getElementById('fp-play');
    if (name)   name.textContent   = t ? t.name   : 'Nossa playlist';
    if (artist) artist.textContent = t ? (t.artist || '') : '';
    if (art)    art.textContent    = t ? (t.emoji || '💕') : '💕';
    if (btn)    btn.textContent    = isPlaying ? '⏸' : '▶';
  }

  function syncFloatingProgress() {
    const a = audioEl();
    if (!a || !a.duration) return;
    const pct = (a.currentTime / a.duration) * 100;
    const fill = document.getElementById('fp-prog-fill');
    if (fill) fill.style.width = pct + '%';
    const cur = document.getElementById('fp-cur');
    const tot = document.getElementById('fp-tot');
    if (cur) cur.textContent = fmtTime(a.currentTime);
    if (tot) tot.textContent = fmtTime(a.duration);
  }

  // ================================================================
  // AUDIO LISTENERS
  // ================================================================
  function setupAudioListeners() {
    const a = audioEl();
    if (!a) return;

    a.addEventListener('timeupdate', () => {
      if (!a.duration) return;
      const pct = (a.currentTime / a.duration) * 100;
      // barra do player principal
      const fill = document.getElementById('prog-fill');
      if (fill) fill.style.width = pct + '%';
      const pCur = document.getElementById('p-cur');
      const pTot = document.getElementById('p-tot');
      if (pCur) pCur.textContent = fmtTime(a.currentTime);
      if (pTot) pTot.textContent = fmtTime(a.duration);
      // barra do flutuante
      syncFloatingProgress();
    });

    a.addEventListener('ended', () => {
      if (isRepeat) { a.currentTime = 0; a.play(); }
      else nextTrack();
    });

    a.addEventListener('play',  () => { syncPlayBtn(true);  syncFloatingPlayer(); });
    a.addEventListener('pause', () => { syncPlayBtn(false); syncFloatingPlayer(); });
    a.addEventListener('error', () => { showToast('Erro ao reproduzir'); syncPlayBtn(false); });
  }

  function fmtTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    return Math.floor(sec / 60) + ':' + String(Math.floor(sec % 60)).padStart(2, '0');
  }

  function syncPlayBtn(playing) {
    isPlaying = playing;
    const btn  = document.getElementById('play-btn');
    const fpb  = document.getElementById('fp-play');
    const art  = document.getElementById('album-art');
    if (btn) btn.textContent = playing ? '⏸' : '▶';
    if (fpb) fpb.textContent = playing ? '⏸' : '▶';
    if (art) art.classList.toggle('playing', playing);
  }

  // ================================================================
  // COUNTER
  // ================================================================
  function saveStartDate() {
    const v = document.getElementById('d-date')?.value;
    if (!v) return;
    startDate = v;
    localStorage.setItem('gk_start_date', v);
    updateCounter(v);
  }

  function updateCounter(ds) {
    const start = new Date(ds);
    const ms = new Date() - start;
    if (isNaN(start.getTime()) || ms < 0) return;
    const totalDays = Math.floor(ms / 86400000);
    const years     = Math.floor(totalDays / 365);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('cnt-days',   totalDays.toLocaleString('pt-BR'));
    set('cnt-months', Math.floor(totalDays / 30));
    set('cnt-years',  years > 0 ? years : '< 1');
    const fmt = start.toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
    set('hero-since',   fmt + ' ♡');
    set('footer-since', 'Juntos desde ' + fmt);
    set('d-days-hint',  totalDays + ' dias de amor ❤️');
  }

  // ================================================================
  // TRACKS — autoplay na primeira música
  // ================================================================
  async function loadTracks() {
    const { data, error } = await db.from('tracks').select('*');
    if (error) { showToast('Erro ao carregar músicas'); return; }
    tracks = data || [];
    renderTracks();
    syncFloatingPlayer();

    // Mostra o player flutuante assim que as músicas carregam
    if (tracks.length > 0) {
      document.getElementById('floating-player')?.classList.add('active');
      tryAutoplay();
    }
  }

  function tryAutoplay() {
    selectTrackSilent(0); // carrega o áudio
    const a = audioEl();
    if (!a) return;
    const playPromise = a.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay bloqueado — toca no primeiro clique do usuário
        const unlock = () => {
          a.play().then(() => {
            document.removeEventListener('click', unlock);
            document.removeEventListener('touchstart', unlock);
          }).catch(() => {});
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
        // Mostra dica discreta
        showToast('Clique em qualquer lugar para iniciar a música ♡');
      });
    }
  }

  // Carrega a faixa sem forçar play (para o autoplay)
  function selectTrackSilent(i) {
    if (!tracks[i]) return;
    currentTrack = i;
    const t = tracks[i];
    const nn = document.getElementById('now-name');
    const na = document.getElementById('now-artist');
    if (nn) nn.textContent = t.name || 'Música';
    if (na) na.textContent = t.artist || '';
    renderTracks();
    syncFloatingPlayer();

    if (t.audio_path) {
      const { data } = db.storage.from('tracks-audio').getPublicUrl(t.audio_path);
      const a = audioEl();
      if (a) { a.src = data.publicUrl; a.load(); }
    }
  }

  function renderTracks() {
    const c = document.getElementById('tracks-list');
    if (!c) return;
    c.innerHTML = '';

    const countEl = document.getElementById('playlist-count');
    if (countEl) countEl.textContent = tracks.length + (tracks.length === 1 ? ' música' : ' músicas');

    if (!tracks.length) {
      c.innerHTML = '<div class="player-loading">Nenhuma música ainda. Adicione abaixo! ♡</div>';
      return;
    }

    tracks.forEach((t, i) => {
      const div = document.createElement('div');
      div.className = 'track-row' + (currentTrack === i ? ' active' : '');
      div.innerHTML = `
        <div class="t-num">${i + 1}</div>
        <div class="t-eq"><span></span><span></span><span></span></div>
        <div class="track-info">
          <div class="track-name">${t.emoji || '🎵'} ${t.name || ''}</div>
          <div class="track-artist">${t.artist || ''}</div>
        </div>
        <button class="track-del" data-id="${t.id}" title="Remover">✕</button>
        <div class="track-dur">${t.dur || '—'}</div>
      `;
      div.querySelector('.track-del').addEventListener('click', e => {
        e.stopPropagation();
        removeTrack(t.id, t.audio_path);
      });
      div.addEventListener('click', () => selectTrack(i));
      c.appendChild(div);
    });
  }

  function selectTrack(i) {
    if (!tracks[i]) return;
    currentTrack = i;
    const t = tracks[i];
    const nn = document.getElementById('now-name');
    const na = document.getElementById('now-artist');
    if (nn) nn.textContent = t.name || 'Música';
    if (na) na.textContent = t.artist || '';
    renderTracks();
    syncFloatingPlayer();

    const a = audioEl();
    if (!a) return;
    if (t.audio_path) {
      const { data } = db.storage.from('tracks-audio').getPublicUrl(t.audio_path);
      a.src = data.publicUrl;
      a.load();
      a.play().catch(err => console.warn('Autoplay bloqueado:', err));
    } else {
      a.src = '';
      syncPlayBtn(true);
    }
  }

  function togglePlay() {
    const a = audioEl();
    if (!a) return;
    if (currentTrack < 0 && tracks.length > 0) { selectTrack(0); return; }
    if (a.src && a.src !== window.location.href) {
      if (a.paused) a.play(); else a.pause();
    } else {
      isPlaying = !isPlaying;
      syncPlayBtn(isPlaying);
    }
  }

  function nextTrack() {
    if (!tracks.length) return;
    selectTrack((currentTrack + 1) % tracks.length);
  }

  function prevTrack() {
    if (!tracks.length) return;
    const a = audioEl();
    if (a && a.currentTime > 3) { a.currentTime = 0; return; }
    selectTrack((currentTrack - 1 + tracks.length) % tracks.length);
  }

  function shufflePlay() {
    if (!tracks.length) return;
    selectTrack(Math.floor(Math.random() * tracks.length));
  }

  function toggleRepeat() {
    isRepeat = !isRepeat;
    document.getElementById('repeat-btn')?.classList.toggle('active', isRepeat);
    document.getElementById('fp-repeat')?.classList.toggle('active', isRepeat);
  }

  function setVolume(v) {
    const a = audioEl();
    if (a) a.volume = parseFloat(v);
    // Sincroniza os dois sliders
    const fpVol = document.getElementById('fp-vol');
    const mainVol = document.querySelector('.vol-slider');
    if (fpVol && fpVol !== event?.target)   fpVol.value = v;
    if (mainVol && mainVol !== event?.target) mainVol.value = v;
  }

  function seekTrack(e) {
    const a = audioEl();
    const r = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (a && a.duration) a.currentTime = pct * a.duration;
    else {
      const fill = document.getElementById('prog-fill');
      if (fill) fill.style.width = (pct * 100) + '%';
    }
  }

  // ── UPLOAD MP3 ──
  function handleAudioFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) { showToast('Selecione um arquivo de áudio válido'); return; }
    selectedAudioFile = file;
    const preview = document.getElementById('audio-file-preview');
    if (preview) preview.textContent = '✓ ' + file.name;
    const nameInp = document.getElementById('ti-name');
    if (nameInp && !nameInp.value) {
      nameInp.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    }
  }

  async function addTrack() {
    const name   = document.getElementById('ti-name')?.value.trim()   || '';
    const artist = document.getElementById('ti-artist')?.value.trim() || '';
    if (!name) { showToast('Digite o nome da música'); return; }

    const btn = document.getElementById('add-track-btn-main');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }

    const emojis = ['💕','❤️','🌹','✨','🎵','💖','🎶','🌸'];
    const emoji  = emojis[Math.floor(Math.random() * emojis.length)];
    let audio_path = null;
    let dur = '—';

    if (selectedAudioFile) {
      const ext      = selectedAudioFile.name.split('.').pop();
      const filename = `${Date.now()}_${name.replace(/\s+/g,'_')}.${ext}`;
      const { data: uploadData, error: uploadErr } = await db.storage
        .from('tracks-audio')
        .upload(filename, selectedAudioFile, { contentType: selectedAudioFile.type, upsert: false });

      if (uploadErr) {
        if (btn) { btn.disabled = false; btn.textContent = '+ Adicionar'; }
        showToast('Erro no upload: ' + uploadErr.message);
        return;
      }
      audio_path = uploadData.path;

      dur = await new Promise(resolve => {
        const tmp = new Audio();
        const url = URL.createObjectURL(selectedAudioFile);
        tmp.src = url;
        tmp.addEventListener('loadedmetadata', () => { resolve(fmtTime(tmp.duration)); URL.revokeObjectURL(url); });
        tmp.addEventListener('error', () => resolve('—'));
      });
    }

    const { data, error } = await db.from('tracks')
      .insert([{ name, artist: artist || 'Artista', dur, emoji, audio_path }])
      .select();

    if (btn) { btn.disabled = false; btn.textContent = '+ Adicionar'; }
    if (error) {
      showToast('Erro ao salvar: ' + error.message);
      if (audio_path) await db.storage.from('tracks-audio').remove([audio_path]);
      return;
    }

    tracks.push(data[0]);
    clearAddTrackForm();
    renderTracks();
    showToast('Música adicionada ♡');
  }

  function clearAddTrackForm() {
    ['ti-name','ti-artist'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    selectedAudioFile = null;
    const preview = document.getElementById('audio-file-preview');
    if (preview) preview.textContent = '';
    const inp = document.getElementById('audio-file-input');
    if (inp) inp.value = '';
  }

  async function removeTrack(id, audioPath) {
    if (!confirm('Remover esta música?')) return;
    if (audioPath) await db.storage.from('tracks-audio').remove([audioPath]);
    const { error } = await db.from('tracks').delete().eq('id', id);
    if (error) { showToast('Erro ao remover'); return; }
    const idx = tracks.findIndex(t => t.id === id);
    if (currentTrack === idx) {
      const a = audioEl();
      if (a) { a.pause(); a.src = ''; }
      syncPlayBtn(false);
      currentTrack = -1;
    } else if (currentTrack > idx) currentTrack--;
    tracks = tracks.filter(t => t.id !== id);
    renderTracks();
    syncFloatingPlayer();
  }

  // ================================================================
  // GALLERY
  // ================================================================
  async function loadGallery() {
    const { data, error } = await db.from('gallery').select('*');
    if (error) { showToast('Erro ao carregar galeria'); console.error('Gallery error:', error); return; }
    gallery = {};
    (data || []).forEach(p => {
      if (!gallery[p.section]) gallery[p.section] = [];
      gallery[p.section].push(p);
    });
    renderAllGalleries();
  }

  function renderAllGalleries() {
    ['2024','2025','viagens','especiais'].forEach(sec => renderGallery(sec));
  }

  function renderGallery(sec) {
    const grid = document.getElementById('grid-' + sec);
    if (!grid) return;
    grid.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'add-photo-card';
    btn.innerHTML = '<span>+</span><span>Adicionar foto</span>';
    btn.onclick = () => {
      const sel = document.getElementById('d-section');
      const drawer = document.getElementById('drawer');
      if (sel) sel.value = sec;
      if (drawer) drawer.classList.add('open');
    };
    grid.appendChild(btn);
    (gallery[sec] || []).forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'gal-item';
      el.innerHTML = `
        <img src="${p.src}" alt="${p.caption || ''}" loading="lazy">
        <div class="gal-overlay">
          <div class="gal-caption">${p.caption || ''}</div>
          <div class="gal-date">${p.date || ''}</div>
        </div>
        <button class="gal-del" data-id="${p.id}" data-sec="${sec}">×</button>
      `;
      el.querySelector('img').onclick = () => openLb(sec, i);
      el.querySelector('.gal-del').onclick = e => { e.stopPropagation(); removeGalleryPhoto(p.id, sec); };
      grid.insertBefore(el, btn);
    });
  }

  function previewFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = r => {
      selectedFile = r.target.result;
      const pv = document.getElementById('d-file-preview');
      if (pv) pv.textContent = '✓ ' + file.name;
    };
    reader.readAsDataURL(file);
  }

  async function addGalleryPhoto() {
    if (!selectedFile) { showToast('Selecione uma foto primeiro'); return; }
    const btn = document.getElementById('add-photo-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin-inline">♡</span> Salvando…'; }
    const sec     = document.getElementById('d-section')?.value || '2024';
    const caption = document.getElementById('d-caption')?.value || 'Nosso momento especial';
    const date    = document.getElementById('d-photo-date')?.value || '';
    const { data, error } = await db.from('gallery').insert([{ src: selectedFile, caption, date, section: sec }]).select();
    if (btn) { btn.disabled = false; btn.innerHTML = '+ Adicionar foto'; }
    if (error) { showToast('Erro: ' + error.message); return; }
    if (!gallery[sec]) gallery[sec] = [];
    gallery[sec].push(data[0]);
    selectedFile = null;
    ['d-file','d-caption','d-photo-date'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const pv = document.getElementById('d-file-preview');
    if (pv) pv.textContent = '';
    renderGallery(sec);
    showToast('Foto adicionada ♡');
  }

  async function removeGalleryPhoto(id, sec) {
    if (!confirm('Remover esta foto?')) return;
    const { error } = await db.from('gallery').delete().eq('id', id);
    if (error) { showToast('Erro ao remover'); return; }
    gallery[sec] = (gallery[sec] || []).filter(p => p.id !== id);
    renderGallery(sec);
  }

  // LIGHTBOX
  function openLb(sec, idx) {
    lbImages = gallery[sec] || [];
    lbIdx = idx;
    if (!lbImages.length) return;
    showLbImg();
    document.getElementById('lightbox')?.classList.add('open');
    document.addEventListener('keydown', lbKey);
  }
  function showLbImg() {
    const p = lbImages[lbIdx];
    if (!p) return;
    const img = document.getElementById('lb-img');
    const cap = document.getElementById('lb-cap');
    if (img) img.src = p.src;
    if (cap) cap.textContent = p.caption + (p.date ? '  ·  ' + p.date : '');
  }
  function lbNav(d) { lbIdx = (lbIdx + d + lbImages.length) % lbImages.length; showLbImg(); }
  function closeLb() {
    document.getElementById('lightbox')?.classList.remove('open');
    document.removeEventListener('keydown', lbKey);
  }
  function lbKey(e) {
    if (e.key === 'ArrowRight') lbNav(1);
    if (e.key === 'ArrowLeft')  lbNav(-1);
    if (e.key === 'Escape')     closeLb();
  }
  document.getElementById('lightbox')?.addEventListener('click', function(e) { if (e.target === this) closeLb(); });

  // ================================================================
  // TIMELINE — ordenada por data cronologicamente
  // ================================================================
  async function loadTimeline() {
    const { data, error } = await db.from('timeline').select('*');
    if (error) { showToast('Erro ao carregar timeline'); return; }
    timelineData = data || [];
    sortAndRenderTimeline();
  }

  // Converte texto de data para valor numérico para ordenação
  function parseDateValue(dateStr) {
    if (!dateStr) return 0;

    // Tenta parsear como data completa (ex: 2024-03-15)
    const iso = new Date(dateStr);
    if (!isNaN(iso.getTime())) return iso.getTime();

    // Tenta parsear formato "Março 2024", "março de 2024", etc.
    const meses = {
      janeiro:1, fevereiro:2, março:3, abril:4, maio:5, junho:6,
      julho:7, agosto:8, setembro:9, outubro:10, novembro:11, dezembro:12,
      jan:1, fev:2, mar:3, abr:4, mai:5, jun:6,
      jul:7, ago:8, set:9, out:10, nov:11, dez:12
    };

    const lower = dateStr.toLowerCase().replace(' de ', ' ');
    const parts  = lower.split(/[\s,\/\-]+/);

    let month = 0, year = 0;
    parts.forEach(p => {
      if (meses[p]) month = meses[p];
      if (/^\d{4}$/.test(p)) year = parseInt(p);
    });

    if (year > 0) return new Date(year, month - 1 || 0, 1).getTime();

    // Só o ano
    if (/^\d{4}$/.test(dateStr.trim())) return new Date(parseInt(dateStr), 0, 1).getTime();

    return 0; // não conseguiu parsear — vai pro final
  }

  function sortAndRenderTimeline() {
    // Ordena do mais antigo para o mais novo
    const sorted = [...timelineData].sort((a, b) => parseDateValue(a.date) - parseDateValue(b.date));
    renderTimeline(sorted);
  }

  function renderTimeline(data) {
    const list = document.getElementById('tl-list');
    if (!list) return;
    list.innerHTML = '';
    if (!data.length) {
      list.innerHTML = '<div class="tl-empty">Nenhum evento ainda. Adicione no painel ♡</div>';
      return;
    }
    data.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'tl-item';
      div.innerHTML = `
        <div class="tl-dot"><div class="tl-dot-inner"></div></div>
        <div class="tl-content">
          <div class="tl-date-txt">${item.date || ''}</div>
          <div class="tl-event-txt">${item.event || ''}</div>
          <div class="tl-desc-txt">${item.desc || ''}</div>
          <button class="tl-del-btn" data-id="${item.id}">— remover</button>
        </div>
      `;
      div.querySelector('.tl-del-btn').onclick = () => removeTlItem(item.id);
      list.appendChild(div);
      setTimeout(() => div.classList.add('visible'), 100 * i);
    });
  }

  async function addTimelineEvent() {
    const date  = document.getElementById('d-tl-date')?.value.trim()  || '';
    const event = document.getElementById('d-tl-event')?.value.trim() || '';
    const desc  = document.getElementById('d-tl-desc')?.value.trim()  || '';
    if (!date || !event) { showToast('Preencha a data e o evento'); return; }

    const btn = document.getElementById('add-tl-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin-inline">♡</span> Salvando…'; }
    const { data, error } = await db.from('timeline').insert([{ date, event, desc }]).select();
    if (btn) { btn.disabled = false; btn.innerHTML = '+ Adicionar evento'; }
    if (error) { showToast('Erro: ' + error.message); return; }

    timelineData.push(data[0]);
    ['d-tl-date','d-tl-event','d-tl-desc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    sortAndRenderTimeline(); // re-ordena ao adicionar
    showToast('Evento adicionado ♡');
  }

  async function removeTlItem(id) {
    if (!confirm('Remover este evento?')) return;
    const { error } = await db.from('timeline').delete().eq('id', id);
    if (error) { showToast('Erro ao remover'); return; }
    timelineData = timelineData.filter(t => t.id !== id);
    sortAndRenderTimeline();
  }

  // ================================================================
  // LETTER
  // ================================================================
  async function loadLetter() {
    const { data } = await db.from('letter').select('*').limit(1).maybeSingle();
    const defaultTxt = `Meu amor,\n\nExistem palavras que tentam capturar o que sinto, mas nenhuma delas chega perto do que você significa para mim. Você chegou na minha vida com a suavidade de quem sempre pertenceu ali — e eu percebi rápido que não queria mais nada sem você ao meu lado.\n\nCada risada nossa, cada silêncio confortável, cada olhar compartilhado — tudo isso construiu algo que eu sei que vai durar muito mais do que qualquer palavra.\n\nObrigado por me escolher todos os dias. Você é o meu lar.`;
    const txt  = data?.content || defaultTxt;
    const html = txt.split('\n\n').map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('<br>');
    const ld = document.getElementById('letter-display');
    const lt = document.getElementById('lep-text');
    if (ld) ld.innerHTML = html;
    if (lt) lt.value = txt;
  }

  async function saveLetter() {
    const txt = document.getElementById('lep-text')?.value || '';
    const sig = document.getElementById('lep-sig')?.value  || 'Com amor, Gui ♡';
    const btn = document.getElementById('save-letter-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin-inline">♡</span> Salvando…'; }
    await db.from('letter').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { error } = await db.from('letter').insert([{ content: txt }]);
    if (btn) { btn.disabled = false; btn.innerHTML = 'Salvar carta'; }
    if (error) { showToast('Erro: ' + error.message); return; }
    const html = txt.split('\n\n').map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('<br>');
    const ld = document.getElementById('letter-display');
    const ls = document.getElementById('letter-sig');
    if (ld) ld.innerHTML = html;
    if (ls) ls.textContent = sig;
    showToast('Carta salva com amor ♡');
  }

  // ================================================================
  // UI UTILS
  // ================================================================
  function toggleDrawer() { document.getElementById('drawer')?.classList.toggle('open'); }
  function toggleMenu()   { document.getElementById('nav-links')?.classList.toggle('open'); }

  function setupTabs() {
    document.querySelectorAll('.mem-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mem-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.mem-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('panel-' + btn.dataset.tab)?.classList.add('active');
      });
    });
  }

  function setupNav() {
    const nb   = document.getElementById('navbar');
    const hero = document.getElementById('hero');
    if (!nb || !hero) return;
    nb.classList.add('hero-nav');
    window.addEventListener('scroll', () => {
      nb.classList.toggle('hero-nav', hero.getBoundingClientRect().bottom > 60);
      let cur = '';
      document.querySelectorAll('section[id]').forEach(s => { if (window.scrollY >= s.offsetTop - 80) cur = s.id; });
      document.querySelectorAll('.nav-links a').forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + cur));
    }, { passive: true });
  }

  function setupScrollReveal() {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  }

  function setupHeroPhotoCarousel() {
    const slides = Array.from(document.querySelectorAll('.hero-slide'));
    if (!slides.length) return;
    const positions = ['active','next','back-1','back-2','hidden'];
    let current = 0;
    const update = () => slides.forEach((s, i) => {
      s.classList.remove('active','next','back-1','back-2','hidden');
      s.classList.add(positions[(i - current + slides.length) % slides.length] || 'hidden');
    });
    update();
    setInterval(() => { current = (current + 1) % slides.length; update(); }, 3500);
  }

  document.addEventListener('click', e => {
    if (e.target.closest('button,a,input,select,textarea,#lightbox,#drawer,#floating-player')) return;
    const s = document.createElement('span');
    s.className = 'sparkle';
    s.textContent = ['💕','✨','❤️','🌸','💖'][Math.floor(Math.random() * 5)];
    s.style.left = e.clientX + 'px';
    s.style.top  = e.clientY + 'px';
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 700);
  });

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // ── EXPÕE FUNÇÕES GLOBAIS ──
  Object.assign(window, {
    saveStartDate, selectTrack, togglePlay, nextTrack, prevTrack,
    shufflePlay, toggleRepeat, setVolume, seekTrack,
    addTrack, removeTrack, handleAudioFile,
    previewFile, addGalleryPhoto, removeGalleryPhoto,
    lbNav, closeLb,
    addTimelineEvent, removeTlItem,
    saveLetter, toggleDrawer, toggleMenu
  });

})();