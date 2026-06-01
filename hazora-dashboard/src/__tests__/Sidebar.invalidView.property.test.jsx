import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import Sidebar from '../components/Sidebar';

/**
 * Property 5: Invalid View Fallback
 *
 * For any string value that is not "streams" or "reports", the Sidebar SHALL
 * default the ActiveView to "streams", ensuring the navigation state is always
 * valid. The "Live Streams" button should have the "active" class when an
 * invalid activeView is provided.
 *
 * **Validates: Requirements 2.5**
 */
describe('Sidebar - Property 5: Invalid View Fallback', () => {
  it('any string not "streams" or "reports" defaults to highlighting "Live Streams" as active', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => s !== 'streams' && s !== 'reports'),
        (invalidView) => {
          cleanup();

          const { getByRole } = render(
            <Sidebar activeView={invalidView} onViewChange={() => {}} />
          );

          const nav = getByRole('navigation');
          const buttons = nav.querySelectorAll('.sidebar-nav-btn');

          // The "Live Streams" button (first item) should have the "active" class
          expect(buttons[0].classList.contains('active')).toBe(true);

          // The "Reports" button (second item) should NOT have the "active" class
          expect(buttons[1].classList.contains('active')).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
