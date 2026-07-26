import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createMessagesCommand, resolveMessageContent } from './messages.ts';

describe('messages command', () => {
  it('exposes a file option on messages send', () => {
    const messages = createMessagesCommand();
    const send = messages.commands.find((command) => command.name() === 'send');

    expect(send?.options.some((option) => option.long === '--file')).toBe(true);
  });

  it('exposes script-friendly options on messages send', () => {
    const messages = createMessagesCommand();
    const send = messages.commands.find((command) => command.name() === 'send');

    expect(send?.options.some((option) => option.long === '--message-file')).toBe(true);
    expect(send?.options.some((option) => option.long === '--json')).toBe(true);
  });

  it('exposes an edit subcommand requiring channel, timestamp, and message', () => {
    const messages = createMessagesCommand();
    const edit = messages.commands.find((command) => command.name() === 'edit');

    expect(edit).toBeDefined();
    const required = edit?.options
      .filter((option) => option.mandatory)
      .map((option) => option.long)
      .sort();
    expect(required).toEqual(['--channel-id', '--message', '--timestamp']);
  });
});

describe('resolveMessageContent', () => {
  it('returns inline message text', async () => {
    expect(await resolveMessageContent({ message: 'hello' })).toBe('hello');
  });

  it('reads message text from a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'slackcli-message-'));
    const path = join(dir, 'message.txt');
    await Bun.write(path, 'hello from file');

    try {
      expect(await resolveMessageContent({ messageFile: path })).toBe('hello from file');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('requires exactly one message source', async () => {
    await expect(resolveMessageContent({}))
      .rejects.toThrow('One of --message or --message-file is required');
    await expect(resolveMessageContent({ message: 'hello', messageFile: 'message.txt' }))
      .rejects.toThrow('Use either --message or --message-file');
  });
});
