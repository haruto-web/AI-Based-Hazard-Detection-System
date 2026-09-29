// Configure Script Properties: FIREBASE_WEB_API_KEY and HAZORA_DASHBOARD_URL.
const HAZARD_EMAIL_COOLDOWN_MS = 15 * 60 * 1000;

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    const user = verifyFirebaseUser(payload.idToken);
    if (!user || !user.emailVerified || !user.email) {
      return jsonResponse({ ok: false, reason: 'verified_account_required' });
    }

    const properties = PropertiesService.getScriptProperties();
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const cooldownKey = `hazard_email_last_sent_${user.localId}`;
      const lastSentAt = Number(properties.getProperty(cooldownKey)) || 0;
      const now = Date.now();
      if (lastSentAt > 0 && now - lastSentAt < HAZARD_EMAIL_COOLDOWN_MS) {
        return jsonResponse({ ok: true, sent: false, reason: 'cooldown' });
      }

      const hazardType = safeText(payload.hazardType, 'Possible PPE hazard', 100);
      const severity = safeText(payload.severity, 'Not specified', 40);
      const site = safeText(payload.site, 'Site location not set', 120);
      const cameraSource = safeText(payload.cameraSource, 'Camera not specified', 120);
      const dashboardUrl = properties.getProperty('HAZORA_DASHBOARD_URL');
      const subject = `HAZORA alert: ${hazardType}`.slice(0, 150);
      const body = [
        `Hello${user.displayName ? ` ${safeText(user.displayName, '', 80)}` : ''},`,
        '',
        `HAZORA detected a possible safety hazard: ${hazardType}.`,
        `Severity: ${severity}`,
        `Site: ${site}`,
        `Camera: ${cameraSource}`,
        `Detected: ${new Date(now).toLocaleString()}`,
        '',
        'Please open the HAZORA website or mobile app to review the incident and recommended precautions.',
        ...(dashboardUrl ? [dashboardUrl] : []),
        '',
        'This is a reminder only. HAZORA limits hazard email alerts to one message per account every 15 minutes.',
      ].join('\n');

      GmailApp.sendEmail(user.email, subject, body, { name: 'HAZORA Safety Alerts' });
      properties.setProperty(cooldownKey, String(now));
      return jsonResponse({ ok: true, sent: true });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error(`Hazard email endpoint failed: ${error.message}`);
    return jsonResponse({ ok: false, reason: 'request_failed' });
  }
}

function verifyFirebaseUser(idToken) {
  if (typeof idToken !== 'string' || !idToken) return null;

  const apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_WEB_API_KEY');
  if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY script property is missing');

  const response = UrlFetchApp.fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken }),
      muteHttpExceptions: true,
    },
  );
  if (response.getResponseCode() !== 200) return null;

  const result = JSON.parse(response.getContentText());
  return result.users?.[0] || null;
}

function safeText(value, fallback, maxLength) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength);
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}