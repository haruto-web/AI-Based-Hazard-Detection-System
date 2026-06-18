# ⚡ START HERE - ESP32-CAM Static IP Setup

## 🎯 Goal
Make your ESP32-CAM always use the **same IP address** so you can easily connect it to your HAZORA website.

---

## 📋 What You Need
1. ✅ ESP32-CAM device
2. ✅ Arduino IDE installed
3. ✅ Your Wi-Fi router's IP address

---

## 🚀 3-Minute Setup

### 1️⃣ Find Your Router IP (30 seconds)

**Windows:** Open Command Prompt and type:
```bash
ipconfig
```
Look for "Default Gateway" → Example: `192.168.1.1`

**Mac:** Open Terminal and type:
```bash
ifconfig | grep inet
```

**Typical Router IPs:**
- `192.168.1.1` (most common) ✅
- `192.168.0.1`
- `10.0.0.1`

---

### 2️⃣ Edit Arduino Code (1 minute)

Open `Project_Capstone.ino` and find line 40:

```cpp
#define STATIC_IP         192,168,1,100   // ← CHANGE THIS
#define GATEWAY_IP        192,168,1,1     // ← MATCH YOUR ROUTER
```

**If your router is `192.168.1.1`:**
- ✅ Keep as is: `192,168,1,100`

**If your router is `192.168.0.1`:**
- ⚠️ Change to: `192,168,0,100`
- ⚠️ Change gateway to: `192,168,0,1`

**If your router is `10.0.0.1`:**
- ⚠️ Change to: `10,0,0,100`
- ⚠️ Change gateway to: `10,0,0,1`

---

### 3️⃣ Upload to ESP32-CAM (1 minute)

1. Connect ESP32-CAM via USB
2. Arduino IDE → Tools → Board → **AI Thinker ESP32-CAM**
3. Arduino IDE → Tools → Port → **COM[X]**
4. Click **Upload** button (→)
5. Wait for "Done uploading"

---

### 4️⃣ Connect to Wi-Fi (First Time Only)

1. Power on ESP32-CAM
2. On your phone/laptop, connect to Wi-Fi: **`HAZORA_CAM_SETUP`**
3. A page will open automatically
4. Enter your home/office Wi-Fi name and password
5. Click **Save**

✅ Done! ESP32-CAM now has a fixed IP!

---

### 5️⃣ Use in Website (30 seconds)

1. Open your HAZORA website
2. Go to **Live Streams** page
3. Enter the IP address: `192.168.1.100` (or whatever you configured)
4. Click the **connect arrow** (→)
5. 🎉 **Video appears!**

---

## 📝 Quick Reference

After setup, your ESP32-CAM will always be at:

```
IP Address: 192.168.1.100
Stream URL: http://192.168.1.100:81/stream
Dashboard:  http://192.168.1.100
```

Just enter `192.168.1.100` in your website!

---

## ❓ Problems?

### Can't upload code?
- Check USB cable is connected
- Make sure correct COM port is selected
- Press ESP32-CAM reset button

### Can't connect to Wi-Fi?
- Double-check Wi-Fi password
- Make sure router is 2.4GHz (ESP32 doesn't support 5GHz)
- Try moving closer to router

### Can't access the IP?
1. Test with `ping 192.168.1.100` in Command Prompt
2. Try opening `http://192.168.1.100` in browser
3. Make sure you're on the same Wi-Fi network
4. Check Windows Firewall isn't blocking ports 80/81

---

## 📚 Need More Help?

Read these detailed guides:
- 📖 **STATIC_IP_SETUP_GUIDE.md** - Complete instructions
- 🎨 **STATIC_IP_VISUAL_GUIDE.txt** - Visual flowcharts
- 🎴 **ESP32_QUICK_REFERENCE_CARD.txt** - Printable card
- 📋 **STATIC_IP_UPDATE_SUMMARY.md** - Technical details

---

## 🔢 Multiple Cameras?

**Camera 1:**
```cpp
#define STATIC_IP 192,168,1,100
```
Website: Enter `192.168.1.100`

**Camera 2:**
```cpp
#define STATIC_IP 192,168,1,101
```
Website: Enter `192.168.1.101`

**Camera 3:**
```cpp
#define STATIC_IP 192,168,1,102
```
Website: Enter `192.168.1.102`

---

## ✅ That's It!

Your ESP32-CAM now has a **permanent IP address** that never changes!

- 🚀 Powers on → Same IP every time
- 🎯 No need to check Serial Monitor
- 📱 Just enter IP in website and go

**Happy monitoring with HAZORA! 🎉**
