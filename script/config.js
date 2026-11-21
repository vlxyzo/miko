/**
 * @project   miko v0.0.1-alpha
 * @author    Velix <https://github.com/vlxyzo>
 * @license   gpl-3.0-or-later
 * @source    https://github.com/vlxyzo/miko
 */

import pkg from '../package.json' with { type: 'json' };
import { log } from '#lib/logger.js';

// --------- BOT CONFIGURATION ---------
export const bot = {
	name: pkg.name || 'miko', // bot name
	version: pkg.version, // bot version
	prefix: ['/', '!', '.', '#'], // multi prefix
	token: process.env.BOT_TOKEN, // bot token
	connection: process.env.BOT_CONN, // bot connection type
    // ↓ UNCOMMENT IF YOU'RE USING WEBHOOK CONNECTION ↓
	// webhookUrl: process.env.WEBHOOK_URL, // your webhook url
	// port: Number(process.env.PORT), // port
	mode: 'public', // 'public' | 'self'
	maintenance: false, // boolean
};

// --------- OWNER CONFIGURATION ---------
export const owner = {
	name: 'Velix', // owner name
	username: 'vlxyzo', // telegram username
	id: process.env.OWNER_ID, // telegram id
	away: false, // boolean
};

// --------- SOCMED CONFIGURATION ---------
export const socmed = {
	channel: process.env.CHANNEL_ID,
	github: 'https://github.com/vlxyzo',
	instagram: 'https://instagram.com/vlxyzo',
	telegram: 'https://t.me/chvlxyzo',
};

// --------- BOT SETTING ---------
export const setting = {
	limit: 15, // 15x usage
	cooldown: '10s', // cooldown per command
	inactiveDays: 30, // 30d auto delete inactive user
};

// --------- AI CONFIGURATION ---------
export const ai = {
	model: process.env.AI_MODEL,
	prompt: '../source/prompt/miko.md',
	apikey: process.env.AI_KEY,
};

// --------- ENDPOINT CONFIGURATION ---------
export const api = {
	endpoint1: process.env.ENDPOINT_1,
	endpoint2: process.env.ENDPOINT_2,
	endpoint3: process.env.ENDPOINT_3,
	// ... and more
	apikey1: process.env.KEY_1,
	// apikey2: process.env.KEY_2?.trim(),
	// ... and more
};

// --------- DEFAULT MESSAGE ---------
export const message = {
	loading: '⏳ <i>Hold up, cooking something up for ya...</i>',
	done: '✅ <b>All set, we good!</b>',
	error: '❌ <b>Something glitched out. Try again in a bit, okay?</b>',
	maintenance: "️ <b>Be right back, i'm getting a quick tune up. Hit me up again in a bit!</b>",
	selfMode: '🔒 <b>Private mode is on. Only vibing with my owner right now.</b>',
	private: "💌 <b>Slide into my DMs for this one, can't do it out here in public.</b>",
	group: '👥 <b>Group only. Drop this command inside a group chat!</b>',
	groupBanned: '🚫 <b>This group is blacklisted. No miko privileges here.</b>',
	groupMuted: '🔇 <b>Admins put me on mute in this group right now.</b>',
	adminOnly: "🛡️ <b>Admins only broskie. You don't have the perms for this.</b>",
	botAdmin: '🤖 <b>Make me an admin first in this group so I can pull this off.</b>',
	owner: "💢 <b>Nice try, but you're not my owner. Hands off!</b>",
	banned: "🚫 <b>Oof, you're blacklisted from using miko.</b>\n\n📝 <b>Reason:</b> <code>{reason}</code>\n🗓️ <b>Since:</b> <code>{since}</code>",
	limit: "📉 <b>You're out of daily limit, fam. Wait for the reset tomorrow!</b>",
	notRegistered: '🔑 Hold on, who dis? Register first by typing <code>/register</code>.',
	ownerAway: "🌙 <b>My owner is AFK right now. Drop a message and he'll hit you back later.</b>\n\n📝 <b>Reason:</b> <code>{reason}</code>\n🗓️ <b>Since:</b> <code>{since}</code>",
	didyoumean: '❓ <b>Huh? Typo alert. Did you mean this one?</b>\n\n💬 <b>Command:</b> <code>{command}</code>\n📊 <b>Similarity:</b> <b>{similarity}</b>',
	missingArgs: '⚠️ <b>You forgot the args! Do it like this:</b>\n📝 <b>Example:</b> <code>{format}</code>',
	cooldown: "⏱️ Chill, you're moving too fast! Wait <code>{time}</code> before running that again.",
	start: "👋 Yo {user}! <b>{greetings}</b>.\n\nIt's <b>{bot}</b> in the house! Down to help you out with whatever you need.\n\n<blockquote>💡 Type <code>/menu</code> whenever you're ready to roll!</blockquote>",
};

// --------- SYSTEM INTERVAL ---------
export const interval = {
	diskDebounceMs: 500,
	cloudSyncIntervalMs: 10_000,
	activeUpdateThresholdMs: 5 * 60_000,
};

// --------- DATABASE CONFIGURATION ---------
export const database = {
	url: process.env.DB_URL,
	key: process.env.DB_KEY,
};

// --------- END OF CONFIGURATION ---------

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
