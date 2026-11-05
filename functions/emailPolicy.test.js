const test = require('node:test');
const assert = require('node:assert/strict');
const { isEligibleHazardIncident } = require('./emailPolicy');

test('accepts a hazard incident owned by a Firebase user', () => {
  assert.equal(isEligibleHazardIncident({
    hazardType: 'Missing helmet',
    userId: 'firebase-user-id',
    status: 'New',
  }, 'firebase-user-id'), true);
});

test('accepts mobile incidents using createdBy as the owner field', () => {
  assert.equal(isEligibleHazardIncident({
    hazardType: 'Missing helmet',
    createdBy: 'firebase-user-id',
  }, 'firebase-user-id'), true);
});

test('does not send alerts for resolved or done incidents', () => {
  for (const status of ['Resolved', 'done', ' DONE ']) {
    assert.equal(isEligibleHazardIncident({
      hazardType: 'Missing helmet',
      userId: 'firebase-user-id',
      status,
    }, 'firebase-user-id'), false);
  }
});

test('rejects empty hazards, missing owners, and mismatched incident owners', () => {
  assert.equal(isEligibleHazardIncident({ hazardType: '  ', userId: 'user-1' }, 'user-1'), false);
  assert.equal(isEligibleHazardIncident({ hazardType: 'Missing helmet' }), false);
  assert.equal(isEligibleHazardIncident({
    hazardType: 'Missing helmet',
    userId: 'different-user',
  }, 'firebase-user-id'), false);
  assert.equal(isEligibleHazardIncident(null), false);
});
