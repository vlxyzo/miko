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

function levenshteinDistance(strA, strB) {
	if (strA === strB) return 0;
	if (!strA.length) return strB.length;
	if (!strB.length) return strA.length;

	const [a, b] = strA.length >= strB.length ? [strA, strB] : [strB, strA];

	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	let curr = new Array(b.length + 1);

	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(
				prev[j] + 1, // deletion
				curr[j - 1] + 1, // insertion
				prev[j - 1] + cost // substitution
			);
		}
		[prev, curr] = [curr, prev];
	}

	return prev[b.length];
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

	let bestMatch = null;
	let highestPercent = 0;
	const checkedPlugins = new Set();

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

	if (bestMatch && highestPercent >= threshold) {
		return {
			command: bestMatch,
			similarity: `${highestPercent}%`,
		};
	}

	return null;
}
