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
import { toTeleId } from './integer.js';

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
