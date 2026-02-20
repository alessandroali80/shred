'use strict';

// ─────────────────────────────────────────────
// AUDIO ENGINE (Soundfont.js via CDN)
// ─────────────────────────────────────────────
let audioCtx = null;
let instrument = null;
let audioReady = false;

// Guitar string open note MIDI numbers (standard tuning E2-A2-D3-G3-B3-E4)
const STRING_MIDI_BASE = [40, 45, 50, 55, 59, 64]; // strings 6→1

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function fretToMidi(stringNum, fret) {
  // stringNum: 1=high e, 6=low E
  const baseIndex = 6 - stringNum;
  return STRING_MIDI_BASE[baseIndex] + fret;
}

async function loadInstrument() {
  const statusEl = document.getElementById('audioStatus');
  statusEl.style.display = 'flex';
  try {
    const ctx = getAudioCtx();
    // Use Soundfont.js from CDN
    const sf = await loadSoundfontPlayer('acoustic_guitar_steel', ctx);
    instrument = sf;
    audioReady = true;
    statusEl.style.display = 'none';
  } catch (e) {
    statusEl.innerHTML = '<span style="color:var(--accent2);font-size:0.78rem">⚠ Audio non disponibile offline</span>';
    setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
  }
}

// Soundfont-player loader
function loadSoundfontPlayer(instrumentName, ctx) {
  return new Promise((resolve, reject) => {
    if (typeof Soundfont !== 'undefined') {
      // Already loaded
      Soundfont.instrument(ctx, instrumentName, {
        soundfont: 'MusyngKite',
        format: 'mp3',
      }).then(resolve).catch(reject);
      return;
    }
    const sfScript = document.createElement('script');
    sfScript.src = 'https://cdn.jsdelivr.net/npm/soundfont-player@0.12.0/dist/soundfont-player.min.js';
    sfScript.onerror = reject;
    sfScript.onload = () => {
      Soundfont.instrument(ctx, instrumentName, {
        soundfont: 'MusyngKite',
        format: 'mp3',
      }).then(resolve).catch(reject);
    };
    document.head.appendChild(sfScript);
  });
}

// Play a sequence of notes
function playExercise(notes, bpm, btn) {
  if (!audioReady || !instrument) {
    // Fallback: play simple tones with Web Audio
    playFallback(notes, bpm);
    return;
  }
  if (btn) {
    btn.textContent = '⏹ Stop';
    btn.dataset.playing = '1';
  }

  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();

  const durationMap = { 'w': 4, 'h': 2, 'q': 1, '8': 0.5, '16': 0.25 };
  const beatDuration = 60 / bpm;
  let time = ctx.currentTime + 0.1;
  const scheduledNodes = [];

  notes.forEach(note => {
    const midi = fretToMidi(note.string, note.fret);
    const dur = (durationMap[note.duration] || 0.5) * beatDuration;
    // soundfont-player API: instrument.play(note, when, options) returns AudioNode
    const node = instrument.play(midi, time, { duration: dur * 0.9 });
    if (node) scheduledNodes.push(node);
    time += dur;
  });

  // When done, reset button
  const totalTime = (time - ctx.currentTime + 0.3) * 1000;
  const timeout = setTimeout(() => {
    if (btn) { btn.textContent = '▶ Ascolta'; delete btn.dataset.playing; }
  }, totalTime);

  if (btn) {
    btn.onclick = () => {
      clearTimeout(timeout);
      scheduledNodes.forEach(n => { try { n.stop(); } catch(e){} });
      btn.textContent = '▶ Ascolta';
      delete btn.dataset.playing;
      btn.onclick = () => playExercise(notes, bpm, btn);
    };
  }
}

// Web Audio fallback with guitar-like pluck
function playFallback(notes, bpm) {
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();

  const durationMap = { 'w': 4, 'h': 2, 'q': 1, '8': 0.5, '16': 0.25 };
  const beatDuration = 60 / bpm;
  let time = ctx.currentTime + 0.1;

  notes.forEach(note => {
    const freq = midiToFreq(fretToMidi(note.string, note.fret));
    const dur = (durationMap[note.duration] || 0.5) * beatDuration;
    playPluck(ctx, freq, time, dur * 0.9);
    time += dur;
  });
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function playPluck(ctx, freq, startTime, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  filter.type = 'lowpass';
  filter.frequency.value = freq * 4;
  filter.Q.value = 1;

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, startTime);

  gain.gain.setValueAtTime(0.5, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + Math.min(duration, 1.5));

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(startTime + Math.min(duration, 1.5));
}

// ─────────────────────────────────────────────
// METRONOME
// ─────────────────────────────────────────────
let metroRunning = false;
let metroBpm = 80;
let metroNextBeat = 0;
let metroScheduleId = null;
let tapTimes = [];

const pulseEl = document.getElementById('metroPulse');
const bpmDisplay = document.getElementById('metroBpmDisplay');

function metroSchedule() {
  if (!metroRunning) return;
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') ctx.resume();

  const now = ctx.currentTime;
  const beatInterval = 60 / metroBpm;

  if (metroNextBeat < now) metroNextBeat = now;

  while (metroNextBeat < now + 0.2) {
    // Click sound
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.3, metroNextBeat);
    gain.gain.exponentialRampToValueAtTime(0.001, metroNextBeat + 0.03);
    osc.start(metroNextBeat);
    osc.stop(metroNextBeat + 0.04);

    // Visual pulse
    const beatTime = (metroNextBeat - now) * 1000;
    setTimeout(() => {
      pulseEl.classList.add('beat');
      setTimeout(() => pulseEl.classList.remove('beat'), 80);
    }, Math.max(0, beatTime));

    metroNextBeat += beatInterval;
  }

  metroScheduleId = setTimeout(metroSchedule, 100);
}

function metroStart() {
  if (metroRunning) return;
  metroRunning = true;
  const ctx = getAudioCtx();
  metroNextBeat = ctx.currentTime;
  metroSchedule();
  document.getElementById('metroToggle').textContent = '⏹';
  document.getElementById('metroToggle').classList.add('on');
}

function metroStop() {
  metroRunning = false;
  clearTimeout(metroScheduleId);
  document.getElementById('metroToggle').textContent = '▶';
  document.getElementById('metroToggle').classList.remove('on');
}

function setBpm(val) {
  metroBpm = Math.max(30, Math.min(280, val));
  bpmDisplay.textContent = metroBpm;
}

document.getElementById('metroToggle').onclick = () => {
  metroRunning ? metroStop() : metroStart();
};
document.getElementById('metroDec').onclick = () => setBpm(metroBpm - 2);
document.getElementById('metroInc').onclick = () => setBpm(metroBpm + 2);

// TAP tempo
document.getElementById('metroTap').onclick = () => {
  const now = Date.now();
  tapTimes.push(now);
  if (tapTimes.length > 4) tapTimes.shift();
  if (tapTimes.length >= 2) {
    const diffs = [];
    for (let i = 1; i < tapTimes.length; i++) diffs.push(tapTimes[i] - tapTimes[i-1]);
    const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    setBpm(Math.round(60000 / avg));
  }
  if (tapTimes.length === 1 || now - tapTimes[tapTimes.length - 2] > 2500) tapTimes = [now];
};

// ─────────────────────────────────────────────
// SESSION TIMER
// ─────────────────────────────────────────────
let sessionRunning = false;
let sessionSeconds = 0;
let sessionInterval = null;

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

document.getElementById('sessionToggle').onclick = () => {
  if (!sessionRunning) {
    sessionRunning = true;
    document.getElementById('sessionToggle').textContent = 'Stop';
    sessionInterval = setInterval(() => {
      sessionSeconds++;
      document.getElementById('sessionTimer').textContent = formatTime(sessionSeconds);
      document.getElementById('timerDisplay').textContent = formatTime(sessionSeconds);
    }, 1000);
  } else {
    sessionRunning = false;
    document.getElementById('sessionToggle').textContent = 'Start';
    clearInterval(sessionInterval);
  }
};

// ─────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  document.querySelector(`[data-page="${pageId}"]`).classList.add('active');
}

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.onclick = () => showPage(tab.dataset.page);
});

// ─────────────────────────────────────────────
// EXERCISE STORE (evita problemi con JSON.stringify in onclick)
// ─────────────────────────────────────────────
const exerciseStore = {};

function storeExercise(ex) {
  exerciseStore[ex.id] = ex;
}

// ─────────────────────────────────────────────
// RENDER FUNCTIONS
// ─────────────────────────────────────────────

function renderTab(tabLines) {
  return `<div class="tab-container">${
    tabLines.map(line => {
      const coloredLine = line.replace(/^([eBGDAe])\|/, '<span class="string-name">$1</span>|');
      return `<div class="tab-line">${coloredLine}</div>`;
    }).join('')
  }</div>`;
}

function renderExercise(ex) {
  storeExercise(ex);
  const bpmText = ex.bpm === 0
    ? '<span style="color:var(--accent2)">Libero (senza metronomo)</span>'
    : `<span class="bpm-badge">${ex.bpm} BPM</span>${ex.bpmTarget ? `<span class="bpm-label">→ obiettivo <strong>${ex.bpmTarget} BPM</strong></span>` : ''}`;

  return `
    <div class="ex-card" id="excard-${ex.id}">
      <div class="ex-header" onclick="toggleEx('${ex.id}')">
        <div class="ex-header-left">
          <div class="ex-id">ES. ${ex.id}</div>
          <div class="ex-title">${ex.title}</div>
          ${ex.technique ? `<span class="ex-technique">${ex.technique}</span>` : ''}
        </div>
        <div class="ex-chevron">▼</div>
      </div>
      <div class="ex-body">
        <div class="bpm-row">${bpmText}</div>
        ${renderTab(ex.tab)}
        <div class="play-row">
          <button class="btn btn-primary" id="playbtn-${ex.id}"
            onclick="handlePlay('${ex.id}', this)">
            ▶ Ascolta
          </button>
          <button class="btn btn-secondary"
            onclick="setBpm(${ex.bpm || 80}); metroStart()">
            🎵 Metronomo ${ex.bpm || 80} BPM
          </button>
        </div>
        <div class="tip-box"><strong>💡 Tip:</strong> ${ex.tip}</div>
      </div>
    </div>`;
}

function toggleEx(id) {
  const card = document.getElementById('excard-' + id);
  card.classList.toggle('open');
}

function handlePlay(id, btn) {
  if (btn.dataset.playing) return;
  const ex = exerciseStore[id];
  if (!ex) return;
  const notes = ex.notes;
  const bpm = ex.bpm || 80;
  if (!audioReady) {
    loadInstrument().then(() => playExercise(notes, bpm, btn));
  } else {
    playExercise(notes, bpm, btn);
  }
}

function renderMonthPage(monthData, pageId) {
  const container = document.getElementById('page-' + pageId);
  let html = `
    <div class="month-header">
      <div class="month-num">Mese ${monthData.id}</div>
      <div class="month-title">${monthData.title}</div>
      <div class="month-obj">${monthData.objective}</div>
    </div>`;

  monthData.weeks.forEach(week => {
    html += `<div class="week-label">📅 Settimane ${week.id} — ${week.title.split('—')[1] || ''}</div>`;
    week.exercises.forEach(ex => {
      html += renderExercise(ex);
    });
  });

  container.innerHTML = html;
}

function renderMelodicPage() {
  const container = document.getElementById('page-melodic');
  let html = `
    <div class="month-header">
      <div class="month-num">Supplemento</div>
      <div class="month-title">Esercizi Melodici</div>
      <div class="month-obj">Sequenze modali · Frasi Petrucci-style · Dinamica & Fraseggio. Da usare negli ultimi 5-8 min della sessione dalla settimana 3.</div>
    </div>`;

  let currentChapter = '';
  PROGRAM.melodicExercises.forEach(ex => {
    if (ex.chapter !== currentChapter) {
      currentChapter = ex.chapter;
      html += `<div class="week-label">🎵 ${ex.chapter}</div>`;
      if (ex.sound) html += `<div style="font-size:0.78rem;color:var(--text2);margin-bottom:8px">${ex.sound}</div>`;
    }
    html += renderExercise(ex);
  });

  container.innerHTML = html;
}

function renderBackingPage() {
  const container = document.getElementById('page-backing');
  let html = `
    <div class="month-header">
      <div class="month-num">Backing Tracks</div>
      <div class="month-title">Progressioni per Improvvisare</div>
      <div class="month-obj">5 progressioni da semplice a complessa, con scala consigliata e termine di ricerca YouTube.</div>
    </div>`;

  PROGRAM.backingTracks.forEach(bt => {
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(bt.youtube)}`;
    html += `
      <div class="bt-card">
        <div class="bt-id">${bt.id} · ${bt.months}</div>
        <div class="bt-title">${bt.title}</div>
        <div class="bt-chords">${bt.chords.map(c => `<span class="bt-chord">${c}</span>`).join('')}</div>
        <div class="bt-info">
          <strong>Tonalità:</strong> ${bt.key}<br>
          <strong>Tempo:</strong> ${bt.bpm} BPM<br>
          <strong>Scale:</strong> ${bt.scale}
        </div>
        <a class="bt-search" href="${ytUrl}" target="_blank" rel="noopener">
          🔎 Cerca su YouTube: "${bt.youtube}"
        </a>
      </div>`;
  });

  container.innerHTML = html;
}

function renderHomePage() {
  // Session structure
  const ssContainer = document.getElementById('sessionStructure');
  ssContainer.innerHTML = PROGRAM.sessionStructure.map(s => `
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;margin-bottom:8px">
      <div>
        <div style="font-size:0.85rem;font-weight:700">${s.phase}</div>
        <div style="font-size:0.78rem;color:var(--text2)">${s.content}</div>
      </div>
      <div style="font-size:0.82rem;font-weight:700;color:var(--accent2)">${s.duration}</div>
    </div>`).join('');

  // Principles
  const pcContainer = document.getElementById('principlesContainer');
  pcContainer.innerHTML = PROGRAM.principles.map(p => `
    <div class="principle-card">
      <div class="principle-title">${p.title}</div>
      <div class="principle-text">${p.text}</div>
    </div>`).join('');
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
function init() {
  renderHomePage();
  PROGRAM.months.forEach((month, i) => {
    renderMonthPage(month, 'm' + (i + 1));
  });
  renderMelodicPage();
  renderBackingPage();

  // Load audio on first user interaction
  document.body.addEventListener('touchstart', () => {
    if (!audioReady) loadInstrument();
  }, { once: true });
  document.body.addEventListener('click', () => {
    if (!audioReady) loadInstrument();
  }, { once: true });
}

init();
