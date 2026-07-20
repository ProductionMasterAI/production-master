import { describe, it, expect } from 'vitest';
import { PLUGIN_CORE_VERSION } from './index.js';

describe('plugin-core package', () => {
  it('exposes a version constant', () => {
    expect(PLUGIN_CORE_VERSION).toBe('0.0.0-local');
  });
});
