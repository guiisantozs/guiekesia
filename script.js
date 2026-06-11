// ================================================================
// SCRIPT.JS REESCRITO — versão protegida contra duplicação
// ================================================================

(() => {
  // Evita inicializar o app duas vezes em Live Server / Hot Reload
  if (window.GK_APP_INITIALIZED) {
    console.warn('GK App já foi inicializado. Ignorando segunda execução do script.js.');
    return;
  }

  window.GK_APP_INITIALIZED = true;

  // ================================================================
  // SUPABASE CONFIG
  // ================================================================
  const SUPABASE_URL = 'https://mgkgehrlualrwfhsdxub.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_vAQ0q5bGfHdE_xixKiHCCA_RJnk_4CC';

  if (!window.gkSupabaseClient) {
    if (typeof supabase === 'undefined') {
      console.error('Supabase não foi carregado. Confira se o script CDN do Supabase está antes do script.js no HTML.');
    } else {
      const { createClient } = supabase;
      window.gkSupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    }
  }

  const db = window.gkSupabaseClient;

  // ================================================================
  // STATE
  // ================================================================
  let tracks = [];
  let gallery = {};
  let timelineData = [];
  let currentTrack = -1;
  let isPlaying = false;
  let isRepeat = false;
  let progress = 0;
  let progInterval = null;
  let lbImages = [];
  let lbIdx = 0;
  let startDate = localStorage.getItem('gk_start_date') || null;
  let selectedFile = null;
  let toastT;

  // ================================================================
  // INIT
  // ================================================================
 document.addEventListener('DOMContentLoaded', async () => {
  setupNav();
  setupTabs();
  setupScrollReveal();
  setupHeroPhotoCarousel();

    if (startDate) {
      const dateInput = document.getElementById('d-date');
      if (dateInput) dateInput.value = startDate;
      updateCounter(startDate);
    }

    if (!db) {
      showToast('Erro: Supabase não carregou');
      const connStatus = document.getElementById('conn-status');
      if (connStatus) {
        connStatus.textContent = 'Erro ao conectar ao Supabase';
        connStatus.style.color = 'tomato';
      }
      return;
    }

    await Promise.all([
      loadTracks(),
      loadGallery(),
      loadTimeline(),
      loadLetter()
    ]);

    const connStatus = document.getElementById('conn-status');
    if (connStatus) {
      connStatus.textContent = '✓ Conectado ao Supabase';
      connStatus.style.color = 'var(--rose)';
    }
  });

  // ================================================================
  // COUNTER
  // ================================================================
  function saveStartDate() {
    const input = document.getElementById('d-date');
    if (!input) return;

    const v = input.value;
    startDate = v;

    localStorage.setItem('gk_start_date', v);
    updateCounter(v);
  }

  function updateCounter(ds) {
    const start = new Date(ds);
    const now = new Date();
    const ms = now - start;

    if (Number.isNaN(start.getTime()) || ms < 0) return;

    const totalDays = Math.floor(ms / 86400000);
    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);

    const cntDays = document.getElementById('cnt-days');
    const cntMonths = document.getElementById('cnt-months');
    const cntYears = document.getElementById('cnt-years');
    const heroSince = document.getElementById('hero-since');
    const footerSince = document.getElementById('footer-since');
    const dDaysHint = document.getElementById('d-days-hint');

    if (cntDays) cntDays.textContent = totalDays.toLocaleString('pt-BR');
    if (cntMonths) cntMonths.textContent = Math.floor(totalDays / 30);
    if (cntYears) cntYears.textContent = years > 0 ? years : '< 1';

    const fmt = start.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    if (heroSince) heroSince.textContent = fmt + ' ♡';
    if (footerSince) footerSince.textContent = 'Juntos desde ' + fmt;
    if (dDaysHint) dDaysHint.textContent = totalDays + ' dias de amor ❤️';
  }

  // ================================================================
  // TRACKS — Supabase
  // ================================================================
  async function loadTracks() {
    const { data, error } = await db.from('tracks').select('*').order('name');

    if (error) {
      showToast('Erro ao carregar músicas');
      console.error(error);
      return;
    }

    tracks = data || [];
    renderTracks();
  }

  function renderTracks() {
    const c = document.getElementById('tracks-list');
    if (!c) return;

    c.innerHTML = '';

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
        <button class="track-del" onclick="removeTrack('${t.id}', event)" title="Remover">✕</button>
        <div class="track-dur">${t.dur || '—'}</div>
      `;

      div.addEventListener('click', e => {
        if (!e.target.classList.contains('track-del')) selectTrack(i);
      });

      c.appendChild(div);
    });
  }

  function selectTrack(i) {
    if (!tracks.length || !tracks[i]) return;

    currentTrack = i;
    const t = tracks[i];

    const nowName = document.getElementById('now-name');
    const nowArtist = document.getElementById('now-artist');
    const albumPhoto = document.getElementById('album-photo');
    const albumArt = document.getElementById('album-art');
    const playBtn = document.getElementById('play-btn');

    if (nowName) nowName.textContent = t.name || 'Música';
    if (nowArtist) nowArtist.textContent = t.artist || '';
    if (albumArt) albumArt.classList.add('playing');

    isPlaying = true;
    if (playBtn) playBtn.textContent = '⏸';

   progress = 0;

const audio = document.getElementById('audio');

if (audio && t.src) {
  audio.src = t.src;
  audio.play().catch(err => {
    console.warn('O navegador bloqueou o autoplay:', err);
  });

  audio.ontimeupdate = () => {
    if (!audio.duration) return;

    progress = (audio.currentTime / audio.duration) * 100;
    updateProgUI();
  };

  audio.onloadedmetadata = () => {
    const total = Math.floor(audio.duration);
    const min = Math.floor(total / 60);
    const sec = String(total % 60).padStart(2, '0');

    const pTot = document.getElementById('p-tot');
    if (pTot) pTot.textContent = `${min}:${sec}`;
  };

  audio.onended = () => {
    if (isRepeat) {
      audio.currentTime = 0;
      audio.play();
    } else {
      nextTrack();
    }
  };
} else {
  startProgressSim();
}

renderTracks();
  }

  function togglePlay() {
    if (currentTrack < 0 && tracks.length > 0) {
      selectTrack(0);
      return;
    }

    isPlaying = !isPlaying;

    const playBtn = document.getElementById('play-btn');
    const albumArt = document.getElementById('album-art');

    if (playBtn) playBtn.textContent = isPlaying ? '⏸' : '▶';
    if (albumArt) albumArt.classList.toggle('playing', isPlaying);

    const audio = document.getElementById('audio');

if (audio && audio.src) {
  if (isPlaying) {
    audio.play();
  } else {
    audio.pause();
  }
} else {
  if (isPlaying) {
    startProgressSim();
  } else {
    clearInterval(progInterval);
  }
  }
}

  function nextTrack() {
    if (!tracks.length) return;
    selectTrack((currentTrack + 1) % tracks.length);
  }

  function prevTrack() {
    if (!tracks.length) return;
    selectTrack((currentTrack - 1 + tracks.length) % tracks.length);
  }

  function shufflePlay() {
    if (!tracks.length) return;
    selectTrack(Math.floor(Math.random() * tracks.length));
  }

  function toggleRepeat() {
    isRepeat = !isRepeat;

    const repeatBtn = document.getElementById('repeat-btn');
    if (repeatBtn) repeatBtn.classList.toggle('active', isRepeat);
  }

  function setVolume(v) {
    const audio = document.getElementById('audio');
    if (audio) audio.volume = v;
  }

  function seekTrack(e) {
  const r = e.currentTarget.getBoundingClientRect();
  progress = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));

  const audio = document.getElementById('audio');

  if (audio && audio.duration) {
    audio.currentTime = (progress / 100) * audio.duration;
  }

  updateProgUI();
}

  function startProgressSim() {
    clearInterval(progInterval);

    progInterval = setInterval(() => {
      if (!isPlaying) return;

      progress += 0.22;

      if (progress >= 100) {
        progress = 0;
        if (!isRepeat) nextTrack();
      }

      updateProgUI();
    }, 300);
  }

  function updateProgUI() {
    const progFill = document.getElementById('prog-fill');
    const pCur = document.getElementById('p-cur');
    const pTot = document.getElementById('p-tot');

    if (progFill) progFill.style.width = progress + '%';

    const dur = currentTrack >= 0 && tracks[currentTrack]?.dur ? tracks[currentTrack].dur : '0:00';
    const parts = dur.split(':');
    const tot = (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0);
    const cur = Math.floor((tot * progress) / 100);

    if (pCur) pCur.textContent = Math.floor(cur / 60) + ':' + String(cur % 60).padStart(2, '0');
    if (pTot) pTot.textContent = dur;
  }

  async function addTrack() {
  const nameInput = document.getElementById('ti-name');
  const artistInput = document.getElementById('ti-artist');
  const fileInput = document.getElementById('ti-file');

  const name = nameInput?.value.trim();
  const artist = artistInput?.value.trim();
  const file = fileInput?.files?.[0];

  if (!name) return alert('Digite o nome da música');
  if (!file) return alert('Escolha o arquivo de música');

  const safeFileName = `${Date.now()}-${file.name}`;
  const { error: uploadError } = await db.storage
    .from('musicas')
    .upload(`tracks/${safeFileName}`, file, { upsert: true });

  if (uploadError) return alert('Erro ao enviar: ' + uploadError.message);

  const { data: publicUrlData } = db.storage
    .from('musicas')
    .getPublicUrl(`tracks/${safeFileName}`);

  const musicUrl = publicUrlData.publicUrl;

  await db.from('tracks').insert([{ name, artist, src: musicUrl, file_path: `tracks/${safeFileName}` }]);

  nameInput.value = '';
  artistInput.value = '';
  fileInput.value = '';

  renderTracks();
  alert('Música adicionada e pronta para tocar!');
}

  if (!name) {
    showToast('Digite o nome da música');
    return;
  }

  if (!file) {
    showToast('Escolha o arquivo da música');
    return;
  }

  const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4'];

  if (!allowedTypes.includes(file.type)) {
    showToast('Use um arquivo de áudio válido');
    return;
  }

  const emojis = ['💕', '❤️', '🌹', '✨', '🎵', '💖', '🎶', '🌸'];
  const emoji = emojis[Math.floor(Math.random() * emojis.length)];

  const safeFileName = file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.\-_]/g, '-')
    .toLowerCase();

  const filePath = `tracks/${Date.now()}-${safeFileName}`;

  showToast('Enviando música…');

  const { error: uploadError } = await db.storage
    .from('musicas')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (uploadError) {
    showToast('Erro ao enviar arquivo: ' + uploadError.message);
    console.error(uploadError);
    return;
  }

  const { data: publicUrlData } = db.storage
    .from('musicas')
    .getPublicUrl(filePath);

  const musicUrl = publicUrlData.publicUrl;

  const { data, error } = await db
    .from('tracks')
    .insert([
      {
        name,
        artist: artist || 'Artista',
        dur: '—',
        emoji,
        src: musicUrl,
        file_path: filePath
      }
    ])
    .select();

  if (error) {
    showToast('Erro ao salvar música: ' + error.message);
    console.error(error);
    return;
  }

  tracks.push(data[0]);

  if (nameInput) nameInput.value = '';
  if (artistInput) artistInput.value = '';
  if (fileInput) fileInput.value = '';

  renderTracks();
  showToast('Música adicionada ♡');


  async function removeTrack(id, e) {
    if (e) e.stopPropagation();

    if (!confirm('Remover esta música?')) return;

    const { error } = await db.from('tracks').delete().eq('id', id);

    if (error) {
      showToast('Erro ao remover');
      console.error(error);
      return;
    }

    tracks = tracks.filter(t => t.id !== id);
    renderTracks();
  }

  // ================================================================
  // GALLERY — Supabase
  // ================================================================
  async function loadGallery() {
    const { data, error } = await db.from('gallery').select('*').order('id');

    if (error) {
      showToast('Erro ao carregar galeria');
      console.error(error);
      return;
    }

    gallery = {};

    (data || []).forEach(p => {
      if (!gallery[p.section]) gallery[p.section] = [];
      gallery[p.section].push(p);
    });

    renderAllGalleries();
  }

  function renderAllGalleries() {
    ['2024', '2025', 'viagens', 'especiais'].forEach(sec => renderGallery(sec));
  }

  function renderGallery(sec) {
    const grid = document.getElementById('grid-' + sec);
    if (!grid) return;

    grid.innerHTML = '';

    const btn = document.createElement('button');
    btn.className = 'add-photo-card';
    btn.innerHTML = '<span>+</span><span>Adicionar foto</span>';

    btn.onclick = () => {
      const sectionInput = document.getElementById('d-section');
      const drawer = document.getElementById('drawer');

      if (sectionInput) sectionInput.value = sec;
      if (drawer) drawer.classList.add('open');
    };

    grid.appendChild(btn);

    const photos = gallery[sec] || [];

    photos.forEach((p, i) => {
      const el = document.createElement('div');
      el.className = 'gal-item';

      el.innerHTML = `
        <img src="${p.src}" alt="${p.caption || ''}" loading="lazy">
        <div class="gal-overlay">
          <div class="gal-caption">${p.caption || ''}</div>
          <div class="gal-date">${p.date || ''}</div>
        </div>
        <button class="gal-del" onclick="removeGalleryPhoto('${p.id}', '${sec}', event)">×</button>
      `;

      const img = el.querySelector('img');
      if (img) img.onclick = () => openLb(sec, i);

      grid.insertBefore(el, btn);
    });
  }

  function previewFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = r => {
      selectedFile = r.target.result;

      const preview = document.getElementById('d-file-preview');
      if (preview) preview.textContent = '✓ ' + file.name;
    };

    reader.readAsDataURL(file);
  }

  async function addGalleryPhoto() {
    if (!selectedFile) {
      showToast('Selecione uma foto primeiro');
      return;
    }

    const btn = document.getElementById('add-photo-btn');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spin-inline">♡</span> Salvando…';
    }

    const sec = document.getElementById('d-section')?.value || '2024';
    const caption = document.getElementById('d-caption')?.value || 'Nosso momento especial';
    const date = document.getElementById('d-photo-date')?.value || '';

    const { data, error } = await db
      .from('gallery')
      .insert([{ src: selectedFile, caption, date, section: sec }])
      .select();

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '+ Adicionar foto';
    }

    if (error) {
      showToast('Erro ao salvar foto: ' + error.message);
      console.error(error);
      return;
    }

    if (!gallery[sec]) gallery[sec] = [];
    gallery[sec].push(data[0]);

    selectedFile = null;

    const fileInput = document.getElementById('d-file');
    const preview = document.getElementById('d-file-preview');
    const captionInput = document.getElementById('d-caption');
    const dateInput = document.getElementById('d-photo-date');

    if (fileInput) fileInput.value = '';
    if (preview) preview.textContent = '';
    if (captionInput) captionInput.value = '';
    if (dateInput) dateInput.value = '';

    renderGallery(sec);
    showToast('Foto adicionada ♡');
  }

  async function removeGalleryPhoto(id, sec, e) {
    if (e) e.stopPropagation();

    if (!confirm('Remover esta foto?')) return;

    const { error } = await db.from('gallery').delete().eq('id', id);

    if (error) {
      showToast('Erro ao remover');
      console.error(error);
      return;
    }

    gallery[sec] = (gallery[sec] || []).filter(p => p.id !== id);
    renderGallery(sec);
  }

  // ================================================================
  // LIGHTBOX
  // ================================================================
  function openLb(sec, idx) {
    lbImages = gallery[sec] || [];
    lbIdx = idx;

    if (!lbImages.length) return;

    showLbImg();

    const lightbox = document.getElementById('lightbox');
    if (lightbox) lightbox.classList.add('open');

    document.addEventListener('keydown', lbKey);
  }

  function showLbImg() {
    const p = lbImages[lbIdx];
    if (!p) return;

    const lbImg = document.getElementById('lb-img');
    const lbCap = document.getElementById('lb-cap');

    if (lbImg) lbImg.src = p.src;
    if (lbCap) lbCap.textContent = p.caption + (p.date ? '  ·  ' + p.date : '');
  }

  function lbNav(d) {
    if (!lbImages.length) return;

    lbIdx = (lbIdx + d + lbImages.length) % lbImages.length;
    showLbImg();
  }

  function closeLb() {
    const lightbox = document.getElementById('lightbox');
    if (lightbox) lightbox.classList.remove('open');

    document.removeEventListener('keydown', lbKey);
  }

  function lbKey(e) {
    if (e.key === 'ArrowRight') lbNav(1);
    if (e.key === 'ArrowLeft') lbNav(-1);
    if (e.key === 'Escape') closeLb();
  }

  const lightboxEl = document.getElementById('lightbox');

  if (lightboxEl) {
    lightboxEl.addEventListener('click', function (e) {
      if (e.target === this) closeLb();
    });
  }

  // ================================================================
  // TIMELINE — Supabase
  // ================================================================
  async function loadTimeline() {
    const { data, error } = await db.from('timeline').select('*').order('id');

    if (error) {
      showToast('Erro ao carregar timeline');
      console.error(error);
      return;
    }

    timelineData = data || [];
    renderTimeline();
  }

  function renderTimeline() {
    const list = document.getElementById('tl-list');
    if (!list) return;

    list.innerHTML = '';

    if (!timelineData.length) {
      list.innerHTML = '<div class="tl-empty">Nenhum evento ainda. Adicione no painel ♡</div>';
      return;
    }

    timelineData.forEach((item, i) => {
      const div = document.createElement('div');
      div.className = 'tl-item';

      div.innerHTML = `
        <div class="tl-dot"><div class="tl-dot-inner"></div></div>
        <div class="tl-content">
          <div class="tl-date-txt">${item.date || ''}</div>
          <div class="tl-event-txt">${item.event || ''}</div>
          <div class="tl-desc-txt">${item.desc || ''}</div>
          <button class="tl-del-btn" onclick="removeTlItem('${item.id}')">— remover</button>
        </div>
      `;

      list.appendChild(div);

      setTimeout(() => {
        div.classList.add('visible');
      }, 80 * i);
    });
  }

  async function addTimelineEvent() {
    const date = document.getElementById('d-tl-date')?.value.trim() || '';
    const event = document.getElementById('d-tl-event')?.value.trim() || '';
    const desc = document.getElementById('d-tl-desc')?.value.trim() || '';

    if (!date || !event) {
      showToast('Preencha a data e o evento');
      return;
    }

    const btn = document.getElementById('add-tl-btn');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spin-inline">♡</span> Salvando…';
    }

    const { data, error } = await db
      .from('timeline')
      .insert([{ date, event, desc: desc || '' }])
      .select();

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '+ Adicionar evento';
    }

    if (error) {
      showToast('Erro: ' + error.message);
      console.error(error);
      return;
    }

    timelineData.unshift(data[0]);

    const dateInput = document.getElementById('d-tl-date');
    const eventInput = document.getElementById('d-tl-event');
    const descInput = document.getElementById('d-tl-desc');

    if (dateInput) dateInput.value = '';
    if (eventInput) eventInput.value = '';
    if (descInput) descInput.value = '';

    renderTimeline();
    showToast('Evento adicionado ♡');
  }

  async function removeTlItem(id) {
    if (!confirm('Remover este evento?')) return;

    const { error } = await db.from('timeline').delete().eq('id', id);

    if (error) {
      showToast('Erro ao remover');
      console.error(error);
      return;
    }

    timelineData = timelineData.filter(t => t.id !== id);
    renderTimeline();
  }

  // ================================================================
  // LETTER — Supabase
  // ================================================================
  async function loadLetter() {
    const { data, error } = await db.from('letter').select('*').limit(1).maybeSingle();

    if (error) {
      console.error(error);
    }

    const defaultTxt = `Meu amor,\n\nExistem palavras que tentam capturar o que sinto, mas nenhuma delas chega perto do que você significa para mim. Você chegou na minha vida com a suavidade de quem sempre pertenceu ali — e eu percebi rápido que não queria mais nada sem você ao meu lado.\n\nCada risada nossa, cada silêncio confortável, cada olhar compartilhado — tudo isso construiu algo que eu sei que vai durar muito mais do que qualquer palavra.\n\nObrigado por me escolher todos os dias. Você é o meu lar.`;

    const txt = data?.content || defaultTxt;
    const html = txt
      .split('\n\n')
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('<br>');

    const letterDisplay = document.getElementById('letter-display');
    const lepText = document.getElementById('lep-text');

    if (letterDisplay) letterDisplay.innerHTML = html;
    if (lepText) lepText.value = txt;
  }

  async function saveLetter() {
    const txt = document.getElementById('lep-text')?.value || '';
    const sig = document.getElementById('lep-sig')?.value || 'Com amor, Gui ♡';
    const btn = document.getElementById('save-letter-btn');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spin-inline">♡</span> Salvando…';
    }

    await db
      .from('letter')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    const { error } = await db.from('letter').insert([{ content: txt }]);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Salvar carta';
    }

    if (error) {
      showToast('Erro ao salvar: ' + error.message);
      console.error(error);
      return;
    }

    const html = txt
      .split('\n\n')
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('<br>');

    const letterDisplay = document.getElementById('letter-display');
    const letterSig = document.getElementById('letter-sig');

    if (letterDisplay) letterDisplay.innerHTML = html;
    if (letterSig) letterSig.textContent = sig;

    showToast('Carta salva com amor ♡');
  }

  // ================================================================
  // UI UTILS
  // ================================================================
  function toggleDrawer() {
    const drawer = document.getElementById('drawer');
    if (drawer) drawer.classList.toggle('open');
  }

  function toggleMenu() {
    const navLinks = document.getElementById('nav-links');
    if (navLinks) navLinks.classList.toggle('open');
  }

  function setupTabs() {
    document.querySelectorAll('.mem-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mem-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.mem-panel').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');

        const panel = document.getElementById('panel-' + btn.dataset.tab);
        if (panel) panel.classList.add('active');
      });
    });
  }

  function setupNav() {
    const nb = document.getElementById('navbar');
    const links = document.querySelectorAll('.nav-links a');
    const hero = document.getElementById('hero');

    if (!nb || !hero) return;

    window.addEventListener(
      'scroll',
      () => {
        const heroBottom = hero.getBoundingClientRect().bottom;
        nb.classList.toggle('hero-nav', heroBottom > 60);

        let cur = '';

        document.querySelectorAll('section[id]').forEach(s => {
          if (window.scrollY >= s.offsetTop - 80) cur = s.id;
        });

        links.forEach(l => {
          l.classList.toggle('active', l.getAttribute('href') === '#' + cur);
        });
      },
      { passive: true }
    );

    nb.classList.add('hero-nav');
  }

  function setupScrollReveal() {
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) e.target.classList.add('visible');
        });
      },
      { threshold: 0.12 }
    );

    document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
  }

  // Sparkle on click
  document.addEventListener('click', e => {
    if (e.target.closest('button,a,input,select,textarea,#lightbox,#drawer')) return;

    const emojis = ['💕', '✨', '❤️', '🌸', '💖'];
    const s = document.createElement('span');

    s.className = 'sparkle';
    s.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    s.style.left = e.clientX + 'px';
    s.style.top = e.clientY + 'px';

    document.body.appendChild(s);

    setTimeout(() => s.remove(), 700);
  });

  function showToast(msg) {
    const t = document.getElementById('toast');

    if (!t) {
      console.warn(msg);
      return;
    }

    t.textContent = msg;
    t.classList.add('show');

    clearTimeout(toastT);

    toastT = setTimeout(() => {
      t.classList.remove('show');
    }, 2800);
  }

  // ================================================================
  // EXPÕE FUNÇÕES PARA onclick="" DO HTML
  // ================================================================
  window.saveStartDate = saveStartDate;

  window.selectTrack = selectTrack;
  window.togglePlay = togglePlay;
  window.nextTrack = nextTrack;
  window.prevTrack = prevTrack;
  window.shufflePlay = shufflePlay;
  window.toggleRepeat = toggleRepeat;
  window.setVolume = setVolume;
  window.seekTrack = seekTrack;
  window.addTrack = addTrack;
  window.removeTrack = removeTrack;

  window.previewFile = previewFile;
  window.addGalleryPhoto = addGalleryPhoto;
  window.removeGalleryPhoto = removeGalleryPhoto;

  window.lbNav = lbNav;
  window.closeLb = closeLb;

  window.addTimelineEvent = addTimelineEvent;
  window.removeTlItem = removeTlItem;

  window.saveLetter = saveLetter;

  window.toggleDrawer = toggleDrawer;
window.toggleMenu = toggleMenu;

// ================================================================
// HERO PHOTO CAROUSEL
// ================================================================
function setupHeroPhotoCarousel() {
  const slides = Array.from(document.querySelectorAll('.hero-slide'));

  if (!slides.length) return;

  const positions = ['active', 'next', 'back-1', 'back-2', 'hidden'];
  let current = 0;

  function updateSlides() {
    slides.forEach((slide, index) => {
      slide.classList.remove('active', 'next', 'back-1', 'back-2', 'hidden');

      const relativeIndex = (index - current + slides.length) % slides.length;
      const position = positions[relativeIndex] || 'hidden';

      slide.classList.add(position);
    });
  }

  updateSlides();

  setInterval(() => {
    current = (current + 1) % slides.length;
    updateSlides();
  }, 3500);
}
document.getElementById('add-track-btn')?.addEventListener('click', addTrack);

})();