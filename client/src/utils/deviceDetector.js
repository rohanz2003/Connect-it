import { UAParser } from "ua-parser-js";

export function getDeviceInfo() {
  const parser = new UAParser();
  const result = parser.getResult();
  const storedId = localStorage.getItem("deviceId");

  return {
    deviceId: storedId || null,
    deviceName: `${result.browser.name || "Browser"} on ${result.os.name || "OS"}`,
    deviceType: result.device.type || "desktop",
    browser: result.browser.name || "Unknown",
    os: result.os.name || "Unknown",
  };
}
