/**
 * HAZORA - Hazard Detection System
 * ESP32-CAM Wi-Fi Provisioning Portal & Camera Stream
 * 
 * v2.7 - IP Display in Captive Portal (Fixed)
 * - Shows camera IP immediately after WiFi connection in portal
 * - Beautiful success page with IP prominently displayed
 * - Users can copy IP before closing portal
 * 
 * Uses WiFiManager for captive portal provisioning.
 * Streams MJPEG via ESP-IDF httpd server.
 * Serves a responsive dashboard at root URL.
 * Includes watchdog timer, Wi-Fi reconnection, and error recovery.
 */

#include <Arduino.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include "esp_timer.h"
#include "esp_task_wdt.h"
#include <WiFi.h>
#include <WiFiManager.h>

// =============================================================================
// AI-Thinker ESP32-CAM Pin Definitions
// =============================================================================
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22
#define LED_GPIO_NUM       4

// =============================================================================
// Configuration
// =============================================================================
#define WIFI_RECONNECT_INTERVAL   30000   // Check Wi-Fi every 30 seconds
#define WIFI_RECONNECT_ATTEMPTS   5       // Max reconnect attempts before restart
#define WATCHDOG_TIMEOUT_S        30      // Watchdog timeout in seconds
#define STREAM_MAX_CLIENTS        3       // Max simultaneous stream clients
#define FRAME_TIMEOUT_MS          5000    // Max time to wait for a frame

// =============================================================================
// Static IP Configuration
// =============================================================================
// Set to 'false' for first-time testing (uses automatic IP)
// Set to 'true' after you know your network settings
#define USE_STATIC_IP     false           // Start with DHCP (automatic IP)

// After first test, if you want static IP:
// 1. Check Serial Monitor for your router's gateway (usually X.X.X.1)
// 2. Change values below to match your network
// 3. Set USE_STATIC_IP to 'true'
// 4. Re-upload
#define STATIC_IP         192,168,1,100   // Device IP (last number 100-254)
#define GATEWAY_IP        192,168,1,1     // Router IP (check Serial Monitor)
#define SUBNET_MASK       255,255,255,0   // Standard subnet
#define PRIMARY_DNS       8,8,8,8         // Google DNS
#define SECONDARY_DNS     8,8,4,4         // Google DNS backup

// =============================================================================
// MJPEG Stream Definitions
// =============================================================================
#define PART_BOUNDARY "123456789000000000000987654321"
static const char *_STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char *_STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char *_STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

// =============================================================================
// Global Variables
// =============================================================================
WiFiManager wifiManager;
httpd_handle_t stream_httpd = NULL;
httpd_handle_t camera_httpd = NULL;

// Stability tracking
unsigned long lastWifiCheck = 0;
unsigned long lastFrameTime = 0;
int wifiReconnectAttempts = 0;
volatile int activeStreamClients = 0;
unsigned long uptimeStart = 0;
unsigned long totalFrames = 0;

// =============================================================================
// Global flag for showing IP in portal
// =============================================================================
String assignedIP = "";

// =============================================================================
// Dashboard HTML (stored in PROGMEM)
// =============================================================================
static const char DASHBOARD_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HAZORA Camera Monitor</title>
<style>
* {margin: 0;padding: 0;box-sizing: border-box;}
body {font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;background: #0a1628;color: #eee;min-height: 100vh;display: flex;flex-direction: column;align-items: center;padding: 1rem;}
h1 {font-size: 1.5rem;margin-bottom: 0.5rem;color: #f57c00;}
.info {font-size: 0.85rem;color: #7a8ca0;margin-bottom: 1rem;}
.status {display:flex;gap:0.5rem;align-items:center;margin-bottom:1rem;}
.status-dot {width:10px;height:10px;border-radius:50%;background:#4caf50;animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
.stream-container {width: 100%;max-width: 800px;background: #1a2744;border-radius: 12px;overflow: hidden;box-shadow: 0 4px 20px rgba(0,0,0,0.5);border:1px solid #243351;}
.stream-container img {width: 100%;height: auto;display: block;}
.controls {margin-top: 1.5rem;display:flex;gap:0.75rem;flex-wrap:wrap;justify-content:center;}
.btn {border: none;padding: 0.75rem 1.5rem;font-size: 0.9rem;border-radius: 8px;cursor: pointer;transition: background 0.2s;font-weight:600;}
.btn-reset {background: #e74c3c;color: white;}
.btn-reset:hover {background: #c0392b;}
.btn-status {background: #243351;color: #7a8ca0;border:1px solid #243351;}
.btn-status:hover {background: #2d4060;}
#status-info {margin-top:1rem;font-size:0.8rem;color:#7a8ca0;text-align:center;min-height:1.2rem;}
@media (max-width: 768px) {body {padding: 0.5rem;}h1 {font-size: 1.2rem;}.stream-container {border-radius: 6px;}.btn {width: 100%;padding: 1rem;}}
</style>
</head>
<body>
<h1>HAZORA Camera Monitor</h1>
<div class="status"><div class="status-dot"></div><span class="info">Live</span></div>
<p class="info">Device IP: <span id="ip"></span></p>
<div class="stream-container">
<img id="stream" alt="Live Camera Stream">
</div>
<div class="controls">
<button class="btn btn-status" onclick="getStatus()">Device Status</button>
<button class="btn btn-reset" onclick="resetWiFi()">Reset Wi-Fi</button>
</div>
<p id="status-info"></p>
<script>
var host = window.location.hostname;
document.getElementById('ip').textContent = host;
document.getElementById('stream').src = 'http://' + host + ':81/stream';
function resetWiFi() {
  if (confirm('Reset Wi-Fi credentials? The device will restart in setup mode.')) {
    fetch('/reset', { method: 'POST' })
      .then(function(r) { return r.text(); })
      .then(function(t) { alert(t); })
      .catch(function(e) { alert('Reset sent. Device is restarting...'); });
  }
}
function getStatus() {
  document.getElementById('status-info').textContent = 'Loading...';
  fetch('/status')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      var info = 'Uptime: ' + d.uptime + 's | Free heap: ' + (d.freeHeap/1024).toFixed(0) + 'KB | RSSI: ' + d.rssi + 'dBm | Streams: ' + d.activeClients + ' | Frames: ' + d.totalFrames;
      document.getElementById('status-info').textContent = info;
    })
    .catch(function(e) { document.getElementById('status-info').textContent = 'Failed to load status'; });
}
</script>
</body>
</html>
)rawliteral";

// =============================================================================
// Camera Initialization
// =============================================================================
bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 10000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // PSRAM detection: use higher resolution and more buffers if available
  if (psramFound()) {
    Serial.println("[CAM] PSRAM found - using VGA with 2 frame buffers");
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.grab_mode = CAMERA_GRAB_LATEST;
  } else {
    Serial.println("[CAM] No PSRAM - using QVGA with 1 frame buffer");
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  }

  // Initialize camera
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] ERROR: Camera init failed with error 0x%x\n", err);
    return false;
  }

  // Configure sensor settings
  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_framesize(s, FRAMESIZE_VGA);    // 640x480 for wider view
    s->set_hmirror(s, 1);                  // Horizontal mirror
    s->set_vflip(s, 0);                    // No vertical flip
    s->set_brightness(s, 1);               // Slight brightness boost
    s->set_saturation(s, 0);               // Normal saturation
  }

  Serial.println("[CAM] Camera initialized successfully (VGA streaming, mirrored)");
  return true;
}

// =============================================================================
// Wi-Fi Reconnection Logic
// =============================================================================
void checkWiFiConnection() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiReconnectAttempts = 0;
    return;
  }

  Serial.println("[WIFI] Connection lost! Attempting reconnect...");
  wifiReconnectAttempts++;

  if (wifiReconnectAttempts > WIFI_RECONNECT_ATTEMPTS) {
    Serial.printf("[WIFI] Failed %d attempts. Restarting device...\n", WIFI_RECONNECT_ATTEMPTS);
    delay(1000);
    ESP.restart();
  }

  WiFi.disconnect();
  delay(1000);
  WiFi.reconnect();

  // Wait up to 10 seconds for reconnection
  int timeout = 20; // 20 * 500ms = 10s
  while (WiFi.status() != WL_CONNECTED && timeout > 0) {
    delay(500);
    Serial.print(".");
    timeout--;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] Reconnected! IP: %s (attempt %d)\n",
                  WiFi.localIP().toString().c_str(), wifiReconnectAttempts);
    wifiReconnectAttempts = 0;
  } else {
    Serial.printf("\n[WIFI] Reconnect attempt %d/%d failed\n",
                  wifiReconnectAttempts, WIFI_RECONNECT_ATTEMPTS);
  }
}

// =============================================================================
// HTTP Handlers
// =============================================================================

// GET /stream - MJPEG stream
static esp_err_t stream_handler(httpd_req_t *req) {
  // Limit concurrent stream clients
  if (activeStreamClients >= STREAM_MAX_CLIENTS) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Max stream clients reached");
    return ESP_FAIL;
  }

  activeStreamClients++;
  camera_fb_t *fb = NULL;
  esp_err_t res = ESP_OK;
  char part_buf[64];

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if (res != ESP_OK) {
    activeStreamClients--;
    return res;
  }

  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "X-Framerate", "15");

  while (true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("[STREAM] Failed to capture frame");
      res = ESP_FAIL;
      break;
    }

    lastFrameTime = millis();
    totalFrames++;

    size_t hlen = snprintf(part_buf, sizeof(part_buf), _STREAM_PART, fb->len);
    res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, part_buf, hlen);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
    }

    esp_camera_fb_return(fb);
    fb = NULL;

    if (res != ESP_OK) {
      // Client disconnected
      break;
    }

    // Feed watchdog during long streams
    esp_task_wdt_reset();
  }

  activeStreamClients--;
  Serial.printf("[STREAM] Client disconnected. Active: %d\n", activeStreamClients);
  return res;
}

// GET /capture - Single JPEG frame
static esp_err_t capture_handler(httpd_req_t *req) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[CAPTURE] Failed to capture frame");
    httpd_resp_send_500(req);
    return ESP_FAIL;
  }

  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache, no-store, must-revalidate");

  esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return res;
}

// GET / - Dashboard page or Success page
static esp_err_t dashboard_handler(httpd_req_t *req) {
  httpd_resp_set_type(req, "text/html");
  return httpd_resp_send(req, DASHBOARD_HTML, strlen(DASHBOARD_HTML));
}

// GET /status - JSON device status
static esp_err_t status_handler(httpd_req_t *req) {
  char json[256];
  unsigned long uptime = (millis() - uptimeStart) / 1000;

  snprintf(json, sizeof(json),
    "{\"uptime\":%lu,\"freeHeap\":%u,\"rssi\":%d,\"activeClients\":%d,\"totalFrames\":%lu,\"ip\":\"%s\",\"ssid\":\"%s\"}",
    uptime,
    ESP.getFreeHeap(),
    WiFi.RSSI(),
    activeStreamClients,
    totalFrames,
    WiFi.localIP().toString().c_str(),
    WiFi.SSID().c_str()
  );

  httpd_resp_set_type(req, "application/json");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
  return httpd_resp_send(req, json, strlen(json));
}

// POST /reset - Clear Wi-Fi credentials and restart
static esp_err_t reset_handler(httpd_req_t *req) {
  httpd_resp_set_type(req, "text/plain");
  httpd_resp_send(req, "Wi-Fi credentials cleared. Device restarting into setup mode...", -1);

  // Brief delay to allow response to be sent
  delay(500);

  // Clear WiFiManager saved credentials
  wifiManager.resetSettings();

  // Restart device
  ESP.restart();
  return ESP_OK;
}

// =============================================================================
// HTTP Server Start
// =============================================================================
void startHttpServer() {
  // Start the stream server on port 81
  httpd_config_t stream_config = HTTPD_DEFAULT_CONFIG();
  stream_config.server_port = 81;
  stream_config.ctrl_port = 32769;
  stream_config.max_uri_handlers = 4;

  httpd_uri_t stream_uri = {
    .uri = "/stream",
    .method = HTTP_GET,
    .handler = stream_handler,
    .user_ctx = NULL
  };

  if (httpd_start(&stream_httpd, &stream_config) == ESP_OK) {
    httpd_register_uri_handler(stream_httpd, &stream_uri);
    Serial.println("[HTTP] Stream server started on port 81");
  }

  // Start the main server on port 80
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.max_uri_handlers = 8;

  httpd_uri_t dashboard_uri = {
    .uri = "/",
    .method = HTTP_GET,
    .handler = dashboard_handler,
    .user_ctx = NULL
  };

  httpd_uri_t capture_uri = {
    .uri = "/capture",
    .method = HTTP_GET,
    .handler = capture_handler,
    .user_ctx = NULL
  };

  httpd_uri_t status_uri = {
    .uri = "/status",
    .method = HTTP_GET,
    .handler = status_handler,
    .user_ctx = NULL
  };

  httpd_uri_t reset_uri = {
    .uri = "/reset",
    .method = HTTP_POST,
    .handler = reset_handler,
    .user_ctx = NULL
  };

  if (httpd_start(&camera_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(camera_httpd, &dashboard_uri);
    httpd_register_uri_handler(camera_httpd, &capture_uri);
    httpd_register_uri_handler(camera_httpd, &status_uri);
    httpd_register_uri_handler(camera_httpd, &reset_uri);
    Serial.println("[HTTP] Camera server started on port 80");
  }
}

// =============================================================================
// WiFiManager Callback - Show IP after successful connection
// =============================================================================
void configModeCallback(WiFiManager *myWiFiManager) {
  Serial.println("[PORTAL] Captive portal started");
  Serial.printf("[PORTAL] Connect to: HAZORA_CAM_SETUP\n");
  Serial.printf("[PORTAL] IP: %s\n", WiFi.softAPIP().toString().c_str());
}

void saveConfigCallback() {
  Serial.println("[PORTAL] WiFi credentials saved!");
  assignedIP = WiFi.localIP().toString();
  Serial.printf("[PORTAL] Connected! Camera IP: %s\n", assignedIP.c_str());
}

// Generate success HTML with actual IP
String generateSuccessHTML() {
  String ip = WiFi.localIP().toString();
  String html = R"(<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Connected Successfully!</title>
<style>
* {margin:0;padding:0;box-sizing:border-box;}
body {font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1f36;color:#fff;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem;}
.container {text-align:center;max-width:450px;width:100%;}
.checkmark {width:80px;height:80px;margin:0 auto 1.5rem;}
.checkmark-circle {stroke:#22c55e;stroke-width:3;fill:none;animation:dash 0.6s ease-in-out;}
.checkmark-check {stroke:#22c55e;stroke-width:3;fill:none;stroke-linecap:round;animation:dash 0.6s 0.35s ease-in-out forwards;stroke-dasharray:48;stroke-dashoffset:48;}
@keyframes dash{to{stroke-dashoffset:0;}}
h1 {color:#22c55e;font-size:1.8rem;margin-bottom:0.5rem;}
p {color:#94a3b8;font-size:1rem;margin-bottom:2rem;}
.ip-label {color:#64748b;font-size:0.95rem;margin-bottom:0.75rem;}
.ip-address {font-size:2.5rem;font-weight:700;color:#22c55e;letter-spacing:2px;margin-bottom:2.5rem;word-break:break-all;font-family:monospace;}
.instructions {background:#243351;border-radius:12px;padding:1.5rem;margin-bottom:1rem;text-align:left;}
.instructions p {margin-bottom:1rem;font-size:0.95rem;color:#cbd5e1;line-height:1.5;}
.instructions p:last-child {margin-bottom:0;}
.instructions strong {color:#fff;}
.note {color:#64748b;font-size:0.85rem;margin-top:1.5rem;line-height:1.4;}
</style>
</head>
<body>
<div class="container">
<svg class="checkmark" viewBox="0 0 52 52">
<circle class="checkmark-circle" cx="26" cy="26" r="25"/>
<path class="checkmark-check" d="M14 27l7 7 16-16"/>
</svg>
<h1>Connected Successfully!</h1>
<p>Camera is now online</p>
<div class="ip-label">📡 Camera IP Address:</div>
<div class="ip-address">)";
  
  html += ip;
  html += R"(</div>
<div class="instructions">
<p><strong>📌 Next Steps:</strong></p>
<p>1. Write down or screenshot the IP address above</p>
<p>2. Enter this IP in the Hazora Dashboard to view the live stream</p>
<p>3. Make sure your device is connected to the same WiFi network</p>
</div>
<p class="note">⚠️ Important: Keep this IP address for accessing your camera stream. You can also find it by visiting the camera's dashboard.</p>
</div>
</body>
</html>)";
  
  return html;
}

// =============================================================================
// Setup
// =============================================================================
void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("");
  Serial.println("========================================");
  Serial.println("  🎥 HAZORA - Hazard Detection System");
  Serial.println("  ESP32-CAM v2.7 (IP Display in Portal)");
  Serial.println("========================================");
  Serial.println("  Network: WiFi Router OR Mobile Hotspot");
  Serial.println("  Streaming: LOCAL SITE ONLY");
  Serial.println("========================================");
  Serial.println("");

  uptimeStart = millis();

  // Turn off the LED (GPIO 4)
  pinMode(LED_GPIO_NUM, OUTPUT);
  digitalWrite(LED_GPIO_NUM, LOW);

  // --- WiFiManager Provisioning Flow ---
  wifiManager.setConfigPortalTimeout(180);
  wifiManager.setConnectTimeout(15);
  wifiManager.setConnectRetries(3);
  
  // Set custom class for styling
  wifiManager.setClass("invert");
  
  // Set callbacks
  wifiManager.setAPCallback(configModeCallback);
  wifiManager.setSaveConfigCallback(saveConfigCallback);
  
  // Custom portal HTML - this page shows AFTER WiFi connects successfully
  wifiManager.setSaveParamsCallback([](){
    assignedIP = WiFi.localIP().toString();
    Serial.printf("[PORTAL] Showing success page with IP: %s\n", assignedIP.c_str());
  });
  
  // Override the success page to show IP
  wifiManager.setWebServerCallback([](){
    wifiManager.server->on("/wifisave", HTTP_GET, [&](){
      String html = generateSuccessHTML();
      wifiManager.server->send(200, "text/html", html);
    });
  });

  Serial.println("[WIFI] Starting WiFiManager...");
  Serial.println("[WIFI] If no credentials saved, connect to AP: HAZORA_CAM_SETUP");

  if (!wifiManager.autoConnect("HAZORA_CAM_SETUP")) {
    Serial.println("[WIFI] Portal timed out - restarting device...");
    delay(1000);
    ESP.restart();
  }

  // Connection successful
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);  // Enable auto-reconnect at driver level

  // Enable watchdog timer AFTER WiFi connection (30 second timeout)
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = WATCHDOG_TIMEOUT_S * 1000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);
  Serial.println("[WATCHDOG] Enabled (30s timeout)");

  // Configure Static IP if enabled
  #if USE_STATIC_IP
    Serial.println("[WIFI] Configuring Static IP...");
    IPAddress local_IP(STATIC_IP);
    IPAddress gateway(GATEWAY_IP);
    IPAddress subnet(SUBNET_MASK);
    IPAddress primaryDNS(PRIMARY_DNS);
    IPAddress secondaryDNS(SECONDARY_DNS);

    if (WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS)) {
      Serial.println("[WIFI] ✅ Static IP configured successfully!");
    } else {
      Serial.println("[WIFI] ⚠️ Static IP failed! Using DHCP instead.");
    }
  #else
    Serial.println("[WIFI] Using DHCP (automatic IP assignment)");
  #endif

  Serial.println("[WIFI] ✅ Connected successfully!");

  // --- Camera Initialization ---
  if (!initCamera()) {
    Serial.println("[SETUP] Camera init failed! Restarting in 5 seconds...");
    delay(5000);
    ESP.restart();
  }

  // --- Start HTTP Server ---
  startHttpServer();

  Serial.println("========================================");
  Serial.println("  ✅ READY! Site-isolated streaming active");
  Serial.println("========================================");
  Serial.println("");
  Serial.println("🔒 SITE ISOLATION: Stream is LOCAL ONLY");
  Serial.println("   Only devices on THIS network can view stream");
  Serial.println("   Perfect for construction site security!");
  Serial.println("");
  Serial.println("📡 NETWORK INFORMATION:");
  Serial.printf("   IP Address:  %s\n", WiFi.localIP().toString().c_str());
  Serial.printf("   Gateway:     %s\n", WiFi.gatewayIP().toString().c_str());
  Serial.printf("   Subnet:      %s\n", WiFi.subnetMask().toString().c_str());
  Serial.printf("   WiFi SSID:   %s\n", WiFi.SSID().c_str());
  Serial.printf("   Signal:      %d dBm\n", WiFi.RSSI());
  Serial.println("");
  Serial.println("🌐 ACCESS URLS:");
  Serial.printf("   Dashboard:   http://%s\n", WiFi.localIP().toString().c_str());
  Serial.printf("   Stream:      http://%s:81/stream\n", WiFi.localIP().toString().c_str());
  Serial.printf("   Capture:     http://%s/capture\n", WiFi.localIP().toString().c_str());
  Serial.printf("   Status:      http://%s/status\n", WiFi.localIP().toString().c_str());
  Serial.println("");
  Serial.println("📌 VIEWING THE STREAM:");
  Serial.println("   1. Connect your device to the SAME WiFi/hotspot");
  Serial.printf("   2. Open browser: http://%s\n", WiFi.localIP().toString().c_str());
  Serial.println("   3. Or enter IP in HAZORA website Live Streams page");
  Serial.println("");
  Serial.println("📱 WORKS WITH:");
  Serial.println("   ✅ Site WiFi Router");
  Serial.println("   ✅ Mobile Hotspot (Android/iPhone)");
  Serial.println("   ✅ Portable WiFi Router");
  Serial.println("");
  #if USE_STATIC_IP
    Serial.println("ℹ️  Static IP Mode: This IP won't change");
  #else
    Serial.println("⚠️  DHCP Mode: IP may change after power cycle");
    Serial.println("   To fix IP permanently:");
    Serial.println("   1. Note the Gateway IP above");
    Serial.println("   2. Edit code: USE_STATIC_IP = true");
    Serial.println("   3. Set GATEWAY_IP to match above");
    Serial.println("   4. Re-upload code");
  #endif
  Serial.println("========================================");
}

// =============================================================================
// Loop
// =============================================================================
void loop() {
  // Feed the watchdog
  esp_task_wdt_reset();

  // Periodic Wi-Fi health check
  unsigned long now = millis();
  if (now - lastWifiCheck >= WIFI_RECONNECT_INTERVAL) {
    lastWifiCheck = now;
    checkWiFiConnection();

    // Log health stats every check interval
    Serial.printf("[HEALTH] Heap: %u bytes | RSSI: %d dBm | Clients: %d | Frames: %lu\n",
                  ESP.getFreeHeap(), WiFi.RSSI(), activeStreamClients, totalFrames);

    // Memory watchdog: restart if heap is critically low
    if (ESP.getFreeHeap() < 20000) {
      Serial.println("[HEALTH] CRITICAL: Low memory! Restarting...");
      delay(1000);
      ESP.restart();
    }
  }

  delay(1000);
}
