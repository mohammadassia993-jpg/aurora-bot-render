#!/usr/bin/env node
/**
 * One-click: Send all queued emails
 * Run: node scripts/send-queued-emails.js
 * Requires: working SMTP credentials in .env
 */
import { runMailQueue } from '../src/mail.js';

console.log('🚀 Sending queued emails...');
const result = await runMailQueue(25);
console.log('Result:', JSON.stringify(result, null, 2));
