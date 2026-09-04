#!/usr/bin/env node
/**
 * publish-telegram.js
 * Publish multilang posts to Telegram channels/groups
 * Uses Bot API to send messages to specified channels
 */

import { config } from '../../src/config.js';
import { telegramRequest } from '../../src/telegram-api.js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const LOG_FILE = path.join(ROOT, 'logs', 'publish.log');
const POSTS_DIR = path.join(ROOT, 'deliverables', 'publishing');

// Channels to post to (update with actual channel IDs/usernames)
const CHANNELS = [
  process.env.TELEGRAM_CHANNEL_ID || '-1003836853169', // @SilentGiants_Store
];

const DELAY_BETWEEN_POSTS = 60000; // 1 minute between posts to avoid rate limits

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

async function publishPost(channel, text) {
  try {
    const result = await telegramRequest(config.telegramToken, 'sendMessage', {
      chat_id: channel,
      text: text.slice(0, 4000),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true }
    }, 15000);
    
    if (result.ok) {
      log(`✅ Published to ${channel}: message_id=${result.result?.message_id}`);
      return true;
    } else {
      log(`❌ Failed ${channel}: ${result.description || 'unknown error'}`);
      return false;
    }
  } catch (err) {
    log(`❌ Error ${channel}: ${err.message}`);
    return false;
  }
}

async function main() {
  log('=== Starting Telegram Publishing ===');
  
  // Load posts
  const postsFile = path.join(POSTS_DIR, 'multilang-posts.json');
  if (!fs.existsSync(postsFile)) {
    log('❌ No posts file found. Run multilang-content.js first.');
    process.exit(1);
  }
  
  const posts = JSON.parse(fs.readFileSync(postsFile, 'utf8'));
  
  if (CHANNELS.length === 0) {
    log('⚠️ No channels configured. Posts generated but not published.');
    log('Update CHANNELS array in this script with your Telegram channel usernames.');
    
    // Save unpublished posts for manual publishing
    const manualFile = path.join(POSTS_DIR, 'manual-publish-ready.md');
    let md = '# Posts Ready for Manual Publishing\n\n';
    md += `Generated: ${new Date().toISOString()}\n`;
    md += `Languages: ${Object.keys(posts).join(', ')}\n\n`;
    
    for (const [lang, langPosts] of Object.entries(posts)) {
      md += `## ${lang.toUpperCase()}\n\n`;
      for (const post of langPosts.slice(0, 2)) { // 2 posts per language
        md += `### ${post.type}\n\`\`\`\n${post.text}\n\`\`\`\n\n`;
      }
    }
    
    fs.writeFileSync(manualFile, md);
    log(`📄 Manual publish file saved: ${manualFile}`);
    
    console.log(JSON.stringify({ published: 0, channels: 0, note: 'No channels configured' }));
    return;
  }
  
  let totalPublished = 0;
  
  for (const channel of CHANNELS) {
    log(`Publishing to ${channel}...`);
    
    for (const [lang, langPosts] of Object.entries(posts)) {
      // Pick 2 posts per language per channel
      for (const post of langPosts.slice(0, 2)) {
        const success = await publishPost(channel, post.text);
        if (success) totalPublished++;
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_POSTS));
      }
    }
  }
  
  log(`Publishing complete: ${totalPublished} posts published to ${CHANNELS.length} channels`);
  log('=== Telegram Publishing finished ===');
  
  console.log(JSON.stringify({ published: totalPublished, channels: CHANNELS.length }));
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
