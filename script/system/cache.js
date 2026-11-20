/**
 * @project   miko v0.0.1-alpha
 * @author    Velix <https://github.com/vlxyzo>
 * @license   GPL-3.0-or-later
 * @source    https://github.com/vlxyzo/miko
 */

import { log } from '#lib/logger.js';

export class AdvMap extends Map {
	maxSize;
	ttl;
	name;
	sweepInterval;
	onEvict;
	#timestamps = null;
	#sweepTimer = null;

	constructor(options = {}) {
		super();
		this.maxSize = options.maxSize ?? 0;
		this.ttl = options.ttl ?? 0;
		this.name = options.name ?? 'UnnamedCache';
		this.sweepInterval = options.sweepInterval ?? 60_000;
		this.onEvict = options.onEvict ?? null;

		if (this.ttl > 0) {
			this.#timestamps = new Map();
			if (this.sweepInterval > 0) {
				this.#startSweeper();
			}
		}
	}

	#isExpired(key) {
		if (!this.#timestamps) return false;
		const timeAdded = this.#timestamps.get(key);
		return timeAdded !== undefined && Date.now() - timeAdded > this.ttl;
	}

	#evict(key, reason = 'MANUAL') {
		const value = super.get(key);
		this.delete(key);

		if (value !== undefined && typeof this.onEvict === 'function') {
			try {
				this.onEvict(key, value, reason);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				log.error(`Cache "${this.name}" eviction error: ${errorMsg}`);
			}
		}
	}

	#startSweeper() {
		this.#sweepTimer = setInterval(() => {
			if (this.size === 0 || !this.#timestamps) return;

			const now = Date.now();
			let sweepCount = 0;

			for (const [key, timeAdded] of this.#timestamps.entries()) {
				if (now - timeAdded > this.ttl) {
					this.#evict(key, 'SWEEP_CLEANUP');
					sweepCount++;
				}
			}

			if (sweepCount > 0) {
				log.debug(`Cache "${this.name}" swept ${sweepCount} expired items`);
			}
		}, this.sweepInterval);

		this.#sweepTimer.unref();
	}

	has(key) {
		if (!super.has(key)) return false;
		if (this.#isExpired(key)) {
			this.#evict(key, 'TTL_EXPIRED');
			return false;
		}
		return true;
	}

	set(key, value) {
		if (super.has(key)) {
			super.delete(key);
			this.#timestamps?.delete(key);
		} else if (this.maxSize > 0 && this.size >= this.maxSize) {
			const oldestKey = this.keys().next().value;
			if (oldestKey !== undefined) {
				this.#evict(oldestKey, 'MAX_SIZE_REACHED');
			}
		}

		this.#timestamps?.set(key, Date.now());
		return super.set(key, value);
	}

	get(key) {
		if (!this.has(key)) return undefined;

		const value = super.get(key);
		if (this.maxSize > 0) {
			super.delete(key);
			super.set(key, value);
		}

		return value;
	}

	peek(key) {
		if (!this.has(key)) return undefined;
		return super.get(key);
	}

	delete(key) {
		this.#timestamps?.delete(key);
		return super.delete(key);
	}

	clear() {
		this.#timestamps?.clear();
		super.clear();
	}

	destroy() {
		if (this.#sweepTimer) {
			clearInterval(this.#sweepTimer);
			this.#sweepTimer = null;
		}
		this.clear();
	}
}

class ManageCache {
	caches = new Map();

	createCache(name, options = {}) {
		const existing = this.caches.get(name);
		if (existing) return existing;

		const cache = new AdvMap({ ...options, name });
		this.caches.set(name, cache);
		return cache;
	}

	getCache(name) {
		return this.caches.get(name);
	}

	deleteCache(name) {
		const cache = this.caches.get(name);
		if (!cache) return false;
		cache.destroy();
		return this.caches.delete(name);
	}

	clearAllCaches() {
		let total = 0;
		for (const cache of this.caches.values()) {
			total += cache.size;
			cache.clear();
		}

		log.success(`Cleared total ${total} items across all caches`);
	}

	destroyAll() {
		for (const cache of this.caches.values()) {
			cache.destroy();
		}
		this.caches.clear();
	}

	getStats() {
		const stats = {};
		for (const [name, cache] of this.caches.entries()) {
			stats[name] = {
				size: cache.size,
				maxSize: cache.maxSize || 'Unlimited',
				ttl: cache.ttl || 'No expiration',
			};
		}
		return stats;
	}
}

export const GlobCache = new ManageCache();
