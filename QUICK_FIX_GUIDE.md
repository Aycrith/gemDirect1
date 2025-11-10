# QUICK FIX: Enable AI Generation in 5 Minutes

## TL;DR - The Problem
The Cinematic Story Generator's **Local Drafter is fully implemented but intentionally disabled**. All generation relies on Gemini API, creating a single point of failure. When Gemini has issues (rate limits, network errors, quota), the entire app appears broken.

## TL;DR - The Solution
Enable the existing Local Drafter fallback provider (5-minute fix).

---

## IMMEDIATE FIX (Copy-Paste Ready)

### Step 1: Enable Local Drafter Provider
**File**: `contexts/PlanExpansionStrategyContext.tsx` (Line 15-20)

**CHANGE THIS:**
```typescript
{
    id: 'local-drafter',
    label: 'Local Drafter',
    description: 'Offline outline expansion engine (coming soon).',
    isAvailable: false,  // ❌ CURRENTLY DISABLED
    disabledReason: 'Planned provider – not yet implemented.',
},
```

**TO THIS:**
```typescript
{
    id: 'local-drafter',
    label: 'Local Drafter (Template-Based)',
    description: 'Template-based story generation for offline use or Gemini fallback.',
    isAvailable: true,  // ✅ ENABLE THIS
},
```

### Step 2: Test It
```powershell
npm run dev
```

1. Open http://localhost:3001
2. Open browser DevTools (F12) → Console
3. Run:
```javascript
// Check current provider
console.log('Active Provider:', localStorage.getItem('planExpansion.strategy.selected'));

// Switch to Local Drafter
localStorage.setItem('planExpansion.strategy.selected', 'local-drafter');
location.reload();
```

4. Try generating a Story Bible
5. Should work instantly with template-based content

### Step 3: Add UI Toggle (Optional but Recommended)

**File**: `components/LocalGenerationSettingsModal.tsx`

Add this before ComfyUI settings section:

```typescript
import { usePlanExpansionStrategy } from '../contexts/PlanExpansionStrategyContext';

// Inside component:
const { strategies, activeStrategyId, selectStrategy } = usePlanExpansionStrategy();

// Add this UI before existing content:
<div className="mb-8 pb-6 border-b border-gray-700">
    <h3 className="text-lg font-semibold text-gray-200 mb-3">Story Generation Provider</h3>
    <select 
        value={activeStrategyId}
        onChange={(e) => selectStrategy(e.target.value)}
        className="block w-full rounded-md border-gray-700 bg-gray-800 text-gray-200 p-2"
    >
        {strategies.filter(s => s.isAvailable).map(strategy => (
            <option key={strategy.id} value={strategy.id}>
                {strategy.label}
            </option>
        ))}
    </select>
    <p className="mt-2 text-sm text-gray-400">
        {strategies.find(s => s.id === activeStrategyId)?.description}
    </p>
</div>
```

---

## What This Fixes

### Before (Broken State)
- ❌ Story generation fails → indefinite loading
- ❌ Scene generation fails → no scenes created
- ❌ All AI features depend on Gemini API
- ❌ No offline capability
- ❌ Rate limiting breaks entire app

### After (Fixed State)
- ✅ Story generation works offline
- ✅ Scene generation always succeeds
- ✅ Users can choose Gemini OR Local Drafter
- ✅ Full offline capability
- ✅ Rate limiting only affects one provider

---

## Provider Comparison

| Feature | Gemini (Default) | Local Drafter |
|---------|------------------|---------------|
| **Quality** | ⭐⭐⭐⭐⭐ (AI-powered) | ⭐⭐⭐ (Template-based) |
| **Speed** | ~2-5 seconds | Instant (<100ms) |
| **Creativity** | High variety | Limited variety |
| **Offline** | ❌ Requires internet | ✅ Works offline |
| **Reliability** | Depends on API | ✅ 100% reliable |
| **Cost** | Free tier limits | ✅ Unlimited |
| **Images** | Rendered visuals | SVG placeholders |

### Recommendation
- **Use Gemini** for final production work
- **Use Local Drafter** for:
  - Initial prototyping
  - When Gemini is down
  - Offline work
  - Avoiding rate limits
  - Quick iterations

---

## Verification Steps

### Test 1: Gemini Provider
1. Open Settings → Select "Gemini (Default)"
2. Create story idea: "A detective discovers a conspiracy in a floating city"
3. Click "Generate Story Bible"
4. Should take 2-5 seconds
5. Output should be detailed, creative, unique

### Test 2: Local Drafter Provider
1. Open Settings → Select "Local Drafter (Template-Based)"
2. Use same story idea
3. Click "Generate Story Bible"
4. Should be instant
5. Output should be structured but generic

### Test 3: Fallback Scenario
1. Disconnect internet (or block generativelanguage.googleapis.com)
2. Try Gemini generation → should fail
3. Switch to Local Drafter
4. Generation should succeed immediately

---

## Troubleshooting

### Issue: "Local Drafter" not showing in dropdown
**Cause**: Step 1 not applied correctly  
**Fix**: Double-check `isAvailable: true` is set, restart dev server

### Issue: Generation still fails with Local Drafter
**Cause**: JavaScript error in console  
**Fix**: Check browser console (F12), look for error messages, share with developer

### Issue: Want to set Local Drafter as default
**Fix**: In `PlanExpansionStrategyContext.tsx`, change:
```typescript
{
    id: 'local-drafter',
    isAvailable: true,
    isDefault: true,  // Add this line
}
// And remove isDefault from gemini-plan
```

---

## Next Steps (Beyond Quick Fix)

1. **Add automatic fallback** - When Gemini fails, auto-switch to Local Drafter
2. **Improve error messages** - Show why generation failed + recovery steps
3. **Add health monitoring** - Display provider status in real-time
4. **True local LLM** - Integrate Ollama/LM Studio for AI-quality local generation
5. **Backend proxy** - Hide API key on server, add rate limiting

See `AI_GENERATION_FAILURE_DIAGNOSTIC_REPORT.md` for full implementation plans.

---

## What Local Drafter Actually Does

Since it's "template-based," here's what it generates:

### Story Bible
```json
{
  "logline": "<User's idea verbatim or slightly enhanced>",
  "characters": "- Protagonist: driven to navigate conflict\n- Antagonist: opposition",
  "setting": "Set amid <detected setting keyword from idea>",
  "plotOutline": "Act I: Setup\nAct II: Escalation\nAct III: Resolution"
}
```

### Scenes (from plot outline)
- Extracts 3-6 key beats from plot outline
- Creates scene titles like "Act I: Opening Scene 1"
- Adds generic summaries with Director's Vision reference

### Shots (from scene)
- Generates 3-4 standard shots: establishing, medium, close-up
- Applies default enhancers: Wide/Medium/Close framing, natural lighting, etc.

### Images
- Creates SVG placeholder graphics with:
  - Scene/shot title
  - Summary text
  - "Generated via local fallback" watermark

**Key Limitation**: No actual AI reasoning - it's essentially "smart templates" with string manipulation.

---

## When to Use Each Provider

### Use Gemini When:
- ✅ You need high-quality, creative output
- ✅ Internet is stable
- ✅ You have quota remaining (check Usage Dashboard)
- ✅ Final production work
- ✅ Generating visual keyframes (not placeholders)

### Use Local Drafter When:
- ✅ Gemini is rate-limiting you (429 errors)
- ✅ Working offline (airplane, poor connection)
- ✅ Prototyping/brainstorming (quality not critical)
- ✅ Batch operations (avoid hitting quota)
- ✅ Want instant results
- ✅ Gemini API has an outage

### Switch Mid-Project?
**YES!** You can:
1. Start with Local Drafter to get structure
2. Switch to Gemini and regenerate specific scenes for better quality
3. Mix and match (use Local for some scenes, Gemini for others)

All data is stored in IndexedDB, so your work persists regardless of provider.

---

## FAQ

**Q: Will Local Drafter replace Gemini?**  
A: No. It's a fallback, not a replacement. Gemini is always preferred when available.

**Q: Can I run an actual LLM locally?**  
A: Yes! See "Priority 5" in the main diagnostic report for Ollama/LM Studio integration plans.

**Q: What about ComfyUI? Can it generate stories?**  
A: No. ComfyUI only handles video/image generation. It has no text generation capabilities.

**Q: Is my data safe with Local Drafter?**  
A: Yes. Everything runs in your browser using JavaScript. No data leaves your machine.

**Q: Performance impact?**  
A: Negligible. Local Drafter is pure string manipulation (< 100ms per operation).

**Q: Can I customize Local Drafter templates?**  
A: Yes! Edit `services/localFallbackService.ts`. Change constants like `DEFAULT_IDEAS`, `DEFAULT_VISIONS`, `fallbackEnhancers`.

---

## Full Report Reference

For complete technical details, architecture diagrams, testing protocols, and long-term recommendations, see:

**`AI_GENERATION_FAILURE_DIAGNOSTIC_REPORT.md`** (1,200+ lines)

Sections:
- Root cause analysis
- Provider architecture investigation  
- API integration verification
- Code flow analysis
- Local fallback service analysis
- Risk assessment
- Implementation timeline
- Testing plan
- Monitoring strategy

---

**Last Updated**: November 9, 2025  
**Quick Fix Time**: 5 minutes  
**Full Implementation Time**: 1-4 weeks (see timeline in main report)
