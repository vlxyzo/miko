import { Fmt } from '#lib/message.js';
import { TimeUtil } from '#lib/times.js';
import { awayCooldown } from '#lib/utils.js';
import { getOwnerAway, setOwnerAway } from '#sys/database.js';

const OFF_KEYWORDS = new Set(['off', 'disable', 'false', '0', 'back', 'kembali']);

export default {
	name: 'away',
	command: ['away', 'back'],
	alias: ['afk'],
	description: 'Toggle owner away status with an optional reason',
	example: '[reason | off]',
	ownerOnly: true,
	cooldown: 0,
	async exec(ctx, { command, text, reply }) {
		const current = getOwnerAway();
		const normalizedArg = text.trim().toLowerCase();
		const wantsOff = command === 'back' || OFF_KEYWORDS.has(normalizedArg);

		if (wantsOff || (current.away && !text.trim())) {
			if (!current.away) {
				return reply(`ℹ️ ${Fmt.bold('Away mode')} is already inactive.`);
			}

			const durationText = current.since
				? TimeUtil.clockString(Date.now() - new Date(current.since).getTime())
				: null;

			setOwnerAway(false);
			awayCooldown.clear();

			const lines = [
				`☀️ ${Fmt.bold('Welcome Back!')}`,
				`Away mode has been turned ${Fmt.bold('off')}.`,
			];

			if (current.reason) {
				lines.push(`• ${Fmt.bold('Previous Reason:')} ${Fmt.code(current.reason)}`);
			}

			if (durationText) {
				lines.push(`• ${Fmt.bold('Away Duration:')} ${Fmt.code(durationText)}`);
			}

			return reply(lines.join('\n'));
		}

		const reason = text.trim() || 'Busy right now';
		const isUpdating = current.away;

		setOwnerAway(true, reason);
		awayCooldown.clear();

		const updated = getOwnerAway();
		const sinceFormatted = updated.since
			? `${TimeUtil.formatDate(updated.since)} (${TimeUtil.formatTime('HH:mm', updated.since)} WIB)`
			: 'Just now';

		const lines = [
			isUpdating
				? `🔄 ${Fmt.bold('Away Reason Updated')}`
				: `🌙 ${Fmt.bold('Away Mode Activated')}`,
			'',
			`📝 ${Fmt.bold('Reason:')} ${Fmt.code(updated.reason || reason)}`,
			`🗓️ ${Fmt.bold('Since:')} ${Fmt.code(sinceFormatted)}`,
			'',
			`💡 ${Fmt.italic('Type /away off or /back when you return.')}`,
		];

		return reply(lines.join('\n'));
	},
};
