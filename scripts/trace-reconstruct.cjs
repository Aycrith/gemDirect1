#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function extractJsonAfterLabel(line, label) {
  const idx = line.indexOf(label);
  if (idx === -1) return null;
  // find first '{' after label
  let i = idx + label.length;
  while (i < line.length && line[i] !== '{') i++;
  if (i >= line.length) return null;
  let start = i;
  let depth = 0;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const substr = line.slice(start, i + 1);
        // Try parsing leniently: raw, then with common un-escaping of backslashes
        try {
          return JSON.parse(substr);
        } catch (err) {
          // attempt to unescape escaped quotes (common when JSON was embedded as a string)
          try {
            // Replace escaped double-quotes and escaped backslashes
            let s = substr.replace(/\\\"/g, '"');
            s = s.replace(/\\\\/g, '\\');
            // Remove stray escaped newlines
            s = s.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
            return JSON.parse(s);
          } catch (err2) {
            // last attempt: remove backslashes before quotes
            try {
              const s2 = substr.replace(/\\\"/g, '"').replace(/\\/g, '\\');
              return JSON.parse(s2);
            } catch (err3) {
              return null;
            }
          }
        }
      }
    }
  }
  return null;
}

async function findInstrumentEvents(traceFile, label) {
  if (!fs.existsSync(traceFile)) {
    throw new Error('trace file not found: ' + traceFile);
  }

  const inStream = fs.createReadStream(traceFile, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: inStream, crlfDelay: Infinity });
  const events = [];
  for await (const line of rl) {
    if (!line.includes(label)) continue;
    // try to extract JSON after label
    const json = extractJsonAfterLabel(line, label + ':');
    if (json) {
      let ts = null;
      if (typeof json.ts === 'number') ts = json.ts;
      else if (typeof json.ts === 'string' && /^[0-9]+$/.test(json.ts)) ts = Number(json.ts);
      else if (json.timestamp) ts = Number(json.timestamp);
      events.push({ raw: json, ts });
      continue;
    }
    // fallback: try to find a JSON-looking substring after the literal (without colon)
    const json2 = extractJsonAfterLabel(line, label);
    if (json2) {
      const obj = json2;
      let ts = null;
      if (typeof obj.ts === 'number') ts = obj.ts;
      else if (typeof obj.ts === 'string' && /^[0-9]+$/.test(obj.ts)) ts = Number(obj.ts);
      else if (obj.timestamp) ts = Number(obj.timestamp);
      events.push({ raw: obj, ts });
      continue;
    }
    // Last fallback: capture a short excerpt for manual inspection
    const excerpt = line.slice(line.indexOf(label), Math.min(line.length, line.indexOf(label) + 1000));
    events.push({ raw: excerpt, ts: null });
  }
  return events;
}

function readResourceList(resourcesDir) {
  if (!fs.existsSync(resourcesDir)) throw new Error('resources dir not found: ' + resourcesDir);
  const all = fs.readdirSync(resourcesDir);
  const images = [];
  const rePage = /^page@(.+)-(\d+)\.(jpe?g|png|webp)$/i;
  for (const name of all) {
    const m = name.match(rePage);
    if (m) {
      const ts = Number(m[2]);
      images.push({ name, path: path.join(resourcesDir, name), ts, ext: m[3].toLowerCase() });
    }
  }
  // sort by timestamp asc
  images.sort((a, b) => a.ts - b.ts);
  return images;
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

async function main() {
  try {
    const args = parseArgs();
    const traceRoot = args['trace-root'] || path.join(process.cwd(), 'test-results', 'svd-capture-trace-unzip');
    const windowMs = Number(args['window'] || 2000);
    const topN = Number(args['top'] || 5);
    const readBytes = Number(args['bytes'] || 32 * 1024);
    const prefixLen = Number(args['prefix'] || 200);
    const label = args['label'] || 'GEMDIRECT-INSTRUMENT';

    console.log('Trace root:', traceRoot);
    const traceFile = path.join(traceRoot, '0-trace.trace');
    const resourcesDir = path.join(traceRoot, 'resources');
    if (!fs.existsSync(traceFile)) throw new Error('Trace file not found: ' + traceFile);
    if (!fs.existsSync(resourcesDir)) throw new Error('Resources directory not found: ' + resourcesDir);

    console.log('Scanning trace for label:', label);
    const events = await findInstrumentEvents(traceFile, label);
    console.log('Found', events.length, 'matching console occurrences (some may not have parsed JSON).');

    // Filter events with numeric ts
    const eventsWithTs = events.map((e, idx) => ({ idx, ts: e.ts, raw: e.raw })).filter(e => typeof e.ts === 'number');
    if (eventsWithTs.length === 0) {
      console.warn('No parsed events with numeric ts found. Listing raw matches for manual inspection.');
      const report = { meta: { foundMatches: events.length, eventsParsed: 0 }, matches: events.slice(0, 20) };
      const outPath = path.join(traceRoot, 'trace-reconstruct-report.json');
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
      console.log('Wrote report (no timestamps) to', outPath);
      return;
    }

    console.log('Reading resource image index (page@*.jpeg) from resources...');
    const images = readResourceList(resourcesDir);
    console.log('Found', images.length, 'page@ images in resources.');

    const results = [];
    for (const ev of eventsWithTs) {
      const evTs = ev.ts;
      // find candidates within window
      const candidates = images.filter(img => Math.abs(img.ts - evTs) <= windowMs)
        .map(img => ({ ...img, diff: Math.abs(img.ts - evTs) }))
        .sort((a, b) => a.diff - b.diff)
        .slice(0, topN);
      const processed = [];
      for (const cand of candidates) {
        const stat = fs.statSync(cand.path);
        const bytesToRead = Math.min(readBytes, stat.size);
        const fd = fs.openSync(cand.path, 'r');
        const buf = Buffer.alloc(bytesToRead);
        const read = fs.readSync(fd, buf, 0, bytesToRead, 0);
        fs.closeSync(fd);
        const sample = buf.slice(0, read);
        const base64 = sample.toString('base64');
        const prefix = base64.substring(0, prefixLen);
        const sha256 = crypto.createHash('sha256').update(sample).digest('hex');
        processed.push({ file: cand.name, path: cand.path, ts: cand.ts, diff: cand.diff, size: stat.size, bytesRead: read, sha256Sample: sha256, base64Prefix: prefix, dataUrlPreview: `data:image/${cand.ext};base64,${prefix}` });
      }
      results.push({ eventIndex: ev.idx, eventTs: evTs, raw: ev.raw, candidates: processed });
    }

    const out = { meta: { traceRoot, windowMs, topN, readBytes, prefixLen, label, eventsFound: events.length, eventsWithTs: eventsWithTs.length, imagesIndexed: images.length }, results };
    const outPath = path.join(traceRoot, 'trace-reconstruct-report.json');
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log('Wrote report to', outPath);
    console.log('Summary:');
    for (const r of results) {
      console.log(`- event idx=${r.eventIndex} ts=${r.eventTs} -> ${r.candidates.length} candidates`);
      r.candidates.forEach(c => console.log(`    ${c.file} (ts=${c.ts}, diff=${c.diff}ms) sha256Sample=${c.sha256Sample} previewLen=${c.base64Prefix.length}`));
    }
    console.log('\nIf you want me to also attempt a more exhaustive network-driven search (non-page@ images) I can add that, but it will be heavier.');
  } catch (err) {
    console.error('ERROR:', err && err.stack ? err.stack : err);
    process.exitCode = 2;
  }
}

main();
