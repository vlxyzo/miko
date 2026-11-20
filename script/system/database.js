/**
 * @project   miko v0.0.1-alpha
 * @author    Velix <https://github.com/vlxyzo>
 * @license   GPL-3.0-or-later
 * @source    https://github.com/vlxyzo/miko
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { log } from '#lib/logger.js';
import { TimeUtil } from '#lib/times.js';
import { bot, database, interval, owner, setting } from '../config.js';

export const supabase =
	database.url && database.key
		? createClient(database.url, database.key, {
				auth: { persistSession: false, autoRefreshToken: false },
			})
		: null;
if (!supabase) {
	log.warning('DB_URL or DB_KEY is not set. Running in local json mode only');
}
const DB_DIR = path.resolve(process.cwd(), 'database');
const DB_FILE = path.join(DB_DIR, 'db.json');
const DB_BAK_FILE = path.join(DB_DIR, 'db.json.bak');
const CHUNK_SIZE = 200;
let dbMeta = {
	lastDefaultLimit: setting.limit,
	lastLimitResetDate: TimeUtil.getDateKey(),
	lastCloudSync: null,
};
let diskTimer = null;
let syncTimer = null;
let diskWriteLock = Promise.resolve();
let isCloudSyncing = false;
let isInitialized = false;
function getOwnerIds() {
	if (!owner.id) return [];
	const list = Array.isArray(owner.id) ? owner.id : String(owner.id).split(',');
	return list.map(id => Number(String(id).trim())).filter(id => Number.isFinite(id) && id > 0);
}
export function isOwnerId(telegramId) {
	const target = Number(telegramId);
	return Number.isFinite(target) && target > 0 && getOwnerIds().includes(target);
}
function normalizeUser(raw) {
	if (!raw || raw.telegram_id == null) return null;
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
function normalizeBan(raw) {
	if (!raw || raw.telegram_id == null) return null;
	return {
		telegram_id: Number(raw.telegram_id),
		reason: String(raw.reason || 'No reason provided'),
		banned_by: raw.banned_by != null ? Number(raw.banned_by) : null,
		banned_at: raw.banned_at || new Date().toISOString(),
		expires_at: raw.expires_at || null,
	};
}
function normalizeGroup(raw) {
	if (!raw || raw.chat_id == null) return null;
	return {
		chat_id: Number(raw.chat_id),
		title: raw.title ?? null,
		is_banned: Boolean(raw.is_banned),
		is_muted: Boolean(raw.is_muted),
		welcome: Boolean(raw.welcome),
		antilink: Boolean(raw.antilink),
		last_active: raw.last_active || new Date().toISOString(),
	};
}
function normalizeState(raw) {
	if (!raw || !raw.key) return null;
	return {
		key: String(raw.key),
		value: raw.value && typeof raw.value === 'object' ? raw.value : {},
		updated_at: raw.updated_at || new Date().toISOString(),
	};
}
function createTable(table, keyField, timeField, normalize) {
	const map = new Map();
	const upserts = new Set();
	const deletes = new Set();
	const gen = new Map();
	return {
		map,
		hasPending: () => upserts.size > 0 || deletes.size > 0,
		markUpsert(id) {
			gen.set(id, (gen.get(id) ?? 0) + 1);
			deletes.delete(id);
			upserts.add(id);
		},
		markDelete(id) {
			upserts.delete(id);
			gen.delete(id);
			deletes.add(id);
		},
		merge(cloudRows, localRows) {
			const toMap = rows => {
				const out = new Map();
				for (const row of rows ?? []) {
					const item = normalize(row);
					if (item) out.set(String(item[keyField]), item);
				}
				return out;
			};
			const cloudMap = toMap(cloudRows);
			const localMap = toMap(localRows);
			if (cloudRows === null) {
				for (const [key, item] of localMap) {
					map.set(key, item);
					this.markUpsert(item[keyField]);
				}
				return;
			}
			if (localRows === null) {
				for (const [key, item] of cloudMap) map.set(key, item);
				return;
			}
			for (const key of new Set([...cloudMap.keys(), ...localMap.keys()])) {
				const cItem = cloudMap.get(key);
				const lItem = localMap.get(key);
				if (cItem && !lItem) {
					map.set(key, cItem);
				} else if (!cItem && lItem) {
					map.set(key, lItem);
					this.markUpsert(lItem[keyField]);
				} else if (cItem && lItem) {
					const cTime = new Date(cItem[timeField] || 0).getTime();
					const lTime = new Date(lItem[timeField] || 0).getTime();
					if (lTime > cTime) {
						map.set(key, lItem);
						this.markUpsert(lItem[keyField]);
					} else {
						map.set(key, cItem);
					}
				}
			}
		},
		async sync() {
			if (deletes.size > 0) {
				const ids = Array.from(deletes);
				const { error } = await supabase.from(table).delete().in(keyField, ids);
				if (error) throw new Error(`Failed deleting ${table}: ${error.message}`);
				for (const id of ids) deletes.delete(id);
			}
			if (upserts.size > 0) {
				const pendingIds = Array.from(upserts);
				const genSnapshot = new Map(pendingIds.map(id => [id, gen.get(id) ?? 0]));
				const records = pendingIds.map(id => map.get(String(id))).filter(Boolean);
				for (let i = 0; i < records.length; i += CHUNK_SIZE) {
					const chunk = records.slice(i, i + CHUNK_SIZE);
					const { data, error } = await supabase
						.from(table)
						.upsert(chunk, { onConflict: keyField })
						.select();
					if (error) throw new Error(`Upsert ${table} failed: ${error.message}`);
					for (const row of data ?? []) {
						const normalized = normalize(row);
						if (!normalized) continue;
						const id = normalized[keyField];
						if (gen.get(id) === genSnapshot.get(id)) {
							map.set(String(id), normalized);
							upserts.delete(id);
							gen.delete(id);
						}
					}
				}
				for (const id of pendingIds) {
					if (!map.has(String(id))) {
						upserts.delete(id);
						gen.delete(id);
					}
				}
			}
		},
	};
}
const users = createTable('users', 'telegram_id', 'last_active', normalizeUser);
const bans = createTable('banned_users', 'telegram_id', 'banned_at', normalizeBan);
const groups = createTable('groups', 'chat_id', 'last_active', normalizeGroup);
const states = createTable('bot_state', 'key', 'updated_at', normalizeState);
const allTables = [users, bans, groups, states];
function getNextLocalId() {
	let maxId = -1;
	for (const user of users.map.values()) {
		if (typeof user.id === 'number' && user.id > maxId) maxId = user.id;
	}
	return maxId + 1;
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
			await fs.mkdir(DB_DIR, { recursive: true });
			const payload = JSON.stringify(
				{
					meta: dbMeta,
					users: Array.from(users.map.values()),
					banned: Array.from(bans.map.values()),
					groups: Array.from(groups.map.values()),
					state: Array.from(states.map.values()),
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
		.catch(err => log.error(`Failed to perform atomic write to local json: ${err.message}`));
	return diskWriteLock;
}
async function readLocalJson() {
	for (const filePath of [DB_FILE, DB_BAK_FILE]) {
		try {
			const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
			if (!parsed || !Array.isArray(parsed.users)) throw new Error('Invalid json structure');
			if (filePath === DB_BAK_FILE) {
				log.warning('db.json was corrupted. Successfully restored from db.json.bak');
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
function applyRuntimeStates() {
	const awayState = states.map.get('owner_away')?.value;
	if (awayState && typeof awayState.away === 'boolean') owner.away = awayState.away;
	const botConfig = states.map.get('bot_config')?.value;
	if (botConfig) {
		if (botConfig.mode === 'public' || botConfig.mode === 'self') bot.mode = botConfig.mode;
		if (typeof botConfig.maintenance === 'boolean') bot.maintenance = botConfig.maintenance;
	}
}
export function checkDailyLimitReset() {
	const todayKey = TimeUtil.getDateKey();
	if (dbMeta.lastLimitResetDate === todayKey) return 0;
	const defaultLimit = Number(setting.limit ?? 15);
	let resetCount = 0;
	for (const user of users.map.values()) {
		if (!user.is_registered || user.is_banned) continue;
		if (user.user_limit < defaultLimit) {
			user.user_limit = defaultLimit;
			users.markUpsert(user.telegram_id);
			resetCount++;
		}
	}
	dbMeta.lastLimitResetDate = todayKey;
	scheduleDiskWrite();
	if (resetCount > 0) {
		log.info(`Daily limit reset (${todayKey}): restored limit for ${resetCount} user(s)`);
	}
	return resetCount;
}
export async function syncToCloud() {
	if (!supabase || isCloudSyncing || !allTables.some(t => t.hasPending())) return;
	isCloudSyncing = true;
	try {
		for (const table of allTables) await table.sync();
		dbMeta.lastCloudSync = new Date().toISOString();
		scheduleDiskWrite();
	} catch (err) {
		log.warning(`Supabase sync pending: ${err.message}`);
	} finally {
		isCloudSyncing = false;
	}
}
export async function initDatabase() {
	if (isInitialized) return;
	await fs.mkdir(DB_DIR, { recursive: true });
	const localData = await readLocalJson();
	let cloudData = null;
	if (supabase) {
		try {
			const [usersRes, bansRes, groupsRes, stateRes] = await Promise.all([
				supabase.from('users').select('*').order('id', { ascending: true }),
				supabase.from('banned_users').select('*'),
				supabase.from('groups').select('*'),
				supabase.from('bot_state').select('*'),
			]);
			const firstError = usersRes.error || bansRes.error || groupsRes.error || stateRes.error;
			if (firstError) throw firstError;
			cloudData = {
				users: usersRes.data ?? [],
				banned: bansRes.data ?? [],
				groups: groupsRes.data ?? [],
				state: stateRes.data ?? [],
			};
		} catch (err) {
			log.warning(
				`Supabase unreachable on startup, switching to local json mode: ${err.message}`
			);
		}
	}
	if (localData?.meta) dbMeta = { ...dbMeta, ...localData.meta };
	users.merge(cloudData?.users ?? null, localData?.users ?? null);
	bans.merge(cloudData?.banned ?? null, localData ? (localData.banned ?? []) : null);
	groups.merge(cloudData?.groups ?? null, localData ? (localData.groups ?? []) : null);
	states.merge(cloudData?.state ?? null, localData ? (localData.state ?? []) : null);
	if (!localData && cloudData) {
		log.success(
			`Database restored from Supabase (${users.map.size} users, ${bans.map.size} banned, ${groups.map.size} groups)`
		);
	} else if (localData && !cloudData) {
		log.success(
			`Database loaded from local json (${users.map.size} users)${supabase ? '. Waiting for cloud sync' : ''}`
		);
	} else if (localData && cloudData) {
		log.success(
			`Local and Supabase databases synchronized (${users.map.size} users, ${bans.map.size} banned, ${groups.map.size} groups)`
		);
	} else {
		log.info('Initialized fresh empty database');
	}
	applyRuntimeStates();
	await syncLimitWithConfig();
	checkDailyLimitReset();
	await purgeInactiveUsers();
	await purgeOwnerUsers();
	await writeLocalAtomic();
	await syncToCloud();
	if (supabase) {
		syncTimer = setInterval(() => {
			checkDailyLimitReset();
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
	for (const user of users.map.values()) {
		user.user_limit = Math.max(0, user.user_limit + diff);
		users.markUpsert(user.telegram_id);
	}
	dbMeta.lastDefaultLimit = currentConfigLimit;
	scheduleDiskWrite();
	log.info(
		`setting.limit changed (${previousConfigLimit} -> ${currentConfigLimit}). Adjusted all user limits (${diff > 0 ? `+${diff}` : diff})`
	);
}
export async function getUser(telegramId) {
	checkDailyLimitReset();
	const user = users.map.get(String(telegramId));
	if (!user) return null;
	const maxInactiveMs = (setting.inactiveDays ?? 30) * 24 * 60 * 60 * 1000;
	const lastActiveMs = new Date(user.last_active).getTime();
	const now = Date.now();
	if (now - lastActiveMs > maxInactiveMs) {
		await deleteUserByTelegramId(telegramId);
		return null;
	}
	if (now - lastActiveMs > (interval.activeUpdateThresholdMs ?? 300_000)) {
		user.last_active = new Date(now).toISOString();
		users.markUpsert(user.telegram_id);
		scheduleDiskWrite();
	}
	return user;
}
export async function purgeOwnerUsers() {
	let purgedCount = 0;
	for (const ownerId of getOwnerIds()) {
		const key = String(ownerId);
		const existing = users.map.get(key);
		if (existing) {
			users.map.delete(key);
			users.markDelete(existing.telegram_id);
			purgedCount++;
		}
	}
	if (purgedCount > 0) {
		scheduleDiskWrite();
		log.info(`Removed ${purgedCount} owner account(s) from user database`);
	}
	return purgedCount;
}
export async function registerUser(tgUser) {
	if (isOwnerId(tgUser.id)) return null;
	const key = String(tgUser.id);
	const now = new Date().toISOString();
	const existing = users.map.get(key);
	const banRecord = getBanInfo(tgUser.id);
	const userObj = normalizeUser({
		id: existing ? existing.id : getNextLocalId(),
		telegram_id: tgUser.id,
		username: tgUser.username || null,
		first_name: tgUser.first_name || null,
		last_name: tgUser.last_name || null,
		is_registered: true,
		is_banned: Boolean(banRecord || existing?.is_banned),
		user_limit: existing?.is_registered ? existing.user_limit : setting.limit,
		date_registered: existing?.date_registered || now,
		last_active: now,
	});
	users.map.set(key, userObj);
	users.markUpsert(userObj.telegram_id);
	scheduleDiskWrite();
	void syncToCloud();
	return userObj;
}
export function useUserLimit(telegramId, amount = 1) {
	checkDailyLimitReset();
	if (isOwnerId(telegramId)) return true;
	const user = users.map.get(String(telegramId));
	if (!user || user.user_limit < amount) return false;
	user.user_limit -= amount;
	user.last_active = new Date().toISOString();
	users.markUpsert(user.telegram_id);
	scheduleDiskWrite();
	return true;
}
export function setUserLimit(telegramId, newLimit) {
	const user = users.map.get(String(telegramId));
	if (!user) return null;
	user.user_limit = Math.max(0, Number(newLimit));
	users.markUpsert(user.telegram_id);
	scheduleDiskWrite();
	return user;
}
export async function deleteUserByIndex(indexId) {
	const targetId = Number(indexId);
	for (const [key, user] of users.map) {
		if (user.id === targetId) {
			users.map.delete(key);
			users.markDelete(user.telegram_id);
			scheduleDiskWrite();
			void syncToCloud();
			return user;
		}
	}
	return null;
}
export async function deleteUserByTelegramId(telegramId) {
	const key = String(telegramId);
	const user = users.map.get(key);
	if (!user) return false;
	users.map.delete(key);
	users.markDelete(user.telegram_id);
	scheduleDiskWrite();
	void syncToCloud();
	return true;
}
export async function purgeInactiveUsers() {
	const maxInactiveMs = (setting.inactiveDays ?? 30) * 24 * 60 * 60 * 1000;
	const now = Date.now();
	let purgedCount = 0;
	for (const [key, user] of users.map) {
		if (now - new Date(user.last_active).getTime() > maxInactiveMs) {
			users.map.delete(key);
			users.markDelete(user.telegram_id);
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
	return Array.from(users.map.values()).sort((a, b) => a.id - b.id);
}
export function getBanInfo(telegramId) {
	const ban = bans.map.get(String(telegramId));
	if (!ban) return null;
	if (ban.expires_at && Date.now() >= new Date(ban.expires_at).getTime()) {
		unbanUser(telegramId);
		return null;
	}
	return ban;
}
export function banUser(telegramId, options = {}) {
	const id = Number(telegramId);
	if (!Number.isFinite(id) || isOwnerId(id)) return null;
	const { reason = 'No reason provided', bannedBy = null, duration = null } = options;
	const durationMs = duration ? TimeUtil.parseDuration(duration, 0) : 0;
	const record = normalizeBan({
		telegram_id: id,
		reason,
		banned_by: bannedBy,
		banned_at: new Date().toISOString(),
		expires_at: durationMs > 0 ? new Date(Date.now() + durationMs).toISOString() : null,
	});
	bans.map.set(String(id), record);
	bans.markUpsert(id);
	const user = users.map.get(String(id));
	if (user && !user.is_banned) {
		user.is_banned = true;
		users.markUpsert(id);
	}
	scheduleDiskWrite();
	void syncToCloud();
	return record;
}
export function unbanUser(telegramId) {
	const id = Number(telegramId);
	const key = String(id);
	const hadBan = bans.map.delete(key);
	if (hadBan) bans.markDelete(id);
	const user = users.map.get(key);
	if (user?.is_banned) {
		user.is_banned = false;
		users.markUpsert(id);
	}
	if (hadBan || user) {
		scheduleDiskWrite();
		void syncToCloud();
	}
	return hadBan || Boolean(user);
}
export function setBanStatus(telegramId, status = true, options = {}) {
	if (status) banUser(telegramId, options);
	else unbanUser(telegramId);
	return users.map.get(String(telegramId)) ?? null;
}
export function getAllBannedUsers() {
	return Array.from(bans.map.values()).sort(
		(a, b) => new Date(b.banned_at).getTime() - new Date(a.banned_at).getTime()
	);
}
export function getGroup(chatId) {
	return groups.map.get(String(chatId)) ?? null;
}
export function ensureGroup(chat) {
	if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return null;
	const key = String(chat.id);
	const now = Date.now();
	const existing = groups.map.get(key);
	if (!existing) {
		const created = normalizeGroup({
			chat_id: chat.id,
			title: chat.title || null,
			last_active: new Date(now).toISOString(),
		});
		groups.map.set(key, created);
		groups.markUpsert(created.chat_id);
		scheduleDiskWrite();
		return created;
	}
	const titleChanged = chat.title && existing.title !== chat.title;
	if (
		titleChanged ||
		now - new Date(existing.last_active).getTime() >
			(interval.activeUpdateThresholdMs ?? 300_000)
	) {
		if (chat.title) existing.title = chat.title;
		existing.last_active = new Date(now).toISOString();
		groups.markUpsert(existing.chat_id);
		scheduleDiskWrite();
	}
	return existing;
}
export function updateGroup(chatId, patch = {}) {
	const existing = groups.map.get(String(chatId));
	if (!existing) return null;
	const updated = normalizeGroup({ ...existing, ...patch, chat_id: existing.chat_id });
	groups.map.set(String(chatId), updated);
	groups.markUpsert(updated.chat_id);
	scheduleDiskWrite();
	return updated;
}
export async function deleteGroup(chatId) {
	const key = String(chatId);
	const existing = groups.map.get(key);
	if (!existing) return false;
	groups.map.delete(key);
	groups.markDelete(existing.chat_id);
	scheduleDiskWrite();
	void syncToCloud();
	return true;
}
export function getAllGroups() {
	return Array.from(groups.map.values());
}
export function getState(key, fallback = null) {
	return states.map.get(String(key))?.value ?? fallback;
}
export function setState(key, value) {
	const normalized = normalizeState({ key, value, updated_at: new Date().toISOString() });
	states.map.set(normalized.key, normalized);
	states.markUpsert(normalized.key);
	scheduleDiskWrite();
	void syncToCloud();
	return normalized.value;
}
export function setOwnerAway(away, reason = null) {
	const isAway = Boolean(away);
	owner.away = isAway;
	return setState('owner_away', {
		away: isAway,
		reason: isAway ? String(reason || 'Busy right now') : null,
		since: isAway ? new Date().toISOString() : null,
	});
}
export function getOwnerAway() {
	const saved = getState('owner_away', null);
	return {
		away: Boolean(owner.away),
		reason: saved?.reason ?? null,
		since: saved?.since ?? null,
	};
}
export function setBotRuntime({ mode, maintenance } = {}) {
	if (mode === 'public' || mode === 'self') bot.mode = mode;
	if (typeof maintenance === 'boolean') bot.maintenance = maintenance;
	return setState('bot_config', { mode: bot.mode, maintenance: bot.maintenance });
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
export function authMiddleware(options = {}) {
	const { blockBanned = false } = options;
	return async (ctx, next) => {
		if (!ctx.from || ctx.from.is_bot) return;
		const isOwner = isOwnerId(ctx.from.id);
		const banInfo = isOwner ? null : getBanInfo(ctx.from.id);
		const user = await getUser(ctx.from.id);
		if (blockBanned && !isOwner && (banInfo || user?.is_banned)) {
			log.warning(`Access denied from banned user: ${ctx.from.id}`);
			return;
		}
		ctx.state.user = user;
		ctx.state.group = ensureGroup(ctx.chat);
		ctx.state.isOwner = isOwner;
		ctx.state.banInfo = banInfo;
		return next();
	};
}
