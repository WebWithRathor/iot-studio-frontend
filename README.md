# Kokoon Frontend — Kokoon IoT Studio (v1.0)

A visual IoT dashboard builder for Kokoon Labs students. Students program their
ESP32 / BrainBoard in the **Kokoon LMS** (block editor), then use **IoT Studio** to
build dashboards that monitor and control it over MQTT.

This version is connected to **Kokoon Backend** (the sibling folder). All
projects, dashboards, widgets, variables, devices and activity are stored on the
server; live values and command acknowledgements stream in from the server.
Nothing is kept in `localStorage` or `sessionStorage`, and if the server is
unreachable the app says so instead of falling back to local data.

---

## Run it

Start the backend first (see `../Kokoon Backend/README.md`), then:

### macOS / Linux / Git Bash

```bash
cd "Kokoon Frontend"
cp .env.example .env.local      # optional — defaults to http://localhost:4004/api/v1
npm install
npm run dev                     # http://localhost:5180
```

### Windows PowerShell

```powershell
Set-Location "Kokoon Frontend"
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open **http://localhost:5180** (use `localhost`, not `127.0.0.1`, so the browser
treats the app and the API as the same site and sends the session cookies).
Sign in with the development accounts created by `npm run seed:dev` in the
backend — their passwords are in the backend `.env` (`DEV_USER_PASSWORD`,
`ADMIN_PASSWORD`) — or create an account if registration is enabled.

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run typecheck` | Strict TypeScript against the real `@types/react` |
| `npm run build:offline` | Single-file build with esbuild → `dist-single/index.html` |

### Configuration (`.env.local`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:4004/api/v1` | Kokoon Backend base URL |
| `VITE_LMS_URL` | `https://test.kokoon.pre.pixxo.io/` | “LMS” link in the top bar and the “Open in LMS” links on LMS devices / projects |

Everything prefixed `VITE_` ends up in the browser bundle. Never put secrets
here, and never copy the backend `.env` into this folder.

### Kokoon LMS

When the backend has `LMS_INTEGRATION_ENABLED=true`, `GET /auth/config` returns
`lmsSso: { enabled, startUrl }` and the login page shows **Sign in with Kokoon LMS**, which
sends the browser to `{LMS_URL}/iot-studio/sso-start?next=<route>`. The LMS posts back to the
backend, which sets the session cookies and redirects to `/#<route>`. Failures come back as
`/#/login?sso_error=expired|invalid|replayed|disabled|unavailable`, each with its own message.
Boards flashed from the LMS show “Flashed from <program>” on the device page, and variables the
firmware no longer declares are flagged. The frontend never sees the LMS secrets.
See `Kokoon Backend/docs/LMS-INTEGRATION.md`.

---

## How it talks to the backend

```
src/services/api/client.ts     the only HTTP client
src/services/api/endpoints.ts  every endpoint the app calls, typed
src/state/auth.ts              session lifecycle (bootstrap → signed in / signed out / server unavailable)
src/state/studio.ts            workspace data, loaded from GET /users/me/workspace, every change sent to the API
src/state/runtime.ts           live data: GET /mqtt/snapshot, then GET /mqtt/stream (Server-Sent Events)
```

- **Sessions** are HttpOnly cookies set by the backend. Every request uses
  `credentials: 'include'` and sends `X-Requested-With: XMLHttpRequest` (the
  backend's CSRF check). JavaScript never sees a token.
- **Expired access token:** on a `401` the client refreshes once (one refresh
  shared by all concurrent requests) and retries; if refresh fails the app
  returns to the sign-in page.
- **Dashboard edits** (add / move / resize / bind widgets) apply instantly and
  are saved ~0.6 s later with the dashboard's `revision`. The editor header
  shows *Saving… / Saved / Save failed — Retry*. If the dashboard was changed
  elsewhere the server answers `409`; the editor says so and offers *Reload*,
  which loads the latest saved version.
- **Creates and deletes** (projects, dashboards, variables, devices) wait for the
  server and show its validation errors in the form.
- **Commands** from controls show *Sent · waiting for ack* until the device's
  acknowledgement arrives over the stream; a publish alone is never shown as success.
- **Live stream:** the server only streams messages from devices the signed-in
  user owns. The stream reconnects with backoff and catches up from the snapshot.
- **Roles:** the UI hides admin-only controls (e.g. pausing the shared demo
  simulation) based on the user's permissions; the server enforces them anyway.

## Plans & tokens

The top bar shows the tokens left; **Plan** (`#/plan`) shows the budget, what
each thing costs, per-project usage and the kit-code activation form.
The editor's component library shows each widget's cost and a live meter;
an add, duplicate, undo/redo, new dashboard or new project that needs more
tokens than are left is refused up front with an "out of tokens" dialog
(`src/lib/tokens.ts` mirrors the server math; the server is the authority).
Administrators get **Admin** (`#/admin`): change plans, grant bonus tokens,
generate kit codes.

## Demo / simulation mode

When the backend runs with `MQTT_MODE=simulated`, devices are simulated by the
server and every simulated device, message and widget is labelled `SIM`, with a
*DEMO MODE* strip in the editor. Real devices registered by an admin never
receive simulated data.

---

## Source layout

```
src/
  app/App.tsx                 auth gate, server-unavailable screen, routes
  pages/                      Login, Home, Project (overview/dashboard/devices/variables/activity/settings),
                              Editor, Devices, Device detail, MQTT Console, Plan & tokens, Admin
  components/                 layout (AppShell), dashboard editor (grid, library, properties, bindings), ui primitives
  widgets/                    widget registry, renderers, shared widget frame and hooks
  services/                   api client + endpoints, config, MQTT topic helpers, LMS adapters (mock)
  state/                      auth, studio (workspace), runtime (live data), ui (toasts, dialogs)
  lib/                        tiny store and hash router
  types/models.ts             DTOs shared with the backend
  styles/app.css              design tokens and styles
```

## Not yet integrated

- **LMS program browsing:** sign-in and devices flashed from the LMS are real (see *Kokoon LMS*),
  but the in-app program picker and MQTT-block mapping in `services/integrations.ts` are still
  mock adapters: the LMS pushes devices to IoT Studio, IoT Studio does not read the LMS.
- **Admin area UI:** the backend exposes `/admin/*` APIs (users, sessions,
  devices, audit log); the frontend uses the simulation controls and the
  plans / kit-codes page so far.

> **Type-checking note.** This build was produced without npm registry access.
> The code passes `tsconfig.offline.json` (a minimal React type shim in
> `types-offline/`). After `npm install`, run `npm run typecheck` once against
> the real `@types/react`.
