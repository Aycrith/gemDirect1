/**
 * Telemetry helper utilities used by unit tests and other tooling.
 *
 * This mirrors the fallback-note generation performed in
 * `scripts/queue-real-workflow.ps1` so TypeScript tests can assert the
 * same observable behavior without executing PowerShell.
 */

export function generateFallbackNotes(
  systemBefore: any,
  systemAfter: any,
  gpuBefore: any,
  gpuAfter: any
): string[] {
  const notes: string[] = []

  if (!systemBefore) {
    if (gpuBefore && gpuBefore.FallbackSource === 'nvidia-smi') {
      notes.push('/system_stats unavailable before execution; used nvidia-smi fallback')
    } else {
      notes.push('/system_stats unavailable before execution')
    }
  } else if (gpuBefore && gpuBefore.FallbackSource === 'nvidia-smi') {
    notes.push('/system_stats present but missing VRAM before execution; used nvidia-smi fallback')
  }

  if (!systemAfter) {
    if (gpuAfter && gpuAfter.FallbackSource === 'nvidia-smi') {
      notes.push('/system_stats unavailable after execution; used nvidia-smi fallback')
    } else {
      notes.push('/system_stats unavailable after execution')
    }
  } else if (gpuAfter && gpuAfter.FallbackSource === 'nvidia-smi') {
    notes.push('/system_stats present but missing VRAM after execution; used nvidia-smi fallback')
  }

  return notes
}

export default { generateFallbackNotes }
