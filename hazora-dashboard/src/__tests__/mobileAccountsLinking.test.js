import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MobileAccountsPage from '../components/MobileAccountsPage.jsx';

const { getDocs } = vi.hoisted(() => ({
  getDocs: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  getDocs,
  limit: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
}));

vi.mock('../firebase', () => ({
  db: {},
}));

describe('mobile accounts page', () => {
  let container;
  let root;

  beforeEach(() => {
    getDocs.mockReset();
    getDocs.mockResolvedValue({
      docs: [{
        id: 'account-1',
        data: () => ({
          name: 'Josh',
          role: 'Site/Safety Engineer',
          username: 'MOB-005',
          email: 'josh@example.com',
          mobileSetupStatus: 'setup_required',
        }),
      }],
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('lists mobile accounts without offering manual account creation', async () => {
    await act(async () => {
      root.render(createElement(MobileAccountsPage, { userRole: 'HSE Head - Head Office' }));
    });

    expect(container.textContent).toContain('Josh');
    expect(container.textContent).toContain('josh@example.com');
    expect(container.textContent).toContain('Setup required');
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).not.toContain('Name of Account/User');
  });
});
