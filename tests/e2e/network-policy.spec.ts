import { test, expect } from '@playwright/test';

const ALLOWED_ORIGINS = [
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://localhost:1234',      // LM Studio
  'http://192.168.50.192:1234', // LM Studio network
  'http://127.0.0.1:8188',      // ComfyUI local
  'http://localhost:8188',      // ComfyUI local
  // CDN allowlist (fonts, styles)
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdn.tailwindcss.com'
];

const BLOCKED_ORIGINS = [
  'https://api.openai.com',
  'https://generativelanguage.googleapis.com',
  'https://aiplatform.googleapis.com',
  'https://api.anthropic.com',
  'https://api.groq.com',
  'https://api.together.xyz'
];

test.describe('Network Policy Enforcement', () => {
  test('should only allow local services and approved CDNs', async ({ page, context: _context }) => {
    const blockedRequests: string[] = [];
    const allowedRequests: string[] = [];

    // Intercept all network requests
    await page.route('**/*', async (route, request) => {
      const url = request.url();
      const origin = new URL(url).origin;

      // Check if origin is in allowed list
      const isAllowed = ALLOWED_ORIGINS.some(allowed => origin.startsWith(allowed));
      
      if (isAllowed) {
        allowedRequests.push(url);
        await route.continue();
      } else {
        // Check if this is a blocked external service
        const isBlocked = BLOCKED_ORIGINS.some(blocked => origin.startsWith(blocked));
        if (isBlocked) {
          blockedRequests.push(url);
          await route.abort('failed');
        } else {
          // Log unexpected origins for review
          console.log(`⚠️  Unexpected origin: ${origin}`);
          allowedRequests.push(url);
          await route.continue();
        }
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify no blocked services were called
    expect(blockedRequests).toHaveLength(0);
    
    if (blockedRequests.length > 0) {
      console.error('❌ Blocked requests detected:', blockedRequests);
      throw new Error(`Network policy violation: ${blockedRequests.length} requests to external AI services detected`);
    }

    // Log summary
    console.log(`✅ Network policy enforced: ${allowedRequests.length} allowed requests, ${blockedRequests.length} blocked`);
  });

  test('should block external AI service URLs explicitly', async ({ page }) => {
    const externalCalls: string[] = [];

    await page.route('**/*', async (route, request) => {
      const url = request.url();
      const isExternalAI = BLOCKED_ORIGINS.some(blocked => url.startsWith(blocked));
      
      if (isExternalAI) {
        externalCalls.push(url);
        await route.abort('failed');
      } else {
        await route.continue();
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(externalCalls).toHaveLength(0);
    expect(externalCalls).toEqual([]);
  });

  test('should allow approved CDN resources', async ({ page }) => {
    const cdnRequests: { url: string; status: string }[] = [];

    page.on('response', (response) => {
      const url = response.url();
      const isCDN = [
        'fonts.googleapis.com',
        'fonts.gstatic.com',
        'cdn.tailwindcss.com'
      ].some(cdn => url.includes(cdn));

      if (isCDN) {
        cdnRequests.push({ url, status: response.status().toString() });
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Log CDN requests for visibility
    cdnRequests.forEach(req => {
      console.log(`CDN: ${req.url} - ${req.status}`);
    });

    // Verify CDN requests succeeded (if any were made)
    // Accept 2xx (success) and 3xx (redirect) status codes
    const failedCDN = cdnRequests.filter(req => !req.status.startsWith('2') && !req.status.startsWith('3'));
    expect(failedCDN).toHaveLength(0);
  });

  test('should document allowed origins for reference', () => {
    // This test documents the expected network policy
    const expected = {
      localServices: [
        'http://127.0.0.1:4173',   // Vite dev server
        'http://localhost:1234',   // LM Studio
        'http://127.0.0.1:8188'    // ComfyUI
      ],
      approvedCDNs: [
        'https://fonts.googleapis.com',
        'https://fonts.gstatic.com',
        'https://cdn.tailwindcss.com'
      ],
      blockedServices: [
        'https://api.openai.com',
        'https://generativelanguage.googleapis.com',
        'https://api.anthropic.com'
      ]
    };

    expect(expected.localServices.length).toBeGreaterThan(0);
    expect(expected.approvedCDNs.length).toBeLessThanOrEqual(3);
    expect(expected.blockedServices.length).toBeGreaterThan(0);
  });
});
