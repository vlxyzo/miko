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

import { log } from '#lib/logger.js';

export class AdvMap extends Map {
	maxSize;
	ttl;
	name;
	sweepInterval;
	onEvict;

	timestamps = new Map();
	_sweepTimer = null;

	constructor(options = {}) {
		super();
		this.maxSize = options.maxSize ?? 0;
		this.ttl = options.ttl ?? 0;
		this.name = options.name ?? 'UnnamedCache';
		this.sweepInterval = options.sweepInterval ?? 60_000;
		this.onEvict = options.onEvict ?? null;

		if (this.ttl > 0) {
			this._startSweeper();
		}
	}

	set(key, value) {
		if (this.has(key)) {
			super.delete(key);
			this.timestamps.delete(key);
		} else if (this.maxSize > 0 && this.size >= this.maxSize) {
			const oldestKey = this.keys().next().value;
			if (oldestKey !== undefined) {
				this._evict(oldestKey, 'MAX_SIZE_REACHED');
			}
		}

		this.timestamps.set(key, Date.now());
		return super.set(key, value);
	}

	get(key) {
		if (!this.has(key)) return undefined;

		if (this.ttl > 0) {
			const timeAdded = this.timestamps.get(key);
			if (timeAdded !== undefined && Date.now() - timeAdded > this.ttl) {
				this._evict(key, 'TTL_EXPIRED');
				return undefined;
			}
		}

		const value = super.get(key);
		if (value !== undefined) {
			super.delete(key);
			super.set(key, value);
		}

		return value;
	}

	delete(key) {
		this.timestamps.delete(key);
		return super.delete(key);
	}

	clear() {
		this.timestamps.clear();
		super.clear();
	}

	destroy() {
		if (this._sweepTimer) {
			clearInterval(this._sweepTimer);
			this._sweepTimer = null;
		}
		this.clear();
	}

	_evict(key, reason = 'MANUAL') {
		const value = super.get(key);
		this.delete(key);

		if (value !== undefined && typeof this.onEvict === 'function') {
			try {
				this.onEvict(key, value, reason);
			} catch (e) {
				const errorMsg = e instanceof Error ? e.message : String(e);
				log.error(`Cache ${this.name} got error during eviction callback: ${errorMsg}`);
			}
		}
	}

	_startSweeper() {
		this._sweepTimer = setInterval(() => {
			const now = Date.now();
			let sweepCount = 0;
			for (const [key, timeAdded] of this.timestamps.entries()) {
				if (now - timeAdded > this.ttl) {
					this._evict(key, 'SWEEP_CLEANUP');
					sweepCount++;
				}
			}

			if (sweepCount > 0) {
				log.debug(`Cache ${this.name} has swept ${sweepCount} expired items`);
			}
		}, this.sweepInterval).unref();
	}
}

class ManageCache {
	caches = new Map();

	createCache(name, options = {}) {
		if (this.caches.has(name)) {
			return this.caches.get(name);
		}
		options.name = name;
		const cache = new AdvMap(options);
		this.caches.set(name, cache);
		return cache;
	}

	getCache(name) {
		return this.caches.get(name);
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
