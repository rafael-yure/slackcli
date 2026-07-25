import { describe, expect, it } from 'bun:test';
import type { StandardAuthConfig, WorkspacesData } from '../types/index.ts';
import {
  getWorkspaceKey,
  normalizeWorkspacesData,
  resolveWorkspaceEntry,
  validateProfileName,
} from './workspaces.ts';

function standardConfig(
  overrides: Partial<StandardAuthConfig> = {}
): StandardAuthConfig {
  return {
    workspace_id: 'T123',
    workspace_name: 'Example',
    auth_type: 'standard',
    token: 'xoxb-test',
    token_type: 'bot',
    ...overrides,
  };
}

describe('getWorkspaceKey', () => {
  it('preserves the workspace ID key for legacy configurations', () => {
    expect(getWorkspaceKey(standardConfig())).toBe('T123');
  });

  it('adds the profile name for named configurations', () => {
    expect(getWorkspaceKey(standardConfig({ profile_name: 'automation' })))
      .toBe('T123:automation');
  });
});

describe('resolveWorkspaceEntry', () => {
  it('resolves a legacy workspace by ID or name', () => {
    const data: WorkspacesData = {
      workspaces: {
        T123: standardConfig(),
      },
      default_workspace: 'T123',
    };

    expect(resolveWorkspaceEntry(data, 'T123')?.key).toBe('T123:bot');
    expect(resolveWorkspaceEntry(data, 'Example')?.key).toBe('T123:bot');
  });

  it('resolves named profiles by profile name or full key', () => {
    const data: WorkspacesData = {
      workspaces: {
        'T123:automation': standardConfig({ profile_name: 'automation' }),
        'T123:rafael': standardConfig({
          profile_name: 'rafael',
          token: 'xoxp-test',
          token_type: 'user',
        }),
      },
    };

    expect(resolveWorkspaceEntry(data, 'automation')?.key).toBe('T123:automation');
    expect(resolveWorkspaceEntry(data, 'T123:rafael')?.key).toBe('T123:rafael');
  });

  it('rejects an ambiguous workspace ID or name', () => {
    const data: WorkspacesData = {
      workspaces: {
        T123: standardConfig(),
        'T123:rafael': standardConfig({
          profile_name: 'rafael',
          token: 'xoxp-test',
          token_type: 'user',
        }),
      },
    };

    expect(() => resolveWorkspaceEntry(data, 'T123'))
      .toThrow('Workspace "T123" is ambiguous');
    expect(() => resolveWorkspaceEntry(data, 'Example'))
      .toThrow('Workspace "Example" is ambiguous');
  });

  it('rejects a profile name reused across workspaces', () => {
    const data: WorkspacesData = {
      workspaces: {
        'T123:automation': standardConfig({ profile_name: 'automation' }),
        'T456:automation': standardConfig({
          workspace_id: 'T456',
          workspace_name: 'Other',
          profile_name: 'automation',
        }),
      },
    };

    expect(() => resolveWorkspaceEntry(data, 'automation'))
      .toThrow('Workspace "automation" is ambiguous');
    expect(resolveWorkspaceEntry(data, 'T456:automation')?.config.workspace_name)
      .toBe('Other');
  });

  it('returns null for an unknown selector', () => {
    expect(resolveWorkspaceEntry({ workspaces: {} }, 'missing')).toBeNull();
  });
});

describe('validateProfileName', () => {
  it('normalizes a valid profile name', () => {
    expect(validateProfileName('  personal-user  ')).toBe('personal-user');
  });

  it.each(['', 'personal user', ':bot', 'bot/profile'])(
    'rejects an invalid profile name: %s',
    (profileName) => {
      expect(() => validateProfileName(profileName)).toThrow('Profile names must');
    }
  );
});

describe('normalizeWorkspacesData', () => {
  it('migrates a legacy bot workspace and its default selector', () => {
    const normalized = normalizeWorkspacesData({
      workspaces: {
        T123: standardConfig(),
      },
      default_workspace: 'T123',
    });

    expect(normalized).toEqual({
      workspaces: {
        'T123:bot': standardConfig({ profile_name: 'bot' }),
      },
      default_workspace: 'T123:bot',
    });
  });

  it('uses auth-specific profile names for legacy configurations', () => {
    const normalized = normalizeWorkspacesData({
      workspaces: {
        T123: standardConfig({ token: 'xoxp-test', token_type: 'user' }),
        T456: {
          workspace_id: 'T456',
          workspace_name: 'Browser Workspace',
          workspace_url: 'https://browser.slack.com',
          auth_type: 'browser',
          xoxd_token: 'xoxd-test',
          xoxc_token: 'xoxc-test',
        },
      },
    });

    expect(Object.keys(normalized.workspaces)).toEqual(['T123:user', 'T456:browser']);
  });

  it('preserves both records if a generated profile name collides', () => {
    const normalized = normalizeWorkspacesData({
      workspaces: {
        T123: standardConfig(),
        'T123:bot': standardConfig({
          profile_name: 'bot',
          token: 'xoxb-other',
        }),
      },
    });

    expect(Object.keys(normalized.workspaces)).toEqual(['T123:bot', 'T123:bot-2']);
  });
});
