import { Page, Route } from '@playwright/test';

/**
 * Mock response data for Gemini API
 */
export const mockStoryBibleResponse = {
  logline: 'A hacker uncovers a corporate surveillance conspiracy that threatens global privacy',
  characters: [
    { 
      name: 'Jordan Chen', 
      traits: 'Paranoid, brilliant coder, determined, has trust issues from past betrayal' 
    },
    { 
      name: 'Alex Rivera', 
      traits: 'Corporate insider, conflicted, secretly sympathetic to Jordan\'s cause' 
    }
  ],
  setting: 'Near-future megacity with neon-lit underbelly, rain-soaked streets, high-tech surveillance everywhere',
  plotOutline: `Act 1: Jordan discovers unusual data patterns in corporate network traffic
Act 2: Investigation reveals massive surveillance operation, Alex becomes reluctant ally
Act 3: Race to expose conspiracy before they're silenced, final showdown in corporate server farm`
};

export const mockScenesResponse = [
  {
    sceneId: 'scene-001',
    title: 'The Discovery',
    description: 'Jordan works late in their apartment, monitoring network traffic when they notice the anomaly',
    visualStyle: 'Dark apartment lit only by multiple monitor glow, rain on windows, cyberpunk aesthetic',
    keyMoments: [
      'Jordan typing frantically on keyboard',
      'Screen reflection in their glasses showing suspicious data patterns',
      'Close-up of face as realization dawns'
    ]
  },
  {
    sceneId: 'scene-002',
    title: 'The Meeting',
    description: 'Jordan meets Alex in a crowded underground club to discuss findings',
    visualStyle: 'Neon lights, smoke-filled atmosphere, heavy bass vibrations visible in drinks',
    keyMoments: [
      'Jordan and Alex sit in shadowy booth',
      'Alex nervously glances at security cameras',
      'Exchange of encrypted data drive under table'
    ]
  },
  {
    sceneId: 'scene-003',
    title: 'The Infiltration',
    description: 'Final confrontation in the corporate server farm',
    visualStyle: 'Vast server halls with endless rows of blinking lights, cold industrial lighting',
    keyMoments: [
      'Jordan navigating through server racks',
      'Uploading virus to central mainframe',
      'Alarms trigger as system begins to fail'
    ]
  }
];

export const mockDirectorsVision = `Cinematic noir aesthetic with heavy cyberpunk influence. 
Think Blade Runner meets Mr. Robot. Every scene should feel claustrophobic despite vast spaces.
Rain and neon are constant companions. Camera work is intimate - lots of close-ups on faces and screens.
Color palette: Deep blues, harsh whites, neon pinks and greens. Shadows are as important as light.`;

/**
 * Scenario types for different API response behaviors
 */
export type GeminiMockScenario = 'success' | 'rate-limit' | 'timeout' | 'invalid-json' | 'network-error';

/**
 * Mock Gemini API responses for testing
 * 
 * @param page - Playwright page object
 * @param scenario - Type of response behavior to simulate
 * @param customResponse - Optional custom response data
 */
export async function mockGeminiAPI(
  page: Page, 
  scenario: GeminiMockScenario = 'success',
  customResponse?: any
) {
  const geminiUrlPattern = '**/generativelanguage.googleapis.com/**';
  
  await page.route(geminiUrlPattern, async (route: Route) => {
    const url = route.request().url();
    console.log(`[Gemini Mock] Intercepted: ${url.substring(0, 100)}...`);
    
    switch (scenario) {
      case 'success':
        await handleSuccessScenario(route, url, customResponse);
        break;
        
      case 'rate-limit':
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 429,
              message: 'RATE_LIMIT_EXCEEDED',
              status: 'RESOURCE_EXHAUSTED'
            }
          })
        });
        break;
        
      case 'timeout':
        // Simulate timeout by delaying response beyond test timeout
        await new Promise(resolve => setTimeout(resolve, 65000));
        await route.abort('timedout');
        break;
        
      case 'invalid-json':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{ invalid json response }'
        });
        break;
        
      case 'network-error':
        await route.abort('failed');
        break;
        
      default:
        await route.continue();
    }
  });
}

/**
 * Handle successful API response scenario
 */
async function handleSuccessScenario(route: Route, url: string, customResponse?: any) {
  let responseData: any;
  
  // Determine response based on endpoint
  if (url.includes('generateContent') || url.includes('streamGenerateContent')) {
    // Check if this is story bible or scene generation based on request
    const requestBody = route.request().postDataJSON();
    const prompt = JSON.stringify(requestBody?.contents || '').toLowerCase();
    
    if (prompt.includes('scene') || prompt.includes('director')) {
      // Scene generation request
      responseData = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify(customResponse || mockScenesResponse)
            }]
          },
          finishReason: 'STOP',
          safetyRatings: []
        }],
        usageMetadata: {
          promptTokenCount: 150,
          candidatesTokenCount: 800,
          totalTokenCount: 950
        }
      };
    } else {
      // Story bible generation request
      responseData = {
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify(customResponse || mockStoryBibleResponse)
            }]
          },
          finishReason: 'STOP',
          safetyRatings: []
        }],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 500,
          totalTokenCount: 600
        }
      };
    }
  } else {
    // Default response
    responseData = {
      candidates: [{
        content: {
          parts: [{ text: JSON.stringify(customResponse || { success: true }) }]
        }
      }]
    };
  }
  
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(responseData)
  });
}

/**
 * Wait for Gemini API call to complete
 */
export async function waitForGeminiCall(page: Page, timeoutMs = 30000): Promise<boolean> {
  try {
    await page.waitForResponse(
      response => response.url().includes('generativelanguage.googleapis.com'),
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Count number of Gemini API calls made
 */
export function trackGeminiCalls(page: Page): { count: number; requests: any[] } {
  const tracker = { count: 0, requests: [] as any[] };
  
  page.on('request', request => {
    if (request.url().includes('generativelanguage.googleapis.com')) {
      tracker.count++;
      tracker.requests.push({
        url: request.url(),
        method: request.method(),
        timestamp: Date.now()
      });
    }
  });
  
  return tracker;
}
