import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { spawnSync } from 'child_process'

describe('generate-done-markers sentinel (integration)', () => {
  it('creates a .done marker for a stable sequence (RunOnce)', () => {
    // Ensure pwsh is available; skip otherwise
    const which = spawnSync('pwsh', ['-NoLogo', '-Command', '-v'], { encoding: 'utf8' })
    if (which.error) {
      // pwsh not available in test environment; skip with a warning
      console.warn('pwsh not available; skipping done-marker integration test')
      expect(true).toBe(true)
      return
    }

    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gemdirect-done-'))
    try {
      // Create a sample ComfyUI-style output file that the sentinel will detect
      const sampleName = 'gemdirect1_scene-001_00001.png'
      const samplePath = path.join(tmpRoot, sampleName)
      fs.writeFileSync(samplePath, 'PNG-STUB', { encoding: 'utf8' })

      const scriptPath = path.resolve(path.join(__dirname, '..', 'generate-done-markers.ps1'))
      const args = ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-RunOnce', '-OutputDirs', tmpRoot, '-ScanIntervalSeconds', '0.1', '-StableSeconds', '0', '-MinFrames', '1']
      const res = spawnSync('pwsh', args, { encoding: 'utf8', timeout: 20000 })
      if (res.error) {
        console.warn('generate-done-markers invocation failed:', res.error)
        // Allow test to fail if PWSh present but script errors
        expect(res.error).toBeUndefined()
      }

      // The sentinel creates a .done marker; the exact prefix heuristic can
      // vary by ComfyUI output naming. Accept any .done file in the output
      // directory as a success signal for this test.
      const doneFiles = fs.readdirSync(tmpRoot).filter((n) => n.endsWith('.done'))
      const exists = doneFiles.length > 0
      if (!exists) {
        console.error('stdout:', res.stdout)
        console.error('stderr:', res.stderr)
      }
      expect(exists).toBe(true)
    } finally {
      // Cleanup
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch { }
    }
  }, 30000)
})
