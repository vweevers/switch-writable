# switch-writable <sup>*WIP*</sup>

> **Dynamically select a stream's writable target.**  
> Adapted from [switchstream](https://github.com/timoxley/switchstream).

```js
const Switch = require('switch-writable')
const from = require('from2-array').obj
const fs = require('fs')

from(['a', 'b', 'a', 'a'])
  .pipe(Switch(data => {
    if (data === 'a') return 'a'
    if (data === 'b') return 'b'
  }).between({
    a: fs.createWriteStream('a.txt'), // 'aaa'
    b: fs.createWriteStream('b.txt') // 'b'
  }))
```

If the stream or any of the target streams error or close prematurely, all other streams are destroyed. This also happens if the switch function returns a key for which there is no stream (e.g. `c` in the example above).

Target streams can be created lazily:

```js
Switch(data => {
  if (data === 'a') return 'a'
  if (data === 'b') return 'b'
}).between({
  a: () => fs.createWriteStream('a.txt'),
  b: () => fs.createWriteStream('b.txt')
})
```

The list of streams can be an array:

```js
Switch(data => {
  if (data === 'a') return 0
  if (data === 'b') return 1
}).between([
  fs.createWriteStream('a.txt'),
  fs.createWriteStream('b.txt')
])
```

Lastly, a default key can be provided, for when no stream matches the key or when no key is returned:

```js
Switch({ default: 1 }, (data) => null).between([
  fs.createWriteStream('a.txt'),
  fs.createWriteStream('b.txt')
])
```

## Other differences from `switchstream`

- Is and takes a writable stream instead of a duplex stream
- Has backpressure (is as slow as the slowest target)
- Has and expects `destroy()` semantics of Node 8+
- Doesn't coerce keys to the right type (string or number)
- Doesn't support async map function.

## Licence

[MIT](LICENSE) © 2018-present Vincent Weevers. Adapted from `switchstream` © Tim Oxley.
