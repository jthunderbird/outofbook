<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="assets/brand/outofbook-with-name-light.png" />
    <img src="assets/brand/outofbook-with-name.png" alt="OutOfBook" width="360" />
  </picture>
</p>

# OutOfBook

OutOfBook imports your games from Lichess and Chess.com and maps your opening
repertoire. It shows where you (or your opponents) leave the named book, which
mistakes you repeat, and the strong moves nobody has named yet. You can
practice your lines against Maia or Stockfish, and play real Lichess games
from the same board, with no engine help during play.

## Run (development)

```sh
HOST_UID=$(id -u) HOST_GID=$(id -g) docker compose up -d
```

Then open https://<host>:7444/ and accept the self-signed certificate. The
stack has four services:

- `deps`, a one-shot job that installs packages, fetches the engine and model
  files, and builds the opening book;
- `web`, the Vite dev server, which hot-reloads;
- `api`, Fastify run with `tsx watch`;
- `db`, Postgres in volume `outofbook-dev_pgdata`.

Migrations in `apps/api/migrations/` run when the API starts.

`DEV_AUTH=1` turns on a test-only login by the `X-Dev-User` header, for
end-to-end tests. Use it only on a trusted LAN. The API ignores it when
`NODE_ENV=production`.

## Layout

| Path                       | What                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/`           | Chess logic shared by web and API: import from Lichess and Chess.com, opening-book naming ([lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0), repertoire build, move verdicts (ported from [Chesskit](https://github.com/GuillaumeSD/Chesskit)), the line tracker, the "who cares" rules. Unit tests with Vitest. |
| `apps/web/`                | Vite + React 19 + Tailwind 4 app. The board is [chessground](https://github.com/lichess-org/chessground). Engines are Stockfish 18 lite and full (wasm, chosen in Settings or on the review page) and Maia 3 (onnxruntime-web). Storage is IndexedDB, read first, with the server as the source of truth.                                         |
| `apps/api/`                | Fastify 5 and Postgres: accounts by Lichess token, saved games, the shared eval cache, each user's built repertoire model. In production it also serves the built web app.                                                                                                                                                                        |
| `scripts/fetch-assets.mjs` | Downloads the Stockfish, onnxruntime and Maia files, pinned and checked by SHA-256 (kept out of git).                                                                                                                                                                                                                                             |
| `tests/e2e/`               | Playwright tests against the running stack.                                                                                                                                                                                                                                                                                                       |
| `poc/`                     | The proof of concept. It is not part of this repository (ignored).                                                                                                                                                                                                                                                                                |

## Commands

```sh
npm install          # once, on the host (the dev stack does it in `deps`)
npm run assets       # engine and model files
npm run build:book   # opening book data
npm run check        # format check, lint, typecheck, unit tests
docker compose exec api npm test -w @outofbook/api   # API tests against Postgres
npm run e2e          # Playwright, against the dev stack (see below)
```

### End-to-end tests

The tests run against the dev stack. They need three things:

- **The API with the test login on:** run
  `DEV_AUTH=1 HOST_UID=$(id -u) HOST_GID=$(id -g) docker compose up -d api`.
  Switch it back off afterwards.
- **Real games for the analysis and storage tests:**
  `packages/core/test/fixtures/local/games300.json`, a JSON array of 300
  imported games. It is kept out of git, and those tests skip without it.
- **A browser, on hosts where Playwright cannot install one** (such as
  Ubuntu 20.04): point `E2E_CHROMIUM` at an existing Chromium.

The tests cover these areas:

- the app shell, with cross-origin isolation;
- every analysis view, the min-games filter, the book explorer and game
  review;
- the server-backed storage: a new device gets the model from the server, and
  a refresh uses the browser copy;
- play against Stockfish and Maia;
- the live-game demo (opponent leaves and the win is claimed; the side
  switch), on desktop and phone sizes.

## Production

```sh
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" > .env
echo "UNLIMITED_USERS=alice,bob" >> .env   # Lichess ids with no saved-games limit
docker compose -f docker-compose.prod.yml up -d --build
```

One container serves the built app and `/api` on `127.0.0.1:8080`, with
Postgres beside it. Set `APP_PORT`, and set `APP_BIND=0.0.0.0` when the
proxy runs on another machine. Put a TLS reverse proxy (SWAG) in front: the Lichess
login (WebCrypto) and cross-origin isolation need HTTPS.

## Licenses of what is included

- chessground, chess.js, Stockfish.js and the Maia 3 model and worker:
  GPL-3.0.
- The move-verdict logic follows Chesskit (AGPL-3.0).
- onnxruntime-web: MIT.
- Opening names: CC0.
- Lichess's sounds are streamed from Lichess at play time, not shipped. Its
  standard set is not freely licensed.

## License

OutOfBook is free software under the [GNU Affero General Public License
v3.0](LICENSE) (AGPL-3.0). If you run a modified version as a service, you
must offer its source code to its users.

The logos are in `assets/brand/` (originals in `assets/brand/source/`;
`scripts/build-brand.py` makes the transparent and web versions).
