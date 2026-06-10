/**
 * Security utilities for HAZORA Dashboard
 * Implements SHA-256 hashing for data integrity and security
 */

/**
 * Compute SHA-256 hash of a string
 * @param {string} data - Input string to hash
 * @returns {Promise<string>} - Hexadecimal hash string
 */
export async function computeSHA256(data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Compute SHA-256 hash of a file
 * @param {File} file - File object to hash
 * @returns {Promise<string>} - Hexadecimal hash string
 */
export async function computeFileSHA256(file) {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Verify file integrity by comparing computed hash with known hash
 * @param {File} file - File to verify
 * @param {string} knownHash - Expected SHA-256 hash
 * @returns {Promise<boolean>} - True if hashes match, false otherwise
 */
export async function verifyFileIntegrity(file, knownHash) {
  const computedHash = await computeFileSHA256(file);
  return computedHash.toLowerCase() === knownHash.toLowerCase();
}

/**
 * Generate a secure token using SHA-256
 * @param {string} baseString - Base string to hash
 * @param {string} salt - Salt value (timestamp or random string)
 * @returns {Promise<string>} - Secure token
 */
export async function generateSecureToken(baseString, salt = Date.now().toString()) {
  const combined = baseString + salt;
  return await computeSHA256(combined);
}

/**
 * Create a data integrity signature for Firestore documents
 * Useful for detecting unauthorized modifications
 * @param {Object} data - Document data to sign
 * @returns {Promise<string>} - SHA-256 signature
 */
export async function createDataSignature(data) {
  // Sort keys to ensure consistent hashing
  const sortedData = Object.keys(data)
    .sort()
    .reduce((acc, key) => {
      acc[key] = data[key];
      return acc;
    }, {});
  
  const dataString = JSON.stringify(sortedData);
  return await computeSHA256(dataString);
}

/**
 * Verify data integrity signature
 * @param {Object} data - Document data to verify
 * @param {string} signature - Known signature to compare against
 * @returns {Promise<boolean>} - True if signatures match
 */
export async function verifyDataSignature(data, signature) {
  const computedSignature = await createDataSignature(data);
  return computedSignature === signature;
}

/**
 * Hash sensitive configuration data (camera IPs, API keys)
 * Note: This is for storage/comparison, not encryption
 * @param {string} sensitiveData - Data to hash
 * @returns {Promise<string>} - SHA-256 hash
 */
export async function hashSensitiveData(sensitiveData) {
  return await computeSHA256(sensitiveData);
}

/**
 * Sanitize user input to prevent XSS attacks
 * @param {string} input - User input string
 * @returns {string} - Sanitized string
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number format (Philippine format)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid format
 */
export function isValidPhone(phone) {
  // Accepts formats: +63XXXXXXXXXX, 09XXXXXXXXX, etc.
  const phoneRegex = /^(\+63|0)?9\d{9}$/;
  return phoneRegex.test(phone.replace(/[\s-]/g, ''));
}

/**
 * Generate a random salt for hashing
 * @param {number} length - Length of salt
 * @returns {string} - Random salt string
 */
export function generateSalt(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let salt = '';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    salt += chars[randomValues[i] % chars.length];
  }
  
  return salt;
}

/**
 * Create audit log entry with integrity signature
 * @param {string} userId - User ID performing action
 * @param {string} action - Action performed
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} - Audit log entry with signature
 */
export async function createAuditLogEntry(userId, action, metadata = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    userId,
    action,
    timestamp,
    metadata,
  };
  
  const signature = await createDataSignature(entry);
  
  return {
    ...entry,
    signature,
  };
}

/**
 * Check password strength
 * @param {string} password - Password to check
 * @returns {Object} - Strength score and feedback
 */
export function checkPasswordStrength(password) {
  let score = 0;
  const feedback = [];
  
  if (password.length < 8) {
    feedback.push('Password should be at least 8 characters');
  } else if (password.length >= 12) {
    score += 2;
  } else {
    score += 1;
  }
  
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  
  if (!/[A-Z]/.test(password)) feedback.push('Add uppercase letters');
  if (!/[0-9]/.test(password)) feedback.push('Add numbers');
  if (!/[^a-zA-Z0-9]/.test(password)) feedback.push('Add special characters');
  
  let strength = 'weak';
  if (score >= 5) strength = 'strong';
  else if (score >= 3) strength = 'medium';
  
  return { score, strength, feedback };
}
