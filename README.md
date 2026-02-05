# Breaksy

**Healthy computer-use break reminders with push notifications.**

Breaksy helps you maintain healthy work habits by reminding you to take regular breaks for your eyes and stay hydrated throughout the day.

## Features

### Multiple Reminder Types
- **👀 Eye Breaks** - Follow the 20-20-20 rule: Every 20 minutes, look at something 20 feet away for 20 seconds
- **💧 Water Reminders** - Stay hydrated with regular water intake reminders (default: every hour)
- **Independent Timers** - Each reminder type has its own schedule and settings
- **Easy to Extend** - Simple to add posture checks, stretch reminders, and more

### Smart Controls
- **Enable/Disable** - Turn reminder types on/off independently
- **Customizable Intervals** - Set your own schedule (5-240 minutes) for each reminder
- **Snooze** - Delay reminders when you're busy (customizable snooze duration)
- **Pause/Resume** - Temporarily pause individual reminders
- **Idle Detection** - Automatically pauses when you step away from your computer

### User-Friendly Interface
- **Popup Dashboard** - Quick view of all reminders with mini status indicators
- **One-Click Actions** - Trigger, snooze, or pause reminders instantly
- **Settings Page** - Full control over all reminder types and global preferences
- **Persistent State** - Reminders survive browser restarts and resume accurately

### Privacy First
- **No Data Collection** - All settings stored locally on your device
- **No Website Access** - Extension doesn't read browsing history or page content
- **Open Source** - Full transparency, audit the code yourself

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation (Development)

#### Prerequisites
- Node.js (v18+)
- Chrome or a Chromium-based browser

#### Steps

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
   - Enable "Developer mode" (toggle in top-right)
   - Click "Load unpacked"
   - Select the `dist` folder

5. The Breaksy icon should now appear in your Chrome toolbar!

## How to Use

### Getting Started

1. **Click the Breaksy icon** in your Chrome toolbar to open the popup
2. **Select a reminder type** from the dropdown (Eye Break or Water)
3. **View the countdown** to see when your next reminder will trigger
4. **Enable water reminders** if desired (disabled by default)

### Customizing Settings

1. **Open Settings**: Click "Settings" at the bottom of the popup
2. **Select Reminder Type**: Use the dropdown at the top
3. **Enable/Disable**: Toggle the switch to turn reminders on/off
4. **Set Interval**: Choose a preset or enter a custom interval (5-240 minutes)
5. **Adjust Snooze**: Set how long reminders are delayed when snoozed
6. **Configure Idle Detection**: Set how long before the extension considers you idle

### Using Reminders

**When a reminder triggers:**
- A notification appears with action buttons
- Click "Snooze" to delay the reminder
- Click "Pause" to stop reminders until you resume
- Click the notification to dismiss it

**From the popup:**
- See all reminder statuses in the mini indicators
- Click an indicator to switch to that reminder
- Use "Take Break Now" for immediate reminders
- Adjust intervals on the fly

## Default Settings

| Reminder | Enabled | Interval | Snooze |
|----------|---------|----------|--------|
| 👀 Eye Break | Yes | 20 min | 5 min |
| 💧 Water | No | 60 min | 10 min |

*Water reminders start disabled so existing users aren't surprised by new notifications. Enable them in settings.*

## Development

```bash
# Run build in watch mode (auto-rebuild on changes)
npm run watch

# Type check TypeScript
npm run typecheck

# Production build
npm run build
```

### Project Structure

```
src/
├── background/      # Service worker (timer logic, notifications)
├── popup/          # Popup UI (dashboard, quick controls)
├── options/        # Settings page (full configuration)
├── shared/         # Shared types and storage utilities
└── assets/         # Icons and static files
```

### Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for comprehensive technical documentation including:
- Data models and storage architecture
- Message passing API
- Extension points for new features
- Migration strategy (v1 → v2)

## Tech Stack

- **TypeScript** - Type-safe JavaScript with strict mode
- **Vite** - Modern build tool and bundler
- **Chrome Extensions API** - Manifest V3
- **No External Dependencies** - Lightweight and secure

## Browser Compatibility

- Chrome 88+
- Edge 88+
- Opera 74+
- Any Chromium-based browser supporting Manifest V3

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Ideas for Contributions

- Add new reminder types (posture, stretching, mindfulness)
- Add daily statistics tracking
- Add optional notification sounds
- Add keyboard shortcuts
- Add do-not-disturb schedule
- Localization (translations)

## License

[MIT](LICENSE)

## Changelog

### v2.0.0 - Multi-Reminder Support
- ✨ Added water reminder type
- ✨ Independent timers for each reminder type
- ✨ Mini status indicators in popup
- ✨ Per-reminder enable/disable toggles
- ✨ Type-encoded notification IDs for proper routing
- ✨ Automatic V1 → V2 migration
- ✨ Enhanced UI with notification preview
- ✨ Improved idle detection

### v1.0.0 - Initial Release
- 🎉 Eye break reminders (20-20-20 rule)
- 🎉 Push notifications with snooze/pause
- 🎉 Idle time detection
- 🎉 Customizable intervals
- 🎉 Persistent state

---

**Made with ❤️ for healthier computing**
