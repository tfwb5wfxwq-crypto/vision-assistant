/*
 * Vision Assistant - XIAO ESP32S3 Sense Firmware
 *
 * Board: Seeed XIAO ESP32S3 Sense
 * Camera: OV2640 (included)
 * Microphone: PDM (included on expansion board)
 *
 * WiFi AP: VA_CAM / va123456
 * IP: 192.168.4.1
 *
 * Endpoints:
 *   GET /capture     - Capture single JPEG photo
 *   GET /audio/start - Start audio recording
 *   GET /audio/stop  - Stop recording, return WAV
 *   GET /health      - Health check
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
#include <driver/i2s.h>

// ==================== WiFi AP Config ====================
const char* ap_ssid = "VA_CAM";
const char* ap_password = "va123456";

// ==================== Camera Pins (XIAO ESP32S3 Sense - DO NOT MODIFY) ====================
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM     10
#define SIOD_GPIO_NUM     40
#define SIOC_GPIO_NUM     39
#define Y9_GPIO_NUM       48
#define Y8_GPIO_NUM       11
#define Y7_GPIO_NUM       12
#define Y6_GPIO_NUM       14
#define Y5_GPIO_NUM       16
#define Y4_GPIO_NUM       18
#define Y3_GPIO_NUM       17
#define Y2_GPIO_NUM       15
#define VSYNC_GPIO_NUM    38
#define HREF_GPIO_NUM     47
#define PCLK_GPIO_NUM     13

// ==================== Microphone Pins (XIAO ESP32S3 Sense) ====================
#define I2S_WS_PIN        42  // CLK
#define I2S_SD_PIN        41  // DATA
#define I2S_PORT          I2S_NUM_0

// ==================== Audio Config ====================
#define SAMPLE_RATE       16000
#define SAMPLE_BITS       16
#define MAX_RECORD_TIME   60  // seconds
#define AUDIO_BUFFER_SIZE (SAMPLE_RATE * 2 * MAX_RECORD_TIME)  // 16-bit = 2 bytes per sample

// ==================== Global State ====================
WebServer server(80);
bool isRecording = false;
int16_t* audioBuffer = NULL;
size_t audioBufferIndex = 0;
unsigned long lastActivityTime = 0;
const unsigned long SLEEP_TIMEOUT = 5 * 60 * 1000;  // 5 minutes

// ==================== Camera Init ====================
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
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_JPEG;
    config.frame_size = FRAMESIZE_UXGA;     // 1600x1200 - MAX resolution pour lire le texte
    config.jpeg_quality = 8;                // 0-63, lower = better (8 = haute qualité)
    config.fb_count = 1;
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.grab_mode = CAMERA_GRAB_LATEST;

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("Camera init failed with error 0x%x\n", err);
        return false;
    }

    // Camera settings - OPTIMISÉ POUR LECTURE DE TEXTE
    sensor_t* s = esp_camera_sensor_get();
    if (s) {
        s->set_brightness(s, 1);    // Légèrement plus lumineux
        s->set_contrast(s, 2);      // Plus de contraste = texte plus net
        s->set_saturation(s, -1);   // Moins de saturation = plus net
        s->set_sharpness(s, 2);     // Plus de netteté pour le texte
        s->set_whitebal(s, 1);      // AWB on
        s->set_awb_gain(s, 1);
        s->set_exposure_ctrl(s, 1); // AEC on
        s->set_aec2(s, 1);
        s->set_gain_ctrl(s, 1);     // AGC on
        s->set_denoise(s, 1);       // Réduction bruit
    }

    Serial.println("Camera initialized");
    return true;
}

// ==================== Microphone Init ====================
bool initMicrophone() {
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX | I2S_MODE_PDM),
        .sample_rate = SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = 1024,
        .use_apll = false,
        .tx_desc_auto_clear = false,
        .fixed_mclk = 0
    };

    i2s_pin_config_t pin_config = {
        .bck_io_num = I2S_PIN_NO_CHANGE,
        .ws_io_num = I2S_WS_PIN,
        .data_out_num = I2S_PIN_NO_CHANGE,
        .data_in_num = I2S_SD_PIN
    };

    esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("I2S driver install failed: %d\n", err);
        return false;
    }

    err = i2s_set_pin(I2S_PORT, &pin_config);
    if (err != ESP_OK) {
        Serial.printf("I2S set pin failed: %d\n", err);
        return false;
    }

    // Allocate audio buffer in PSRAM
    audioBuffer = (int16_t*)ps_malloc(AUDIO_BUFFER_SIZE);
    if (!audioBuffer) {
        Serial.println("Failed to allocate audio buffer in PSRAM");
        return false;
    }

    Serial.println("Microphone initialized");
    return true;
}

// ==================== HTTP Handlers ====================
void handleCapture() {
    lastActivityTime = millis();

    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
        server.send(500, "text/plain", "Camera capture failed");
        return;
    }

    server.sendHeader("Content-Type", "image/jpeg");
    server.sendHeader("Content-Length", String(fb->len));
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send_P(200, "image/jpeg", (const char*)fb->buf, fb->len);

    esp_camera_fb_return(fb);
    Serial.printf("Photo captured: %d bytes\n", fb->len);
}

void handleAudioStart() {
    lastActivityTime = millis();

    if (isRecording) {
        server.send(400, "text/plain", "Already recording");
        return;
    }

    // Reset buffer
    audioBufferIndex = 0;
    memset(audioBuffer, 0, AUDIO_BUFFER_SIZE);
    isRecording = true;

    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "text/plain", "Recording started");
    Serial.println("Audio recording started");
}

void handleAudioStop() {
    lastActivityTime = millis();

    if (!isRecording) {
        server.send(400, "text/plain", "Not recording");
        return;
    }

    isRecording = false;

    // Create WAV header
    uint32_t dataSize = audioBufferIndex * 2;  // 16-bit = 2 bytes per sample
    uint32_t fileSize = dataSize + 36;

    uint8_t wavHeader[44] = {
        'R', 'I', 'F', 'F',
        (uint8_t)(fileSize & 0xFF),
        (uint8_t)((fileSize >> 8) & 0xFF),
        (uint8_t)((fileSize >> 16) & 0xFF),
        (uint8_t)((fileSize >> 24) & 0xFF),
        'W', 'A', 'V', 'E',
        'f', 'm', 't', ' ',
        16, 0, 0, 0,              // Subchunk1Size (16 for PCM)
        1, 0,                     // AudioFormat (1 = PCM)
        1, 0,                     // NumChannels (1 = mono)
        (uint8_t)(SAMPLE_RATE & 0xFF),
        (uint8_t)((SAMPLE_RATE >> 8) & 0xFF),
        (uint8_t)((SAMPLE_RATE >> 16) & 0xFF),
        (uint8_t)((SAMPLE_RATE >> 24) & 0xFF),
        (uint8_t)((SAMPLE_RATE * 2) & 0xFF),      // ByteRate
        (uint8_t)(((SAMPLE_RATE * 2) >> 8) & 0xFF),
        (uint8_t)(((SAMPLE_RATE * 2) >> 16) & 0xFF),
        (uint8_t)(((SAMPLE_RATE * 2) >> 24) & 0xFF),
        2, 0,                     // BlockAlign
        16, 0,                    // BitsPerSample
        'd', 'a', 't', 'a',
        (uint8_t)(dataSize & 0xFF),
        (uint8_t)((dataSize >> 8) & 0xFF),
        (uint8_t)((dataSize >> 16) & 0xFF),
        (uint8_t)((dataSize >> 24) & 0xFF)
    };

    // Send WAV
    server.sendHeader("Content-Type", "audio/wav");
    server.sendHeader("Content-Length", String(44 + dataSize));
    server.sendHeader("Access-Control-Allow-Origin", "*");

    WiFiClient client = server.client();
    client.write(wavHeader, 44);
    client.write((uint8_t*)audioBuffer, dataSize);

    Serial.printf("Audio stopped: %d samples, %d bytes\n", audioBufferIndex, dataSize);
}

void handleHealth() {
    lastActivityTime = millis();
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", "{\"status\":\"ok\",\"recording\":" + String(isRecording ? "true" : "false") + "}");
}

void handleNotFound() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    if (server.method() == HTTP_OPTIONS) {
        server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        server.sendHeader("Access-Control-Allow-Headers", "*");
        server.send(204);
    } else {
        server.send(404, "text/plain", "Not found");
    }
}

// ==================== Audio Recording Task ====================
void recordAudioTask(void* parameter) {
    size_t bytesRead;
    int16_t samples[512];

    while (true) {
        if (isRecording && audioBufferIndex < (AUDIO_BUFFER_SIZE / 2)) {
            i2s_read(I2S_PORT, samples, sizeof(samples), &bytesRead, portMAX_DELAY);
            size_t samplesRead = bytesRead / 2;

            for (size_t i = 0; i < samplesRead && audioBufferIndex < (AUDIO_BUFFER_SIZE / 2); i++) {
                audioBuffer[audioBufferIndex++] = samples[i];
            }
        } else {
            vTaskDelay(10 / portTICK_PERIOD_MS);
        }
    }
}

// ==================== Setup ====================
void setup() {
    Serial.begin(115200);
    Serial.println("\n\n=== Vision Assistant XIAO ESP32S3 ===");

    // Init PSRAM
    if (!psramFound()) {
        Serial.println("ERROR: PSRAM not found!");
        while (1) delay(1000);
    }
    Serial.printf("PSRAM size: %d bytes\n", ESP.getPsramSize());

    // Init camera
    if (!initCamera()) {
        Serial.println("ERROR: Camera init failed!");
        while (1) delay(1000);
    }

    // Init microphone
    if (!initMicrophone()) {
        Serial.println("WARNING: Microphone init failed, audio disabled");
    }

    // Start audio recording task on core 1
    xTaskCreatePinnedToCore(
        recordAudioTask,
        "AudioTask",
        4096,
        NULL,
        1,
        NULL,
        1  // Core 1
    );

    // Start WiFi AP
    WiFi.mode(WIFI_AP);
    WiFi.softAP(ap_ssid, ap_password);
    Serial.printf("WiFi AP started: %s\n", ap_ssid);
    Serial.printf("IP: %s\n", WiFi.softAPIP().toString().c_str());

    // Setup HTTP server
    server.on("/capture", HTTP_GET, handleCapture);
    server.on("/audio/start", HTTP_GET, handleAudioStart);
    server.on("/audio/stop", HTTP_GET, handleAudioStop);
    server.on("/health", HTTP_GET, handleHealth);
    server.onNotFound(handleNotFound);
    server.begin();

    Serial.println("\nHTTP server started on port 80");
    Serial.println("Endpoints:");
    Serial.println("  GET /capture     - Capture photo");
    Serial.println("  GET /audio/start - Start recording");
    Serial.println("  GET /audio/stop  - Stop and get WAV");
    Serial.println("  GET /health      - Health check");

    lastActivityTime = millis();
}

// ==================== Loop ====================
void loop() {
    server.handleClient();

    // Check for inactivity timeout (deep sleep)
    if (millis() - lastActivityTime > SLEEP_TIMEOUT) {
        Serial.println("Entering deep sleep due to inactivity...");
        delay(100);
        esp_deep_sleep_start();
    }

    delay(1);
}
