# CHZZK Stream Deck v2.0

**Real-time Chat Widget Management System for CHZZK Streaming**

A real-time chat widget management system for CHZZK streaming, featuring an Electron-based desktop application that works seamlessly with OBS Studio.

## Quick Start

### Method 1: Run Electron App (Recommended)

1. **Install Dependencies**
```bash
npm install
```

2. **Run Electron App**
```bash
npm run app
```
The app will automatically start the server and open a browser window.

### Method 2: Run in Web Browser

1. **Install Dependencies**
```bash
npm install
```

2. **Start Server**
```bash
npm start
```

3. **Access Dashboard**
- **Main Dashboard**: http://localhost:7112 (or the port set in config.json)
- **Chat Overlay**: http://localhost:7112/chat-overlay.html

### Configuration File (config.json)

You can create a `config.json` file in the project root to configure the port and host:

```json
{
  "port": 7112,
  "host": "localhost"
}
```

The default port is 7112.

## Build and Deployment

### Build Windows Executable

1. **Run Build**
```bash
npm run build:win
```

2. **Build Artifacts**
- `dist/CHZZK Stream Deck Setup x.x.x.exe` - Installer
- `dist/win-unpacked/` - Portable executable (no installation required)

3. **Run**
Double-click `dist/win-unpacked/CHZZK Stream Deck.exe` to run the application.

### CI/CD Automated Build

This project supports automated builds using GitHub Actions:

- **Automatic Build**: Pushing to the `main` branch automatically triggers a Windows build
- **Release Creation**: Pushing a version tag (`v2.0.0`) automatically creates a release
- **Build Artifacts**: Download built files from the GitHub Actions tab

For more details, see [.github/workflows/README.md](.github/workflows/README.md).

## Project Structure

```
chzzk-stream-deck/
├── .github/
│   └── workflows/               # CI/CD workflows
│       ├── build.yml            # Automated build workflow
│       ├── build-release.yml    # Release build workflow
│       └── test.yml             # Test workflow
├── assets/
│   └── images/                  # Image resources
├── css/
│   ├── components.css           # Component styles
│   ├── main.css                 # Main styles
│   └── themes.css               # Theme definitions
├── dist/                        # Build output (auto-generated)
├── js/
│   ├── config/
│   │   └── constants.js         # Application constants
│   ├── modules/
│   │   └── chat.js              # Chat module
│   ├── utils/
│   │   ├── settings.js          # Settings management
│   │   └── ui.js                # UI utilities
│   └── main.js                  # Main application
├── scripts/
│   ├── clear-cache.js           # Cache clearing script
│   └── kill-electron.js         # Electron process termination
├── src/
│   ├── chat-client.js           # CHZZK chat client
│   └── chat-overlay.html        # Chat overlay for OBS
├── main.js                      # Electron main process
├── server.js                    # Backend server
├── index.html                   # Main dashboard
├── config.json                  # Server configuration file
└── package.json                 # Project configuration
```

## Configuration and Usage

### Server Configuration (config.json)

Create or modify the `config.json` file in the project root to configure server port and host:

```json
{
  "port": 7112,
  "host": "localhost"
}
```

**Note**: 
- The Electron app automatically reads this configuration file on launch
- In built apps, `config.json` in the same directory as the executable takes priority

### Chat Module Setup

1. **Open Dashboard**
   - Electron App: Opens automatically
   - Web Browser: Navigate to http://localhost:7112

2. **Enter Channel ID**
   - Enter the 32-character alphanumeric combination found at the end of your CHZZK channel URL
   - Example: `42597020c1a79fb151bd9b9beaa9779b`

3. **Configure Display Settings**
   - Select theme (Simple Purple, etc.)
   - Set message display duration
   - Choose alignment (default/left/right/center)
   - Set maximum nickname length

4. **Start Chat Module**
   - Toggle the switch to start the chat module
   - The chat client will automatically run in the terminal

## OBS Integration

### Chat Overlay Setup

1. **Add Browser Source in OBS**
   - Open OBS Studio
   - Add "Browser Source" from the sources list

2. **Configure URL**
   - URL: `http://localhost:7112/chat-overlay.html` (or your configured port)
   - Width: 400px (recommended)
   - Height: 600px (recommended)

3. **CSS Settings (Optional)**
   ```css
   body { 
     background: transparent !important; 
   }
   ```

4. **Refresh Settings**
   - Click "Refresh Browser" button to verify
   - Enable "Shutdown source when not visible" if needed

## API Endpoints

### Chat Management
- `POST /api/chat/start` - Start chat monitoring
- `POST /api/chat/stop` - Stop chat monitoring
- `GET /api/chat/stream` - Real-time chat stream (SSE)
- `GET /api/chat/messages` - Retrieve chat messages

### Server Status
- `GET /api/status` - Get server and module status
- `GET /api/config` - Get server configuration information

### Pages
- `GET /` - Main dashboard
- `GET /chat-overlay.html` - Chat overlay for OBS

## Requirements

### System Requirements
- **Node.js**: 14.0.0 or higher (for development)
- **npm**: 6.0.0 or higher
- **Windows**: Windows 10 or higher (for running built app)
- **Browser**: Modern browser with ES6+ support (for web mode)

### CHZZK Requirements
- Valid CHZZK channel ID
- Active live stream for real-time chat

### Build Requirements
- Node.js 18 or higher (for CI/CD builds)
- Windows build: Windows environment or GitHub Actions

## Theme System

### Simple Purple
- Purple gradient background (#667eea, #764ba2)
- Advanced animation effects
- Hover effects and transitions
- Multi-layer shadows and glow effects

This is the default supported theme.

## Troubleshooting

### Common Issues

#### Server Connection Failed (ERR_CONNECTION_REFUSED)
- **Cause**: Server not started or port conflict
- **Solution**:
  1. Using Electron App: The app automatically starts the server, wait a moment and retry
  2. Web Mode: Verify server is running with `npm start`
  3. Port Conflict: Use a different port in `config.json` or terminate existing processes
  4. Press F12 to open DevTools and check console for detailed errors

#### Chat Module Start Failed
- **Cause**: Server not ready yet or channel ID error
- **Solution**:
  1. Wait a few seconds after app launch before retrying (automatic retry logic included)
  2. Verify channel ID is correct (32-character alphanumeric)
  3. Confirm CHZZK channel is live
  4. Check error messages in DevTools console

#### CSS Not Loading (Built App)
- **Cause**: Static file path issue
- **Solution**:
  1. Use latest build files
  2. Ensure you're using the entire `dist/win-unpacked` folder
  3. Open DevTools with F12 and check Network tab for CSS file loading

#### Build Failure
- **Cause**: Windows Developer Mode disabled or port conflict
- **Solution**:
  1. Windows 11: Settings → Privacy & Security → For developers → Enable Developer Mode
  2. Or use CI/CD to build automatically via GitHub Actions
  3. Terminate running Electron processes before rebuilding

#### Chat Messages Not Appearing
- **Cause**: Server connection issues or API limitations
- **Solution**:
  1. Check server status at `/api/status`
  2. Check browser console for errors
  3. Verify firewall settings
  4. Confirm chat module is enabled

## Development

### Running in Development Mode

```bash
# Run Electron app (recommended)
npm run app

# Or run server only
npm start

# Development server (uses nodemon, auto-restarts on file changes)
npm run dev

# Run chat client directly (for testing)
node src/chat-client.js <CHANNEL_ID>
```

### Build Scripts

```bash
# Build for Windows
npm run build:win

# Build portable version
npm run build:win:portable

# Auto-terminate Electron processes before build
npm run prebuild:win
```

### Module Development

Each module is developed independently and can be extended:
- **Chat Module**: `js/modules/chat.js`
- **UI Management**: `js/utils/ui.js`
- **Settings Management**: `js/utils/settings.js`

### Debugging

In built app:
- **F12**: Open DevTools (works in built app)
- **Ctrl+Shift+I**: Open DevTools (alternative shortcut)

In development mode:
- Check console logs
- Verify API calls in Network tab
- Server logs can be viewed in Electron console

## License

MIT License

---

For technical support and bug reports, please create an issue in the repository.
