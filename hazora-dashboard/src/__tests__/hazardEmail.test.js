import { describe, expect, it } from 'vitest';
import { HAZARD_EMAIL_COOLDOWN_MS, isHazardEmailCooldownActive, sendHazardEmail } from '../utils/hazardEmail';

describe('hazard email cooldown', () => {
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

  it('does not send email to an unverified account', async () => {
    const result = await sendHazardEmail({
      user: { uid: 'user-1', email: 'user@example.com', emailVerified: false },
      hazardType: 'Missing helmet',
      site: 'Site A',
      cameraSource: '192.168.1.10',
      severity: 'high',
    });

    expect(result).toEqual({ sent: false, reason: 'email_not_verified' });
  });
});