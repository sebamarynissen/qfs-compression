// # compress-test.mjs
import { expect } from 'chai';
import { decompress, compress } from 'qfs-compression';

describe('#compress()', function() {

	function header(input) {
		let size = input.length;
		return [0x10, 0xfb, size >> 16, (size >> 8) & 0xff, size & 0xff];
	}

	it('compresses trailing bytes', function() {

		let input = Buffer.from('abc');
		let output = compress(input);
		expect([...output]).to.eql([
			...header(input),
			0xff, 97, 98, 99,
		]);

	});

	it('compresses with a one-byte control character and trailing data', function() {

		let input = Buffer.from('abcdefghij');
		let output = compress(input);
		expect([...output]).to.eql([
			...header(input),
			0xe1, 97, 98, 99, 100, 101, 102, 103, 104,
			0xfe, 105, 106,
		]);

	});

	it('compresses with a two-byte control character', function() {

		let input = Buffer.from('abc'+'d'.repeat(6)+'ef');
		let output = compress(input);
		expect([...output]).to.eql([
			...header(input),
			0xe0, 97, 98, 99, 100,
			0x08, 0x00, 0xfe, 101, 102,
		]);

	});

	it('compresses with a three-byte control character', function() {

		let input = Buffer.from('abc'+'d'.repeat(12));
		let output = compress(input);
		expect([...output]).to.eql([
			...header(input),
			0xe0, 97, 98, 99, 100,
			0x87, 0x00, 0x00, 0xfc,
		]);

	});

	it('compresses with a trhee-byte control character and subsequent data', function() {

		let input = Buffer.from('abc'+'d'.repeat(12)+'efghijkl');
		let output = compress(input);
		expect([...output]).to.eql([
			...header(input),
			0xe0, 97, 98, 99, 100,
			0x87, 0x00, 0x00,
			0xe1, 101, 102, 103, 104, 105, 106, 107, 108,
			0xfc,
		]);

	});

	it('compresses with a four-byte control character', function() {

		let input = Buffer.from('abc'+'d'.repeat(70));
		let output = compress(input);
		expect([...output]).to.eql([
			...header(input),
			0xe0, 97, 98, 99, 100,
			0xc0, 0x00, 0x00, 0x40, 0xfc,
		]);

	});

	it('includes the compressed size if specified', function() {
		let input = Buffer.from('fooooooo bar');
		let raw = compress(input);
		let sized = compress(input, { includeSize: true });
		expect(sized.length).to.equal(raw.length+4);
		expect(sized.readUInt32LE(0)).to.equal(raw.length);
	});

	it('cannot compress data larger than 16MB', function() {

		this.timeout(0);
		let input = Buffer.allocUnsafe(16*1024*1024);
		expect(() => compress(input)).to.throw(Error);

	});

	it('can be properly decompressed', function() {
		this.timeout(0);

		function alloc(size) {
			let buffer = Buffer.allocUnsafe(size);
			for (let i = 0; i < size; i++) {
				buffer[i] = Math.random() > 0.1 ? 1 : 0;
			}
			return buffer;
		}

		for (let i = 1; i <= 24; i++) {
			let input = alloc(2**i-1);
			let output = compress(input);
			let rev = decompress(output);
		}
	});

	it('returns a Uint8Array if the input was one too', function() {

		let input = new Uint8Array(1024);
		let out = compress(input);
		expect(out.constructor).to.equal(input.constructor);

	});

	it('returns a custom buffer if the input was one too', function() {

		class MyBuffer extends Uint8Array {}
		let input = new MyBuffer(1024);
		let out = compress(input);
		expect(out.constructor).to.equal(MyBuffer);

	});

	it('respects [Symbol.species] for custom buffers', function() {

		class MyBuffer extends Uint8Array {
			static get [Symbol.species]() {
				return Uint8Array;
			}
		}
		let input = new MyBuffer(1024);
		let out = compress(input);
		expect(out.constructor).to.equal(Uint8Array);

	});

});
