# Security Policy

## Scope

This repository is a local hardware demonstration. The ESP32 firmware exposes an unauthenticated HTTP API to clients connected to its SoftAP, and those APIs can control real power rails, charging, reset, download mode and M5PM1 GPIO functions.

It is not designed to be exposed directly to the internet, bridged to a production network, or used as safety-critical power-control firmware.

## Security Boundary

- The SoftAP uses WPA2 with a documented default password. Change `STP2_AP_PASSWORD` before using the demo in an untrusted environment.
- There is currently no per-user authentication or authorization on `/api/*`. Anyone who can join the AP can call the API.
- The captive portal and DNS server are intended only for local setup traffic.
- High-risk operations have browser-side confirmation, but the API must still be treated as privileged.

## Reporting a Vulnerability

Please use GitHub's private vulnerability reporting / Security Advisory feature for this repository rather than opening a public issue containing exploit details.

Include:

- affected firmware version or commit,
- board and hardware revision,
- exact request or reproduction steps,
- observed impact,
- whether physical power or data loss is possible.

## Supported Versions

Security fixes target the current `main` branch and the latest published firmware images.
