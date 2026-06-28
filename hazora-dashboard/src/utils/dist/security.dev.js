"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.computeSHA256 = computeSHA256;
exports.computeFileSHA256 = computeFileSHA256;
exports.verifyFileIntegrity = verifyFileIntegrity;
exports.generateSecureToken = generateSecureToken;
exports.createDataSignature = createDataSignature;
exports.verifyDataSignature = verifyDataSignature;
exports.hashSensitiveData = hashSensitiveData;
exports.sanitizeInput = sanitizeInput;
exports.isValidEmail = isValidEmail;
exports.isValidPhone = isValidPhone;
exports.generateSalt = generateSalt;
exports.createAuditLogEntry = createAuditLogEntry;
exports.checkPasswordStrength = checkPasswordStrength;

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

/**
 * Security utilities for HAZORA Dashboard
 * Implements SHA-256 hashing for data integrity and security
 */

/**
 * Compute SHA-256 hash of a string
 * @param {string} data - Input string to hash
 * @returns {Promise<string>} - Hexadecimal hash string
 */
function computeSHA256(data) {
  var encoder, dataBuffer, hashBuffer, hashArray, hashHex;
  return regeneratorRuntime.async(function computeSHA256$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          encoder = new TextEncoder();
          dataBuffer = encoder.encode(data);
          _context.next = 4;
          return regeneratorRuntime.awrap(crypto.subtle.digest('SHA-256', dataBuffer));

        case 4:
          hashBuffer = _context.sent;
          hashArray = Array.from(new Uint8Array(hashBuffer));
          hashHex = hashArray.map(function (b) {
            return b.toString(16).padStart(2, '0');
          }).join('');
          return _context.abrupt("return", hashHex);

        case 8:
        case "end":
          return _context.stop();
      }
    }
  });
}
/**
 * Compute SHA-256 hash of a file
 * @param {File} file - File object to hash
 * @returns {Promise<string>} - Hexadecimal hash string
 */


function computeFileSHA256(file) {
  var buffer, hashBuffer, hashArray, hashHex;
  return regeneratorRuntime.async(function computeFileSHA256$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          _context2.next = 2;
          return regeneratorRuntime.awrap(file.arrayBuffer());

        case 2:
          buffer = _context2.sent;
          _context2.next = 5;
          return regeneratorRuntime.awrap(crypto.subtle.digest('SHA-256', buffer));

        case 5:
          hashBuffer = _context2.sent;
          hashArray = Array.from(new Uint8Array(hashBuffer));
          hashHex = hashArray.map(function (b) {
            return b.toString(16).padStart(2, '0');
          }).join('');
          return _context2.abrupt("return", hashHex);

        case 9:
        case "end":
          return _context2.stop();
      }
    }
  });
}
/**
 * Verify file integrity by comparing computed hash with known hash
 * @param {File} file - File to verify
 * @param {string} knownHash - Expected SHA-256 hash
 * @returns {Promise<boolean>} - True if hashes match, false otherwise
 */


function verifyFileIntegrity(file, knownHash) {
  var computedHash;
  return regeneratorRuntime.async(function verifyFileIntegrity$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          _context3.next = 2;
          return regeneratorRuntime.awrap(computeFileSHA256(file));

        case 2:
          computedHash = _context3.sent;
          return _context3.abrupt("return", computedHash.toLowerCase() === knownHash.toLowerCase());

        case 4:
        case "end":
          return _context3.stop();
      }
    }
  });
}
/**
 * Generate a secure token using SHA-256
 * @param {string} baseString - Base string to hash
 * @param {string} salt - Salt value (timestamp or random string)
 * @returns {Promise<string>} - Secure token
 */


function generateSecureToken(baseString) {
  var salt,
      combined,
      _args4 = arguments;
  return regeneratorRuntime.async(function generateSecureToken$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          salt = _args4.length > 1 && _args4[1] !== undefined ? _args4[1] : Date.now().toString();
          combined = baseString + salt;
          _context4.next = 4;
          return regeneratorRuntime.awrap(computeSHA256(combined));

        case 4:
          return _context4.abrupt("return", _context4.sent);

        case 5:
        case "end":
          return _context4.stop();
      }
    }
  });
}
/**
 * Create a data integrity signature for Firestore documents
 * Useful for detecting unauthorized modifications
 * @param {Object} data - Document data to sign
 * @returns {Promise<string>} - SHA-256 signature
 */


function createDataSignature(data) {
  var sortedData, dataString;
  return regeneratorRuntime.async(function createDataSignature$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          // Sort keys to ensure consistent hashing
          sortedData = Object.keys(data).sort().reduce(function (acc, key) {
            acc[key] = data[key];
            return acc;
          }, {});
          dataString = JSON.stringify(sortedData);
          _context5.next = 4;
          return regeneratorRuntime.awrap(computeSHA256(dataString));

        case 4:
          return _context5.abrupt("return", _context5.sent);

        case 5:
        case "end":
          return _context5.stop();
      }
    }
  });
}
/**
 * Verify data integrity signature
 * @param {Object} data - Document data to verify
 * @param {string} signature - Known signature to compare against
 * @returns {Promise<boolean>} - True if signatures match
 */


function verifyDataSignature(data, signature) {
  var computedSignature;
  return regeneratorRuntime.async(function verifyDataSignature$(_context6) {
    while (1) {
      switch (_context6.prev = _context6.next) {
        case 0:
          _context6.next = 2;
          return regeneratorRuntime.awrap(createDataSignature(data));

        case 2:
          computedSignature = _context6.sent;
          return _context6.abrupt("return", computedSignature === signature);

        case 4:
        case "end":
          return _context6.stop();
      }
    }
  });
}
/**
 * Hash sensitive configuration data (camera IPs, API keys)
 * Note: This is for storage/comparison, not encryption
 * @param {string} sensitiveData - Data to hash
 * @returns {Promise<string>} - SHA-256 hash
 */


function hashSensitiveData(sensitiveData) {
  return regeneratorRuntime.async(function hashSensitiveData$(_context7) {
    while (1) {
      switch (_context7.prev = _context7.next) {
        case 0:
          _context7.next = 2;
          return regeneratorRuntime.awrap(computeSHA256(sensitiveData));

        case 2:
          return _context7.abrupt("return", _context7.sent);

        case 3:
        case "end":
          return _context7.stop();
      }
    }
  });
}
/**
 * Sanitize user input to prevent XSS attacks
 * @param {string} input - User input string
 * @returns {string} - Sanitized string
 */


function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');
}
/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */


function isValidEmail(email) {
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
/**
 * Validate phone number format (Philippine format)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid format
 */


function isValidPhone(phone) {
  // Accepts formats: +63XXXXXXXXXX, 09XXXXXXXXX, etc.
  var phoneRegex = /^(\+63|0)?9\d{9}$/;
  return phoneRegex.test(phone.replace(/[\s-]/g, ''));
}
/**
 * Generate a random salt for hashing
 * @param {number} length - Length of salt
 * @returns {string} - Random salt string
 */


function generateSalt() {
  var length = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 16;
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var salt = '';
  var randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  for (var i = 0; i < length; i++) {
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


function createAuditLogEntry(userId, action) {
  var metadata,
      timestamp,
      entry,
      signature,
      _args8 = arguments;
  return regeneratorRuntime.async(function createAuditLogEntry$(_context8) {
    while (1) {
      switch (_context8.prev = _context8.next) {
        case 0:
          metadata = _args8.length > 2 && _args8[2] !== undefined ? _args8[2] : {};
          timestamp = new Date().toISOString();
          entry = {
            userId: userId,
            action: action,
            timestamp: timestamp,
            metadata: metadata
          };
          _context8.next = 5;
          return regeneratorRuntime.awrap(createDataSignature(entry));

        case 5:
          signature = _context8.sent;
          return _context8.abrupt("return", _objectSpread({}, entry, {
            signature: signature
          }));

        case 7:
        case "end":
          return _context8.stop();
      }
    }
  });
}
/**
 * Check password strength
 * @param {string} password - Password to check
 * @returns {Object} - Strength score and feedback
 */


function checkPasswordStrength(password) {
  var score = 0;
  var feedback = [];

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
  var strength = 'weak';
  if (score >= 5) strength = 'strong';else if (score >= 3) strength = 'medium';
  return {
    score: score,
    strength: strength,
    feedback: feedback
  };
}