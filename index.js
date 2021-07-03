// # index.js
// A JavaScript implementation of the QFS compression and decompression 
// algorithms. Based on wouanagaine's C library found here: https://github.com/
// wouanagaine/SC4Mapper-2013/blob/master/Modules/qfs.c
'use strict';

// # decompress(input)
// JavaScript implementation of the QFS decompression algorithm.
// IMPORTANT! In some cases, the first 4 bytes indicate the size of the input 
// buffer. We **don't** detect this automatically, you need to discard those 4 
// bytes yourself!
function decompress(input) {

	// Check magic number.
	let [a, b] = input;
	if (!((a === 0x10 || a === 0x11) && b === 0xfb)) {
		throw new Error(
			'Input is not a valid QFS compressed buffer! Did you forget to truncate the size bytes?'
		);
	}

	// First two bytes are 0x10fb (QFS id), then follows the *uncompressed* 
	// size, which allows us to prepare a buffer for it.
	const size = 0x10000*input[2] + 0x100*input[3] + input[4];
	const out = malloc(size);

	// Start decoding now. Note that trailing bytes are handled separately, 
	// indicated by a control character >= 0xfc.
	let inpos = input[0] & 0x01 ? 8 : 5;
	let outpos = 0;
	while (inpos < input.length && input[inpos] < 0xfc) {
		let code = input[inpos];
		let a = input[inpos+1];
		let b = input[inpos+2];
		if (!(code & 0x80)) {
			let length = code & 3;
			memcpy(out, outpos, input, inpos+2, length);
			inpos += length+2;
			outpos += length;

			// Repeat data that is already in the output. This is the essence 
			// of the compression algorithm.
			length = ((code & 0x1c) >> 2) + 3;
			let offset = ((code >> 5) << 8) + a + 1;
			memcpy(out, outpos, out, outpos-offset, length);
			outpos += length;

		} else if (!(code & 0x40)) {
			let length = (a >> 6) & 3;
			memcpy(out, outpos, input, inpos+3, length);
			inpos += length+3;
			outpos += length;

			// Repeat data already in the outpot.
			length = (code & 0x3f) + 4;
			let offset = (a & 0x3f)*256 + b + 1;
			memcpy(out, outpos, out, outpos-offset, length);
			outpos += length;

		} else if (!(code & 0x20)) {
			let c = input[inpos+3];
			let length = code & 3;
			memcpy(out, outpos, input, inpos+4, length);
			inpos += length+4;
			outpos += length;

			// Repeat data that is already in the output.
			length = ((code>>2) & 3)*256 + c + 5;
			let offset = ((code & 0x10)<<12)+256*a + b + 1;
			memcpy(out, outpos, out, outpos-offset, length);
			outpos += length;

		} else {

			// The last case means there's no compression really, we just copy 
			// as is.
			let length = (code & 0x1f)*4 + 4;
			memcpy(out, outpos, input, inpos+1, length);
			inpos += length+1;
			outpos += length;

		}

	}

	// Trailing bytes. This is indicated by the control character being 
	// greater than 0xfc.
	if (inpos < input.length && outpos < out.length) {
		let length = input[inpos] & 3;
		memcpy(out, outpos, input, inpos+1, length);
		outpos += length;
	}

	// Check if everything is correct.
	if (outpos !== out.length) {
		throw new Error('Error when decompressing!');
	}

	// We're done!
	return out;

}
exports.decompress = decompress;

// # malloc(size)
// Helper function for creating an empty buffer of the given size. If the 
// Buffer global is available, we use that one, otherwise we'll return a bare 
// Uint8Array.
function malloc(size) {
	if (typeof Buffer !== 'undefined') {
		return Buffer.allocUnsafe(size);
	} else {
		return new Uint8Array(size);
	}
}

// # memcpy(out, outpos, input, inpos, length)
// LZ-compatible memcopy function. We don't use buffer.copy here because we 
// might be copying from ourselves as well!
function memcpy(out, outpos, input, inpos, length) {
	let i = length;
	while (i--) {
		out[outpos++] = input[inpos++];
	}
}

// # SmartBuffer
// Tiny implementation of a smart buffer that only supports writing raw 
// *bytes*.
const DEFAULT_SIZE = 4096;
const MAX_SIZE = 32*1024*1024;
class SmartBuffer {
	constructor() {
		this.length = 0;
		this.buffer = malloc(DEFAULT_SIZE);
	}
	push(byte) {
		let { buffer } = this;
		if (buffer.length < this.length+1) {
			let newLength = Math.min(MAX_SIZE, 2*buffer.length);
			let newBuffer = malloc(newLength);
			newBuffer.set(buffer);
			this.buffer = newBuffer;
		}
		this.buffer[this.length++] = byte;
	}
	toBuffer() {
		return this.buffer.subarray(0, this.length);
	}
}

// Performance calibration constants for compression.
const QFS_MAXITER = 50;

// # compress(input, opts)
// A JavaScript implementation of QFS compression. We use a smart buffer here 
// so that we don't have to manage the output size manually.
function compress(input, opts = {}) { 

	// Important! If the input buffer is larger than 16MB, we can't compress 
	// because that would cause a bit overflow and the size to be stored as 0!
	if (input.length > 0xffffff) {
		throw new Error(`Input size cannot be larger than ${0xffffff} bytes!`);
	}

	// Constants for tuning performance.
	const { windowBits = 17 } = opts;
	const WINDOW_LEN = 2**windowBits;
	const WINDOW_MASK = WINDOW_LEN-1;

	// Initialize our occurence tables. The C++ code is rather difficult to 
	// understand here, but we need to understand that we're basically storing 
	// pointers here. While in C++ those are actually memory addresses, for us 
	// they are just numbers, where 0 is the start of the input!
	let out = new SmartBuffer();
	const push = out.push.bind(out);

	// Initialize our occurence tables. The C++ code is rather difficult to 
	// understand here as there is a lot of pointer magic involved.Anyway, 
	// `rev_similar` is an array where we store the offsets that we calculated
	// every input position.
	let rev_similar = new Int32Array(WINDOW_LEN).fill(-1);

	// The `rev_last` code is a lot more difficult to understand though. In 
	// C++ it's a data structure that can hold 256 x 256 integer pointers. 
	// This is actually a table for tracking the *offset* at which the last 
	// [a, b] byte 
	// sequence was found! We implement this table simply as a flat array. of 
	// 256*256 size, which means our indices have to be calculated as 256*a + 
	// b.
	let rev_last = new Int32Array(256*256).fill(-1);

	// The "fill" method simply writes uncompressed data to the output stream. 
	// We always do this right before writing away a "best length" match.
	let inpos = 0;
	let lastwrot = 0;
	const fill = () => {
		while (inpos - lastwrot >= 4) {
			let length = Math.floor((inpos - lastwrot)/4) - 1;
			if (length > 0x1b) length = 0x1b;
			push(0xe0 + length);
			length = 4*length + 4;
			while (length--) push(input[lastwrot++]);
		}
	};

	// Write the header to the output.
	// TODO: we should look in the options to determine whether we have to 
	// include the size as well.
	push(0x10);
	push(0xfb);
	push(input.length >> 16);
	push((input.length >> 8) & 0xff);
	push(input.length & 0xff);

	// Main encoding loop.
	for (; inpos < input.length-1; inpos++) {

		// Update the occurence tables. The C++ code uses some pointer magic 
		// for this, but we will do it in a more modern way. We simply update 
		// the last time this combination was found.
		let index = 256*input[inpos] + input[inpos+1];
		let offs = rev_similar[inpos & WINDOW_MASK] = rev_last[index];
		rev_last[index] = inpos;

		// If this part has already been compressed, skip ahead.
		if (inpos < lastwrot) continue;

		// Look for a redundancy now.
		let bestlen = 0;
		let bestoffs = 0;
		let i = 0;
		while (offs >= 0 && inpos-offs < WINDOW_LEN && i++ < QFS_MAXITER) {
			let length = 2;
			let incmp = inpos + 2;
			let inref = offs + 2;
			while (
				incmp < input.length &&
				inref < input.length &&
				input[incmp++] === input[inref++] &&
				length < 1028
			) {
				length++;
			}
			if (length > bestlen) {
				bestlen = length;
				bestoffs = inpos-offs;
			}
			offs = rev_similar[offs & WINDOW_MASK];
		}

		// Check if redundancy is good enough.
		if (bestlen > input.length-inpos) {
			bestlen = inpos-input.length;
		} else if (
			bestlen <= 2 ||
			(bestlen === 3 && bestoffs > 1024) ||
			(bestlen === 4 && bestoffs > 16384)
		) {
			continue;
		}

		// If we did not find a suitable redundancy length by now, continue. 
		// We do this to avoid additional nesting.
		if (!bestlen) continue;

		// Cool, we found a good redundancy. Now write away.
		fill();
		let length = inpos-lastwrot;
		if (bestlen <= 10 && bestoffs <= 1024) {

			// 2-byte control character.
			let d = bestoffs-1;
			push(((d>>8)<<5) + ((bestlen-3)<<2) + length);
			push(d & 0xff);
			while (length--) push(input[lastwrot++]);
			lastwrot += bestlen;

		} else if (bestlen <= 67 && bestoffs <= 16384) {

			// 3-byte control character.
			let d = bestoffs-1;
			push(0x80 + (bestlen-4));
			push((length<<6) + (d>>8));
			push(d & 0xff);
			while (length--) push(input[lastwrot++]);
			lastwrot += bestlen;

		} else if (bestlen <= 1028 && bestoffs < WINDOW_LEN) {
			
			// 4-byte control character.
			let d = bestoffs-1;
			push(0xC0 + ((d>>16)<<4) + (((bestlen-5)>>8)<<2) + length);
	        push((d>>8) & 0xff);
	        push(d & 0xff);
	        push((bestlen-5) & 0xff);
	        while (length--) push(input[lastwrot++]);
	        lastwrot += bestlen;

		}

	}

	// Grab the length of what still needs to be processed and write it away 
	// as a control character. Then, write the raw contents.
	inpos = input.length;
	fill();
	let length = inpos - lastwrot;
	push(0xfc + length);
	while (length--) push(input[lastwrot++]);

	// We're done!
	return out.toBuffer();

}
exports.compress = compress;
