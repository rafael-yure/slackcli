import { describe, expect, it } from 'bun:test';
import { isNewerVersion, isInstalledViaHomebrew, getUpdateCommand, getCurrentVersion, performUpdate, managedUpdateNotice, MANAGED_UPDATE_EXIT, notifyIfUpdateAvailable } from './updater.ts';
import packageJson from '../../package.json';

describe('isNewerVersion', () => {
  it('returns true when latest is newer', () => {
    expect(isNewerVersion('v0.5.0', '0.4.0')).toBe(true);
  });

  it('returns false when already on latest', () => {
    expect(isNewerVersion('v0.4.0', '0.4.0')).toBe(false);
  });

  it('returns false when current is newer', () => {
    expect(isNewerVersion('v0.3.0', '0.4.0')).toBe(false);
  });

  it('handles patch version bumps', () => {
    expect(isNewerVersion('v0.4.1', '0.4.0')).toBe(true);
    expect(isNewerVersion('v0.4.0', '0.4.1')).toBe(false);
  });

  it('handles major version bumps', () => {
    expect(isNewerVersion('v1.0.0', '0.9.9')).toBe(true);
  });
});

describe('isInstalledViaHomebrew', () => {
  const originalExecPath = process.execPath;

  it('detects macOS Homebrew Cellar path', () => {
    Object.defineProperty(process, 'execPath', { value: '/usr/local/Cellar/slackcli/0.4.0/bin/slackcli', configurable: true });
    expect(isInstalledViaHomebrew()).toBe(true);
    Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true });
  });

  it('detects macOS Apple Silicon Homebrew path', () => {
    Object.defineProperty(process, 'execPath', { value: '/opt/homebrew/bin/slackcli', configurable: true });
    expect(isInstalledViaHomebrew()).toBe(true);
    Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true });
  });

  it('detects Linux Homebrew path', () => {
    Object.defineProperty(process, 'execPath', { value: '/home/linuxbrew/.linuxbrew/bin/slackcli', configurable: true });
    expect(isInstalledViaHomebrew()).toBe(true);
    Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true });
  });

  it('returns false for direct binary install', () => {
    Object.defineProperty(process, 'execPath', { value: '/usr/local/bin/slackcli', configurable: true });
    expect(isInstalledViaHomebrew()).toBe(false);
    Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true });
  });

  it('returns false for path in home directory', () => {
    Object.defineProperty(process, 'execPath', { value: '/home/user/bin/slackcli', configurable: true });
    expect(isInstalledViaHomebrew()).toBe(false);
    Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true });
  });
});

describe('getUpdateCommand', () => {
  const originalExecPath = process.execPath;

  it('returns brew command for Homebrew installs', () => {
    Object.defineProperty(process, 'execPath', { value: '/opt/homebrew/bin/slackcli', configurable: true });
    expect(getUpdateCommand()).toBe('brew upgrade slackcli');
    Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true });
  });

  it('returns slackcli update for direct installs', () => {
    Object.defineProperty(process, 'execPath', { value: '/usr/local/bin/slackcli', configurable: true });
    expect(getUpdateCommand()).toBe('slackcli update');
    Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true });
  });
});

describe('getCurrentVersion', () => {
  it('matches package.json when not running a baked-in binary', () => {
    expect(getCurrentVersion()).toBe(packageJson.version);
  });
});

describe('performUpdate', () => {
  const originalExecPath = process.execPath;

  it('bails early when running under bun without downloading', async () => {
    Object.defineProperty(process, 'execPath', { value: '/Users/me/.bun/bin/bun', configurable: true });
    await expect(performUpdate()).resolves.toBeUndefined();
    Object.defineProperty(process, 'execPath', { value: originalExecPath, configurable: true });
  });
});

describe('Fleet-managed self-update suppression (PRD-32576)', () => {
  it('isFleetManaged is false without the bake-time define (fail-safe to upstream behaviour)', async () => {
    const { isFleetManaged } = await import('../version.ts');
    expect(isFleetManaged()).toBe(false);   // test runtime has no __FLEET_MANAGED__ define
  });

  it('the managed notice steers to `fleet update`, not `slackcli update`', () => {
    const msg = managedUpdateNotice();
    expect(msg).toContain('fleet update');
    expect(msg.toLowerCase()).toContain('managed by fleet');
  });

  it('a managed build that refuses to self-update exits non-zero', () => {
    expect(MANAGED_UPDATE_EXIT).toBe(2);   // scripts must not read a no-op update as success
  });

  it('managed=true suppresses the update nag (registers no beforeExit listener)', () => {
    const before = process.listenerCount('beforeExit');
    notifyIfUpdateAvailable(true);
    expect(process.listenerCount('beforeExit')).toBe(before);
  });
});
