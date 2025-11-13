import { describe, it, expect } from 'vitest'

// Minimal validator that mirrors the relevant checks in telemetry-shape.test.ts
function validateTelemetryBasic(telemetry: any) {
  const errors: string[] = []
  if (!telemetry || typeof telemetry !== 'object') {
    errors.push('Telemetry missing or not an object')
    return { valid: false, errors }
  }

  if (!telemetry.GPU || typeof telemetry.GPU !== 'object') {
    errors.push('GPU object missing')
  }

  if (!telemetry.System || typeof telemetry.System !== 'object') {
    errors.push('System object missing')
  }

  // System.FallbackNotes should be an array when present
  if (telemetry.System && telemetry.System.FallbackNotes != null && !Array.isArray(telemetry.System.FallbackNotes)) {
    errors.push('System.FallbackNotes must be an array when present')
  }

  return { valid: errors.length === 0, errors }
}

describe('Telemetry negative-field validator (basic checks)', () => {
  it('flags missing GPU object', () => {
    const telemetry: any = {
      System: { FallbackNotes: [] }
    }
    const res = validateTelemetryBasic(telemetry)
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('GPU object missing')
  })

  it('flags missing System object', () => {
    const telemetry: any = {
      GPU: { Name: 'x' }
    }
    const res = validateTelemetryBasic(telemetry)
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('System object missing')
  })

  it('flags non-array FallbackNotes', () => {
    const telemetry: any = {
      GPU: { Name: 'x' },
      System: { FallbackNotes: 'not-an-array' }
    }
    const res = validateTelemetryBasic(telemetry)
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('System.FallbackNotes must be an array when present')
  })
})
