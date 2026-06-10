/**
 * Camera IP Security with SHA-256 Hashing
 * Stores only hashed IPs in Firestore for security
 */

import { computeSHA256, generateSalt } from './security';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Hash a camera IP address with salt for secure storage
 * @param {string} ipAddress - Camera IP address (e.g., "192.168.254.144")
 * @param {string} salt - Optional salt (uses user ID if not provided)
 * @returns {Promise<string>} - SHA-256 hash of IP
 */
export async function hashCameraIP(ipAddress, salt = '') {
  const combined = `${ipAddress}:${salt}`;
  return await computeSHA256(combined);
}

/**
 * Validate IP address format
 * @param {string} ip - IP address to validate
 * @returns {boolean} - True if valid IP format
 */
export function isValidIP(ip) {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipRegex.test(ip)) return false;
  
  const parts = ip.split('.');
  return parts.every(part => {
    const num = parseInt(part, 10);
    return num >= 0 && num <= 255;
  });
}

/**
 * Validate IP:PORT format
 * @param {string} ipWithPort - IP:PORT string (e.g., "192.168.1.100:8080")
 * @returns {boolean} - True if valid format
 */
export function isValidIPWithPort(ipWithPort) {
  const parts = ipWithPort.split(':');
  if (parts.length !== 2) return false;
  
  const ip = parts[0];
  const port = parseInt(parts[1], 10);
  
  return isValidIP(ip) && port > 0 && port <= 65535;
}

/**
 * Store camera IP securely
 * Hashes the IP with user ID as salt, stores hash in Firestore
 * Actual IP stored only in sessionStorage (cleared on browser close)
 * 
 * @param {string} userId - User ID
 * @param {number} cameraIndex - Camera slot (0-4)
 * @param {string} ipAddress - Camera IP address
 * @returns {Promise<Object>} - { hash, success }
 */
export async function storeCameraIPSecurely(userId, cameraIndex, ipAddress) {
  try {
    // Validate IP format
    if (!isValidIP(ipAddress) && !isValidIPWithPort(ipAddress)) {
      throw new Error('Invalid IP address format');
    }
    
    // Hash the IP with user ID as salt
    const ipHash = await hashCameraIP(ipAddress, userId);
    
    // Get current user document
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('User document not found');
    }
    
    const userData = userDoc.data();
    const cameras = userData.cameras || ['', '', '', '', ''];
    
    // Store only the hash in Firestore
    cameras[cameraIndex] = ipHash;
    
    await updateDoc(userRef, {
      cameras: cameras
    });
    
    // Store actual IP in sessionStorage (cleared when browser closes)
    const storageKey = `camera_${userId}_${cameraIndex}`;
    sessionStorage.setItem(storageKey, ipAddress);
    
    // Also store hash-to-IP mapping for verification
    const hashMapKey = `camera_hash_${ipHash}`;
    sessionStorage.setItem(hashMapKey, ipAddress);
    
    return {
      success: true,
      hash: ipHash,
      message: 'Camera IP stored securely'
    };
    
  } catch (error) {
    console.error('Error storing camera IP:', error);
    return {
      success: false,
      hash: null,
      message: error.message
    };
  }
}

/**
 * Retrieve actual camera IP from session storage
 * @param {string} userId - User ID
 * @param {number} cameraIndex - Camera slot (0-4)
 * @returns {string|null} - Camera IP or null if not found
 */
export function getCameraIP(userId, cameraIndex) {
  const storageKey = `camera_${userId}_${cameraIndex}`;
  return sessionStorage.getItem(storageKey);
}

/**
 * Retrieve camera IP by hash
 * @param {string} ipHash - SHA-256 hash of IP
 * @returns {string|null} - Camera IP or null if not found
 */
export function getCameraIPByHash(ipHash) {
  const hashMapKey = `camera_hash_${ipHash}`;
  return sessionStorage.getItem(hashMapKey);
}

/**
 * Verify if a camera IP matches a stored hash
 * @param {string} ipAddress - IP to verify
 * @param {string} storedHash - Hash from Firestore
 * @param {string} userId - User ID (used as salt)
 * @returns {Promise<boolean>} - True if IP matches hash
 */
export async function verifyCameraIP(ipAddress, storedHash, userId) {
  const computedHash = await hashCameraIP(ipAddress, userId);
  return computedHash === storedHash;
}

/**
 * Load all camera IPs from Firestore and restore to session
 * Call this after user login
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of camera hashes
 */
export async function loadCameraHashes(userId) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return [];
    }
    
    const userData = userDoc.data();
    return userData.cameras || ['', '', '', '', ''];
    
  } catch (error) {
    console.error('Error loading camera hashes:', error);
    return [];
  }
}

/**
 * Remove camera IP from storage
 * @param {string} userId - User ID
 * @param {number} cameraIndex - Camera slot (0-4)
 * @returns {Promise<boolean>} - Success status
 */
export async function removeCameraIP(userId, cameraIndex) {
  try {
    // Get current hash before removing
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return false;
    }
    
    const userData = userDoc.data();
    const cameras = userData.cameras || ['', '', '', '', ''];
    const oldHash = cameras[cameraIndex];
    
    // Remove from Firestore
    cameras[cameraIndex] = '';
    await updateDoc(userRef, { cameras });
    
    // Remove from sessionStorage
    const storageKey = `camera_${userId}_${cameraIndex}`;
    sessionStorage.removeItem(storageKey);
    
    if (oldHash) {
      const hashMapKey = `camera_hash_${oldHash}`;
      sessionStorage.removeItem(hashMapKey);
    }
    
    return true;
    
  } catch (error) {
    console.error('Error removing camera IP:', error);
    return false;
  }
}

/**
 * Clear all camera IPs from session storage
 * Call this on logout
 * @param {string} userId - User ID
 */
export function clearCameraCache(userId) {
  for (let i = 0; i < 5; i++) {
    const storageKey = `camera_${userId}_${i}`;
    sessionStorage.removeItem(storageKey);
  }
  
  // Also clear hash mappings
  Object.keys(sessionStorage)
    .filter(key => key.startsWith('camera_hash_'))
    .forEach(key => sessionStorage.removeItem(key));
}

/**
 * Generate a secure camera authentication token
 * Used for ESP32-CAM to authenticate with the server
 * @param {string} cameraIP - Camera IP address
 * @param {string} userId - User ID
 * @returns {Promise<string>} - Authentication token
 */
export async function generateCameraToken(cameraIP, userId) {
  const timestamp = Date.now();
  const data = `${cameraIP}:${userId}:${timestamp}`;
  return await computeSHA256(data);
}

/**
 * Create camera configuration object for secure storage
 * @param {string} ipAddress - Camera IP
 * @param {string} streamPort - Stream port (default 81)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Camera config with hash
 */
export async function createCameraConfig(ipAddress, streamPort = '81', userId) {
  const ipHash = await hashCameraIP(ipAddress, userId);
  const token = await generateCameraToken(ipAddress, userId);
  
  return {
    ipHash,
    streamPort,
    token,
    lastConnected: null,
    status: 'disconnected',
    createdAt: new Date().toISOString()
  };
}

/**
 * Build camera stream URL from IP
 * @param {string} ipAddress - Camera IP
 * @param {string} port - Stream port (default 81)
 * @returns {string} - Stream URL
 */
export function buildStreamURL(ipAddress, port = '81') {
  // Remove any existing port from IP
  const cleanIP = ipAddress.split(':')[0];
  return `http://${cleanIP}:${port}/stream`;
}

/**
 * Validate camera connection
 * Tests if camera is reachable
 * @param {string} streamURL - Camera stream URL
 * @returns {Promise<boolean>} - True if camera is reachable
 */
export async function testCameraConnection(streamURL) {
  try {
    const response = await fetch(streamURL, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-cache'
    });
    return true;
  } catch (error) {
    console.warn('Camera connection test failed:', error);
    return false;
  }
}
