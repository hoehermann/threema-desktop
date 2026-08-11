// @ts-check

/**
 * Golden-file tests for the safe enum generator, driven through the CLI's standard-output mode.
 *
 * To refresh the expected files after an intended change to the emitted output, run the tests with
 * `--update` (e.g. `pnpm exec vitest run --update`) and review the resulting diff.
 */
import {spawnSync} from 'node:child_process';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

import {describe, expect, test} from 'vitest';

const CLI = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const FIXTURES_DIR = fileURLToPath(new URL('./fixtures', import.meta.url));

/**
 * Run the generator CLI with the given arguments.
 *
 * @param {readonly string[]} args The arguments to pass.
 * @returns {{status: number | null, stdout: string, stderr: string}} the result of the run.
 */
function generate(args) {
    const {status, stdout, stderr} = spawnSync(process.execPath, [CLI, ...args], {
        encoding: 'utf8',
    });
    return {status, stdout, stderr};
}

/**
 * Run the generator CLI for the given schema fixture, printing to standard output.
 *
 * @param {string} name The name of the fixture (without suffix).
 * @returns {{status: number | null, stdout: string, stderr: string}} the result of the run.
 */
function generateFixture(name) {
    return generate([path.join(FIXTURES_DIR, `${name}.schema.ts`)]);
}

describe('safe enum generation', () => {
    for (const name of ['leading-directives', 'numeric-enum', 'string-enum', 'unused-import']) {
        test(`generates the expected module for '${name}'`, async () => {
            const {status, stdout, stderr} = generateFixture(name);
            expect(stderr).toBe('');
            expect(status).toBe(0);
            await expect(stdout).toMatchFileSnapshot(
                path.join(FIXTURES_DIR, `${name}.generated.ts`),
            );
        });
    }
});

describe('schema rejection', () => {
    test('rejects a relative import specifier', () => {
        const {status, stderr} = generateFixture('relative-import');
        expect(stderr).toContain('relative-import.schema.ts:2:1');
        expect(stderr).toContain("Relative import specifier './../types'");
        expect(status).toBe(1);
    });

    test('rejects a mix of numeric and string initialisers', () => {
        const {status, stderr} = generateFixture('mixed-initialisers');
        expect(stderr).toContain('mixed-initialisers.schema.ts:5:5');
        expect(stderr).toContain('Enum members must all have the same initialiser kind');
        expect(status).toBe(1);
    });

    test('rejects a statement that is neither an import nor an enum declaration', () => {
        const {status, stderr} = generateFixture('unsupported-statement');
        expect(stderr).toContain('unsupported-statement.schema.ts:10:1');
        expect(stderr).toContain(
            'A schema may only contain import and enum declarations, got TypeAliasDeclaration',
        );
        expect(status).toBe(1);
    });

    test('rejects a missing schema path', () => {
        const {status, stderr} = generate([]);
        expect(stderr).toContain('Usage:');
        expect(status).toBe(1);
    });
});
