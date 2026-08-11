// @ts-nocheck
import type {Logger} from '~/common/logging';
import type {u53} from '~/common/types';
import type {MonotonicEnumStore, StoreDebug} from '~/common/utils/store';

/**
 * A numeric enum requesting all available utilities.
 *
 * @generate convert name store
 */
export const enum ConnectionState {
    /** Not connected. */
    DISCONNECTED = 0,
    /** Connection is being established. */
    CONNECTING = 1,
    /** Connection has been established. */
    CONNECTED = 0x10,
}
