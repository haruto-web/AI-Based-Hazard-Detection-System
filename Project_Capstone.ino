/*
 * HAZORA - Hazard Detection System
 * ESP32-CAM Wi-Fi Provisioning Portal & Camera Stream
 * 
 * Uses WiFiManager for captive portal provisioning.
 * Streams MJPEG via ESP-IDF httpd server.
 * Serves a responsive dashboard at root URL.
 */

#include <Arduino.h>
#include "esp_camera.h"
#include "esp_http_server.h"
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
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            color: #eee;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 1rem;
        }
        h1 {
            font-size: 1.5rem;
            margin-bottom: 0.5rem;
            color: #00d4aa;
        }
        .info {
            font-size: 0.85rem;
            color: #aaa;
            margin-bottom: 1rem;
        }
        .stream-container {
            width: 100%;
            max-width: 800px;
            background: #0f0f1a;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        .stream-container img {
            width: 100%;
            height: auto;
            display: block;
        }
        .controls {
            margin-top: 1.5rem;
            text-align: center;
        }
        .btn-reset {
            background: #e74c3c;
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            font-size: 1rem;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .btn-reset:hover {
            background: #c0392b;
        }
        @media (max-width: 768px) {
            body {
                padding: 0.5rem;
            }
            h1 {
                font-size: 1.2rem;
            }
            .stream-container {
                border-radius: 4px;
            }
            .btn-reset {
                width: 100%;
                padding: 1rem;
            }
        }
    </style>
</head>
<body>
    <h1>HAZORA Camera Monitor</h1>
    <p class="info">Device IP: <span id="ip"></span></p>
    <div class="stream-container">
        <img id="stream" alt="Live Camera Stream">
    </div>
    <div class="controls">
        <button class="btn-reset" onclick="resetWiFi()">Reset Wi-Fi</button>
    </div>
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
        s->set_vflip(s, 0);                    // No vertical flip (set to 1 if mounted upside down)
    }

    Serial.println("[CAM] Camera initialized successfully (VGA streaming, mirrored)");
    return true;
}

// =============================================================================
// HTTP Handlers
// =============================================================================

// GET /stream - MJPEG stream
static esp_err_t stream_handler(httpd_req_t *req) {
    camera_fb_t *fb = NULL;
    esp_err_t res = ESP_OK;
    char part_buf[64];

    res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
    if (res != ESP_OK) {
        return res;
    }

    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

    while (true) {
        fb = esp_camera_fb_get();
        if (!fb) {
            Serial.println("[STREAM] Failed to capture frame");
            res = ESP_FAIL;
            break;
        }

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
    }

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

    esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
    esp_camera_fb_return(fb);

    return res;
}

// GET / - Dashboard page
static esp_err_t dashboard_handler(httpd_req_t *req) {
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, DASHBOARD_HTML, strlen(DASHBOARD_HTML));
}

// POST /reset - Clear Wi-Fi credentials and restart
static esp_err_t reset_handler(httpd_req_t *req) {
    httpd_resp_set_type(req, "text/plain");
    httpd_resp_send(req, "Wi-Fi credentials cleared. Device restarting into setup mode...", -1);

    // Brief delay to allow response to be sent
    delay(500);

    // Clear WiFiManager saved credentials
    wifiManager.resetSettings();

    // Restart device - will enter AP provisioning mode on next boot
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

    httpd_uri_t reset_uri = {
        .uri = "/reset",
        .method = HTTP_POST,
        .handler = reset_handler,
        .user_ctx = NULL
    };

    if (httpd_start(&camera_httpd, &config) == ESP_OK) {
        httpd_register_uri_handler(camera_httpd, &dashboard_uri);
        httpd_register_uri_handler(camera_httpd, &capture_uri);
        httpd_register_uri_handler(camera_httpd, &reset_uri);
        Serial.println("[HTTP] Camera server started on port 80");
    }
}

// =============================================================================
// Setup
// =============================================================================
void setup() {
    Serial.begin(115200);
    Serial.println();
    Serial.println("========================================");
    Serial.println("  HAZORA - Hazard Detection System");
    Serial.println("  ESP32-CAM Wi-Fi Provisioning Portal");
    Serial.println("========================================");

    // Turn off the LED (GPIO 4) to avoid blinding the camera
    pinMode(LED_GPIO_NUM, OUTPUT);
    digitalWrite(LED_GPIO_NUM, LOW);

    // --- WiFiManager Provisioning Flow ---
    // Set portal timeout to 180 seconds
    wifiManager.setConfigPortalTimeout(180);
    // Set connection timeout to 15 seconds (prevents hanging)
    wifiManager.setConnectTimeout(15);

    Serial.println("[WIFI] Starting WiFiManager...");
    Serial.println("[WIFI] If no credentials saved, connect to AP: HAZORA_CAM_SETUP");

    // autoConnect will:
    // - Always start AP "HAZORA_CAM_SETUP" (since we cleared credentials)
    // - Serve captive portal for credential input
    // - Return true when connected, false on timeout
    if (!wifiManager.autoConnect("HAZORA_CAM_SETUP")) {
        Serial.println("[WIFI] Portal timed out - restarting device...");
        delay(1000);
        ESP.restart();
    }

    // Connection successful
    WiFi.setSleep(false);  // Disable Wi-Fi sleep for consistent streaming
    Serial.println("[WIFI] Connected successfully!");
    Serial.printf("[WIFI] IP Address: %s\n", WiFi.localIP().toString().c_str());

    // --- Task 3: Camera Initialization ---
    if (!initCamera()) {
        Serial.println("[SETUP] Camera init failed! Restarting in 5 seconds...");
        delay(5000);
        ESP.restart();
    }

    // --- Task 4, 5, 6, 7: Start HTTP Server with all endpoints ---
    startHttpServer();

    Serial.println("========================================");
    Serial.printf("  Dashboard: http://%s\n", WiFi.localIP().toString().c_str());
    Serial.printf("  Stream:    http://%s:81/stream\n", WiFi.localIP().toString().c_str());
    Serial.printf("  Capture:   http://%s/capture\n", WiFi.localIP().toString().c_str());
    Serial.println("========================================");
}

// =============================================================================
// Loop
// =============================================================================
void loop() {
    // esp_http_server runs in its own task, no handling needed here
    delay(10000);
}
