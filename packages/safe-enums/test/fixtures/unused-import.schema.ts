// @ts-nocheck
import type {Logger} from '~/common/logging';
import type {u53} from '@threema/ts-utils/integer/u53';

/**
 * A numeric enum whose utilities reference `u53`, but not `Logger`. The `Logger` import is therefore
 * dropped from the generated module.
 *
 * @generate convert
 */
export const enum CspPayloadType {
    ECHO_REQUEST = 0x00,
    ECHO_RESPONSE = 0x80,
}
