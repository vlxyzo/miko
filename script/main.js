try {
	process.loadEnvFile();
} catch {}

import { Telegraf } from 'telegraf';
import { log } from '#lib/logger.js';
import { GlobCache } from '#sys/cache.js';
import { authMiddleware, flushDatabase, initDatabase } from '#sys/database.js';
import { registerBusinessAway, registerHandler } from '#sys/handler.js';
import { loadPlugins, store } from '#sys/loader.js';
import { bot } from './config.js';

const telegraf = new Telegraf(bot.token, {
	handlerTimeout: 120_000,
});

const ALLOWED_UPDATES = [
	'message',
	'callback_query',
	'chat_member',
	'my_chat_member',
	'business_connection',
	'business_message',
];

async function syncTelegramCommands() {
	try {
		const publicCommands = [];
		const seen = new Set();

		for (const plugin of store.plugins.values()) {
			if (plugin.ownerOnly || plugin.owner || plugin.hidden) continue;
			const cmd = plugin.command[0];
			if (!cmd || seen.has(cmd) || !/^[a-z0-9_]{1,32}$/.test(cmd)) continue;

			seen.add(cmd);
			publicCommands.push({
				command: cmd,
				description: String(plugin.description || `${cmd} command`).slice(0, 256),
			});

			if (publicCommands.length >= 100) break;
		}

		if (publicCommands.length > 0) {
			await telegraf.telegram.setMyCommands(publicCommands);
		}
	} catch (err) {
		log.warning(`Failed syncing Telegram command menu: ${err.message}`);
	}
}

async function bootstrap() {
	log.loading(`Starting ${bot.name} version ${bot.version}...`);

	await initDatabase();
	await loadPlugins();

	telegraf.catch((err, ctx) => {
		log.error(`Unhandled Telegraf error on update ${ctx?.update?.update_id}:`, err);
	});

	registerBusinessAway(telegraf);
	telegraf.use(authMiddleware({ blockBanned: false }));
	registerHandler(telegraf);
	await syncTelegramCommands();

	const connType = String(bot.connection || 'polling').toLowerCase();

	if (connType === 'webhook') {
		if (!bot.webhookUrl || !bot.port) {
			log.error('WEBHOOK_URL and PORT must be set when BOT_CONN=webhook');
			process.exit(1);
		}

		const webhookUrl = new URL(bot.webhookUrl);

		await telegraf.launch({
			dropPendingUpdates: true,
			allowedUpdates: ALLOWED_UPDATES,
			webhook: {
				domain: webhookUrl.origin,
				hookPath: webhookUrl.pathname || '/webhook',
				port: bot.port,
			},
		});

		log.success(`${bot.name} is online via Webhook on port ${bot.port}`);
	} else {
		await telegraf.launch({
			dropPendingUpdates: true,
			allowedUpdates: ALLOWED_UPDATES,
		});

		log.success(`${bot.name} is online via Polling`);
	}
}

process.on('message', msg => {
	if (msg === 'gc' && typeof global.gc === 'function') {
		global.gc();
		log.debug('Executed manual garbage collection from ProcessManager');
	}
});

let isStopping = false;

async function shutdown(signal) {
	if (isStopping) return;
	isStopping = true;

	log.warning(`Received ${signal}. Flushing database and stopping ${bot.name}...`);
	try {
		telegraf.stop(signal);
		GlobCache.destroyAll();
		await flushDatabase();
		log.success('Clean shutdown complete.');
		process.exit(0);
	} catch (err) {
		log.error('Error during shutdown:', err);
		process.exit(1);
	}
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

bootstrap().catch(err => {
	log.error('Fatal bootstrap error:', err);
	process.exit(1);
});
