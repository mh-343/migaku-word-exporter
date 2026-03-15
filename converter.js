let wordData = [];
let SQL;

const filterState = { KNOWN: true, LEARNING: false, UNKNOWN: false, IGNORED: false };

const STATUS_ORDER = { KNOWN: 0, LEARNING: 1, UNKNOWN: 2, IGNORED: 3 };

function getFilteredWords() {
    return wordData
        .filter(w => filterState[w.knownStatus])
        .sort((a, b) => (STATUS_ORDER[a.knownStatus] ?? 9) - (STATUS_ORDER[b.knownStatus] ?? 9));
}

function updateFilterCount() {
    const count = getFilteredWords().length;
    document.getElementById('filter-count').textContent = count.toLocaleString();
}

function initFilterToggles() {
    const map = { 'filter-known': 'KNOWN', 'filter-learning': 'LEARNING', 'filter-unknown': 'UNKNOWN', 'filter-ignored': 'IGNORED' };
    for (const [id, status] of Object.entries(map)) {
        document.getElementById(id).addEventListener('click', () => {
            filterState[status] = !filterState[status];
            document.getElementById(id).classList.toggle('selected', filterState[status]);
            updateFilterCount();
        });
    }
    updateFilterCount();
}

function buildFilename(ext) {
    const active = Object.entries(filterState).filter(([, v]) => v).map(([k]) => k.toLowerCase());
    if (active.length === 1 && active[0] === 'known') return `migaku_known_words.${ext}`;
    if (active.length === 0) return `migaku_words.${ext}`;
    return `migaku_${active.join('_')}_words.${ext}`;
}

async function init() {
    try {
        SQL = await initSqlJs({ locateFile: file => file });

        chrome.storage.local.get(['migakuExportData'], async (result) => {
            if (!result.migakuExportData || result.migakuExportData.length === 0) {
                showError('No data found. Please try exporting again from study.migaku.com');
                return;
            }

            try {
                await processData(result.migakuExportData);
                chrome.storage.local.remove('migakuExportData');
            } catch (err) {
                showError(err.message);
            }
        });
    } catch (err) {
        showError('Failed to initialize: ' + err.message);
    }
}

async function processData(items) {
    for (const item of items) {
        let data = new Uint8Array(item.data);

        if (data[0] === 0x1f && data[1] === 0x8b) {
            data = pako.inflate(data);
        }

        const db = new SQL.Database(data);
        const result = db.exec(`
            SELECT dictForm, secondary, partOfSpeech, language, knownStatus
            FROM WordList WHERE del = 0
        `);

        if (result.length > 0) {
            const columns = result[0].columns;
            const words = result[0].values.map(row => {
                const obj = {};
                columns.forEach((col, i) => obj[col] = row[i]);
                return obj;
            });
            wordData = wordData.concat(words);
        }
        db.close();
    }

    if (wordData.length === 0) {
        throw new Error('No words found in database');
    }

    const stats = { KNOWN: 0, LEARNING: 0, UNKNOWN: 0, IGNORED: 0 };
    wordData.forEach(w => stats[w.knownStatus] = (stats[w.knownStatus] || 0) + 1);

    document.getElementById('stat-known').textContent = stats.KNOWN.toLocaleString();
    document.getElementById('stat-learning').textContent = stats.LEARNING.toLocaleString();
    document.getElementById('stat-unknown').textContent = stats.UNKNOWN.toLocaleString();
    document.getElementById('stat-ignored').textContent = stats.IGNORED.toLocaleString();

    document.getElementById('loading-card').classList.add('hidden');
    document.getElementById('results-card').classList.remove('hidden');
    initFilterToggles();
}

function showError(message) {
    document.getElementById('loading-card').classList.add('hidden');
    document.getElementById('error-card').classList.remove('hidden');
    document.getElementById('error-message').textContent = message;
}

document.getElementById('btn-json').addEventListener('click', () => {
    const words = getFilteredWords();
    const activeFilters = Object.entries(filterState).filter(([, v]) => v).map(([k]) => k);
    const data = {
        exported: new Date().toISOString(),
        totalWords: wordData.length,
        filters: activeFilters,
        count: words.length,
        words: words.map(w => ({
            word: w.dictForm,
            reading: w.secondary,
            language: w.language,
            status: w.knownStatus
        }))
    };
    downloadBlob(JSON.stringify(data, null, 2), buildFilename('json'), 'application/json');
});

document.getElementById('btn-txt').addEventListener('click', () => {
    const words = getFilteredWords();
    downloadBlob(words.map(w => w.dictForm).join('\n'), buildFilename('txt'), 'text/plain');
});

document.getElementById('btn-csv').addEventListener('click', () => {
    const words = getFilteredWords();
    const header = 'Word,Reading,Language,Status\n';
    const rows = words.map(w =>
        `"${(w.dictForm || '').replace(/"/g, '""')}","${(w.secondary || '').replace(/"/g, '""')}","${w.language || ''}","${w.knownStatus || ''}"`
    ).join('\n');
    downloadBlob('\ufeff' + header + rows, buildFilename('csv'), 'text/csv');
});

function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename, saveAs: false }, () => {
        URL.revokeObjectURL(url);
    });
}

init();
