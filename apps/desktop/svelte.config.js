import preprocess from './config/svelte.config.js';

/** @type {import('@sveltejs/vite-plugin-svelte').SvelteConfig} */
export default {
    // See: https://svelte.dev/docs#svelte_compile.
    compilerOptions: {
        runes: true,
    },
    preprocess: preprocess(),
    // Note: This handler is used both by `vite-plugin-svelte` and by the `svelte/valid-compile`
    // ESLint rule, so warnings suppressed here are suppressed in both. Note that `svelte-check`
    // does not read it, and warnings must be suppressed with `--compiler-warnings` there instead.
    onwarn(warning, defaultHandler) {
        // TODO(DESK-1714): Investigate this warning.
        if (warning.code === 'vite-plugin-svelte-preprocess-many-dependencies') {
            return;
        }
        // TODO(DESK-2124): Fix the affected components, then remove this.
        if (warning.code === 'state_referenced_locally') {
            return;
        }
        defaultHandler(warning);
    },
};
