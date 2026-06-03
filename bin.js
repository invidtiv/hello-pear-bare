const createPearCli = require('./lib/pear-cli')
const { quit, key, spinner, style } = require('./lib/tea')
const pkg = require('./package.json')

// A small live console: a spinner header, a scrolling feed of worker IPC and
// wrapper log lines, and enter to ping the worker. This is the model the
// Program drives — see lib/tea for the framework and examples/ for more.
class App {
  constructor({ run, flags }) {
    this.spinner = spinner.create({ fps: 12 })
    this.feed = []
    this.height = 24
    this.width = 80
    this.worker = run('./workers/main.js')
    this.worker.write(Buffer.from(flags.message || 'hello from tui'))
  }

  init() {
    return this.spinner.init()
  }

  update(msg) {
    switch (msg.type) {
      case 'spinner.tick': {
        const [s, cmd] = this.spinner.update(msg)
        this.spinner = s
        return [this, cmd]
      }
      case 'resize':
        this.width = msg.width
        this.height = msg.height
        return [this, null]
      case 'worker':
        this._push(
          msg.stream === 'exit' ? `· worker exited (${msg.code})` : `‹ ${String(msg.data).trim()}`
        )
        return [this, null]
      case 'log':
        this._push(`  ${msg.line}`)
        return [this, null]
      case 'key':
        if (key.matches(msg, 'q', 'ctrl+c')) return [this, quit]
        if (key.matches(msg, 'enter')) {
          this._push('› ping')
          this.worker.write(Buffer.from('ping'))
        }
        return [this, null]
      default:
        return [this, null]
    }
  }

  _push(line) {
    this.feed.push(line)
    const max = Math.max(1, this.height - 4)
    if (this.feed.length > max) this.feed = this.feed.slice(-max)
  }

  view() {
    const header = style()
      .bold(true)
      .foreground('magenta')
      .render(` ${this.spinner.view()} ${pkg.name} — live`)

    const body = style()
      .width(Math.max(20, this.width - 2))
      .height(Math.max(1, this.height - 4))
      .border(style.borders.rounded)
      .borderForeground('blue')
      .render(this.feed.join('\n') || 'waiting for worker…')

    const footer = style().faint(true).render(' enter ping · q quit')

    return style.joinVertical(style.position.left, header, body, footer)
  }
}

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

// Build the model and run it. The wrapper routes its own logs and the worker's
// IPC into the model as Msgs, and closes pear when the model quits.
cli.start(({ run, flags }) => new App({ run, flags }))
