# Tempest

![screenshot_home](https://github.com/JohnathanCrow/tempest/blob/main/screenshot.png)

A metronome app with setlist features, designed for musicians who want to organize, practice, and perform sets with customizable tempo controls and per-song settings.

## Features

- **Setlist Management** — Manage setlists with import/export, custom sorting, and dividers
- **Advanced Metronome Controls** — Tempo, time signature, subdivisions, and swing feel
- **Tap Tempo** — Set tempo by tapping to the beat
- **Per-Song Settings** — Save capo position, notes, accents, and tempo modifiers for each song
- **Global Settings** - Beat frequency customisation, and default song settings
- **Basic Mode** — Independent metronome that persists across sessions
- **Flash Mode** — Visual feedback on beats (white) and accents (blue)
- **Speed Modulation** — Temporary ±50% tempo adjustment without affecting stored tempo
- **Notes & Cues** — Add practice reminders, chord changes, and performance cues per song
- **Responsive Design** — Designed to scale smaller for lower resolution and mobile screens

## Installation

#### Access

- [Visit the app](https://johnathancrow.github.io/tempest/) and either bookmark or install via browser
- Data is stored locally

## Usage

#### Right Panel - Setlist Management

- **Current setlist**
	- Click the setlist name box to switch from available setlists
	- + adds a name setlist
	- ✎ to rename the current setlist
	- × to delete the current setlist
- **Import/Export/Clear**
	- Export to keep a backup of the current setlist
	- Import a new setlist from file
	- Merge with current setlist from file
	= Clear the current setlist
- **Sorting**
	- Sort by Custom, Alphabetical, BPM, or Capo Position
	- Custom sorting remembers your preferred order after using other sort methods
	- Drag and drop songs and dividers to rearrange them manually
- **Add songs**
	- Click the 'New Song' button to add a new song to your setlist
	- Each song maintains its own independent settings
	- All songs appear in the right panel when added
	- Remove an added song with the red 'x'
- **Add dividers**
	- Use the 'Divider' button to insert visual dividers between song sections
	- Dividers are visible only in 'Custom' sorting view for better organization


#### Left Panel - Metronome Control

- **Global actions**
	- Located in the top left
	- ⊙ toggles basic mode — an independent metronome not tied to a setlist
	- 🗲 toggles flash mode — flashes the control panel on each beat (white) and accent (blue)
	- ✚ adds a new song (visible in narrow and mobile views only)
- **Song title**
	- Editable directly from the control panel
- **Tempo display**
	- Click the tempo display to edit it directly
	- The label above shows active modifiers (double time, speed adjustment)
	- Use the nudge buttons to increase tempo by ±1 or ±10
- **Settings panel**
	- Artist - optional artist field for your own information
	- Length - optional length field for your own information
	- Capo — track guitar capo placements per song
	- Time — set the time signature in n/n format (e.g. 44 auto-formats to 4/4)
	- Sub — set the subdivision count for click subdivisions between beats
	- Double — instantly double the playback tempo without changing the stored tempo
	- Swing — cycle through swing feels: off, light (58/42), medium (67/33), hard (75/25)
	- Tap — tap repeatedly to set tempo by feel
- **Speed mod slider**
	- Drag left or right to make temporary tempo adjustments by ±50%
	- The stored tempo is not affected and the slider automatically resets when switching songs
- **Transport**
	- Previous/Next (keyboard left/right) — navigate through songs in your setlist
	- Play/Pause (keyboard space) — control metronome playback
	- Accents — click any beat dot to toggle an accent on or off
- **Notes**
	- Add notes, cues, chord changes, or practice reminders for each song
	- Songs containing notes display a yellow dot in the right panel setlist for quick reference
	
	
#### Settings
- **Global Settings**
	- Beat Freq. — adjust the metronome click pitch
	- Accent Freq. — adjust the accent beat pitch
	- Sub Freq. — adjust the subdivision click pitch
	- Beat Vol. — adjust the metronome click volume
	- Accent Vol. — adjust the accent beat volume
	- Sub Vol. — adjust the subdivision click volume
- **Defaults**
	- Set new song defaults


#### Responsive Design

- **Scaling**
    - Narrow view moves the setlist panel to a new tab
    - Mobile view moves the setlist panel and notes to new tabs, adds new song button to global actions, centres content
    - Short view scales the control panel to fit 720p screens
