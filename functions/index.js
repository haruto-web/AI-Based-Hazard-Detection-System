const { initializeApp } = require('firebase-admin/app');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();

const database = getFirestore(undefined, 'hazora');
const auth = getAuth();
const HSE_HEAD_ROLE = 'HSE Head - Head Office';

exports.linkExistingMobileAccount = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before linking a mobile account.');
  }

  const callerRecord = await database.collection('users').doc(request.auth.uid).get();
  if (callerRecord.data()?.role !== HSE_HEAD_ROLE) {
    throw new HttpsError('permission-denied', 'Only the HSE Head can manage mobile accounts.');
  }

  const name = cleanText(request.data?.name, 100);
  const username = cleanText(request.data?.username, 80);
  const email = cleanText(request.data?.email, 254).toLowerCase();
  const site = cleanText(request.data?.site, 120);
  if (name.length < 3 || username.length < 3 || site.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid name, username, email, and site.');
  }

  let authUser;
  try {
    authUser = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code === 'auth/user-not-found') return { exists: false };
    throw new HttpsError('internal', 'Could not check for an existing Firebase account.');
  }

  const mobileAccounts = database.collection('mobile_accounts');
  const accountSnapshot = await mobileAccounts.get();
  const usernameKey = username.toLowerCase();
  const emailMatch = accountSnapshot.docs.find((account) =>
    String(account.get('email') || '').trim().toLowerCase() === email
  );
  const usernameMatch = accountSnapshot.docs.find((account) =>
    String(account.get('username') || '').trim().toLowerCase() === usernameKey
  );

  if (usernameMatch && usernameMatch.id !== emailMatch?.id &&
      usernameMatch.get('authUid') !== authUser.uid) {
    throw new HttpsError('already-exists', 'That mobile username is already assigned to another account.');
  }
  if (emailMatch && emailMatch.get('authUid') && emailMatch.get('authUid') !== authUser.uid) {
    throw new HttpsError('already-exists', 'That email is already linked to a different Firebase account.');
  }

  const existingAccount = emailMatch || usernameMatch;
  const accountRef = existingAccount?.ref || mobileAccounts.doc();
  const accountData = {
    name,
    role: 'Site/Safety Engineer',
    username,
    usernameLowercase: usernameKey,
    email,
    authUid: authUser.uid,
    site,
    status: 'active',
    createdBy: existingAccount?.get('createdBy') || request.auth.uid,
    createdByEmail: existingAccount?.get('createdByEmail') || request.auth.token.email || '',
    authLinkedAt: FieldValue.serverTimestamp(),
    password: FieldValue.delete(),
  };
  if (!existingAccount) accountData.createdAt = FieldValue.serverTimestamp();
  await accountRef.set(accountData, { merge: true });

  return {
    exists: true,
    accountId: accountRef.id,
    authUid: authUser.uid,
    email,
    emailVerified: authUser.emailVerified,
    name,
    role: 'Site/Safety Engineer',
    username,
    site,
  };
});

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength)
    : '';
}