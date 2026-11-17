/**
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version
 * of the License , or (at your option) any later version.
 *
 * @project   miko v0.0.1-alpha
 * @author    Velix <https://github.com/vlxyzo>
 * @license   gpl-3.0-latest
 * @source    https://github.com/vlxyzo/miko
 */

import pkg from '../package.json' with { type: 'json' };
import { log } from '#lib/logger.js';

const parseOwnerIds = raw =>
	(raw || '')
		.split(',')
		.map(id => Number(id.trim()))
		.filter(id => Number.isInteger(id) && id > 0);
const cleanUrl = url => (url || '').trim().replace(/\/+$/, '');

export const bot = {
	name: pkg.name || 'miko',
	version: pkg.version,
	prefix: ['/', '!', '.'],
	token: process.env.BOT_TOKEN?.trim() || '',
	connection: process.env.BOT_CONN?.trim().toLowerCase() || 'polling', // 'polling' | 'webhook'
	// webhookUrl: process.env.WEBHOOK_URL?.trim() || '',
	// port: Number(process.env.PORT) || 3000,
	mode: 'public', // 'public' | 'self'
	maintenance: false,
};

export const owner = {
	name: 'Velix',
	username: 'vlxyzo',
	id: parseOwnerIds(process.env.OWNER_ID),
	away: false,
};

export const socmed = {
	channel: process.env.CHANNEL_ID?.trim() || '',
	github: 'https://github.com/vlxyzo',
	instagram: 'https://instagram.com/vlxyzo',
	telegram: 'https://t.me/chvlxyzo',
};

export const setting = {
	limit: 15,
	cooldown: 10000, // 10s
	inactiveDays: 30, // 30d
};

export const ai = {
	model: process.env.AI_MODEL?.trim() || '',
	prompt: process.env.AI_PROMPT?.trim() || '',
	apikey: process.env.AI_KEY?.trim() || '',
};

export const api = {
	endpoint1: cleanUrl(process.env.ENDPOINT_1) || '',
	endpoint2: cleanUrl(process.env.ENDPOINT_2) || '',
	endpoint3: cleanUrl(process.env.ENDPOINT_3) || '',
	apikey1: process.env.KEY_1?.trim() || '',
	// apikey2: process.env.KEY_2?.trim() || '',

	/** build endpoint url with automatic query encoding. automatically appends apikey when targeting or when withKey is true */
	url(base, path = '', params = {}, withKey = base === this.apikey1) {
		const normalizedPath = path ? `/${path.replace(/^\/+/, '')}` : '';
		const target = new URL(`${cleanUrl(base)}${normalizedPath}`);

		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null) {
				target.searchParams.set(key, String(value));
			}
		}

		if (withKey && this.apikey && !target.searchParams.has('apikey')) {
			target.searchParams.set('apikey', this.apikey);
		}

		return target.toString();
	},
};

export const message = {
	loading: '⏳ <i>Hang tight, magic in progress...</i>',
	done: '✅ <b>Done and dusted!</b>',
	error: "❌ <b>Oops! Something broke. Please try again later.</b>\n<blockquote>No worries though, I've already told my owner about it!</blockquote>",
	maintenance: "🛠️ <b>I'm down for scheduled maintenance at the moment. I'll be back online shortly, please try again later.</b>",
	private: "💌 Let's move into DMs, <b>I can't do this in public.</b>",
	group: '👥 This one only works inside a <b>group chat.</b>',
	owner: "🔒 You're not my <b>owner</b>. Keep your hands off this command!",
	banned: "🚫 Looks like you're <b>blacklisted</b> and can't use this feature.",
	limit: "🪫 <b>You've reached your daily usage limit.</b> Wait for the daily reset to use this again!",
	didyoumean: "❓ <b>Didn't quite catch that.</b> Did you mean this?\n\n💬 <b>Command:</b> {command}\n📊 <b>Similarity:</b> {similarity}",
	missingArgs: "⚠️ <b>Missing arguments!</b> Here's how to use it:\n{format}",
	cooldown: "⏱️ Woah, slow down! You're going too fast. Wait <b>{time}</b> before we do this again.",
	notRegistered: '🔑 <b>You need to register first. Type /register to get started.</b>',
	start: "✳️ Hey {user}! <b>{greetings}</b>.\n\nIt's me, <b>{bot}</b>! I'm here to be your partner, your helper, and your favorite companion. Whatever you need, I'll handle it for you.\n\n<blockquote>💫 Ready to begin? Type /menu and let's fly together!</blockquote>",
	ownerAway: "🌙 My <b>owner</b> is away right now, he's busy with something. Leave a message and he'll reply when he's back. No spam-spam okay?",
};

export const interval = {
	diskDebounceMs: 500,
	cloudSyncIntervalMs: 10_000, // 10s
	activeUpdateThresholdMs: 5 * 60_000, // 5m
};

export const database = {
	url: process.env.DB_URL?.trim() || '',
	key: process.env.DB_KEY?.trim() || '',
};

Object.assign(globalThis, {
	bot,
	owner,
	socmed,
	setting,
	ai,
	api,
	message,
	interval,
	database,
});

if (!bot.token) {
	log.error('BOT_TOKEN is missing! Please set it inside your .env file');
	process.exit(1);
}

export default {
	bot,
	owner,
	socmed,
	setting,
	ai,
	api,
	message,
	interval,
	database,
};
