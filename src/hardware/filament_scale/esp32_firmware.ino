#include <WiFi.h>
#include <WebServer.h>
#include "HX711.h"

// Configure WiFi
const char* WIFI_SSID = "YOUR_WIFI";
const char* WIFI_PASS = "YOUR_PASS";

// Desktop endpoint for posting weights (optional)
const char* REPORT_URL = "http://192.168.1.10:4278/api/weight";

// HX711 wiring
const int LOADCELL_DOUT_PIN = 4;
const int LOADCELL_SCK_PIN = 5;

HX711 scale;
WebServer server(80);

float calibration_factor = 420.0f;
long tare_offset = 0;

void handleRead() {
  long raw = scale.read_average(5);
  float grams = (raw - tare_offset) / calibration_factor;
  String payload = "{\"grams\":" + String(grams, 1) + "}";
  server.send(200, "application/json", payload);
}

void handleTare() {
  tare_offset = scale.read_average(10);
  server.send(200, "text/plain", "Tare complete");
}

void setup() {
  Serial.begin(115200);
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.set_scale(calibration_factor);
  tare_offset = scale.read_average(10);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }

  server.on("/read", HTTP_GET, handleRead);
  server.on("/tare", HTTP_POST, handleTare);
  server.begin();
}

void loop() {
  server.handleClient();
}
