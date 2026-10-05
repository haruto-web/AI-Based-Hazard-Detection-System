import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ApprovalStatusPage from '../components/ApprovalStatusPage';

describe('ApprovalStatusPage', () => {
  it('explains email verification and shared mobile access while pending approval', () => {
    const markup = renderToStaticMarkup(
      <ApprovalStatusPage status="pending" email="new.user@example.com" onSignOut={vi.fn()} />,
    );

    expect(markup).toContain('Waiting for admin verification');
    expect(markup).toContain('inbox and spam/junk folder');
    expect(markup).toContain('click its verification link');
    expect(markup).toContain('same verified email and password in the mobile app');
    expect(markup).toContain('new.user@example.com');
  });

  it('renders an account sign-out action', () => {
    const markup = renderToStaticMarkup(
      <ApprovalStatusPage status="pending" onSignOut={vi.fn()} />,
    );

    expect(markup).toContain('Sign out');
  });
});