// Role definitions and access control

export const ROLES = [
  'Site Safety Officer',
  'Site Safety Practitioner',
  'Site Project Engineer',
  'Site Construction Manager',
  'Safety Engineer - Head Office',
  'Safety Manager - Head Office',
  'HSE Head - Head Office',
];

// Access levels per role
// 'full' = can view and interact with all features
// 'view' = can view but not modify/export
// 'none' = nav item hidden, cannot access
export const ROLE_ACCESS = {
  'Site Safety Officer': {
    dashboard: 'view',
    streams: 'full',
    reports: 'view',
    profile: 'full',
  },
  'Site Safety Practitioner': {
    dashboard: 'view',
    streams: 'full',
    reports: 'view',
    profile: 'full',
  },
  'Site Project Engineer': {
    dashboard: 'view',
    streams: 'view',
    reports: 'none',
    profile: 'full',
  },
  'Site Construction Manager': {
    dashboard: 'full',
    streams: 'full',
    reports: 'view',
    profile: 'full',
  },
  'Safety Engineer - Head Office': {
    dashboard: 'full',
    streams: 'full',
    reports: 'full',
    profile: 'full',
  },
  'Safety Manager - Head Office': {
    dashboard: 'full',
    streams: 'full',
    reports: 'full',
    profile: 'full',
  },
  'HSE Head - Head Office': {
    dashboard: 'full',
    streams: 'full',
    reports: 'full',
    profile: 'full',
  },
};

// Default access for unknown roles (full access as fallback)
const DEFAULT_ACCESS = {
  dashboard: 'full',
  streams: 'full',
  reports: 'full',
  profile: 'full',
};

/**
 * Get the access level for a given role and page
 * @param {string} role - User's role
 * @param {string} page - Page id (dashboard, streams, reports, profile)
 * @returns {'full' | 'view' | 'none'}
 */
export function getAccess(role, page) {
  const access = ROLE_ACCESS[role] || DEFAULT_ACCESS;
  return access[page] || 'full';
}

/**
 * Check if a role can see a nav item
 * @param {string} role
 * @param {string} page
 * @returns {boolean}
 */
export function canAccess(role, page) {
  return getAccess(role, page) !== 'none';
}

/**
 * Check if a role has full (write/export) access to a page
 * @param {string} role
 * @param {string} page
 * @returns {boolean}
 */
export function hasFullAccess(role, page) {
  return getAccess(role, page) === 'full';
}
