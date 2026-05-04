# CHZZK Stream Deck v2.0

[![Node.js 18.0.0+](https://img.shields.io/badge/Node.js-18.0.0+-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Electron 28.0+](https://img.shields.io/badge/Electron-28.0+-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows&logoColor=white)](https://www.microsoft.com/windows)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Empowering CHZZK Streamers with Real-time Chat Management and Dynamic OBS Overlays.**

CHZZK Stream Deck is a high-performance, real-time chat widget management system designed specifically for the NAVER CHZZK streaming platform. It combines a robust Node.js backend with an elegant Electron-based desktop application to provide streamers with seamless chat monitoring and professional OBS Studio integration.

---

## ✨ Key Features

- **🚀 Dual-Mode Operation**: Run as a standalone **Electron Desktop App** for a native experience or as a lightweight **Web-based Dashboard**.
- **💬 Robust Chat Module**: Specialized WebSocket client featuring automated server discovery (supporting up to 10 fallback servers) and heartbeat maintenance for rock-solid stability.
- **🖼️ Professional OBS Integration**: Dedicated chat overlay with real-time SSE (Server-Sent Events) synchronization, ensuring zero-latency message updates in OBS Studio.
- **🎨 Dynamic Theme System**: Beautifully crafted themes like "Simple Purple" with advanced CSS animations, multi-layer shadows, and hover effects.
- **🛠️ Centralized Management**: Configure channel IDs, message persistence, alignment, and nickname filtering through an intuitive control panel.
- **📦 CI/CD Optimized**: Fully integrated GitHub Actions workflows for automated multi-platform builds and versioning.

---

## 🛠️ Technical Architecture

The system is built on a modular architecture designed for stability and extensibility:

- **Backend (Node.js/Express)**: A centralized server managing chat processes, SSE streams, and static asset delivery.
- **Chat Client (WS/SSE)**: A resilient WebSocket client that handles CHZZK authentication, message parsing, and emoticon extraction.
- **Frontend (Next-gen Vanilla JS)**: A responsive management dashboard featuring a modern design system and real-time state synchronization.
- **Desktop (Electron)**: A secure wrapper providing native OS integration, IPC communication, and local server lifecycle management.

---

## 📂 Project Structure

```text
chzzk-stream-deck/
├── src/                      # Core Logic & Resources
│   ├── chat-client.js        # High-resilience CHZZK WebSocket client
│   └── chat-overlay.html     # Optimized overlay for OBS Browser Source
├── js/                       # Dashboard Logic
│   ├── modules/              # Feature modules (Chat, UI, etc.)
│   ├── utils/                # Settings & UI helper utilities
│   └── main.js               # Application entry point
├── css/                      # Design System
│   ├── main.css              # Core layout and aesthetics
│   ├── components.css        # Reusable UI components
│   └── themes.css            # Dynamic theme definitions
├── .github/workflows/        # CI/CD (Build/Release/Test)
├── main.js                   # Electron Main Process
├── server.js                 # Unified Backend Server
├── index.html                # Management Dashboard
└── config.json               # Application Configuration
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v8.0.0 or higher

### Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/pileuszu/chzzk-stream-deck.git
   cd chzzk-stream-deck
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

### Running the Application

#### Method 1: Desktop Mode (Recommended)
Starts the integrated server and launches the Electron application.
```bash
npm run app
```

#### Method 2: Web Mode
Starts the backend server for access via a browser.
```bash
npm start
```
- **Dashboard**: `http://localhost:7112`
- **OBS Overlay**: `http://localhost:7112/chat-overlay.html`

---

## 🎥 OBS Studio Integration

1. **Add Browser Source**: In OBS, add a new "Browser" source.
2. **Configure URL**: Set the URL to `http://localhost:7112/chat-overlay.html`.
3. **Optimized Dimensions**:
   - **Width**: 400px (standard)
   - **Height**: 600px
4. **Custom CSS (Optional)**:
   ```css
   body { background: transparent !important; }
   ```

---

## ⚙️ Configuration

Create or modify `config.json` in the root directory:

```json
{
  "port": 7112,
  "host": "localhost"
}
```

*Note: In the portable version, placing `config.json` next to the executable overrides the default internal configuration.*

---

## 🔨 Development & Build

### Development Commands
```bash
# Start development server with auto-reload
npm run dev

# Run chat client directly for debugging
node src/chat-client.js <YOUR_CHANNEL_ID> --verbose
```

### Build Commands
```bash
# Build Windows Installer
npm run build:win

# Build Portable Windows Version
npm run build:win:portable
```

---

## 📜 License

This project is licensed under the **MIT License**.

---

**Developed with ❤️ for the CHZZK Community.**
If you find this project helpful, consider leaving a ⭐ on GitHub!
