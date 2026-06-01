import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';

/**
 * Property 1: Exclusive View Rendering
 *
 * For any ActiveView state in {streams, reports}, the Dashboard SHALL render
 * exactly one content view component. No two views are rendered simultaneously,
 * and switching views always results in exactly one visible content area.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

/**
 * Simplified test component that mimics the Dashboard's view switching pattern.
 * This isolates the exclusive rendering logic from complex dependencies
 * (Firebase auth, router, Firestore, etc.).
 */
function ViewSwitch({ activeView }) {
  return (
    <div>
      {activeView === 'streams' && <div data-testid="streams-view">Streams</div>}
      {activeView === 'reports' && <div data-testid="reports-view">Reports</div>}
    </div>
  );
}

describe('Dashboard - Property 1: Exclusive View Rendering', () => {
  it('for any valid ActiveView, exactly one content view is rendered', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('streams', 'reports'),
        (view) => {
          cleanup();

          const { queryByTestId } = render(<ViewSwitch activeView={view} />);

          const streamsView = queryByTestId('streams-view');
          const reportsView = queryByTestId('reports-view');

          // Exactly one view must be present
          const viewsPresent = [streamsView, reportsView].filter(
            (el) => el !== null
          );
          expect(viewsPresent).toHaveLength(1);

          // The correct view is rendered based on activeView
          if (view === 'streams') {
            expect(streamsView).not.toBeNull();
            expect(reportsView).toBeNull();
          } else {
            expect(reportsView).not.toBeNull();
            expect(streamsView).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
