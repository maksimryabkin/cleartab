import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parseCSV, validateTable, serializeCSV, tableToObjects, parseJSONTable, cleanTable, duplicateIndexes } from '../csv.mjs';
import { browserBundle } from '../build.mjs';

test('CSV parses BOM, CRLF, escaped quotes, commas and quoted line breaks', () => {
  const rows = parseCSV('\uFEFFname,note\r\nAda,"Hello, ""world""\r\nnext line"\r\nLin,\r\n');
  assert.deepEqual(rows, [['name','note'],['Ada','Hello, "world"\r\nnext line'],['Lin','']]);
  assert.equal(validateTable(rows), rows);
});
test('trailing delimiter and quoted empty field are retained without phantom trailing row', () => {
  assert.deepEqual(parseCSV('a,b,\n1,"",\n'), [['a','b',''],['1','','']]);
  assert.deepEqual(parseCSV(''), []);
  assert.deepEqual(parseCSV('""'), [['']]);
  assert.deepEqual(parseCSV('x\r\ny\rz\n'), [['x'],['y'],['z']]);
});
test('strict quoting rejects malformed fields with useful location', () => {
  assert.throws(() => parseCSV('a\n"broken'), /Unclosed quoted field.*line 2/);
  assert.throws(() => parseCSV('ab"c'), /quote must begin a field/i);
  assert.throws(() => parseCSV('"a"x'), /Unexpected text after a closing quote/);
});
test('inconsistent records fail instead of silently losing columns', () => {
  assert.throws(() => validateTable(parseCSV('a,b\n1\n')), /Record 2 has 1 columns; the header has 2/);
  assert.throws(() => validateTable(parseCSV('a,b\n1,2,3')), /Record 2 has 3 columns/);
});
test('physical blank lines can be cleaned without padding malformed short records', () => {
  const rows = validateTable(parseCSV('a,b\r\n\r\n1,2\n,\n', { expandBlankLines:true }));
  assert.deepEqual(rows, [['a','b'],['',''],['1','2'],['','']]);
  const result = cleanTable(rows, { removeEmpty:true });
  assert.deepEqual(result.rows, [['a','b'],['1','2']]);
  assert.equal(result.removedEmpty, 2);
  assert.throws(() => validateTable(parseCSV('a,b\n""\n', { expandBlankLines:true })), /Record 2/);
  assert.throws(() => validateTable(parseCSV('a,b\nx\n', { expandBlankLines:true })), /Record 2/);
});
test('CSV round trips arbitrary field delimiters, Unicode, line breaks and quotes', () => {
  const rows = [['a','b','c'],['é 🦊','x,y;z\t','"quote"\r\nnext'],['  ','','last']];
  for (const delimiter of [',',';','\t']) assert.deepEqual(parseCSV(serializeCSV(rows,{delimiter}),{delimiter}), rows);
});
test('cleaning compares full rows after trimming, preserves first and never mutates input', () => {
  const rows = [['name','city'],[' Ada ',' London '],['Ada','London'],['',''],['Ada','Paris']];
  const before = structuredClone(rows);
  const cleaned = cleanTable(rows, { trim:true,removeEmpty:true,dedupe:true });
  assert.deepEqual(cleaned, { rows:[['name','city'],['Ada','London'],['Ada','Paris']], removedEmpty:1,removedDuplicates:1 });
  assert.deepEqual(rows,before);
  assert.deepEqual(duplicateIndexes([['a','b'],['x','y'],['x','y'],['x,y','']]), [{index:2,firstIndex:1}]);
});
test('CSV to JSON preserves strings and special keys safely', () => {
  const objects = tableToObjects([['__proto__','constructor','id'],['safe','value','001']]);
  assert.equal(Object.getPrototypeOf(objects[0]),Object.prototype);
  assert.equal(objects[0].__proto__,'safe');
  assert.equal(JSON.stringify(objects),'[{"__proto__":"safe","constructor":"value","id":"001"}]');
  assert.throws(() => tableToObjects([['a','a'],['1','2']]),/unique/);
  assert.throws(() => tableToObjects([['','a'],['1','2']]),/nonempty/);
});
test('JSON objects form a union of keys in encounter order and normalize nulls', () => {
  assert.deepEqual(parseJSONTable('[{"a":1,"flag":false},{"b":"x","a":null}]'), [['a','flag','b'],['1','false',''],['','','x']]);
  assert.deepEqual(parseJSONTable('\uFEFF[{"__proto__":"safe"}]'), [['__proto__'],['safe']]);
});
test('unsupported JSON shapes and unsafe numbers fail clearly', () => {
  for (const text of ['{}','[]','[null]','[1]','[[1]]','[{}]']) assert.throws(() => parseJSONTable(text));
  assert.throws(() => parseJSONTable('[{"x":{"y":1}}]'),/nested/);
  assert.throws(() => parseJSONTable('[{"id":9007199254740993}]'),/safe range/);
  assert.throws(() => parseJSONTable('[{"x":1e999}]'),/safe range/);
  assert.throws(() => parseJSONTable('[bad]'),/Invalid JSON/);
});
test('spreadsheet prefix protection is explicit and only changes opted-in exports', () => {
  const rows = [['x'],['=1+1'],['-4'],['plain']];
  assert.equal(serializeCSV(rows),'x\r\n=1+1\r\n-4\r\nplain');
  assert.equal(serializeCSV(rows,{protectFormulas:true}),"x\r\n'=1+1\r\n'-4\r\nplain");
});
test('offline browser bundle exactly matches tested module and runs without imports', async () => {
  const source = await readFile(new URL('../csv.mjs',import.meta.url),'utf8');
  const bundle = await readFile(new URL('../csv-browser.js',import.meta.url),'utf8');
  assert.equal(bundle,browserBundle(source));
  const context = {}; runInNewContext(bundle,context);
  assert.equal(JSON.stringify(context.ClearTabData.parseCSV('a,b\n1,2')),JSON.stringify([['a','b'],['1','2']]));
});
