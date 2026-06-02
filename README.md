# hello-pear-bare

> Pear Hello World for Bare CLI with `pear-runtime`

End-to-end boilerplate for embedding [pear-runtime](https://github.com/holepunchto/pear-runtime) into a [Bare](https://github.com/holepunchto/bare) CLI with peer-to-peer OTA update support and standalone builds.

- Peer-to-Peer Over-the-Air updates
- Bare worker process via `PearRuntime.run(...)`
- Cross-platform standalone distributables via [`bare-build`](https://github.com/holepunchto/bare-build)

## Table of Contents

- OS Support
- Requirements
- Development
  - Install
  - Create an upgrade link
  - Start
- Architecture
  - Updates
  - Workers
- Peer-to-Peer Deployments
- Scripts
- Project Structure
- Troubleshooting

## OS Support

- **macOS** — arm64, x64
- **Linux** — arm64, x64
- **Windows** — arm64, x64

## Requirements

- `npm` via [Node.js](https://nodejs.org/)
- [pear](https://docs.pears.com/) - `npx pear`

## Development

### Install

```sh
npm install
```

### Create an upgrade link

This template expects `package.json` to contain a valid `pear://` link in the `upgrade` field. If it still contains the placeholder `pear://<YOUR_KEY_HERE>`, startup will fail with `INVALID_URL`.

Create a link with [`pear touch`](https://docs.pears.com/reference/cli.html#pear-touch-flags-channel):

```sh
pear touch
```

Copy the generated `pear://...` link into the `upgrade` field in `package.json`.

### Start

Start app in development mode:

```sh
npm start
```

By default this repo starts with `--no-updates` in development to avoid local dev binaries being swapped while you iterate.

Enable updates for local flow testing:

```sh
npm start -- --updates
```

Send a custom worker message:

```sh
npm start -- --message "hello from dev"
```

## Architecture

`bin.js` is the happy path — your app logic. `lib/pear-cli.js` holds the
boilerplate: storage resolution, pear-runtime construction, the OTA updater,
swarm replication, signal handling and teardown. You rarely need to touch it.

`createPearCli(pkg, opts)` returns a handle with `start(handler)` and
`run(script, opts)`. Your handler receives `{ run, flags, pear, swarm, store, appName, dir }`.

```js
const createPearCli = require('./lib/pear-cli')
const pkg = require('./package.json')

const cli = createPearCli(pkg, {
  flags: [['--message <text>', 'message sent to worker IPC stream']],
  handlers: {
    onUpdate: async ({ updater }) => {        // required
      await updater.applyUpdate()
      console.log('applied — restart to run the latest version')
    }
  }
})

cli.start(({ run, flags }) => {
  const worker = run('./workers/main.js', { onData: (d) => console.log(`${d}`) })
  worker.write(Buffer.from(flags.message || 'hello from cli main'))
})
```

### Event handlers

Handlers are passed to the constructor via `handlers`. One is required, the rest
are optional and fall back to logging:

| Handler | Required | Fires on |
| --- | --- | --- |
| `onUpdate({ updater, pear, ... })` | **yes** | a new version is ready — you decide whether/when to `applyUpdate()` and restart |
| `onUpdating(ctx)` | no | an update download starts |
| `onUpdatingDelta(delta, ctx)` | no | update download progress |
| `onConnection(connection, ctx)` | no | a swarm peer connects (replication already runs; this augments it) |
| `onError(err, ctx)` | no | a `pear-runtime` error |

`onUpdate` is mandatory because applying an update and restarting is a product
decision every CLI must make — the framework will not guess it for you. Leaving
it out throws at startup.

### Updates

Updates are handled through `pear-runtime` and the configured `upgrade` link in `package.json`.

Per-run disable updates:

```sh
npm start -- --no-updates
```

### Workers

`run('./workers/main.js')` spawns a Bare worker over `pear-runtime` and attaches
default stdout/stderr/IPC/exit logging. Pass `{ onData, onStdout, onStderr, onExit }`
to replace the default for any stream — `onData` is the worker's IPC channel and
is usually where your app logic lives.

## Peer-to-Peer Deployments

Set the `upgrade` field in `package.json` to your distribution drive link, then follow the default flow from section 4 onward:

[hello-pear-electron: 4. Build Deployment Directory and onward](https://github.com/holepunchto/hello-pear-electron#4-build-deployment-directory-)

## Scripts

- `npm start` - run the Bare CLI in dev mode (`bare bin.js --no-updates`)
- `npm test` - run `brittle-bare` tests
- `npm run lint` - run prettier check and lunte
- `npm run format` - format repository with prettier
- `npm run make` - auto-detect host OS/arch and run matching build target
- `npm run make:darwin-arm64` - build standalone to `out/darwin-arm64`
- `npm run make:darwin-x64` - build standalone to `out/darwin-x64`
- `npm run make:linux-arm64` - build standalone to `out/linux-arm64`
- `npm run make:linux-x64` - build standalone to `out/linux-x64`
- `npm run make:win32-arm64` - build standalone to `out/win32-arm64`
- `npm run make:win32-x64` - build standalone to `out/win32-x64`

## Project Structure

- `bin.js` - CLI entrypoint — your app logic and event handlers
- `lib/pear-cli.js` - runtime/updater/swarm/teardown boilerplate (rarely edited)
- `workers/main.js` - Bare worker example
- `scripts/make.js` - platform/arch build target selector
- `test/index.js` - brittle-bare tests

## Troubleshooting

- `INVALID_URL: Invalid URL 'pear://<YOUR_KEY_HERE>'` means the placeholder `upgrade` link in `package.json` has not been replaced. Run `pear touch`, then put the generated `pear://...` link in `package.json`.
- If updates do not trigger, verify `package.json` contains a valid `upgrade` Pear link and that peers are seeding the target drive.
- If `npm run make` fails on unsupported hosts, run a specific `make:<platform>-<arch>` script or build on a supported host.
- This template does not implement app-level data persistence; it is a minimal CLI + updater example.
