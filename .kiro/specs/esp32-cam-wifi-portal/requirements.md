# Requirements: ESP32-CAM Wi-Fi Provisioning Portal

## Requirement 1: Wi-Fi Credential Storage

### Description
The ESP32-CAM stores Wi-Fi credentials persistently using the WiFiManager library's built-in storage mechanism (ESP32 Preferences/NVS). Credentials survive reboots and power cycles.

### Acceptance Criteria
- 1.1 Wi-Fi credentials are stored persistently and survive device reboots
- 1.2 On boot, the system checks if valid credentials exist
- 1.3 Credentials can be cleared to return the device to setup mode

---

## Requirement 2: Provisioning Mode (WiFiManager Captive Portal)

### Description
When no valid Wi-Fi credentials are stored, the ESP32-CAM enters Provisioning Mode using the WiFiManager library. It creates an access point named "HAZORA_CAM_SETUP" and serves a captive portal where users enter Wi-Fi credentials. The AP is only active when no credentials are saved — never open indefinitely.

### Acceptance Criteria
- 2.1 If no credentials are stored on boot, the ESP32-CAM starts WiFiManager in AP mode with SSID "HAZORA_CAM_SETUP"
- 2.2 WiFiManager serves a captive portal with a Wi-Fi network scan and credential input form
- 2.3 The captive portal is mobile-friendly and works on phones and laptops
- 2.4 On successful credential submission, WiFiManager saves credentials and connects to the network
- 2.5 The AP is only active when no Wi-Fi is saved — it does not remain open after successful provisioning
- 2.6 WiFiManager has a configuration timeout (e.g., 180 seconds) after which the device restarts and retries

---

## Requirement 3: Wi-Fi Connection with Auto-Recovery

### Description
When valid credentials exist, the ESP32-CAM connects to the stored Wi-Fi network. If connection fails, WiFiManager re-enters the captive portal to allow re-provisioning.

### Acceptance Criteria
- 3.1 On boot with stored credentials, WiFiManager attempts automatic connection
- 3.2 If connection fails, WiFiManager falls back to AP mode for re-provisioning
- 3.3 Wi-Fi sleep is disabled for consistent streaming performance
- 3.4 On successful connection, the assigned IP address is printed to Serial

---

## Requirement 4: Camera Initialization

### Description
The ESP32-CAM initializes the OV2640 camera module using the AI-Thinker pin configuration, optimized for streaming.

### Acceptance Criteria
- 4.1 Camera is initialized with AI-Thinker ESP32-CAM pin mapping
- 4.2 If PSRAM is available, use VGA resolution with 2 frame buffers
- 4.3 If no PSRAM, fall back to QVGA with 1 frame buffer
- 4.4 Default streaming resolution is QVGA (320x240) for performance
- 4.5 If camera initialization fails, an error is logged to Serial

---

## Requirement 5: Camera Stream Web Page

### Description
Once connected to Wi-Fi, the ESP32-CAM serves a simple responsive web page at its IP address that displays the live camera stream. This is the basic monitoring view — analytics dashboard will be added later.

### Acceptance Criteria
- 5.1 A web page is served at the root URL (GET /) showing the live camera stream
- 5.2 The page is responsive and works on phones, tablets, and desktops
- 5.3 The stream viewer scales to fit the viewport without distortion
- 5.4 The page shows the device IP address for reference
- 5.5 The page includes a "Reset Wi-Fi" button to clear credentials and re-enter setup mode

---

## Requirement 6: MJPEG Stream Endpoint

### Description
The ESP32-CAM provides an HTTP endpoint that streams live camera frames as MJPEG for real-time viewing in browsers.

### Acceptance Criteria
- 6.1 The stream is available at GET /stream
- 6.2 Each frame is a complete JPEG image with proper multipart boundaries
- 6.3 Frame buffers are released back to the camera driver after transmission
- 6.4 Stream handles client disconnection gracefully without memory leaks
- 6.5 A single-frame capture is available at GET /capture

---

## Requirement 7: Wi-Fi Reset Mechanism

### Description
A way to clear stored Wi-Fi credentials and return the device to provisioning mode, accessible from the web page.

### Acceptance Criteria
- 7.1 POST /reset clears stored credentials and restarts the device
- 7.2 After reset, the device enters AP provisioning mode on next boot
- 7.3 The reset button on the web page shows a confirmation before executing
