# Implementation Plan: ESP32-CAM Wi-Fi Provisioning Portal

## Overview
Replace hardcoded Wi-Fi credentials in the ESP32-CAM firmware with a WiFiManager-based captive portal provisioning system and add a responsive web dashboard for camera stream monitoring.

## Tasks

- [x] 1. Set Up WiFiManager Library and Project Structure
  - [x] 1.1 Add WiFiManager library dependency (by tzapu/WiFiManager for ESP32)
  - [x] 1.2 Remove hardcoded SSID and password constants from Project_Capstone.ino
  - [x] 1.3 Add required includes: WiFiManager.h, WebServer.h, esp_camera.h

- [x] 2. Implement WiFiManager Provisioning Flow
  - [x] 2.1 Create WiFiManager instance and configure AP name "HAZORA_CAM_SETUP"
  - [x] 2.2 Set configuration portal timeout (180 seconds)
  - [x] 2.3 Call wifiManager.autoConnect("HAZORA_CAM_SETUP") in setup()
  - [x] 2.4 Handle connection failure (restart device if portal times out)
  - [x] 2.5 Disable Wi-Fi sleep after successful connection
  - [x] 2.6 Print assigned IP address to Serial on successful connection

- [x] 3. Implement Camera Initialization
  - [x] 3.1 Extract camera initialization into an initCamera() function
  - [x] 3.2 Configure AI-Thinker pin mapping (existing pin defines)
  - [x] 3.3 Detect PSRAM and set resolution/buffer count accordingly
  - [x] 3.4 Set default streaming resolution to QVGA (320x240)
  - [x] 3.5 Log camera init success/failure to Serial
  - [x] 3.6 Call initCamera() after WiFiManager connects successfully

- [x] 4. Implement MJPEG Stream and Capture Endpoints
  - [x] 4.1 Set up AsyncWebServer or ESP32 httpd server for stream handling
  - [x] 4.2 Implement GET /stream handler with multipart/x-mixed-replace content type
  - [x] 4.3 Stream loop: capture frame, send with boundary, release buffer, repeat
  - [x] 4.4 Handle client disconnection gracefully (check connection status, release buffer)
  - [x] 4.5 Implement GET /capture handler returning a single JPEG frame
  - [x] 4.6 Ensure frame buffers are always released back to camera driver

- [x] 5. Build Responsive Camera Stream Web Page
  - [x] 5.1 Create HTML page with viewport meta tag for mobile responsiveness
  - [x] 5.2 Add an img element with src="/stream" for live MJPEG display
  - [x] 5.3 Add CSS for responsive stream viewer (scales to viewport, no distortion)
  - [x] 5.4 Display device IP address on the page
  - [x] 5.5 Add "Reset Wi-Fi" button with JavaScript confirmation dialog
  - [x] 5.6 Style for phone (less than 768px single column) and desktop (centered, max-width)
  - [x] 5.7 Store the HTML string in PROGMEM (flash memory)
  - [x] 5.8 Implement GET / handler that serves the dashboard page

- [x] 6. Implement Wi-Fi Reset Endpoint
  - [x] 6.1 Implement POST /reset handler
  - [x] 6.2 Use wifiManager.resetSettings() to clear stored credentials
  - [x] 6.3 Send response confirming reset before restarting
  - [x] 6.4 Call ESP.restart() after brief delay (allow response to send)
  - [x] 6.5 Wire the "Reset Wi-Fi" button on the web page to POST /reset

- [x] 7. Integration and Final Assembly
  - [x] 7.1 Assemble complete sketch with all components in correct order (WiFiManager then Camera then Server)
  - [x] 7.2 Verify Serial output shows clear status messages for each state transition
  - [x] 7.3 Ensure all endpoints are registered and accessible
  - [x] 7.4 Verify the complete .ino file compiles without errors

## Task Dependency Graph

```
1 --> 2 --> 3 --> 4 --> 5 --> 6 --> 7
```

## Notes
- Uses WiFiManager library (tzapu) for captive portal provisioning
- All code lives in a single Project_Capstone.ino file for Arduino IDE compatibility
- ESP32 httpd server used for MJPEG streaming (better performance than WebServer library for streaming)
- Dashboard HTML stored in PROGMEM to preserve heap for camera frame buffers
