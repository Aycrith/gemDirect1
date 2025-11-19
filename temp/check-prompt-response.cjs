const fs = require('fs');
const path = 'c:/Dev/gemDirect1/temp/wan2-full-prompt.json';
(async () => {
  try {
    const body = fs.readFileSync(path, 'utf8');
    const res = await fetch('http://127.0.0.1:8188/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    console.log('STATUS', res.status, res.statusText);
    const json = await res.json();
    console.log('RESPONSE:', JSON.stringify(json, null, 2));
    
    if (json.prompt_id) {
      console.log('\nChecking history for prompt_id:', json.prompt_id);
      await new Promise(resolve => setTimeout(resolve, 2000));
      const histRes = await fetch(`http://127.0.0.1:8188/history/${json.prompt_id}`);
      const hist = await histRes.json();
      console.log('HISTORY:', JSON.stringify(hist, null, 2));
    }
  } catch (e) {
    console.error('ERR', e);
  }
})();
