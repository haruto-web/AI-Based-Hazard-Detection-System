# ESP32-CAM Static IP Setup Guide

## Overview
The ESP32-CAM is now configured to use a **static (fixed) IP address** instead of a dynamic one. This means:
- ✅ The IP address **never changes** when you power cycle the device
- ✅ You can **always connect** using the same IP
- ✅ No need to check Serial Monitor every time

---

## Before You Start

### Find Your Network Information

You need to know your router's IP address range. Here's how:

**On Windows:**
1. Press `Win + R`, type `cmd`, press Enter
2. Type: `ipconfig`
3. Look for these values:
   - **IPv4 Address**: Your computer's IP (e.g., `192.168.1.50`)
   - **Default Gateway**: Your router IP (e.g., `192.168.1.1`)
   - **Subnet Mask**: Usually `255.255.255.0`

**On Mac:**
1. Open Terminal
2. Type: `ifconfig | grep inet`
3. Or go to System Preferences → Network

**Common Router IP Ranges:**
- `192.168.1.x` (most common)
- `192.168.0.x`
- `10.0.0.x`
- `192.168.100.x`

---

## Configuration Steps

### Step 1: Edit the Arduino Code

Open `Project_Capstone.ino` and find these lines (around line 40):

```cpp
// =============================================================================
// Static IP Configuration (Change these to match your network)
// =============================================================================
#define USE_STATIC_IP     true            // Set to false to use DHCP (dynamic IP)
#define STATIC_IP         192,168,1,100   // Device IP - CHANGE THIS to match your network
#define GATEWAY_IP        192,168,1,1     // Router IP - usually ends in .1
#define SUBNET_MASK       255,255,255,0   // Subnet mask - usually this value
#define PRIMARY_DNS       8,8,8,8         // Google DNS (optional)
#define SECONDARY_DNS     8,8,4,4         // Google DNS backup (optional)
```

### Step 2: Customize Your IP Settings

**Example 1: If your router is `192.168.1.1`**
```cpp
#define STATIC_IP         192,168,1,100   // ✅ Keep this (or change to 192,168,1,101, 102, etc.)
#define GATEWAY_IP        192,168,1,1     // ✅ Keep this
#define SUBNET_MASK       255,255,255,0   // ✅ Keep this
```

**Example 2: If your router is `192.168.0.1`**
```cpp
#define STATIC_IP         192,168,0,100   // ⚠️ Change to .0.100
#define GATEWAY_IP        192,168,0,1     // ⚠️ Change to .0.1
#define SUBNET_MASK       255,255,255,0   // ✅ Keep this
```

**Example 3: If your router is `10.0.0.1`**
```cpp
#define STATIC_IP         10,0,0,100      // ⚠️ Change to 10.0.0.100
#define GATEWAY_IP        10,0,0,1        // ⚠️ Change to 10.0.0.1
#define SUBNET_MASK       255,255,255,0   // ✅ Keep this
```

### Step 3: Choose an Available IP

**Important:** Pick an IP that's NOT already used by another device!

**Recommended:** Use `.100` or higher (e.g., `192.168.1.100`, `192.168.1.101`, etc.)

**To check if an IP is available:**
```bash
# Windows
ping 192.168.1.100

# Mac/Linux
ping 192.168.1.100
```

If you get "Request timed out" or "Host is down" → ✅ IP is free to use!

### Step 4: Upload the Code

1. Open Arduino IDE
2. Select your ESP32-CAM board: **Tools → Board → AI Thinker ESP32-CAM**
3. Select the correct COM port: **Tools → Port → COM[X]**
4. Click **Upload** (→ button)
5. Wait for "Done uploading" message

### Step 5: Connect to Wi-Fi (First Time Only)

1. Power on the ESP32-CAM
2. On your phone/laptop, connect to Wi-Fi: **`HAZORA_CAM_SETUP`**
3. A setup page will open automatically
4. Enter your Wi-Fi name (SSID) and password
5. Click "Save"

### Step 6: Verify Static IP

1. Open Serial Monitor: **Tools → Serial Monitor**
2. Set baud rate to **115200**
3. You should see:

```
========================================
  HAZORA - Hazard Detection System
  ESP32-CAM v2.1 (Static IP Update)
========================================
[WIFI] Static IP configured successfully!
[WIFI] Connected successfully!
[WIFI] IP Address: 192.168.1.100
[WIFI] Gateway: 192.168.1.1
[WIFI] Subnet: 255.255.255.0
========================================
  READY! Use these URLs:
========================================
  Dashboard: http://192.168.1.100
  Stream:    http://192.168.1.100:81/stream

📌 FOR WEBSITE: Enter this IP in your dashboard:
   ➜  192.168.1.100
========================================
```

---

## Using the Static IP in Your React Dashboard

### Method 1: Direct Entry
1. Open your HAZORA web dashboard
2. Go to **Live Streams** page
3. Enter the static IP: `192.168.1.100`
4. Click the connect arrow → Video starts streaming!

### Method 2: Test in Browser First
1. Open browser
2. Go to: `http://192.168.1.100`
3. You should see the HAZORA Camera Monitor dashboard
4. If it works, copy the IP to your React dashboard

---

## Troubleshooting

### Problem: "Static IP configured" but can't connect

**Solution 1: IP Conflict**
- Another device might be using that IP
- Change `STATIC_IP` to a different value (e.g., `192,168,1,101`)
- Re-upload the code

**Solution 2: Wrong Gateway**
- Your router IP might be different
- Run `ipconfig` again and verify the "Default Gateway"
- Update `GATEWAY_IP` in the code

**Solution 3: Firewall Blocking**
- Windows Firewall might block port 81
- Temporarily disable firewall to test
- Or add exception for port 80 and 81

### Problem: "WARNING: Failed to configure static IP"

**Solution:**
- Your router might not support static IP on that address
- Try switching to DHCP mode: `#define USE_STATIC_IP false`
- Or enable "Static IP Reservation" in your router settings instead

### Problem: Device keeps restarting

**Solution:**
- The IP settings might be invalid
- Set `USE_STATIC_IP` to `false` temporarily
- Re-upload and check the dynamic IP first
- Then configure static IP with correct values

---

## Advanced: Router-Based Static IP (Alternative Method)

Instead of configuring static IP in the ESP32-CAM code, you can:

1. Set `#define USE_STATIC_IP false` in the code
2. Let the ESP32-CAM get a dynamic IP
3. Check the MAC address in Serial Monitor
4. Log into your router settings (usually `192.168.1.1`)
5. Find "DHCP Reservation" or "Static IP Assignment"
6. Reserve the IP for the ESP32-CAM's MAC address

**Pros:**
- No code changes needed
- Works across different networks
- Easier to manage multiple devices

**Cons:**
- Requires router admin access
- Different for each router brand

---

## Multiple ESP32-CAM Devices

If you have 3 cameras, assign different IPs:

```cpp
// Camera 1
#define STATIC_IP 192,168,1,100

// Camera 2
#define STATIC_IP 192,168,1,101

// Camera 3
#define STATIC_IP 192,168,1,102
```

Then in your React dashboard:
- Stream 1: `192.168.1.100`
- Stream 2: `192.168.1.101`
- Stream 3: `192.168.1.102`

---

## Quick Reference Card

Print this and keep it with your device:

```
┌─────────────────────────────────────┐
│   HAZORA ESP32-CAM Quick Reference  │
├─────────────────────────────────────┤
│ Static IP: 192.168.1.100            │
│ Gateway:   192.168.1.1              │
│ Stream:    http://192.168.1.100:81/stream │
│                                     │
│ Enter in website: 192.168.1.100    │
└─────────────────────────────────────┘
```

---

## Summary

✅ **Static IP = Same IP every time**
✅ **No Serial Monitor needed after setup**
✅ **Just enter the IP in your dashboard**
✅ **Works reliably for production use**

Your ESP32-CAM is now ready for consistent, hassle-free operation! 🎉
