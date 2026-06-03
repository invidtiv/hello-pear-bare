const { test } = require('brittle')

require('./tea')
require('./commands')
require('./components')
require('./viewport')
require('./list')
require('./style')
require('./mouse')

test('works', (t) => {
  t.pass()
})
