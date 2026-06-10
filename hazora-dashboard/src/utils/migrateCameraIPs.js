/**
 * Migration Script: Hash Existing Camera IPs
 * Run this once to convert plain-text IPs to SHA-256 hashes
 */

import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { hashCameraIP } from './cameraSecurity';

/**
 * Migrate all existing camera IPs to hashed format
 * WARNING: This will replace plain-text IPs with SHA-256 hashes
 * Make sure to backup your database first!
 */
export async function migrateCameraIPsToHashes() {
  console.log('🔄 Starting camera IP migration to SHA-256 hashes...');
  
  try {
    // Get all users
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let migratedCount = 0;
    let totalIPs = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Check if user has cameras field
      if (!userData.cameras || !Array.isArray(userData.cameras)) {
        console.log(`⏭️  Skipping user ${userId} - no cameras field`);
        continue;
      }
      
      const cameras = userData.cameras;
      const hashedCameras = [];
      let userIPsHashed = 0;
      
      // Process each camera slot
      for (let i = 0; i < cameras.length; i++) {
        const cameraIP = cameras[i];
        
        // Skip empty slots
        if (!cameraIP || cameraIP === '') {
          hashedCameras.push('');
          continue;
        }
        
        // Check if already hashed (SHA-256 hashes are 64 characters)
        if (cameraIP.length === 64 && /^[a-f0-9]+$/i.test(cameraIP)) {
          console.log(`✅ Camera ${i} for user ${userId} already hashed`);
          hashedCameras.push(cameraIP);
          continue;
        }
        
        // Check if it looks like an IP address
        const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/;
        if (!ipRegex.test(cameraIP)) {
          console.warn(`⚠️  Invalid IP format for user ${userId}, camera ${i}: ${cameraIP}`);
          hashedCameras.push('');
          continue;
        }
        
        // Hash the IP
        const hashedIP = await hashCameraIP(cameraIP, userId);
        hashedCameras.push(hashedIP);
        
        // Store actual IP in migration log (temporary, for verification)
        console.log(`🔒 Hashed camera ${i} for user ${userId}:`);
        console.log(`   Original: ${cameraIP}`);
        console.log(`   Hash: ${hashedIP}`);
        
        userIPsHashed++;
        totalIPs++;
      }
      
      // Update user document if any IPs were hashed
      if (userIPsHashed > 0) {
        await updateDoc(doc(db, 'users', userId), {
          cameras: hashedCameras
        });
        
        migratedCount++;
        console.log(`✅ Updated ${userIPsHashed} camera IPs for user ${userId}`);
      }
    }
    
    console.log('\n✅ Migration completed!');
    console.log(`📊 Statistics:`);
    console.log(`   - Users processed: ${usersSnapshot.size}`);
    console.log(`   - Users with cameras migrated: ${migratedCount}`);
    console.log(`   - Total IPs hashed: ${totalIPs}`);
    
    return {
      success: true,
      usersProcessed: usersSnapshot.size,
      usersMigrated: migratedCount,
      totalIPsHashed: totalIPs
    };
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Verify migration - check if all IPs are hashed
 */
export async function verifyMigration() {
  console.log('🔍 Verifying camera IP migration...');
  
  try {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    let totalUsers = 0;
    let usersWithPlainTextIPs = [];
    let usersWithHashedIPs = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      if (!userData.cameras || !Array.isArray(userData.cameras)) {
        continue;
      }
      
      totalUsers++;
      let hasPlainText = false;
      let hasHashed = false;
      
      for (const cameraIP of userData.cameras) {
        if (!cameraIP || cameraIP === '') continue;
        
        // Check if hashed
        if (cameraIP.length === 64 && /^[a-f0-9]+$/i.test(cameraIP)) {
          hasHashed = true;
        } else {
          // Looks like plain text IP
          hasPlainText = true;
          usersWithPlainTextIPs.push({
            userId,
            email: userData.email
          });
        }
      }
      
      if (hasHashed && !hasPlainText) {
        usersWithHashedIPs++;
      }
    }
    
    console.log('\n📊 Verification Results:');
    console.log(`   - Total users with cameras: ${totalUsers}`);
    console.log(`   - Users with hashed IPs: ${usersWithHashedIPs}`);
    console.log(`   - Users with plain-text IPs: ${usersWithPlainTextIPs.length}`);
    
    if (usersWithPlainTextIPs.length > 0) {
      console.log('\n⚠️  Users still with plain-text IPs:');
      usersWithPlainTextIPs.forEach(user => {
        console.log(`   - ${user.email} (${user.userId})`);
      });
    } else {
      console.log('\n✅ All camera IPs are hashed!');
    }
    
    return {
      totalUsers,
      usersWithHashedIPs,
      usersWithPlainTextIPs: usersWithPlainTextIPs.length,
      allHashed: usersWithPlainTextIPs.length === 0
    };
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Rollback migration - convert hashes back to plain text
 * WARNING: This requires you to have the original IPs
 * Only use if you have a backup!
 */
export async function rollbackMigration(ipMappings) {
  console.warn('⚠️  Rolling back migration - converting hashes to plain text');
  console.warn('⚠️  This is a security downgrade!');
  
  // ipMappings should be: { userId: { cameraIndex: ipAddress } }
  
  try {
    let rolledBack = 0;
    
    for (const [userId, cameraMap] of Object.entries(ipMappings)) {
      const userRef = doc(db, 'users', userId);
      const cameras = ['', '', '', '', ''];
      
      for (const [index, ip] of Object.entries(cameraMap)) {
        cameras[parseInt(index)] = ip;
      }
      
      await updateDoc(userRef, { cameras });
      rolledBack++;
      console.log(`✅ Rolled back cameras for user ${userId}`);
    }
    
    console.log(`\n✅ Rollback completed for ${rolledBack} users`);
    return { success: true, rolledBack };
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    return { success: false, error: error.message };
  }
}
