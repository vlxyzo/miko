import { Fmt, formatTemplate } from '#lib/message.js';
import { TimeUtil } from '#lib/times.js';
import { bot, message, setting } from '../../config.js';

export default {
	name: 'menu',
	command: ['menu', 'help'],
	alias: ['start'],
	description: 'Display all available commands grouped by category',
	cooldown: '5s',
	async exec(ctx, { prefix, categories, user, isOwner, reply }) {
		const greetings = TimeUtil.getGreeting();
		const userName = ctx.from.first_name || 'User';

		const header = formatTemplate(message.start, {
			user: userName,
			greetings,
			bot: bot.name,
		});

		const limitText = isOwner
			? 'Unlimited [Owner]'
			: `${user?.user_limit ?? setting.limit}/${setting.limit}`;

		const sections = [
			header,
			'',
			`📊 ${Fmt.bold('Daily Limit:')} ${Fmt.code(limitText)}`,
			`🗂️ ${Fmt.bold('Command List:')}`,
		];

		for (const [category, pluginList] of categories.entries()) {
			const visiblePlugins = pluginList.filter(p => !(p.ownerOnly || p.owner) || isOwner);
			if (visiblePlugins.length === 0) continue;

			const title = category.charAt(0).toUpperCase() + category.slice(1);
			sections.push(`\n▸ ${Fmt.bold(title)}`);

			for (const plugin of visiblePlugins) {
				const primaryCmd = plugin.command[0];
				if (!primaryCmd) continue;
				const example = plugin.example ? ` ${plugin.example}` : '';
				sections.push(
					`  • ${Fmt.code(`${prefix}${primaryCmd}${example}`)} — ${Fmt.escape(plugin.description || '-')}`
				);
			}
		}

		await reply(sections.join('\n'));
	},
};
