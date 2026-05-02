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

function restoreSatoriBtn(btn) {
    btn.replaceChildren();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('d', 'M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3');
    svg.appendChild(path);
    btn.appendChild(svg);
    btn.appendChild(document.createTextNode(' Satori'));
}

document.getElementById('btn-satori').addEventListener('click', async () => {
    const btn = document.getElementById('btn-satori');
    const words = getFilteredWords().filter(w => !w.language || w.language === 'ja');
    const kanjiSet = new Set();
    for (const w of words) {
        const matches = (w.dictForm || '').match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
        if (matches) matches.forEach(k => kanjiSet.add(k));
    }
    if (kanjiSet.size === 0) {
        btn.textContent = 'No kanji found';
        setTimeout(() => restoreSatoriBtn(btn), 2000);
        return;
    }
    try {
        await navigator.clipboard.writeText([...kanjiSet].join(''));
        btn.classList.add('copied');
        btn.textContent = `Copied! (${kanjiSet.size})`;
        setTimeout(() => { btn.classList.remove('copied'); restoreSatoriBtn(btn); }, 2000);
    } catch {
        btn.textContent = 'Clipboard error';
        setTimeout(() => restoreSatoriBtn(btn), 2000);
    }
});

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
