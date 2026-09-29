import { describe, expect, it } from 'vitest';
import { messageMatchesEmail, normalizeMessageRecipient } from '../utils/messageRecipients';

describe('message recipient matching', () => {
  it('normalizes email casing and surrounding whitespace', () => {
    expect(normalizeMessageRecipient('  Site.User@Example.com ')).toBe('site.user@example.com');
  });

  it('matches the normalized recipientSearch field', () => {
    expect(messageMatchesEmail({ recipientSearch: 'site.user@example.com' }, 'Site.User@Example.com')).toBe(true);
  });

  it('matches legacy records by recipient email', () => {
    expect(messageMatchesEmail({ recipient: 'SITE.USER@example.com' }, 'site.user@example.com')).toBe(true);
  });

  it('does not match an unrelated recipient or a missing email', () => {
    expect(messageMatchesEmail({ recipientSearch: 'other@example.com' }, 'site.user@example.com')).toBe(false);
    expect(messageMatchesEmail({ recipient: 'site.user@example.com' }, '')).toBe(false);
  });
});