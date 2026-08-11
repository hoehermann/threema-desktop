import fs from 'node:fs';
import path from 'node:path';

import {svelte} from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite';

/**
 * Matches a single `--header` argument in the `Containerfile`.
 */
const CONTAINERFILE_HEADER_PATTERN = /^\s*"--header", "(?<name>[^":]+): (?<value>[^"]+)"/u;

/**
 * Extract the security headers from the `--header` arguments in the `Containerfile`, which is the
 * single source of truth for them (in production, they are served by `miniserve`).
 *
 * Note: These are only applied to the preview server, which serves the actual build output. The dev
 * server would need `'unsafe-inline'` in `style-src`, because Vite injects CSS by creating
 * `<style>` elements at runtime.
 *
 * @returns The headers, keyed by header name.
 * @throws {Error} If no headers could be extracted from the `Containerfile`.
 */
function getHeadersFromContainerfile(): Record<string, string> {
    const containerfile = fs.readFileSync(path.resolve(import.meta.dirname, 'Containerfile'), {
        encoding: 'utf8',
    });

    const headers: Record<string, string> = {};
    for (const line of containerfile.split('\n')) {
        const {name, value} = CONTAINERFILE_HEADER_PATTERN.exec(line)?.groups ?? {};
        if (name !== undefined && value !== undefined) {
            headers[name] = value;
        }
    }

    if (Object.keys(headers).length === 0) {
        throw new Error("Could not extract any '--header' arguments from the Containerfile");
    }

    return headers;
}

export default defineConfig({
    plugins: [
        // Tailwind must come before the Svelte plugin.
        tailwindcss(),
        svelte(),
    ],
    build: {
        outDir: 'build',
    },
    preview: {
        headers: getHeadersFromContainerfile(),
    },
    server: {
        host: '127.0.0.1',
        port: 5173,
        hmr: {
            port: 5173,
            host: '127.0.0.1',
        },
    },
});
