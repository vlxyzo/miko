import { GlobCache } from '#sys/cache.js';
import { TimeUtil } from './times.js';

const INACTIVE_STATE = Object.freeze({
	active: false,
	remainingMs: 0,
	remainingText: '0s',
	expiresAt: 0,
});

function levenshteinDistance(strA, strB) {
	if (strA === strB) return 0;
	if (!strA.length) return strB.length;
	if (!strB.length) return strA.length;

	const [a, b] = strA.length >= strB.length ? [strA, strB] : [strB, strA];
	const bLen = b.length;

	let prev = new Uint16Array(bLen + 1);
	let curr = new Uint16Array(bLen + 1);

	for (let j = 0; j <= bLen; j++) prev[j] = j;

	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		const aChar = a.charCodeAt(i - 1);

		for (let j = 1; j <= bLen; j++) {
			const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
			const del = prev[j] + 1;
			const ins = curr[j - 1] + 1;
			const sub = prev[j - 1] + cost;
			curr[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
		}

		[prev, curr] = [curr, prev];
	}

	return prev[bLen];
}

export function getSimilarity(strA, strB) {
	const a = String(strA ?? '')
		.toLowerCase()
		.trim();
	const b = String(strB ?? '')
		.toLowerCase()
		.trim();

	if (!a || !b) return 0;
	if (a === b) return 100;

	const maxLen = Math.max(a.length, b.length);
	const distance = levenshteinDistance(a, b);
	return Math.round(((maxLen - distance) / maxLen) * 100);
}

export function findDidYouMean(input, pluginsMap, threshold = 60, options = {}) {
	if (typeof input !== 'string' || !pluginsMap || pluginsMap.size === 0) {
		return null;
	}

	const normalizedInput = input.toLowerCase().trim();
	const inputLen = normalizedInput.length;
	if (inputLen < 2) return null;

	const { isOwner = false } = options;
	const checkedPlugins = new Set();

	let bestMatch = null;
	let highestPercent = 0;

	for (const [, plugin] of pluginsMap) {
		if (!plugin || checkedPlugins.has(plugin)) continue;
		checkedPlugins.add(plugin);

		if (plugin.ownerOnly && !isOwner) continue;

		const candidates = new Set();
		for (const field of [plugin.command, plugin.alias, plugin.name, plugin.help]) {
			if (!field || field instanceof RegExp) continue;
			const items = Array.isArray(field) ? field : [field];
			for (const item of items) {
				if (typeof item === 'string') {
					const normalized = item.toLowerCase().trim();
					if (normalized) candidates.add(normalized);
				}
			}
		}

		for (const cmd of candidates) {
			const cmdLen = cmd.length;
			const maxPossiblePercent =
				(Math.min(inputLen, cmdLen) / Math.max(inputLen, cmdLen)) * 100;

			if (maxPossiblePercent < threshold || maxPossiblePercent <= highestPercent) {
				continue;
			}

			const percent = getSimilarity(normalizedInput, cmd);
			if (percent > highestPercent) {
				highestPercent = percent;
				bestMatch = cmd;
			}
		}
	}

	return bestMatch && highestPercent >= threshold
		? { command: bestMatch, similarity: `${highestPercent}%` }
		: null;
}

export function createCooldown(name, options = {}) {
	const cache = GlobCache.createCache(name, {
		maxSize: options.maxSize ?? 50_000,
		ttl: 0,
	});

	return {
		check(key) {
			const k = String(key);
			const expiresAt = cache.get(k);
			const now = Date.now();

			if (!expiresAt || now >= expiresAt) {
				if (expiresAt) cache.delete(k);
				return { ...INACTIVE_STATE };
			}

			const remainingMs = expiresAt - now;
			return {
				active: true,
				remainingMs,
				remainingText: TimeUtil.shortClock(remainingMs),
				expiresAt,
			};
		},

		set(key, duration) {
			const durationMs = TimeUtil.parseDuration(duration, 0);
			if (durationMs <= 0) return 0;

			const expiresAt = Date.now() + durationMs;
			cache.set(String(key), expiresAt);
			return expiresAt;
		},

		consume(key, duration) {
			const status = this.check(key);
			if (status.active) {
				return { ok: false, ...status };
			}

			const expiresAt = this.set(key, duration);
			return { ok: true, ...INACTIVE_STATE, expiresAt };
		},

		delete(key) {
			return cache.delete(String(key));
		},

		clear() {
			cache.clear();
		},
	};
}

export const cmdCooldown = createCooldown('cmd_cooldown', { maxSize: 50_000 });
export const awayCooldown = createCooldown('owner_away_notice', { maxSize: 10_000 });
