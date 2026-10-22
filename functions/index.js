const { getAuth } = require('firebase-admin/auth');
const { initializeApp } = require('firebase-admin/app');
const { defineSecret, defineString } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { onDocumentCreatedWithAuthContext } = require('firebase-functions/v2/firestore');
const { isEligibleHazardIncident } = require('./emailPolicy');

initializeApp();

const hazardEmailEndpoint = defineString('HAZARD_EMAIL_ENDPOINT');
const hazardEmailTriggerSecret = defineSecret('HAZARD_EMAIL_TRIGGER_SECRET');

exports.emailVerifiedUsersOnIncident = onDocumentCreatedWithAuthContext(
  {
    document: 'incidents/{incidentId}',
    database: 'hazora',
    retry: true,
    secrets: [hazardEmailTriggerSecret],
  },
  async (event) => {
    const incident = event.data?.data();
    const incidentOwnerUid = incident?.userId || incident?.createdBy;
    const ownerUid = event.authId ||
      (event.authType === 'service_account' ? incidentOwnerUid : '');
    if (!isEligibleHazardIncident(incident, ownerUid)) {
      logger.warn('Skipping incident with an invalid owner or authentication context.', {
        incidentId: event.params.incidentId,
        authType: event.authType,
      });
      return;
    }

    let owner;
    try {
      owner = await getAuth().getUser(ownerUid);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        logger.warn('Skipping incident because its owner is not a Firebase Auth user.', {
          incidentId: event.params.incidentId,
          ownerUid,
        });
        return;
      }
      throw error;
    }
    if (!owner.emailVerified) {
      logger.warn('Skipping incident from an unverified account.', {
        incidentId: event.params.incidentId,
        ownerUid,
      });
      return;
    }

    const response = await fetch(hazardEmailEndpoint.value(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'incident_created',
        eventId: event.id,
        incidentId: event.params.incidentId,
        triggerSecret: hazardEmailTriggerSecret.value(),
        incident: {
          hazardType: incident.hazardType,
          severity: incident.severity || 'Not specified',
          site: incident.site || incident.location || 'Site location not set',
          cameraSource: incident.cameraSource || 'Camera not specified',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Hazard email endpoint returned HTTP ${response.status}`);
    }
    const result = await response.json();
    if (!result.ok || result.failedCount > 0) {
      throw new Error(`Hazard email delivery failed: ${result.reason || 'recipient delivery error'}`);
    }
    logger.info('Hazard email fan-out completed.', {
      incidentId: event.params.incidentId,
      sentCount: result.sentCount || 0,
      recipientCount: result.recipientCount || 0,
    });
  },
);
