/**
 * Audit Logger with SHA-256 Integrity Protection
 * Tracks all security-relevant events in the HAZORA system
 */

import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { createAuditLogEntry } from './security';

// Audit event types
export const AuditEvents = {
  // Authentication events
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_REGISTER: 'USER_REGISTER',
  LOGIN_FAILED: 'LOGIN_FAILED',
  
  // Data access events
  DATA_READ: 'DATA_READ',
  DATA_WRITE: 'DATA_WRITE',
  DATA_DELETE: 'DATA_DELETE',
  
  // Security events
  UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
  ROLE_CHANGE_ATTEMPT: 'ROLE_CHANGE_ATTEMPT',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  
  // Camera events
  CAMERA_CONNECTED: 'CAMERA_CONNECTED',
  CAMERA_DISCONNECTED: 'CAMERA_DISCONNECTED',
  CAMERA_CONFIG_CHANGED: 'CAMERA_CONFIG_CHANGED',
  
  // Report events
  REPORT_GENERATED: 'REPORT_GENERATED',
  REPORT_EXPORTED: 'REPORT_EXPORTED',
  
  // Site events
  SITE_CREATED: 'SITE_CREATED',
  SITE_UPDATED: 'SITE_UPDATED',
  SITE_DELETED: 'SITE_DELETED',
  
  // Detection events
  HAZARD_DETECTED: 'HAZARD_DETECTED',
  INCIDENT_CREATED: 'INCIDENT_CREATED',
  INCIDENT_RESOLVED: 'INCIDENT_RESOLVED',
};

/**
 * Log an audit event to Firestore with SHA-256 signature
 * @param {string} userId - User ID performing the action
 * @param {string} eventType - Type of event (from AuditEvents)
 * @param {Object} metadata - Additional event details
 * @param {string} ipAddress - User's IP address (if available)
 * @returns {Promise<void>}
 */
export async function logAuditEvent(userId, eventType, metadata = {}, ipAddress = null) {
  try {
    // Create audit log entry with SHA-256 signature
    const logEntry = await createAuditLogEntry(userId, eventType, metadata);
    
    // Add additional fields
    const auditLog = {
      ...logEntry,
      ipAddress,
      serverTimestamp: serverTimestamp(),
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    };
    
    // Write to Firestore audit_logs collection
    await addDoc(collection(db, 'audit_logs'), auditLog);
    
    // Console log in development
    if (import.meta.env.DEV) {
      console.log('🔒 Audit Log:', eventType, metadata);
    }
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw - audit logging should not break app functionality
  }
}

/**
 * Log user login event
 * @param {string} userId - User ID
 * @param {string} email - User email
 */
export async function logUserLogin(userId, email) {
  await logAuditEvent(userId, AuditEvents.USER_LOGIN, { email });
}

/**
 * Log user logout event
 * @param {string} userId - User ID
 */
export async function logUserLogout(userId) {
  await logAuditEvent(userId, AuditEvents.USER_LOGOUT, {});
}

/**
 * Log failed login attempt
 * @param {string} email - Email used in failed attempt
 * @param {string} reason - Reason for failure
 */
export async function logLoginFailed(email, reason) {
  await logAuditEvent('anonymous', AuditEvents.LOGIN_FAILED, { 
    email, 
    reason,
    timestamp: new Date().toISOString()
  });
}

/**
 * Log unauthorized access attempt
 * @param {string} userId - User ID attempting access
 * @param {string} resource - Resource being accessed
 * @param {string} action - Action being attempted
 */
export async function logUnauthorizedAccess(userId, resource, action) {
  await logAuditEvent(userId, AuditEvents.UNAUTHORIZED_ACCESS, { 
    resource, 
    action,
    severity: 'high'
  });
}

/**
 * Log data modification
 * @param {string} userId - User ID
 * @param {string} collection - Firestore collection
 * @param {string} documentId - Document ID
 * @param {string} action - Action (create/update/delete)
 */
export async function logDataModification(userId, collection, documentId, action) {
  await logAuditEvent(userId, AuditEvents.DATA_WRITE, {
    collection,
    documentId,
    action
  });
}

/**
 * Log camera event
 * @param {string} userId - User ID
 * @param {string} eventType - Camera event type
 * @param {string} cameraId - Camera identifier
 * @param {Object} details - Additional details
 */
export async function logCameraEvent(userId, eventType, cameraId, details = {}) {
  await logAuditEvent(userId, eventType, {
    cameraId,
    ...details
  });
}

/**
 * Log hazard detection
 * @param {string} siteId - Site ID where hazard detected
 * @param {string} hazardType - Type of hazard
 * @param {string} severity - Severity level
 */
export async function logHazardDetection(siteId, hazardType, severity) {
  await logAuditEvent('system', AuditEvents.HAZARD_DETECTED, {
    siteId,
    hazardType,
    severity,
    automated: true
  });
}

/**
 * Log report generation
 * @param {string} userId - User who generated report
 * @param {string} reportType - Type of report
 * @param {string} siteId - Site ID
 */
export async function logReportGeneration(userId, reportType, siteId) {
  await logAuditEvent(userId, AuditEvents.REPORT_GENERATED, {
    reportType,
    siteId
  });
}
