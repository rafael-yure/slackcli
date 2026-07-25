import { mkdir, readFile, writeFile, exists } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { WorkspacesData, WorkspaceConfig } from '../types/index.ts';

const CONFIG_DIR = join(homedir(), '.config', 'slackcli');
const WORKSPACES_FILE = join(CONFIG_DIR, 'workspaces.json');

export interface WorkspaceEntry {
  key: string;
  config: WorkspaceConfig;
}

export function getWorkspaceKey(config: WorkspaceConfig): string {
  return config.profile_name
    ? `${config.workspace_id}:${config.profile_name}`
    : config.workspace_id;
}

export function getDefaultProfileName(config: WorkspaceConfig): string {
  return config.auth_type === 'browser' ? 'browser' : config.token_type;
}

export function validateProfileName(profileName: string): string {
  const normalized = profileName.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new Error(
      'Profile names must start with a letter or number and contain only letters, numbers, ".", "_", or "-"'
    );
  }
  return normalized;
}

export function normalizeWorkspacesData(data: WorkspacesData): WorkspacesData {
  const workspaces: Record<string, WorkspaceConfig> = {};
  const migratedKeys = new Map<string, string>();

  for (const [oldKey, config] of Object.entries(data.workspaces)) {
    const baseProfileName = config.profile_name || getDefaultProfileName(config);
    let profileName = baseProfileName;
    let normalizedConfig: WorkspaceConfig = { ...config, profile_name: profileName };
    let newKey = getWorkspaceKey(normalizedConfig);
    let suffix = 2;

    while (workspaces[newKey]) {
      profileName = `${baseProfileName}-${suffix}`;
      normalizedConfig = { ...config, profile_name: profileName };
      newKey = getWorkspaceKey(normalizedConfig);
      suffix += 1;
    }

    workspaces[newKey] = normalizedConfig;
    migratedKeys.set(oldKey, newKey);
  }

  return {
    workspaces,
    default_workspace: data.default_workspace
      ? migratedKeys.get(data.default_workspace) || data.default_workspace
      : undefined,
  };
}

export function resolveWorkspaceEntry(
  data: WorkspacesData,
  identifier: string
): WorkspaceEntry | null {
  const normalized = normalizeWorkspacesData(data);
  const entries = Object.entries(normalized.workspaces).map(([key, config]) => ({ key, config }));
  const exactKey = normalized.workspaces[identifier];

  if (exactKey) {
    return { key: identifier, config: exactKey };
  }

  const profileMatches = entries.filter(entry => entry.config.profile_name === identifier);
  if (profileMatches.length === 1) {
    return profileMatches[0];
  }
  if (profileMatches.length > 1) {
    throw ambiguousWorkspaceError(identifier, profileMatches);
  }

  const workspaceMatches = entries.filter(entry =>
    entry.config.workspace_id === identifier || entry.config.workspace_name === identifier
  );
  if (workspaceMatches.length === 1) {
    return workspaceMatches[0];
  }
  if (workspaceMatches.length > 1) {
    throw ambiguousWorkspaceError(identifier, workspaceMatches);
  }

  return null;
}

function ambiguousWorkspaceError(identifier: string, entries: WorkspaceEntry[]): Error {
  const selectors = entries.map(entry => entry.config.profile_name || entry.key).join(', ');
  return new Error(
    `Workspace "${identifier}" is ambiguous. Use a profile name or key: ${selectors}`
  );
}

// Ensure config directory exists
async function ensureConfigDir(): Promise<void> {
  if (!await exists(CONFIG_DIR)) {
    await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

// Load workspaces data
export async function loadWorkspaces(): Promise<WorkspacesData> {
  await ensureConfigDir();

  if (!await exists(WORKSPACES_FILE)) {
    return { workspaces: {} };
  }

  try {
    const data = await readFile(WORKSPACES_FILE, 'utf-8');
    return normalizeWorkspacesData(JSON.parse(data));
  } catch (error) {
    console.error('Error loading workspaces:', error);
    return { workspaces: {} };
  }
}

// Save workspaces data
export async function saveWorkspaces(data: WorkspacesData): Promise<void> {
  await ensureConfigDir();
  await writeFile(WORKSPACES_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// Add or update a workspace
export async function addWorkspace(config: WorkspaceConfig): Promise<void> {
  const data = await loadWorkspaces();
  const normalizedConfig: WorkspaceConfig = config.profile_name
    ? { ...config, profile_name: validateProfileName(config.profile_name) }
    : { ...config, profile_name: getDefaultProfileName(config) };
  const workspaceKey = getWorkspaceKey(normalizedConfig);

  data.workspaces[workspaceKey] = normalizedConfig;

  // Set as default if it's the first workspace
  if (!data.default_workspace) {
    data.default_workspace = workspaceKey;
  }

  await saveWorkspaces(data);
}

// Remove a workspace
export async function removeWorkspace(identifier: string): Promise<void> {
  const data = await loadWorkspaces();
  const entry = resolveWorkspaceEntry(data, identifier);

  if (!entry) {
    throw new Error(`Workspace ${identifier} not found`);
  }

  delete data.workspaces[entry.key];

  // Update default if we removed it
  if (data.default_workspace === entry.key) {
    const remainingIds = Object.keys(data.workspaces);
    data.default_workspace = remainingIds.length > 0 ? remainingIds[0] : undefined;
  }

  await saveWorkspaces(data);
}

// Set default workspace
export async function setDefaultWorkspace(identifier: string): Promise<void> {
  const data = await loadWorkspaces();
  const entry = resolveWorkspaceEntry(data, identifier);

  if (!entry) {
    throw new Error(`Workspace ${identifier} not found`);
  }

  data.default_workspace = entry.key;
  await saveWorkspaces(data);
}

// Get workspace by ID or name
export async function getWorkspace(identifier?: string): Promise<WorkspaceConfig | null> {
  const data = await loadWorkspaces();

  // If no identifier, return default workspace
  if (!identifier) {
    if (!data.default_workspace) {
      return null;
    }
    return data.workspaces[data.default_workspace] || null;
  }

  return resolveWorkspaceEntry(data, identifier)?.config || null;
}

// Get all workspaces
export async function getAllWorkspaces(): Promise<WorkspaceConfig[]> {
  const data = await loadWorkspaces();
  return Object.values(data.workspaces);
}

export async function getAllWorkspaceEntries(): Promise<WorkspaceEntry[]> {
  const data = await loadWorkspaces();
  return Object.entries(data.workspaces).map(([key, config]) => ({ key, config }));
}

// Clear all workspaces
export async function clearAllWorkspaces(): Promise<void> {
  await saveWorkspaces({ workspaces: {} });
}

// Get default workspace ID
export async function getDefaultWorkspaceId(): Promise<string | undefined> {
  const data = await loadWorkspaces();
  return data.default_workspace;
}
