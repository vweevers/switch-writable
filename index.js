'use strict'

const Writable = require('readable-stream').Writable
const finished = require('readable-stream').finished
const after = require('after')
const noop = function () {}

module.exports = function (options, map) {
  if (typeof options === 'function') {
    map = options
    options = {}
  } else if (options == null) {
    options = {}
  }

  const objectMode = options.objectMode !== false
  const highWaterMark = options.highWaterMark || 16
  const def = options.default != null ? options.default : 'default'

  function between (streams) {
    const targets = values(streams)
    const writable = Writable({ objectMode, highWaterMark, write, final, destroy })
    const active = new Set()

    watch(writable)
    targets.filter(isEager).forEach(watch)

    return writable

    function write (data, enc, next) {
      const key = map(data, enc)
      let target = streams[key] || streams[def]

      if (!target) {
        const json = JSON.stringify(key)
        return this.destroy(new Error(`No stream for key ${json}`))
      }

      if (isLazy(target)) {
        target = streams[key] = target()
        watch(target)
      }

      if (target.destroyed || !active.has(target)) {
        // The target may still emit an error, allow that to bubble
        // up before we destroy (which would hide the original error).
        return process.nextTick(() => {
          this.destroy(new Error('Premature close'))
        })
      }

      if (target.write(data)) {
        next()
      } else {
        target.once('drain', next)
      }
    }

    function final (callback) {
      const remaining = targets.filter(t => active.has(t))
      const next = after(remaining.length, callback)

      for (let target of remaining) {
        target.end(next)
      }
    }

    function destroy (err, callback) {
      this.cork()
      callback(err)
    }

    function watch (stream) {
      active.add(stream)

      finished(stream, function (err) {
        active.delete(stream)
        if (err) destroyAll(err)
      })
    }

    function destroyAll (err) {
      const remaining = Array.from(active)

      active.clear()

      for (let stream of remaining) {
        stream.cork()
        stream.destroy(err)
      }
    }
  }

  return between.between = between
}

function isLazy (stream) {
  return typeof stream === 'function'
}

function isEager (stream) {
  return typeof stream !== 'function'
}

function values (obj) {
  if (Array.isArray(obj)) {
    return obj
  } else {
    return Object.keys(obj).map(k => obj[k])
  }
}
