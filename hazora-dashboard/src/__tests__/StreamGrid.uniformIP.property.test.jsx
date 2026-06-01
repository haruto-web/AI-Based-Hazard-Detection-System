import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
import StreamGrid from '../components/StreamGrid';

/**
 * Property 2: Uniform Camera IP
 *
 * For any valid CameraIP value, all 5 StreamBox components in the StreamGrid
 * SHALL receive the same CameraIP prop.
 *
 * **Validates: Requirements 1.3, 1.4**
 */
describe('StreamGrid - Property 2: Uniform Camera IP', () => {
  it('all 5 StreamBox components receive the same cameraIP for any valid IPv4 input', () => {
    fc.assert(
      fc.property(fc.ipV4(), (ip) => {
        const { container } = render(
          <StreamGrid
            cameraIP={ip}
            isConnecting={true}
            onStatusChange={() => {}}
          />
        );

        // When isConnecting is true and cameraIP is provided, each StreamBox
        // renders a hidden img with src="http://{cameraIP}:81/stream"
        const hiddenImgs = container.querySelectorAll('img.stream-box-img-hidden');
        const expectedSrc = `http://${ip}:81/stream`;

        // There should be exactly 5 hidden img elements (one per StreamBox)
        expect(hiddenImgs.length).toBe(5);

        // All 5 should have the same src URL containing the generated IP
        const allSrcsMatch = Array.from(hiddenImgs).every(
          (img) => img.getAttribute('src') === expectedSrc
        );
        expect(allSrcsMatch).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
