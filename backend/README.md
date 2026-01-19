# Phosphorite Backend

REST API and WebSocket server for the Phosphorite game management system.

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## Environment

The server runs on port 3001 by default. You can change this by setting the `PORT` environment variable:

```bash
PORT=4000 npm run dev
```

## Database

The SQLite database is automatically created on first run in the `data/` directory. To reset the database, simply delete the `data/phosphorite.db` file and restart the server.

## API Documentation

See the main README in the parent directory for full API documentation.

## Development

The `npm run dev` command uses nodemon and ts-node to automatically restart the server when you make changes to TypeScript files.

## Architecture

- **Routes** - Handle HTTP requests and responses
- **Repositories** - Data access layer, interact with the database
- **Services** - Business logic and WebSocket event management
- **Types** - Shared TypeScript interfaces and enums
