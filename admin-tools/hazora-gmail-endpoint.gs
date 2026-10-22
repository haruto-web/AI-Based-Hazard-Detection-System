// Configure Script Properties: FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID,
// FIRESTORE_DATABASE_ID, HAZARD_EMAIL_TRIGGER_SECRET, and HAZORA_DASHBOARD_URL.
// Test requests only email the verified caller; hazard fan-out comes from Functions.
const HAZARD_EMAIL_TEST_COOLDOWN_MS = 60 * 1000;

function doGet(e) {
  return handleRequest({
    parameter: e && e.parameter ? e.parameter : {},
    postData: { contents: '' },
  });
}

function doPost(event) {
  return handleRequest(event || { parameter: {}, postData: { contents: '{}' } });
}

function handleRequest(event) {
  try {
    const parameterPayload = event && event.parameter ? event.parameter : {};
    const postPayload = event && event.postData && event.postData.contents
      ? JSON.parse(event.postData.contents || '{}')
      : {};
    const payload = Object.keys(parameterPayload).length > 0 ? parameterPayload : postPayload;
    const properties = PropertiesService.getScriptProperties();
    if (payload.action === 'incident_created') {
      return handleIncidentCreated(payload, properties);
    }

    const user = verifyFirebaseUser(payload.idToken);
    if (!user || !user.emailVerified || !user.email) {
      return jsonResponse({ ok: false, reason: 'verified_account_required' });
    }

    if (payload.action === 'link_mobile_account') {
      return linkMobileAccount(payload, user, properties);
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const now = Date.now();

      if (payload.action === 'test_hazard_email') {
        const testRecipient = safeText(payload.testRecipient, '', 254).toLowerCase();
        const callerEmail = safeText(user.email, '', 254).toLowerCase();
        if (!callerEmail || testRecipient !== callerEmail) {
          return jsonResponse({ ok: false, sent: false, reason: 'test_recipient_mismatch' });
        }

        const cooldownKey = `hazard_email_test_last_sent_${user.localId}`;
        const lastSentAt = Number(properties.getProperty(cooldownKey)) || 0;
        if (lastSentAt > 0 && now - lastSentAt < HAZARD_EMAIL_TEST_COOLDOWN_MS) {
          return jsonResponse({ ok: false, sent: false, reason: 'cooldown' });
        }

        try {
          GmailApp.sendEmail(
            callerEmail,
            'HAZORA email delivery test',
            [
              'This is a test of HAZORA hazard email delivery.',
              '',
              'No hazard was detected, no incident was created, and no other recipients were contacted.',
              `Requested: ${new Date(now).toLocaleString()}`,
            ].join('\n'),
            { name: 'HAZORA Safety Alerts' },
          );
        } catch (error) {
          console.error(`Could not send hazard email test to ${user.localId}: ${error.message}`);
          return jsonResponse({ ok: false, sent: false, reason: 'send_failed' });
        }
        try {
          properties.setProperty(cooldownKey, String(now));
        } catch (error) {
          console.error(`Test email was sent but its cooldown could not be recorded: ${error.message}`);
        }
        return jsonResponse({ ok: true, sent: true, sentCount: 1, recipientCount: 1, reason: 'sent' });
      }

      return jsonResponse({ ok: false, sent: false, reason: 'server_trigger_required' });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error(`Hazard email endpoint failed: ${error.message}`);
    return jsonResponse({ ok: false, reason: 'request_failed' });
  }
}

function handleIncidentCreated(payload, properties) {
  const configuredSecret = properties.getProperty('HAZARD_EMAIL_TRIGGER_SECRET');
  if (!configuredSecret || payload.triggerSecret !== configuredSecret) {
    return jsonResponse({ ok: false, reason: 'invalid_trigger_secret' });
  }

  const incident = payload.incident;
  const eventId = safeText(payload.eventId, '', 120);
  if (!incident || typeof incident !== 'object' || !eventId ||
      typeof incident.hazardType !== 'string' || !incident.hazardType.trim()) {
    return jsonResponse({ ok: false, reason: 'invalid_incident' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const projectId = properties.getProperty('FIREBASE_PROJECT_ID');
    if (!projectId) throw new Error('FIREBASE_PROJECT_ID script property is missing');
    const recipients = getVerifiedRecipients(projectId, ScriptApp.getOAuthToken());
    return jsonResponse(sendHazardAlert(incident, recipients, Date.now(), properties, eventId));
  } finally {
    lock.releaseLock();
  }
}

function sendHazardAlert(payload, recipients, now, properties, eventId) {
  const incident = payload.incident && typeof payload.incident === 'object'
    ? payload.incident
    : payload;
  const hazardType = safeText(incident.hazardType, 'Possible PPE hazard', 100);
  const severity = safeText(incident.severity, 'Not specified', 40);
  const site = safeText(incident.site || incident.location, 'Site location not set', 120);
  const cameraSource = safeText(incident.cameraSource, 'Camera not specified', 120);
  const dashboardUrl = properties.getProperty('HAZORA_DASHBOARD_URL');
  const subject = `HAZORA alert: ${hazardType}`.slice(0, 150);
  const cache = CacheService.getScriptCache();
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  recipients.forEach((recipient) => {
    const deliveryKey = eventId ? `hazard_email_sent_${eventId}_${recipient.uid}` : '';
    if (deliveryKey && cache.get(deliveryKey)) {
      skippedCount += 1;
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
    ].join('\n');

    try {
      GmailApp.sendEmail(recipient.email, subject, body, { name: 'HAZORA Safety Alerts' });
      if (eventId) {
        cache.put(deliveryKey, 'sent', 21600);
      }
      sentCount += 1;
    } catch (error) {
      console.error(`Could not send hazard email to ${recipient.uid}: ${error.message}`);
      failedCount += 1;
    }
  });

  return {
    ok: true,
    sent: sentCount > 0,
    sentCount,
    failedCount,
    recipientCount: recipients.length,
    reason: sentCount > 0
      ? 'sent'
      : skippedCount > 0
        ? 'already_sent'
        : 'no_verified_recipients',
  };
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

function getVerifiedRecipients(projectId, accessToken) {
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
      if (!account.emailVerified || !account.email) return;
      verifiedRecipients.push({
        uid: account.localId,
        email: account.email,
        displayName: account.displayName || '',
      });
    });
    authPageToken = page.nextPageToken || '';
  } while (authPageToken);

  return verifiedRecipients;
}

function linkMobileAccount(payload, caller, properties) {
  const projectId = properties.getProperty('FIREBASE_PROJECT_ID');
  const databaseId = properties.getProperty('FIRESTORE_DATABASE_ID') || 'hazora';
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID script property is missing');

  const name = safeText(payload.name, '', 100);
  const username = safeText(payload.username, '', 80);
  const email = safeText(payload.email, '', 254).toLowerCase();
  let site = safeText(payload.site, '', 120);
  if (name.length < 3 || username.length < 3 || site.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ ok: false, reason: 'invalid_account_details' });
  }

  const accessToken = ScriptApp.getOAuthToken();
  const callerProfile = getFirestoreDocument(projectId, databaseId, `users/${caller.localId}`, accessToken);
  if (callerProfile?.fields?.role?.stringValue !== 'HSE Head - Head Office') {
    return jsonResponse({ ok: false, reason: 'hse_head_required' });
  }

  const existingAuthUser = findFirebaseAuthUserByEmail(projectId, email, accessToken);
  if (!existingAuthUser) return jsonResponse({ ok: true, exists: false });

  const websiteProfile = getFirestoreDocument(
    projectId,
    databaseId,
    `users/${existingAuthUser.localId}`,
    accessToken,
  );
  const assignedWebsiteSite = websiteProfile?.fields?.site?.stringValue;
  if (websiteProfile?.fields?.approvalStatus?.stringValue === 'approved' && assignedWebsiteSite) {
    site = safeText(assignedWebsiteSite, site, 120);
  }

  const usernameLowercase = username.toLowerCase();
  const emailMatch = queryFirestoreDocument(projectId, databaseId, 'mobile_accounts', 'email', email, accessToken);
  const usernameMatch = queryFirestoreDocument(
    projectId,
    databaseId,
    'mobile_accounts',
    'usernameLowercase',
    usernameLowercase,
    accessToken,
  ) || queryFirestoreDocument(projectId, databaseId, 'mobile_accounts', 'username', username, accessToken);

  const emailBelongsToThisAuthUser = emailMatch && emailMatch.fields?.authUid?.stringValue === existingAuthUser.localId;
  const usernameBelongsToThisAuthUser = usernameMatch && usernameMatch.fields?.authUid?.stringValue === existingAuthUser.localId;

  if (usernameMatch && !usernameBelongsToThisAuthUser && usernameMatch.name !== emailMatch?.name) {
    return jsonResponse({ ok: false, reason: 'username_already_used' });
  }
  if (emailMatch && !emailBelongsToThisAuthUser && emailMatch.fields?.authUid?.stringValue) {
    return jsonResponse({ ok: false, reason: 'email_linked_to_another_account' });
  }

  const existingDocument = emailMatch || usernameMatch;
  const now = new Date().toISOString();
  const fields = {
    name: { stringValue: name },
    role: { stringValue: 'Site/Safety Engineer' },
    username: { stringValue: username },
    usernameLowercase: { stringValue: usernameLowercase },
    email: { stringValue: email },
    authUid: { stringValue: existingAuthUser.localId },
    emailVerified: { booleanValue: Boolean(existingAuthUser.emailVerified) },
    site: { stringValue: site },
    status: { stringValue: 'active' },
    authLinkedAt: { timestampValue: now },
  };

  if (existingDocument) {
    fields.createdBy = existingDocument.fields?.createdBy || { stringValue: caller.localId };
    fields.createdByEmail = existingDocument.fields?.createdByEmail || { stringValue: caller.email };
    fields.createdAt = existingDocument.fields?.createdAt || { timestampValue: now };
  } else {
    fields.createdBy = { stringValue: caller.localId };
    fields.createdByEmail = { stringValue: caller.email };
    fields.createdAt = { timestampValue: now };
  }

  const passwordSetupEmailSent = sendPasswordSetupEmail(email, properties);
  fields.passwordSetupEmailSent = { booleanValue: passwordSetupEmailSent };
  if (existingDocument) {
    patchFirestoreDocument(projectId, databaseId, existingDocument.name, fields, accessToken);
  } else {
    createFirestoreDocument(projectId, databaseId, 'mobile_accounts', fields, accessToken);
  }

  return jsonResponse({
    ok: true,
    exists: true,
    emailVerified: Boolean(existingAuthUser.emailVerified),
    passwordSetupEmailSent,
  });
}

function sendPasswordSetupEmail(email, properties) {
  const apiKey = properties.getProperty('FIREBASE_WEB_API_KEY');
  if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY script property is missing');

  const response = UrlFetchApp.fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
      muteHttpExceptions: true,
    },
  );
  if (response.getResponseCode() !== 200) {
    console.error(`Password setup email could not be sent: ${response.getContentText()}`);
    return false;
  }
  return true;
}

function findFirebaseAuthUserByEmail(projectId, email, accessToken) {
  let pageToken = '';
  do {
    const query = [`maxResults=1000`, pageToken && `nextPageToken=${encodeURIComponent(pageToken)}`]
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
      throw new Error(`Could not search Firebase Auth users: ${response.getContentText()}`);
    }

    const page = JSON.parse(response.getContentText());
    const found = (page.users || []).find((account) =>
      (account.email || '').trim().toLowerCase() === email
    );
    if (found) return found;
    pageToken = page.nextPageToken || '';
  } while (pageToken);

  return null;
}

function getFirestoreDocument(projectId, databaseId, path, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/${encodeURIComponent(databaseId)}/documents/${path}`;
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() === 404) return null;
  if (response.getResponseCode() !== 200) {
    throw new Error(`Could not read Firestore document: ${response.getContentText()}`);
  }
  return JSON.parse(response.getContentText());
}

function queryFirestoreDocument(projectId, databaseId, collectionId, fieldPath, value, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/${encodeURIComponent(databaseId)}/documents:runQuery`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${accessToken}` },
    payload: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value: { stringValue: value },
          },
        },
        limit: 1,
      },
    }),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    throw new Error(`Could not query mobile accounts: ${response.getContentText()}`);
  }
  const result = JSON.parse(response.getContentText());
  return result.find((item) => item.document)?.document || null;
}

function createFirestoreDocument(projectId, databaseId, collectionPath, fields, accessToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/${encodeURIComponent(databaseId)}/documents/${collectionPath}`;
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${accessToken}` },
    payload: JSON.stringify({ fields }),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    throw new Error(`Could not create mobile account: ${response.getContentText()}`);
  }
}

function patchFirestoreDocument(projectId, databaseId, documentName, fields, accessToken) {
  const mask = Object.keys(fields)
    .concat('password')
    .map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`)
    .join('&');
  const url = `https://firestore.googleapis.com/v1/${documentName}?${mask}`;
  const response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: { Authorization: `Bearer ${accessToken}` },
    payload: JSON.stringify({ fields }),
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    throw new Error(`Could not link mobile account: ${response.getContentText()}`);
  }
}