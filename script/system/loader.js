/**
 * @project   miko v0.0.1-alpha
 * @author    Velix <https://github.com/vlxyzo>
 * @license   gpl-3.0-or-later
 * @source    https://github.com/vlxyzo/miko
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { log } from '#lib/logger.js';

const PLUGIN_DIR = path.resolve(import.meta.dirname, '../plugin');
const VALID_EXTENSIONS = new Set(['.js', '.mjs']);

class PluginStore {
	commands = new Map();
	plugins = new Map();
	categories = new Map();
	regexPlugins = [];
	hookPlugins = [];
}

export const store = new PluginStore();

function normalizeList(value) {
	if (!value) return [];
	const arr = Array.isArray(value) ? value : [value];
	return arr
		.filter(item => typeof item === 'string')
		.map(item => item.toLowerCase().trim())
		.filter(Boolean);
}

async function scanDirectory(dirPath, files = []) {
	let entries;
	try {
		entries = await fs.readdir(dirPath, { withFileTypes: true });
	} catch (err) {
		if (err.code === 'ENOENT') {
			await fs.mkdir(dirPath, { recursive: true });
			return files;
		}
		throw err;
	}

	for (const entry of entries) {
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			await scanDirectory(fullPath, files);
		} else if (entry.isFile() && VALID_EXTENSIONS.has(path.extname(entry.name))) {
			files.push(fullPath);
		}
	}

	return files;
}

function resolveCategory(filePath) {
	const relative = path.relative(PLUGIN_DIR, filePath);
	const segments = relative.split(path.sep);
	return segments.length > 1 ? segments[0].toLowerCase().trim() : 'general';
}

export async function loadPlugins({ bustCache = false } = {}) {
	const files = await scanDirectory(PLUGIN_DIR);
	const nextStore = new PluginStore();
	const versionTag = bustCache ? `?v=${Date.now()}` : '';

	for (const filePath of files) {
		const category = resolveCategory(filePath);
		const relativePath = path.relative(PLUGIN_DIR, filePath);

		try {
			const fileUrl = `${pathToFileURL(filePath).href}${versionTag}`;
			const mod = await import(fileUrl);
			const raw = mod.default ?? mod;

			if (!raw || typeof raw !== 'object') {
				log.warning(`Skipping invalid plugin export: ${relativePath}`);
				continue;
			}

			if (raw.disabled) continue;

			const execFn = raw.exec ?? raw.run ?? raw.execute;
			const hasHook = typeof raw.before === 'function' || typeof raw.all === 'function';

			if (typeof execFn !== 'function' && !hasHook) {
				log.warning(`Plugin ${relativePath} has no exec/run/hook function, skipped`);
				continue;
			}

			const rawCommands = Array.isArray(raw.command)
				? raw.command
				: raw.command
					? [raw.command]
					: [];

			const stringCommands = normalizeList(
				rawCommands.filter(cmd => typeof cmd === 'string')
			);
			const regexCommands = rawCommands.filter(cmd => cmd instanceof RegExp);
			const aliases = normalizeList(raw.alias);
			const allTriggers = Array.from(new Set([...stringCommands, ...aliases]));

			const primaryName =
				(typeof raw.name === 'string' && raw.name.trim().toLowerCase()) ||
				stringCommands[0] ||
				path.basename(filePath, path.extname(filePath)).toLowerCase();

			const plugin = Object.freeze({
				...raw,
				id: relativePath,
				filePath,
				category,
				name: primaryName,
				command: stringCommands,
				alias: aliases,
				regex: regexCommands,
				exec: typeof execFn === 'function' ? execFn.bind(raw) : null,
				before: typeof raw.before === 'function' ? raw.before.bind(raw) : null,
				all: typeof raw.all === 'function' ? raw.all.bind(raw) : null,
			});

			nextStore.plugins.set(relativePath, plugin);

			if (!nextStore.categories.has(category)) {
				nextStore.categories.set(category, []);
			}
			nextStore.categories.get(category).push(plugin);

			for (const trigger of allTriggers) {
				if (nextStore.commands.has(trigger)) {
					const conflict = nextStore.commands.get(trigger);
					log.warning(
						`Command collision ${trigger} in ${relativePath} already registered by ${conflict.id}`
					);
					continue;
				}
				nextStore.commands.set(trigger, plugin);
			}

			if (regexCommands.length > 0) {
				nextStore.regexPlugins.push(plugin);
			}

			if (hasHook) {
				nextStore.hookPlugins.push(plugin);
			}
		} catch (err) {
			log.error(`Failed loading plugin ${relativePath}:`, err);
		}
	}

	for (const [, list] of nextStore.categories) {
		list.sort((a, b) => a.name.localeCompare(b.name));
	}

	store.commands = nextStore.commands;
	store.plugins = nextStore.plugins;
	store.categories = nextStore.categories;
	store.regexPlugins = nextStore.regexPlugins;
	store.hookPlugins = nextStore.hookPlugins;

	log.success(
		`Loaded ${store.plugins.size} plugins. Total ${store.commands.size} commands across ${store.categories.size} categories`
	);

	return store;
}

export async function reloadPlugins() {
	return loadPlugins({ bustCache: true });
}
