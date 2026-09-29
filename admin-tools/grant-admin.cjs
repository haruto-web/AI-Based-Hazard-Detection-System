const { applicationDefault, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
const uid = process.argv[2];

if (!projectId || !uid) {
  console.error('Usage: set GCLOUD_PROJECT, then node grant-admin.cjs <firebase-auth-uid>');
  process.exit(1);
}

const app = initializeApp({
  credential: applicationDefault(),
  projectId,
});
const auth = getAuth(app);
const db = getFirestore(app, 'hazora');

async function grantAdmin() {
  const [authUser, profileSnapshot] = await Promise.all([
    auth.getUser(uid),
    db.collection('users').doc(uid).get(),
  ]);

  if (!profileSnapshot.exists) {
    throw new Error('No website profile exists for this UID. Have the user register first.');
  }

  if (authUser.customClaims?.superAdmin) {
    throw new Error('This account is already a super-admin; no changes were made.');
  }

  const profileRef = db.collection('users').doc(uid);
  await auth.setCustomUserClaims(uid, {
    ...authUser.customClaims,
    admin: true,
  });
  await profileRef.set({
    approvalStatus: 'approved',
    role: 'Site Safety Officer',
    adminGrantedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log(`Granted regular admin access to ${authUser.email || uid} in project ${projectId}.`);
  console.log('The website user must sign out and sign back in for the new claim to take effect.');
  console.log('No superAdmin claim was granted.');
}

grantAdmin().catch((error) => {
  console.error(`Admin grant failed: ${error.message}`);
  process.exitCode = 1;
});