/* ============================================================
   CONSTANTS & STATE
   ============================================================ */

const STORAGE_KEY = "tempest-v3";
const FREE_SONG_KEY = "tempest-freesong-v1";
const FREE_MODE_KEY = "tempest-freemode-v1";
const FLASH_KEY = "tempest-flash-v1";

function createSong(overrides = {}) {
	return {
		id: crypto.randomUUID(),
		name: "Untitled Song",
		tempo: 100,
		beatFrequency: 1000,
		accentFrequency: 800,
		subdivisionFrequency: 1200,
		capo: 0,
		beatsPerBar: 4,
		beatValue: 4,
		subdivision: 1,
		doubleTime: false,
		swing: 0,
		notes: "",
		accents: [],
		...overrides
	};
}

const DEFAULT_FREE_SONG = createSong({ id: "free", name: "Free Mode" });
const SCHEDULE_AHEAD_SECONDS = 0.12;
const SCHEDULER_INTERVAL_MS = 25;

let state = loadState();
let selectedId = activeSetlist().songs[0]?.id || null;
let sortMode = "custom";
let sortedViewIds = [];
let tempSpeed = 0;
let importMode = "replace";
let freeSong = loadFreeSong();
let freeMode = localStorage.getItem(FREE_MODE_KEY) === "true";
let flashEnabled = localStorage.getItem(FLASH_KEY) === "true";


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
let isEditingTempo = false;
let beatElements = [];


/* ============================================================
   ELEMENT REFERENCES
   ============================================================ */

const els = {
	songName: document.querySelector("#songName"),
	capo: document.querySelector("#capo"),
	timeSignature: document.querySelector("#timeSignature"),
	beatFrequency: document.querySelector("#beatFrequency"),
	accentFrequency: document.querySelector("#accentFrequency"),
	beatsPerBar: document.querySelector("#beatsPerBar"),
	beatValue: document.querySelector("#beatValue"),
	doubleTime: document.querySelector("#doubleTime"),
	swingToggle: document.querySelector("#swingToggle"),
	subdivision: document.querySelector("#subdivision"),
	subdivisionFrequency: document.querySelector("#subdivisionFrequency"),
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
	replaceSongs: document.querySelector("#replaceSongs"),
	mergeSongs: document.querySelector("#mergeSongs"),
	exportSongs: document.querySelector("#exportSongs"),
	clearSongs: document.querySelector("#clearSongs"),
	importFile: document.querySelector("#importFile"),
	practiceSpeed: document.querySelector("#practiceSpeed"),
	practiceSpeedLabel: document.querySelector("#practiceSpeedLabel"),
};


/* ============================================================
   STATE — PERSISTENCE
   ============================================================ */

function loadState() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (raw?.setlists) return raw;

        // Legacy migration
        const legacy = JSON.parse(localStorage.getItem("set-click-metronome-v2"));
        if (legacy?.songs) {
            const setlist = { id: crypto.randomUUID(), name: "Setlist 1", ...normalizeSetlist(legacy) };
            return { setlists: [setlist], activeSetlistId: setlist.id };
        }
    } catch {
        localStorage.removeItem(STORAGE_KEY);
    }
    const setlist = { id: crypto.randomUUID(), name: "Setlist 1", ...normalizeSetlist({}) };
    return { setlists: [setlist], activeSetlistId: setlist.id };
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem(FREE_SONG_KEY, JSON.stringify(freeSong));
    localStorage.setItem(FREE_MODE_KEY, String(freeMode));
    localStorage.setItem(FLASH_KEY, String(flashEnabled));
}

function loadFreeSong() {
    try {
        const saved = JSON.parse(localStorage.getItem(FREE_SONG_KEY));
        if (saved) return { ...DEFAULT_FREE_SONG, ...saved };
    } catch {}
    return { ...DEFAULT_FREE_SONG };
}

function activeSetlist() {
    return state.setlists.find(s => s.id === state.activeSetlistId) || state.setlists[0];
}

function normalizeSetlist(raw) {
	const defaults = createSong();
    const songs = (raw.songs || []).map((song) => ({
		id: song.id || defaults.id,
		name: song.name || defaults.name,
		tempo: clamp(parseInt(song.tempo, 10) || defaults.tempo, 1, 400),
		beatFrequency: clamp(parseInt(song.beatFrequency, 10) || defaults.beatFrequency, 1, 4000),
		accentFrequency: clamp(parseInt(song.accentFrequency, 10) || defaults.accentFrequency, 1, 4000),
		subdivisionFrequency: clamp(parseInt(song.subdivisionFrequency, 10) || defaults.subdivisionFrequency, 1, 4000),
		capo: clamp(parseInt(song.capo, 10) || defaults.capo, 0, 12),
		beatsPerBar: clamp(parseInt(song.beatsPerBar, 10) || defaults.beatsPerBar, 1, 24),
		beatValue: clamp(parseInt(song.beatValue, 10) || defaults.beatValue, 1, 64),
		subdivision: clamp(parseInt(song.subdivision, 10) || defaults.subdivision, 1, 8),
		doubleTime: Boolean(song.doubleTime),
		swing: clamp(parseInt(song.swing, 10) || defaults.swing, 0, 3),
		notes: song.notes || defaults.notes,
		accents: Array.isArray(song.accents) ? song.accents.filter((beat) => Number.isInteger(beat)) : defaults.accents,
	}));

    const songIds = new Set(songs.map((song) => song.id));
    const rawItems = Array.isArray(raw.items) ?
        raw.items :
        songs.map((song) => ({ type: "song", id: song.id, songId: song.id }));

    const seenSongs = new Set();
    const items = rawItems.map((item) => {
        if (item.type === "divider") return { type: "divider", id: item.id || crypto.randomUUID() };
        const songId = item.songId || item.id;
        if (!songIds.has(songId) || seenSongs.has(songId)) return null;
        seenSongs.add(songId);
        return { type: "song", id: item.id || songId, songId };
    }).filter(Boolean);

    songs.forEach((song) => {
        if (!seenSongs.has(song.id)) items.push({ type: "song", id: song.id, songId: song.id });
    });

    return { songs, items };
}

/* ============================================================
   STATE — HELPERS
   ============================================================ */

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

const SWING_RATIOS = [1, 1.16, 1.5, 2];

function swingRatio(song) {
	return SWING_RATIOS[song.swing || 0];
}

function selectedSong() {
    if (freeMode) return freeSong;
    return activeSetlist().songs.find((song) => song.id === selectedId) || activeSetlist().songs[0] || null;
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
    return activeSetlist().songs.find((song) => song.id === id) || null;
}

function visibleSetEntries() {
    if (sortMode === "custom") return activeSetlist().items;
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
    return [...activeSetlist().songs]
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
	const setlistSelect = document.querySelector("#setlistSelect");
		if (setlistSelect) {
			setlistSelect.innerHTML = "";
			state.setlists.forEach(sl => {
				const option = document.createElement("option");
				option.value = sl.id;
				option.textContent = sl.name;
				option.selected = sl.id === state.activeSetlistId;
				setlistSelect.append(option);
			});
		}
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
	els.capo.value = song.capo;
	els.beatFrequency.value = song.beatFrequency;
	els.accentFrequency.value = song.accentFrequency;

	els.subdivision.value = song.subdivision;
	els.subdivisionFrequency.value = song.subdivisionFrequency;
	els.notes.value = song.notes;
	if (!isEditingTempo) els.tempoValue.textContent = effectiveTempo(song);
	els.effectiveLabel.textContent = tempoLabel(song);
	els.playToggle.textContent = isPlaying ? "\u258E\u258E" : "\u25B6";
	els.playToggle.classList.toggle("is-playing", isPlaying);

	const freeModeToggle = document.querySelector("#freeModeToggle");
	if (freeModeToggle) {
		freeModeToggle.classList.toggle("active", freeMode);
		freeModeToggle.ariaPressed = String(freeMode);
	}

	const flashToggle = document.querySelector("#flashToggle");
	if (flashToggle) {
		flashToggle.classList.toggle("active", flashEnabled);
		flashToggle.ariaPressed = String(flashEnabled);
	}

	els.previousSong.disabled = freeMode;
	els.nextSong.disabled = freeMode;
	els.songName.readOnly = freeMode;

	els.doubleTime.classList.toggle("active", song.doubleTime);
	els.doubleTime.ariaPressed = String(song.doubleTime);

	els.swingToggle.classList.toggle("active", song.swing > 0);
	els.swingToggle.textContent = SWING_LABELS[song.swing || 0];
	els.swingToggle.ariaPressed = String(song.swing > 0);

	els.practiceSpeed.value = tempSpeed;
	els.practiceSpeedLabel.textContent = tempSpeed === 0 ? "0%" : `${tempSpeed > 0 ? "+" : ""}${tempSpeed}%`;

	renderBeats(song);
	renderSongs(song);
}

function renderEmptyState() {
	setEditorDisabled(true);

	els.songName.value = "";
	els.capo.value = "";
	els.beatFrequency.value = "";
	els.accentFrequency.value = "";
	els.subdivision.value = "";
	els.subdivisionFrequency.value = "";
	els.notes.value = "";
	els.tempoValue.textContent = "";
	els.effectiveLabel.textContent = "Setlist empty";
	els.playToggle.textContent = "\u25B6";
	els.beatDisplay.innerHTML = "";

	els.doubleTime.classList.remove("active");
	els.doubleTime.ariaPressed = "false";

	els.swingToggle.classList.remove("active");
	els.swingToggle.textContent = "Swing";
	els.swingToggle.ariaPressed = "false";

	els.songsList.innerHTML = `<div class="empty-set">Add songs with the 'New' button.</div>`;

	els.practiceSpeed.value = tempSpeed;
	els.practiceSpeedLabel.textContent = tempSpeed === 0 ? "0%" : `${tempSpeed > 0 ? "+" : ""}${tempSpeed}%`;
}

function setEditorDisabled(disabled) {
	[
		els.songName, els.capo,
		els.beatFrequency, els.accentFrequency,
		els.timeSignature, els.subdivision, els.subdivisionFrequency,
		els.doubleTime, els.notes,
		els.tapTempo, els.playToggle,
		els.previousSong, els.nextSong,
	].forEach((control) => {
		control.disabled = disabled;
	});

	document.querySelectorAll("[data-speed]").forEach((button) => {
		button.disabled = disabled;
	});
}

function renderBeats(song) {
	const validAccents = new Set(
		song.accents.filter((beat) => beat < song.beatsPerBar)
	);

	song.accents = [...validAccents].sort((a, b) => a - b);

	els.beatDisplay.innerHTML = "";
	beatElements = [];

	if (els.timeSignature && !isEditingTempo) {
		els.timeSignature.value = `${song.beatsPerBar}/${song.beatValue}`;
	}

	for (let index = 0; index < song.beatsPerBar; index += 1) {
		const button = document.createElement("button");

		button.type = "button";
		button.className = "beat";
		button.textContent = index + 1;
		button.dataset.beat = index;

		button.ariaLabel =
			`Beat ${index + 1}${song.accents.includes(index) ? " accented" : ""}`;

		if (song.accents.includes(index)) {
			button.classList.add("accent");
		}

		if (index === currentBeat) {
			button.classList.add("current");
		}

		button.addEventListener("click", () => toggleAccent(index));

		beatElements.push(button);
		els.beatDisplay.append(button);
	}
}

function updateCurrentBeatDisplay() {
	beatElements.forEach((button, index) => {
		button.classList.toggle("current", index === currentBeat);
	});
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
    if (freeMode) {
        Object.assign(freeSong, patch);
        render();
        return;
    }
    const song = selectedSong();
    if (!song) return;
    Object.assign(song, patch);
    if (sortMode !== "custom" && ("tempo" in patch || "capo" in patch || "name" in patch)) {
        sortedViewIds = sortedSongIds(sortMode);
    }
    render();
}

function toggleFreeMode() {
	freeMode = !freeMode;
	if (!freeMode && !selectedSong()) {
		selectedId = activeSetlist().songs[0]?.id || null;
	}
	tempSpeed = 0;
	currentBeat = -1;
	if (isPlaying) restartClock();
	render();
}

function toggleFlash() {
	flashEnabled = !flashEnabled;
	const flashToggle = document.querySelector("#flashToggle");
	if (flashToggle) {
		flashToggle.classList.toggle("active", flashEnabled);
		flashToggle.ariaPressed = String(flashEnabled);
	}
	saveState();
}

const SWING_LABELS = ["Swing", "Light", "Medium", "Hard"];

function cycleSwing() {
	const song = selectedSong();
	if (!song) return;
	updateSong({
		swing: ((song.swing || 0) + 1) % 4
	});
	saveState();
}

// After
function chooseSong(id) {
	if (!id) return;
	freeMode = false;
	selectedId = id;
	tempSpeed = 0;
	render();
	saveState();
}

function toggleAccent(beat) {
	const song = selectedSong();
	if (!song) return;
	song.accents = song.accents.includes(beat) ?
		song.accents.filter((item) => item !== beat) :
		[...song.accents, beat].sort((a, b) => a - b);
	render();
	saveState();
}

function addSong() {
    const song = createSong();
    activeSetlist().songs.push(song);
    activeSetlist().items.push({ type: "song", id: song.id, songId: song.id });
    sortMode = "custom";
    sortedViewIds = [];
    chooseSong(song.id);
	saveState();
}

function addDivider() {
    if (!activeSetlist().songs.length) return;
    activeSetlist().items.push({ type: "divider", id: crypto.randomUUID() });
    sortMode = "custom";
    sortedViewIds = [];
    render();
	saveState();
}

function deleteSong(id) {
    const sl = activeSetlist();
    const index = sl.songs.findIndex((song) => song.id === id);
    sl.songs = sl.songs.filter((song) => song.id !== id);
    sl.items = sl.items.filter((item) => item.type !== "song" || item.songId !== id);
    sortedViewIds = sortedViewIds.filter((songId) => songId !== id);
    if (selectedId === id) {
        selectedId = sl.songs[Math.max(0, index - 1)]?.id || null;
        tempSpeed = 0;
    }
    if (!sl.songs.length) {
        sl.items = [];
        stopClock();
    }
    render();
	saveState();
}

function deleteDivider(id) {
    activeSetlist().items = activeSetlist().items.filter((item) => item.id !== id);
    render();
	saveState();
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
    const items = activeSetlist().items;
    const sourceIndex = items.findIndex((item) => item.id === sourceId);
    const targetIndex = items.findIndex((item) => item.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [item] = items.splice(sourceIndex, 1);
    items.splice(targetIndex, 0, item);
    render();
	saveState();
}

function sortSongs(mode) {
	sortMode = mode;
	sortedViewIds = mode === "custom" ? [] : sortedSongIds(mode);
	render();
}

/* ============================================================
   SETLIST ACTIONS
   ============================================================ */

function addSetlist() {
    const number = state.setlists.length + 1;
    const name = prompt("New setlist name:", `Setlist ${number}`);
    if (!name) return;
    const setlist = { id: crypto.randomUUID(), name: name.trim() || `Setlist ${number}`, ...normalizeSetlist({}) };
    state.setlists.push(setlist);
    switchSetlist(setlist.id);
}

function deleteSetlist() {
    if (state.setlists.length === 1) {
        alert("You must have at least one setlist.");
        return;
    }
    if (!confirm(`Delete "${activeSetlist().name}"?`)) return;
    const index = state.setlists.findIndex(s => s.id === state.activeSetlistId);
    state.setlists = state.setlists.filter(s => s.id !== state.activeSetlistId);
    state.activeSetlistId = state.setlists[Math.max(0, index - 1)].id;
    selectedId = activeSetlist().songs[0]?.id || null;
    sortMode = "custom";
    sortedViewIds = [];
    tempSpeed = 0;
    stopClock();
    render();
	saveState();
}

function renameSetlist() {
    const sl = activeSetlist();
    const name = prompt("Rename setlist:", sl.name);
    if (!name || name.trim() === sl.name) return;
    sl.name = name.trim();
    render();
	saveState();
}

function switchSetlist(id) {
    if (id === state.activeSetlistId) return;
    state.activeSetlistId = id;
    selectedId = activeSetlist().songs[0]?.id || null;
    sortMode = "custom";
    sortedViewIds = [];
    tempSpeed = 0;
    stopClock();
    render();
	saveState();
}

/* ============================================================
   IMPORT / EXPORT
   ============================================================ */

function exportSongs() {
    const sl = activeSetlist();
    const blob = new Blob(
        [JSON.stringify({ songs: sl.songs, items: sl.items }, null, 2)],
        { type: "application/json" }
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tempest_${sl.name.toLowerCase().replace(/\s+/g, "_")}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
}

async function replaceSongs(file) {
    try {
        const imported = normalizeSetlist(JSON.parse(await file.text()));
        const baseName = file.name.split(/[_\-.]/)[0];
        const capitalized = baseName.charAt(0).toUpperCase() + baseName.slice(1).toLowerCase();

        function uniqueName(name) {
            const existing = new Set(state.setlists.map(s => s.name));
            if (!existing.has(name)) return name;
            let i = 2;
            while (existing.has(`${name} ${i}`)) i++;
            return `${name} ${i}`;
        }

        const sl = activeSetlist();
        const isEmpty = sl.songs.length === 0;

        if (isEmpty) {
            sl.songs = imported.songs;
            sl.items = imported.items;
            sl.name = uniqueName(capitalized);
            selectedId = imported.songs[0]?.id || null;
        } else {
            const newSetlist = {
                id: crypto.randomUUID(),
                name: uniqueName(capitalized),
                ...imported
            };
            state.setlists.push(newSetlist);
            state.activeSetlistId = newSetlist.id;
            selectedId = imported.songs[0]?.id || null;
        }

        sortMode = "custom";
        sortedViewIds = [];
        tempSpeed = 0;
        stopClock();
        render();
    } catch {
        alert("Failed to import file.");
    }
    saveState();
}

async function mergeSongs(file) {
    try {
        const imported = normalizeSetlist(JSON.parse(await file.text()));
        const sl = activeSetlist();
        const existingIds = new Set(sl.songs.map((s) => s.id));
        const existingItemSongIds = new Set(sl.items.filter((i) => i.type === "song").map((i) => i.songId));
        sl.songs.push(...imported.songs.filter((s) => !existingIds.has(s.id)));
        sl.items.push(...imported.items.filter(
            (i) => i.type === "divider" || !existingItemSongIds.has(i.songId)
        ));
        sortMode = "custom";
        sortedViewIds = [];
        render();
    } catch {
        alert("Failed to import file.");
    }
	saveState();
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

function triggerFlash(accented) {
	if (!flashEnabled) return;
	const stage = document.querySelector(".sticky-console");
	if (!stage) return;
	stage.classList.remove("flash-beat", "flash-accent");
	void stage.offsetWidth;
	stage.classList.add(accented ? "flash-accent" : "flash-beat");
}

function scheduleBeat(beatIndex, time) {
	const song = selectedSong();
	if (!song) return;
	playClick(song.accents.includes(beatIndex), time, song);
	window.setTimeout(() => {
		if (!isPlaying || selectedSong()?.id !== song.id) return;
		currentBeat = beatIndex;
		triggerFlash(song.accents.includes(beatIndex));
		updateCurrentBeatDisplay();
	}, Math.max(0, (time - ensureAudioContext().currentTime) * 1000));
}

function schedulerTick() {
	const song = selectedSong();
	if (!song || !audioContext) return;
	while (nextClickTime < audioContext.currentTime + SCHEDULE_AHEAD_SECONDS) {
		const beatInterval = 60 / effectiveTempo(song);
		const ratio = swingRatio(song);
		const swungInterval = beatInterval * ratio / (1 + ratio);
		const isSwungBeat = nextBeatIndex % 2 === 1;
		const actualInterval = song.swing === 0 ? beatInterval : (isSwungBeat ? beatInterval - swungInterval : swungInterval);
		scheduleBeat(nextBeatIndex, nextClickTime);
		if (song.subdivision >= 2) {
			const subInterval = actualInterval / song.subdivision;
			for (let i = 1; i < song.subdivision; i++) {
				scheduleSubClick(nextClickTime + subInterval * i, song);
			}
		}
		nextBeatIndex = (nextBeatIndex + 1) % song.beatsPerBar;
		nextClickTime += actualInterval;
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
		masterGain.gain.cancelScheduledValues(audioContext.currentTime);
		masterGain.gain.value = 1;
	}
	render();
}

function restartClock() {
	clearInterval(schedulerId);
	schedulerId = null;
	if (isPlaying) startClock();
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
	const isNarrow = window.innerWidth <= 1050;

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
	updateSong({ name: event.target.value })
);

els.songName.addEventListener("blur", (event) => {
	if (!event.target.value.trim()) updateSong({ name: "Untitled Song" });
	saveState();
});

els.capo.addEventListener("input", () => {});

els.capo.addEventListener("blur", () => {
	updateSong({
		capo: clamp(parseInt(els.capo.value, 10) || 0, 0, 16)
	});
	saveState();
});

els.timeSignature.addEventListener("input", (event) => {
	const raw = event.target.value;
	const auto = raw.replace(/\D/g, "");
	if (auto.length === 1) {
		event.target.value = auto;
	} else if (auto.length >= 2) {
		event.target.value = `${auto[0]}/${auto[1]}`;
	}
});
els.timeSignature.addEventListener("blur", () => {
	const auto = els.timeSignature.value.replace(/\D/g, "");
	if (auto.length >= 2) {
		updateSong({
			beatsPerBar: clamp(parseInt(auto[0], 10) || 1, 1, 24),
			beatValue: clamp(parseInt(auto[1], 10) || 1, 1, 64),
		});
	}
	const song = selectedSong();
	if (song) els.timeSignature.value = `${song.beatsPerBar}/${song.beatValue}`;
	saveState();
});

els.timeSignature.addEventListener("focus", () => els.timeSignature.select());

els.tempoValue.addEventListener("input", (event) => {
	if (isPlaying) return;
	const tempo = parseInt(event.target.textContent, 10);
	if (!Number.isFinite(tempo) || tempo < 1) return;
	updateSong({ tempo: clamp(tempo, 1, 400) });
});
els.tempoValue.addEventListener("keydown", (event) => {
	if (event.key === "Enter") {
		event.preventDefault();
		event.target.blur();
		return;
	}
	const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab"];
	if (allowed.includes(event.key)) return;
	if (!/^\d$/.test(event.key)) { event.preventDefault(); return; }
	if (event.target.textContent.replace(/\D/g, "").length >= 3) event.preventDefault();
});
els.tempoValue.addEventListener("focus", () => {
	isEditingTempo = true;
	const song = selectedSong();
	if (song) els.tempoValue.textContent = song.tempo;
});
els.tempoValue.addEventListener("blur", () => {
	isEditingTempo = false;
	updateSong({
		tempo: clamp(parseInt(els.tempoValue.textContent, 10) || 1, 1, 400)
	});
	saveState();
});

document.querySelector(".live-grid").addEventListener("mousedown", (event) => {
	if (!event.target.closest(".tempo-column") &&
		!event.target.closest("input, button, select, textarea")) {
		event.preventDefault();
	}
});


els.beatFrequency.addEventListener("input", (event) => {
	if (event.target.value === "") return;
});
els.beatFrequency.addEventListener("blur", () => {
	updateSong({
		beatFrequency: clamp(parseInt(els.beatFrequency.value, 10) || 1000, 1, 4000)
	});
	saveState();
});

els.accentFrequency.addEventListener("input", (event) => {
	if (event.target.value === "") return;
});
els.accentFrequency.addEventListener("blur", () => {
	updateSong({
		accentFrequency: clamp(parseInt(els.accentFrequency.value, 10) || 800, 1, 4000)
	});
	saveState();
});

els.subdivision.addEventListener("input", (event) => {
	if (event.target.value === "") return;
});
els.subdivision.addEventListener("blur", () => {
	updateSong({
		subdivision: clamp(parseInt(els.subdivision.value, 10) || 1, 1, 16)
	})
	saveState();
});

els.subdivisionFrequency.addEventListener("input", (event) => {
	if (event.target.value === "") return;
});
els.subdivisionFrequency.addEventListener("blur", () => {
	updateSong({
		subdivisionFrequency: clamp(parseInt(els.subdivisionFrequency.value, 10) || 1200, 1, 4000)
	});
	saveState();
});

els.doubleTime.addEventListener("click", () => {
	const song = selectedSong();
	if (!song) return;
	updateSong({
		doubleTime: !song.doubleTime
	});
	saveState();
});

els.swingToggle.addEventListener("click", cycleSwing);

document.querySelector("#freeModeToggle").addEventListener("click", toggleFreeMode);
document.querySelector("#flashToggle").addEventListener("click", toggleFlash);

els.notes.addEventListener("input", (event) => updateSong({
	notes: event.target.value
}));


/* ============================================================
   EVENT LISTENERS — TRANSPORT & NAVIGATION
   ============================================================ */

els.playToggle.addEventListener("click", () => isPlaying ? stopClock() : startClock());

els.previousSong.addEventListener("click", () => {
	const songIds = visibleSongIds();
	if (!songIds.length) return;

	chooseSong(
		songIds[
			(songIds.indexOf(selectedId) - 1 + songIds.length) % songIds.length
		]
	);
});

els.nextSong.addEventListener("click", () => {
	const songIds = visibleSongIds();
	if (!songIds.length) return;

	chooseSong(
		songIds[
			(songIds.indexOf(selectedId) + 1) % songIds.length
		]
	);
});

els.tapTempo.addEventListener("click", () => {
	const now = performance.now();
	tapTimes = tapTimes.filter((time) => now - time < 2500);
	tapTimes.push(now);
	if (tapTimes.length > 8) tapTimes = tapTimes.slice(-8);
	if (tapTimes.length >= 2) {
		const intervals = tapTimes.slice(1).map((time, index) => time - tapTimes[index]);
		const average = intervals.reduce((sum, item) => sum + item, 0) / intervals.length;
		updateSong({
			tempo: clamp(Math.round(60000 / average), 1, 400)
		});
	}
});

els.practiceSpeed.addEventListener("input", () => {
	tempSpeed = Number(els.practiceSpeed.value);
	els.practiceSpeedLabel.textContent = tempSpeed === 0 ? "0%" : `${tempSpeed > 0 ? "+" : ""}${tempSpeed}%`;
	const song = selectedSong();
	if (song) {
		els.tempoValue.textContent = effectiveTempo(song);
		els.effectiveLabel.textContent = tempoLabel(song);
	}
});


/* ============================================================
   EVENT LISTENERS — SET LIST
   ============================================================ */

els.addSong.addEventListener("click", addSong);
document.querySelector("#addSongControl").addEventListener("click", addSong);
els.addDivider.addEventListener("click", addDivider);
els.exportSongs.addEventListener("click", exportSongs);

els.replaceSongs.addEventListener("click", () => {
	importMode = "replace";
	els.importFile.click();
});
els.mergeSongs.addEventListener("click", () => {
	importMode = "merge";
	els.importFile.click();
});
els.importFile.addEventListener("change", (event) => {
	const file = event.target.files[0];
	if (file) importMode === "merge" ? mergeSongs(file) : replaceSongs(file);
	event.target.value = "";
});

els.clearSongs.addEventListener("click", () => {
    if (!confirm("Clear the entire setlist?")) return;
    const sl = activeSetlist();
    const fresh = normalizeSetlist({});
    sl.songs = fresh.songs;
    sl.items = fresh.items;
    sl.selectedId = fresh.selectedId;
    selectedId = null;
    sortMode = "custom";
    sortedViewIds = [];
    tempSpeed = 0;
    stopClock();
    render();
});

document.querySelectorAll("[data-sort]").forEach((button) =>
	button.addEventListener("click", () => sortSongs(button.dataset.sort))
);

document.querySelector("#addSetlist").addEventListener("click", addSetlist);
document.querySelector("#renameSetlist").addEventListener("click", renameSetlist);
document.querySelector("#deleteSetlist").addEventListener("click", deleteSetlist);
document.querySelector("#setlistSelect").addEventListener("change", (event) => switchSetlist(event.target.value));

/* ============================================================
   EVENT LISTENERS — INPUT AUTO-SELECT
   ============================================================ */

document.querySelectorAll("input[type='number']").forEach((input) => {
	input.addEventListener("focus", () => input.select());
});

document.querySelectorAll("input").forEach((input) => {
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") input.blur();
	});
});


/* ============================================================
   EVENT LISTENERS — KEYBOARD SHORTCUTS
   ============================================================ */

document.addEventListener("keydown", (event) => {
	if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || isEditingTempo) return;
	if (event.key === " ") {
		event.preventDefault();
		isPlaying ? stopClock() : startClock();
	}
	if (event.key === "ArrowLeft") {
		event.preventDefault();
		els.previousSong.click();
	}
	if (event.key === "ArrowRight") {
		event.preventDefault();
		els.nextSong.click();
	}
});


/* ============================================================
   EVENT LISTENERS — RESIZE
   ============================================================ */

window.addEventListener("resize", () => {
	const isNarrow = window.innerWidth <= 1050;
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