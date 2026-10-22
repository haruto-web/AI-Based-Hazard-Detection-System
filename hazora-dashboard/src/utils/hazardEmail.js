import { auth } from '../firebase';

async function submitHazardEmail(user, payload) {
  const endpoint = import.meta.env.VITE_HAZARD_EMAIL_ENDPOINT?.trim();

  if (!user?.uid) {
    return { sent: false, reason: 'not_authenticated' };
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
      body: JSON.stringify({ ...payload, idToken }),
    });
  } catch (error) {
    console.warn('Hazard email could not be sent:', error.message);
    return { sent: false, reason: 'send_failed' };
  }

  return { sent: true, reason: 'request_submitted' };
}

export function sendHazardEmailTest(user) {
  if (!user?.email || !user.emailVerified) {
    return Promise.resolve({ sent: false, reason: 'email_not_verified' });
  }

  return submitHazardEmail(user, {
    action: 'test_hazard_email',
    testRecipient: user.email,
  });
}