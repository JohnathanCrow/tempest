/* ============================================================
   CONSTANTS & STATE
   ============================================================ */

const STORAGE_KEY = "set-click-metronome-v2";
const EMPTY_STATE = { songs: [], items: [], selectedId: null };
const SCHEDULE_AHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;

let state = loadState();
let selectedId = state.selectedId || state.songs[0]?.id || null;
let sortMode = "custom";
let sortedViewIds = [];
let tempSpeed = 0;
let importMode = "replace";


/* ============================================================
   AUDIO STATE
   ============================================================ */

let audioContext = null;
let masterGain = null;
let isPlaying = false;
let currentBeat = -1;
let schedulerId = null;
let nextClickTime = 0;
let nextBeatIndex = 0;
let tapTimes = [];


/* ============================================================
   UI STATE
   ============================================================ */

let draggedItemId = null;


/* ============================================================
   ELEMENT REFERENCES
   ============================================================ */

const els = {
  songName:             document.querySelector("#songName"),
  capo:                 document.querySelector("#capo"),
  tempoInput:           document.querySelector("#tempoInput"),
  beatFrequency:        document.querySelector("#beatFrequency"),
  accentFrequency:      document.querySelector("#accentFrequency"),
  beatsPerBar:          document.querySelector("#beatsPerBar"),
  beatValue:            document.querySelector("#beatValue"),
  doubleTime:           document.querySelector("#doubleTime"),
  subdivision:          document.querySelector("#subdivision"),
  subdivisionFrequency: document.querySelector("#subdivisionFrequency"),
  beatDisplay:          document.querySelector("#beatDisplay"),
  tempoValue:           document.querySelector("#tempoValue"),
  effectiveLabel:       document.querySelector("#effectiveLabel"),
  playToggle:           document.querySelector("#playToggle"),
  previousSong:         document.querySelector("#previousSong"),
  nextSong:             document.querySelector("#nextSong"),
  tapTempo:             document.querySelector("#tapTempo"),
  notes:                document.querySelector("#notes"),
  songsList:            document.querySelector("#songsList"),
  addSong:              document.querySelector("#addSong"),
  addDivider:           document.querySelector("#addDivider"),
  replaceSongs:         document.querySelector("#replaceSongs"),
  mergeSongs:           document.querySelector("#mergeSongs"),
  exportSongs:          document.querySelector("#exportSongs"),
  clearSongs:           document.querySelector("#clearSongs"),
  importFile:           document.querySelector("#importFile"),
};


/* ============================================================
   STATE — PERSISTENCE
   ============================================================ */

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved?.songs)) return normalizeState(saved);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return normalizeState(EMPTY_STATE);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    songs: state.songs,
    items: state.items,
    selectedId,
  }));
}

function normalizeState(raw) {
  const songs = (raw.songs || []).map((song) => ({
    id:                   song.id || crypto.randomUUID(),
    name:                 song.name || "Untitled Song",
    tempo:                clamp(parseInt(song.tempo, 10) || 100, 1, 400),
    beatFrequency:        clamp(parseInt(song.beatFrequency, 10) || 1000, 1, 4000),
    accentFrequency:      clamp(parseInt(song.accentFrequency, 10) || 800, 1, 4000),
    subdivisionFrequency: clamp(parseInt(song.subdivisionFrequency, 10) || 1200, 1, 4000),
    capo:                 clamp(parseInt(song.capo, 10) || 0, 0, 12),
    beatsPerBar:          clamp(parseInt(song.beatsPerBar, 10) || 4, 1, 24),
    beatValue:            clamp(parseInt(song.beatValue, 10) || 4, 1, 64),
    subdivision:          clamp(parseInt(song.subdivision, 10) || 1, 1, 8),
    doubleTime:           Boolean(song.doubleTime),
    notes:                song.notes || "",
    accents:              Array.isArray(song.accents)
                            ? song.accents.filter((beat) => Number.isInteger(beat))
                            : [],
  }));

  const songIds = new Set(songs.map((song) => song.id));
  const rawItems = Array.isArray(raw.items)
    ? raw.items
    : songs.map((song) => ({ type: "song", id: song.id, songId: song.id }));

  const seenSongs = new Set();
  const items = rawItems
    .map((item) => {
      if (item.type === "divider") {
        return { type: "divider", id: item.id || crypto.randomUUID() };
      }
      const songId = item.songId || item.id;
      if (!songIds.has(songId) || seenSongs.has(songId)) return null;
      seenSongs.add(songId);
      return { type: "song", id: item.id || songId, songId };
    })
    .filter(Boolean);

  songs.forEach((song) => {
    if (!seenSongs.has(song.id)) {
      items.push({ type: "song", id: song.id, songId: song.id });
    }
  });

  const selected = songs.some((song) => song.id === raw.selectedId)
    ? raw.selectedId
    : songs[0]?.id || null;

  return { songs, items, selectedId: selected };
}


/* ============================================================
   STATE — HELPERS
   ============================================================ */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function selectedSong() {
  return state.songs.find((song) => song.id === selectedId) || state.songs[0] || null;
}

function effectiveTempo(song = selectedSong()) {
  if (!song) return 0;
  return Math.max(1, Math.round(song.tempo * (song.doubleTime ? 2 : 1) * (1 + tempSpeed / 100)));
}

function tempoLabel(song) {
  const pieces = [];
  if (song.doubleTime) pieces.push("double time");
  if (tempSpeed !== 0) pieces.push(`${tempSpeed > 0 ? "+" : ""}${tempSpeed}%`);
  return pieces.length ? `${song.tempo} BPM, ${pieces.join(", ")}` : "Stored tempo";
}

function getSong(id) {
  return state.songs.find((song) => song.id === id) || null;
}

function visibleSetEntries() {
  if (sortMode === "custom") return state.items;
  if (!sortedViewIds.length) sortedViewIds = sortedSongIds(sortMode);
  return sortedViewIds.map((songId) => ({ type: "song", id: songId, songId }));
}

function visibleSongIds() {
  return visibleSetEntries()
    .filter((entry) => entry.type === "song" && getSong(entry.songId))
    .map((entry) => entry.songId);
}

function sortedSongIds(mode) {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return [...state.songs]
    .sort((a, b) => {
      if (mode === "tempo") return a.tempo - b.tempo || collator.compare(a.name, b.name);
      if (mode === "capo") return a.capo - b.capo || collator.compare(a.name, b.name);
      return collator.compare(a.name, b.name);
    })
    .map((song) => song.id);
}


/* ============================================================
   RENDER
   ============================================================ */

function render() {
  const song = selectedSong();
  if (!song) {
    selectedId = null;
    renderEmptyState();
    saveState();
    return;
  }

  selectedId = song.id;
  setEditorDisabled(false);

  els.songName.value             = song.name;
  els.capo.value                 = song.capo;
  els.tempoInput.value           = song.tempo;
  els.beatFrequency.value        = song.beatFrequency;
  els.accentFrequency.value      = song.accentFrequency;
  els.beatsPerBar.value          = song.beatsPerBar;
  els.beatValue.value            = song.beatValue;
  els.subdivision.value          = song.subdivision;
  els.subdivisionFrequency.value = song.subdivisionFrequency;
  els.notes.value                = song.notes;
  els.tempoValue.textContent     = effectiveTempo(song);
  els.effectiveLabel.textContent = tempoLabel(song);
  els.playToggle.textContent     = isPlaying ? "⏸" : "▶";

  els.doubleTime.classList.toggle("active", song.doubleTime);
  els.doubleTime.ariaPressed = String(song.doubleTime);

  document.querySelectorAll("[data-speed]").forEach((item) =>
    item.classList.toggle("active", Number(item.dataset.speed) === tempSpeed)
  );

  renderBeats(song);
  renderSongs(song);
  saveState();
}

function renderEmptyState() {
  setEditorDisabled(true);

  els.songName.value             = "";
  els.capo.value                 = "";
  els.tempoInput.value           = "";
  els.beatFrequency.value        = "";
  els.accentFrequency.value      = "";
  els.beatsPerBar.value          = "";
  els.beatValue.value            = "4";
  els.subdivision.value          = "";
  els.subdivisionFrequency.value = "";
  els.notes.value                = "";
  els.tempoValue.textContent     = "--";
  els.effectiveLabel.textContent = "Add a song";
  els.playToggle.textContent     = "▶";
  els.beatDisplay.innerHTML      = "";

  els.doubleTime.classList.remove("active");
  els.doubleTime.ariaPressed = "false";

  els.songsList.innerHTML = `<div class="empty-set">Add songs with the 'New' button.</div>`;

  document.querySelectorAll("[data-speed]").forEach((item) =>
    item.classList.toggle("active", Number(item.dataset.speed) === 0)
  );
}

function setEditorDisabled(disabled) {
  [
    els.songName, els.capo, els.tempoInput,
    els.beatFrequency, els.accentFrequency,
    els.beatsPerBar, els.beatValue,
    els.doubleTime, els.notes,
    els.tapTempo, els.playToggle,
    els.previousSong, els.nextSong,
  ].forEach((control) => { control.disabled = disabled; });

  document.querySelectorAll("[data-speed]").forEach((button) => {
    button.disabled = disabled;
  });
}

function renderBeats(song) {
  const validAccents = new Set(song.accents.filter((beat) => beat < song.beatsPerBar));
  song.accents = [...validAccents].sort((a, b) => a - b);
  els.beatDisplay.innerHTML = "";

  for (let index = 0; index < song.beatsPerBar; index += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "beat";
    button.textContent = index + 1;
    button.dataset.beat = index;
    button.ariaLabel = `Beat ${index + 1}${song.accents.includes(index) ? " accented" : ""}`;
    button.classList.toggle("accent", song.accents.includes(index));
    button.classList.toggle("current", index === currentBeat);
    button.addEventListener("click", () => toggleAccent(index));
    els.beatDisplay.append(button);
  }
}

function renderSongs(activeSong) {
  els.songsList.innerHTML = "";
  document.querySelectorAll("[data-sort]").forEach((button) =>
    button.classList.toggle("active-sort", button.dataset.sort === sortMode)
  );

  visibleSetEntries().forEach((entry) => {
    if (entry.type === "divider") {
      renderDivider(entry);
      return;
    }
    const song = getSong(entry.songId);
    if (!song) return;

    const row = document.createElement("div");
    row.className = "song-item";
    row.draggable = true;
    row.dataset.itemId = entry.id;
    row.classList.toggle("active", song.id === activeSong.id);

    row.addEventListener("dragstart", (event) => {
      draggedItemId = entry.id;
      row.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      draggedItemId = null;
      row.classList.remove("dragging");
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      moveItem(draggedItemId, entry.id);
    });

    const select = document.createElement("button");
    select.type = "button";
    select.className = "select-song";
    select.innerHTML = `<span class="song-title"></span><span class="song-meta"></span>`;
    select.querySelector(".song-title").textContent = song.name;
    renderSongMeta(select.querySelector(".song-meta"), song);
    select.addEventListener("click", () => chooseSong(song.id));

    const bpm = document.createElement("span");
    bpm.className = "song-bpm";
    bpm.textContent = song.tempo;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-song";
    deleteButton.textContent = "×";
    deleteButton.ariaLabel = `Delete ${song.name}`;
    deleteButton.addEventListener("click", () => deleteSong(song.id));

    row.append(select, bpm, deleteButton);
    els.songsList.append(row);
  });
}

function renderDivider(entry) {
  const row = document.createElement("div");
  row.className = "divider-item";
  row.draggable = true;
  row.dataset.itemId = entry.id;

  row.addEventListener("dragstart", (event) => {
    draggedItemId = entry.id;
    row.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
  });
  row.addEventListener("dragend", () => {
    draggedItemId = null;
    row.classList.remove("dragging");
  });
  row.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });
  row.addEventListener("drop", (event) => {
    event.preventDefault();
    moveItem(draggedItemId, entry.id);
  });

  const rule = document.createElement("div");
  rule.className = "divider-rule";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-song";
  deleteButton.textContent = "×";
  deleteButton.ariaLabel = "Delete divider";
  deleteButton.addEventListener("click", () => deleteDivider(entry.id));

  row.append(rule, deleteButton);
  els.songsList.append(row);
}

function renderSongMeta(container, song) {
  const parts = [`${song.beatsPerBar}/${song.beatValue}`];
  if (song.capo) parts.push(`Capo ${song.capo}`);
  container.textContent = parts.join(" · ");

  if (!song.notes.trim()) return;
  const icon = document.createElement("span");
  icon.className = "notes-icon";
  icon.title = "Has notes";
  icon.ariaLabel = "Has notes";
  container.append(icon);
}


/* ============================================================
   SONG ACTIONS
   ============================================================ */

function updateSong(patch) {
  const song = selectedSong();
  if (!song) return;
  Object.assign(song, patch);
  if (sortMode !== "custom" && ("tempo" in patch || "capo" in patch || "name" in patch)) {
    sortedViewIds = sortedSongIds(sortMode);
  }
  render();
}

function chooseSong(id) {
  if (!id) return;
  selectedId = id;
  tempSpeed = 0;
  currentBeat = -1;
  if (isPlaying) restartClock();
  render();
}

function toggleAccent(beat) {
  const song = selectedSong();
  if (!song) return;
  song.accents = song.accents.includes(beat)
    ? song.accents.filter((item) => item !== beat)
    : [...song.accents, beat].sort((a, b) => a - b);
  render();
}

function addSong() {
  const song = {
    id:                   crypto.randomUUID(),
    name:                 "",
    tempo:                100,
    beatFrequency:        1000,
    accentFrequency:      800,
    subdivisionFrequency: 1200,
    capo:                 0,
    beatsPerBar:          4,
    beatValue:            4,
    subdivision:          1,
    doubleTime:           false,
    notes:                "",
    accents:              [],
  };
  state.songs.push(song);
  state.items.push({ type: "song", id: song.id, songId: song.id });
  sortMode = "custom";
  sortedViewIds = [];
  chooseSong(song.id);
}

function addDivider() {
  if (!state.songs.length) return;
  state.items.push({ type: "divider", id: crypto.randomUUID() });
  sortMode = "custom";
  sortedViewIds = [];
  render();
}

function deleteSong(id) {
  const index = state.songs.findIndex((song) => song.id === id);
  state.songs = state.songs.filter((song) => song.id !== id);
  state.items = state.items.filter((item) => item.type !== "song" || item.songId !== id);
  sortedViewIds = sortedViewIds.filter((songId) => songId !== id);
  if (selectedId === id) {
    selectedId = state.songs[Math.max(0, index - 1)]?.id || null;
    tempSpeed = 0;
  }
  if (!state.songs.length) {
    state.items = [];
    stopClock();
  }
  render();
}

function deleteDivider(id) {
  state.items = state.items.filter((item) => item.id !== id);
  render();
}

function moveItem(sourceId, targetId) {
  if (!sourceId || sourceId === targetId) return;
  if (sortMode !== "custom") {
    const sourceIndex = sortedViewIds.indexOf(sourceId);
    const targetIndex = sortedViewIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [songId] = sortedViewIds.splice(sourceIndex, 1);
    sortedViewIds.splice(targetIndex, 0, songId);
    render();
    return;
  }
  const sourceIndex = state.items.findIndex((item) => item.id === sourceId);
  const targetIndex = state.items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [item] = state.items.splice(sourceIndex, 1);
  state.items.splice(targetIndex, 0, item);
  render();
}

function sortSongs(mode) {
  sortMode = mode;
  sortedViewIds = mode === "custom" ? [] : sortedSongIds(mode);
  render();
}


/* ============================================================
   IMPORT / EXPORT
   ============================================================ */

function exportSongs() {
  const blob = new Blob(
    [JSON.stringify({ songs: state.songs, items: state.items }, null, 2)],
    { type: "application/json" }
  );
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "tempest_setlist.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function replaceSongs(file) {
  try {
    const imported = normalizeState(JSON.parse(await file.text()));
    state = imported;
    selectedId = imported.selectedId;
    sortMode = "custom";
    sortedViewIds = [];
    tempSpeed = 0;
    stopClock();
    render();
  } catch {
    alert("Failed to import file.");
  }
}

async function mergeSongs(file) {
  try {
    const imported = normalizeState(JSON.parse(await file.text()));
    const existingIds = new Set(state.songs.map((s) => s.id));
    const existingItemSongIds = new Set(
      state.items.filter((i) => i.type === "song").map((i) => i.songId)
    );
    state.songs.push(...imported.songs.filter((s) => !existingIds.has(s.id)));
    state.items.push(...imported.items.filter(
      (i) => i.type === "divider" || !existingItemSongIds.has(i.songId)
    ));
    sortMode = "custom";
    sortedViewIds = [];
    render();
  } catch {
    alert("Failed to import file.");
  }
}


/* ============================================================
   AUDIO — CONTEXT & CLOCK
   ============================================================ */

function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
    masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);
  }
  return audioContext;
}

function playClick(accented, time = ensureAudioContext().currentTime, song = selectedSong()) {
  const context = ensureAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = accented ? song.accentFrequency : song.beatFrequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(accented ? 0.45 : 0.25, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + 0.06);
}

function scheduleSubClick(time, song) {
  const context = ensureAudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = song.subdivisionFrequency;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(0.08, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start(time);
  oscillator.stop(time + 0.06);
}

function scheduleBeat(beatIndex, time) {
  const song = selectedSong();
  if (!song) return;
  playClick(song.accents.includes(beatIndex), time, song);
  window.setTimeout(() => {
    if (!isPlaying || selectedSong()?.id !== song.id) return;
    currentBeat = beatIndex;
    renderBeats(song);
  }, Math.max(0, (time - ensureAudioContext().currentTime) * 1000));
}

function schedulerTick() {
  const song = selectedSong();
  if (!song || !audioContext) return;
  while (nextClickTime < audioContext.currentTime + SCHEDULE_AHEAD_SECONDS) {
    const beatInterval = 60 / effectiveTempo(song);
    scheduleBeat(nextBeatIndex, nextClickTime);
    if (song.subdivision >= 2) {
      const subInterval = beatInterval / song.subdivision;
      for (let i = 1; i < song.subdivision; i++) {
        scheduleSubClick(nextClickTime + subInterval * i, song);
      }
    }
    nextBeatIndex = (nextBeatIndex + 1) % song.beatsPerBar;
    nextClickTime += beatInterval;
  }
}

function startClock() {
  if (!selectedSong()) return;
  ensureAudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
  isPlaying = true;
  currentBeat = 0;
  nextBeatIndex = 0;
  nextClickTime = audioContext.currentTime + 0.035;
  schedulerTick();
  schedulerId = window.setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
  render();
}

function stopClock() {
  isPlaying = false;
  clearInterval(schedulerId);
  schedulerId = null;
  currentBeat = -1;
  if (masterGain) {
    masterGain.gain.cancelScheduledValues(audioContext.currentTime);
    masterGain.gain.setValueAtTime(0, audioContext.currentTime);
    masterGain.gain.setValueAtTime(1, audioContext.currentTime + 0.08);
  }
  render();
}

function restartClock() {
  clearInterval(schedulerId);
  schedulerId = null;
  if (isPlaying) startClock();
}

function commitTempoInput() {
  updateSong({ tempo: clamp(parseInt(els.tempoInput.value, 10) || 1, 1, 400) });
}


/* ============================================================
   TABS
   ============================================================ */

const notesPanel = document.querySelector("[data-panel='notes']");

function initTabs() {
  document.querySelectorAll(".panel-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".panel-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      applyTab(tab.dataset.tab);
    });
  });
}

function applyTab(tab) {
  const stage = document.querySelector(".stage");
  const setList = document.querySelector(".set-list");
  const stageMain = document.querySelector(".stage-main");
  const isMobile = window.innerWidth <= 600;
  const isNarrow = window.innerWidth <= 1155;

  if (!isNarrow) {
    stage.style.display = "";
    setList.style.display = "";
    stageMain.style.display = "";
    if (notesPanel) notesPanel.style.display = "";
    return;
  }

  if (isMobile) {
    stage.style.display = tab === "notes" || tab === "control" ? "" : "none";
    setList.style.display = tab === "setlist" ? "" : "none";
    stageMain.style.display = tab === "control" ? "" : "none";
    if (notesPanel) notesPanel.style.display = tab === "notes" ? "" : "none";
  } else {
    stage.style.display = tab === "control" ? "" : "none";
    setList.style.display = tab === "setlist" ? "" : "none";
    if (notesPanel) notesPanel.style.display = "";
  }
}

function updateTabVisibility() {
  const isMobile = window.innerWidth <= 600;
  const notesTab = document.querySelector("[data-tab='notes']");
  if (notesTab) notesTab.style.display = isMobile ? "" : "none";
}


/* ============================================================
   EVENT LISTENERS — SONG SETTINGS
   ============================================================ */

els.songName.addEventListener("input", (event) =>
  updateSong({ name: event.target.value || "Untitled Song" })
);

els.capo.addEventListener("input", (event) =>
  updateSong({ capo: clamp(parseInt(event.target.value, 10) || 0, 0, 16) })
);

els.tempoInput.addEventListener("input", (event) => {
  if (event.target.value === "") return;
  const tempo = parseInt(event.target.value, 10);
  if (!Number.isFinite(tempo) || tempo < 1) return;
  updateSong({ tempo: clamp(tempo, 1, 400) });
});
els.tempoInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); commitTempoInput(); }
});
els.tempoInput.addEventListener("blur", commitTempoInput);

els.beatsPerBar.addEventListener("input", (event) =>
  updateSong({ beatsPerBar: clamp(parseInt(event.target.value, 10) || 1, 1, 16) })
);

els.beatValue.addEventListener("input", (event) => {
  if (event.target.value === "") return;
  updateSong({ beatValue: clamp(parseInt(event.target.value, 10) || 1, 1, 16) });
});
els.beatValue.addEventListener("blur", () =>
  updateSong({ beatValue: clamp(parseInt(els.beatValue.value, 10) || 1, 1, 16) })
);

els.beatFrequency.addEventListener("input", (event) => {
  if (event.target.value === "") return;
  const frequency = parseInt(event.target.value, 10);
  if (!Number.isFinite(frequency)) return;
  updateSong({ beatFrequency: clamp(frequency, 1, 4000) });
});
els.beatFrequency.addEventListener("blur", () =>
  updateSong({ beatFrequency: clamp(parseInt(els.beatFrequency.value, 10) || 1000, 1, 4000) })
);

els.accentFrequency.addEventListener("input", (event) => {
  if (event.target.value === "") return;
  const frequency = parseInt(event.target.value, 10);
  if (!Number.isFinite(frequency)) return;
  updateSong({ accentFrequency: clamp(frequency, 1, 4000) });
});
els.accentFrequency.addEventListener("blur", () =>
  updateSong({ accentFrequency: clamp(parseInt(els.accentFrequency.value, 10) || 800, 1, 4000) })
);

els.subdivision.addEventListener("input", (event) => {
  if (event.target.value === "") return;
  updateSong({ subdivision: clamp(parseInt(event.target.value, 10) || 1, 1, 16) });
});
els.subdivision.addEventListener("blur", () =>
  updateSong({ subdivision: clamp(parseInt(els.subdivision.value, 10) || 1, 1, 16) })
);

els.subdivisionFrequency.addEventListener("input", (event) => {
  if (event.target.value === "") return;
  const frequency = parseInt(event.target.value, 10);
  if (!Number.isFinite(frequency)) return;
  updateSong({ subdivisionFrequency: clamp(frequency, 1, 4000) });
});
els.subdivisionFrequency.addEventListener("blur", () =>
  updateSong({ subdivisionFrequency: clamp(parseInt(els.subdivisionFrequency.value, 10) || 1200, 1, 4000) })
);

els.doubleTime.addEventListener("click", () => {
  const song = selectedSong();
  if (!song) return;
  updateSong({ doubleTime: !song.doubleTime });
});

els.notes.addEventListener("input", (event) => updateSong({ notes: event.target.value }));


/* ============================================================
   EVENT LISTENERS — TRANSPORT & NAVIGATION
   ============================================================ */

els.playToggle.addEventListener("click", () => isPlaying ? stopClock() : startClock());

els.previousSong.addEventListener("click", () => {
  if (!state.songs.length) return;
  const songIds = visibleSongIds();
  chooseSong(songIds[(songIds.indexOf(selectedId) - 1 + songIds.length) % songIds.length]);
});

els.nextSong.addEventListener("click", () => {
  if (!state.songs.length) return;
  const songIds = visibleSongIds();
  chooseSong(songIds[(songIds.indexOf(selectedId) + 1) % songIds.length]);
});

els.tapTempo.addEventListener("click", () => {
  const now = performance.now();
  tapTimes = tapTimes.filter((time) => now - time < 2500);
  tapTimes.push(now);
  if (tapTimes.length > 8) tapTimes = tapTimes.slice(-8);
  if (tapTimes.length >= 2) {
    const intervals = tapTimes.slice(1).map((time, index) => time - tapTimes[index]);
    const average = intervals.reduce((sum, item) => sum + item, 0) / intervals.length;
    updateSong({ tempo: clamp(Math.round(60000 / average), 1, 400) });
  }
});

document.querySelectorAll("[data-speed]").forEach((button) => {
  button.addEventListener("click", () => {
    tempSpeed = Number(button.dataset.speed);
    document.querySelectorAll("[data-speed]").forEach((item) =>
      item.classList.toggle("active", Number(item.dataset.speed) === tempSpeed)
    );
    if (isPlaying) restartClock();
    render();
  });
});


/* ============================================================
   EVENT LISTENERS — SET LIST
   ============================================================ */

els.addSong.addEventListener("click", addSong);
els.addDivider.addEventListener("click", addDivider);
els.exportSongs.addEventListener("click", exportSongs);

els.replaceSongs.addEventListener("click", () => { importMode = "replace"; els.importFile.click(); });
els.mergeSongs.addEventListener("click", () => { importMode = "merge"; els.importFile.click(); });
els.importFile.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) importMode === "merge" ? mergeSongs(file) : replaceSongs(file);
  event.target.value = "";
});

els.clearSongs.addEventListener("click", () => {
  state = normalizeState(EMPTY_STATE);
  selectedId = state.selectedId;
  sortMode = "custom";
  sortedViewIds = [];
  tempSpeed = 0;
  stopClock();
  render();
});

document.querySelectorAll("[data-sort]").forEach((button) =>
  button.addEventListener("click", () => sortSongs(button.dataset.sort))
);


/* ============================================================
   EVENT LISTENERS — KEYBOARD SHORTCUTS
   ============================================================ */

document.addEventListener("keydown", (event) => {
  if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
  if (event.key === " ") { event.preventDefault(); isPlaying ? stopClock() : startClock(); }
  if (event.key === "ArrowLeft") { event.preventDefault(); els.previousSong.click(); }
  if (event.key === "ArrowRight") { event.preventDefault(); els.nextSong.click(); }
});


/* ============================================================
   EVENT LISTENERS — RESIZE
   ============================================================ */

window.addEventListener("resize", () => {
  const isNarrow = window.innerWidth <= 1155;
  if (!isNarrow) {
    document.querySelectorAll(".panel-tab").forEach((t) => t.classList.remove("active"));
    document.querySelector("[data-tab='control']").classList.add("active");
    document.querySelector(".stage").style.display = "";
    document.querySelector(".set-list").style.display = "";
    document.querySelector(".stage-main").style.display = "";
    if (notesPanel) notesPanel.style.display = "";
  } else {
    const activeTab = document.querySelector(".panel-tab.active");
    applyTab(activeTab ? activeTab.dataset.tab : "control");
  }
  updateTabVisibility();
});


/* ============================================================
   SERVICE WORKER
   ============================================================ */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}


/* ============================================================
   INIT
   ============================================================ */

initTabs();
updateTabVisibility();
applyTab("control");
render();