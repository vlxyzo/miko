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
	loading: '⏳ <i>Hang tight, magic in progress...</i>',
	done: '✅ <b>Done and dusted!</b>',
	error: "❌ <b>Oops! Something broke. Please try again later.</b>\n<blockquote>No worries though, I've already told my owner about it!</blockquote>",
	maintenance: "🛠️ <b>I'm down for scheduled maintenance at the moment</b>. I'll be back online shortly, please try again later.",
	selfMode: "🔒 <b>Self Mode Active</b>. I'm currently operating exclusively for my owner.",
	private: "💌 Let's move into DMs, <b>I can't do this in public</b>.",
	group: '👥 This one only works inside a <b>group chat</b>.',
	groupBanned: '🚫 This <b>group chat</b> is blacklisted and cannot use miko.',
	groupMuted: '🔇 Bot responses are currently <b>muted</b> in this group by an admin.',
	adminOnly: '🛡️ This command is restricted to <b>group admins</b>.',
	owner: "💢 <b>You're not my owner</b>. Keep your hands off this command!",
	banned: "🚫 You're <b>blacklisted</b> and can't use miko.\n\n📝 <b>Reason:</b> <code>{reason}</code>\n🗓️ <b>Since:</b> <code>{since}</code>",
	limit: "📉 <b>You've reached your daily usage limit</b>. Wait for the daily reset to use this again!",
	notRegistered: '🔑 <b>You need to register first</b>. Type <code>/register</code> to get started.',
	ownerAway: "🌙 My <b>owner</b> is away right now, he's busy with something. Leave a message and he'll reply when he's back. No spam-spam okay?\n\n📝 <b>Reason:</b> <code>{reason}</code>\n🗓️ <b>Since:</b> <code>{since}</code>",
	didyoumean: "❓ Didn't quite catch that. Did you mean this?\n\n💬 <b>Command:</b> <code>{command}</code>\n📊 <b>Similarity:</b> <b>{similarity}</b>",
	missingArgs: "⚠️ Missing arguments! Here's how to use it:\n📝 <b>Example:</b> <code>{format}</code>",
	cooldown: "⏱️ Woah, slow down! You're going too fast. Wait <code>{time}</code> before we do this again.",
	start: "👋 Hello {user}! <b>{greetings}</b>.\n\nIt's me, <b>{bot}</b>! I'm here to be your partner, your helper, and your favorite companion. Whatever you need, I'll handle it for you.\n\n<blockquote>💫 Ready to begin? Type /menu and let's fly together!</blockquote>",
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
