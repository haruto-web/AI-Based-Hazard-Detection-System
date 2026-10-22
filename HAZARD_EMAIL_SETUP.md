# Hazard email delivery

Hazard alerts are sent by a Firebase Firestore-created trigger. Both website and
mobile incidents are stored in the `hazora` database's top-level `incidents`
collection, so a new incident from either app uses the same email fan-out. The
trigger checks that the incident owner is a verified Firebase Auth user, then
the Gmail endpoint emails every Firebase Auth account with a verified email
address. Approval status and assigned role do not restrict recipients.

## Configure and deploy

1. Deploy `admin-tools/hazora-gmail-endpoint.gs` as a Google Apps Script web app.
   Configure its Script Properties:
   - `FIREBASE_WEB_API_KEY`
   - `FIREBASE_PROJECT_ID`
   - `FIRESTORE_DATABASE_ID` (needed by mobile-account linking; use `hazora`)
   - `HAZORA_DASHBOARD_URL` (optional)
   - `HAZARD_EMAIL_TRIGGER_SECRET` (a long random secret)
2. Enable the Firebase Authentication/Identity Toolkit API and grant the
   Apps Script project's identity permission to list Firebase Auth users.
   Authorize the script to call external services and send email with Gmail,
   then deploy the web app so it executes as its owner.
3. Set the same secret in Firebase Secret Manager:

   ```powershell
   firebase functions:secrets:set HAZARD_EMAIL_TRIGGER_SECRET
   ```

4. Deploy the Functions source:

   ```powershell
   firebase deploy --only functions
   ```

   When prompted for `HAZARD_EMAIL_ENDPOINT`, enter the deployed Apps Script
   `/exec` URL. The Firebase project must have the `hazora` Firestore database,
   Cloud Functions, Eventarc, and the required billing plan enabled.
5. For the Profile page's self-test email only, set
   `VITE_HAZARD_EMAIL_ENDPOINT` to the same Apps Script `/exec` URL in the
   dashboard environment. Hazard alert emails do not depend on a browser being
   open or on that frontend setting.

The trigger checks Firestore's authentication context and confirms the actor is
a verified Firebase Auth account. If incidents are written through a trusted
service account, include the owning Firebase UID in `userId` or `createdBy`.
Records from unverified accounts are ignored. The Apps Script uses a per-event
delivery cache to avoid sending the same incident twice during trigger retries.
