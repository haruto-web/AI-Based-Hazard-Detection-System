import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import Sidebar from '../components/Sidebar';

/**
 * Property 8: Sidebar Active Highlight Consistency
 *
 * For any ActiveView state, the Sidebar SHALL visually highlight exactly the
 * navigation item corresponding to that view. The highlighted item always
 * matches the current ActiveView.
 *
 * **Validates: Requirements 2.2, 2.3**
 */
describe('Sidebar - Property 8: Sidebar Active Highlight Consistency', () => {
  it('for any valid view, exactly one navigation button has the .active class and it corresponds to the correct view', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('dashboard', 'streams', 'reports'),
        (activeView) => {
          cleanup();

          const { getByRole } = render(
            <Sidebar activeView={activeView} onViewChange={() => {}} />
          );

          const nav = getByRole('navigation');
          const buttons = nav.querySelectorAll('.sidebar-nav-btn');
          const activeButtons = nav.querySelectorAll('.sidebar-nav-btn.active');

          // Exactly one button should have the .active class
          expect(activeButtons.length).toBe(1);

          // The active button corresponds to the correct view
          // Order: Dashboard (0), Live Streams (1), Reports (2)
          if (activeView === 'dashboard') {
            expect(buttons[0].classList.contains('active')).toBe(true);
            expect(buttons[1].classList.contains('active')).toBe(false);
            expect(buttons[2].classList.contains('active')).toBe(false);
          } else if (activeView === 'streams') {
            expect(buttons[0].classList.contains('active')).toBe(false);
            expect(buttons[1].classList.contains('active')).toBe(true);
            expect(buttons[2].classList.contains('active')).toBe(false);
          } else if (activeView === 'reports') {
            expect(buttons[0].classList.contains('active')).toBe(false);
            expect(buttons[1].classList.contains('active')).toBe(false);
            expect(buttons[2].classList.contains('active')).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
