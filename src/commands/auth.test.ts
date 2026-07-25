import { describe, expect, it } from 'bun:test';
import { createAuthCommand } from './auth.ts';

describe('auth command', () => {
  it.each(['login', 'login-browser', 'parse-curl'])(
    'exposes a profile option on %s',
    (commandName) => {
      const auth = createAuthCommand();
      const command = auth.commands.find(candidate => candidate.name() === commandName);

      expect(command?.options.some(option => option.long === '--profile')).toBe(true);
    }
  );
});
