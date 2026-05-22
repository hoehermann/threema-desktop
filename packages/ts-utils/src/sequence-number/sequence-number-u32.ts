import {SequenceNumberUXX} from './sequence-number-uxx.js';

/**
 * A generic 32-bit unsigned sequence number. Prevents wrapping.
 */
// TODO(DESK-2092): Constrain `SNV` to `u32` once that type is available in this package.
export class SequenceNumberU32<SNV extends number> extends SequenceNumberUXX<SNV> {
    public constructor(start: SNV) {
        super(start, (2 ** 32 - 1) as SNV);
    }
}
