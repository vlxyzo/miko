/**
 * @project   miko v0.0.1-alpha
 * @author    Velix <https://github.com/vlxyzo>
 * @license   gpl-3.0-or-later
 * @source    https://github.com/vlxyzo/miko
 */

import { format, styleText } from 'node:util';
import { TimeUtil } from './times.js';

const timestamp = () => styleText(['gray'], TimeUtil.formatTime('HH:mm:ss'));

const formatArgs = (...args) =>
	args
		.map(value => {
			if (value instanceof Error) return value.stack || value.message;
			if (typeof value === 'object' && value !== null) return format('%O', value);
			return String(value ?? '');
		})
		.join(' ');

export const log = {
	error: (...args) =>
		console.error(`${timestamp()} ${styleText(['white', 'bgRed', 'bold'], `⟨X⟩ ${formatArgs(...args)}`)}`),
	warning: (...args) =>
		console.warn(`${timestamp()} ${styleText(['yellow', 'bold'], '⟨!⟩')} ${formatArgs(...args)}`),
	success: (...args) =>
		console.log(`${timestamp()} ${styleText(['green', 'bold'], '⟨✓⟩')} ${formatArgs(...args)}`),
	debug: (...args) =>
		console.log(`${timestamp()} ${styleText(['gray', 'bold'], '⟨#⟩')} ${formatArgs(...args)}`),
	loading: (...args) =>
		console.log(styleText(['gray', 'italic'], formatArgs(...args))),
	info: (...args) =>
		console.info(`${timestamp()} ${styleText(['magenta', 'bold'], '⟨•⟩')} ${formatArgs(...args)}`),
	miko: (me, ...message) =>
		console.log(`${timestamp()} ${styleText(['blue', 'bold'], `⟨=⟩ ${formatArgs(me)}`)} ${formatArgs(...message)}`),
	user: (sender, ...command) =>
		console.log(`${timestamp()} ${styleText(['bgBlue', 'white', 'bold'], `⟨>⟩ ${formatArgs(sender)}`)} executed ${formatArgs(...command)}`),
};
