/**
 * Playwright Global Setup
 * Implements health gates and contract validation per AI_AGENT_PROMPT.md
 */

import { checkReadiness, generateDriftMatrix } from '../../utils/healthcheck';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function globalSetup() {
  console.log('\n[*] Running pre-flight health checks...\n');

  // Check service readiness (traffic-light gates)
  const readiness = await checkReadiness();

  console.log(`LM Studio: [${getStatusSymbol(readiness.lmStudio.status)}] ${readiness.lmStudio.status.toUpperCase()}`);
  if (readiness.lmStudio.latency) {
    console.log(`  Latency: ${readiness.lmStudio.latency}ms`);
  }
  if (readiness.lmStudio.errors.length > 0) {
    console.log(`  [X] Errors: ${readiness.lmStudio.errors.join(', ')}`);
  }
  if (readiness.lmStudio.warnings.length > 0) {
    console.log(`  [!] Warnings: ${readiness.lmStudio.warnings.join(', ')}`);
  }

  console.log(`\nComfyUI: [${getStatusSymbol(readiness.comfyui.status)}] ${readiness.comfyui.status.toUpperCase()}`);
  if (readiness.comfyui.latency) {
    console.log(`  Latency: ${readiness.comfyui.latency}ms`);
  }
  if (readiness.comfyui.errors.length > 0) {
    console.log(`  [X] Errors: ${readiness.comfyui.errors.join(', ')}`);
  }
  if (readiness.comfyui.warnings.length > 0) {
    console.log(`  [!] Warnings: ${readiness.comfyui.warnings.join(', ')}`);
  }

  // Generate drift matrix
  console.log('\n[*] Generating drift matrix...\n');
  const driftMatrix = await generateDriftMatrix();
  
  // Save drift matrix to artifacts
  const artifactsDir = join(process.cwd(), 'test-results', 'health-checks');
  mkdirSync(artifactsDir, { recursive: true });
  
  const driftPath = join(artifactsDir, `drift-matrix-${Date.now()}.json`);
  writeFileSync(driftPath, JSON.stringify(driftMatrix, null, 2));
  console.log(`Drift matrix saved: ${driftPath}`);

  if (driftMatrix.deviations.length > 0) {
    console.log('\n[!] DRIFT DETECTED:');
    driftMatrix.deviations.forEach(d => console.log(`  - ${d}`));
  } else {
    console.log('[OK] No drift detected');
  }

  // Contract validation results
  console.log('\n[*] Contract Validation:\n');
  
  console.log('LM Studio Contracts:');
  readiness.lmStudio.contracts.forEach(c => {
    console.log(`  [${c.passed ? 'OK' : 'X'}] ${c.name}: ${c.expected} ${c.passed ? '=' : '!='} ${c.actual}`);
  });

  console.log('\nComfyUI Contracts:');
  readiness.comfyui.contracts.forEach(c => {
    console.log(`  [${c.passed ? 'OK' : 'X'}] ${c.name}: ${c.expected} ${c.passed ? '=' : '!='} ${c.actual}`);
  });

  // Fail fast if blockers found
  if (!readiness.ready) {
    console.error('\n[X] BLOCKERS DETECTED - Tests cannot proceed:\n');
    readiness.blockers.forEach(b => console.error(`  [X] ${b}`));
    console.error('\nPlease ensure LM Studio and ComfyUI are running and accessible.');
    console.error('Run `npm run check:health-helper` for detailed diagnostics.\n');
    
    // Allow tests to proceed with warning in development
    if (process.env.CI) {
      throw new Error('Health check failed - services not ready');
    } else {
      console.warn('[!] Proceeding in dev mode despite failures. Tests may fail.\n');
    }
  } else {
    console.log('\n[OK] All systems ready - proceeding with tests\n');
  }
}

function getStatusSymbol(status: string): string {
  switch (status) {
    case 'green': return 'OK';
    case 'yellow': return '!';
    case 'red': return 'X';
    default: return '?';
  }
}

export default globalSetup;
