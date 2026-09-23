# Voya production deployment

Voya is built on the TREK open-source foundation and remains subject to TREK's
AGPL-3.0 license and preserved notices.

## Production path

Use `docker-compose.voya.yml`, not the upstream `docker-compose.yml`.

The upstream compose file pulls `mauriceboe/trek:latest`, which does **not**
contain Voya's UI or AI features. The Voya compose file builds the image from
this repository so the deployed container matches the reviewed source.

## First boot

1. Copy `deploy/voya.env.example` to `.env.production`.
2. Set `APP_URL` and `ALLOWED_ORIGINS` to the real HTTPS URL.
3. Generate `ENCRYPTION_KEY` with `openssl rand -hex 32`.
4. Optionally set initial admin credentials.
5. Start:
   ```bash
   docker compose --env-file .env.production -f docker-compose.voya.yml up -d --build
   ```
6. Confirm:
   ```bash
   curl -fsS https://your-voya-domain.example/api/health
   ```

## Voya AI

After signing in as an administrator/user with settings access, configure an
LLM provider in Voya AI settings. Provider secrets are encrypted using the
instance encryption key. Voya supports the provider layer inherited from TREK,
including OpenAI-compatible endpoints and Anthropic.

A deployment without an LLM provider still boots normally; Voya AI surfaces
will guide the user to setup instead of pretending AI is available.

## Persistent data

Persist both:
- `/app/data`
- `/app/uploads`

Back up the data directory and encryption key together. Losing the encryption
key makes stored encrypted integration secrets unreadable.

## Release verification

The Voya release workflow verifies:
- workspace build
- lint
- Voya safety invariant tests
- production Docker image build
- container boot
- `/api/health`

The release branch should not be merged to `main` until this workflow is green.
