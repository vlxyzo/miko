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

import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { log } from '#lib/logger.js';

function checkSystemDeps() {
	const nodeMajor = Number(process.versions.node.split('.')[0]);
	const npmCheck = spawnSync('npm', ['-v'], { encoding: 'utf8', shell: true });
	const npmMajor = Number((npmCheck.stdout || '0').trim().split('.')[0]);
	const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });

	if (nodeMajor < 24) {
		log.error(
			`Node.js v24+ is required (detected v${process.versions.node}). Run: npm run setup`
		);
		process.exit(1);
	}

	if (npmCheck.status !== 0 || npmMajor < 11) {
		log.error(
			`npm v11+ is required (detected v${(npmCheck.stdout || 'NONE').trim()}). Run: npm run setup`
		);
		process.exit(1);
	}

	if (ffmpegCheck.status !== 0) {
		log.error('FFmpeg is not installed globally! Run: npm run setup');
		process.exit(1);
	}
}

checkSystemDeps();

const engine = join(import.meta.dirname, './script/main.js');

class ProcessManager {
	entryPath;
	maxCrashes = 5;
	crashMs = 60_000;
	garbageMs = 15 * 60 * 1000;
	child = null;
	crashCount = 0;
	lastCrash = Date.now();
	gcTimer;
	fcKillTime;
	isShutdown = false;
	isRestart = false;
	constructor(entryPath) {
		this.entryPath = entryPath;
		this.sysSignal();
	}

	start() {
		this.isRestart = false;

		const args = ['--expose-gc', this.entryPath, ...process.argv.slice(2)];
		this.child = spawn(process.execPath, args, {
			stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
		});
		this.childListen();
		this.startGc();
	}

	ellRestart() {
		this.isRestart = true;

		if (this.child) {
			log.loading('Let me kill the old me first before we start again...');
			this.child.kill();
		} else {
			this.start();
		}
	}

	ellExit(code = 0) {
		this.stopGc();

		if (this.fcKillTime) {
			clearTimeout(this.fcKillTime);
		}

		process.exit(code);
	}

	ipcMessage(message) {
		switch (message) {
			case 'reset':
				log.loading('You called for a restart? On it...');
				this.ellRestart();
				break;
			case 'uptime':
				if (this.child?.connected) {
					this.child.send(process.uptime());
				}
				break;
			case 'exit':
				this.ellExit(0);
				break;
		}
	}

	async graceShutd(signal) {
		if (this.isShutdown) return;

		this.isShutdown = true;
		log.warning(`${signal} triggerred. Let me sleep for now...`);
		this.stopGc();

		if (!this.child) {
			process.exit(0);
		}

		this.child.kill(signal);
		this.fcKillTime = setTimeout(() => {
			log.error('Child process is being stubborn. No more mercy, forcing shutdown now...');
			process.exit(1);
		}, 8000);
		this.child.once('exit', () => {
			this.ellExit(0);
		});
	}

	childListen() {
		if (!this.child) return;

		this.child.on('message', data => this.ipcMessage(data));
		this.child.on('exit', (code, signal) => {
			this.child = null;

			if (this.isShutdown) {
				log.success(
					'Process stopped manually. Thank you for using miko! See you again soon! ^^'
				);
				this.ellExit(0);
			}

			if (this.isRestart) {
				log.loading('Old me is gone. Starting a fresh one...');
				this.start();
				return;
			}

			if (code !== 0) {
				this.crashHandle(code, signal);
			} else {
				log.success(
					'Process exited cleanly. Thank you for using miko! See you again soon! ^^'
				);

				this.ellExit(0);
			}
		});
	}

	crashHandle(code, signal) {
		log.error(`Ouch! Crashed with exit code ${code || signal}. That hurt!`);
		const now = Date.now();

		if (now - this.lastCrash > this.crashMs) {
			this.crashCount = 0;
		}

		this.crashCount++;
		this.lastCrash = now;

		if (this.crashCount >= this.maxCrashes) {
			log.error(
				`Crashed ${this.crashCount} times in 1m. I can't go on like this, it hurts! Stopping auto restart...`
			);

			log.info(
				'I need your help! Please open an issue here: https://github.com/vlxyzo/miko/issues'
			);

			this.ellExit(1);
		}

		log.loading('Let me try again in 3s...');
		setTimeout(() => this.start(), 3000);
	}

	startGc() {
		this.stopGc();

		this.gcTimer = setInterval(() => {
			if (this.child?.connected) {
				const gcMsg = 'gc';
				this.child.send(gcMsg);
			}
		}, this.garbageMs);
	}

	stopGc() {
		if (this.gcTimer) {
			clearInterval(this.gcTimer);
			this.gcTimer = undefined;
		}
	}

	sysSignal() {
		const handlesignal = signal => {
			this.graceShutd(signal).catch(err => {
				log.error(`Hehe, i tried to be nicely but i messed up: ${String(err)}`);
				process.exit(1);
			});
		};

		process.once('SIGINT', () => handlesignal('SIGINT'));
		process.once('SIGTERM', () => handlesignal('SIGTERM'));
	}
}

const stacy = new ProcessManager(engine);
/* ==> */ stacy.start();
