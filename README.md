# Breakio

Healthy computer-use break reminders with push notifications.

## Features

- Customizable break intervals
- Push notifications to remind you to take breaks
- Tracks idle time
- Simple and lightweight Chrome extension

## Getting Started

### Prerequisites

- Node.js (v18+)
- Chrome or a Chromium-based browser

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/breaksy.git
   cd breaksy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

## Development

```bash
# Run build in watch mode
npm run watch

# Type check
npm run typecheck
```

## Tech Stack

- TypeScript
- Vite
- Chrome Extensions API (Manifest V3)
