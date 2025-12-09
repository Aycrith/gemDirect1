import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// P2.5: Enable fake-indexeddb for test mocking
// This provides a proper IndexedDB implementation in the test environment,
// avoiding "security context" errors when tests try to use IndexedDB.
import 'fake-indexeddb/auto';

// Ensure cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia for components that use it (only in browser-like environments)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
