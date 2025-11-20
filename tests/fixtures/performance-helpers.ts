import { Page } from '@playwright/test';

export interface PerformanceMetrics {
  pageLoad?: number;
  keyframeGeneration?: number;
  videoGeneration?: number;
  timestamp: string;
}

/**
 * Capture page load performance metrics using Navigation Timing API
 */
export async function capturePageLoadMetrics(page: Page): Promise<number> {
  const timing = await page.evaluate(() => {
    const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (!perf) return 0;
    return perf.loadEventEnd - perf.fetchStart;
  });
  return Math.round(timing);
}

/**
 * Start timing an operation
 */
export async function startTiming(page: Page, label: string): Promise<void> {
  await page.evaluate((lbl) => {
    (window as any).__perfTimings = (window as any).__perfTimings || {};
    (window as any).__perfTimings[lbl] = performance.now();
  }, label);
}

/**
 * End timing and return duration in milliseconds
 */
export async function endTiming(page: Page, label: string): Promise<number> {
  const duration = await page.evaluate((lbl) => {
    const timings = (window as any).__perfTimings || {};
    const start = timings[lbl];
    if (!start) return 0;
    const end = performance.now();
    delete timings[lbl];
    return end - start;
  }, label);
  return Math.round(duration);
}

/**
 * Capture timing for a button click operation
 */
export async function timeButtonClick(
  page: Page,
  buttonSelector: string,
  successIndicatorSelector: string,
  label: string,
  options?: { timeout?: number }
): Promise<number> {
  await startTiming(page, label);
  await page.click(buttonSelector);
  await page.waitForSelector(successIndicatorSelector, { timeout: options?.timeout || 60000 });
  return await endTiming(page, label);
}

/**
 * Log performance metrics to console and return formatted string
 */
export function formatMetrics(metrics: PerformanceMetrics): string {
  const lines = [
    `\n📊 Performance Metrics (${metrics.timestamp})`,
    `${'─'.repeat(50)}`
  ];

  if (metrics.pageLoad !== undefined) {
    lines.push(`  Page Load: ${metrics.pageLoad}ms`);
  }
  if (metrics.keyframeGeneration !== undefined) {
    lines.push(`  Keyframe Generation: ${metrics.keyframeGeneration}ms`);
  }
  if (metrics.videoGeneration !== undefined) {
    lines.push(`  Video Generation: ${metrics.videoGeneration}ms`);
  }

  lines.push(`${'─'.repeat(50)}`);
  return lines.join('\n');
}

/**
 * Save metrics to a JSON file
 */
export function saveMetrics(metrics: PerformanceMetrics, testName: string): string {
  const fs = require('fs');
  const path = require('path');
  
  const metricsDir = path.join(process.cwd(), 'test-results', 'performance');
  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${testName}-${timestamp}.json`;
  const filepath = path.join(metricsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(metrics, null, 2));
  
  return filepath;
}
