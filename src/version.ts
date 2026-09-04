import packageJson from '../package.json';

declare const __APP_VERSION__: string | undefined;
declare const __FLEET_MANAGED__: boolean | undefined;

/** App version: bake-time define for compiled binaries, else package.json. */
export function getAppVersion(): string {
  if (typeof __APP_VERSION__ !== 'undefined') {
    return __APP_VERSION__;
  }
  return packageJson.version;
}

/**
 * Whether this is a Fleet-managed build (bake-time `__FLEET_MANAGED__` define). Such a build is
 * updated only via `fleet update`, so it must not advertise or perform upstream self-update — that
 * would replace the binary with upstream and silently drop Fleet's vendored fork fixes. Fail-safe:
 * a build WITHOUT the define (upstream, or a plain `bun run`) returns false and keeps normal
 * self-update behaviour.
 */
export function isFleetManaged(): boolean {
  return typeof __FLEET_MANAGED__ !== 'undefined' && __FLEET_MANAGED__ === true;
}

/** True when running via the Bun interpreter (source / `bun run`), not a compiled binary. */
export function isRunningUnderBun(): boolean {
  const base = process.execPath.split(/[/\\]/).pop() ?? '';
  return base === 'bun' || base === 'bun.exe';
}
