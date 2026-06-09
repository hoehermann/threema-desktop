#!/usr/bin/env node
// @ts-check

/**
 * Generate protobuf bindings.
 *
 * Requires protoc >= 3.15.0 to be installed!
 */
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * Run a command and fail if it does not exit cleanly.
 *
 * @param {string} command The executable to run.
 * @param {readonly string[]} args The arguments to pass.
 * @param {import('node:child_process').SpawnSyncOptions} [options] Additional spawn options.
 * @returns {import('node:child_process').SpawnSyncReturns<string>} The completed spawn result.
 */
function run(command, args, options = {}) {
    const result = spawnSync(command, args, {stdio: 'inherit', encoding: 'utf8', ...options});
    if (result.status !== 0) {
        console.error(`Error: "${command}" exited with status ${result.status}`);
        process.exit(1);
    }
    return result;
}

/**
 * Return the absolute paths of all files in `directory` matching `extension`.
 *
 * @param {string} directory The directory to scan.
 * @param {string} extension The file name suffix to match (e.g. `.proto`).
 * @returns {string[]} The matching absolute file paths.
 */
function filesWithExtension(directory, extension) {
    return fs
        .readdirSync(directory)
        .filter((name) => name.endsWith(extension))
        .map((name) => path.join(directory, name));
}

// Ensure protoc is available
if (spawnSync('protoc', ['--version'], {stdio: 'ignore'}).status !== 0) {
    console.error(
        'ERROR: Protobuf compiler "protoc" not found in your PATH. Please install it manually: https://grpc.io/docs/protoc-installation/',
    );
    process.exit(1);
}

// Parse and validate arguments
const protocolsDir = process.argv[2];
if (protocolsDir === undefined) {
    console.error(`Usage: ${process.argv[1]} <path-to-threema-protocols>`);
    process.exit(1);
}
const protocolsDirStat = fs.statSync(protocolsDir, {throwIfNoEntry: false});
if (protocolsDirStat === undefined || !protocolsDirStat.isDirectory()) {
    console.error(`Error: protocols directory not found: ${protocolsDir}`);
    process.exit(1);
}

// Set the CWD to the project root
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

// Protocol layer
const outfile = 'src/common/network/protobuf/js/index.js';
run('node_modules/.bin/pbjs', [
    ...filesWithExtension(path.join(protocolsDir, 'src'), '.proto'),
    '-o',
    outfile,
    '-t',
    'static-module',
    '-w',
    'es6',
    '--force-long',
    '--force-message',
    '--no-convert',
    '--no-create',
    '--no-delimited',
    '--no-typeurl',
    '--no-verify',
]);

// Generate types, then strip the LongJS `require` (we inject an ES import below instead)
const types = run('node_modules/.bin/pbts', [outfile], {stdio: ['ignore', 'pipe', 'inherit']});
const postprocessed = run('tools/generate-protobuf-postprocess.cjs', [], {
    input: types.stdout,
    stdio: ['pipe', 'pipe', 'inherit'],
});
fs.writeFileSync(
    'src/common/network/protobuf/js/index.d.ts',
    postprocessed.stdout
        .split('\n')
        .filter((line) => !line.includes('require("long")'))
        .join('\n'),
);

// Inject Long global initialization
const lines = fs.readFileSync(outfile, 'utf8').split('\n');
fs.writeFileSync(
    outfile,
    [
        ...lines.slice(0, 2),
        '',
        '// Use LongJS',
        "import Long from 'long';",
        '$protobuf.util.Long = Long;',
        '$protobuf.configure();',
        ...lines.slice(2),
    ].join('\n'),
);

// Local protobuf modules
run('protoc', [
    '--plugin=./node_modules/.bin/protoc-gen-ts_proto',
    '--ts_proto_out=.',
    '--ts_proto_opt=forceLong=long',
    '--ts_proto_opt=esModuleInterop=true',
    '--ts_proto_opt=oneof=unions',
    '--ts_proto_opt=outputJsonMethods=false',
    '--ts_proto_opt=outputPartialMethods=false',
    '--ts_proto_opt=constEnums=true',
    '--ts_proto_opt=outputClientImpl=false',
    '--ts_proto_opt=outputServices=false',
    '--ts_proto_opt=env=browser',
    '--ts_proto_opt=exportCommonSymbols=false',
    '--ts_proto_opt=enumsAsLiterals=true',
    ...filesWithExtension('src/common/internal-protobuf', '.proto'),
]);
