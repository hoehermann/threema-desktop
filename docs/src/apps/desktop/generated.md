# Generated Code

## Protocol Bindings (`packages/protocol`)

The protobuf and structbuf bindings for the Threema protocols are generated into
`packages/protocol/src/`. Updating them can be done in the following way:

    pnpm run update:protocol -- <path-to-structbuf-typescript-bin.js> <path-to-threema-protocols-directory> <commit-hash>

The given commit hash is checked out in the `threema-protocols` repository before generating (and
must exist in that repository).

Alternatively, the protobuf and structbuf bindings can be generated individually:

    pnpm run generate:protocol:protobuf -- <path-to-threema-protocols-directory> <commit-hash>
    pnpm run generate:protocol:structbuf -- <path-to-structbuf-typescript-bin.js> <path-to-threema-protocols-directory> <commit-hash>

## Internal Protobuf Files

The desktop-internal protobuf modules in `apps/desktop/src/common/internal-protobuf/` can be
regenerated in the following way:

    pnpm run generate:desktop:protobuf

This also runs automatically as part of the desktop app's `postinstall` hook on `pnpm install` (and
is skipped with a warning if `protoc` is not available).

Note that `protoc`, the Protobuf compiler, needs to be installed in your system. If you need to
install it, check the [official documentation](https://grpc.io/docs/protoc-installation).
