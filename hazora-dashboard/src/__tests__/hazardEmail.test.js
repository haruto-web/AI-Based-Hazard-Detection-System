import { afterEach, describe, expect, it, vi } from 'vitest';
import { HAZARD_EMAIL_COOLDOWN_MS, isHazardEmailCooldownActive, sendHazardEmail } from '../utils/hazardEmail';

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

describe('hazard email cooldown', () => {
  it('uses a two-second repeat interval', () => {
    expect(HAZARD_EMAIL_COOLDOWN_MS).toBe(2 * 1000);
  });

  it('suppresses another alert inside the cooldown window', () => {
    const now = 1_000_000;
    expect(isHazardEmailCooldownActive(now - HAZARD_EMAIL_COOLDOWN_MS + 1, now)).toBe(true);
  });

  it('allows an alert when the cooldown has elapsed', () => {
    const now = 1_000_000;
    expect(isHazardEmailCooldownActive(now - HAZARD_EMAIL_COOLDOWN_MS, now)).toBe(false);
  });

  it('does not treat missing or invalid timestamps as an active cooldown', () => {
    expect(isHazardEmailCooldownActive(null, 1_000_000)).toBe(false);
    expect(isHazardEmailCooldownActive('invalid', 1_000_000)).toBe(false);
  });

  it('submits an alert for the authenticated detector regardless of its email verification state', async () => {
    vi.stubEnv('VITE_HAZARD_EMAIL_ENDPOINT', 'https://alerts.example.test/send');
    const fetch = vi.fn().mockResolvedValue({ type: 'opaque' });
    vi.stubGlobal('fetch', fetch);

    const result = await sendHazardEmail({
      user: { uid: 'user-1', email: 'user@example.com', emailVerified: false },
      hazardType: 'Missing helmet',
      site: 'Site A',
      cameraSource: '192.168.1.10',
      severity: 'high',
    });

    expect(result).toEqual({ sent: true, reason: 'request_submitted' });
    expect(fetch).toHaveBeenCalledWith('https://alerts.example.test/send', expect.objectContaining({
      method: 'POST',
      mode: 'no-cors',
      body: expect.stringContaining('"idToken":"test-id-token"'),
    }));
  });

  it('reports a missing email endpoint instead of claiming the alert was sent', async () => {
    vi.stubEnv('VITE_HAZARD_EMAIL_ENDPOINT', '');

    const result = await sendHazardEmail({
      user: { uid: 'user-1' },
      hazardType: 'Missing helmet',
      site: 'Site A',
      cameraSource: '192.168.1.10',
      severity: 'high',
    });

    expect(result).toEqual({ sent: false, reason: 'email_not_configured' });
  });
});