# Migaku Word Exporter - Technical Documentation

## Projekt-Übersicht

Diese Chrome Extension exportiert die bekannten Wörter aus der Migaku Browser Extension. Migaku hat diese Funktion in neueren Versionen entfernt.

## Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│                     study.migaku.com                             │
│  ┌─────────────────┐                                            │
│  │  Export Button  │ ← content.js injiziert Button              │
│  └────────┬────────┘                                            │
│           │ Klick                                                │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │   IndexedDB     │ ← "srs" Datenbank mit WordList             │
│  │   (srs/data)    │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
└───────────┼──────────────────────────────────────────────────────┘
            │ chrome.storage.local
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    converter.html                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │    pako.js      │  │    sql.js       │  │  converter.js   │ │
│  │  (GZIP decomp)  │  │  (SQLite WASM)  │  │  (UI + Export)  │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │           │
│           └────────────────────┴────────────────────┘           │
│                              │                                   │
│                              ▼                                   │
│                    JSON / TXT / CSV Download                     │
└─────────────────────────────────────────────────────────────────┘
```

## Dateien

| Datei | Zweck |
|-------|-------|
| `manifest.json` | Extension-Konfiguration (Manifest V3) |
| `content.js` | Injiziert Export-Button auf study.migaku.com |
| `styles.css` | CSS für den Export-Button |
| `converter.html` | UI für Statistiken und Download-Buttons |
| `converter.js` | Logik: Daten verarbeiten und exportieren |
| `popup.html` | Extension-Popup mit Anleitung |
| `pako.min.js` | GZIP-Dekomprimierung (45KB) |
| `sql-wasm.js` | SQLite WebAssembly Wrapper (400KB) |
| `sql-wasm.wasm` | SQLite WebAssembly Binary (500KB) |

## Datenfluss

### 1. Button-Klick (content.js)
```javascript
// Öffnet IndexedDB "srs"
const db = indexedDB.open('srs');
const store = db.transaction('data').objectStore('data');
const allData = store.getAll();

// Speichert in chrome.storage.local
chrome.storage.local.set({ migakuExportData: dataToStore });

// Öffnet converter.html
window.open(chrome.runtime.getURL('converter.html'));
```

### 2. Verarbeitung (converter.js)
```javascript
// Holt Daten aus Storage
chrome.storage.local.get(['migakuExportData'], callback);

// GZIP dekomprimieren (Magic Bytes: 0x1f 0x8b)
if (data[0] === 0x1f && data[1] === 0x8b) {
    data = pako.inflate(data);
}

// SQLite parsen
const db = new SQL.Database(data);
const result = db.exec(`
    SELECT dictForm, secondary, partOfSpeech, language, knownStatus
    FROM WordList WHERE del = 0
`);
```

## Datenbank-Schema (Migaku)

### Tabelle: WordList
| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| dictForm | TEXT | Wort in Wörterbuchform |
| secondary | TEXT | Lesung (z.B. Furigana) |
| partOfSpeech | TEXT | Wortart |
| language | TEXT | Sprache (ja, zh, ko, etc.) |
| knownStatus | TEXT | KNOWN, LEARNING, UNKNOWN, IGNORED |
| del | INTEGER | 0 = aktiv, 1 = gelöscht |
| hasCard | INTEGER | Ob Anki-Karte existiert |
| tracked | INTEGER | Ob Wort verfolgt wird |

### Andere relevante Tabellen
- `card` - Anki-Karten
- `review` - Review-Historie
- `deck` - Decks
- `lesson` - Lektionen

## Wichtige Erkenntnisse

### Warum study.migaku.com?
- Die Extension-Seite (`chrome-extension://...`) ist geschützt
- Content Scripts können dort nicht injiziert werden
- ABER: study.migaku.com teilt die gleiche IndexedDB "srs"
- Dort können wir Content Scripts injizieren

### CSP-Probleme gelöst
1. **Externe Scripts blockiert** → Libraries lokal eingebunden
2. **Inline Scripts blockiert** → JavaScript in separate .js Datei
3. **WebAssembly blockiert** → `'wasm-unsafe-eval'` in manifest.json

### Storage-Limit
- chrome.storage.local hat ~10MB Limit
- Die Datenbank ist ~8.5MB (GZIP-komprimiert)
- Lösung: `"unlimitedStorage"` Permission

## Bekannte Limitierungen

1. **Nur study.migaku.com**: Der Button erscheint nur dort, nicht im Extension-Window
2. **Eingeloggt sein erforderlich**: Ohne Login keine Daten
3. **Große Datenbanken**: Bei sehr vielen Wörtern könnte es langsam werden

## Mögliche Optimierungen

### Performance
- [ ] Streaming statt alles in Memory laden
- [ ] Web Worker für SQLite-Verarbeitung
- [ ] Chunked Storage für sehr große Datenbanken

### Features
- [ ] Automatischer Export (täglich/wöchentlich)
- [ ] Nur bestimmte Sprachen exportieren
- [ ] Anki-kompatibles Format (.apkg)
- [ ] Import-Funktion (Wörter zurück importieren)
- [ ] Vergleich mit vorherigem Export (neue Wörter highlighten)

### UX
- [ ] Button auch auf anderen Migaku-Seiten
- [ ] Dark Mode für converter.html
- [ ] Fortschrittsanzeige beim Verarbeiten
- [ ] Bessere Icons (SVG statt PNG)

### Chrome Web Store
- [ ] Screenshots erstellen
- [ ] Promo-Grafiken (1280x800, 440x280)
- [ ] Datenschutzerklärung
- [ ] Store-Beschreibung optimieren

## Lokale Entwicklung

```bash
# Extension laden
1. brave://extensions
2. Developer Mode aktivieren
3. "Load unpacked" → chrome-extension Ordner wählen

# Nach Änderungen
1. Extension in brave://extensions neu laden (Reload)
2. study.migaku.com neu laden
```

## Debugging

### Console-Logs
- `content.js` loggt: "Migaku Word Exporter loaded"
- Fehler werden als Toast angezeigt

### Storage prüfen
```javascript
// In Extension DevTools Console
chrome.storage.local.get(null, console.log);
```

### IndexedDB prüfen
```javascript
// In study.migaku.com Console
indexedDB.databases().then(console.log);
```

## Referenzen

- [Migaku Extension ID](chrome-extension://dmeppfcidcpcocleneopiblmpnbokhep)
- [sql.js Dokumentation](https://sql.js.org/)
- [pako Dokumentation](https://github.com/nodeca/pako)
- [Chrome Extension Manifest V3](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)

## Kontakt

Repository: https://github.com/mh-343/migaku-word-exporter
