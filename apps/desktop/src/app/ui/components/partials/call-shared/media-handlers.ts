import {TIMER} from '@threema/ts-utils/timer/global-timer';

import type {AppServicesForSvelte} from '~/app/types';
import {
    type AnyAugmentedOngoingCallViewModelBundle,
    type AnyExtendedGroupCallContextAbort,
    type CaptureDevices,
    type CaptureDevicesGuard,
    attachLocalDeviceAndAnnounceCaptureState,
    createCaptureDevices,
    findMediaDevice,
    releaseCameraDevice,
    selectCameraDevice,
    selectInitialCaptureDevices,
    selectMicrophoneDevice,
    startScreenSharing,
    updateRemoteParticipantRemoteCameras,
    updateRemoteParticipantScreens,
} from '~/app/ui/components/partials/call-shared/helpers';
import type {
    AudioInputDeviceInfo,
    AudioOutputDeviceInfo,
    VideoDeviceInfo,
} from '~/app/ui/components/partials/call-shared/internal/control-bar/types';
import type {i18n as i18nStore} from '~/app/ui/i18n';
import {toast} from '~/app/ui/snackbar';
import type {ElectronIpcService} from '~/common/dom/electron-service';
import type {Logger} from '~/common/logging';
import type {ParticipantId} from '~/common/network/protocol/call/group-call';
import type {Dimensions} from '~/common/types';
import {assertUnreachable} from '~/common/utils/assert';
import type {AbortRaiser} from '~/common/utils/signal';
import type {ReadableStore} from '~/common/utils/store';

/**
 * Everything the media handlers need from the hosting activity component.
 *
 * `getCall`/`getStop` are accessors (not values) because `call`/`stop` are reassigned over the call
 * lifecycle; the handlers — especially the debouncers and error handlers — must always read the
 * latest value.
 */
export interface CallMediaHandlersContext {
    readonly services: AppServicesForSvelte;
    readonly log: Logger;
    readonly electron: ElectronIpcService;
    readonly i18n: typeof i18nStore;
    readonly getCall: () => AnyAugmentedOngoingCallViewModelBundle | undefined;
    readonly getStop: () => AbortRaiser<AnyExtendedGroupCallContextAbort> | undefined;
    readonly setAudioSink: (deviceId: string | undefined) => void;
}

export type CallMediaHandlers = ReturnType<typeof createCallMediaHandlers>;

/**
 * Create the device-control handlers shared by the group- and conference-call activities.
 *
 * The factory owns the capture devices (microphone/camera/screen) — both the hosting component
 * (template + feed builders) and the handlers need them — and returns them alongside the handler
 * closures.
 */
export function createCallMediaHandlers(ctx: CallMediaHandlersContext): {
    readonly guard: CaptureDevicesGuard;
    readonly localDevices: ReadableStore<CaptureDevices>;
    readonly selectAudioInput: (device: AudioInputDeviceInfo) => void;
    readonly selectAudioOutput: (device: AudioOutputDeviceInfo) => void;
    readonly selectVideo: (device: VideoDeviceInfo) => void;
    readonly toggleMicrophone: (state: 'on' | 'off' | 'toggle') => void;
    readonly toggleCamera: (state: 'on' | 'off' | 'toggle') => void;
    readonly toggleScreenSharing: () => void;
    readonly updateCameraSubscription: (
        dimensions: Dimensions | undefined,
        participantId: 'local' | ParticipantId,
    ) => void;
    readonly updateScreenSubscription: (
        dimensions: Dimensions | undefined,
        participantId: 'local' | ParticipantId,
    ) => void;
    readonly initializeCaptureDevices: (initial: {
        readonly microphone: boolean;
        readonly camera: boolean;
    }) => void;
    readonly stopCapture: () => void;
} {
    const {services, log, electron, i18n, getCall, getStop, setAudioSink} = ctx;

    const {guard, store: localDevices} = createCaptureDevices();

    const updateCameraSubscription = TIMER.debounceWithDistinctArgs(
        (dimensions: Dimensions | undefined, participantId: 'local' | ParticipantId) => {
            const call = getCall();
            if (call === undefined || getStop() === undefined || participantId === 'local') {
                // If call is `undefined` (i.e., not running) or not started, there's no need to un-
                // or resubscribe the camera feed. Additionally, if it's the user's own camera feed,
                // there's no need to manage it.
                return;
            }

            // Note: `dimensions`/`participantId` originate from plain (non-reactive) values, so no
            // `$state.snapshot` unwrapping is required before sending them to the backend.
            updateRemoteParticipantRemoteCameras({
                controller: call.controller,
                participantId,
                dimensions,
            }).catch((error: unknown) => {
                log.error('Updating remote camera subscription failed', error);
                getStop()?.raise({origin: 'ui-component', cause: 'unexpected-error'});
            });
        },
        500,
        // Debounce using `distinctArgs` and use the participant id as the key, so the debounced
        // function is called once for each participant.
        (_, id) => `${id}`,
        true,
    );

    const updateScreenSubscription = TIMER.debounceWithDistinctArgs(
        (dimensions: Dimensions | undefined, participantId: 'local' | ParticipantId) => {
            const call = getCall();
            if (call === undefined || getStop() === undefined || participantId === 'local') {
                return;
            }

            // Note: `dimensions`/`participantId` originate from plain (non-reactive) values, so no
            // `$state.snapshot` unwrapping is required before sending them to the backend.
            updateRemoteParticipantScreens({
                controller: call.controller,
                participantId,
                dimensions,
            }).catch((error: unknown) => {
                log.error('Updating remote screen subscription failed', error);
                getStop()?.raise({origin: 'ui-component', cause: 'unexpected-error'});
            });
        },
        500,
        // Debounce using `distinctArgs` and use the participant id as the key, so the debounced
        // function is called once for each participant.
        (_, id) => `${id}`,
        true,
    );

    function selectAudioInput(device: AudioInputDeviceInfo): void {
        selectMicrophoneDevice(guard, getCall(), {
            device: {
                deviceId: device.deviceId,
            },
            state: (localDevices.get().microphone?.track.enabled ?? false) ? 'on' : 'off',
        })
            .then(async () => {
                await services.settings.update({
                    type: 'calls',
                    update: {lastSelectedMicrophone: device.label},
                });
                log.debug(`Selected microphone device "${device.label}" was saved to settings`);
            })
            .catch((error: unknown) => {
                log.error(
                    `Error selecting or saving selected microphone device ${device.label}: ${error}`,
                );
            });
    }

    function selectAudioOutput(device: AudioOutputDeviceInfo): void {
        setAudioSink(device.deviceId);
        services.settings
            .update({
                type: 'calls',
                update: {
                    lastSelectedSpeakers: device.label,
                },
            })
            .then(() => {
                log.debug(`Selected speaker device "${device.label}" was saved to settings`);
            })
            .catch((error: unknown) => {
                log.error(
                    `Error saving selected speaker device "${device.label}" to settings: ${error}`,
                );
            });
    }

    function selectVideo(device: VideoDeviceInfo): void {
        async function persistSelection(): Promise<void> {
            await services.settings.update({
                type: 'calls',
                update: {lastSelectedCamera: device.label},
            });
            log.debug(`Selected camera device "${device.label}" was saved to settings`);
        }

        // While the camera is off, the device is released, so only persist the selection. It will be
        // used the next time the camera is turned on (see `acquireCamera`).
        if (localDevices.get().camera === undefined) {
            persistSelection().catch((error: unknown) => {
                log.warn(`Error saving selected camera device ${device.label}: ${error}`);
            });
            return;
        }

        // While the camera is on, switch the live device and persist the selection.
        selectCameraDevice(guard, getCall(), {
            device: {
                deviceId: device.deviceId,
            },
            facing: 'user',
            state: 'on',
        })
            .then(persistSelection)
            .catch((error: unknown) => {
                log.warn(
                    `Error selecting or saving selected camera device ${device.label}: ${error}`,
                );
            });
    }

    function toggleMicrophone(state: 'on' | 'off' | 'toggle'): void {
        guard
            .with(async (store) => {
                const microphone = store.get().microphone;
                return await attachLocalDeviceAndAnnounceCaptureState(
                    guard,
                    getCall(),
                    store,
                    'microphone',
                    microphone === undefined
                        ? undefined
                        : {
                              track: microphone.track,
                              state,
                          },
                );
            }, 'attach')
            .catch((error: unknown) => {
                log.error(`Setting local microphone capture state failed`, error);
                getStop()?.raise({origin: 'ui-component', cause: 'unexpected-error'});
            });
    }

    function toggleCamera(state: 'on' | 'off' | 'toggle'): void {
        // The camera is considered "off" while no track is held (it is released and re-acquired on
        // demand, rather than kept open with `enabled = false`).
        const isCurrentlyOff = localDevices.get().camera === undefined;
        const turnOn = state === 'on' || (state === 'toggle' && isCurrentlyOff);

        if (turnOn) {
            // Acquire the camera on demand. Resolve the last selected camera from settings, falling
            // back to the default device.
            acquireCamera().catch((error: unknown) => {
                log.error(`Acquiring local camera device failed`, error);
                getStop()?.raise({origin: 'ui-component', cause: 'unexpected-error'});
            });
        } else {
            // Turn off by releasing the camera hardware immediately (no grace period).
            releaseCameraDevice(guard, getCall()).catch((error: unknown) => {
                log.error(`Releasing local camera device failed`, error);
                getStop()?.raise({origin: 'ui-component', cause: 'unexpected-error'});
            });
        }
    }

    async function acquireCamera(): Promise<void> {
        // Resolve the last selected camera from settings to a device id, falling back to the default
        // device if it is unset or no longer available.
        const {lastSelectedCamera} = services.settings.views.calls.get();
        let device: 'default' | {readonly deviceId: string} = 'default';
        if (lastSelectedCamera !== undefined) {
            const mediaDevice = await findMediaDevice('videoinput', lastSelectedCamera);
            if (mediaDevice !== undefined) {
                device = {deviceId: mediaDevice.deviceId};
            }
        }

        try {
            await selectCameraDevice(guard, getCall(), {device, facing: 'user', state: 'on'});
        } catch (error) {
            // Acquiring the camera failed (e.g. the device is busy or access was denied). Stay off
            // and inform the user with a dismissable toast, but do not abort the call.
            log.warn(`Acquiring camera device failed`, error);
            toast.addDismissable(
                i18n
                    .get()
                    .t('messaging.error--call-camera-unavailable', 'Camera could not be turned on'),
                {
                    type: 'md-icon',
                    name: 'error',
                    theme: 'Outlined',
                    color: 'red',
                },
            );
        }
    }

    function toggleScreenSharing(): void {
        guard
            .with(async (store) => {
                const screen = store.get().screen;

                if (screen === undefined || screen.state === 'off') {
                    await startScreenSharing(
                        electron,
                        guard,
                        store,
                        getCall(),
                        i18n
                            .get()
                            .t(
                                'messaging.hint--call-screen-sharing-enabled',
                                'You are sharing your screen',
                            ),
                        i18n.get().t('messaging.label--call-screen-sharing-stop', 'Stop sharing'),
                    );

                    // Register callback to stop screen sharing.
                    electron.registerOnScreenSharingStopCallback(() => {
                        guard
                            .with(
                                (s) => s.get().screen?.track.dispatchEvent(new Event('ended')),
                                'select-screen',
                            )
                            .catch((error: unknown) => {
                                log.error(`Stopping screen sharing failed`, error);
                            });
                    });
                } else {
                    screen.track.dispatchEvent(new Event('ended'));
                }
            }, 'select-screen')
            .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === 'AbortError') {
                    toast.addDismissable(
                        i18n
                            .get()
                            .t(
                                'messaging.error--picker-time-out',
                                'Screen sharing timed out. Please try again.',
                            ),
                        {
                            type: 'md-icon',
                            name: 'error',
                            theme: 'Outlined',
                            color: 'red',
                        },
                    );
                    return;
                }
                log.debug(`Toggle screen sharing failed`, error);
            });
    }

    function initializeCaptureDevices(initial: {
        readonly microphone: boolean;
        readonly camera: boolean;
    }): void {
        const {lastSelectedCamera, lastSelectedMicrophone} = services.settings.views.calls.get();
        selectInitialCaptureDevices(
            log,
            guard,
            {
                microphone: {state: initial.microphone ? 'on' : 'off'},
                camera: {state: initial.camera ? 'on' : 'off'},
                screen: {state: 'off'},
            },
            {
                preferredDevices: {
                    camera:
                        lastSelectedCamera === undefined
                            ? {type: 'default'}
                            : {
                                  type: 'by-device-label',
                                  deviceLabel: lastSelectedCamera,
                                  kind: 'videoinput',
                              },
                    microphone:
                        lastSelectedMicrophone === undefined
                            ? {type: 'default'}
                            : {
                                  type: 'by-device-label',
                                  deviceLabel: lastSelectedMicrophone,
                                  kind: 'audioinput',
                              },
                },
            },
        ).catch((error: unknown) => {
            log.error(`Setting initial local capture devices failed`, error);
            getStop()?.raise({origin: 'ui-component', cause: 'unexpected-error'});
        });
    }

    function stopCapture(): void {
        guard
            .with((store) => {
                const devices = store.get();
                devices.microphone?.track.stop();
                devices.camera?.track.stop();
            }, 'stop')
            .catch(assertUnreachable);
    }

    return {
        guard,
        localDevices,
        selectAudioInput,
        selectAudioOutput,
        selectVideo,
        toggleMicrophone,
        toggleCamera,
        toggleScreenSharing,
        updateCameraSubscription,
        updateScreenSubscription,
        initializeCaptureDevices,
        stopCapture,
    };
}
