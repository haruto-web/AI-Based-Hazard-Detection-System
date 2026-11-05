# Hazard email delivery without Firebase Functions

Hazard emails use a Google Apps Script time-driven trigger to poll the `hazora`
Firestore database. The script checks new top-level `incidents` documents
about every minute and emails Firebase Auth accounts with verified email
addresses. Polling is not instantaneous, and Apps Script may run triggers
slightly later than scheduled. The incident reporter's email does not need to
be verified.

This avoids deploying a Firebase Cloud Function, which requires the Blaze
plan. Firestore API and Gmail/Apps Script quotas and any applicable pricing
still apply.

## Configure and install

1. Deploy `admin-tools/hazora-gmail-endpoint.gs` as a Google Apps Script web
   app if the dashboard's email self-test or mobile-account linking is needed.
   Set these Script Properties:
   - `FIREBASE_WEB_API_KEY`
   - `FIREBASE_PROJECT_ID`
   - `FIRESTORE_DATABASE_ID` (use `hazora`)
   - `HAZORA_DASHBOARD_URL` (optional)

   Configure the web app to execute as its owner. The web app is separate from
   the polling trigger, which runs under the Google account that installs it.
2. In Google Cloud Console, enable the Firestore API and Firebase Authentication
   API for the Firebase project. Grant the Google account that will install the
   trigger the `Cloud Datastore User` and `Firebase Authentication Viewer`
   roles on the project so it can read/mark incidents and list verified users.
3. In Apps Script, authorize the project to access external services and send
   email with Gmail. The manifest already declares the required OAuth scopes.
4. In the Apps Script editor, select and run `installHazardIncidentPolling`
   once, then approve the requested permissions. It installs a one-minute
   trigger and records the installation time; incidents created before that
   time are not sent retroactively. Successful deliveries are marked on each
   incident to prevent repeat alerts. Use `stopHazardIncidentPolling` to stop it.
5. To use the Profile page's self-test email, set
   `VITE_HAZARD_EMAIL_ENDPOINT` in the dashboard environment to the deployed
   Apps Script `/exec` URL. This setting is not needed for polling alerts.
6. Publish Firestore rules so signed-in users can create incidents only with
   their own Firebase UID in `userId` or `createdBy`:

   ```cmd
   npx firebase-tools deploy --only firestore:rules --project project-hazora
   ```

The poller reads newly created documents from the top-level `incidents`
collection, so both website and mobile incidents must be written there with a
non-empty `hazardType` and the creator's UID in `userId` or `createdBy`.
