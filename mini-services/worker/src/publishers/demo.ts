/**
 * Demo publisher — sandbox simulation.
 *
 * NEVER touches a real platform API. The attempt response is explicitly labeled
 * `mode: 'demo'` so no demo publish can ever be mistaken for a real one.
 */
import { sleep, type Publisher, type PublishResult } from './types';

const DEMO_MIN_DELAY_MS = 1200;
const DEMO_DELAY_JITTER_MS = 800;

export const demoPublisher: Publisher = async (ctx): Promise<PublishResult> => {
  await sleep(DEMO_MIN_DELAY_MS + Math.random() * DEMO_DELAY_JITTER_MS);
  return {
    ok: true,
    externalPostId: `demo_${crypto.randomUUID().slice(0, 8)}`,
    response: {
      mode: 'demo',
      note: 'Sandbox simulated publish — no platform call made',
      platform: ctx.account.platform,
      target: ctx.account.username,
      mediaCount: ctx.media.length,
    },
  };
};
