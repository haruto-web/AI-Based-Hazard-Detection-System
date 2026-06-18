# 🌐 ESP32-CAM Remote Access Setup Guide
## View Cameras from Different Sites/Networks

---

## Your Scenario
- 🏢 **You:** Head Manager at Main Office
- 📷 **Cameras:** Located at different construction sites
- 🌐 **Problem:** Different Wi-Fi networks at each location
- 🎯 **Goal:** View all site cameras from your main office

---

## 3 Solutions (Choose One)

### 🥇 **Solution 1: Port Forwarding (RECOMMENDED)**
Best for: Permanent installations, reliable access

### 🥈 **Solution 2: VPN (Most Secure)**
Best for: Security-sensitive environments

### 🥉 **Solution 3: Cloud Tunnel (Easiest Setup)**
Best for: Quick deployment, temporary sites

---

# 🥇 Solution 1: PORT FORWARDING

## How It Works
```
Internet
   ↕
Your Office Router (Public IP: 203.45.67.89)
   ↕
Your Computer → Access: http://203.45.67.89:8081/stream
   
   
Site A Router (Public IP: 198.23.45.12)
   ↕
ESP32-CAM (.100) → Forward Port 8081 → 192.168.1.100:81
```

## Setup Steps

### Step 1: Get Site Router's Public IP

At each construction site, open browser and go to:
```
https://whatismyipaddress.com
```

Write down the public IP (e.g., `198.23.45.12`)

---

### Step 2: Configure Router Port Forwarding

1. **Access Router Admin Panel**
   - Usually: `http://192.168.1.1` or `http://192.168.0.1`
   - Login with admin credentials

2. **Find Port Forwarding Settings**
   - Look for: "Port Forwarding", "Virtual Server", "NAT"
   - Different routers have different names

3. **Add Port Forwarding Rule**
   ```
   Service Name:     HAZORA_CAM_1
   External Port:    8081
   Internal IP:      192.168.1.100  (ESP32-CAM IP)
   Internal Port:    81
   Protocol:         TCP
   ```

4. **Save and Reboot Router**

---

### Step 3: Test Access

From your office computer:
```
http://198.23.45.12:8081/stream
```

If it works → You see the video stream! ✅

---

### Step 4: Configure in Your Website

In HAZORA dashboard "Live Streams", enter:

**Site A Camera:**
```
198.23.45.12:8081
```

**Site B Camera:**
```
203.56.78.90:8082
```

**Site C Camera:**
```
180.12.34.56:8083
```

---

### Port Forwarding Examples by Router Brand

#### TP-Link Routers
1. Advanced → NAT Forwarding → Virtual Servers
2. Add New
3. Enter details above
4. Save

#### Netgear Routers
1. Advanced → Advanced Setup → Port Forwarding
2. Add Custom Service
3. Enter details above
4. Apply

#### Asus Routers
1. WAN → Virtual Server / Port Forwarding
2. Enable Port Forwarding → Yes
3. Add Profile
4. Enter details above
5. Apply

#### Linksys Routers
1. Security → Apps and Gaming
2. Single Port Forwarding
3. Enter details above
4. Save Settings

---

### Security Tips for Port Forwarding

⚠️ **Important Security Measures:**

1. **Use Non-Standard Ports**
   - Don't use 81 externally
   - Use 8081, 8082, 8083, etc.

2. **Enable Router Firewall**
   - Keep router firewall ON
   - Only allow specific ports

3. **Change Default Router Password**
   - Never use admin/admin
   - Use strong password

4. **Use HTTPS (Optional Advanced)**
   - Encrypt the stream
   - Requires SSL certificate

5. **Whitelist Your Office IP (Optional)**
   - Some routers allow "source IP restriction"
   - Only allow your office IP to access

---

### Multiple Cameras per Site

If you have 3 cameras at Site A:

**Router Port Forwarding:**
```
External 8081 → 192.168.1.100:81 (Camera 1)
External 8082 → 192.168.1.101:81 (Camera 2)
External 8083 → 192.168.1.102:81 (Camera 3)
```

**In Your Website:**
```
Site A - Camera 1: 198.23.45.12:8081
Site A - Camera 2: 198.23.45.12:8082
Site A - Camera 3: 198.23.45.12:8083
```

---

### Dynamic IP Problem & Solution

⚠️ **Problem:** Most ISPs give dynamic public IPs that change

**Solution: Use DDNS (Dynamic DNS)**

1. **Register for Free DDNS Service:**
   - No-IP.com (free tier available)
   - DuckDNS.org (completely free)
   - DynDNS.com

2. **Create a Hostname:**
   - Example: `site-a-hazora.duckdns.org`

3. **Configure DDNS in Router:**
   - Most routers have DDNS settings
   - Enter your DDNS credentials
   - Router will auto-update IP

4. **Use in Website:**
   ```
   site-a-hazora.duckdns.org:8081
   site-b-hazora.duckdns.org:8082
   site-c-hazora.duckdns.org:8083
   ```

Now even if public IP changes, the hostname stays the same! ✅

---

# 🥈 Solution 2: VPN ACCESS

## How It Works
```
Your Office Computer → VPN Client → Connect to Site A VPN
   ↓
Now your computer is "virtually" on Site A network
   ↓
Access ESP32-CAM as if local: http://192.168.1.100:81/stream
```

## Setup Options

### Option A: Software VPN (WireGuard)

**At Each Construction Site:**
1. Install WireGuard on site router or Raspberry Pi
2. Generate VPN keys
3. Give you VPN config file

**At Your Office:**
1. Install WireGuard client
2. Import site config
3. Connect → Access cameras via local IP

**Pros:**
- ✅ Most secure
- ✅ No port forwarding needed
- ✅ Encrypted tunnel

**Cons:**
- ❌ Requires technical setup
- ❌ Need device at site to run VPN server

---

### Option B: Cloud VPN (Tailscale) - EASIEST VPN

**Tailscale** creates a private network across all your devices.

**Setup Steps:**

1. **Install Tailscale on Site Router** (if supported) or Raspberry Pi
   ```
   https://tailscale.com/download
   ```

2. **Install Tailscale on Your Office Computer**

3. **All devices get private IPs:**
   ```
   Site A Router: 100.64.1.10
   Site B Router: 100.64.1.20
   Site C Router: 100.64.1.30
   ```

4. **Access Cameras:**
   ```
   http://100.64.1.10/camera1
   http://100.64.1.20/camera1
   ```

**Pros:**
- ✅ Super easy setup
- ✅ Free for personal use
- ✅ Works behind any firewall
- ✅ Encrypted

**Cons:**
- ❌ Requires Tailscale client running
- ❌ Need device at site (router or Pi)

---

# 🥉 Solution 3: CLOUD TUNNEL (No Router Config!)

## Best Option: Cloudflare Tunnel (Free!)

### How It Works
```
ESP32-CAM → Raspberry Pi (at site) → Cloudflare Tunnel
   ↓
Public URL: https://site-a-cam.yourdomain.com
   ↓
Access from anywhere in the world!
```

### What You Need at Each Site
- ESP32-CAM (your camera)
- Raspberry Pi or old laptop (to run tunnel)
- Internet connection

### Setup Steps

#### 1. Install Cloudflare Tunnel on Raspberry Pi

```bash
# On Raspberry Pi at construction site
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared
sudo mv cloudflared /usr/local/bin/
sudo chmod +x /usr/local/bin/cloudflared

# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create site-a-hazora

# Configure tunnel
nano ~/.cloudflared/config.yml
```

#### 2. Config File
```yaml
tunnel: <tunnel-id-from-previous-step>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: site-a-cam.yourdomain.com
    service: http://192.168.1.100:81
  - service: http_status:404
```

#### 3. Run Tunnel
```bash
cloudflared tunnel run site-a-hazora
```

#### 4. Access from Anywhere
```
https://site-a-cam.yourdomain.com/stream
```

---

### Alternative: Ngrok (Even Easier, But Paid)

**Setup (5 minutes):**

1. **Install ngrok on Raspberry Pi at site:**
   ```bash
   wget https://bin.equinox.io/c/4VmDzA7iaHb/ngrok-stable-linux-arm64.zip
   unzip ngrok-stable-linux-arm64.zip
   ./ngrok authtoken YOUR_TOKEN
   ```

2. **Start tunnel:**
   ```bash
   ./ngrok http 192.168.1.100:81
   ```

3. **Get public URL:**
   ```
   Forwarding: https://abc123.ngrok.io -> 192.168.1.100:81
   ```

4. **Use in website:**
   ```
   https://abc123.ngrok.io/stream
   ```

**Pros:**
- ✅ No router configuration
- ✅ Works through any firewall
- ✅ HTTPS included
- ✅ 5-minute setup

**Cons:**
- ❌ Free tier has random URLs (changes on restart)
- ❌ Paid tier ($8/mo) for fixed URLs
- ❌ Need device at site to run ngrok

---

# 📊 COMPARISON TABLE

| Feature | Port Forward | VPN | Cloud Tunnel |
|---------|-------------|-----|--------------|
| **Setup Difficulty** | Medium | Hard | Easy |
| **Router Access Needed** | ✅ Yes | ⚠️ Maybe | ❌ No |
| **Extra Device at Site** | ❌ No | ✅ Yes | ✅ Yes (Pi) |
| **Security** | Medium | High | High |
| **Cost** | Free | Free | Free/Paid |
| **Works Behind Firewall** | ❌ No | ✅ Yes | ✅ Yes |
| **Internet Speed** | Fast | Fast | Medium |
| **Reliability** | High | High | Medium |
| **Multiple Sites** | Easy | Medium | Easy |

---

# 🎯 MY RECOMMENDATION FOR YOU

## **Best Solution: Port Forwarding + DDNS**

**Why:**
- ✅ No extra hardware needed
- ✅ Direct connection = fastest streaming
- ✅ One-time setup at each site
- ✅ Free forever
- ✅ Most reliable

**What to Do:**

### **At Each Construction Site (One Time Setup):**

1. **Configure Router Port Forwarding**
   - External Port: 8081, 8082, 8083 (different for each camera)
   - Internal IP: 192.168.1.100 (ESP32-CAM)
   - Internal Port: 81

2. **Set Up DDNS** (if IP is dynamic)
   - Register: `site-a.duckdns.org`
   - Configure in router
   - Update every 5 minutes automatically

3. **Write Down:**
   ```
   Site A: site-a.duckdns.org:8081
   Site B: site-b.duckdns.org:8082
   Site C: site-c.duckdns.org:8083
   ```

### **At Your Main Office:**

Open HAZORA website, enter:
```
Stream 1: site-a.duckdns.org:8081
Stream 2: site-b.duckdns.org:8082
Stream 3: site-c.duckdns.org:8083
```

**Done!** You can now view all construction sites from your office! 🎉

---

# 🔐 SECURITY CHECKLIST

Before deploying, ensure:

- [ ] Router admin password changed from default
- [ ] ESP32-CAM on separate VLAN (if possible)
- [ ] Non-standard external ports used (8081, not 81)
- [ ] Router firewall enabled
- [ ] DDNS with strong password
- [ ] Regular router firmware updates
- [ ] Monitor access logs (if available)
- [ ] Consider adding basic auth to ESP32 (optional)

---

# 📋 QUICK START GUIDE

## **Fastest Way to Get Remote Access:**

### 1. Port Forward Setup (10 minutes per site)
```
Router Admin → Port Forwarding → Add Rule:
  External: 8081 → Internal: 192.168.1.100:81
```

### 2. Get Public IP
```
Visit: https://whatismyipaddress.com
Write down: 198.23.45.12
```

### 3. Test Access
```
http://198.23.45.12:8081/stream
```

### 4. Use in Website
```
198.23.45.12:8081
```

**Total Time: 10 minutes per site**  
**Cost: $0**  
**Difficulty: Easy**

---

# 🆘 TROUBLESHOOTING

### Can't access from office, but works locally at site?

**Check:**
1. Router port forwarding saved correctly
2. Router firewall isn't blocking the port
3. ISP isn't blocking the port (some ISPs block common ports)
4. Try different external port (8081, 8082, 9001, etc.)
5. Test with mobile data (to rule out office firewall)

### Stream is very slow/laggy?

**Solutions:**
1. Check site's upload speed (need at least 2 Mbps per camera)
2. Lower camera resolution in ESP32-CAM code
3. Reduce JPEG quality
4. Limit concurrent viewers
5. Consider local recording + cloud upload instead

### Public IP keeps changing?

**Solution:**
Use DDNS (DuckDNS.org) - free and automatic!

---

# 📞 NEXT STEPS

1. **Choose your solution** (I recommend Port Forwarding + DDNS)
2. **Test with one site first**
3. **Document the setup** (IP, ports, DDNS)
4. **Roll out to other sites**
5. **Train your team** on accessing the system

---

**Questions? Need help with specific router model? Let me know!**
