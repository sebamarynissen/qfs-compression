type CompressOptions = {
	windowBits?: number;
	includeSize?: boolean;
};

export function decompress<T extends Uint8Array>(input: T): T;
export function compress<T extends Uint8Array>(input: T, opts?: CompressOptions): T;
