import { test, expect } from '@playwright/test';
import { dismissWelcomeDialog, ensureDirectorMode, loadProjectState } from '../fixtures/test-helpers';
import { mockStoryBible } from '../fixtures/mock-data';
import { capturePageLoadMetrics, startTiming, endTiming, formatMetrics, saveMetrics } from '../fixtures/performance-helpers';

/**
 * Performance Benchmarking Test Suite
 * 
 * Measures and documents baseline performance metrics for key operations:
 * - App cold start time
 * - IndexedDB hydration time
 * - UI interaction responsiveness
 * - LLM generation time (story, scenes)
 * - ComfyUI generation time (keyframes, videos)
 * 
 * Results are logged to console and can be collected for analysis.
 * Run with: npx playwright test tests/e2e/performance.spec.ts --reporter=html
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  unit: 'ms' | 's';
  threshold?: number;
  category: 'cold-start' | 'hydration' | 'ui' | 'llm' | 'comfyui';
}

const metrics: PerformanceMetric[] = [];

const recordMetric = (
  name: string,
  duration: number,
  category: PerformanceMetric['category'],
  threshold?: number
) => {
  const unit = duration < 10000 ? 'ms' : 's';
  const value = unit === 's' ? duration / 1000 : duration;
  
  metrics.push({ name, duration: value, unit, threshold, category });
  
  const thresholdInfo = threshold ? ` (threshold: ${threshold}${unit})` : '';
  const status = threshold && value > threshold ? '⚠️ SLOW' : '✅';
  
  console.log(`[Perf] ${status} ${name}: ${value.toFixed(2)}${unit}${thresholdInfo}`);
};

test.describe('Performance Benchmarking', () => {
  test.afterAll(() => {
    console.log('\n=== PERFORMANCE SUMMARY ===\n');
    
    const categories = ['cold-start', 'hydration', 'ui', 'llm', 'comfyui'] as const;
    
    categories.forEach((category) => {
      const categoryMetrics = metrics.filter((m) => m.category === category);
      if (categoryMetrics.length === 0) return;
      
      console.log(`\n${category.toUpperCase()}:`);
      categoryMetrics.forEach((m) => {
        const status = m.threshold && m.duration > m.threshold ? '⚠️' : '✅';
        console.log(`  ${status} ${m.name}: ${m.duration.toFixed(2)}${m.unit}`);
      });
    });
    
    // Calculate statistics
    const total = metrics.reduce((sum, m) => sum + (m.unit === 's' ? m.duration * 1000 : m.duration), 0);
    const avg = total / metrics.length;
    const slow = metrics.filter((m) => m.threshold && m.duration > m.threshold);
    
    console.log('\n=== STATISTICS ===');
    console.log(`Total operations measured: ${metrics.length}`);
    console.log(`Total time: ${(total / 1000).toFixed(2)}s`);
    console.log(`Average operation time: ${avg.toFixed(2)}ms`);
    console.log(`Slow operations: ${slow.length}/${metrics.length}`);
    
    if (slow.length > 0) {
      console.log('\nSLOW OPERATIONS:');
      slow.forEach((m) => {
        const diff = m.threshold ? m.duration - m.threshold : 0;
        console.log(`  - ${m.name}: ${diff.toFixed(2)}${m.unit} over threshold`);
      });
    }
    
    console.log('\n=========================\n');
  });

  test('app cold start performance', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    
    // Wait for app to be interactive
    await page.waitForLoadState('domcontentloaded');
    const domReadyTime = Date.now() - startTime;
    recordMetric('DOM Content Loaded', domReadyTime, 'cold-start', 2000);
    
    await page.waitForLoadState('networkidle');
    const networkIdleTime = Date.now() - startTime;
    recordMetric('Network Idle', networkIdleTime, 'cold-start', 5000);
    
    // Wait for React to mount
    const appRoot = page.locator('#root').first();
    await appRoot.waitFor({ state: 'attached' });
    const reactMountTime = Date.now() - startTime;
    recordMetric('React Mount', reactMountTime, 'cold-start', 1000);
    
    // Wait for welcome dialog or main UI
    const welcomeDialog = page.locator('[role="dialog"]').first();
    const mainContent = page.locator('main, .app-content, #root > div').first();
    
    await Promise.race([
      welcomeDialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null),
      mainContent.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null)
    ]);
    
    const interactiveTime = Date.now() - startTime;
    recordMetric('Time to Interactive', interactiveTime, 'cold-start', 3000);
    
    console.log('✅ Cold start performance measured');
  });

  test('IndexedDB hydration performance', async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    
    // Pre-populate IndexedDB with large dataset
    const populateStart = Date.now();
    await page.evaluate(() => {
      return new Promise((resolve) => {
        const request = indexedDB.open('cinematic-story-db', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('misc', 'readwrite');
          const store = tx.objectStore('misc');
          
          // Create large story bible
          const largeStoryBible = {
            logline: 'A' + 'long story '.repeat(50),
            characters: 'B' + 'character description '.repeat(100),
            setting: 'C' + 'setting details '.repeat(100),
            plotOutline: 'D' + 'plot point '.repeat(200),
            heroArcs: Array(12).fill(null).map((_, i) => ({
              id: `arc-${i}`,
              name: `Arc ${i}`,
              summary: 'Summary '.repeat(20),
              emotionalShift: 'Shift '.repeat(10),
              importance: 5
            }))
          };
          
          // Create many scenes
          const scenes = Array(10).fill(null).map((_, i) => ({
            id: `scene-${i}`,
            title: `Scene ${i}`,
            summary: 'Summary '.repeat(50),
            timeline: {
              shots: Array(5).fill(null).map((_, j) => ({
                id: `shot-${i}-${j}`,
                number: j + 1,
                description: 'Description '.repeat(20),
                duration: 5,
                cameraAngle: 'wide',
                movement: 'static'
              })),
              shotEnhancers: {},
              transitions: [],
              negativePrompt: 'low quality'
            }
          }));
          
          store.put(largeStoryBible, 'storyBible');
          store.put(scenes, 'scenes');
          store.put('director', 'workflowStage');
          
          tx.oncomplete = () => {
            db.close();
            resolve(true);
          };
        };
      });
    });
    
    const populateTime = Date.now() - populateStart;
    recordMetric('Populate IndexedDB (large dataset)', populateTime, 'hydration');
    
    // Reload and measure hydration time
    const reloadStart = Date.now();
    await page.reload();
    
    await page.waitForLoadState('networkidle');
    const hydrationTime = Date.now() - reloadStart;
    recordMetric('IndexedDB Hydration (10 scenes, 50 shots)', hydrationTime, 'hydration', 3000);
    
    console.log('✅ IndexedDB hydration performance measured');
  });

  test('UI interaction responsiveness', async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
    
    // Measure button click responsiveness
    const buttonClickStart = Date.now();
    const testButton = page.locator('button').first();
    await testButton.click();
    const buttonClickTime = Date.now() - buttonClickStart;
    recordMetric('Button Click Response', buttonClickTime, 'ui', 100);
    
    // Measure textarea input lag
    const inputLagStart = Date.now();
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible({ timeout: 2000 })) {
      await textarea.fill('Test input for performance measurement');
      const inputLagTime = Date.now() - inputLagStart;
      recordMetric('Textarea Input Lag', inputLagTime, 'ui', 500);
    }
    
    // Measure scroll performance
    const scrollStart = Date.now();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(100); // Let scroll complete
    const scrollTime = Date.now() - scrollStart;
    recordMetric('Scroll to Bottom', scrollTime, 'ui', 200);
    
    console.log('✅ UI responsiveness measured');
  });

  test('LLM generation performance (mocked)', async ({ page }) => {
    // Mock LLM endpoint with timing simulation
    await page.route('**/api/local-llm', async (route) => {
      const delay = 2000; // Simulate 2s LLM response
      await new Promise((resolve) => setTimeout(resolve, delay));
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                logline: 'Test story',
                characters: 'Test characters',
                setting: 'Test setting',
                plotOutline: 'Test plot',
                heroArcs: Array(12).fill(null).map((_, i) => ({
                  id: `arc-${i}`,
                  name: `Arc ${i}`,
                  summary: 'Test summary',
                  emotionalShift: 'Test shift',
                  importance: 5
                }))
              })
            }
          }]
        })
      });
    });
    
    await page.goto('/');
    await dismissWelcomeDialog(page);
    await ensureDirectorMode(page);
    
    // Measure story generation time
    const ideaTextarea = page.locator('textarea[aria-label="Story Idea"]');
    if (await ideaTextarea.isVisible({ timeout: 5000 })) {
      await ideaTextarea.fill('Performance test story');
      
      const generateStart = Date.now();
      const generateButton = page.locator('button:has-text("Generate")').first();
      await generateButton.click();
      
      // Wait for generation to complete (mock takes 2s)
      await page.waitForTimeout(2500);
      const generateTime = Date.now() - generateStart;
      recordMetric('Story Generation (mocked LLM)', generateTime, 'llm', 5000);
    }
    
    console.log('✅ LLM generation performance measured');
  });

  test('ComfyUI generation performance (mocked)', async ({ page }) => {
    // Mock ComfyUI endpoints
    await page.route('**/prompt', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms processing
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          prompt_id: 'mock-' + Date.now(),
          number: 1,
          node_errors: {}
        })
      });
    });
    
    await page.route('**/history**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 1s generation
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          'mock-123': {
            outputs: {
              '9': {
                images: [{
                  filename: 'test.png',
                  data: 'mock-base64-data'
                }]
              }
            }
          }
        })
      });
    });
    
    await page.goto('/');
    await dismissWelcomeDialog(page);
    
    // Load project with scene
    await loadProjectState(page, {
      storyBible: mockStoryBible,
      scenes: [{
        id: 'perf-test-scene',
        title: 'Performance Test',
        summary: 'Test scene',
        timeline: {
          shots: [{
            id: 'shot-1',
            number: 1,
            description: 'Test shot',
            duration: 5,
            cameraAngle: 'wide' as const,
            movement: 'static' as const
          }],
          shotEnhancers: {},
          transitions: [],
          negativePrompt: ''
        }
      }],
      workflowStage: 'director'
    });
    
    await page.reload();
    await page.waitForTimeout(1000);
    
    // Measure keyframe generation time
    const generateButton = page.locator('button:has-text("Generate"), button:has-text("Keyframe")').first();
    if (await generateButton.isVisible({ timeout: 5000 })) {
      const generateStart = Date.now();
      await generateButton.click();
      
      // Wait for mock generation (1.5s total)
      await page.waitForTimeout(2000);
      const generateTime = Date.now() - generateStart;
      recordMetric('Keyframe Generation (mocked ComfyUI)', generateTime, 'comfyui', 10000);
    }
    
    console.log('✅ ComfyUI generation performance measured');
  });

  test('parallel operations performance', async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    
    // Measure multiple concurrent IndexedDB operations
    const parallelStart = Date.now();
    
    await page.evaluate(() => {
      return Promise.all([
        // Operation 1: Write story bible
        new Promise((resolve) => {
          const request = indexedDB.open('cinematic-story-db', 1);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('misc', 'readwrite');
            tx.objectStore('misc').put({ test: 'data1' }, 'key1');
            tx.oncomplete = () => {
              db.close();
              resolve(true);
            };
          };
        }),
        // Operation 2: Write scenes
        new Promise((resolve) => {
          const request = indexedDB.open('cinematic-story-db', 1);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('misc', 'readwrite');
            tx.objectStore('misc').put({ test: 'data2' }, 'key2');
            tx.oncomplete = () => {
              db.close();
              resolve(true);
            };
          };
        }),
        // Operation 3: Write images
        new Promise((resolve) => {
          const request = indexedDB.open('cinematic-story-db', 1);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('misc', 'readwrite');
            tx.objectStore('misc').put({ test: 'data3' }, 'key3');
            tx.oncomplete = () => {
              db.close();
              resolve(true);
            };
          };
        })
      ]);
    });
    
    const parallelTime = Date.now() - parallelStart;
    recordMetric('3 Parallel IndexedDB Writes', parallelTime, 'hydration', 1000);
    
    console.log('✅ Parallel operations performance measured');
  });

  test('memory usage estimation', async ({ page }) => {
    await page.goto('/');
    await dismissWelcomeDialog(page);
    
    // Measure memory before large operation
    const memoryBefore = await page.evaluate(() => {
      if (performance.memory) {
        return {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize
        };
      }
      return null;
    });
    
    // Load large dataset
    await loadProjectState(page, {
      storyBible: mockStoryBible,
      scenes: Array(50).fill(null).map((_, i) => ({
        id: `scene-${i}`,
        title: `Scene ${i}`,
        summary: 'Summary '.repeat(50),
        timeline: {
          shots: Array(10).fill(null).map((_, j) => ({
            id: `shot-${i}-${j}`,
            number: j + 1,
            description: 'Description '.repeat(20),
            duration: 5,
            cameraAngle: 'wide' as const,
            movement: 'static' as const
          })),
          shotEnhancers: {},
          transitions: [],
          negativePrompt: ''
        }
      })),
      workflowStage: 'director'
    });
    
    await page.waitForTimeout(2000);
    
    // Measure memory after
    const memoryAfter = await page.evaluate(() => {
      if (performance.memory) {
        return {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize
        };
      }
      return null;
    });
    
    if (memoryBefore && memoryAfter) {
      const memoryIncrease = (memoryAfter.usedJSHeapSize - memoryBefore.usedJSHeapSize) / 1024 / 1024;
      console.log(`[Perf] Memory increase for 50 scenes: ${memoryIncrease.toFixed(2)} MB`);
      console.log(`[Perf] Total JS heap: ${(memoryAfter.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
      
      if (memoryIncrease > 50) {
        console.log('⚠️ High memory usage detected - consider optimization');
      } else {
        console.log('✅ Memory usage within acceptable range');
      }
    } else {
      console.log('⚠️ Performance.memory API not available (Chromium flag required)');
    }
  });
});
