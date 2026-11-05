function isEligibleHazardIncident(incident, ownerUid) {
  const incidentOwnerUid = incident?.userId || incident?.createdBy;
  return Boolean(
    incident &&
    typeof incident === 'object' &&
    typeof incident.hazardType === 'string' &&
    incident.hazardType.trim() &&
    !['resolved', 'done'].includes(String(incident.status || '').trim().toLowerCase()) &&
    typeof ownerUid === 'string' &&
    ownerUid.trim() &&
    (!incidentOwnerUid || incidentOwnerUid === ownerUid)
  );
}

module.exports = { isEligibleHazardIncident };
