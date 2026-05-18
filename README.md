# Tempest

![screenshot_home](https://github.com/JohnathanCrow/tempest/blob/main/screenshot.png)

A metronome app with setlist features, designed for musicians who want to organize, practice, and perform sets with customizable tempo controls and per-song settings. Scales for small screens.

## Installation

#### Access

- [Visit](https://johnathancrow.github.io/tempest/) and either bookmark or install via browser
- Data is stored locally in your browser


## Usage

#### Right Panel - Setlist Management

- Add songs
	- Click the 'New' button to add a new song to your setlist
	- Each song maintains its own independent settings
	- All songs appear in the right panel when added
- Add dividers
	- Use the 'Div' button to insert visual dividers between song sections
	- Dividers are visible only in 'Custom' sorting view for better organization
- Import/Export/Clear
	- Import and export backups or separate setlists to file for easy sharing
	- Clear your entire setlist to start fresh — a confirmation dialog prevents accidental deletion
- Sorting
	- Sort by: Custom, Alphabetical, BPM, or Capo Position
	- Custom sorting remembers your preferred order after using other sort methods
	- Drag and drop songs and dividers to rearrange them manually
	- Remove individual songs with the red 'x' button

#### Left Panel - Metronome Control

- Global actions bar
	- ⊡ toggles free mode — an independent metronome not tied to any setlist song
	- ✦ toggles flash mode — flashes the control panel on each beat (white) and accent (blue)
	- ✚ adds a new song (visible in narrow and mobile views only)
- Tempo display
	- Click the tempo display to edit it directly
	- The label above shows active modifiers (double time, speed adjustment)
- Settings panel
	- Capo — track guitar capo placements per song
	- Time — set the time signature in n/n format (e.g. 44 auto-formats to 4/4)
	- Sub — set the subdivision count for click subdivisions between beats
	- Freq — adjust the metronome click pitch
	- A. Freq — adjust the accent beat pitch
	- S. Freq — adjust the subdivision click pitch
	- Double — instantly double the playback tempo without changing the stored tempo
	- Swing — cycle through swing feels: off, light (58/42), medium (67/33), hard (75/25)
	- Tap — tap repeatedly to set tempo by feel
- Transport
	- Previous/Next (keyboard left/right) — navigate through songs in your setlist
	- Play/Pause (keboard space) — control metronome playback
	- Accents — click any beat dot to toggle an accent on or off
- Speed mod slider
	- Drag left or right to make temporary tempo adjustments from −50% to +50%
	- The stored tempo is not affected — resets when switching songs
- Notes
	- Add notes, cues, chord changes, or practice reminders for each song
	- Songs containing notes display a yellow dot in the right panel setlist for quick reference

#### Free Mode

- Operates independently from the setlist — settings are saved separately and persist across sessions
- Selecting a song in the setlist will deactivate free mode and load that song

#### Misc

- Scaling
    - Narrow view moves the setlist panel to a new tab
    - Mobile view moves the setlist panel and notes to new tabs, adds new song button to global actions bar