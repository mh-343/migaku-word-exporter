let wordData = [];
let SQL;

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
}

function showError(message) {
    document.getElementById('loading-card').classList.add('hidden');
    document.getElementById('error-card').classList.remove('hidden');
    document.getElementById('error-message').textContent = message;
}

document.getElementById('btn-json').addEventListener('click', () => {
    const known = wordData.filter(w => w.knownStatus === 'KNOWN');
    const data = {
        exported: new Date().toISOString(),
        totalWords: wordData.length,
        knownCount: known.length,
        knownWords: known.map(w => ({
            word: w.dictForm,
            reading: w.secondary,
            partOfSpeech: w.partOfSpeech,
            language: w.language
        }))
    };
    downloadBlob(JSON.stringify(data, null, 2), 'migaku_known_words.json', 'application/json');
});

document.getElementById('btn-txt').addEventListener('click', () => {
    const known = wordData.filter(w => w.knownStatus === 'KNOWN');
    downloadBlob(known.map(w => w.dictForm).join('\n'), 'migaku_known_words.txt', 'text/plain');
});

document.getElementById('btn-csv').addEventListener('click', () => {
    const known = wordData.filter(w => w.knownStatus === 'KNOWN');
    const header = 'Word,Reading,Part of Speech,Language\n';
    const rows = known.map(w =>
        `"${(w.dictForm || '').replace(/"/g, '""')}","${(w.secondary || '').replace(/"/g, '""')}","${w.partOfSpeech || ''}","${w.language || ''}"`
    ).join('\n');
    downloadBlob('\ufeff' + header + rows, 'migaku_known_words.csv', 'text/csv');
});

function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type: type + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

init();
