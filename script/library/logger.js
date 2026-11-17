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

import { styleText } from 'node:util';
import { TimeUtil } from './times.js';

const timestamp = () => styleText(['gray'], TimeUtil.formatTime('HH:mm:ss'));

const formatMessage = value => {
	if (value instanceof Error) {
		return value.stack || value.message;
	}
	return String(value ?? '');
};

export const log = {
	error: text =>
		console.error(`${timestamp()} ${styleText(['white', 'bgRed', 'bold'], `⟨X⟩ ${formatMessage(text)}`)}`),
	warning: text =>
		console.warn(`${timestamp()} ${styleText(['yellow', 'bold'], '⟨!⟩')} ${formatMessage(text)}`),
	success: text =>
		console.log(`${timestamp()} ${styleText(['green', 'bold'], '⟨✓⟩')} ${formatMessage(text)}`),
	debug: text =>
		console.log(`${timestamp()} ${styleText(['gray', 'bold'], '⟨#⟩')} ${formatMessage(text)}`),
	loading: text =>
		console.log(styleText(['gray', 'italic'], formatMessage(text))),
	info: text =>
		console.info(`${timestamp()} ${styleText(['magenta', 'bold'], '⟨•⟩')} ${formatMessage(text)}`),
	miko: (me, message) =>
		console.log(`${timestamp()} ${styleText(['blue', 'bold'], `⟨=⟩ ${formatMessage(me)}`)} ${formatMessage(message)}`),
	user: (sender, command) =>
		console.log(`${timestamp()} ${styleText(['bgBlue', 'white', 'bold'], `⟨>⟩ ${formatMessage(sender)}`)} executed ${formatMessage(command)}`),
};
