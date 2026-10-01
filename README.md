# ClearTab

A small, AI-assisted open-source tool to inspect, clean and convert CSV and JSON.
Processing is deterministic JavaScript in your browser, not an online AI service.

**Live app:** https://cleartab-workbench.maksimryabkin01.chatgpt.site

**Source:** https://github.com/maksimryabkin/cleartab

## Use it offline

Download this folder and open `index.html` in a modern browser. No installation,
server or internet connection is required. Keep `styles.css`, `app.js`,
`csv-browser.js` and `favicon.svg` beside the HTML file.

1. Drop a UTF-8 CSV, TSV or JSON file, or paste text. Choose its format and delimiter.
2. Inspect the data. CSV's first row is treated as column names.
3. Review duplicates, optionally trim outer whitespace, remove empty rows and keep
   only the first copy of repeated rows.
4. Download the full cleaned table as comma-separated CSV or a JSON array.

The preview shows at most 100 rows and 30 columns; exports include all accepted data.
Limits: 5 MB of UTF-8 input, 50,000 data rows and 200 columns. Large files are best
handled with a dedicated streaming tool.

## Data behavior

- CSV supports quoted delimiters, escaped double quotes, multiline fields, BOM,
  LF, CR and CRLF. A final line ending does not create an extra record.
- Fully blank CSV lines become empty rows of the header's width in the app. Other
  short or long records fail validation; malformed records are never silently padded.
  Whitespace-only lines and a quoted empty field are still records, not blank lines.
- Duplicate matching compares whole rows after selected cleanup, is case-sensitive,
  and keeps the first occurrence. The header is never deduplicated.
- All working cells are strings. JSON numbers and booleans become text; null and
  absent keys become empty cells. JSON output therefore does not preserve input types.
- JSON input must be a nonempty array of flat objects. Columns are the union of
  keys in encounter order. Nested objects/arrays and unsafe numeric integers are
  rejected. Encode large identifiers and precise decimal values as strings. As with
  standard `JSON.parse`, repeated JSON object keys keep the last value.
- CSV-to-JSON requires unique, nonempty header names. CSV output permits other
  headers. CSV exports use commas and CRLF without a BOM.
- Spreadsheet formula protection is optional and off by default. When enabled it
  prefixes cells beginning with `=`, `+`, `-`, `@`, tab or a line break with an
  apostrophe. This changes those cell values, including negative numbers. It is not
  a substitute for reviewing untrusted data before opening it in a spreadsheet.

## Privacy and implementation

Files stay in this tab's memory. There are no uploads, fetch requests, analytics,
cookies, storage writes, remote fonts or third-party runtime dependencies. Clearing
or closing the tab discards the working data; downloaded files remain on your device.
Source-code links leave the app only when clicked. Browser extensions and the device
itself remain outside the app's control.

`csv.mjs` is the authoritative parser and data module. `csv-browser.js` is generated
from exactly that source as a classic script so `file://` works without module CORS
restrictions. Tests verify that the browser bundle matches the module.

## Development and tests

Node.js 20 or newer, no packages to install:

```sh
node build.mjs
node --test
```

After editing `csv.mjs`, rebuild `csv-browser.js` and commit both. Tests cover quote
handling, line endings, blank records, record width, deduplication, JSON shapes,
numeric safety, prototype keys, spreadsheet prefixes and browser bundle consistency.
The UI is plain HTML, CSS and JavaScript. It supports keyboard input and uses text
nodes rather than rendering uploaded content as HTML.

Built with AI assistance and maintained as a small practical project. No claims are
made about customers, adoption, certification or exclusive rights to the project name.
Issues and contributions are welcome in the source repository. Please do not attach
private datasets to public issues; use a small fabricated example instead.

## Optional support

Optional, unconditional gifts support the maintainer's time and development tools.
The app stays free for everyone. No perks, ownership, returns or future features are
offered in exchange. First community support goal: **100 USDT**.

**USDT on TRON (TRC20) only:** `TNDS9ddpMTwx4YhJJdsYxKC8PRTLyczBHK`

Use a standard direct USDT transfer. Minimum credited: 0.005 USDT; network fees are
separate. Batch or smart-contract payouts are unsupported.

No wallet connection, deposit, registration or payment is needed to use ClearTab.
This repository does not track contributions or claim that a funding goal was met.

## License

MIT, see [LICENSE](LICENSE).
