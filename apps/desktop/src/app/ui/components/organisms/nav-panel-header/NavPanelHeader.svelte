<!--
  @component Header shown at the top of a nav panel. Renders the (optional) logo in a fixed-height
  area, with the panel title below it.

  The logo area always reserves its height, so the title stays in the same spot regardless of
  whether a logo is present.
-->
<script lang="ts">
  import {unreachable} from '@threema/ts-utils/meta/unreachable';
  import {untrack} from 'svelte';
  import {MediaQuery} from 'svelte/reactivity';
  import {cx} from 'tailwind-variants';

  import type {NavPanelHeaderProps} from '~/app/ui/components/organisms/nav-panel-header/props';

  const {services, title}: NavPanelHeaderProps = $props();

  const {
    settings: {
      views: {work},
    },
    storage: {theme},
  } = untrack(() => services);

  const prefersDark = new MediaQuery('(prefers-color-scheme: dark)');
  const logoBytes = $derived.by<Uint8Array | undefined>(() => {
    switch ($theme) {
      case 'light':
        return $work.logo.light?.blob;

      case 'dark':
        return $work.logo.dark?.blob;

      case 'system':
        if (prefersDark.current) {
          return $work.logo.dark?.blob;
        }
        return $work.logo.light?.blob;

      default:
        return unreachable($theme);
    }
  });

  // Using `$effect` to assign a value is an antipattern, but is used here to be able to cleanly
  // create and revoke object URLs.
  let logoUrl = $state<string | undefined>(undefined);
  $effect(() => {
    if (logoBytes === undefined) {
      return undefined;
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(logoBytes)]));
    logoUrl = url;
    // Clean up url before the next one is created.
    return () => {
      URL.revokeObjectURL(url);
    };
  });
</script>

<header
  class={cx(
    'flex w-full flex-col pb-5 select-none',
    logoUrl === undefined ? 'pt-4' : 'gap-1',
    logoUrl === undefined && import.meta.env.BUILD_PLATFORM === 'macos'
      ? '[-webkit-app-region:drag]'
      : undefined,
  )}
>
  {#if logoUrl !== undefined}
    <div
      class={cx(
        'flex h-16 items-center justify-center px-4',
        import.meta.env.BUILD_PLATFORM === 'macos' ? '[-webkit-app-region:drag]' : undefined,
      )}
    >
      <img
        class="h-full max-h-10 w-full max-w-52 object-contain"
        alt="logo"
        draggable="false"
        src={logoUrl}
      />
    </div>
  {/if}

  <h1
    class="m-0 w-full overflow-hidden px-4 text-2xl leading-7 font-bold text-ellipsis text-black dark:text-white"
  >
    {title}
  </h1>
</header>
