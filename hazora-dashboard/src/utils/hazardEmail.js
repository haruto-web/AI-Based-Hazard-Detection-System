import { auth } from '../firebase';

export const HAZARD_EMAIL_COOLDOWN_MS = 60 * 1000;

export function isHazardEmailCooldownActive(lastSentAt, now = Date.now()) {
  const timestamp = Number(lastSentAt);
  return Number.isFinite(timestamp) && timestamp > 0 && now - timestamp < HAZARD_EMAIL_COOLDOWN_MS;
}

export async function sendHazardEmail({ user, hazardType, site, cameraSource, severity }) {
  const endpoint = import.meta.env.VITE_HAZARD_EMAIL_ENDPOINT?.trim();

  if (!user?.email || !user.emailVerified) {
    return { sent: false, reason: 'email_not_verified' };
  }
  if (!endpoint) {
    return { sent: false, reason: 'email_not_configured' };
  }

  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) return { sent: false, reason: 'not_authenticated' };

    await fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        idToken,
        hazardType,
        site,
        cameraSource,
        severity,
      }),
    });
  } catch (error) {
    console.warn('Hazard email could not be sent:', error.message);
    return { sent: false, reason: 'send_failed' };
  }

  return { sent: true, reason: 'request_submitted' };
}