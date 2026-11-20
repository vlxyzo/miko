/**
 * @project   miko v0.0.1-alpha
 * @author    Velix <https://github.com/vlxyzo>
 * @license   GPL-3.0-or-later
 * @source    https://github.com/vlxyzo/miko
 */

import { randomBytes } from 'node:crypto';
import { ffmpeg } from '#lib/ffmpeg.js';
import { log } from '#lib/logger.js';
import {
	Fmt,
	formatTemplate,
	InlineButton,
	InlineKeyboard,
	LinkPreview,
	ReplyParams,
} from '#lib/message.js';
import { TimeUtil } from '#lib/times.js';
import { awayCooldown, cmdCooldown, createCooldown, findDidYouMean } from '#lib/utils.js';
import { GlobCache } from './cache.js';
import { getOwnerAway, isOwnerId, useUserLimit } from './database.js';
import { store } from './loader.js';
import { bot, message, owner, setting } from '../config.js';

const processedUpdates = GlobCache.createCache('processed_updates', {
	maxSize: 50_000,
	ttl: 60_000,
});

const didYouMeanCache = GlobCache.createCache('did_you_mean', {
	maxSize: 10_000,
	ttl: 2 * 60_000,
});

const groupAdminCache = GlobCache.createCache('group_admins', {
	maxSize: 5_000,
	ttl: 60_000,
});

const noticeCooldown = createCooldown('notice_throttle', { maxSize: 30_000 });

function escapeRegex(str) {
	return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPrefixRegex(prefixes) {
	const list = Array.isArray(prefixes) ? prefixes : [prefixes];
	const escaped = list.filter(Boolean).map(escapeRegex);
	if (escaped.length === 0) return null;
	return new RegExp(`^(${escaped.join('|')})([^\\s]+)(?:\\s+([\\s\\S]*))?$`);
}

function getOwnerContactUrl() {
	const username = String(owner.username ?? '')
		.trim()
		.replace(/^@/, '');
	if (username) return `https://t.me/${username}`;

	const firstId = String(owner.id ?? '')
		.split(',')[0]
		?.trim();
	return firstId ? `tg://user?id=${firstId}` : null;
}

function buildBannedPayload(banInfo, replyToMsgId = null) {
	const reason = banInfo?.reason || 'No reason provided';
	const since = banInfo?.banned_at
		? `${TimeUtil.formatDate(banInfo.banned_at)} (${TimeUtil.formatTime('HH:mm', banInfo.banned_at)} WIB)`
		: 'Unknown';

	const text = formatTemplate(message.banned, { reason, since });
	const ownerUrl = getOwnerContactUrl();

	const extra = {
		parse_mode: 'HTML',
		link_preview_options: LinkPreview.disable(),
		...(replyToMsgId ? { reply_parameters: ReplyParams.to(replyToMsgId) } : {}),
	};

	if (ownerUrl) {
		extra.reply_markup = InlineKeyboard.rows([
			InlineButton.url(`💬 Chat with ${owner.name || 'Owner'}`, ownerUrl, {
				style: 'primary',
			}),
		]);
	}

	return { text, extra };
}

function buildOwnerAwayText() {
	const awayState = getOwnerAway();
	return formatTemplate(message.ownerAway, {
		reason: awayState.reason || 'Busy right now',
		since: awayState.since
			? `${TimeUtil.formatDate(awayState.since)} (${TimeUtil.formatTime('HH:mm', awayState.since)} WIB)`
			: 'Recently',
	});
}

function isOwnerMentionedOrReplied(msg) {
	if (!msg) return false;

	if (msg.reply_to_message?.from?.id && isOwnerId(msg.reply_to_message.from.id)) {
		return true;
	}

	const rawText = msg.text ?? msg.caption ?? '';
	const entities = [...(msg.entities ?? []), ...(msg.caption_entities ?? [])];
	const ownerUsername = String(owner.username ?? '')
		.trim()
		.replace(/^@/, '')
		.toLowerCase();

	for (const entity of entities) {
		if (entity.type === 'text_mention' && entity.user?.id && isOwnerId(entity.user.id)) {
			return true;
		}

		if (entity.type === 'mention' && ownerUsername) {
			const mentioned = rawText
				.slice(entity.offset, entity.offset + entity.length)
				.toLowerCase();

			if (mentioned === `@${ownerUsername}`) {
				return true;
			}
		}
	}

	if (ownerUsername) {
		const mentionRx = new RegExp(`(^|\\s)@${escapeRegex(ownerUsername)}(?=$|[^a-z0-9_])`, 'i');
		if (mentionRx.test(rawText)) return true;
	}

	return false;
}

async function getAdminSet(ctx) {
	const chatId = ctx.chat?.id;
	if (!chatId) return new Set();

	const key = String(chatId);
	const cached = groupAdminCache.get(key);
	if (cached) return cached;

	try {
		const admins = await ctx.getChatAdministrators();
		const adminIds = new Set(admins.map(member => member.user.id));
		groupAdminCache.set(key, adminIds);

		return adminIds;
	} catch {
		return new Set();
	}
}

async function sendThrottledNotice(ctx, throttleKey, duration, htmlText, extra = {}) {
	const status = noticeCooldown.consume(throttleKey, duration);
	if (!status.ok) return;

	const msgId = ctx.message?.message_id;
	await ctx
		.reply(htmlText, {
			parse_mode: 'HTML',
			link_preview_options: LinkPreview.disable(),
			...(msgId ? { reply_parameters: ReplyParams.to(msgId) } : {}),
			...extra,
		})
		.catch(() => {});
}

async function notifyOwnerError(ctx, plugin, err) {
	const ownerIds = String(owner.id ?? '')
		.split(',')
		.map(v => v.trim())
		.filter(Boolean);

	if (ownerIds.length === 0) return;

	const errorReport = [
		`🚨 <b>Plugin Error Report</b>`,
		`• <b>Plugin:</b> <code>${Fmt.escape(plugin.id)}</code>`,
		`• <b>User:</b> ${Fmt.mention(ctx.from.first_name || 'User', ctx.from.id)} (<code>${ctx.from.id}</code>)`,
		`• <b>Chat:</b> <code>${ctx.chat?.id}</code>`,
		`• <b>Error:</b> <code>${Fmt.escape(err?.message || String(err))}</code>`,
	].join('\n');

	await ctx.telegram
		.sendMessage(ownerIds[0], errorReport, {
			parse_mode: 'HTML',
			link_preview_options: LinkPreview.disable(),
		})
		.catch(() => {});
}

async function executePlugin(ctx, plugin, invocation) {
	const { usedPrefix, command, argsText, isOwner, isGroup, isPrivate, replyToMsgId } = invocation;

	const userId = ctx.from.id;
	const user = ctx.state.user;

	if ((plugin.ownerOnly || plugin.owner) && !isOwner) {
		return sendThrottledNotice(ctx, `owner:${userId}`, '5s', message.owner);
	}

	if ((plugin.groupOnly || plugin.group) && !isGroup) {
		return sendThrottledNotice(ctx, `group:${userId}`, '5s', message.group);
	}

	if ((plugin.privateOnly || plugin.private) && !isPrivate) {
		return sendThrottledNotice(ctx, `private:${userId}`, '5s', message.private);
	}

	let isAdmin = isOwner;

	if (isGroup && (plugin.adminOnly || plugin.admin || plugin.botAdmin)) {
		const adminSet = await getAdminSet(ctx);
		if (!isAdmin) isAdmin = adminSet.has(userId);

		if ((plugin.adminOnly || plugin.admin) && !isAdmin) {
			return sendThrottledNotice(ctx, `admin:${userId}`, '5s', message.adminOnly);
		}

		if (plugin.botAdmin && !adminSet.has(ctx.botInfo.id)) {
			return sendThrottledNotice(ctx, `botadmin:${ctx.chat.id}`, '5s', message.botAdmin);
		}
	}

	if ((plugin.register || plugin.registered) && !isOwner && !user?.is_registered) {
		return sendThrottledNotice(ctx, `reg:${userId}`, '5s', message.notRegistered);
	}

	if (plugin.args && !argsText.trim()) {
		const formatUsage = `${usedPrefix}${command}${plugin.example ? ` ${plugin.example}` : ''}`;
		const missingText = formatTemplate(message.missingArgs, { format: formatUsage });
		return ctx.reply(missingText, {
			parse_mode: 'HTML',
			link_preview_options: LinkPreview.disable(),
			...(replyToMsgId ? { reply_parameters: ReplyParams.to(replyToMsgId) } : {}),
		});
	}

	const cooldownSpec = plugin.cooldown === undefined ? setting.cooldown : plugin.cooldown;

	if (!isOwner && cooldownSpec) {
		const cdKey = `${userId}:${plugin.id}`;
		const cdStatus = cmdCooldown.consume(cdKey, cooldownSpec);

		if (!cdStatus.ok) {
			const cdText = formatTemplate(message.cooldown, { time: cdStatus.remainingText });
			return sendThrottledNotice(ctx, `cd:${cdKey}`, '3s', cdText);
		}
	}

	const limitCost =
		typeof plugin.limit === 'number'
			? Math.max(0, plugin.limit)
			: plugin.limit === true
				? 1
				: 0;

	if (!isOwner && limitCost > 0) {
		if (!user?.is_registered) {
			return sendThrottledNotice(ctx, `reg:${userId}`, '5s', message.notRegistered);
		}

		if (!useUserLimit(userId, limitCost)) {
			return sendThrottledNotice(ctx, `limit:${userId}`, '10s', message.limit);
		}
	}

	const trimmedText = argsText.trim();
	const args = trimmedText ? trimmedText.split(/\s+/) : [];

	const helper = {
		text: trimmedText,
		rawText: argsText,
		args,
		command,
		prefix: usedPrefix,
		category: plugin.category,
		isOwner,
		isGroup,
		isPrivate,
		isAdmin,
		user: ctx.state.user,
		group: ctx.state.group,
		quoted: ctx.message?.reply_to_message ?? null,
		plugins: store.plugins,
		categories: store.categories,
		commands: store.commands,
		ffmpeg,
		reply: (htmlText, extra = {}) =>
			ctx.reply(htmlText, {
				parse_mode: 'HTML',
				link_preview_options: LinkPreview.disable(),
				...(replyToMsgId ? { reply_parameters: ReplyParams.to(replyToMsgId) } : {}),
				...extra,
			}),
		react: emoji =>
			typeof ctx.react === 'function' ? ctx.react(emoji).catch(() => {}) : Promise.resolve(),
	};

	log.user(`${ctx.from.first_name || userId} (${userId})`, `${usedPrefix}${command}`);

	try {
		await plugin.exec(ctx, helper);
	} catch (err) {
		if (!isOwner && limitCost > 0 && ctx.state.user) {
			ctx.state.user.user_limit += limitCost;
		}

		log.error(`Error executing plugin [${plugin.id}]:`, err);
		await ctx
			.reply(message.error, {
				parse_mode: 'HTML',
				link_preview_options: LinkPreview.disable(),
				...(replyToMsgId ? { reply_parameters: ReplyParams.to(replyToMsgId) } : {}),
			})
			.catch(() => {});

		void notifyOwnerError(ctx, plugin, err);
	}
}

export function registerBusinessAway(telegrafBot) {
	telegrafBot.use(async (ctx, next) => {
		const bMsg = ctx.update?.business_message;
		if (!bMsg) return next();

		if (ctx.update?.update_id != null) {
			const updKey = String(ctx.update.update_id);
			if (processedUpdates.has(updKey)) return;
			processedUpdates.set(updKey, true);
		}

		if (!bMsg.from || bMsg.from.is_bot || isOwnerId(bMsg.from.id)) return;
		if (!owner.away || !bMsg.business_connection_id) return;

		const awayCheck = awayCooldown.consume(`biz:${bMsg.from.id}`, '5m');
		if (!awayCheck.ok) return;

		await ctx.telegram
			.sendMessage(bMsg.chat.id, buildOwnerAwayText(), {
				business_connection_id: bMsg.business_connection_id,
				parse_mode: 'HTML',
				link_preview_options: LinkPreview.disable(),
				reply_parameters: ReplyParams.to(bMsg.message_id),
			})
			.catch(() => {});
	});
}

export function registerHandler(telegrafBot) {
	const prefixRegex = buildPrefixRegex(bot.prefix);

	telegrafBot.use(async (ctx, next) => {
		if (ctx.update?.update_id != null) {
			const updKey = String(ctx.update.update_id);
			if (processedUpdates.has(updKey)) return;
			processedUpdates.set(updKey, true);
		}
		return next();
	});

	telegrafBot.on('chat_member', (ctx, next) => {
		if (ctx.chat?.id) {
			groupAdminCache.delete(String(ctx.chat.id));
		}
		return next();
	});

	telegrafBot.action(/^dym:([a-f0-9]{12})$/, async ctx => {
		const token = ctx.match[1];
		const entry = didYouMeanCache.get(token);

		if (!entry) {
			await ctx
				.answerCbQuery('⏰ This suggestion has expired', { show_alert: true })
				.catch(() => {});
			await ctx.deleteMessage().catch(() => {});
			return;
		}

		if (ctx.from?.id !== entry.userId) {
			await ctx
				.answerCbQuery('⚠️ Only the sender can confirm this command', {
					show_alert: true,
				})
				.catch(() => {});
			return;
		}

		didYouMeanCache.delete(token);
		await ctx.answerCbQuery().catch(() => {});

		await Promise.allSettled([
			ctx.telegram.deleteMessage(entry.chatId, entry.userMsgId),
			ctx.telegram.deleteMessage(entry.chatId, entry.botMsgId),
		]);

		const plugin = store.commands.get(entry.command);
		if (!plugin) return;

		const isOwner = Boolean(ctx.state.isOwner);
		const isBanned = !isOwner && Boolean(ctx.state.banInfo || ctx.state.user?.is_banned);

		if (isBanned) {
			const { text, extra } = buildBannedPayload(ctx.state.banInfo, null);
			await ctx.reply(text, extra).catch(() => {});
			return;
		}

		if (bot.maintenance && !isOwner) {
			await sendThrottledNotice(ctx, `maint:${ctx.from.id}`, '10s', message.maintenance);
			return;
		}

		const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
		const isPrivate = ctx.chat?.type === 'private';

		await executePlugin(ctx, plugin, {
			usedPrefix: entry.prefix,
			command: entry.command,
			argsText: entry.argsText,
			isOwner,
			isGroup,
			isPrivate,
			replyToMsgId: null,
		});
	});

	telegrafBot.on('message', async (ctx, next) => {
		if (!ctx.from || ctx.from.is_bot || !ctx.chat) return next();

		const isOwner = Boolean(ctx.state.isOwner);
		const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
		const isPrivate = ctx.chat.type === 'private';
		const userId = ctx.from.id;
		const group = ctx.state.group;
		const rawBody = ctx.message.text ?? ctx.message.caption ?? '';
		const trimmedBody = rawBody.trim();

		for (const hookPlugin of store.hookPlugins) {
			try {
				const hookFn = hookPlugin.before ?? hookPlugin.all;
				const shouldContinue = await hookFn(ctx, {
					text: trimmedBody,
					isOwner,
					isGroup,
					isPrivate,
					user: ctx.state.user,
					group,
					ffmpeg,
				});
				if (shouldContinue === false) return;
			} catch (err) {
				log.error(`Hook error in [${hookPlugin.id}]:`, err);
			}
		}

		if (isGroup && !isOwner && owner.away && isOwnerMentionedOrReplied(ctx.message)) {
			const awayCheck = awayCooldown.consume(`grp:${ctx.chat.id}:${userId}`, '5m');
			if (awayCheck.ok) {
				await ctx
					.reply(buildOwnerAwayText(), {
						parse_mode: 'HTML',
						link_preview_options: LinkPreview.disable(),
						reply_parameters: ReplyParams.to(ctx.message.message_id),
					})
					.catch(() => {});
			}
		}

		if (!trimmedBody) return next();

		const match = prefixRegex ? trimmedBody.match(prefixRegex) : null;
		let usedPrefix = '';
		let command = '';
		let argsText = '';

		if (match) {
			usedPrefix = match[1];
			let rawCmd = match[2];
			argsText = match[3] ?? '';

			const botUsername = ctx.botInfo?.username?.toLowerCase();
			const atIndex = rawCmd.indexOf('@');
			if (atIndex !== -1) {
				const targetBot = rawCmd.slice(atIndex + 1).toLowerCase();
				if (botUsername && targetBot !== botUsername) {
					return next();
				}
				rawCmd = rawCmd.slice(0, atIndex);
			}

			command = rawCmd.toLowerCase().trim();
		}

		const matchedPlugin = command ? store.commands.get(command) : null;
		const matchedRegexPlugin =
			!matchedPlugin && store.regexPlugins.length > 0
				? store.regexPlugins.find(p => p.regex.some(rx => rx.test(trimmedBody)))
				: null;

		const isCommandAttempt = Boolean(match && command.length > 0);
		if (!matchedPlugin && !matchedRegexPlugin && !isCommandAttempt) {
			return next();
		}

		const isBanned = !isOwner && Boolean(ctx.state.banInfo || ctx.state.user?.is_banned);
		if (isBanned) {
			const throttle = noticeCooldown.consume(`banned:${userId}`, '10s');
			if (throttle.ok) {
				const { text, extra } = buildBannedPayload(
					ctx.state.banInfo,
					ctx.message.message_id
				);
				await ctx.reply(text, extra).catch(() => {});
			}
			return;
		}

		if (bot.maintenance && !isOwner) {
			return sendThrottledNotice(ctx, `maint:${userId}`, '15s', message.maintenance);
		}

		if (bot.mode === 'self' && !isOwner) {
			return sendThrottledNotice(ctx, `self:${userId}`, '15s', message.selfMode);
		}

		if (isGroup && !isOwner) {
			if (group?.is_banned) {
				return sendThrottledNotice(
					ctx,
					`grp_ban:${ctx.chat.id}`,
					'30s',
					message.groupBanned
				);
			}

			if (group?.is_muted) {
				return sendThrottledNotice(
					ctx,
					`grp_mute:${ctx.chat.id}`,
					'15s',
					message.groupMuted
				);
			}
		}

		const activePlugin = matchedPlugin ?? matchedRegexPlugin;
		if (activePlugin) {
			return executePlugin(ctx, activePlugin, {
				usedPrefix,
				command: command || activePlugin.name,
				argsText: matchedPlugin ? argsText : trimmedBody,
				isOwner,
				isGroup,
				isPrivate,
				replyToMsgId: ctx.message.message_id,
			});
		}

		if (isCommandAttempt) {
			const suggestion = findDidYouMean(command, store.plugins, 60, { isOwner });
			if (suggestion && store.commands.has(suggestion.command)) {
				const token = randomBytes(6).toString('hex');
				const dymText = formatTemplate(message.didyoumean, {
					command: `${usedPrefix}${suggestion.command}`,
					similarity: suggestion.similarity,
				});

				const sentMsg = await ctx
					.reply(dymText, {
						parse_mode: 'HTML',
						link_preview_options: LinkPreview.disable(),
						reply_parameters: ReplyParams.to(ctx.message.message_id),
						reply_markup: InlineKeyboard.rows([
							InlineButton.callback('✅ Yes', `dym:${token}`, { style: 'success' }),
						]),
					})
					.catch(() => null);

				if (sentMsg) {
					didYouMeanCache.set(token, {
						userId,
						chatId: ctx.chat.id,
						userMsgId: ctx.message.message_id,
						botMsgId: sentMsg.message_id,
						prefix: usedPrefix,
						command: suggestion.command,
						argsText,
					});
				}
			}
		}
	});
}
