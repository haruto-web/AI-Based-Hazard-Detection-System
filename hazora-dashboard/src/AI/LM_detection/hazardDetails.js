// Human-readable hazard context for each PPE item. Used to build detailed
// notifications and incident reports so users understand what was detected,
// why it matters, and what action to take.

export const PPE_HAZARD_INFO = {
  'Safety Helmet': {
    short: 'helmet',
    gear: 'hard hat',
    bodyPart: 'head',
    severity: 'high',
    // Why this matters — the real-world risk of skipping it.
    risk: 'Working without a hard hat leaves the head unprotected from falling objects, swinging loads, and accidental impacts, which can cause serious or fatal head injuries.',
    action: 'Stop the worker, issue a compliant hard hat, and confirm it is worn correctly before they resume work in the area.',
    standard: 'Head protection is mandatory in all active construction zones.',
  },
  'Safety Vest': {
    short: 'vest',
    gear: 'high-visibility safety vest',
    bodyPart: 'torso',
    severity: 'high',
    risk: 'Without a high-visibility vest, a worker is hard to see for equipment operators and vehicle drivers, raising the risk of being struck, especially in low light or busy areas.',
    action: 'Provide a high-visibility vest and ensure it is fastened and visible before the worker continues.',
    standard: 'High-visibility clothing is required near moving equipment and vehicles.',
  },
  'Safety Shoes': {
    short: 'shoes',
    gear: 'safety shoes',
    bodyPart: 'feet',
    severity: 'medium',
    risk: 'Without safety shoes, feet are exposed to crushing from dropped materials, punctures from nails or debris, and slips on uneven or wet surfaces.',
    action: 'Direct the worker to wear proper safety footwear before entering the work area.',
    standard: 'Protective footwear is required on all construction sites.',
  },
};

function pluralizeWorkers(count) {
  return `${count} worker${count === 1 ? '' : 's'}`;
}

// Build a detailed, user-friendly incident/notification payload for a single
// missing PPE item type.
export function buildHazardReport({ item, affectedCount, personCount, compliantCount, cameraSource }) {
  const info = PPE_HAZARD_INFO[item] || {
    short: item.toLowerCase(),
    gear: item.toLowerCase(),
    risk: `A worker was detected without required ${item.toLowerCase()}.`,
    action: `Ensure the worker wears the required ${item.toLowerCase()}.`,
    standard: 'Required PPE must be worn at all times.',
    severity: 'high',
  };

  const workers = pluralizeWorkers(affectedCount);
  const location = cameraSource ? ` on camera ${cameraSource}` : '';
  const complianceNote = personCount
    ? ` Out of ${pluralizeWorkers(personCount)} detected${location}, ${affectedCount} ${affectedCount === 1 ? 'is' : 'are'} non-compliant and ${compliantCount} fully compliant.`
    : '';

  const hazardType = `Missing ${info.gear.replace(/^./, (c) => c.toUpperCase())}`;

  const description =
    `${workers}${location} detected without a ${info.gear}. ` +
    `${info.risk}${complianceNote}`;

  const precautions =
    `${info.action} ${info.standard}`;

  return {
    hazardType,
    description,
    precautions,
    severity: info.severity,
    // Compact message for the notification toast/bell.
    notificationMessage: `${workers} without ${info.short}${location}. ${info.action}`,
  };
}
