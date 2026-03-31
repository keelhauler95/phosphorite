# Phosphorite Player Client

This is the player client component of Phosphorite.

## Customization

Player UI appearance and copy are driven by GM client settings (theme, header, login text) and update live when changed.

General runtime options are controlled via environment variables. See [.env.example](.env.example) for the full list.

- `PHOS_PLAYER_PORT` sets the UI port.
- `PHOS_PLAYER_HOST` sets the bind host.
- `PHOS_BACKEND_ORIGIN` overrides the backend origin used for API/socket proxying.
