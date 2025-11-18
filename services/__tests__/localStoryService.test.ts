import { describe, expect, test } from 'vitest';
import { HeroArc } from '../../types';
import { buildHeroArcList, deriveSceneHeroArcMeta } from '../localStoryService';

describe('Story hero arc helpers', () => {
  test('buildHeroArcList returns at least 12 arcs and honors overrides', () => {
    const arcs = buildHeroArcList();
    expect(arcs.length).toBeGreaterThanOrEqual(12);
    expect(arcs[0].name).toContain('Ordinary World');

    const overrides = buildHeroArcList([
      { id: 'arc-01', name: 'Custom World', summary: 'A custom opening', emotionalShift: 'Curiosity', importance: 9 },
    ]);
    expect(overrides[0].name).toBe('Custom World');
    expect(overrides[0].importance).toBe(9);
  });

  test('deriveSceneHeroArcMeta respects heroArcId and falls back by index', () => {
    const heroArcs: HeroArc[] = [
      { id: 'arc-01', name: 'One', summary: 'First', emotionalShift: 'A', importance: 5 },
      { id: 'arc-02', name: 'Two', summary: 'Second', emotionalShift: 'B', importance: 6 },
    ];
    const meta = deriveSceneHeroArcMeta({ heroArcId: 'arc-02' }, heroArcs, 0);
    expect(meta.heroArcId).toBe('arc-02');
    expect(meta.heroArcOrder).toBe(2);

    const metaFallback = deriveSceneHeroArcMeta({ }, heroArcs, 1);
    expect(metaFallback.heroArcId).toBe('arc-02');
    expect(metaFallback.heroArcOrder).toBe(2);
  });
});
