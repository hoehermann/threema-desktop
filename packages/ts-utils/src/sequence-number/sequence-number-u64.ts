/**
 * A generic 64-bit unsigned sequence number. Prevents wrapping.
 */
// TODO(DESK-2092): Constrain `SNV` to `u64` and type `start`/`_value` accordingly once that type
// is available in this package.
export class SequenceNumberU64<SNV extends bigint> {
    private static readonly _MAX_VALUE = 2n ** 64n - 1n;
    private _value: bigint;

    public constructor(start: bigint) {
        this._value = start;
    }

    /**
     * Return the next sequence number (i.e. the current value plus one).
     * Increases the internal value by one.
     */
    public next(): SNV {
        if (this._value === SequenceNumberU64._MAX_VALUE) {
            throw new Error('Sequence number would overflow');
        }
        this._value += 1n;
        return this._value as SNV;
    }
}
