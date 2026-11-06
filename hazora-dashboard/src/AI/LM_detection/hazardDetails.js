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

export function buildScaffoldingHazardReport({ affectedCount, cameraSource }) {
  const scaffoldSections = `${affectedCount} scaffold section${affectedCount === 1 ? '' : 's'}`;
  const location = cameraSource ? ` Camera: ${cameraSource}.` : '';
  const hazardType = 'Scaffolding Missing Base';
  const action = 'Stop use of the affected scaffold and have a competent person install and verify a proper base before work resumes.';

  return {
    hazardType,
    description: `AI identified ${scaffoldSections} without a required base.${location} Missing base support can make the scaffold unstable and increase the risk of shifting or collapse.`,
    precautions: `${action} Inspect the scaffold foundation and all supporting components before allowing access.`,
    severity: 'high',
    notificationMessage: `${scaffoldSections} detected without a required base${cameraSource ? ` on camera ${cameraSource}` : ''}. ${action}`,
  };
}

export function buildProtrudingHazardReport({ affectedCount, cameraSource }) {
  const hazards = `${affectedCount} unprotected protruding object${affectedCount === 1 ? '' : 's'}`;
  const location = cameraSource ? ` Camera: ${cameraSource}.` : '';
  const action = 'Secure, remove, or clearly guard the protruding object and keep workers away until the area is safe.';

  return {
    hazardType: 'Protruding Object',
    description: `AI identified ${hazards} in the work area.${location} Exposed objects may cause puncture, trip, or impact injuries.`,
    precautions: `${action} Inspect the area and install suitable protective caps or barriers where removal is not possible.`,
    severity: 'high',
    notificationMessage: `${hazards} detected${cameraSource ? ` on camera ${cameraSource}` : ''}. ${action}`,
  };
}

export function buildMaterialHandlingHazardReport({ affectedCount, cameraSource }) {
  const areas = `${affectedCount} material-handling area${affectedCount === 1 ? '' : 's'}`;
  const location = cameraSource ? ` Camera: ${cameraSource}.` : '';
  const action = 'Pause work in the affected area and organize, secure, and safely stack the materials before handling continues.';

  return {
    hazardType: 'Disorganized Material Handling',
    description: `AI identified ${areas} with disorganized material storage.${location} Unsecured or poorly stacked items may block walkways, fall, or cause trip and impact injuries.`,
    precautions: `${action} Keep access paths clear and verify that stored materials are stable.`,
    severity: 'high',
    notificationMessage: `${areas} detected with disorganized material storage${cameraSource ? ` on camera ${cameraSource}` : ''}. ${action}`,
  };
}

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
  const location = cameraSource ? ` Camera: ${cameraSource}.` : '';
  const complianceNote = personCount
    ? ` Of the ${pluralizeWorkers(personCount)} identified, ${affectedCount} ${affectedCount === 1 ? 'is' : 'are'} non-compliant and ${compliantCount} ${compliantCount === 1 ? 'is' : 'are'} fully compliant.`
    : '';

  const hazardType = `Missing ${info.gear.replace(/^./, (c) => c.toUpperCase())}`;

  const description =
    `AI identified ${workers} without the required ${info.gear}.${location} ` +
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
