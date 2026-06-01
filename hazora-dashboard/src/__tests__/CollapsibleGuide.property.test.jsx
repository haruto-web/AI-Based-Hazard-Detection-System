import { describe, it, expect } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import CollapsibleGuide from '../components/CollapsibleGuide';

/**
 * Property 4: Toggle Inversion with Accessibility State Consistency
 *
 * For any CollapsibleGuide in state isOpen, clicking the header SHALL result
 * in isOpen being negated. Additionally, the aria-expanded attribute SHALL
 * always equal the current isOpen state, and the chevron indicator SHALL
 * reflect the current state.
 *
 * **Validates: Requirements 4.1, 4.3, 4.4, 4.6**
 */
describe('CollapsibleGuide - Property 4: Toggle Inversion with Accessibility State Consistency', () => {
  it('toggling twice returns to original state, and aria-expanded always matches isOpen', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.nat({ max: 10 }),
        (defaultOpen, toggleCount) => {
          cleanup();

          const { getByRole } = render(
            <CollapsibleGuide title="Test Guide" defaultOpen={defaultOpen}>
              <p>Guide content</p>
            </CollapsibleGuide>
          );

          const button = getByRole('button');

          // Perform the generated number of toggle clicks
          for (let i = 0; i < toggleCount; i++) {
            fireEvent.click(button);
          }

          // Determine expected state after toggleCount clicks
          const expectedOpen = toggleCount % 2 === 0 ? defaultOpen : !defaultOpen;

          // Assert aria-expanded matches the current isOpen state
          expect(button.getAttribute('aria-expanded')).toBe(String(expectedOpen));

          // Assert chevron indicator reflects the current state
          const chevron = button.querySelector('.chevron');
          if (expectedOpen) {
            expect(chevron.textContent).toBe('▼');
          } else {
            expect(chevron.textContent).toBe('▶');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
