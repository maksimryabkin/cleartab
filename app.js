/* ClearTab UI. All file processing is local. */
(() => {
  'use strict';
  const { parseCSV, validateTable, parseJSONTable, cleanTable, duplicateIndexes, serializeCSV, tableToObjects } = globalThis.ClearTabData;
  const $ = id => document.getElementById(id);
  const MAX_BYTES = 5 * 1024 * 1024, MAX_ROWS = 50000, MAX_COLUMNS = 200;
  let original = null, current = null, baseName = 'cleartab', fileRead = 0;
  const delimiter = () => $('delimiter').value === 'tab' ? '\t' : $('delimiter').value;
  const announce = text => { $('status').textContent = text; };
  function error(message, exportOnly = false) {
    const node = $(exportOnly ? 'export-error' : 'error');
    node.textContent = message; node.hidden = !message;
  }
  function invalidate() { original = current = null; $('results').hidden = true; error(''); error('', true); }
  function mode() { $('delimiter-label').hidden = $('format').value === 'json'; invalidate(); }
  $('format').addEventListener('change', () => { fileRead++; mode(); });
  $('delimiter').addEventListener('change', () => { fileRead++; invalidate(); });
  $('input').addEventListener('input', () => { fileRead++; $('filename').textContent = 'Pasted or edited data · local only'; baseName = 'cleartab'; invalidate(); });

  async function readFile(file) {
    if (!file) return;
    const token = ++fileRead;
    invalidate();
    if (file.size > MAX_BYTES) { error('This file exceeds the 5 MB browser limit. Split it into smaller files first.'); return; }
    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      if (token !== fileRead) return;
      $('format').value = /\.json$/i.test(file.name) ? 'json' : 'csv';
      $('delimiter').value = /\.tsv$/i.test(file.name) ? 'tab' : ',';
      mode(); $('input').value = text;
      $('filename').textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB · read locally`;
      baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-').slice(0, 80) || 'cleartab';
      inspect();
    } catch (e) {
      if (token === fileRead) error(e instanceof TypeError ? 'Could not read this as UTF-8 text. Export the source file as UTF-8 CSV or JSON and try again.' : `Could not read the file: ${e.message}`);
    } finally { $('file').value = ''; }
  }
  $('file').addEventListener('change', event => readFile(event.target.files[0]));
  const zone = $('drop-zone');
  ['dragenter', 'dragover'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); zone.classList.remove('dragging'); }));
  zone.addEventListener('drop', event => {
    if (event.dataTransfer.files.length !== 1) { error('Drop one file at a time.'); return; }
    readFile(event.dataTransfer.files[0]);
  });
  // Dropping a file elsewhere should never navigate away and discard the current work.
  document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
  document.addEventListener('drop', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });

  function inspect() {
    invalidate();
    try {
      const input = $('input').value;
      if (new TextEncoder().encode(input).length > MAX_BYTES) throw new Error('Input exceeds 5 MB. Split the data into smaller files first.');
      const rows = $('format').value === 'json' ? parseJSONTable(input) : validateTable(parseCSV(input, { delimiter: delimiter(), expandBlankLines: true }));
      if (rows.length - 1 > MAX_ROWS || rows[0].length > MAX_COLUMNS) throw new Error('Use at most 50,000 data rows and 200 columns per file.');
      original = rows; render(); $('results').hidden = false;
      announce(`Checked ${rows.length - 1} data rows and ${rows[0].length} columns. Preview ready.`);
    } catch (e) { error(e.message); }
  }
  $('inspect').addEventListener('click', inspect);
  function render() {
    if (!original) return;
    error('', true);
    const result = cleanTable(original, { trim: $('trim').checked, removeEmpty: $('remove-empty').checked, dedupe: $('dedupe').checked });
    current = result.rows;
    const duplicates = duplicateIndexes(current), repeated = new Set(duplicates.map(item => item.index));
    $('row-count').textContent = (current.length - 1).toLocaleString();
    $('col-count').textContent = current[0].length;
    $('dup-count').textContent = duplicates.length.toLocaleString();
    $('changes').textContent = `${result.removedEmpty} empty rows removed · ${result.removedDuplicates} duplicate rows removed. Duplicate matching uses whole rows after the selected cleanup.`;
    const table = $('preview'); table.replaceChildren();
    const head = document.createElement('thead'), body = document.createElement('tbody');
    const tr = document.createElement('tr');
    ['#', ...current[0].slice(0, 30)].forEach(value => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = value || '(empty header)'; tr.append(th); });
    head.append(tr);
    current.slice(1, 101).forEach((row, index) => {
      const tr = document.createElement('tr');
      if (repeated.has(index + 1)) tr.className = 'duplicate';
      [index + 1, ...row.slice(0, 30)].forEach(value => { const td = document.createElement('td'); td.textContent = String(value); tr.append(td); });
      body.append(tr);
    });
    table.append(head, body);
    $('preview-note').textContent = `Preview: ${Math.min(current.length - 1, 100)} of ${current.length - 1} data rows, ${Math.min(current[0].length, 30)} of ${current[0].length} columns. Downloads include the full cleaned table.`;
    $('duplicate-note').textContent = duplicates.length ? `Highlighted rows repeat earlier data rows. Examples: ${duplicates.slice(0, 6).map(d => `row ${d.index} repeats row ${d.firstIndex}`).join('; ')}. Row numbers here exclude the header.` : 'No repeated rows in the current dataset.';
  }
  ['trim', 'remove-empty', 'dedupe'].forEach(id => $(id).addEventListener('change', render));
  function download(kind) {
    if (!current) return;
    error('', true);
    try {
      const text = kind === 'json' ? JSON.stringify(tableToObjects(current), null, 2) : serializeCSV(current, { protectFormulas: $('protect').checked });
      const blob = new Blob([text], { type: kind === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `${baseName}-clean.${kind}`; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      announce(`${kind.toUpperCase()} download prepared with ${current.length - 1} data rows.`);
    } catch (e) { error(e.message, true); }
  }
  $('download-csv').addEventListener('click', () => download('csv'));
  $('download-json').addEventListener('click', () => download('json'));
  $('sample').addEventListener('click', () => {
    fileRead++; $('input').value = 'name,city,note\nAda,London,"Loves commas, and clean data"\nLin,Taipei,"A note\nwith two lines"\nAda,London,"Loves commas, and clean data"\n Maya , Lisbon , Space to trim \n,,\n';
    $('format').value = 'csv'; $('delimiter').value = ','; $('filename').textContent = 'Built-in sample · 5 data rows'; baseName = 'cleartab-sample';
    ['trim', 'remove-empty', 'dedupe'].forEach(id => { $(id).checked = false; });
    mode(); inspect();
  });
  $('clear').addEventListener('click', () => {
    fileRead++; $('input').value = ''; $('file').value = ''; $('filename').textContent = 'No file selected'; baseName = 'cleartab';
    ['trim', 'remove-empty', 'dedupe', 'protect'].forEach(id => { $(id).checked = false; });
    invalidate(); announce('Data cleared.'); $('input').focus();
  });
  $('copy-address').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('address').value); $('copy-status').textContent = 'Address copied. Use USDT on TRON (TRC20) only.'; }
    catch { $('address').focus(); $('address').select(); $('copy-status').textContent = 'Address selected. Press Ctrl+C or ⌘C to copy.'; }
  });
  // Agent access shares the exact inspection path used by the visible button.
  const modelContext = document.modelContext;
  if (modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const tool = {
      name: 'inspect_current_data',
      title: 'Inspect the current CSV or JSON',
      description: 'Validate data already pasted or loaded into ClearTab and update its visible preview. Does not upload data or download a file.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Pass an empty object. Load data through the page first.');
        inspect();
        if (!current) return { ok: false, error: $('error').textContent };
        return { ok: true, rows: current.length - 1, columns: current[0].length, repeatedRows: duplicateIndexes(current).length };
      }
    };
    try { Promise.resolve(modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {}
    window.addEventListener('pagehide', event => { if (!event.persisted) lifecycle.abort(); }, { once: true });
  }
})();
