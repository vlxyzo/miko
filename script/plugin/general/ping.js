import { Fmt } from '#lib/message.js';
import { TimeUtil } from '#lib/times.js';

export default {
	name: 'ping',
	command: ['ping', 'p'],
	alias: ['speed', 'status'],
	description: 'Check response latency and uptime',
	cooldown: '5s',
	async exec(ctx, { reply }) {
		const start = performance.now();
		const sent = await reply(message.loading);
		const latency = Math.round(performance.now() - start);
		const uptime = TimeUtil.clockString(process.uptime() * 1000);

		const text = [
			`🏓 ${Fmt.bold('Pong!')}`,
			`• ${Fmt.bold('Latency:')} ${Fmt.code(`${latency}ms`)}`,
			`• ${Fmt.bold('Uptime:')} ${Fmt.code(uptime)}`,
		].join('\n');

		await ctx.telegram
			.editMessageText(ctx.chat.id, sent.message_id, undefined, text, {
				parse_mode: 'HTML',
			})
			.catch(() => {});
	},
};
