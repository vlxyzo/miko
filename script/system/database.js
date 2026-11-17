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

import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { GlobCache } from './cache.js';
import { log } from '#lib/logger.js';
import { bot, owner, setting, message, interval, database } from '../config.js';

export const supabase =
	database.url && database.key ? createClient(database.url, database.key) : null;

if (!supabase) {
	log.warning('DB_URL or DB_KEY is not set. Running in Local JSON mode only');
}

const DB_DIR = path.resolve(process.cwd(), 'database');
const DB_FILE = path.join(DB_DIR, 'users.json');
const DB_BAK_FILE = path.join(DB_DIR, 'users.json.bak');

const userMap = new Map();
const emergencyCache = GlobCache.createCache('users_emergency_backup', {
	maxSize: 50_000,
	ttl: 0,
});

let dbMeta = {
	lastDefaultLimit: setting.limit,
	lastCloudSync: null,
};

const dirtyUpserts = new Set();
const dirtyDeletes = new Set();
const dirtyGen = new Map();

let diskTimer = null;
let syncTimer = null;
let diskWriteLock = Promise.resolve();
let isCloudSyncing = false;
let isInitialized = false;

async function ensureDbDir() {
	await fs.mkdir(DB_DIR, { recursive: true });
}

function normalizeUser(raw) {
	if (!raw || raw.telegram_id === undefined || raw.telegram_id === null) return null;

	return {
		id: Number(raw.id ?? 0),
		telegram_id: Number(raw.telegram_id),
		username: raw.username ?? null,
		first_name: raw.first_name ?? null,
		last_name: raw.last_name ?? null,
		is_registered: Boolean(raw.is_registered),
		is_banned: Boolean(raw.is_banned),
		user_limit: Number.isFinite(Number(raw.user_limit))
			? Math.max(0, Number(raw.user_limit))
			: setting.limit,
		date_registered: raw.date_registered || new Date().toISOString(),
		last_active: raw.last_active || new Date().toISOString(),
	};
}

function getNextLocalId() {
	if (userMap.size === 0) return 0;
	let maxId = -1;
	for (const user of userMap.values()) {
		if (typeof user.id === 'number' && user.id > maxId) {
			maxId = user.id;
		}
	}
	return maxId + 1;
}

function markUserDirty(telegramId) {
	const id = Number(telegramId);
	dirtyGen.set(id, (dirtyGen.get(id) ?? 0) + 1);
	dirtyUpserts.add(id);
}

function scheduleDiskWrite() {
	if (diskTimer) return;
	diskTimer = setTimeout(() => {
		diskTimer = null;
		void writeLocalAtomic();
	}, interval.diskDebounceMs ?? 500).unref();
}

function writeLocalAtomic() {
	diskWriteLock = diskWriteLock
		.then(async () => {
			await ensureDbDir();
			const payload = JSON.stringify(
				{
					meta: dbMeta,
					users: Array.from(userMap.values()),
				},
				null,
				2
			);

			const tmpFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
			try {
				await fs.writeFile(tmpFile, payload, 'utf8');
				try {
					await fs.copyFile(DB_FILE, DB_BAK_FILE);
				} catch {}
				await fs.rename(tmpFile, DB_FILE);
			} catch (err) {
				try {
					await fs.unlink(tmpFile);
				} catch {}
				throw err;
			}
		})
		.catch(err => {
			log.error(`Failed to perform atomic write to local JSON: ${err.message}`);
		});

	return diskWriteLock;
}

async function readLocalJson() {
	for (const filePath of [DB_FILE, DB_BAK_FILE]) {
		try {
			const raw = await fs.readFile(filePath, 'utf8');
			const parsed = JSON.parse(raw);
			if (!parsed || !Array.isArray(parsed.users)) {
				throw new Error('Invalid JSON structure');
			}
			if (filePath === DB_BAK_FILE) {
				log.warning('users.json was corrupted. Successfully restored from users.json.bak');
			}
			return parsed;
		} catch (err) {
			if (err.code !== 'ENOENT') {
				log.warning(`Failed to read ${path.basename(filePath)}: ${err.message}`);
			}
		}
	}
	return null;
}

export async function syncToCloud() {
	if (!supabase || isCloudSyncing) return;
	if (dirtyUpserts.size === 0 && dirtyDeletes.size === 0) return;

	isCloudSyncing = true;
	try {
		if (dirtyDeletes.size > 0) {
			const idsToDelete = Array.from(dirtyDeletes);
			const { error } = await supabase.from('users').delete().in('telegram_id', idsToDelete);
			if (error) {
				throw new Error(`Failed deleting cloud data: ${error.message}`);
			}
			for (const id of idsToDelete) {
				dirtyDeletes.delete(id);
			}
		}

		if (dirtyUpserts.size > 0) {
			const pendingIds = Array.from(dirtyUpserts);
			const genSnapshot = new Map(pendingIds.map(id => [id, dirtyGen.get(id) ?? 0]));
			const records = pendingIds.map(id => userMap.get(String(id))).filter(Boolean);

			const chunkSize = 200;
			for (let i = 0; i < records.length; i += chunkSize) {
				const chunk = records.slice(i, i + chunkSize);
				const { data, error } = await supabase
					.from('users')
					.upsert(chunk, { onConflict: 'telegram_id' })
					.select();

				if (error) {
					throw new Error(`Upsert cloud failed: ${error.message}`);
				}

				if (Array.isArray(data)) {
					for (const row of data) {
						const normalized = normalizeUser(row);
						if (!normalized) continue;

						const id = normalized.telegram_id;
						const key = String(id);

						if (dirtyGen.get(id) === genSnapshot.get(id)) {
							userMap.set(key, normalized);
							emergencyCache.set(key, { ...normalized });
							dirtyUpserts.delete(id);
							dirtyGen.delete(id);
						}
					}
				}
			}

			for (const id of pendingIds) {
				if (!userMap.has(String(id))) {
					dirtyUpserts.delete(id);
					dirtyGen.delete(id);
				}
			}

			dbMeta.lastCloudSync = new Date().toISOString();
			scheduleDiskWrite();
		}
	} catch (err) {
		log.warning(`Supabase sync pending: ${err.message}`);
	} finally {
		isCloudSyncing = false;
	}
}

export async function initDatabase() {
	if (isInitialized) return;

	await ensureDbDir();
	const localData = await readLocalJson();
	let cloudUsers = null;

	if (supabase) {
		try {
			const { data, error } = await supabase
				.from('users')
				.select('*')
				.order('id', { ascending: true });
			if (error) throw error;
			cloudUsers = Array.isArray(data) ? data : [];
		} catch (err) {
			log.warning(
				`Supabase unreachable on startup, switching to Local JSON mode: ${err.message}`
			);
		}
	}

	if (!localData && cloudUsers !== null) {
		for (const row of cloudUsers) {
			const user = normalizeUser(row);
			if (user) {
				const key = String(user.telegram_id);
				userMap.set(key, user);
				emergencyCache.set(key, { ...user });
			}
		}
		log.success(`Database restored from Supabase (${userMap.size} users)`);
	} else if (localData && cloudUsers === null) {
		if (localData.meta?.lastDefaultLimit !== undefined) {
			dbMeta = { ...dbMeta, ...localData.meta };
		}
		for (const row of localData.users) {
			const user = normalizeUser(row);
			if (user) {
				const key = String(user.telegram_id);
				userMap.set(key, user);
				emergencyCache.set(key, { ...user });
				markUserDirty(user.telegram_id);
			}
		}
		log.success(
			`Database loaded from Local JSON (${userMap.size} users)${supabase ? '. Waiting for cloud sync' : ''}`
		);
	} else if (localData && cloudUsers !== null) {
		if (localData.meta?.lastDefaultLimit !== undefined) {
			dbMeta = { ...dbMeta, ...localData.meta };
		}

		const cloudMap = new Map();
		for (const row of cloudUsers) {
			const user = normalizeUser(row);
			if (user) cloudMap.set(String(user.telegram_id), user);
		}

		const localMap = new Map();
		for (const row of localData.users) {
			const user = normalizeUser(row);
			if (user) localMap.set(String(user.telegram_id), user);
		}

		const allKeys = new Set([...cloudMap.keys(), ...localMap.keys()]);
		for (const key of allKeys) {
			const cUser = cloudMap.get(key);
			const lUser = localMap.get(key);

			if (cUser && !lUser) {
				userMap.set(key, cUser);
			} else if (!cUser && lUser) {
				userMap.set(key, lUser);
				markUserDirty(lUser.telegram_id);
			} else if (cUser && lUser) {
				const cTime = new Date(cUser.last_active).getTime();
				const lTime = new Date(lUser.last_active).getTime();
				if (lTime > cTime) {
					userMap.set(key, lUser);
					markUserDirty(lUser.telegram_id);
				} else {
					userMap.set(key, cUser);
				}
			}

			const chosen = userMap.get(key);
			if (chosen) emergencyCache.set(key, { ...chosen });
		}
		log.success(`Local and Supabase databases synchronized (${userMap.size} users)`);
	} else {
		for (const [key, cachedUser] of emergencyCache.entries()) {
			const user = normalizeUser(cachedUser);
			if (user) {
				userMap.set(key, user);
				markUserDirty(user.telegram_id);
			}
		}
		if (userMap.size > 0) {
			log.warning(`Recovered ${userMap.size} users from emergency cache`);
		} else {
			log.info('Initialized fresh empty database');
		}
	}

	await syncLimitWithConfig();
	await purgeInactiveUsers();
	await writeLocalAtomic();
	await syncToCloud();

	if (supabase) {
		syncTimer = setInterval(() => {
			void syncToCloud();
		}, interval.cloudSyncIntervalMs ?? 10_000).unref();
	}

	isInitialized = true;
}

export async function syncLimitWithConfig() {
	const currentConfigLimit = Number(setting.limit ?? 15);
	const previousConfigLimit = Number(dbMeta.lastDefaultLimit ?? currentConfigLimit);
	const diff = currentConfigLimit - previousConfigLimit;

	if (diff === 0) return;

	for (const [key, user] of userMap.entries()) {
		user.user_limit = Math.max(0, user.user_limit + diff);
		emergencyCache.set(key, { ...user });
		markUserDirty(user.telegram_id);
	}

	dbMeta.lastDefaultLimit = currentConfigLimit;
	scheduleDiskWrite();
	log.info(
		`setting.limit changed (${previousConfigLimit} -> ${currentConfigLimit}). Adjusted all user limits (${diff > 0 ? `+${diff}` : diff})`
	);
}

export async function getUser(telegramId) {
	const key = String(telegramId);
	let user = userMap.get(key);

	if (!user && emergencyCache.has(key)) {
		user = normalizeUser(emergencyCache.get(key));
		if (user) userMap.set(key, user);
	}

	if (!user) return null;

	const maxInactiveMs = (setting.inactiveDays ?? 30) * 24 * 60 * 60 * 1000;
	const lastActiveMs = new Date(user.last_active).getTime();

	if (Date.now() - lastActiveMs > maxInactiveMs) {
		await deleteUserByTelegramId(telegramId);
		return null;
	}

	const now = Date.now();
	if (now - lastActiveMs > (interval.activeUpdateThresholdMs ?? 300_000)) {
		user.last_active = new Date(now).toISOString();
		emergencyCache.set(key, { ...user });
		markUserDirty(user.telegram_id);
		scheduleDiskWrite();
	}

	return user;
}

export async function registerUser(tgUser) {
	const key = String(tgUser.id);
	const now = new Date().toISOString();
	const existing = userMap.get(key);

	const userObj = normalizeUser({
		id: existing ? existing.id : getNextLocalId(),
		telegram_id: tgUser.id,
		username: tgUser.username || null,
		first_name: tgUser.first_name || null,
		last_name: tgUser.last_name || null,
		is_registered: true,
		is_banned: existing?.is_banned ?? false,
		user_limit: existing?.is_registered ? existing.user_limit : setting.limit,
		date_registered: existing?.date_registered || now,
		last_active: now,
	});

	userMap.set(key, userObj);
	emergencyCache.set(key, { ...userObj });
	dirtyDeletes.delete(userObj.telegram_id);
	markUserDirty(userObj.telegram_id);

	scheduleDiskWrite();
	void syncToCloud();
	return userObj;
}

export function useUserLimit(telegramId, amount = 1) {
	const key = String(telegramId);
	const user = userMap.get(key);
	if (!user) return false;

	if (Array.isArray(owner.id) && owner.id.includes(user.telegram_id)) {
		return true;
	}
	if (user.user_limit < amount) {
		return false;
	}

	user.user_limit -= amount;
	user.last_active = new Date().toISOString();
	emergencyCache.set(key, { ...user });
	markUserDirty(user.telegram_id);
	scheduleDiskWrite();
	return true;
}

export function setUserLimit(telegramId, newLimit) {
	const key = String(telegramId);
	const user = userMap.get(key);
	if (!user) return null;

	user.user_limit = Math.max(0, Number(newLimit));
	emergencyCache.set(key, { ...user });
	markUserDirty(user.telegram_id);
	scheduleDiskWrite();
	return user;
}

export function setBanStatus(telegramId, status = true) {
	const key = String(telegramId);
	const user = userMap.get(key);
	if (!user) return null;

	user.is_banned = Boolean(status);
	emergencyCache.set(key, { ...user });
	markUserDirty(user.telegram_id);
	scheduleDiskWrite();
	return user;
}

export async function deleteUserByIndex(indexId) {
	const targetId = Number(indexId);
	for (const [key, user] of userMap.entries()) {
		if (user.id === targetId) {
			userMap.delete(key);
			emergencyCache.delete(key);
			dirtyUpserts.delete(user.telegram_id);
			dirtyGen.delete(user.telegram_id);
			dirtyDeletes.add(user.telegram_id);
			scheduleDiskWrite();
			void syncToCloud();
			return user;
		}
	}
	return null;
}

export async function deleteUserByTelegramId(telegramId) {
	const key = String(telegramId);
	const user = userMap.get(key);
	if (!user) return false;

	userMap.delete(key);
	emergencyCache.delete(key);
	dirtyUpserts.delete(user.telegram_id);
	dirtyGen.delete(user.telegram_id);
	dirtyDeletes.add(user.telegram_id);
	scheduleDiskWrite();
	void syncToCloud();
	return true;
}

export async function purgeInactiveUsers() {
	const maxInactiveMs = (setting.inactiveDays ?? 30) * 24 * 60 * 60 * 1000;
	const now = Date.now();
	let purgedCount = 0;

	for (const [key, user] of userMap.entries()) {
		const lastActiveMs = new Date(user.last_active).getTime();
		if (now - lastActiveMs > maxInactiveMs) {
			userMap.delete(key);
			emergencyCache.delete(key);
			dirtyUpserts.delete(user.telegram_id);
			dirtyGen.delete(user.telegram_id);
			dirtyDeletes.add(user.telegram_id);
			purgedCount++;
		}
	}

	if (purgedCount > 0) {
		scheduleDiskWrite();
		log.info(
			`Auto-cleanup: purged ${purgedCount} inactive users (> ${setting.inactiveDays ?? 30} days)`
		);
	}

	return purgedCount;
}

export function getAllUsers() {
	return Array.from(userMap.values()).sort((a, b) => a.id - b.id);
}

export async function flushDatabase() {
	if (diskTimer) {
		clearTimeout(diskTimer);
		diskTimer = null;
	}
	if (syncTimer) {
		clearInterval(syncTimer);
		syncTimer = null;
	}
	await writeLocalAtomic();
	await syncToCloud();
}

// telegraf auth middleware
const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function getPrefixRegex() {
	const rawPrefixes = Array.isArray(bot.prefix) ? bot.prefix : [bot.prefix || '/'];
	const cleaned = rawPrefixes.map(p => String(p).trim()).filter(Boolean);
	const pattern = cleaned.length > 0 ? cleaned.map(escapeRegex).join('|') : '\\/';
	return {
		commandRegex: new RegExp(`^(?:${pattern})\\S`, 'i'),
		authRegex: new RegExp(`^(?:${pattern})(?:start|register)(?:@[\\w_]+)?(?:\\s|$)`, 'i'),
	};
}

export function authMiddleware() {
	return async (ctx, next) => {
		if (!ctx.from || ctx.from.is_bot) return;

		const isOwner = Array.isArray(owner.id) && owner.id.includes(ctx.from.id);
		const user = await getUser(ctx.from.id);

		if (user?.is_banned && !isOwner) {
			log.warning(`Access denied from banned user: ${ctx.from.id}`);
			return;
		}

		ctx.state.user = user;
		ctx.state.isOwner = isOwner;

		const text = ctx.message?.text || ctx.message?.caption || '';
		const { commandRegex, authRegex } = getPrefixRegex();

		const isCommand = commandRegex.test(text);
		const isAuthCommand = authRegex.test(text);

		if (isCommand && !user?.is_registered && !isAuthCommand && !isOwner) {
			return ctx.reply(message.notRegistered, { parse_mode: 'HTML' });
		}

		return next();
	};
}
