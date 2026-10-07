import { Message } from 'discord.js';
import { CasinoBot } from '../index';
import { trackDropActivity } from '../utils/drops';

/**
 * Only counts activity for drops. Message content is never read - the bot does
 * not request the privileged Message Content intent.
 */
export default {
  name: 'messageCreate',
  async execute(message: Message) {
    try {
      await trackDropActivity(message.client as CasinoBot, message);
    } catch (error) {
      console.error('[ROYALCASINO] Błąd śledzenia aktywności (dropy):', error);
    }
  },
};
