# qfs-compression

This library provides a JS implementation of the [QFS compression algorithm](https://www.wiki.sc4devotion.com/index.php?title=DBPF_Compression).
This algorithm is based on [LZ77](https://en.wikipedia.org/wiki/LZ77_and_LZ78#LZ77) and is commonly found in files used by EA games.

It is basically a port of an original [C implementation](https://github.com/wouanagaine/SC4Mapper-2013/blob/master/Modules/qfs.c) made by [@wouanagaine](https://github.com/wouanagaine).
More information on it can be found on the [SC4 devotion wiki](https://www.wiki.sc4devotion.com/index.php?title=DBPF_Compression).

## Installation

`npm install qfs-compression`

## Usage

The module exports two functions: `compress()` and `decompress()`.
Both accept either a Node.js [Buffer](https://nodejs.org/api/buffer.html) or a [Uint8Array](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array).

```js
import { compress, decompress } from 'qfs-compression';

let input = Buffer.from([...]);
let input = new Uint8Array([...]);

let compressed = compress(input);
let original = decompress(compressed);
```

### Input-output matching

It is important to understand that the *type* of the output buffer depends on the *type* of the input buffer.
In short, if a Node.js buffer was passed, a Node.js buffer is returned, otherwise a bare Uint8Array is returned.
This is useful for example in the browser as it does not require a Buffer polyfill this way.

Technically speaking however, if the input object's `constructor` exposes an `.allocUnsafe(size)` method - such as Node.js buffers - this method is used for setting up the output object as [this is the fastest](https://nodejs.org/api/buffer.html#static-method-bufferallocunsafesize).
If no `.allocUnsafe()` is found, then the output object is created using `new input.constructor[Symbol.species](size)`, so it should work for custom classes that override `Uint8Array` too:

```js
class MyBuffer extends Uint8Array {}
let output = decompress(new MyBuffer(1024));
// output instanceof MyBuffer === true
```

## Documentation

### `compress(input[, options])`

 - input [&lt;Buffer&gt;](https://nodejs.org/api/buffer.html) | [&lt;Uint8Array&gt;](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array) An uncompressed buffer of binary data that needs compression.
 - options &lt;Object&gt;:
   - `windowBits`: The amount of bits used for the sliding window. Defaults to `17`, which means a sliding window of 128 kB.
   - `includeSize`: Prefix the compressed output with its size as an Uint32LE. Defaults to `false`.

### `decompress(input)`

 - input [&lt;Buffer&gt;](https://nodejs.org/api/buffer.html) | [&lt;Uint8Array&gt;](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array) A buffer with binary data that was previously compressed using QFS compression.

## Caveats

 - The limit of data that can be compressed is *16MB*.
   This is because the *uncompressed* size is stored in the header using 3 bytes, which means a maximum size of `0xffffff` bytes can be properly written away in the header.
 - In some games (for example SimCity 4), a compressed buffer [is prefixed by 4 bytes containing the size of the entire buffer](https://www.wiki.sc4devotion.com/index.php?title=DBPF_Compression#Overview).
   The library **does not** detect this automatically, so if you are dealing with such games, you need to manually truncate the bytes as
   
   ```js
   decompress(input.slice(4))
   ```
## Performance

Obviously a pure C implementation is faster than a JS implementation.
However, v8 is able to produce really good optimized code for the library, so if the compression function [gets hot](https://stackoverflow.com/questions/59809832/after-what-exact-number-of-execution-function-gets-hot-in-v8), it will match the performance of a C implementation, and may even be faster than linking a C implementation using [native Node addons](https://nodejs.org/api/addons.html).
