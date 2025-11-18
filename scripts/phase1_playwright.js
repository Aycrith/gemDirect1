#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const DEFAULT_COMFY = process.env.COMFY_URL || 'http://127.0.0.1:8188';
const OUT_DIR = path.resolve(process.cwd(), 'phase1-artifacts');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const SCREENSHOT = (name) => path.join(OUT_DIR, name);

const report = {
  phase: 'Phase 1 - Settings Smoke',
  appUrl: APP_URL,
  results: {
    directorModeActivated: false,
    svdConfig: {
      comfyUIUrl: DEFAULT_COMFY,
      clientId: 'csg_test_client',
      videoModelLabel: 'Stable Video Diffusion (SVD)',
      urlPersisted: false,
      clientIdPersisted: false,
      videoModelPersisted: false
    },
    wanConfig: {
      videoModelLabel: 'WAN Video (experimental)',
      videoModelPersisted: false
    }
  },
  errors: [],
  screenshots: []
};

function pushShot(name) {
  report.screenshots.push(name);
}

function pushError(step, message, screenshot) {
  const err = { step, message };
  if (screenshot) err.screenshot = screenshot;
  report.errors.push(err);
}

async function tryClick(page, locators, timeout = 4000) {
  for (const sel of locators) {
    try {
      const locator = page.locator(sel);
      const count = await locator.count();
      if (count > 0) {
        await locator.first().waitFor({ state: 'visible', timeout }).then(() => locator.first().click({ timeout })).catch(() => {});
        return true;
      }
    } catch (e) {
      // continue
    }
  }
  return false;
}

async function findAndFill(page, keywords, value) {
  // Attempt several strategies to locate an input/textarea/select related to keywords
  const lc = keywords.map(k => k.toLowerCase());

  // 1) ARIA / placeholder / name attributes
  const attrSelectors = [
    `input[placeholder*="${keywords[0]}"]`,
    `input[aria-label*="${keywords[0]}"]`,
    `input[name*="${keywords[0]}"]`,
    `textarea[placeholder*="${keywords[0]}"]`,
    `textarea[aria-label*="${keywords[0]}"]`,
    `textarea[name*="${keywords[0]}"]`
  ];
  for (const sel of attrSelectors) {
    try {
      const loc = page.locator(sel);
      if (await loc.count() > 0) {
        await loc.first().fill(value);
        return true;
      }
    } catch (e) {}
  }

  // 2) Labels
  try {
    const found = await page.evaluate((kw) => {
      const labels = Array.from(document.querySelectorAll('label'));
      for (const label of labels) {
        const txt = (label.innerText || '').toLowerCase();
        if (kw.some(k => txt.includes(k))) {
          const forId = label.getAttribute('for');
          if (forId) {
            const el = document.getElementById(forId);
            if (el) {
              el.focus(); el.value = ''; el.value = arguments[1]; el.dispatchEvent(new Event('input',{bubbles:true})); return true;
            }
          }
          const el = label.querySelector('input,textarea,select');
          if (el) { el.focus(); el.value = ''; el.value = arguments[1]; el.dispatchEvent(new Event('input',{bubbles:true})); return true; }
          const sibling = label.parentElement && label.parentElement.querySelector('input,textarea,select');
          if (sibling) { sibling.focus(); sibling.value = ''; sibling.value = arguments[1]; sibling.dispatchEvent(new Event('input',{bubbles:true})); return true; }
        }
      }
      return false;
    }, lc, value);
    if (found) return true;
  } catch (e) {}

  // 3) Guess by name/id with keywords anywhere
  try {
    const found = await page.evaluate((kw, val) => {
      const inputs = Array.from(document.querySelectorAll('input,textarea'));
      for (const el of inputs) {
        const attrs = ((el.name||'') + ' ' + (el.id||'') + ' ' + (el.placeholder||'') + ' ' + (el.getAttribute('aria-label')||'')).toLowerCase();
        if (kw.some(k => attrs.includes(k))) { el.focus(); el.value = ''; el.value = val; el.dispatchEvent(new Event('input',{bubbles:true})); return true; }
      }
      return false;
    }, lc, value);
    if (found) return true;
  } catch (e) {}

  return false;
}

async function readField(page, keywords) {
  const lc = keywords.map(k => k.toLowerCase());
  try {
    const res = await page.evaluate((kw) => {
      function tryLabels(kw) {
        const labels = Array.from(document.querySelectorAll('label'));
        for (const label of labels) {
          const txt = (label.innerText || '').toLowerCase();
          if (kw.some(k => txt.includes(k))) {
            const forId = label.getAttribute('for');
            if (forId) {
              const el = document.getElementById(forId);
              if (el) return el.value || el.innerText || '';
            }
            const el = label.querySelector('input,textarea,select');
            if (el) return el.value || el.innerText || '';
            const sibling = label.parentElement && label.parentElement.querySelector('input,textarea,select');
            if (sibling) return sibling.value || sibling.innerText || '';
          }
        }
        return null;
      }

      const byLabel = tryLabels(kw);
      if (byLabel !== null) return byLabel;

      const inputs = Array.from(document.querySelectorAll('input,textarea,select'));
      for (const el of inputs) {
        const attrs = ((el.name||'') + ' ' + (el.id||'') + ' ' + (el.placeholder||'') + ' ' + (el.getAttribute('aria-label')||'')).toLowerCase();
        if (kw.some(k => attrs.includes(k))) return el.value || el.innerText || '';
      }
      return '';
    }, lc);
    return res ? String(res).trim() : '';
  } catch (e) {
    return '';
  }
}

async function setVideoModel(page, labelKeywords) {
  const lc = labelKeywords.map(k => k.toLowerCase());
  try {
    const res = await page.evaluate((kw) => {
      // try selects with nearby label containing 'video' or matching kw
      const labels = Array.from(document.querySelectorAll('label'));
      for (const label of labels) {
        const txt = (label.innerText || '').toLowerCase();
        if (txt.includes('video') || kw.some(k => txt.includes(k))) {
          const sel = label.parentElement && label.parentElement.querySelector('select');
          if (sel) {
            const opt = Array.from(sel.options).find(o => kw.some(k => (o.text||'').toLowerCase().includes(k)));
            if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true,text:opt.text}; }
          }
          // try radio/choice elements inside label parent
          const btns = Array.from(label.parentElement.querySelectorAll('button,input,div,span,label'));
          for (const b of btns) {
            const t = (b.innerText||b.value||'').toLowerCase();
            if (kw.some(k => t.includes(k))) { try { b.click(); } catch(e){} return {ok:true,text:b.innerText||b.value}; }
          }
        }
      }
      // fallback: search selects globally
      const selects = Array.from(document.querySelectorAll('select'));
      for (const sel of selects) {
        const opt = Array.from(sel.options).find(o => kw.some(k => (o.text||'').toLowerCase().includes(k)));
        if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); return {ok:true,text:opt.text}; }
      }
      // fallback: clickable elements with matching text
      const clickable = Array.from(document.querySelectorAll('button,div,span,label'));
      for (const c of clickable) {
        const t = (c.innerText||'').toLowerCase();
        if (kw.some(k => t.includes(k))) { try { c.click(); } catch(e){} return {ok:true,text:c.innerText}; }
      }
      return {ok:false};
    }, lc);
    return res;
  } catch (e) {
    return { ok: false };
  }
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    // Step 1: Open App & Confirm Landing
    console.log('Step 1: Navigating to', APP_URL);
    const response = await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => null);
    // Wait for either the app header text or body content
    let foundLanding = false;
    try {
      // try common header text
      foundLanding = await page.locator('text=/Cinematic Story Generator/i').first().waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
    } catch (e) { foundLanding = false; }

    if (!foundLanding) {
      // fallback: wait for body to have some visible child
      try {
        await page.waitForSelector('body :not(script):not(style)', { timeout: 8000 });
        foundLanding = true;
      } catch (e) {
        foundLanding = false;
      }
    }

    if (!foundLanding) {
      const shot = 'phase1_step1_landing_error.png';
      await page.screenshot({ path: SCREENSHOT(shot), fullPage: true }).catch(() => {});
      pushShot(shot);
      pushError('Step 1', `Failed to detect landing UI at ${APP_URL}`, shot);
      await browser.close();
      fs.writeFileSync(path.join(OUT_DIR, 'phase1_report.json'), JSON.stringify(report, null, 2));
      console.log('Landing not found — aborting Phase 1. See artifacts in', OUT_DIR);
      return;
    }

    // capture landing
    const shot1 = 'phase1_step1_landing.png';
    await page.screenshot({ path: SCREENSHOT(shot1), fullPage: true }).catch(() => {});
    pushShot(shot1);

    // Step 2: Switch to Director Mode
    console.log('Step 2: Switch to Director Mode');
    const directorSelectors = [
      'text=Director Mode', 'text=/Director\'s Mode/i', 'text=/Director Mode/i', 'text=/Director$/i',
      'button:has-text("Director Mode")', 'role=tab[name="Director Mode"]', 'role=tab[name=/Director/i]'
    ];
    const switched = await tryClick(page, directorSelectors, 3000);
    if (!switched) {
      // try clicking any tab with 'Director' in text
      const anyDirector = await page.locator('text=/Director/i').count().catch(() => 0);
      if (anyDirector > 0) {
        await page.locator('text=/Director/i').first().click().catch(() => {});
      }
    }

    // Wait for director UI cues
    let directorVisible = false;
    try {
      directorVisible = await page.locator('text=/Story Idea|Story Bible|Director\'s Vision|Director Vision|Director\'s/i').first().waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false);
    } catch (e) { directorVisible = false; }

    report.results.directorModeActivated = Boolean(directorVisible);
    const shot2 = 'phase1_step2_director_mode.png';
    await page.screenshot({ path: SCREENSHOT(shot2), fullPage: true }).catch(() => {});
    pushShot(shot2);

    // Step 3: Open Local Generation Settings Modal
    console.log('Step 3: Open Local Generation Settings');
    const settingsSelectors = [
      'button[aria-label*="settings"]', 'button[title*="Settings"]', 'button:has-text("Settings")', 'text=Local Generation Settings', 'text=Settings', 'role=button[name=/settings/i]'
    ];
    const openedSettings = await tryClick(page, settingsSelectors, 4000);
    await page.waitForTimeout(500);
    // detect modal presence
    let modalVisible = false;
    try {
      modalVisible = await page.locator('text=/Local Generation Settings|ComfyUI|Video Model|Client ID|ClientID/i').first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
    } catch (e) { modalVisible = false; }

    if (!modalVisible) {
      const shot = 'phase1_step3_settings_modal_open_error.png';
      await page.screenshot({ path: SCREENSHOT(shot), fullPage: true }).catch(() => {});
      pushShot(shot);
      pushError('Step 3', 'Settings modal did not appear or expected fields not found', shot);
      // continue gracefully
    } else {
      const shot3 = 'phase1_step3_settings_modal_open.png';
      await page.screenshot({ path: SCREENSHOT(shot3), fullPage: true }).catch(() => {});
      pushShot(shot3);
    }

    // Step 4: Configure Settings (SVD First)
    console.log('Step 4: Configure settings (SVD)');
    try {
      // set ComfyUI URL
      const setUrlOk = await findAndFill(page, ['ComfyUI','Comfy UI','Comfy','comfy'], DEFAULT_COMFY);
      // set Client ID
      const setClientOk = await findAndFill(page, ['Client ID','ClientID','client id','client'], report.results.svdConfig.clientId);

      // set Video Model to SVD
      const setModelRes = await setVideoModel(page, ['stable','svd','stable video diffusion']);

      // click Save / Apply
      const saveClicked = await tryClick(page, ['button:has-text("Save")', 'button:has-text("Apply")', 'button:has-text("OK")', 'button:has-text("Confirm")', 'text=Save'], 3000);

      // wait briefly for modal to dismiss or success toast
      await page.waitForTimeout(1200);

      // detect error toasts
      const hasError = await page.locator('text=/error|failed|unable/i').count().then(c => c > 0).catch(() => false);
      if (hasError) {
        const shot = 'phase1_step4_settings_saved_svd_error.png';
        await page.screenshot({ path: SCREENSHOT(shot), fullPage: true }).catch(() => {});
        pushShot(shot);
        pushError('Step 4', 'Detected error message after saving settings', shot);
      }

      const shot4 = 'phase1_step4_settings_saved_svd.png';
      await page.screenshot({ path: SCREENSHOT(shot4), fullPage: true }).catch(() => {});
      pushShot(shot4);

      // Step 5: Verify Persistence After Reload (SVD)
      console.log('Step 5: Reload and verify persistence (SVD)');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      // reopen director and modal if necessary
      if (!report.results.directorModeActivated) {
        await tryClick(page, directorSelectors, 3000).catch(() => {});
      }
      await tryClick(page, settingsSelectors, 3000).catch(() => {});
      await page.waitForTimeout(600);

      const readUrl = await readField(page, ['ComfyUI','Comfy UI','Comfy','comfy']);
      const readClient = await readField(page, ['Client ID','ClientID','client id','client']);
      // For video model, try to read selected option text
      const readVideo = await page.evaluate(() => {
        // try to find select with nearby video label
        const labels = Array.from(document.querySelectorAll('label'));
        for (const label of labels) {
          const t = (label.innerText||'').toLowerCase();
          if (t.includes('video')) {
            const sel = label.parentElement && label.parentElement.querySelector('select');
            if (sel) return (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || sel.value || '';
            const radios = label.parentElement && label.parentElement.querySelectorAll('input[type=radio]');
            if (radios && radios.length) {
              const r = Array.from(radios).find(r=>r.checked);
              if (r) {
                const lab = label.parentElement.querySelector(`label[for="${r.id}"]`);
                return lab ? lab.innerText : r.value || '';
              }
            }
          }
        }
        // fallback: find select globally
        const sel = document.querySelector('select');
        if (sel) return (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || sel.value || '';
        return '';
      });

      report.results.svdConfig.comfyUIUrl = readUrl || report.results.svdConfig.comfyUIUrl;
      report.results.svdConfig.clientId = readClient || report.results.svdConfig.clientId;
      report.results.svdConfig.videoModelLabel = readVideo || report.results.svdConfig.videoModelLabel;

      report.results.svdConfig.urlPersisted = (String(readUrl).trim() === String(DEFAULT_COMFY).trim());
      report.results.svdConfig.clientIdPersisted = (String(readClient).trim() === String(report.results.svdConfig.clientId).trim());
      report.results.svdConfig.videoModelPersisted = (String(readVideo).toLowerCase().includes('stable') || String(readVideo).toLowerCase().includes('svd'));

      const shot5 = 'phase1_step5_settings_persist_svd.png';
      await page.screenshot({ path: SCREENSHOT(shot5), fullPage: true }).catch(() => {});
      pushShot(shot5);

      // Step 6: Switch to WAN & Re-Verify
      console.log('Step 6: Switch to WAN model and re-verify');
      const setWanRes = await setVideoModel(page, ['wan','wan video','wan video (experimental)','wan video experimental']);
      await tryClick(page, ['button:has-text("Save")', 'button:has-text("Apply")', 'text=Save'], 3000);
      await page.waitForTimeout(800);
      // Reload and read again
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);
      await tryClick(page, settingsSelectors, 3000).catch(()=>{});
      await page.waitForTimeout(400);

      const readVideoWAN = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label'));
        for (const label of labels) {
          const t = (label.innerText||'').toLowerCase();
          if (t.includes('video')) {
            const sel = label.parentElement && label.parentElement.querySelector('select');
            if (sel) return (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || sel.value || '';
            const radios = label.parentElement && label.parentElement.querySelectorAll('input[type=radio]');
            if (radios && radios.length) {
              const r = Array.from(radios).find(r=>r.checked);
              if (r) {
                const lab = label.parentElement.querySelector(`label[for="${r.id}"]`);
                return lab ? lab.innerText : r.value || '';
              }
            }
          }
        }
        const sel = document.querySelector('select');
        if (sel) return (sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].text) || sel.value || '';
        return '';
      });

      report.results.wanConfig.videoModelLabel = readVideoWAN || report.results.wanConfig.videoModelLabel;
      report.results.wanConfig.videoModelPersisted = String(readVideoWAN).toLowerCase().includes('wan');

      const shot6 = 'phase1_step6_settings_persist_wan.png';
      await page.screenshot({ path: SCREENSHOT(shot6), fullPage: true }).catch(() => {});
      pushShot(shot6);

    } catch (e) {
      pushError('Step 4-6', `Unexpected error during configuration: ${e.message}`);
    }

  } catch (e) {
    pushError('Run', `Unexpected runtime error: ${e.message}`);
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUT_DIR, 'phase1_report.json'), JSON.stringify(report, null, 2));
    console.log('Artifacts written to', OUT_DIR);
  }
}

run().catch(e => {
  console.error('Fatal error running Phase 1 script', e);
});
