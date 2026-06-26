# Generated Code

## Protocol Bindings (`packages/protocol`)

The protobuf and structbuf bindings for the Threema protocols are generated into
`packages/protocol/src/`.

The exact sources to generate from are pinned in the `pins` field of
`packages/protocol/package.json`:

- `threema-protocols`: the commit of the `threema-protocols` repository to generate from, and
- `structbuf-typescript`: the ref of the `structbuf-typescript` tool (used by the CI drift check).

To **bump** the protocol version, edit the `threema-protocols` pin, then regenerate. The pinned
commit is checked out in the `threema-protocols` repository before generating (and must exist in
that repository).

Generating both can be done in the following way:

    pnpm run update:protocol -- <path-to-structbuf-typescript-bin.js> <path-to-threema-protocols-directory>

Alternatively, the protobuf and structbuf bindings can be generated individually:

    pnpm run generate:protocol:protobuf -- <path-to-threema-protocols-directory>
    pnpm run generate:protocol:structbuf -- <path-to-structbuf-typescript-bin.js> <path-to-threema-protocols-directory>

## Internal Protobuf Files

The desktop-internal protobuf modules in `apps/desktop/src/common/internal-protobuf/` can be
regenerated in the following way:

    pnpm run generate:desktop:protobuf

This also runs automatically as part of the desktop app's `postinstall` hook on `pnpm install` (and
is skipped with a warning if `protoc` is missing or has the wrong version).

Note that `protoc`, the Protobuf compiler, must be installed in the pinned version (the `protoc`
entry in the `pins` field of `packages/protocol/package.json`), because `protoc` embeds its version
into the generated files. The devcontainer installs the pinned version automatically. To install it
manually, check the [official documentation](https://protobuf.dev/installation/).
