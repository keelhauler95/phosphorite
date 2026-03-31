# Phosphorite Backend

This is the backend component of Phosphorite.

## Customization

General options are controlled via environment variables. See [.env.example](.env.example) for the full list.

- `PHOS_BACKEND_PORT` (or `PORT`) sets the HTTP port.
- `PHOS_BACKEND_HOST` sets the bind host.

Player-facing presentation settings (header/login copy, theme) are managed from the GM client and stored in the backend settings.
