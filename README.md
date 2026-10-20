# OutOfBook

OutOfBook imports your games from Lichess and Chess.com and maps your opening
repertoire. It shows where you (or your opponents) leave the named book, which
mistakes you repeat, and the strong moves nobody has named yet. You can
practise your lines against Maia or Stockfish, and play real Lichess games
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
| `apps/web/`                | Vite + React 19 + Tailwind 4 app. The board is [chessground](https://github.com/lichess-org/chessground). Engines are Stockfish 18 (wasm) and Maia 3 (onnxruntime-web). Storage is IndexedDB, read first, with the server as the source of truth.                                                                                                 |
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
npm run e2e          # Playwright, against the dev stack
```

## Licences of what is included

- chessground, chess.js, Stockfish.js and the Maia 3 model and worker:
  GPL-3.0.
- The move-verdict logic follows Chesskit (AGPL-3.0).
- onnxruntime-web: MIT.
- Opening names: CC0.
- Lichess's sounds are streamed from Lichess at play time, not shipped. Its
  standard set is not freely licensed.

OutOfBook's own licence is still to be decided. It must be compatible with
GPL-3.0.
