import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendHazardEmailTest } from '../utils/hazardEmail';

vi.mock('../firebase', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn().mockResolvedValue('test-id-token'),
    },
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('hazard email test', () => {
  it('submits a test request only for the authenticated verified user email', async () => {
    vi.stubEnv('VITE_HAZARD_EMAIL_ENDPOINT', 'https://alerts.example.test/send');
    const fetch = vi.fn().mockResolvedValue({ type: 'opaque' });
    vi.stubGlobal('fetch', fetch);

    const result = await sendHazardEmailTest({
      uid: 'user-1',
      email: 'user@example.com',
      emailVerified: true,
    });

    expect(result).toEqual({ sent: true, reason: 'request_submitted' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      action: 'test_hazard_email',
      testRecipient: 'user@example.com',
      idToken: 'test-id-token',
    });
  });

  it('does not submit a test request for an unverified account', async () => {
    vi.stubEnv('VITE_HAZARD_EMAIL_ENDPOINT', 'https://alerts.example.test/send');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const result = await sendHazardEmailTest({
      uid: 'user-1',
      email: 'user@example.com',
      emailVerified: false,
    });

    expect(result).toEqual({ sent: false, reason: 'email_not_verified' });
    expect(fetch).not.toHaveBeenCalled();
  });
});