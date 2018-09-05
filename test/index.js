"use strict"

const Switch = require('..')
const test = require('tape')
const from2 = require('from2-array').obj
const Writable = require('readable-stream').Writable
const Readable = require('readable-stream').Readable
const noop = function () {}

function from (arr) {
  if (Math.random() > 0.5) {
    return Readable({
      objectMode: true,
      highWaterMark: 1,
      read () {
        setImmediate(() => {
          this.push(arr.length === 0 ? null : arr.shift())
        })
      }
    })
  } else {
    return from2(arr)
  }
}

function write (fn, final) {
  return Writable({
    objectMode: true,
    write (data, enc, next) {
      if (fn.length === 2) {
        fn.call(this, data, next)
      } else {
        fn.call(this, data)
        next()
      }
    },
    final
  })
}

function monitor (t, fn) {
  return write(fn)
    .on('finish', t.pass.bind(t, 'finish'))
    .on('close', t.fail.bind(t, 'close'))
    .on('error', t.fail.bind(t, 'error'))
}

test('it can switch between multiple streams', function(t) {
  t.plan(13)
  from([0,1,2,3,4,5,6,7,8,9])
  .pipe(Switch(function(data) {
    return data < 5 ? 0 : 1
  }).between([monitor(t, function(x) {
    t.ok(x < 5, x + ' < 5')
  }), monitor(t, function(y) {
    t.ok(y >= 5, y + ' >= 5')
  })]))
  .on('finish', t.pass.bind(t, 'finishes'))
})

test('it can switch between multiple lazy streams', function(t) {
  t.plan(13)
  from([0,1,2,3,4,5,6,7,8,9])
  .pipe(Switch(function(data) {
    return data < 5 ? 0 : 1
  }).between([() => monitor(t, function(x) {
    t.ok(x < 5, x + ' < 5')
  }), () => monitor(t, function(y) {
    t.ok(y >= 5, y + ' >= 5')
  })]))
  .on('finish', t.pass.bind(t, 'finishes'))
})

test('destroys switch stream on target stream error', function(t) {
  t.plan(4 * 2)

  function test (fn, msg) {
    from([0,1,2,3,4,5,6,7,8,9])
    .pipe(Switch(d => 0)([
      write(fn)
    ]))
    .on('error', (err) => {
      t.is(err.message, msg, 'switch: ' + err)
    })
    .on('close', t.pass.bind(t, 'switch: close'))
  }

  test(function () {
    this.destroy(new Error('from target'))
  }, 'from target')

  test(function (x, next) {
    next(new Error('from target'))
  }, 'from target')

  test(function () {
    this.destroy()
  }, 'Premature close')

  test(function () {
    this.emit('close')
  }, 'Premature close')
})

test('destroys target streams on switch stream error', function(t) {
  t.plan(4 + 4 + 3 + 3)

  function test (fn, msg, expectingError) {
    from([0,1,2,3,4,5,6,7,8,9])
    .pipe(fn(Switch(d => 0)([
      write(noop)
      .on('error', (err) => {
        t.is(err.message, msg, 'target: ' + err)
      })
      .on('close', t.pass.bind(t, 'target: close'))
    ])))
    .on('error', (err) => {
      if (expectingError) t.is(err.message, msg, 'switch: ' + err)
      else t.fail('not expecting error')
    })
    .on('close', t.pass.bind(t, 'switch: close'))
  }

  test(function (s) {
    s.destroy(new Error('from switch'))
    return s
  }, 'from switch', true)

  test(function (s) {
    process.nextTick(() => {
      s.destroy(new Error('from switch'))
    })

    return s
  }, 'from switch', true)

  test(function (s) {
    s.destroy()
    return s
  }, 'Premature close', false)

  test(function (s) {
    process.nextTick(() => {
      s.destroy()
    })

    return s
  }, 'Premature close', false)
})

test('lazy destroyed stream', function(t) {
  t.plan(3 * 2)

  function test (fn, msg) {
    from([0,1,2,3,4,5,6,7,8,9])
    .pipe(Switch(d => 0)([
      fn
    ]))
    .on('error', (err) => {
      t.is(err.message, msg)
    })
    .on('close', t.pass.bind(t, 'switch: close'))
  }

  test(function () {
    const ws = write(noop)
    ws.destroy(new Error('from target'))
    return ws
  }, 'from target')

  test(function () {
    const ws = write(noop)

    process.nextTick(() => {
      ws.destroy(new Error('from target'))
    })

    return ws
  }, 'from target')

  test(function () {
    const ws = write(noop)

    process.nextTick(() => {
      ws.destroy()
    })

    return ws
  }, 'Premature close')
})

test('supports N streams', function(t) {
  t.plan(3)
  from([0,1,2])
  .pipe(Switch(function(data) {
    return data
  }).between([write(function(data) {
    t.equal(data, 0)
  }), write(function(data) {
    t.equal(data, 1)
  }), write(function(data) {
    t.equal(data, 2)
  })]))
})

test('supports named streams', function(t) {
  t.plan(3)
  from([0,1,2])
  .pipe(Switch(function(data) {
    if (data === 0) return 'zero'
    if (data === 1) return 'one'
    if (data === 2) return 'two'
  }).between({
    zero: write(function(data) {
      t.equal(data, 0)
    }),
    one: write(function(data) {
      t.equal(data, 1)
    }),
    two: write(function(data) {
      t.equal(data, 2)
    }),
  }))
})

test('does not crash if stream does not exist (named streams)', function(t) {
  t.plan(3)
  from([0,1])
  .pipe(Switch(function(data) {
    if (data === 0) return 'ok'
    if (data === 1) return 'no'
  }).between({
    ok: write(function(data) {
      t.equal(data, 0)
    }).on('error', function(err) {
      t.is(err.message, 'No stream for key "no"')
    })
  }))
  .on('error', function(err) {
    t.is(err.message, 'No stream for key "no"')
  })
})

test('does not crash if stream does not exist (indexed streams)', function(t) {
  t.plan(3)
  from([0,1])
  .pipe(Switch(function(data) {
    if (data === 0) return 0
    if (data === 1) return 1
  }).between([
    write(function(data) {
      t.equal(data, 0)
    }).on('error', function(err) {
      t.is(err.message, 'No stream for key 1')
    })
  ]))
  .on('error', function(err) {
    t.is(err.message, 'No stream for key 1')
  })
})

test('default key (named streams)', function(t) {
  t.plan(3)
  from([0,1])
  .pipe(Switch({ default: 'ok' }, function(data) {
    if (data === 0) return 'ok'
    if (data === 1) return 'no'
  }).between({
    ok: write(function(data) {
      t.ok(data === 0 || data === 1)
    })
  }))
  .on('finish', t.pass.bind(t, 'finish'))
})

test('default key (indexed streams)', function(t) {
  t.plan(3)
  from(['a', 'b'])
  .pipe(Switch({ default: 0 }, function(data) {
    if (data === 'a') return 1
    if (data === 'b') return 2
  }).between([
    write(function(data) {
      t.is(data, 'b')
    }),
    write(function(data) {
      t.is(data, 'a')
    })
  ]))
  .on('finish', t.pass.bind(t, 'finish'))
})

test('waits for finish of target streams', function(t) {
  let count = 0

  t.plan(1)

  from([0,1]).pipe(Switch(() => 0).between([
    write(function(data, next) {
      setTimeout(() => {
        count++
        next()
      }, 500)
    }, function final (next) {
      setTimeout(() => {
        count++
        next()
      }, 500)
    })
  ])).on('finish', () => {
    t.is(count, 3)
  })
})

test('does not swallow own error', function(t) {
  t.plan(2)

  from([0,1]).pipe(Switch(() => 1).between([
    write(noop)
  ])).once('error', function (err) {
    t.is(this.listenerCount('error'), 0, 'no internal error listeners')
    t.is(err.message, 'No stream for key 1')
  })
})
