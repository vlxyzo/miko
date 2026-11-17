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

import config from '../config.js';
import { pluginStore } from './loader.js';
import * as db from './mainDb.js';
import { GlobCache } from './cache.js';
import { log } from '#lib/logger.js';
import { TimeUtil } from '#lib/times.js';

const cooldownCache = GlobCache.createCache('cmd_cooldown', {
	maxSize: 50_000,
	ttl: 60_000,
	sweepInterval: 30_000,
});

const PREFIX_REGEX = /^[\/!.]/;

export function checkIsOwner(telegramId) {
	if (!config.ownerId) return false;
	const target = Number(telegramId);
	if (Array.isArray(config.ownerId)) {
		return config.ownerId.map(Number).includes(target);
	}

	return String(config.ownerId)
		.split(',')
		.map(id => Number(id.trim()))
		.includes(target);
}

export function commandHandler() {
	return async (ctx, next) => {
		try {
			if (!ctx.from || ctx.from.is_bot) return;

			const userId = ctx.from.id;
			const isOwner = checkIsOwner(userId);
			const user = ctx.state.user ?? (await db.getUser(userId));

			ctx.state.user = user;
			ctx.state.isOwner = isOwner;

			if (config.botMaintenance && !isOwner) {
				if (ctx.chat?.type === 'private') {
					await ctx.reply('⚠️ Bot sedang dalam pemeliharaan (maintenance).');
				}
				return;
			}
			if (config.botMode === 'self' && !isOwner) {
				return;
			}

			const rawText = (ctx.message?.text || ctx.message?.caption || '').trim();
			const chatType = ctx.chat?.type || 'private';
			const isGroup = chatType === 'group' || chatType === 'supergroup';

			const extra = {
				user,
				isOwner,
				isGroup,
				db,
				config,
				log,
				TimeUtil,
				categories: pluginStore.categories,
				commands: pluginStore.commands,
			};

			for (const listener of pluginStore.listeners) {
				if (listener.register && !user?.is_registered && !isOwner) continue;
				if (listener.groupOnly && !isGroup) continue;
				if (listener.privateOnly && isGroup) continue;

				try {
					await listener.onMessage(ctx, { ...extra, text: rawText });
				} catch (err) {
					log.error(`Listener error [${listener.name}]: ${err.message}`);
				}
			}

			if (!rawText || !PREFIX_REGEX.test(rawText)) {
				return next();
			}

			const prefix = rawText[0];
			const withoutPrefix = rawText.slice(1).trim();
			if (!withoutPrefix) return next();

			const spaceIdx = withoutPrefix.search(/\s+/);
			const rawCmdToken = spaceIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, spaceIdx);
			const textArgs = spaceIdx === -1 ? '' : withoutPrefix.slice(spaceIdx).trim();
			const args = textArgs ? textArgs.split(/\s+/) : [];

			const [cmdNameRaw, targetBot] = rawCmdToken.split('@');
			if (targetBot && ctx.me && targetBot.toLowerCase() !== ctx.me.toLowerCase()) {
				return;
			}

			const cmdName = cmdNameRaw.toLowerCase();
			const plugin = pluginStore.commands.get(cmdName);
			if (!plugin || !plugin.exec) {
				return next();
			}

			if (plugin.ownerOnly && !isOwner) {
				return ctx.reply('⛔ Perintah ini khusus untuk Owner.');
			}

			if (plugin.groupOnly && !isGroup) {
				return ctx.reply('👥 Perintah ini hanya dapat digunakan di dalam grup.');
			}

			if (plugin.privateOnly && isGroup) {
				return ctx.reply('📩 Perintah ini hanya dapat digunakan melalui chat pribadi.');
			}

			if (plugin.register && !user?.is_registered && !isOwner) {
				return ctx.reply(
					'📝 Kamu belum terdaftar atau sesi kamu kedaluwarsa karena tidak aktif > 30 hari.\nKetik /register untuk mendaftar.'
				);
			}

			if (!isOwner && plugin.cooldown > 0) {
				const cdKey = `${userId}:${plugin.name}`;
				const lastUsed = cooldownCache.get(cdKey);
				const cdMs = plugin.cooldown * 1000;

				if (lastUsed && Date.now() - lastUsed < cdMs) {
					const sisa = ((cdMs - (Date.now() - lastUsed)) / 1000).toFixed(1);
					return ctx.reply(`⏳ Tunggu ${sisa} detik sebelum memakai perintah ini lagi.`);
				}
				cooldownCache.set(cdKey, Date.now());
			}

			// 5. Pengecekan Limit User sebelum eksekusi (Owner bebas limit)
			if (plugin.limit > 0 && !isOwner) {
				const currentLimit = user?.user_limit ?? 0;
				if (currentLimit < plugin.limit) {
					return ctx.reply(
						`⚠️ Limit kamu tidak mencukupi (Butuh: ${plugin.limit}, Sisa: ${currentLimit}).`
					);
				}
			}

			// 6. Catat log aktivitas & eksekusi plugin dalam blok aman
			const senderLabel = ctx.from.username
				? `@${ctx.from.username}`
				: `${ctx.from.first_name || 'User'} (${userId})`;
			log.user(senderLabel, `${prefix}${cmdName}`);

			const result = await plugin.exec(ctx, {
				...extra,
				prefix,
				command: cmdName,
				args,
				text: textArgs,
			});

			// 7. Potong limit HANYA jika plugin berhasil jalan tanpa error (dan tidak return false)
			if (plugin.limit > 0 && !isOwner && result !== false) {
				db.useUserLimit(userId, plugin.limit);
			}
		} catch (err) {
			log.error(`Handler error: ${err.stack || err.message}`);
			try {
				await ctx.reply('❌ Terjadi kesalahan internal saat memproses perintah.');
			} catch {
				// Abaikan jika pesan gagal dikirim (misal bot diblokir user)
			}
		}
	};
}
