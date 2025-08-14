import { describe, it, expect } from '@jest/globals';

describe('Simple Test', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });
  
  it('should work with strings', () => {
    expect('hello world').toContain('world');
  });
});
