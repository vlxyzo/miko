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

export class TimeUtil {
	static timeFormatter = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
	});

	static dateFormatter = new Intl.DateTimeFormat('id-ID', {
		timeZone: 'Asia/Jakarta',
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric',
	});

	static hourFormatter = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Jakarta',
		hour: 'numeric',
		hourCycle: 'h23',
	});

	static #parseDate(date) {
		if (date == null) return new Date();
		const parsed = date instanceof Date ? date : new Date(date);
		return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
	}

	static formatDate(date = new Date()) {
		return this.dateFormatter.format(this.#parseDate(date));
	}

	static formatTime(format = 'HH:mm', date = new Date()) {
		const parts = this.timeFormatter.formatToParts(this.#parseDate(date));
		const partMap = {};

		for (const part of parts) {
			if (part.type !== 'literal') {
				partMap[part.type] = part.value;
			}
		}

		const hourNum = parseInt(partMap.hour || '0', 10);
		const ampm = hourNum >= 12 ? 'PM' : 'AM';
		const hour12 = (hourNum % 12 || 12).toString().padStart(2, '0');

		const tokens = {
			YYYY: partMap.year || '0000',
			MM: partMap.month || '00',
			DD: partMap.day || '00',
			HH: partMap.hour || '00',
			hh: hour12,
			mm: partMap.minute || '00',
			ss: partMap.second || '00',
			A: ampm,
		};

		return format.replace(/YYYY|MM|DD|HH|hh|mm|ss|A/g, token => tokens[token]);
	}

	static clockString(ms) {
		if (!ms || ms < 0) return '0 seconds';

		const d = Math.floor(ms / (24 * 60 * 60 * 1000));
		const h = Math.floor(ms / (60 * 60 * 1000)) % 24;
		const m = Math.floor(ms / (60 * 1000)) % 60;
		const s = Math.floor(ms / 1000) % 60;
		const formatUnit = (val, unit) => (val > 0 ? `${val} ${unit}${val > 1 ? 's' : ''}` : '');

		return (
			[
				formatUnit(d, 'day'),
				formatUnit(h, 'hour'),
				formatUnit(m, 'minute'),
				formatUnit(s, 'second'),
			]
				.filter(Boolean)
				.join(' ')
				.trim() || '0 seconds'
		);
	}

	static getGreeting(date = new Date()) {
		const hour = parseInt(this.hourFormatter.format(this.#parseDate(date)), 10);

		if (hour >= 4 && hour < 12) return '🌅 Good morning';
		if (hour >= 12 && hour < 17) return '☀️ Good afternoon';
		if (hour >= 17 && hour < 21) return '🌙 Good evening';
		return '🌃 Good night';
	}
}
