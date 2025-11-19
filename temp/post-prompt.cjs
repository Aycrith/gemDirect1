const fs = require('fs');
const path = 'c:/Dev/gemDirect1/temp/wan2-full-prompt.json';
(async () => {
  try {
    const body = fs.readFileSync(path, 'utf8');
    const fetch = globalThis.fetch || (await import('node-fetch')).default;
    const res = await fetch('http://127.0.0.1:8188/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    console.log('STATUS', res.status, res.statusText);
    const text = await res.text();
    console.log('BODY:', text);
  } catch (e) {
    console.error('ERR', e);
  }
})();
