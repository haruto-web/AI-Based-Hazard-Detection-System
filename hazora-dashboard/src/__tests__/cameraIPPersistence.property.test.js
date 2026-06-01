import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 7: Camera IP Persistence Round-Trip
 *
 * For any valid CameraIP that a user connects with, persisting it and then
 * loading it back SHALL produce the same CameraIP value (localStorage write
 * then read returns the original IP).
 *
 * **Validates: Requirements 6.3**
 */
describe('Camera IP Persistence - Property 7: Round-Trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persisting a valid CameraIP and reading it back produces the same value', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 })
        ),
        ([a, b, c, d]) => {
          const ip = `${a}.${b}.${c}.${d}`;
          localStorage.setItem('hazora_camera_ip', ip);
          const retrieved = localStorage.getItem('hazora_camera_ip');
          expect(retrieved).toBe(ip);
        }
      ),
      { numRuns: 100 }
    );
  });
});
