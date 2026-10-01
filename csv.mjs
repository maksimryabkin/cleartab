/** ClearTab data helpers. No browser, network, or third-party dependencies. */
export class DataError extends Error {
  constructor(message) { super(message); this.name = 'DataError'; }
}

export function parseCSV(input, { delimiter = ',', expandBlankLines = false } = {}) {
  if (typeof input !== 'string') throw new DataError('CSV input must be text.');
  if (![';', ',', '\t'].includes(delimiter)) throw new DataError('Unsupported delimiter.');
  const text = input.replace(/^\uFEFF/, '');
  if (!text.length) return [];
  const rows = [];
  let row = [], field = '', state = 'start', line = 1, column = 1;
  let recordStarted = false;
  const fail = message => { throw new DataError(`${message} At line ${line}, column ${column}.`); };
  const endField = () => { row.push(field); field = ''; state = 'start'; };
  const endRow = () => {
    const blank = !recordStarted && !row.length && !field.length;
    endField();
    // A physically blank line can represent an empty table row. Do not pad
    // malformed short records, quoted empty fields, or whitespace-only records.
    if (expandBlankLines && blank && rows.length) row = Array(rows[0].length).fill('');
    rows.push(row); row = []; recordStarted = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; column++; }
        else state = 'closed';
      } else {
        field += char;
        if (char === '\r') {
          if (text[i + 1] === '\n') { field += '\n'; i++; }
          line++; column = 0;
        } else if (char === '\n') { line++; column = 0; }
      }
    } else if (char === delimiter) {
      endField(); recordStarted = true;
    } else if (char === '\r' || char === '\n') {
      endRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
      line++; column = 0;
    } else if (state === 'closed') {
      fail('Unexpected text after a closing quote.');
    } else if (char === '"') {
      if (state !== 'start') fail('A quote must begin a field; quote the whole field.');
      state = 'quoted'; recordStarted = true;
    } else {
      field += char; state = 'unquoted'; recordStarted = true;
    }
    column++;
  }
  if (state === 'quoted') fail('Unclosed quoted field.');
  if (recordStarted || row.length || field.length || state === 'closed') endRow();
  return rows;
}

export function validateTable(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new DataError('No data found. Add a header row and some data.');
  const width = rows[0].length;
  for (let i = 0; i < rows.length; i++) {
    if (!Array.isArray(rows[i]) || rows[i].length !== width) {
      throw new DataError(`Record ${i + 1} has ${rows[i]?.length ?? 0} columns; the header has ${width}. Record numbers include the header, and quoted line breaks stay in one record.`);
    }
  }
  return rows;
}

export function serializeCSV(rows, { delimiter = ',', protectFormulas = false } = {}) {
  if (![';', ',', '\t'].includes(delimiter)) throw new DataError('Unsupported delimiter.');
  return rows.map(row => row.map(value => {
    let text = value == null ? '' : String(value);
    if (protectFormulas && /^[=+@\-\t\r\n]/.test(text)) text = `'${text}`;
    // An unquoted empty singleton becomes only a trailing record separator.
    if (row.length === 1 && text === '') return '""';
    return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }).join(delimiter)).join('\r\n');
}

export function tableToObjects(rows) {
  validateTable(rows);
  const headers = rows[0];
  if (headers.some(header => !header.trim())) throw new DataError('JSON conversion needs a nonempty name for every column.');
  if (new Set(headers).size !== headers.length) throw new DataError('JSON conversion needs unique column names. Rename duplicate headers first.');
  // defineProperty safely preserves keys such as __proto__ instead of changing prototypes.
  return rows.slice(1).map(row => {
    const object = {};
    headers.forEach((header, i) => Object.defineProperty(object, header, {
      value: row[i], enumerable: true, writable: true, configurable: true,
    }));
    return object;
  });
}

export function parseJSONTable(text) {
  let values;
  try { values = JSON.parse(text.replace(/^\uFEFF/, '')); }
  catch (error) { throw new DataError(`Invalid JSON: ${error.message}`); }
  if (!Array.isArray(values) || !values.length) throw new DataError('Use a nonempty JSON array of flat objects, for example [{"name":"Ada"}].');
  const headers = [], seen = new Set();
  values.forEach((record, index) => {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) throw new DataError(`JSON item ${index + 1} must be an object.`);
    Object.entries(record).forEach(([key, value]) => {
      if (!key.trim()) throw new DataError(`JSON item ${index + 1} has an empty column name.`);
      if (value !== null && typeof value === 'object') throw new DataError(`JSON item ${index + 1}, column "${key}" contains nested data. Flatten objects and arrays first.`);
      if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
        throw new DataError(`JSON item ${index + 1}, column "${key}" has a number outside the safe range. Encode large numeric identifiers as strings.`);
      }
      if (!seen.has(key)) { seen.add(key); headers.push(key); }
    });
  });
  if (!headers.length) throw new DataError('The JSON objects have no columns.');
  const rows = values.map(record => headers.map(key => {
    const value = Object.hasOwn(record, key) ? record[key] : '';
    return value == null ? '' : String(value);
  }));
  return [headers, ...rows];
}

export function cleanTable(rows, { trim = false, removeEmpty = false, dedupe = false } = {}) {
  validateTable(rows);
  const transformed = rows.map(row => row.map(cell => trim ? cell.trim() : cell));
  let data = transformed.slice(1), removedEmpty = 0, removedDuplicates = 0;
  if (removeEmpty) data = data.filter(row => {
    const empty = row.every(cell => cell === '');
    if (empty) removedEmpty++;
    return !empty;
  });
  if (dedupe) {
    const seen = new Set();
    data = data.filter(row => {
      const key = JSON.stringify(row);
      if (seen.has(key)) { removedDuplicates++; return false; }
      seen.add(key); return true;
    });
  }
  return { rows: [transformed[0], ...data], removedEmpty, removedDuplicates };
}

export function duplicateIndexes(rows) {
  const seen = new Map(), duplicates = [];
  rows.slice(1).forEach((row, i) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) duplicates.push({ index: i + 1, firstIndex: seen.get(key) });
    else seen.set(key, i + 1);
  });
  return duplicates;
}
