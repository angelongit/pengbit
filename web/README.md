# Companion page

Daniel's area: the laptop page that connects to Pebblebit over Web Bluetooth (Chrome), shows stats, and has the professor write and read dex entries.

- Bluetooth: Nordic UART service, messages in [../docs/ble-protocol.md](../docs/ble-protocol.md). USB serial fallback (Web Serial) uses the same lines.
- Keep API keys in a local `.env`, never commit them (already in `.gitignore`).
- Sprites / pixel art can live in `web/assets/`.
