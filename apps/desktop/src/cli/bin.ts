import * as fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import * as path from 'node:path';
import * as process from 'node:process';
import * as readline from 'node:readline/promises';

import initLibthreema, * as libthreema from '@threema/libthreema-wasm';
import {bytesToHex} from '@threema/ts-utils/byte/bytes-to-hex';
import type {u53} from '@threema/ts-utils/integer/u53';

import {cliStubServicesForKeyStorage} from 'cli/services';
import {STATIC_CONFIG} from '~/common/config';
import {type CryptoBackend} from '~/common/crypto';
import {TweetNaClBackend} from '~/common/crypto/tweetnacl';
import {
    Backend,
    type BackendInit,
    type CertificatePinRecoveryHandle,
    type FactoriesForBackend,
    type LoadingState,
    type LoadingStateSetup,
} from '~/common/dom/backend';
import {createEndpointService} from '~/common/dom/utils/endpoint';
import {TRANSFER_HANDLER} from '~/common/index';
import {PROXY_HANDLER, type ProxyEndpoint, type ProxyMarked} from '~/common/utils/endpoint';
import {extractErrorTraceback} from '~/common/error';
import {CONSOLE_LOGGER, type Logger, type LoggerFactory, TagLogger} from '~/common/logging';
import type {RawDatabaseKey, ServicesForDatabaseFactory} from '~/common/db';
import type {ServicesForFileStorageFactory} from '~/common/file-storage';
import type {ServicesForKeyStorageFactory} from '~/common/key-storage';
import type {DbMigrationSupplements} from '~/common/node/db/migrations';
import {SqliteDatabaseBackend} from '~/common/node/db/sqlite';
import {randomBytes} from '~/common/node/crypto/random';
import {FileSystemFileStorage} from '~/common/node/file-storage/system-file-storage';
import {TempFileSystemFileStorage} from '~/common/node/file-storage/temp-system-file-storage';
import {directoryModeInternalObjectIfPosix} from '~/common/node/fs';
import {FileSystemKeyStorage} from '~/common/node/key-storage';
import {getKeyStoragePath} from '~/common/node/key-storage/helpers';
import {ZlibCompressor} from '~/common/node/compressor';
import type {SystemDialog, SystemDialogHandle} from '~/common/system-dialog';
import {assert, setAssertFailLogger, unreachable} from '~/common/utils/assert';
import {WritableStore} from '~/common/utils/store';
import type {SystemInfo} from '~/common/electron-ipc';

const COMMANDS = ['openSqlite', 'listenForMessages'] as const;

type Command = (typeof COMMANDS)[u53];

const logger = CONSOLE_LOGGER;

const USAGES: Record<Command, {readonly usage: string; readonly help: string}> = {
    openSqlite: {
        usage: '<profile-dir>',
        help: 'Open the encrypted SQLite database with `sqlcipher`. Requires the `sqlcipher` binary on your system.',
    },
    listenForMessages: {
        usage: '<profile-dir>',
        help: 'Connect to the live Threema backend and print incoming messages to stdout.',
    },
};

function printUsage(entrypoint: string): void {
    logger.info(`Usage: ${entrypoint} COMMAND <command-args>`);
    logger.info();
    logger.info('Commands:');
    for (const command of COMMANDS) {
        logger.info(`  ${command}: ${USAGES[command].help}`);
        logger.info(`    Args: ${USAGES[command].usage}`);
    }
}

function getDatabaseKeyBytes(databaseKey: unknown): Uint8Array {
    if (typeof databaseKey === 'object' && databaseKey !== null && 'unwrap' in databaseKey) {
        const unwrap = (databaseKey as {unwrap?: unknown}).unwrap;
        if (typeof unwrap === 'function') {
            return unwrap.call(databaseKey) as Uint8Array;
        }
    }
    if (databaseKey instanceof Uint8Array) {
        return databaseKey;
    }
    throw new Error('Database key from key storage is not a supported byte array');
}

function createLoggerFactory(rootTag: string, defaultStyle: string): LoggerFactory {
    return TagLogger.styled(CONSOLE_LOGGER, rootTag, defaultStyle);
}

function createEndpointLoggerFactory(): LoggerFactory {
    return TagLogger.styled(CONSOLE_LOGGER, 'cli', '');
}

function createProxyEndpoint<TTarget extends ProxyMarked>(
    endpointService: ReturnType<typeof createEndpointService>,
    target: TTarget,
    loggerTag: string,
): ProxyEndpoint<TTarget> {
    const {local, remote} = endpointService.createEndpointPair<TTarget>();
    endpointService.exposeProxy(target, local, createEndpointLoggerFactory().logger(loggerTag));
    return remote as ProxyEndpoint<TTarget>;
}

/**
 * Parse command line arguments.
 */
function parseArgs(argv: readonly string[]): Command {
    const node = argv[0];
    const entrypoint = argv[1];
    assert(node !== undefined && entrypoint !== undefined, 'argv does not include entrypoint');

    if (argv.includes('--help')) {
        printUsage(entrypoint);
        process.exit(1);
    }

    const command = argv[2];
    if (command === undefined) {
        printUsage(entrypoint);
        process.exit(1);
    }
    for (const validCommand of COMMANDS) {
        if (validCommand === command) {
            return command;
        }
    }
    logger.error(`Unknown command: ${command}`);
    printUsage(entrypoint);
    return process.exit(1);
}

async function main(): Promise<void> {
    logger.info();
    logger.info('▀█▀ █▄█ █▀▄ ██▀ ██▀ █▄ ▄█ ▄▀▄   ▄▀▀ █   █');
    logger.info(' █  █ █ █▀▄ █▄▄ █▄▄ █ ▀ █ █▀█   ▀▄▄ █▄▄ █');
    logger.info();

    const command = parseArgs(process.argv);

    switch (command) {
        case 'openSqlite':
            await runSqlite(process.argv.slice(3));
            break;
        case 'listenForMessages':
            await runListenForMessages(process.argv.slice(3));
            break;
        default:
            unreachable(command);
    }
}

async function promptForPassword(): Promise<string> {
    const rl = readline.createInterface({input: process.stdin, output: process.stdout});
    const keyStoragePassword = await rl.question('Key storage password (WARNING, will be visible): ');
    rl.close();
    return keyStoragePassword;
}

async function openKeyStorage(
    crypto: CryptoBackend,
    profileDirectoryPath: string,
): Promise<{
    readonly keyStorage: FileSystemKeyStorage;
    readonly keyStoragePassword: string;
    readonly contents: Awaited<ReturnType<FileSystemKeyStorage['init']>>;
}> {
    const keyStorage = new FileSystemKeyStorage(
        {
            crypto,
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            ...cliStubServicesForKeyStorage,
        },
        logger,
        profileDirectoryPath,
    );

    const keyStoragePassword = await promptForPassword();
    const contents = await keyStorage.init(keyStoragePassword);
    logger.info(`Loaded key storage for identity ${contents.inner.identityData.identity}`);

    return {keyStorage, keyStoragePassword, contents};
}

async function runSqlite(argv: string[]): Promise<void> {
    const crypto = new TweetNaClBackend(randomBytes);

    const profileDirectoryPath = argv[0];
    if (profileDirectoryPath === undefined) {
        logger.error('Please provide <profile-dir> parameter!');
        return process.exit(1);
    }

    const checkVersionResult = spawnSync('sqlcipher', ['--version'], {encoding: 'utf-8'});
    if (checkVersionResult.error !== undefined) {
        logger.error(`Could not invoke \`sqlcipher\` binary: ${checkVersionResult.error}`);
        logger.error('Please ensure that you have installed SQLCipher 4 on your system.');
        return process.exit(1);
    }
    const checkVersionOutput = checkVersionResult.stdout.trim();
    const sqlCipherVersion = checkVersionOutput.match(/\(SQLCipher (?<version>[^)]*)\)/u)?.groups
        ?.version;
    if (sqlCipherVersion === undefined) {
        logger.error(`SQLCipher version detection failed: ${checkVersionOutput}`);
        logger.error('Please ensure that you have installed SQLCipher 4 on your system.');
        return process.exit(1);
    }
    logger.info(`Found sqlcipher version: ${sqlCipherVersion}`);
    if (!sqlCipherVersion.startsWith('4.')) {
        logger.error('Did not detect SQLCipher version 4.');
        logger.error('Please ensure that you have installed SQLCipher 4 on your system.');
        return process.exit(1);
    }

    const {contents} = await openKeyStorage(crypto, profileDirectoryPath);

    const databasePath = path.join(profileDirectoryPath, 'data', 'threema.sqlite');
    const databaseKeyBytes = getDatabaseKeyBytes(contents.inner.databaseKey);
    const spawnResult = spawnSync(
        'sqlcipher',
        [
            '-cmd',
            'PRAGMA cipher_compatibility = 4',
            '-cmd',
            `PRAGMA key = "x'${bytesToHex(databaseKeyBytes)}'"`,
            databasePath,
        ],
        {encoding: 'utf-8', stdio: 'inherit'},
    );
    if (spawnResult.status !== 0) {
        logger.error('Subprocess failed:', spawnResult);
    }
    return undefined;
}

function createBackendFactories(profileDirectoryPath: string): FactoriesForBackend {
    return {
        hasIdentity: () => true,
        logging: (rootTag: string, defaultStyle: string) => createLoggerFactory(rootTag, defaultStyle),
        keyStorage: (
            services: ServicesForKeyStorageFactory,
            log: Logger,
            loadFromOldProfile?: boolean,
        ) => {
            const resolvedProfileDirectoryPath =
                loadFromOldProfile === true ? path.join(profileDirectoryPath, '..', 'old-profile') : profileDirectoryPath;
            const keyStoragePath = getKeyStoragePath(resolvedProfileDirectoryPath);
            fs.mkdirSync(path.dirname(keyStoragePath), {
                recursive: true,
                ...directoryModeInternalObjectIfPosix(),
            });
            return new FileSystemKeyStorage(services, log, resolvedProfileDirectoryPath);
        },
        fileStorage: (
            services: ServicesForFileStorageFactory,
            log: Logger,
            loadFromOldProfile?: boolean,
        ) => {
            const basePath = loadFromOldProfile === true ? path.join(profileDirectoryPath, '..', 'old-profile') : profileDirectoryPath;
            const fileStoragePath = path.join(basePath, ...STATIC_CONFIG.FILE_STORAGE_PATH);
            fs.mkdirSync(fileStoragePath, {recursive: true, ...directoryModeInternalObjectIfPosix()});
            return new FileSystemFileStorage(services, log, fileStoragePath);
        },
        tempFileStorage: (log: Logger) => {
            const fileStoragePath = path.join(profileDirectoryPath, 'temp');
            fs.mkdirSync(fileStoragePath, {recursive: true, ...directoryModeInternalObjectIfPosix()});
            return new TempFileSystemFileStorage(log, fileStoragePath);
        },
        compressor: () => new ZlibCompressor(),
        db: (
            services: ServicesForDatabaseFactory,
            log: Logger,
            migrationSupplementaryInformation: DbMigrationSupplements,
            key: RawDatabaseKey,
            shouldExist: boolean,
            loadFromOldProfile?: boolean,
        ) => {
            const basePath = loadFromOldProfile === true ? path.join(profileDirectoryPath, '..', 'old-profile') : profileDirectoryPath;
            const databasePath = path.join(basePath, ...services.config.DATABASE_PATH);
            if (!shouldExist) {
                fs.rmSync(databasePath, {force: true});
            }
            const backend = SqliteDatabaseBackend.create(
                log,
                migrationSupplementaryInformation,
                databasePath,
                key,
            );
            backend.runMigrations();
            backend.checkIntegrity();
            return backend;
        },
    };
}

async function runListenForMessages(argv: string[]): Promise<void> {
    const crypto = new TweetNaClBackend(randomBytes);

    const profileDirectoryPath = argv[0];
    if (profileDirectoryPath === undefined) {
        logger.error('Please provide <profile-dir> parameter!');
        return process.exit(1);
    }

    logger.info(`Starting live listener for profile: ${profileDirectoryPath}`);

    await initLibthreema();
    libthreema.init(
        {handle: (info: string) => logger.error('libthreema panic:', info)},
        {
            debug: logger.debug.bind(logger),
            info: logger.info.bind(logger),
            warn: logger.warn.bind(logger),
            error: logger.error.bind(logger),
        },
        import.meta.env.DEBUG ? 'debug' : 'info',
    );

    const {contents, keyStoragePassword} = await openKeyStorage(crypto, profileDirectoryPath);

    const endpointLogging = createEndpointLoggerFactory();
    const endpointService = createEndpointService({logging: endpointLogging});

    const systemInfo: SystemInfo = {
        os: 'linux',
        arch: process.arch,
        locale: 'en_US.UTF-8',
        isSafeStorageAvailable: false,
    };

    const electronService = {
        getAppPath: () => profileDirectoryPath,
        getSystemInfo: async () => systemInfo,
        reportError: () => undefined,
        logToFile: async () => undefined,
        logWebrtcStatsToFile: async () => undefined,
        getGzippedLogFiles: async () => ({app: new Uint8Array(), backend: new Uint8Array()}),
        getLogFilePaths: async () => ({app: undefined, backend: undefined}),
        restartAppAndInstallUpdate: async () => undefined,
        removeOldProfiles: async () => undefined,
        updatePublicKeyPins: async () => undefined,
        setAutoUpdateEnabled: async () => undefined,
        getAppVersion: async () => '0.0.0',
        getBuildInfo: async () => ({appName: 'CLI', buildVersion: 'dev', buildDate: 'dev'}),
    };

    const mediaService = {
        getSystemMedia: async () => undefined,
        prepareMedia: async () => undefined,
        getMedia: async () => undefined,
    };

    const notificationService = {
        create: () => undefined,
        send: async () => undefined,
    };

    const openSystemDialog = (dialog: SystemDialog): SystemDialogHandle => {
        logger.warn(`System dialog requested: ${JSON.stringify(dialog)}`);
        return {
            [TRANSFER_HANDLER]: PROXY_HANDLER,
            closed: Promise.resolve({type: 'dismissed'}),
            setProgress: () => undefined,
        };
    };
    const systemDialogService = {
        closeAll: () => undefined,
        open: openSystemDialog,
        openOnce: openSystemDialog,
    };

    const webRtcService = {
        startScreenShare: async () => undefined,
        stopScreenShare: async () => undefined,
    };

    const loadingStore = new WritableStore<LoadingState>({state: 'initializing'});
    const loadingStateSetup = {
        loadingState: {
            store: loadingStore,
            updateState: (state: LoadingState) => {
                loadingStore.set(state);
                logger.info(`Loading state: ${JSON.stringify(state)}`);
            },
        },
    } as unknown as LoadingStateSetup;

    const certificatePinRecoveryHandle = {
        recoverCertificatePins: async () => ({isRemoteSecretActive: false}),
    } as unknown as CertificatePinRecoveryHandle;

    const backendInit: BackendInit = {
        electronEndpoint: createProxyEndpoint(endpointService, electronService as never, 'cli.electron'),
        mediaEndpoint: createProxyEndpoint(endpointService, mediaService as never, 'cli.media'),
        notificationEndpoint: createProxyEndpoint(endpointService, notificationService as never, 'cli.notifications'),
        systemDialogEndpoint: createProxyEndpoint(endpointService, systemDialogService as never, 'cli.system-dialog'),
        webRtcEndpoint: createProxyEndpoint(endpointService, webRtcService as never, 'cli.webrtc'),
        systemInfo,
    };

    const backendHandleEndpoint = await Backend.createFromKeyStorage(
        backendInit,
        createBackendFactories(profileDirectoryPath),
        {
            endpoint: endpointService,
            logging: endpointLogging,
        },
        keyStoragePassword,
        createProxyEndpoint(endpointService, loadingStateSetup as never, 'cli.loading-state') as ProxyEndpoint<LoadingStateSetup>,
        createProxyEndpoint(endpointService, certificatePinRecoveryHandle as never, 'cli.pin-recovery') as ProxyEndpoint<CertificatePinRecoveryHandle>,
    );

    logger.info('Backend connection started; waiting for incoming messages. Press Ctrl+C to stop.');
    await new Promise(() => undefined);
}

setAssertFailLogger((error) => CONSOLE_LOGGER.error(extractErrorTraceback(error)));
main()
    .then(() => {})
    .catch((error: unknown) => {
        logger.error(`Command failed: ${error}`);
        logger.error(`Stack: ${error.stack}`);
        process.exit(1);
    });
