<!--
  @component A vertical navigation strip, intended for app navigation.

  The strip is composed of two groups laid out top-to-bottom:

  - `startItems`: The primary feature navigation. Rendered in a scrollable container so that, when
    the window becomes too short, these items scroll *behind* the fixed end group instead of
    overlapping it.
  - `endItems` + `avatar`: A fixed group pinned to the bottom (e.g. Settings, then the user avatar).
-->
<script lang="ts" module>
  import type {ReadonlyUint8Array} from '@threema/ts-utils/array/readonly-uint8-array';
  import {type VariantProps, cn, tv} from 'tailwind-variants';

  import type {WithElementRef} from '../../utils/element';
  import {
    type ProfilePictureColor,
    PROFILE_PICTURE_BACKGROUND_COLOR_CLASS_MAP,
    PROFILE_PICTURE_TEXT_COLOR_CLASS_MAP,
  } from '../../utils/profile-picture-color';

  export const verticalNavigationStripVariants = tv({
    slots: {
      // Fills the area given by the consumer in both dimensions.
      root: 'relative flex h-full w-full flex-col items-center overflow-hidden select-none',
      start:
        'flex min-h-0 w-full flex-1 flex-col items-center gap-5 overflow-y-auto pb-6 ![scrollbar-width:none]',
      // Non-shrinking end group. The `before` pseudo-element fades out the start group content
      // scrolling up behind it.
      end: 'relative flex w-full shrink-0 flex-col items-center gap-5 bg-white pt-2 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-6 before:bg-gradient-to-t before:from-white before:to-transparent dark:bg-grey-800 dark:before:from-grey-800',
      item: 'group flex w-full flex-col items-center gap-1 rounded-md px-2 text-grey-900 outline-none hover:cursor-pointer dark:text-grey-50',
      iconBox:
        'flex items-center justify-center rounded-lg p-2 ring-black transition-colors ring-inset group-focus-visible:ring-1 dark:ring-white',
      icon: 'inline-block text-2xl leading-none font-normal not-italic antialiased',
      label:
        'w-full overflow-hidden text-center text-[10px] leading-3.5 font-semibold tracking-[-0.2px] text-ellipsis whitespace-nowrap',
    },
    variants: {
      active: {
        true: {
          iconBox: 'bg-grey-200 dark:bg-grey-600',
          icon: "[font-variation-settings:'FILL'_1]",
          item: 'dark:text-grey-50',
        },
        false: {
          iconBox:
            'group-hover:bg-grey-100 active:bg-grey-200 dark:group-hover:bg-grey-700 dark:active:bg-grey-600',
        },
      },
      iconStyle: {
        'material-outlined': {icon: 'font-icon-material-outlined'},
        'threema-filled': {icon: 'font-icon-threema-filled'},
        'threema-outlined': {icon: 'font-icon-threema-outlined'},
      },
    },
    defaultVariants: {
      active: false,
      iconStyle: 'material-outlined',
    },
  });

  export type VerticalNavigationIconStyle = VariantProps<
    typeof verticalNavigationStripVariants
  >['iconStyle'];

  interface NavTarget {
    /**
     * Whether this item represents the currently active area.
     */
    readonly active?: boolean;
    /**
     * Callback invoked when the item is triggered, and is not already `active`.
     */
    readonly onclick?: (event: MouseEvent) => void;
    /**
     * Optional stable identifier, rendered as a `data-testid` attribute on the rendered button for
     * use as a test selector.
     */
    readonly testId?: string;
  }

  export interface VerticalNavigationItem extends NavTarget {
    /**
     * Icon glyph to render, e.g. `'chat_bubble'`.
     */
    readonly icon: string;
    /**
     * Icon font to use. Defaults to `'material-outlined'`.
     */
    readonly iconStyle?: VerticalNavigationIconStyle;
    /**
     * Short label rendered below the icon. Also used as the item's accessible name.
     */
    readonly label: string;
  }

  export interface VerticalNavigationAvatar extends NavTarget {
    /**
     * Optional profile color for the initials fallback. Falls back to a neutral grey when omitted.
     */
    readonly color?: ProfilePictureColor;
    /**
     * Raw image bytes for the avatar (e.g. the user's profile picture). Rendered in place of the
     * `initials` when set.
     */
    readonly image?: ReadonlyUint8Array;
    /**
     * Initials shown when no `image` is provided.
     */
    readonly initials: string;
    /**
     * Accessible name for the avatar button (e.g. the user's display name).
     */
    readonly label: string;
  }

  export type VerticalNavigationStripProps = WithElementRef<
    {
      /**
       * Primary feature navigation items, rendered in the scrollable start group.
       */
      readonly startItems: readonly VerticalNavigationItem[];
      /**
       * Items rendered in the fixed end group, above the avatar.
       */
      readonly endItems?: readonly VerticalNavigationItem[];
      /**
       * Avatar button pinned to the bottom of the end group.
       */
      readonly avatar?: VerticalNavigationAvatar;
      /**
       * Accessible name for the surrounding `<nav>` landmark.
       */
      readonly label?: string;
      readonly class?: string;
    },
    HTMLElement
  >;
</script>

<script lang="ts">
  let {
    startItems,
    endItems = [],
    avatar,
    label,
    class: className,
    ref = $bindable(null),
  }: VerticalNavigationStripProps = $props();

  const slots = $derived(verticalNavigationStripVariants());

  function handleClick(target: NavTarget, event: MouseEvent): void {
    if (target.active ?? false) {
      return;
    }
    target.onclick?.(event);
  }

  // Object URL for the avatar's profile picture, derived from its raw image bytes. Using `$effect`
  // to assign a value is an antipattern, but is used here to be able to cleanly create and revoke
  // object URLs.
  let avatarImageUrl = $state<string | undefined>(undefined);
  $effect(() => {
    const bytes = avatar?.image;
    if (bytes === undefined) {
      avatarImageUrl = undefined;
      return undefined;
    }
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)]));
    avatarImageUrl = url;
    // Clean up the URL before the next one is created.
    return () => {
      URL.revokeObjectURL(url);
    };
  });
</script>

{#snippet navItem(item: VerticalNavigationItem)}
  {@const itemSlots = verticalNavigationStripVariants({
    active: item.active ?? false,
    iconStyle: item.iconStyle ?? 'material-outlined',
  })}
  {@const ariaCurrent = (item.active ?? false) ? 'page' : undefined}

  <button
    type="button"
    class={itemSlots.item()}
    aria-current={ariaCurrent}
    data-testid={item.testId}
    onclick={(event) => handleClick(item, event)}
  >
    <span class={itemSlots.iconBox()}>
      <span class={itemSlots.icon()} aria-hidden="true">{item.icon}</span>
    </span>
    <span class={itemSlots.label()}>{item.label}</span>
  </button>
{/snippet}

{#snippet avatarButton(data: VerticalNavigationAvatar)}
  <button
    type="button"
    class={cn(
      'mt-2 flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full outline-none hover:cursor-pointer focus-visible:ring-1 focus-visible:ring-black dark:focus-visible:ring-white',
    )}
    aria-current={(data.active ?? false) ? 'page' : undefined}
    aria-label={data.label}
    data-testid={data.testId}
    onclick={(event) => handleClick(data, event)}
    title={data.label}
  >
    {#if avatarImageUrl !== undefined}
      <img class="size-full object-cover" src={avatarImageUrl} alt="" draggable="false" />
    {:else}
      <span
        class={cn(
          'text-md flex size-full items-center justify-center font-semibold uppercase',
          data.color === undefined
            ? 'bg-grey-200 text-grey-700 dark:bg-grey-700 dark:text-grey-100'
            : [
                PROFILE_PICTURE_BACKGROUND_COLOR_CLASS_MAP[data.color],
                PROFILE_PICTURE_TEXT_COLOR_CLASS_MAP[data.color],
              ],
        )}
      >
        {data.initials}
      </span>
    {/if}
  </button>
{/snippet}

<nav bind:this={ref} class={cn(slots.root(), className)} aria-label={label}>
  <div class={slots.start()}>
    {#each startItems as item (item.label)}
      {@render navItem(item)}
    {/each}
  </div>

  {#if endItems.length > 0 || avatar !== undefined}
    <div class={slots.end()}>
      {#each endItems as item (item.label)}
        {@render navItem(item)}
      {/each}
      {#if avatar !== undefined}
        {@render avatarButton(avatar)}
      {/if}
    </div>
  {/if}
</nav>
