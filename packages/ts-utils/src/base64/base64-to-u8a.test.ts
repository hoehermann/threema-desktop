import {describe, expect, it} from 'vitest';

import {base64ToU8a} from './base64-to-u8a.js';

describe('base64ToU8a', () => {
    const testCases: [encoded: string, array: number[]][] = [
        ['AQ==', [1]],
        ['AQ== ', [1]],
        ['AQ == ', [1]],
        ['AQI=', [1, 2]],
        ['AQID', [1, 2, 3]],
        ['AQIDBA==', [1, 2, 3, 4]],
        ['AQIDBAU=', [1, 2, 3, 4, 5]],
        ['AQIDBAUG', [1, 2, 3, 4, 5, 6]],
    ];

    for (const [encoded, array] of testCases) {
        it(`decodes base64-encoded data (${encoded})`, () => {
            expect(base64ToU8a(encoded)).toEqual(new Uint8Array(array));
        });
    }

    it('decodes an empty string to an empty array', () => {
        expect(base64ToU8a('')).toEqual(new Uint8Array(0));
    });

    it('throws when it encounters invalid data', () => {
        expect(() => base64ToU8a('AQ#==')).toThrow('Failed to decode base64 string');
        expect(() => base64ToU8a('AQ==##')).toThrow('Failed to decode base64 string');
    });

    it('leaves headroom before the decoded bytes', () => {
        expect(base64ToU8a('AQID', {headroom: 0})).toEqual(Uint8Array.of(1, 2, 3));
        expect(base64ToU8a('AQID', {headroom: 2})).toEqual(Uint8Array.of(0, 0, 1, 2, 3));
        expect(base64ToU8a('AQID', {headroom: 5})).toEqual(Uint8Array.of(0, 0, 0, 0, 0, 1, 2, 3));
    });

    it('accepts an explicit empty options object', () => {
        expect(base64ToU8a('AQID', {})).toEqual(Uint8Array.of(1, 2, 3));
    });
});
