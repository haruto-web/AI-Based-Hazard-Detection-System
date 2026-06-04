import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import Sidebar from '../components/Sidebar';

/**
 * Property 5: Invalid View Fallback
 *
 * For any string value that is not "dashboard", "streams", or "reports", the
 * Sidebar SHALL default the ActiveView to "dashboard", ensuring the navigation
 * state is always valid. The "Dashboard" button should have the "active" class
 * when an invalid activeView is provided.
 *
 * **Validates: Requirements 2.5**
 */
describe('Sidebar - Property 5: Invalid View Fallback', () => {
  it('any string not "dashboard", "streams", or "reports" defaults to highlighting "Dashboard" as active', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => s !== 'dashboard' && s !== 'streams' && s !== 'reports'),
        (invalidView) => {
          cleanup();

          const { getByRole } = render(
            <Sidebar activeView={invalidView} onViewChange={() => {}} />
          );

          const nav = getByRole('navigation');
          const buttons = nav.querySelectorAll('.sidebar-nav-btn');

          // The "Dashboard" button (first item) should have the "active" class
          expect(buttons[0].classList.contains('active')).toBe(true);

          // Other buttons should NOT have the "active" class
          expect(buttons[1].classList.contains('active')).toBe(false);
          expect(buttons[2].classList.contains('active')).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
