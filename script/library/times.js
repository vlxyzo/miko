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

	static dateFormatter = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Asia/Jakarta',
		weekday: 'long',
		day: '2-digit',
		month: 'long',
		year: 'numeric',
	});

	static dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Jakarta',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
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

	static #decomposeMs(ms) {
		const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
		return {
			d: Math.floor(totalSeconds / 86400),
			h: Math.floor(totalSeconds / 3600) % 24,
			m: Math.floor(totalSeconds / 60) % 60,
			s: totalSeconds % 60,
		};
	}

	static getDateKey(date = new Date()) {
		return this.dateKeyFormatter.format(this.#parseDate(date));
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

		const hour24 = partMap.hour || '00';
		const hourNum = parseInt(hour24, 10);

		return format.replace(/YYYY|MM|DD|HH|hh|mm|ss|A/g, token => {
			switch (token) {
				case 'YYYY':
					return partMap.year || '0000';
				case 'MM':
					return partMap.month || '00';
				case 'DD':
					return partMap.day || '00';
				case 'HH':
					return hour24;
				case 'hh':
					return String(hourNum % 12 || 12).padStart(2, '0');
				case 'mm':
					return partMap.minute || '00';
				case 'ss':
					return partMap.second || '00';
				case 'A':
					return hourNum >= 12 ? 'PM' : 'AM';
				default:
					return token;
			}
		});
	}

	static parseDuration(input, fallbackMs = 0) {
		if (input === undefined || input === null || input === '') return fallbackMs;

		if (typeof input === 'number') {
			if (!Number.isFinite(input) || input <= 0) return 0;
			return input < 1000 ? input * 1000 : input;
		}

		const match = String(input)
			.trim()
			.toLowerCase()
			.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/);
		if (!match) return fallbackMs;

		const value = Number(match[1]);
		if (!Number.isFinite(value) || value <= 0) return 0;

		switch (match[2]) {
			case 'ms':
				return Math.round(value);
			case 's':
				return Math.round(value * 1000);
			case 'm':
				return Math.round(value * 60_000);
			case 'h':
				return Math.round(value * 3_600_000);
			case 'd':
				return Math.round(value * 86_400_000);
			default:
				return value < 1000 ? Math.round(value * 1000) : Math.round(value);
		}
	}

	static shortClock(ms) {
		if (!ms || ms <= 0) return '1s';

		const { d, h, m, s } = this.#decomposeMs(ms);
		return (
			[d > 0 ? `${d}d` : '', h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : '', s > 0 ? `${s}s` : '']
				.filter(Boolean)
				.join(' ') || '1s'
		);
	}

	static clockString(ms) {
		if (!ms || ms <= 0) return '1 second';

		const { d, h, m, s } = this.#decomposeMs(ms);
		const formatUnit = (val, unit) => (val > 0 ? `${val} ${unit}${val > 1 ? 's' : ''}` : '');

		return (
			[
				formatUnit(d, 'day'),
				formatUnit(h, 'hour'),
				formatUnit(m, 'minute'),
				formatUnit(s, 'second'),
			]
				.filter(Boolean)
				.join(' ') || '1 second'
		);
	}

	static getGreeting(date = new Date()) {
		const hour = parseInt(this.hourFormatter.format(this.#parseDate(date)), 10);

		if (hour >= 4 && hour < 12) return 'Good morning 🌅';
		if (hour >= 12 && hour < 17) return 'Good afternoon ☀️';
		if (hour >= 17 && hour < 21) return 'Good evening 🌙';
		return 'Good night 🌃';
	}
}
