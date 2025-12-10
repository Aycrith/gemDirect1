// @ts-nocheck
import { test, expect } from '@playwright/test';
import fs from 'fs';

test.describe('Pipeline Success', () => {
  test('should successfully complete export pipeline', async ({ page }) => {
    // 1. Mock ComfyUI HTTP Endpoints
    await page.route('**/prompt', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ prompt_id: 'mock-prompt-id' })
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/history/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          'mock-prompt-id': {
            status: { completed: true },
            outputs: {
              '9': {
                images: [{ filename: 'mock_image.png', subfolder: '', type: 'output' }]
              },
              '10': {
                videos: [{ filename: 'mock_video.mp4', subfolder: '', type: 'output' }]
              }
            }
          }
        })
      });
    });

    await page.route('**/view?*', async route => {
        // Return a 1x1 pixel transparent PNG
        const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        await route.fulfill({
            status: 200,
            contentType: 'image/png',
            body: pngBuffer
        });
    });

    // 2. Mock WebSocket
    await page.addInitScript(() => {
      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSING = 2;
        static CLOSED = 3;

        constructor(url) {
          this.url = url;
          this.readyState = MockWebSocket.CONNECTING;
          this.onopen = null;
          this.onmessage = null;
          this.onclose = null;
          this.onerror = null;

          setTimeout(() => {
            this.readyState = MockWebSocket.OPEN;
            if (this.onopen) this.onopen({ type: 'open' });
            
            // Simulate keep-alive or status
            setInterval(() => {
                if (this.onmessage) {
                    this.onmessage({ 
                        data: JSON.stringify({ type: 'status', data: { status: {}, sid: 'mock-client' } }) 
                    });
                }
            }, 1000);
          }, 50);
          
          // Listen for prompt queueing (which happens via HTTP, but we simulate the WS response sequence)
          // We'll use a global event or just trigger it periodically if we see a prompt_id
          // For simplicity, we'll just trigger success for 'mock-prompt-id' after a delay
          // whenever a new instance is created, assuming the app connects once.
          
          setTimeout(() => {
             this.simulateExecution('mock-prompt-id');
          }, 2000);
        }

        send(data) {
          console.log('MockWebSocket send:', data);
        }

        close() {
          this.readyState = MockWebSocket.CLOSED;
          if (this.onclose) this.onclose({ type: 'close' });
        }
        
        simulateExecution(promptId) {
            if (!this.onmessage) return;
            
            // 1. Execution Start
            this.onmessage({
                data: JSON.stringify({
                    type: 'execution_start',
                    data: { prompt_id: promptId }
                })
            });
            
            // 2. Executing (simulate a few nodes)
            setTimeout(() => {
                this.onmessage({
                    data: JSON.stringify({
                        type: 'executing',
                        data: { prompt_id: promptId, node: '3' }
                    })
                });
            }, 500);

            // 3. Executed (Success)
            setTimeout(() => {
                this.onmessage({
                    data: JSON.stringify({
                        type: 'executed',
                        data: { 
                            prompt_id: promptId,
                            output: {
                                '9': {
                                    images: [{ filename: 'mock_image.png', subfolder: '', type: 'output' }]
                                },
                                '10': {
                                    videos: [{ filename: 'mock_video.mp4', subfolder: '', type: 'output' }]
                                }
                            }
                        }
                    })
                });
            }, 1500);
        }
      }
      (window as any).WebSocket = MockWebSocket;
    });

    // 3. Navigate and Inject
    await page.goto('/');
    
    const injectionScript = fs.readFileSync('injection_script.js', 'utf8');
    await page.evaluate(`(${injectionScript})()`);
    
    const storyInjectionScript = fs.readFileSync('tests/e2e/fixtures/inject-story.js', 'utf8');
    await page.evaluate(`(${storyInjectionScript})()`);

    await page.reload();
    
    // 4. Verify UI and Start Export
    await expect(page.getByText('Continuity Director')).toBeVisible();
    const exportButton = page.getByRole('button', { name: /Export All Scenes/i });
    await expect(exportButton).toBeVisible();
    
    await exportButton.click();

    // 5. Verify Pipeline Active
    await expect(page.getByText('Pipeline Active...')).toBeVisible();

    // 6. Verify Completion
    // The mock WS sends 'executed' after ~2s + 1.5s = 3.5s.
    // The pipeline should complete and the button should revert.
    await expect(page.getByRole('button', { name: /Export All Scenes/i })).toBeVisible({ timeout: 10000 });
    
    // Verify start toast was shown (we can't easily verify completion toast as it might not exist yet)
    await expect(page.getByText('Export pipeline started')).toBeVisible();
  });
});
