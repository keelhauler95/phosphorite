# Phosphorite GM Client

React-based Game Master dashboard for managing characters and apps in real time.

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Features

- **Real-time Updates**: See changes instantly across all connected clients
- **Character Management**: Add, edit, and delete characters
- **App Management**: Create and manage in-game apps
- **Live Status**: See which app each player is currently using
- **Connection Indicator**: Know when you're connected to the server

## Configuration

The client connects to the backend at `http://localhost:3001` by default. This is configured in:

- [src/services/api.ts](src/services/api.ts) - API base URL
- [src/services/socket.ts](src/services/socket.ts) - WebSocket URL
- [vite.config.ts](vite.config.ts) - Development proxy settings

## Development

The app uses Vite for fast development and hot module replacement. When you save changes, the browser automatically updates without a full refresh.

## Building

The production build is optimized and minified:

```bash
npm run build
```

Output goes to the `dist/` directory.
