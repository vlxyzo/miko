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

const tm = () => styleText(['gray'], `${TimeUtil.formatTime('HH:mm:ss')}`);

export const log = {
	error: text => console.error(`${tm()} ${styleText(['white', 'bgRed', 'bold'], `⟨X⟩ ${text}`)}`),
	warning: text => console.warn(`${tm()} ${styleText(['yellow', 'bold'], '⟨!⟩')} ${text}`),
	success: text => console.log(`${tm()} ${styleText(['green', 'bold'], '⟨✓⟩')} ${text}`),
	debug: text => console.log(`${tm()} ${styleText(['gray', 'bold'], '⟨#⟩')} ${text}`),
	loading: text => console.log(`${styleText(['gray', 'italic'], text)}`),
	info: text => console.info(`${tm()} ${styleText(['magenta', 'bold'], '⟨•⟩')} ${text}`),
	miko: (me, message) =>
		console.log(`${tm()} ${styleText(['blue', 'bold'], `⟨=⟩ ${me}`)} ${message}`),
	user: (sender, command) =>
		console.log(
			`${tm()} ${styleText(['bgBlue', 'white', 'bold'], `⟨>⟩ ${sender}`)} executed ${command}`
		),
};
