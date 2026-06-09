#!/usr/bin/env node
// @ts-check

/**
 * Generate structbuf bindings.
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
 * @param {string} extension The file name suffix to match (e.g. `.struct.yml`).
 * @returns {string[]} The matching absolute file paths.
 */
function filesWithExtension(directory, extension) {
    return fs
        .readdirSync(directory)
        .filter((name) => name.endsWith(extension))
        .map((name) => path.join(directory, name));
}

// Parse and validate arguments
const structbufTypescript = process.argv[2];
const protocolsDir = process.argv[3];
if (structbufTypescript === undefined || protocolsDir === undefined) {
    console.error(
        `Usage: ${process.argv[1]} <path-to-structbuf-typescript-bin.js> <path-to-threema-protocols>`,
    );
    process.exit(1);
}
const structbufTypescriptStat = fs.statSync(structbufTypescript, {throwIfNoEntry: false});
if (structbufTypescriptStat === undefined || !structbufTypescriptStat.isFile()) {
    console.error(`Error: structbuf binary not found: ${structbufTypescript}`);
    process.exit(1);
}
const protocolsDirStat = fs.statSync(protocolsDir, {throwIfNoEntry: false});
if (protocolsDirStat === undefined || !protocolsDirStat.isDirectory()) {
    console.error(`Error: protocols directory not found: ${protocolsDir}`);
    process.exit(1);
}

// Set the CWD to the project root
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const structbufOut = path.join(root, 'src/common/network/structbuf');

// prettier-ignore
// Generate
run(structbufTypescript, [
    ...filesWithExtension(path.join(protocolsDir, 'src'), '.struct.yml'),
    '-o', structbufOut,
    '--new-type', 'true',
    '--byte-length', 'true',
    '--snapshot', 'true',
    '--clone', 'true',
    '--base-class', 'Struct=~/common/network/structbuf/base',
    '--external-import', 'types=~/common/types',
]);

// Prettify
run('npx', ['prettier', '--write', path.join(structbufOut, '**/*.ts')]);
