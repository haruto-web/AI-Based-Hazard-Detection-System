# ⚡ ESP32-CAM Upload & Test Guide

## 🎯 **READY TO UPLOAD - NO CONFIGURATION NEEDED!**

Your code is now **safe to upload directly** without any changes!

---

## 📋 **What I Changed:**

### ✅ **Default: DHCP Mode (Automatic IP)**
```cpp
#define USE_STATIC_IP false  // ← Starts with automatic IP
```

**This means:**
- ✅ Works on ANY network (no configuration needed)
- ✅ Router automatically assigns IP
- ✅ Perfect for first-time testing
- ✅ Zero chance of network conflicts

### ✅ **Better Error Messages**
- Clear emojis in Serial Monitor (✅ ❌ ⚠️)
- Step-by-step instructions displayed
- Network info automatically shown
- Easy-to-read formatting

### ✅ **Smart Instructions**
- Serial Monitor shows if you need static IP
- Tells you exactly what to change
- No guessing needed!

---

## 🚀 **UPLOAD STEPS (5 Minutes)**

### **Step 1: Connect ESP32-CAM**
```
1. Connect ESP32-CAM to USB programmer
2. Make sure GPIO0 is connected to GND (for upload mode)
3. Power on the board
```

### **Step 2: Select Board & Port**

**Arduino IDE:**
```
Tools → Board → ESP32 Arduino → AI Thinker ESP32-CAM
Tools → Port → COM[X] (select your port)
```

**Board Settings (verify these):**
```
Upload Speed: 115200
Flash Frequency: 80MHz
Flash Mode: QIO
Partition Scheme: Huge APP (3MB No OTA)
```

### **Step 3: Upload Code**
```
1. Click Upload button (→) or press Ctrl+U
2. Wait for "Connecting..."
3. If stuck, press RESET button on ESP32-CAM
4. Wait for "Done uploading"
5. ✅ Success!
```

### **Step 4: Disconnect GPIO0 from GND**
```
After upload completes:
1. Disconnect GPIO0 from GND
2. Press RESET button
3. ESP32-CAM will now run normally
```

### **Step 5: Open Serial Monitor**
```
Tools → Serial Monitor
Set Baud Rate: 115200
```

---

## 📺 **What You'll See in Serial Monitor:**

### **First Boot (No Wi-Fi Saved):**

```
========================================
  🎥 HAZORA - Hazard Detection System
  ESP32-CAM v2.2 (Auto-Config Update)
========================================

[WIFI] Starting WiFiManager...
[WIFI] If no credentials saved, connect to AP: HAZORA_CAM_SETUP
[WIFI] Creating access point...
[WIFI] Setup portal running at: 192.168.4.1
```

**What this means:**
- ✅ ESP32-CAM created a Wi-Fi hotspot
- ✅ You need to connect to it
- ✅ Continue to Step 6 below

---

### **Step 6: Connect to Wi-Fi Setup**

**On Your Phone/Laptop:**
```
1. Go to Wi-Fi settings
2. Connect to: HAZORA_CAM_SETUP
3. Password: (none - open network)
4. Browser should open automatically
   (If not, go to: 192.168.4.1)
```

**Setup Page:**
```
1. Click "Configure WiFi"
2. Select your Wi-Fi network from list
3. Enter password
4. Click "Save"
5. ESP32-CAM will restart
```

---

### **After Wi-Fi Setup (Success!):**

```
========================================
  🎥 HAZORA - Hazard Detection System
  ESP32-CAM v2.2 (Auto-Config Update)
========================================

[WIFI] Starting WiFiManager...
[WIFI] Connected to saved network!
[WIFI] Using DHCP (automatic IP assignment)
[WIFI] ✅ Connected successfully!
[CAM] PSRAM found - using VGA with 2 frame buffers
[CAM] Camera initialized successfully (VGA streaming, mirrored)
[HTTP] Stream server started on port 81
[HTTP] Camera server started on port 80

========================================
  ✅ READY! Device is online and streaming
========================================

📡 NETWORK INFORMATION:
   IP Address:  192.168.1.145
   Gateway:     192.168.1.1
   Subnet:      255.255.255.0
   WiFi SSID:   YourWiFiName
   Signal:      -45 dBm

🌐 ACCESS URLS:
   Dashboard:   http://192.168.1.145
   Stream:      http://192.168.1.145:81/stream
   Capture:     http://192.168.1.145/capture
   Status:      http://192.168.1.145/status

📌 FOR YOUR HAZORA WEBSITE:
   Enter this IP in Live Streams page: 192.168.1.145

⚠️  DHCP Mode: IP may change after power cycle
   To fix IP permanently:
   1. Note the Gateway IP above
   2. Edit code: USE_STATIC_IP = true
   3. Set GATEWAY_IP to match above
   4. Re-upload code
========================================
```

---

## ✅ **TEST YOUR ESP32-CAM**

### **Test 1: Open Dashboard in Browser**

```
1. Copy the IP from Serial Monitor (e.g., 192.168.1.145)
2. Open browser
3. Go to: http://192.168.1.145
4. You should see HAZORA Camera Monitor dashboard
5. Live video should appear!
```

**If it works:** ✅ Perfect! Continue to Test 2

**If it doesn't work:**
- Check you're on the same Wi-Fi network
- Verify IP address is correct
- Try pinging: `ping 192.168.1.145`

---

### **Test 2: Test Stream Endpoint**

```
In browser, go to: http://192.168.1.145:81/stream

You should see:
✅ Raw video stream
✅ Updates continuously
✅ Good quality (640x480)
```

---

### **Test 3: Test in Your HAZORA Website**

```
1. Open your HAZORA dashboard
2. Navigate to "Live Streams" page
3. In Stream 1 box, enter: 192.168.1.145
4. Click Connect arrow (→)
5. ✅ Video should appear!
```

---

## 🔄 **Want Static IP? (Optional)**

### **After successful test, if you want the IP to never change:**

**Step 1: Note Your Network Info**
```
From Serial Monitor, write down:
- Gateway: 192.168.1.1 (your router IP)
```

**Step 2: Edit Code**
```cpp
// Line 50: Change to true
#define USE_STATIC_IP     true

// Line 58: Match your router
#define GATEWAY_IP        192,168,1,1  // ← Change if different

// Line 57: Pick an unused IP
#define STATIC_IP         192,168,1,100
```

**Step 3: Re-upload**
```
Upload → Reset → Check Serial Monitor
IP should now be: 192.168.1.100 (never changes!)
```

---

## 🆘 **TROUBLESHOOTING**

### **Problem: "Serial port not found"**

**Solution:**
```
1. Install USB driver:
   - CP210x: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
   - CH340: http://www.wch.cn/downloads/CH341SER_ZIP.html
2. Restart Arduino IDE
3. Reconnect ESP32-CAM
```

---

### **Problem: "Board not responding"**

**Solution:**
```
1. Make sure GPIO0 is connected to GND during upload
2. Hold BOOT button while clicking upload
3. Release after "Connecting..." appears
4. Some boards need manual reset timing
```

---

### **Problem: Upload fails at 99%**

**Solution:**
```
1. Reduce upload speed:
   Tools → Upload Speed → 115200 (slower)
2. Try again
```

---

### **Problem: "Camera init failed"**

**Solution:**
```
1. Check camera cable is properly connected
2. Make sure it's AI-Thinker ESP32-CAM board
3. Try pressing reset button
4. Re-upload code
```

---

### **Problem: "Portal timed out"**

**Solution:**
```
1. This happens if you don't connect to Wi-Fi within 3 minutes
2. ESP32-CAM will restart automatically
3. Try connecting to "HAZORA_CAM_SETUP" again
4. Or press reset button to restart
```

---

### **Problem: Can't connect to "HAZORA_CAM_SETUP"**

**Solution:**
```
1. Wait 30 seconds after ESP32-CAM boots
2. Check your phone's Wi-Fi list again
3. Make sure GPIO0 is NOT connected to GND (remove it!)
4. Press reset button
```

---

### **Problem: Connected to Wi-Fi but no video**

**Solution:**
```
1. Check Serial Monitor for the IP address
2. Make sure you're on the same Wi-Fi network
3. Try accessing: http://[IP]:81/stream directly
4. Check firewall isn't blocking
```

---

### **Problem: Video very slow/laggy**

**Solution:**
```
1. Check Wi-Fi signal strength (RSSI in Serial Monitor)
2. Move ESP32-CAM closer to router
3. Check router's upload speed
4. Reduce simultaneous viewers (max 3)
```

---

## 📊 **Expected Performance:**

### **Normal Operation:**
```
Resolution: 640x480 (VGA)
Frame Rate: 15 FPS
Bitrate: ~500 Kbps
Latency: 1-2 seconds
Concurrent viewers: Up to 3
Memory free: 200-300 KB
```

### **Health Monitoring (Every 30s in Serial):**
```
[HEALTH] Heap: 245632 bytes | RSSI: -45 dBm | Clients: 1 | Frames: 1234
```

**What it means:**
- **Heap:** Available memory (should be > 100KB)
- **RSSI:** Signal strength (-30 to -50 = excellent, -50 to -70 = good)
- **Clients:** Number of active viewers
- **Frames:** Total frames streamed since boot

---

## ✅ **SUCCESS CHECKLIST**

After upload, verify:

- [ ] Serial Monitor shows "✅ READY!"
- [ ] IP address displayed clearly
- [ ] Can open dashboard in browser
- [ ] Can access stream: http://[IP]:81/stream
- [ ] Video plays in HAZORA website
- [ ] No error messages in Serial Monitor
- [ ] Health stats logging every 30 seconds

**If all checked:** 🎉 **Perfect! Your ESP32-CAM is working!**

---

## 🌐 **NEXT STEPS:**

### **For Local Use Only:**
✅ You're done! Just use the IP in your website

### **For Remote Access (Different Sites):**
📖 Read: `HEAD_MANAGER_QUICK_START.md`
- Set up port forwarding (15 min)
- Configure DDNS (5 min)
- Access from anywhere!

---

## 💡 **QUICK TIPS:**

### **Tip 1: Bookmark the IP**
```
Save in browser bookmarks:
- Dashboard: http://192.168.1.145
- Stream: http://192.168.1.145:81/stream
```

### **Tip 2: Monitor Health**
```
Check Serial Monitor occasionally:
- Memory should stay > 100KB
- RSSI should be > -70 dBm
- No restart messages
```

### **Tip 3: Power Supply**
```
Use 5V 1A+ power supply (NOT laptop USB!)
Weak power = crashes and poor video
```

### **Tip 4: Camera Position**
```
Test camera angle in dashboard before mounting
Use web interface to verify view
```

---

## 🎉 **YOU'RE READY!**

Your code is **safe to upload right now**. No configuration needed for first test!

Just:
1. Upload code
2. Connect to "HAZORA_CAM_SETUP"
3. Enter Wi-Fi credentials
4. Get IP from Serial Monitor
5. Use in website

**That's it!** 🚀

---

## 📞 **SUPPORT:**

- Serial Monitor not working? → Check baud rate (115200)
- Need static IP? → Follow optional steps above
- Remote access needed? → Read `HEAD_MANAGER_QUICK_START.md`
- Other issues? → Check troubleshooting section

**Happy streaming with HAZORA!** 🎥
