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

	static formatDate(date = new Date()) {
		const d = new Date(date);
		const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
		return this.dateFormatter.format(validDate);
	}

	static formatTime(format = 'HH:mm', date = new Date()) {
		const d = new Date(date);
		const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
		const parts = this.timeFormatter.formatToParts(validDate);
		const p = {};
		for (const part of parts) {
			if (part.type !== 'literal') {
				p[part.type] = part.value;
			}
		}

		const hourNum = parseInt(p.hour || '0', 10);
		const ampm = hourNum >= 12 ? 'PM' : 'AM';
		const hour12 = hourNum % 12 || 12;
		const hour12Str = hour12.toString().padStart(2, '0');
		return format
			.replace('DD', p.day || '00')
			.replace('MM', p.month || '00')
			.replace('YYYY', p.year || '0000')
			.replace('HH', p.hour || '00')
			.replace('hh', hour12Str)
			.replace('mm', p.minute || '00')
			.replace('ss', p.second || '00')
			.replace('A', ampm);
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
		const d = new Date(date);
		const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
		const hourStr = this.hourFormatter.format(validDate);
		const hour = parseInt(hourStr, 10);
		if (hour >= 4 && hour < 12) {
			return 'Good morning 🌅';
		}
		if (hour >= 12 && hour < 17) {
			return 'Good afternoon ☀️';
		}
		if (hour >= 17 && hour < 21) {
			return 'Good evening 🌙';
		}
		return 'Good night 🌃';
	}
}
