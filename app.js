const STORAGE_KEY = "set-click-metronome-v2";
const EMPTY_STATE = { songs: [], items: [], selectedId: null };

let state = loadState();
let selectedId = state.selectedId || state.songs[0]?.id || null;
let sortMode = "custom";
let sortedViewIds = [];
let tempSpeed = 0;
let isPlaying = false;
let currentBeat = -1;
let timerId = null;
let audioContext = null;
let tapTimes = [];
let draggedItemId = null;

const els = {
  songName: document.querySelector("#songName"),
  capo: document.querySelector("#capo"),
  tempoInput: document.querySelector("#tempoInput"),
  beatsPerBar: document.querySelector("#beatsPerBar"),
  beatValue: document.querySelector("#beatValue"),
  doubleTime: document.querySelector("#doubleTime"),
  beatDisplay: document.querySelector("#beatDisplay"),
  tempoValue: document.querySelector("#tempoValue"),
  effectiveLabel: document.querySelector("#effectiveLabel"),
  playToggle: document.querySelector("#playToggle"),
  previousSong: document.querySelector("#previousSong"),
  nextSong: document.querySelector("#nextSong"),
  tapTempo: document.querySelector("#tapTempo"),
  notes: document.querySelector("#notes"),
  songsList: document.querySelector("#songsList"),
  addSong: document.querySelector("#addSong"),
  addDivider: document.querySelector("#addDivider"),
  importSongs: document.querySelector("#importSongs"),
  exportSongs: document.querySelector("#exportSongs"),
  clearSongs: document.querySelector("#clearSongs"),
  importFile: document.querySelector("#importFile")
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved?.songs)) {
      return normalizeState(saved);
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return normalizeState(EMPTY_STATE);
}

function normalizeState(raw) {
  const songs = (raw.songs || []).map((song) => ({
    id: song.id || crypto.randomUUID(),
    name: song.name || "Untitled Song",
    tempo: clamp(parseInt(song.tempo, 10) || 80, 1, 300),
    capo: clamp(parseInt(song.capo, 10) || 0, 0, 12),
    notes: song.notes || "",
    beatsPerBar: clamp(parseInt(song.beatsPerBar, 10) || 4, 1, 24),
    beatValue: clamp(parseInt(song.beatValue, 10) || 4, 1, 64),
    doubleTime: Boolean(song.doubleTime),
    accents: Array.isArray(song.accents) ? song.accents.filter((beat) => Number.isInteger(beat)) : [0]
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
  const selected = songs.some((song) => song.id === raw.selectedId) ? raw.selectedId : songs[0]?.id || null;
  return { songs, items, selectedId: selected };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ songs: state.songs, items: state.items, selectedId }));
}

function selectedSong() {
  return state.songs.find((song) => song.id === selectedId) || state.songs[0] || null;
}

function effectiveTempo(song = selectedSong()) {
  if (!song) return 0;
  return Math.max(1, Math.round(song.tempo * (song.doubleTime ? 2 : 1) * (1 + tempSpeed / 100)));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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
  els.songName.value = song.name;
  resizeSongName();
  els.capo.value = song.capo;
  els.tempoInput.value = song.tempo;
  els.beatsPerBar.value = song.beatsPerBar;
  els.beatValue.value = song.beatValue;
  els.doubleTime.classList.toggle("active", song.doubleTime);
  els.doubleTime.ariaPressed = String(song.doubleTime);
  els.notes.value = song.notes;
  els.tempoValue.textContent = effectiveTempo(song);
  els.effectiveLabel.textContent = tempoLabel(song);
  els.playToggle.textContent = isPlaying ? "⏸" : "▶";
  document.querySelectorAll("[data-speed]").forEach((item) => item.classList.toggle("active", Number(item.dataset.speed) === tempSpeed));
  renderBeats(song);
  renderSongs(song);
  saveState();
}

function renderEmptyState() {
  setEditorDisabled(true);
  els.songName.value = "";
  resizeSongName();
  els.capo.value = "";
  els.tempoInput.value = "";
  els.beatsPerBar.value = "";
  els.beatValue.value = "4";
  els.doubleTime.classList.remove("active");
  els.doubleTime.ariaPressed = "false";
  els.notes.value = "";
  els.tempoValue.textContent = "--";
  els.effectiveLabel.textContent = "Add a song";
  els.playToggle.textContent = "▶";
  els.beatDisplay.innerHTML = "";
  els.songsList.innerHTML = `<div class="empty-set">No songs yet. Add one to start building the set.</div>`;
  document.querySelectorAll("[data-speed]").forEach((item) => item.classList.toggle("active", Number(item.dataset.speed) === 0));
}

function setEditorDisabled(disabled) {
  [
    els.songName,
    els.capo,
    els.tempoInput,
    els.beatsPerBar,
    els.beatValue,
    els.doubleTime,
    els.notes,
    els.tapTempo,
    els.playToggle,
    els.previousSong,
    els.nextSong
  ].forEach((control) => {
    control.disabled = disabled;
  });
  document.querySelectorAll("[data-speed]").forEach((button) => {
    button.disabled = disabled;
  });
}

function tempoLabel(song) {
  const pieces = [];
  if (song.doubleTime) pieces.push("double time");
  if (tempSpeed !== 0) pieces.push(`${tempSpeed > 0 ? "+" : ""}${tempSpeed}% practice speed`);
  return pieces.length ? `${song.tempo} BPM, ${pieces.join(", ")}` : "Stored tempo";
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
  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.classList.toggle("active-sort", button.dataset.sort === sortMode);
  });
  const entries = visibleSetEntries();
  entries.forEach((entry) => {
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

function songMetaText(song) {
  const parts = [`${song.beatsPerBar}/${song.beatValue}`];
  if (song.capo) parts.push(`Capo ${song.capo}`);
  return parts.join(" · ");
}

function renderSongMeta(container, song) {
  container.textContent = songMetaText(song);
  if (!song.notes.trim()) return;
  const icon = document.createElement("span");
  icon.className = "notes-icon";
  icon.title = "Has notes";
  icon.ariaLabel = "Has notes";
  container.append(icon);
}

function updateSong(patch) {
  const song = selectedSong();
  if (!song) return;
  Object.assign(song, patch);
  if (sortMode !== "custom" && ("tempo" in patch || "capo" in patch || "name" in patch)) {
    sortedViewIds = sortedSongIds(sortMode);
  }
  if ("tempo" in patch && isPlaying) restartClock();
  if ("doubleTime" in patch && isPlaying) restartClock();
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
  if (song.accents.includes(beat)) {
    song.accents = song.accents.filter((item) => item !== beat);
  } else {
    song.accents = [...song.accents, beat].sort((a, b) => a - b);
  }
  render();
}

function playClick(accented) {
  audioContext ||= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = accented ? 1350 : 870;
  oscillator.type = "sine";
  gain.gain.setValueAtTime(accented ? 0.45 : 0.25, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.055);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.06);
}

function tick() {
  const song = selectedSong();
  if (!song) return;
  currentBeat = (currentBeat + 1) % song.beatsPerBar;
  playClick(song.accents.includes(currentBeat));
  renderBeats(song);
}

function startClock() {
  if (!selectedSong()) return;
  isPlaying = true;
  currentBeat = -1;
  tick();
  timerId = setInterval(tick, 60000 / effectiveTempo());
  render();
}

function stopClock() {
  isPlaying = false;
  clearInterval(timerId);
  timerId = null;
  currentBeat = -1;
  render();
}

function restartClock() {
  clearInterval(timerId);
  timerId = null;
  if (isPlaying) startClock();
}

function getSong(id) {
  return state.songs.find((song) => song.id === id) || null;
}

function visibleSetEntries() {
  if (sortMode === "custom") {
    return state.items;
  }
  if (!sortedViewIds.length) {
    sortedViewIds = sortedSongIds(sortMode);
  }
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

function addSong() {
  const song = {
    id: crypto.randomUUID(),
    name: "New Song",
    tempo: 80,
    capo: 0,
    notes: "",
    beatsPerBar: 4,
    beatValue: 4,
    doubleTime: false,
    accents: [0]
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

function exportSongs() {
  const blob = new Blob([JSON.stringify({ songs: state.songs, items: state.items }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "set-click-songs.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function importSongs(file) {
  const text = await file.text();
  const imported = normalizeState(JSON.parse(text));
  state = imported;
  selectedId = imported.selectedId;
  sortMode = "custom";
  sortedViewIds = [];
  tempSpeed = 0;
  stopClock();
  render();
}

els.songName.addEventListener("input", (event) => updateSong({ name: event.target.value || "Untitled Song" }));
els.capo.addEventListener("input", (event) => updateSong({ capo: clamp(parseInt(event.target.value, 10) || 0, 0, 12) }));
els.tempoInput.addEventListener("input", (event) => {
  if (event.target.value === "") return;
  const tempo = parseInt(event.target.value, 10);
  if (!Number.isFinite(tempo) || tempo < 1) return;
  updateSong({ tempo: clamp(tempo, 1, 300) });
});
els.tempoInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    commitTempoInput();
  }
});
els.tempoInput.addEventListener("blur", commitTempoInput);
els.beatsPerBar.addEventListener("input", (event) => updateSong({ beatsPerBar: clamp(parseInt(event.target.value, 10) || 1, 1, 24) }));
els.beatValue.addEventListener("input", (event) => {
  if (event.target.value === "") return;
  updateSong({ beatValue: clamp(parseInt(event.target.value, 10) || 1, 1, 64) });
});
els.beatValue.addEventListener("blur", () => {
  updateSong({ beatValue: clamp(parseInt(els.beatValue.value, 10) || 1, 1, 64) });
});
els.doubleTime.addEventListener("click", () => {
  const song = selectedSong();
  if (!song) return;
  updateSong({ doubleTime: !song.doubleTime });
});
els.notes.addEventListener("input", (event) => updateSong({ notes: event.target.value }));
els.playToggle.addEventListener("click", () => (isPlaying ? stopClock() : startClock()));
els.previousSong.addEventListener("click", () => {
  if (!state.songs.length) return;
  const songIds = visibleSongIds();
  const index = songIds.indexOf(selectedId);
  chooseSong(songIds[(index - 1 + songIds.length) % songIds.length]);
});
els.nextSong.addEventListener("click", () => {
  if (!state.songs.length) return;
  const songIds = visibleSongIds();
  const index = songIds.indexOf(selectedId);
  chooseSong(songIds[(index + 1) % songIds.length]);
});
els.tapTempo.addEventListener("click", () => {
  const now = performance.now();
  tapTimes = tapTimes.filter((time) => now - time < 2500);
  tapTimes.push(now);
  if (tapTimes.length >= 2) {
    const intervals = tapTimes.slice(1).map((time, index) => time - tapTimes[index]);
    const average = intervals.reduce((sum, item) => sum + item, 0) / intervals.length;
    updateSong({ tempo: clamp(Math.round(60000 / average), 1, 300) });
  }
});
document.querySelectorAll("[data-speed]").forEach((button) => {
  button.addEventListener("click", () => {
    const value = Number(button.dataset.speed);
    tempSpeed = value;
    document.querySelectorAll("[data-speed]").forEach((item) => item.classList.toggle("active", Number(item.dataset.speed) === tempSpeed));
    if (isPlaying) restartClock();
    render();
  });
});
els.addSong.addEventListener("click", addSong);
els.addDivider.addEventListener("click", addDivider);
els.exportSongs.addEventListener("click", exportSongs);
els.importSongs.addEventListener("click", () => els.importFile.click());
els.importFile.addEventListener("change", (event) => {
  if (event.target.files[0]) importSongs(event.target.files[0]);
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
document.querySelectorAll("[data-sort]").forEach((button) => {
  button.addEventListener("click", () => sortSongs(button.dataset.sort));
});

function commitTempoInput() {
  const tempo = clamp(parseInt(els.tempoInput.value, 10) || 1, 1, 300);
  updateSong({ tempo });
}

function resizeSongName() {
  els.songName.style.height = "auto";
  els.songName.style.height = `${els.songName.scrollHeight}px`;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // The app still works without offline caching, such as when opened from file://.
    });
  });
}

render();
