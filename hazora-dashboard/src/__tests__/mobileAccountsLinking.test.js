import { describe, it, expect } from 'vitest';
import { parseMobileAccountLinkResponse } from '../components/MobileAccountsPage.jsx';

describe('mobile account link response parsing', () => {
  it('returns the failure reason for a rejected link attempt', () => {
    expect(parseMobileAccountLinkResponse({ ok: false, reason: 'hse_head_required' })).toEqual({
      ok: false,
      reason: 'hse_head_required',
    });
  });

  it('keeps successful link metadata intact', () => {
    expect(parseMobileAccountLinkResponse({
      ok: true,
      exists: true,
      emailVerified: true,
      passwordSetupEmailSent: true,
    })).toMatchObject({
      ok: true,
      exists: true,
      emailVerified: true,
      passwordSetupEmailSent: true,
    });
  });
});
