// Configure Script Properties: FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID,
// FIRESTORE_DATABASE_ID, and HAZORA_DASHBOARD_URL.
const HAZARD_EMAIL_COOLDOWN_MS = 60 * 1000;
const HAZARD_EMAIL_ROLES = [
  'Site Safety Officer',
  'Site Safety Practitioner',
  'Site Project Engineer',
  'Site Construction Manager',
  'Safety Engineer - Head Office',
  'Safety Manager - Head Office',
  'HSE Head - Head Office',
];

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
      const now = Date.now();
      const projectId = properties.getProperty('FIREBASE_PROJECT_ID');
      const databaseId = properties.getProperty('FIRESTORE_DATABASE_ID') || 'hazora';
      if (!projectId) throw new Error('FIREBASE_PROJECT_ID script property is missing');
      const accessToken = ScriptApp.getOAuthToken();
      const recipients = getVerifiedRoleRecipients(projectId, databaseId, accessToken);
      if (!recipients.some((recipient) => recipient.uid === user.localId)) {
        return jsonResponse({ ok: false, sent: false, reason: 'approved_role_required' });
      }

      const hazardType = safeText(payload.hazardType, 'Possible PPE hazard', 100);
      const severity = safeText(payload.severity, 'Not specified', 40);
      const site = safeText(payload.site, 'Site location not set', 120);
      const cameraSource = safeText(payload.cameraSource, 'Camera not specified', 120);
      const dashboardUrl = properties.getProperty('HAZORA_DASHBOARD_URL');
      const subject = `HAZORA alert: ${hazardType}`.slice(0, 150);
      let sentCount = 0;
      let cooldownCount = 0;
      let failedCount = 0;

      recipients.forEach((recipient) => {
        const cooldownKey = `hazard_email_last_sent_${recipient.uid}`;
        const lastSentAt = Number(properties.getProperty(cooldownKey)) || 0;
        if (lastSentAt > 0 && now - lastSentAt < HAZARD_EMAIL_COOLDOWN_MS) {
          cooldownCount += 1;
          return;
        }

        const body = [
          `Hello${recipient.displayName ? ` ${safeText(recipient.displayName, '', 80)}` : ''},`,
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
          'This is a reminder only. HAZORA limits hazard email alerts to one message per account every minute.',
        ].join('\n');

        try {
          GmailApp.sendEmail(recipient.email, subject, body, { name: 'HAZORA Safety Alerts' });
          properties.setProperty(cooldownKey, String(now));
          sentCount += 1;
        } catch (error) {
          console.error(`Could not send hazard email to ${recipient.uid}: ${error.message}`);
          failedCount += 1;
        }
      });

      return jsonResponse({
        ok: true,
        sent: sentCount > 0,
        sentCount,
        failedCount,
        recipientCount: recipients.length,
        reason: sentCount > 0 ? 'sent' : cooldownCount > 0 ? 'cooldown' : 'no_eligible_recipients',
      });
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

function getVerifiedRoleRecipients(projectId, databaseId, accessToken) {
  const approvedRoles = new Set(HAZARD_EMAIL_ROLES);
  const approvedUsers = new Map();
  let firestorePageToken = '';

  do {
    const query = [`pageSize=1000`, firestorePageToken && `pageToken=${encodeURIComponent(firestorePageToken)}`]
      .filter(Boolean)
      .join('&');
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
      `/databases/${encodeURIComponent(databaseId)}/documents/users?${query}`;
    const response = UrlFetchApp.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() !== 200) {
      throw new Error(`Could not list user profiles: ${response.getContentText()}`);
    }

    const page = JSON.parse(response.getContentText());
    (page.documents || []).forEach((document) => {
      const fields = document.fields || {};
      const role = fields.role?.stringValue;
      if (fields.approvalStatus?.stringValue !== 'approved' || !approvedRoles.has(role)) return;

      const uid = document.name.split('/').pop();
      approvedUsers.set(uid, {
        uid,
        role,
        displayName: fields.fullName?.stringValue || '',
      });
    });
    firestorePageToken = page.nextPageToken || '';
  } while (firestorePageToken);

  const verifiedRecipients = [];
  let authPageToken = '';
  do {
    const query = [`maxResults=1000`, authPageToken && `nextPageToken=${encodeURIComponent(authPageToken)}`]
      .filter(Boolean)
      .join('&');
    const url = `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
      `/accounts:batchGet?${query}`;
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: '{}',
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() !== 200) {
      throw new Error(`Could not list Firebase Auth users: ${response.getContentText()}`);
    }

    const page = JSON.parse(response.getContentText());
    (page.users || []).forEach((account) => {
      const profile = approvedUsers.get(account.localId);
      if (!profile || !account.emailVerified || !account.email) return;

      verifiedRecipients.push({
        ...profile,
        email: account.email,
        displayName: account.displayName || profile.displayName,
      });
    });
    authPageToken = page.nextPageToken || '';
  } while (authPageToken);

  return verifiedRecipients;
}