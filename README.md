# Migaku Word Exporter

Export your known words from the Migaku Browser Extension to JSON, CSV, or TXT.

## Features

- **One-Click Export**: Click the button on study.migaku.com
- **Category Filters**: Choose which words to include (Known, Learning, Unknown, Ignored)
- **Multiple Formats**: Export as JSON, TXT, or CSV (Excel-compatible)
- **Privacy-First**: All processing happens locally in your browser
- **Statistics**: See your vocabulary breakdown at a glance

## Installation

### From Chrome Web Store
[Migaku Word Exporter](https://chromewebstore.google.com/detail/akkpijkjiihgcalbfoobconnlnalafbd)

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open `chrome://extensions` (or `brave://extensions` for Brave)
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the folder containing these files

## Usage

1. Go to [study.migaku.com](https://study.migaku.com) and make sure you're logged in
2. Click the **"Export Words"** button in the top-right corner
3. A new tab opens with your vocabulary statistics
4. Select which categories to include
5. Click **JSON**, **TXT**, or **CSV** to download

## Export Formats

### JSON
```json
{
  "exported": "2026-03-15T12:00:00.000Z",
  "totalWords": 9762,
  "filters": ["KNOWN"],
  "count": 3636,
  "words": [
    {
      "word": "食べる",
      "reading": "たべる",
      "language": "ja",
      "status": "KNOWN"
    }
  ]
}
```

### CSV
Excel/Google Sheets compatible:
```
Word,Reading,Language,Status
食べる,たべる,ja,KNOWN
飲む,のむ,ja,KNOWN
```

### TXT
One word per line:
```
食べる
飲む
行く
```

## Why This Tool?

Migaku removed the built-in word export feature in their newer extension versions. This community tool restores that functionality, allowing you to:
- Back up your vocabulary progress
- Use your known words in other apps (Anki, etc.)
- Track your learning statistics

## Technical Details

- Works by reading the local IndexedDB database that Migaku uses to store your words
- Uses [sql.js](https://github.com/sql-js/sql.js) (SQLite compiled to WebAssembly) to parse the database
- Uses [pako](https://github.com/nodeca/pako) to decompress GZIP data

## Compatibility

- Chrome, Brave, Edge, and other Chromium-based browsers
- Requires the Migaku Browser Extension to be installed and logged in

## License

MIT - Free to use and modify

## Credits

Created for the Migaku language learning community.
