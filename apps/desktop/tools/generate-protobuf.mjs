#!/usr/bin/env node
// @ts-check

/**
 * Generate protobuf bindings for the local (internal) protobuf modules.
 *
 * Requires protoc >= 3.15.0 to be installed!
 *
 * When run with `--postinstall` (e.g. as part of the pnpm `postinstall` hook), a missing `protoc`
 * does not lead to an error but only to a warning, so that `pnpm install` works on systems without
 * `protoc`.
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
 */
function run(command, args) {
    const result = spawnSync(command, args, {stdio: 'inherit'});
    if (result.status !== 0) {
        console.error(`Error: "${command}" exited with status ${result.status}`);
        process.exit(1);
    }
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

// Parse arguments
const postinstall = process.argv.includes('--postinstall');

// Ensure protoc is available
if (spawnSync('protoc', ['--version'], {stdio: 'ignore'}).status !== 0) {
    const message =
        'Protobuf compiler "protoc" not found in your PATH. Please install it manually: https://grpc.io/docs/protoc-installation/';
    if (postinstall) {
        console.warn(`Warning: ${message}`);
        console.warn('Skipping generation of internal protobuf modules.');
        process.exit(0);
    }
    console.error(`ERROR: ${message}`);
    process.exit(1);
}

// Set the CWD to the project root
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

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
