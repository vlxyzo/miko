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

const valid_types = ['private', 'group', 'supergroup', 'channel'];
export function isChat(value) {
	return valid_types.includes(value);
}
export function toTeleId(value) {
	if (typeof value === 'bigint') return value;
	if (typeof value === 'number') {
		if (!Number.isInteger(value)) {
			throw new TypeError(`[toTeleId] Provided number ${value} is not an integer`);
		}
		return BigInt(value);
	}
	if (typeof value === 'string' && /^-?\d+$/.test(value)) {
		return BigInt(value);
	}
	throw new TypeError(
		`[toTeleId] Provided value ${value} is not a valid integer string or number`
	);
}
export function toDbId(value) {
	const id = typeof value === 'bigint' ? value : toTeleId(value);
	if (id > BigInt(Number.MAX_SAFE_INTEGER) || id < BigInt(Number.MIN_SAFE_INTEGER)) {
		throw new RangeError(
			`[toDbId] ID ${id} exceeds JavaScript safe integer range (${Number.MAX_SAFE_INTEGER})`
		);
	}
	return Number(id);
}
