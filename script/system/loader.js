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

import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { log } from '#lib/logger.js';
const pluginDir = join(import.meta.dirname, '../plugin');
export const plugins = new Map();
export async function loadPlugins() {
	if (!existsSync(pluginDir)) {
		mkdirSync(pluginDir, { recursive: true });
		log.info(`Created plugin directory at ${pluginDir}`);
	}
	plugins.clear();
	const files = readdirSync(pluginDir, { recursive: true })
		.filter(f => typeof f === 'string')
		.filter(f => f.endsWith('.js') || f.endsWith('.ts'))
		.filter(f => !f.endsWith('.d.js'));
	let loadedCount = 0;
	for (const file of files) {
		const filePath = join(pluginDir, file);
		const pluginKey = file.replace(/\\/g, '/');
		try {
			const fileUrl = pathToFileURL(filePath);
			fileUrl.searchParams.set('v', Date.now().toString());
			const module = await import(fileUrl.href);
			const plugin = module.handler || module.default;
			if (plugin) {
				plugins.set(pluginKey, plugin);
				loadedCount++;
			} else {
				log.warning(
					`Plugin ${pluginKey} skipped. Missing export handler or default property`
				);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			log.error(`Failed to load plugin ${pluginKey}: ${errorMessage}`);
		}
	}
	log.success(`Successfully loaded ${loadedCount} plugins`);
}
