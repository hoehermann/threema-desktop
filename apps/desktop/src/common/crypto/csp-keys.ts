import {deriveKey, wrapRawKey} from '@threema/crypto';
import {NonceScope} from '@threema/protocol/enum';
import {byteJoin} from '@threema/ts-utils/byte/byte-join';
import {tag} from '@threema/ts-utils/meta/newtype';

import type {ServicesForBackend} from '~/common/backend';
import type {Config} from '~/common/config';
import type {PublicKey} from '~/common/crypto';
import type {
    ClientKey,
    DirectoryChallengeResponseKey,
    MessageMetadataBox,
    TemporaryServerKey,
    VouchKey,
} from '~/common/network/types/keys';

const PERSONAL = '3ma-csp';

/**
 * Derive the Vouch Key for authentication towards the chat server.
 */
export function deriveVouchKey(config: Config, ck: ClientKey, tsk: TemporaryServerKey): VouchKey {
    const ss1 = ck.getSharedSecret(config.CHAT_SERVER_KEY);
    const ss2 = ck.getSharedSecret(tsk);
    const ss1AndSs2 = wrapRawKey(byteJoin(ss1.unwrap(), ss2.unwrap()), 64);
    ss1.purge();
    ss2.purge();
    const vouchKey = tag<VouchKey>(
        deriveKey(32, ss1AndSs2.asReadonly(), {
            personal: PERSONAL,
            salt: 'v2',
        }),
    );
    ss1AndSs2.purge();
    return vouchKey;
}

/**
 * Derive the Response Key for authentication towards the directory server.
 */
export function deriveDirectoryChallengeResponseKey(
    ck: ClientKey,
    challengeRequestKey: PublicKey,
): DirectoryChallengeResponseKey {
    return tag<DirectoryChallengeResponseKey>(
        ck.deriveSharedKey(32, challengeRequestKey, {
            personal: PERSONAL,
            salt: 'dir',
        }),
    );
}

/**
 * Derive the key used for the `MessageMetadata` box.
 */
export function deriveMessageMetadataKey(
    services: Pick<ServicesForBackend, 'crypto' | 'nonces'>,
    ck: ClientKey,
    contactPublicKey: PublicKey,
): MessageMetadataBox {
    const {crypto, nonces} = services;
    return tag<MessageMetadataBox>(
        crypto.getSecretBox(
            ck
                .deriveSharedKey(32, contactPublicKey, {
                    personal: PERSONAL,
                    salt: 'mm',
                })
                .asReadonly(),
            NonceScope.CSP,
            nonces,
        ),
    );
}
