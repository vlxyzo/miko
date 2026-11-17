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
import { pathToFileURL } from 'node:url';
import { log } from '#lib/logger.js';

export const pluginStore = {
	commands: new Map(),
	categories: new Map(),
	listeners: [],
};

async function scanPluginFiles(baseDir, currentDir = baseDir) {
	const entries = await fs.readdir(currentDir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;

		const fullPath = path.join(currentDir, entry.name);

		if (entry.isDirectory()) {
			const nested = await scanPluginFiles(baseDir, fullPath);
			files.push(...nested);
		} else if (entry.isFile() && entry.name.endsWith('.js')) {
			const relPath = path.relative(baseDir, fullPath);
			const parts = relPath.split(path.sep);
			const category = parts.length > 1 ? parts[0].toLowerCase() : 'general';

			files.push({ fullPath, category, fileName: entry.name });
		}
	}

	return files;
}

export async function loadPlugins(pluginDir) {
	await fs.mkdir(pluginDir, { recursive: true });

	pluginStore.commands.clear();
	pluginStore.categories.clear();
	pluginStore.listeners.length = 0;

	const files = await scanPluginFiles(pluginDir);
	let loadedCount = 0;

	for (const { fullPath, category, fileName } of files) {
		try {
			const fileUrl = `${pathToFileURL(fullPath).href}?t=${Date.now()}`;
			const mod = await import(fileUrl);
			const plugin = mod.default;

			if (!plugin || typeof plugin !== 'object') {
				log.warning(`Plugin ${category}/${fileName} skip (doesn't have export default)`);
				continue;
			}

			if (plugin.disabled) continue;

			const primaryName = (plugin.name || path.parse(fileName).name).toLowerCase();
			const aliases = Array.isArray(plugin.alias)
				? plugin.alias.map(a => String(a).toLowerCase())
				: [];

			const normalizedPlugin = {
				name: primaryName,
				alias: aliases,
				category: (plugin.category || category).toLowerCase(),
				desc: plugin.desc || 'Unknown',
				usage: plugin.usage || `/${primaryName}`,
				limit: Number(plugin.limit ?? 0),
				cooldown: Number(plugin.cooldown ?? 2),
				register: plugin.register !== false,
				ownerOnly: Boolean(plugin.ownerOnly),
				groupOnly: Boolean(plugin.groupOnly),
				privateOnly: Boolean(plugin.privateOnly),
				exec: typeof plugin.exec === 'function' ? plugin.exec : null,
				onMessage: typeof plugin.onMessage === 'function' ? plugin.onMessage : null,
			};

			if (!pluginStore.categories.has(normalizedPlugin.category)) {
				pluginStore.categories.set(normalizedPlugin.category, new Map());
			}

			pluginStore.categories
				.get(normalizedPlugin.category)
				.set(primaryName, normalizedPlugin);

			if (normalizedPlugin.exec) {
				for (const trigger of [primaryName, ...aliases]) {
					if (pluginStore.commands.has(trigger)) {
						log.warning(
							`Conflict command ${trigger} in ${normalizedPlugin.category}/${fileName}`
						);
					}

					pluginStore.commands.set(trigger, normalizedPlugin);
				}
			}

			if (normalizedPlugin.onMessage) {
				pluginStore.listeners.push(normalizedPlugin);
			}

			loadedCount++;
		} catch (err) {
			log.error(`Failed load plugin ${category}/${fileName}: ${err.message}`);
		}
	}

	log.success(
		`Loaded ${loadedCount} plugins across ${pluginStore.categories.size} categories (${Array.from(pluginStore.categories.keys()).join(', ') || 'none'}).`
	);

	return pluginStore;
}
