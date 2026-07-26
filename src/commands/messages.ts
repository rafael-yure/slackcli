import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import ora from 'ora';
import { getAuthenticatedClient } from '../lib/auth.ts';
import { success, error, writeJson } from '../lib/formatter.ts';

export async function resolveMessageContent(options: {
  message?: string;
  messageFile?: string;
}): Promise<string> {
  if (options.message !== undefined && options.messageFile) {
    throw new Error('Use either --message or --message-file, not both');
  }
  if (options.messageFile) {
    return readFile(options.messageFile, 'utf-8');
  }
  if (options.message === undefined) {
    throw new Error('One of --message or --message-file is required');
  }
  return options.message;
}

export function createMessagesCommand(): Command {
  const messages = new Command('messages')
    .description('Send and manage messages');

  // Send message
  messages
    .command('send')
    .description('Send a message to a channel or user')
    .requiredOption('--recipient-id <id>', 'Channel ID or User ID')
    .option('--message <text>', 'Message text content')
    .option('--message-file <path>', 'Read message text from a file')
    .option('--thread-ts <timestamp>', 'Send as reply to thread')
    .option('--file <path>', 'Attach a file to the message')
    .option('--workspace <id|name|profile>', 'Workspace or authentication profile to use')
    .option('--json', 'Output the sent message details as JSON', false)
    .action(async (options) => {
      const spinner = ora('Sending message...').start();

      try {
        const message = await resolveMessageContent(options);
        const client = await getAuthenticatedClient(options.workspace);

        // Check if recipient is a user ID (starts with U) and needs DM opened
        let channelId = options.recipientId;
        if (options.recipientId.startsWith('U')) {
          spinner.text = 'Opening direct message...';
          const dmResponse = await client.openConversation(options.recipientId);
          channelId = dmResponse.channel.id;
        }

        spinner.text = 'Sending message...';
        if (options.file) {
          await client.uploadFileExternal(channelId, options.file, {
            initial_comment: message,
            thread_ts: options.threadTs,
          });

          spinner.succeed('Message sent successfully!');
          if (options.json) {
            writeJson({ channel_id: channelId, file: options.file });
          } else {
            success('File uploaded successfully');
          }
          return;
        }

        const response = await client.postMessage(channelId, message, {
          thread_ts: options.threadTs,
        });

        spinner.succeed('Message sent successfully!');
        if (options.json) {
          let permalink: string | undefined;
          try {
            const link = await client.getPermalink(channelId, response.ts);
            permalink = link.permalink;
          } catch {
            // Delivery succeeded; permalink lookup is optional metadata.
          }
          writeJson({
            channel_id: channelId,
            ts: response.ts,
            ...(permalink ? { permalink } : {}),
          });
        } else {
          success(`Message timestamp: ${response.ts}`);
        }
      } catch (err: any) {
        spinner.fail('Failed to send message');
        error(err.message);
        process.exit(1);
      }
    });

  // Add reaction to message
  messages
    .command('react')
    .description('Add a reaction to a message')
    .requiredOption('--channel-id <id>', 'Channel ID where the message is')
    .requiredOption('--timestamp <ts>', 'Message timestamp')
    .requiredOption('--emoji <name>', 'Emoji name (e.g., thumbsup, heart, fire)')
    .option('--workspace <id|name|profile>', 'Workspace or authentication profile to use')
    .action(async (options) => {
      const spinner = ora('Adding reaction...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);

        await client.addReaction(options.channelId, options.timestamp, options.emoji);

        spinner.succeed('Reaction added successfully!');
        success(`Added :${options.emoji}: to message ${options.timestamp}`);
      } catch (err: any) {
        spinner.fail('Failed to add reaction');
        error(err.message);
        process.exit(1);
      }
    });

  // Edit an existing message
  messages
    .command('edit')
    .description('Update the text of an existing message you posted')
    .requiredOption('--channel-id <id>', 'Channel ID where the message is')
    .requiredOption('--timestamp <ts>', 'Message timestamp')
    .requiredOption('--message <text>', 'New message text content')
    .option('--workspace <id|name|profile>', 'Workspace or authentication profile to use')
    .action(async (options) => {
      const spinner = ora('Updating message...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);

        const response = await client.updateMessage(
          options.channelId,
          options.timestamp,
          options.message,
        );

        spinner.succeed('Message updated successfully!');
        success(`Message timestamp: ${response.ts}`);
      } catch (err: any) {
        spinner.fail('Failed to update message');
        error(err.message);
        process.exit(1);
      }
    });

  // Create draft message
  messages
    .command('draft')
    .description('Create a draft message in a channel or user. Note: Only works with Browser Session Tokens. Slack apps cannot create drafts.')
    .requiredOption('--recipient-id <id>', 'Channel ID or User ID')
    .requiredOption('--message <text>', 'Message text content')
    .option('--thread-ts <timestamp>', 'Create draft as reply to thread')
    .option('--workspace <id|name|profile>', 'Workspace or authentication profile to use')
    .action(async (options) => {
      const spinner = ora('Creating draft...').start();

      try {
        const client = await getAuthenticatedClient(options.workspace);

        let channelId = options.recipientId;
        if (options.recipientId.startsWith('U')) {
          spinner.text = 'Opening direct message...';
          const dmResponse = await client.openConversation(options.recipientId);
          channelId = dmResponse.channel.id;
        }

        spinner.text = 'Creating draft...';
        const response = await client.createDraft(channelId, options.message, {
          thread_ts: options.threadTs,
        });

        spinner.succeed('Draft created successfully!');
        success(`Draft ID: ${response.draft.id}`);
      } catch (err: any) {
        spinner.fail('Failed to create draft');
        error(err.message);
        process.exit(1);
      }
    });

  return messages;
}
