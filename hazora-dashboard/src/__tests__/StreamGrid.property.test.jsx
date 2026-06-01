import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import * as fc from 'fast-check';
import StreamGrid from '../components/StreamGrid';

/**
 * Property 3: Fixed Stream Count and Deterministic Labels
 *
 * For any rendering of the StreamGrid component, exactly 5 StreamBox
 * components SHALL be rendered, and each StreamBox SHALL have a label
 * matching the pattern "Stream {id}" where id is its sequential
 * position (1 through 5).
 *
 * **Validates: Requirements 1.1, 1.5**
 */
describe('StreamGrid - Property 3: Fixed Stream Count and Deterministic Labels', () => {
  it('always renders exactly 5 StreamBox components regardless of cameraIP value', () => {
    fc.assert(
      fc.property(fc.string(), (cameraIP) => {
        const { container } = render(
          <StreamGrid
            cameraIP={cameraIP}
            isConnecting={false}
            onStatusChange={() => {}}
          />
        );

        const streamBoxes = container.querySelectorAll('.stream-box');
        expect(streamBoxes.length).toBe(5);
      }),
      { numRuns: 100 }
    );
  });

  it('always renders labels "Stream 1" through "Stream 5" regardless of cameraIP value', () => {
    const expectedLabels = ['Stream 1', 'Stream 2', 'Stream 3', 'Stream 4', 'Stream 5'];

    fc.assert(
      fc.property(fc.string(), (cameraIP) => {
        const { container } = render(
          <StreamGrid
            cameraIP={cameraIP}
            isConnecting={false}
            onStatusChange={() => {}}
          />
        );

        const labelElements = container.querySelectorAll('.stream-box-label');
        const labels = Array.from(labelElements).map((el) => el.textContent);

        expect(labels).toEqual(expectedLabels);
      }),
      { numRuns: 100 }
    );
  });

  it('renders exactly 5 StreamBox components with correct labels for arbitrary IPv4 addresses', () => {
    const expectedLabels = ['Stream 1', 'Stream 2', 'Stream 3', 'Stream 4', 'Stream 5'];

    fc.assert(
      fc.property(fc.ipV4(), (cameraIP) => {
        const { container } = render(
          <StreamGrid
            cameraIP={cameraIP}
            isConnecting={false}
            onStatusChange={() => {}}
          />
        );

        const streamBoxes = container.querySelectorAll('.stream-box');
        expect(streamBoxes.length).toBe(5);

        const labelElements = container.querySelectorAll('.stream-box-label');
        const labels = Array.from(labelElements).map((el) => el.textContent);
        expect(labels).toEqual(expectedLabels);
      }),
      { numRuns: 100 }
    );
  });
});
