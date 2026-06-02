const createPearCli = require('./lib/pear-cli')
const pkg = require('./package.json')

const cli = createPearCli(pkg, {
  flags: [['--message <text>', 'message sent to worker IPC stream']],
  handlers: {
    // Required: decide what happens when a new version is ready.
    onUpdate: async ({ updater }) => {
      console.log('[updater] update ready... applying')
      await updater.applyUpdate()
      console.log('[updater] applied — restart to run the latest version')
    }
    // Optional hooks (default to logging if omitted):
    // onUpdating, onUpdatingDelta, onConnection, onError
  }
})

cli.start(({ run, flags }) => {
  const worker = run('./workers/main.js', {
    onData: (data) => console.log(`[worker:ipc] ${data}`)
  })
  worker.write(Buffer.from(flags.message || 'hello from cli main'))
})
