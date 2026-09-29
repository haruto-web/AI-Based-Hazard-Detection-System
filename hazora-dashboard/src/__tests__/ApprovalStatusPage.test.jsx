import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ApprovalStatusPage from '../components/ApprovalStatusPage';

describe('ApprovalStatusPage', () => {
  it('tells pending users to wait for admin verification', () => {
    const markup = renderToStaticMarkup(
      <ApprovalStatusPage status="pending" email="new.user@example.com" onSignOut={vi.fn()} />,
    );

    expect(markup).toContain('Waiting for admin verification');
    expect(markup).toContain('must verify your account and assign your role');
    expect(markup).toContain('new.user@example.com');
  });

  it('renders an account sign-out action', () => {
    const markup = renderToStaticMarkup(
      <ApprovalStatusPage status="pending" onSignOut={vi.fn()} />,
    );

    expect(markup).toContain('Sign out');
  });
});