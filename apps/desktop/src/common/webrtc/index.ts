import type {GroupCallId} from '~/common/network/protocol/call/group-call';
import type {ProxyMarked} from '~/common/utils/endpoint';
import type {RemoteAbortListener} from '~/common/utils/signal';
import type {AnyGroupCallContextAbort, GroupCallContext} from '~/common/webrtc/group-call';

export interface WebRtcService extends ProxyMarked {
    /**
     * Create a {@link GroupCallContext} for a {@link callId}.
     *
     * @param remoteAbort signal that removes the context when raised.
     * @param callId Group Call ID used as a lookup value for the context via
     *   {@link getGroupCallContextHandle}.
     * */
    readonly createGroupCallContext: (
        remoteAbort: RemoteAbortListener<AnyGroupCallContextAbort>,
        callId: GroupCallId,
    ) => GroupCallContext;
}
