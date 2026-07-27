import {byteView} from '@threema/ts-utils/byte/byte-view';
import type {u8} from '@threema/ts-utils/integer/u8';
import {expect} from 'chai';

import type {CryptoBackend} from '~/common/crypto';
import {randomPkcs7PaddingLength, randomString} from '~/common/crypto/random';
import {randomBytes as domRandomBytes} from '~/common/dom/crypto/random';
import {getGraphemeClusters} from '~/common/utils/string';
import {TestTweetNaClBackend} from '~/test/mocha/common/backend-mocks';

/**
 * Helper function to return a crypto backend with a `randomBytes` function that always returns the
 * same integer to byte 0 of the buffer.
 *
 * This should only be used for testing `randomU8`.
 */
function unsafeRandomBytesReturnU8(val: u8): Pick<CryptoBackend, 'randomBytes'> {
    return {
        randomBytes: (buffer) => {
            byteView(Uint8Array, buffer)[0] = val;
            return buffer;
        },
    };
}

/**
 * Test of random utils.
 */
export function run(): void {
    describe('Random', function () {
        describe('randomPkcs7PaddingLength', function () {
            it('returns at least 1', function () {
                const padLength = randomPkcs7PaddingLength(unsafeRandomBytesReturnU8(0));
                expect(padLength).to.equal(1);
            });

            it('without constraints, returns the randomly determined pad length', function () {
                for (let i = 1; i <= 255; i++) {
                    const padLength = randomPkcs7PaddingLength(unsafeRandomBytesReturnU8(i));
                    expect(padLength).to.equal(i);
                }
            });

            for (const minTotalLength of [24, 32, 42]) {
                it('with constraints, ensure that padded data length is ≥ minTotalLength', function () {
                    const randomLength = 4; // Chosen by fair dice roll

                    // Combined values ≤ minTotalLength
                    for (let i = 1; i <= minTotalLength - randomLength; i++) {
                        const padLength = randomPkcs7PaddingLength(
                            unsafeRandomBytesReturnU8(randomLength),
                            {
                                currentLength: i,
                                minTotalLength,
                            },
                        );
                        expect(padLength).to.equal(minTotalLength - i);
                    }

                    // Combined values > minTotalLength
                    const padLength = randomPkcs7PaddingLength(
                        unsafeRandomBytesReturnU8(randomLength),
                        {
                            currentLength: minTotalLength,
                            minTotalLength,
                        },
                    );
                    expect(padLength).to.equal(randomLength);
                });
            }
        });

        describe('randomString', function () {
            const crypto = new TestTweetNaClBackend();

            for (const length of [1, 7, 32, 999]) {
                it(`generates a string of length ${length}`, () => {
                    const random = randomString(crypto, length);
                    expect(random.length).to.equal(length);
                });
            }

            it('can deal with non-ASCII charsets', () => {
                const charset = ['😄', '🐘', '👩‍👧', '✅', '💩'];
                const random = randomString(crypto, 13, charset);
                const graphemeClusters = getGraphemeClusters(random, Number.MAX_SAFE_INTEGER);
                expect(graphemeClusters.length).to.equal(13);
                for (const emoji of graphemeClusters) {
                    expect(charset).to.contain(emoji);
                }
            });
        });

        describe('domRandomBytes', function () {
            it('uses globalThis.crypto when self is unavailable', () => {
                const originalSelf = globalThis.self;
                const originalCrypto = globalThis.crypto;
                const values = new Uint8Array(4);

                // Node-like environments do not define `self`, but they do expose Web Crypto.
                // @ts-expect-error - removing an implicit global property for the test.
                delete globalThis.self;
                Object.defineProperty(globalThis, 'crypto', {
                    configurable: true,
                    value: {
                        getRandomValues: (target: Uint8Array) => {
                            target.set([1, 2, 3, 4]);
                            return target;
                        },
                    },
                });

                try {
                    domRandomBytes(values);
                    expect(Array.from(values)).to.deep.equal([1, 2, 3, 4]);
                } finally {
                    if (originalSelf === undefined) {
                        // @ts-expect-error - restoring the deleted global property.
                        delete globalThis.self;
                    } else {
                        Object.defineProperty(globalThis, 'self', {
                            configurable: true,
                            value: originalSelf,
                        });
                    }

                    Object.defineProperty(globalThis, 'crypto', {
                        configurable: true,
                        value: originalCrypto,
                    });
                }
            });
        });
    });
}
