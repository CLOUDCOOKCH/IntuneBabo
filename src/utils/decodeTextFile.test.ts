import { describe, expect, it } from 'vitest';
import { decodeTextFile } from './decodeTextFile';

function bytesToBuffer(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe('decodeTextFile', () => {
  it('decodes utf-8 text', () => {
    const encoded = new TextEncoder().encode('{"value":[]}');
    expect(decodeTextFile(encoded.buffer)).toBe('{"value":[]}');
  });

  it('decodes utf-16le text with bom', () => {
    const text = '{"name":"Policy"}';
    const body = Array.from(text).flatMap((character) => {
      const code = character.charCodeAt(0);
      return [code & 0xff, code >> 8];
    });

    expect(decodeTextFile(bytesToBuffer([0xff, 0xfe, ...body]))).toBe(text);
  });
});
