const { command, flag } = require('paparam')
const storageAPI = require('bare-storage')
const os = require('bare-os')
const path = require('bare-path')
const Corestore = require('corestore')
const Hyperswarm = require('hyperswarm')
const PearRuntime = require('pear-runtime')

// Wires up pear-runtime, the OTA updater, swarm replication and teardown so a
// CLI only has to describe its own flags, decide what happens on update, and
// spawn its own workers.
//
// `handlers.onUpdate` is REQUIRED — applying an update and how/when to restart
// is a product decision every CLI must make, so we force the author to make it.
// Everything else is optional and falls back to sensible logging defaults.
//
//   createPearCli(pkg, {
//     flags: [['--message <text>', 'description']],
//     handlers: {
//       onUpdate: async ({ updater }) => { await updater.applyUpdate() }, // required
//       onUpdating: ({ updater }) => {},        // optional
//       onUpdatingDelta: (delta) => {},         // optional
//       onConnection: (connection) => {},       // optional (runs *after* replication)
//       onError: (err) => {}                    // optional
//     }
//   })
function createPearCli(pkg, opts = {}) {
  const handlers = opts.handlers || {}
  if (typeof handlers.onUpdate !== 'function') {
    throw new Error(
      'createPearCli: handlers.onUpdate is required — decide what happens when an update is ready ' +
        '(e.g. async ({ updater }) => { await updater.applyUpdate() })'
    )
  }

  const appName = pkg.productName || pkg.name
  const userFlags = opts.flags || []

  const cmd = command(
    appName,
    flag('--storage <dir>', 'custom storage directory for pear-runtime'),
    flag('--no-updates', 'disable OTA updates for this run'),
    ...userFlags.map(([usage, description]) => flag(usage, description))
  )

  cmd.parse(global.Bare.argv.slice(2))

  const flags = cmd.flags
  const updates = flags.updates
  const isDev = path.basename(Bare.argv[0] || '').startsWith('bare')
  const storage = flags.storage || (isDev ? null : path.join(storageAPI.persistent(), appName))
  const dir = storage || path.join(os.tmpdir(), 'pear', appName)
  const store = new Corestore(path.join(dir, 'pear-runtime', 'corestore'))
  const swarm = new Hyperswarm()

  console.log(`${appName} v${pkg.version}`)
  console.log(`Updates: ${updates === false ? 'disabled' : 'enabled'}`)

  const runningAppPath =
    !isDev && global.Bare && Array.isArray(Bare.argv) && typeof Bare.argv[0] === 'string'
      ? path.resolve(Bare.argv[0])
      : null

  const pear = new PearRuntime({
    dir,
    app: runningAppPath,
    updates,
    version: pkg.version,
    upgrade: pkg.upgrade,
    name: appName,
    store,
    swarm
  })

  const ctx = { pear, swarm, store, appName, dir }

  if (updates !== false) {
    const updater = pear.updater
    const updaterCtx = { ...ctx, updater }

    updater.on('updating', () => {
      if (handlers.onUpdating) handlers.onUpdating(updaterCtx)
      else console.log('[updater] getting new update')
    })

    updater.on('updating-delta', (delta) => {
      if (handlers.onUpdatingDelta) handlers.onUpdatingDelta(delta, updaterCtx)
      else console.log('[updater]', delta)
    })

    updater.on('updated', () => handlers.onUpdate(updaterCtx))

    // Replication is load-bearing for the updater itself, so it always runs.
    // onConnection augments it rather than replacing it.
    swarm.on('connection', (connection) => {
      store.replicate(connection)
      if (handlers.onConnection) handlers.onConnection(connection, ctx)
    })

    swarm.join(updater.drive.core.discoveryKey, {
      client: true,
      server: false
    })
  }

  pear.on('error', (err) => {
    if (handlers.onError) handlers.onError(err, ctx)
    else console.error('[pear-runtime:error]', err)
  })

  const workers = []

  // run(script, { onData, onStdout, onStderr, onExit }) — any handler you pass
  // replaces the default logging for that stream; omit it to keep the default.
  function run(script, runOpts = {}) {
    const worker = PearRuntime.run(script)
    workers.push(worker)

    worker.stdout.on('data', (data) => {
      if (runOpts.onStdout) runOpts.onStdout(data)
      else console.log(`[worker:stdout] ${data}`)
    })
    worker.stderr.on('data', (data) => {
      if (runOpts.onStderr) runOpts.onStderr(data)
      else console.error(`[worker:stderr] ${data}`)
    })
    worker.on('data', (data) => {
      if (runOpts.onData) runOpts.onData(data)
      else console.log(`[worker:ipc] ${data}\n`)
    })
    worker.on('exit', (code) => {
      if (runOpts.onExit) runOpts.onExit(code)
      else console.log(`[worker] exited with code ${code}`)
    })

    return worker
  }

  let tearingDown = false
  async function teardown(code = 0) {
    if (tearingDown) return
    tearingDown = true
    for (const worker of workers) {
      try {
        worker.destroy()
      } catch {}
    }
    try {
      await pear?.close()
    } catch {}
    global.Bare.exit(code)
  }

  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGQUIT']) {
    global.Bare.on(sig, () => teardown(0))
  }

  function start(handler) {
    handler({ run, flags, ...ctx })
    console.log('CLI ready. Press Ctrl+C to stop.')
  }

  return { start, run, teardown, flags, ...ctx }
}

module.exports = createPearCli
