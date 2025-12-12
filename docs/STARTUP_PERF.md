# Startup Performance Notes

The app now emits lightweight Performance API marks/measures so startup timing can be captured without needing profiler screenshots.

## Marks / Measures

- `app:entry` (mark) — set at the top of `index.tsx`
- `app:render` (mark) — set immediately after `root.render(...)` in `index.tsx`
- `hydration:complete` (mark) — set when `HydrationContext` reaches `status === 'complete'`
- `app:hydration` (measure) — measured from `app:entry` → `hydration:complete` (when both are available)

## How To Capture

Open DevTools Console and run:

```js
performance.getEntriesByName('app:hydration', 'measure').slice(-1)[0]
```

To see the raw marks:

```js
performance.getEntriesByName('app:entry', 'mark')
performance.getEntriesByName('hydration:complete', 'mark')
```

