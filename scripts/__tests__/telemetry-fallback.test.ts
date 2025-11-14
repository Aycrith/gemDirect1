import { describe, it, expect } from 'vitest'
import { generateFallbackNotes } from '../utils/telemetryUtils'

describe('Telemetry fallback-note generation', () => {
  it('uses nvidia-smi fallback note when /system_stats missing and gpu indicates fallback', () => {
    const notes = generateFallbackNotes(null, null, { FallbackSource: 'nvidia-smi' }, null)
    expect(notes).toContain('/system_stats unavailable before execution; used nvidia-smi fallback')
    expect(notes).toContain('/system_stats unavailable after execution')
  })

  it('reports unavailable when no gpu fallback present', () => {
    const notes = generateFallbackNotes(null, null, null, null)
    expect(notes).toContain('/system_stats unavailable before execution')
    expect(notes).toContain('/system_stats unavailable after execution')
  })

  it('reports missing VRAM with nvidia-smi when system present but VRAM missing', () => {
    const notes = generateFallbackNotes({}, {}, { FallbackSource: 'nvidia-smi' }, { FallbackSource: 'nvidia-smi' })
    expect(notes).toContain('/system_stats present but missing VRAM before execution; used nvidia-smi fallback')
    expect(notes).toContain('/system_stats present but missing VRAM after execution; used nvidia-smi fallback')
  })

  it('returns empty notes when no fallbacks are needed', () => {
    const notes = generateFallbackNotes({ system: {} }, { system: {} }, null, null)
    expect(notes.length).toBe(0)
  })

  it('includes frame stability warnings when provided', () => {
    const frameWarnings = ['Frames not stable yet']
    const notes = generateFallbackNotes(null, null, null, null, frameWarnings)
    expect(notes).toContain('Frames not stable yet')
  })

  it('includes forced copy note when provided', () => {
    const forcedCopy = 'Forced copy after retries'
    const notes = generateFallbackNotes(null, null, null, null, undefined, forcedCopy)
    expect(notes).toContain('Forced copy after retries')
  })

  it('includes done marker warnings when provided', () => {
    const doneWarnings = ['Done marker not found in time']
    const notes = generateFallbackNotes(null, null, null, null, undefined, null, doneWarnings)
    expect(notes).toContain('Done marker not found in time')
  })
})
