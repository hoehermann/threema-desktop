import {ensureError} from '@threema/ts-utils/meta/ensure-error';

import {ROUTE_DEFINITIONS, type RouteInstanceFor} from '~/app/routing/routes';
import type {AppServicesForSvelte} from '~/app/types';
import {i18n} from '~/app/ui/i18n';
import {toast} from '~/app/ui/snackbar';
import {ReceiverType} from '~/common/enum';
import {extractErrorMessage} from '~/common/error';
import type {Logger} from '~/common/logging';
import {keys} from '~/common/utils/object';

type PreloadedFilesArray = NonNullable<
    RouteInstanceFor<'main', 'conversation'>['params']['preloadedFiles']
>;

export async function collectLogsAndComposeMessageToSupport(
    services: Pick<AppServicesForSvelte, 'backend' | 'electron' | 'router'>,
    log: Logger,
): Promise<void> {
    try {
        const logFiles = await services.electron.getGzippedLogFiles();

        const preloadedFiles: PreloadedFilesArray = keys(logFiles).flatMap((key) => {
            const bytes = logFiles[key];
            if (bytes === undefined) {
                return [];
            }

            return [
                {
                    bytes,
                    fileName: `desktop-log-${key}.txt.gz`,
                    mediaType: 'application/gzip',
                },
            ];
        });
        if (preloadedFiles.length === 0) {
            throw new Error('No log files available to send to support');
        }

        const supportContact = await services.backend.viewModel
            .settings()
            .then(
                async (viewModelBundle) =>
                    await viewModelBundle.viewModelController.getOrCreatePredefinedContact(
                        '*SUPPORT',
                    ),
            );
        services.router.goToConversation(
            {
                receiverLookup: {
                    type: ReceiverType.CONTACT,
                    uid: supportContact.ctx,
                },
                preloadedFiles,
            },
            {
                nav: ROUTE_DEFINITIONS.nav.conversationList.withoutParams(),
            },
        );
    } catch (error) {
        log.error(
            `Sending logs to support was unsuccessful: ${extractErrorMessage(
                ensureError(error),
                'short',
            )}`,
        );
        toast.addSimpleFailure(
            i18n
                .get()
                .t('settings--about.error--send-logs-to-support', 'Failed to send log files.'),
        );
    }
}
