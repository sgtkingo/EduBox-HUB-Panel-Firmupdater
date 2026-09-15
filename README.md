# EduBox HUB Panel · Firmupdater

![Logo EduBox HUB Panel Firmupdater](assets/logo.svg)

Web-based companion tool for flashing [EduBox HUB Panel](https://github.com/sgtkingo/EduBox-HUB-Panel) firmware via the Web Serial API. It belongs to the **Panel** branch of the [EduBox HUB](https://github.com/sgtkingo/EduBox-HUB) ecosystem. No external flashing tools are needed.

---

## 🌐 Live-page
Checkout [Firmware Autoupdater](https://sgtkingo.github.io/EduBox-HUB-Panel-Firmupdater/)

## ✨ Features

- **Auto-Update:** Fetches the latest GitHub release.
- **Web Flashing:** Direct flashing via Chrome/Edge (Web Serial API).
- **User-Friendly:** One-click process, live terminal, built-in troubleshooting.

---

## 🛠️ Requirements

- **Browser:** Chrome, Edge, Opera  
- **Drivers:** CP210x or CH340

---

## 🚀 Quick Start

```bash
git clone https://github.com/sgtkingo/EduBox-HUB-Panel-Firmupdater.git
cd EduBox-HUB-Panel-Firmupdater/firmupdater
npm install && npm run dev
```

Open `http://localhost:5173`.

- **Config:** `src/App.tsx`
- **Build:** `npm run build`

---

## 📖 Usage

1. **Check:** Version is auto-detected on load.
2. **Connect:** Select COM port.
3. **Flash:** Click **"Update Firmware"**.

---

## ❓ Troubleshooting

| Issue | Solution |
|---|---|
| No Port | Install CP210x or CH340 drivers. |
| Stuck “Connecting...” | Hold the **BOOT** button, click **"Update Firmware"**, release once flashing starts. |
| Download Fail | Enable **"Use CORS Proxy"**. (not supported in latest version) |

---

## 📄 License

Open-source. See the `LICENSE` file.
