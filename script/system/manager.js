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

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { log } from '#lib/logger.js';
import { GlobCache } from './cache.js';
import { toTeleId } from './types.js';
export class DatabaseSyncError extends Error {
	name = 'DatabaseSyncError';
	cause;
	constructor(message, cause) {
		super(message, { cause });
		this.cause = cause;
	}
}
export class DatabaseConfigurationError extends DatabaseSyncError {
	name = 'DatabaseConfigurationError';
}
const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const isUserRow = value => {
	if (!isRecord(value)) return false;
	const row = value;
	return (
		(typeof row.id === 'number' || typeof row.id === 'bigint') &&
		(typeof row.telegram_id === 'number' || typeof row.telegram_id === 'bigint') &&
		(row.username === null || typeof row.username === 'string') &&
		(row.first_name === null || typeof row.first_name === 'string') &&
		(row.last_name === null || typeof row.last_name === 'string') &&
		(row.user_limit === null || typeof row.user_limit === 'number') &&
		(row.warning === null || typeof row.warning === 'number') &&
		(row.is_owner === null || typeof row.is_owner === 'boolean') &&
		(row.is_banned === null || typeof row.is_banned === 'boolean') &&
		(row.info === null || typeof row.info === 'object')
	);
};
const isUserPayload = value => {
	if (!isRecord(value)) return false;
	const payload = value;
	return typeof payload.telegram_id === 'number' || typeof payload.telegram_id === 'bigint';
};
const jsonReplacer = (_key, value) => (typeof value === 'bigint' ? `${value.toString()}n` : value);
const jsonReviver = (_key, value) => {
	if (typeof value === 'string' && /^-?\d+n$/.test(value)) {
		return BigInt(value.slice(0, -1));
	}
	return value;
};
export class DatabaseManager {
	static defaultDirectory = join(process.cwd(), 'database', 'activity');
	client;
	usersFile;
	queueFile;
	cache;
	sweepIntervalMs;
	fileTail = Promise.resolve();
	syncPromise = null;
	sweepTimer = null;
	stopped = false;
	constructor(options = {}) {
		const directory = options.directory ?? DatabaseManager.defaultDirectory;
		this.usersFile = options.usersFile ?? join(directory, 'users.json');
		this.queueFile = options.queueFile ?? join(directory, 'queue.json');
		this.sweepIntervalMs = options.sweepIntervalMs ?? 30_000;
		this.client =
			options.client === undefined
				? DatabaseManager.createConfiguredClient()
				: options.client;
		this.cache = GlobCache.createCache('users_cache', {
			ttl: options.cacheTtlMs ?? 60_000,
			sweepInterval: Math.min(options.cacheTtlMs ?? 60_000, 60_000),
		});
		this.startSweeper();
	}
	async getUser(telegramId) {
		const key = toTeleId(telegramId);
		const cached = this.cache.get(key);
		if (cached) return cached;
		try {
			const client = this.requireClient();
			const { data, error } = await client
				.from('users')
				.select('*')
				.eq('telegram_id', key.toString())
				.maybeSingle();
			if (error) throw error;
			if (data && !isUserRow(data)) {
				throw new DatabaseSyncError('Data from supabase returned an invalid users row');
			}
			if (data) {
				data.telegram_id = toTeleId(data.telegram_id);
				this.cache.set(key, data);
			}
			return data ?? undefined;
		} catch (error) {
			log.error(
				`Failed read data from supabase. Using local users mirror: ${errorMessage(error)}`
			);
			const users = await this.readUsers();
			const local = users.find(user => toTeleId(user.telegram_id) === key);
			if (local) this.cache.set(key, local);
			return local;
		}
	}
	async upsertUser(userData) {
		const payload = this.normalizePayload(userData);
		const idKey = toTeleId(payload.telegram_id);
		try {
			const client = this.requireClient();
			const { error } = await client.from('users').upsert(payload, {
				onConflict: 'telegram_id',
			});
			if (error) throw error;
		} catch (error) {
			log.error(`Supabase upsert failed. Queueing local update: ${errorMessage(error)}`);
			await this.enqueue(payload);
		}
		await this.updateLocalMirror(payload);
		this.cache.delete(idKey);
	}
	async syncOfflineQueue() {
		if (this.syncPromise) return this.syncPromise;
		this.syncPromise = this.syncQueue().finally(() => {
			this.syncPromise = null;
		});
		return this.syncPromise;
	}
	stop() {
		this.stopped = true;
		if (this.sweepTimer) clearInterval(this.sweepTimer);
		this.sweepTimer = null;
	}
	async syncQueue() {
		const pending = await this.claimQueue();
		if (pending.length === 0) return;
		if (!this.client) {
			await this.restoreQueue(pending);
			return;
		}
		let completed = 0;
		try {
			for (const payload of pending) {
				const { error } = await this.client.from('users').upsert(payload, {
					onConflict: 'telegram_id',
				});
				if (error) throw error;
				completed++;
			}
		} catch (error) {
			await this.restoreQueue(pending.slice(completed));
			throw new DatabaseSyncError('Offline user queue sync failed', error);
		}
	}
	withFileLock(operation) {
		const run = this.fileTail.then(operation, operation);
		this.fileTail = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}
	async claimQueue() {
		return this.withFileLock(async () => {
			const queue = await this.readQueue();
			if (queue.length > 0) await this.writeJsonAtomic(this.queueFile, []);
			return queue;
		});
	}
	async restoreQueue(payloads) {
		if (payloads.length === 0) return;
		await this.withFileLock(async () => {
			const current = await this.readQueue();
			await this.writeJsonAtomic(this.queueFile, [...payloads, ...current]);
		});
	}
	async enqueue(payload) {
		await this.withFileLock(async () => {
			const queue = await this.readQueue();
			const next = queue.filter(
				item => toTeleId(item.telegram_id) !== toTeleId(payload.telegram_id)
			);
			next.push(payload);
			await this.writeJsonAtomic(this.queueFile, next);
		});
	}
	async updateLocalMirror(payload) {
		await this.withFileLock(async () => {
			const users = await this.readUsers();
			const payloadId = toTeleId(payload.telegram_id);
			const index = users.findIndex(user => toTeleId(user.telegram_id) === payloadId);
			const current = index >= 0 ? users[index] : undefined;
			const merged = this.mergePayload(current, payload);
			if (index >= 0) users[index] = merged;
			else users.push(merged);
			await this.writeJsonAtomic(this.usersFile, users);
		});
	}
	async readUsers() {
		return this.readJson(
			this.usersFile,
			value => {
				if (!Array.isArray(value) || !value.every(isUserRow)) {
					throw new DatabaseSyncError(`Invalid local users file: ${this.usersFile}`);
				}
				return value;
			},
			[]
		);
	}
	async readQueue() {
		return this.readJson(
			this.queueFile,
			value => {
				if (!Array.isArray(value) || !value.every(isUserPayload)) {
					throw new DatabaseSyncError(`Invalid offline queue file: ${this.queueFile}`);
				}
				return value;
			},
			[]
		);
	}
	async readJson(file, parse, empty) {
		try {
			const fileContent = await fs.readFile(file, 'utf8');
			return parse(JSON.parse(fileContent, jsonReviver));
		} catch (error) {
			if (isMissingFile(error)) return empty;
			if (error instanceof SyntaxError) {
				throw new DatabaseSyncError(`Invalid JSON in ${file}`, error);
			}
			throw error;
		}
	}
	async writeJsonAtomic(file, value) {
		await fs.mkdir(dirname(file), { recursive: true });
		const temporary = `${file}.tmp`;
		const data = JSON.stringify(value, jsonReplacer);
		await fs.writeFile(temporary, `${data}\n`, 'utf8');
		await fs.rename(temporary, file);
	}
	normalizePayload(payload) {
		return {
			...payload,
			telegram_id: toTeleId(payload.telegram_id),
			id: payload.id === undefined ? undefined : Number(payload.id),
		};
	}
	mergePayload(current, payload) {
		const merged = { ...current, ...payload };
		return {
			id: Number(merged.id ?? 0),
			telegram_id: toTeleId(merged.telegram_id),
			username: merged.username ?? null,
			first_name: merged.first_name ?? null,
			last_name: merged.last_name ?? null,
			user_limit: merged.user_limit ?? null,
			warning: merged.warning ?? null,
			is_owner: merged.is_owner ?? null,
			is_banned: merged.is_banned ?? null,
			info: merged.info ?? null,
		};
	}
	requireClient() {
		if (!this.client) {
			throw new DatabaseConfigurationError(
				'Supabase is not configured. Set DB_URL and DB_KEY in .env file'
			);
		}
		return this.client;
	}
	startSweeper() {
		this.sweepTimer = setInterval(() => {
			if (this.stopped) return;
			void this.syncOfflineQueue().catch(error => {
				log.error(`Offline queue sweep failed: ${errorMessage(error)}`);
			});
		}, this.sweepIntervalMs).unref();
	}
	static createConfiguredClient() {
		const url = typeof database !== 'undefined' ? database.urldb : undefined;
		const key = typeof database !== 'undefined' ? database.keydb : undefined;
		return url && key ? createClient(url, key) : null;
	}
}
const defaultManager = new DatabaseManager();
export class DbManager {
	static getUser = defaultManager.getUser.bind(defaultManager);
	static upsertUser = defaultManager.upsertUser.bind(defaultManager);
	static syncOfflineQueue = defaultManager.syncOfflineQueue.bind(defaultManager);
	static stop = defaultManager.stop.bind(defaultManager);
}
function isMissingFile(error) {
	return (
		typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
	);
}
function errorMessage(error) {
	if (error instanceof Error) return error.message;
	if (typeof error === 'object' && error !== null && 'message' in error) {
		return String(error.message);
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
}
