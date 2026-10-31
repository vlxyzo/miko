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
const retry_stats = new Set([403, 429, 503]);
const default_timeout = 15_000;
const desktop_ua = [
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
];
const mobile_ua = [
	'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.108 Mobile/15E148 Safari/604.1',
];
export function randomizeUA(isMobile = false) {
	const list = isMobile ? mobile_ua : desktop_ua;
	if (list.length === 0) {
		log.error('No user agent strings are configured in fetcher');
		return 'Mozilla/5.0 (compatible; Bot/1.0)';
	}
	return list[Math.floor(Math.random() * list.length)];
}
function getErrorMessage(error) {
	if (error instanceof Error) return error.message;
	return String(error ?? 'Unknown error');
}
function buildHeaders(mode, isMobile, customHeaders) {
	const headers = new Headers(customHeaders);
	if (!headers.has('User-Agent') && !headers.has('user-agent')) {
		headers.set('User-Agent', randomizeUA(isMobile));
	}
	if (mode === 'api') {
		if (!headers.has('Accept')) headers.set('Accept', 'application/json, text/plain, */*');
	} else {
		if (!headers.has('Accept'))
			headers.set(
				'Accept',
				'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
			);
		if (!headers.has('Accept-Language')) headers.set('Accept-Language', 'en-US,en;q=0.5');
		if (!headers.has('Sec-Fetch-Dest')) headers.set('Sec-Fetch-Dest', 'document');
		if (!headers.has('Sec-Fetch-Mode')) headers.set('Sec-Fetch-Mode', 'navigate');
		if (!headers.has('Sec-Fetch-Site')) headers.set('Sec-Fetch-Site', 'cross-site');
	}
	return headers;
}
export async function startFetch(url, options = {}) {
	const {
		timeout = default_timeout,
		signal: callerSignal,
		headers: customHeaders,
		mode = 'scraper',
		...fetchOptions
	} = options;
	const validTimeoutMs = Number.isFinite(timeout) && timeout > 0 ? timeout : default_timeout;
	const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
	const isUrlSearchParams =
		typeof URLSearchParams !== 'undefined' && fetchOptions.body instanceof URLSearchParams;
	const executeReq = async isMobileUA => {
		const finalHeaders = buildHeaders(mode, isMobileUA, customHeaders);
		if (isFormData) {
			finalHeaders.delete('sec-fetch-mode');
			finalHeaders.delete('sec-fetch-dest');
		}
		if (isUrlSearchParams && !finalHeaders.has('content-type')) {
			finalHeaders.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
		}
		const timeoutSignal = AbortSignal.timeout(validTimeoutMs);
		const combinedSignal = callerSignal
			? AbortSignal.any([timeoutSignal, callerSignal])
			: timeoutSignal;
		return fetch(url, {
			...fetchOptions,
			headers: finalHeaders,
			signal: combinedSignal,
		});
	};
	try {
		let response = await executeReq(false);
		if (retry_stats.has(response.status)) {
			// opt chaining, if exist - delia
			log.warning?.(
				`Desktop user agent got blocked with status ${response.status} at ${url.toString()}. Switching to mobile user agent...`
			);
			if (response.body) {
				await response.body.cancel().catch(() => {});
			}
			response = await executeReq(true);
		}
		if (!response.ok) {
			throw new Error(
				`HTTP Status ${response.status} [${response.statusText || 'Request failed'}]`
			);
		}
		return response;
	} catch (error) {
		const errObj = error;
		if (errObj.name === 'TimeoutError' || errObj.name === 'AbortError') {
			throw new Error(
				`Request Timeout. Target took more than ${validTimeoutMs / 1000}s to respond.`,
				{ cause: error }
			);
		}
		throw new Error(`Request failed: ${getErrorMessage(error)}`, { cause: error });
	}
}
// this have 2 mode ('scraper' or 'api') so u just add mode: 'string' - delia
