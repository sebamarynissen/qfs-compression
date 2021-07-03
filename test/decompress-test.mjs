import { expect } from 'chai';
import { decompress, compress } from 'qfs-compression';

describe('Decompression', function() {

	function header(size) {
		return [0x10, 0xfb, size >> 16, (size >> 8) & 0xff, size & 0xff];
	}

	it('decodes uncompressed trailing data', function() {

		let input = Buffer.from([
			...header(3),
			0xff, 97, 98, 99,
		]);
		let output = decompress(input);
		expect(output+'').to.equal('abc');

	});

	it('decodes uncompressed data', function() {

		let input = Buffer.from([
			...header(7),
			0xe0, 97, 98, 99, 100,
			0xff, 101, 102, 103,
		]);
		let output = decompress(input);
		expect(output+'').to.equal('abcdefg');

	});

	it('decodes a two-byte control character', function() {

		let input = Buffer.from([
			...header(10),
			0x19, 0x00, 97, 0xfc,
		]);
		let output = decompress(input);
		expect(output+'').to.equal('a'.repeat(10));

	});

	it('decodes a three-byte control character', function() {

		let input = Buffer.from([
			...header(20),
			0x8f, 0x40, 0x00, 97, 0xfc,
		]);
		let output = decompress(input);
		expect(output+'').to.equal('a'.repeat(20));

	});

	it('decodes a four-byte control character', function() {

		let input = Buffer.from([
			...header(100),
			0xc1, 0x00, 0x00, 0x5e, 97,
			0xfc,
		]);
		let output = decompress(input);
		expect(output+'').to.equal('a'.repeat(100));

	});

	it('accepts a Uint8Array', function() {

		let input = new Uint8Array([...header(10), 0x19, 0x00, 97, 0xfc]);
		let output = decompress(input);
		expect([...output]).to.eql(new Array(10).fill(97));

	});

});
