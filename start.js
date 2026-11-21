/**
 * @project   miko v0.0.1-alpha
 * @author    Velix <https://github.com/vlxyzo>
 * @license   gpl-3.0-or-later
 * @source    https://github.com/vlxyzo/miko
 */

import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { log } from '#lib/logger.js';

const engine = join(import.meta.dirname, './script/main.js');

function sysDeps() {
	const nodeMajor = Number(process.versions.node.split('.')[0]);
	const npmCheck = spawnSync('npm', ['-v'], {
		encoding: 'utf8',
		shell: process.platform === 'win32',
	});

	const npmMajor = Number((npmCheck.stdout || '0').trim().split('.')[0]);
	const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });

	if (nodeMajor < 24) {
		log.error(`miko needs Node.js v24+ (yours v${process.versions.node}). Run: npm run setup`);
		process.exit(1);
	}

	if (npmCheck.status !== 0 || npmMajor < 11) {
		log.error(
			`miko needs npm v11+ (yours v${(npmCheck.stdout || 'none').trim()}). Run: npm run setup`
		);
		process.exit(1);
	}

	if (ffmpegCheck.status !== 0) {
		log.error('miko needs FFmpeg, but it is not installed globally. Run: npm run setup');
		process.exit(1);
	}
}

sysDeps();

class ProcessManager {
	entryPath;
	maxCrashes = 5;
	crashWindowMs = 60_000;
	gcIntervalMs = 15 * 60 * 1000;
	child = null;
	crashCount = 0;
	lastCrash = Date.now();
	gcTimer;
	forceKillTimer;
	isShutdown = false;
	isRestart = false;

	constructor(entryPath) {
		this.entryPath = entryPath;
		this.bindSystemSignals();
	}

	start() {
		this.isRestart = false;

		const args = ['--expose-gc', this.entryPath, ...process.argv.slice(2)];
		this.child = spawn(process.execPath, args, {
			stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
		});

		this.bindChildEvents();
		this.startGc();
	}

	restart() {
		this.isRestart = true;

		if (this.child) {
			log.loading('Stopping current process before restarting...');
			this.child.kill();
		} else {
			this.start();
		}
	}

	exit(code = 0) {
		this.stopGc();

		if (this.forceKillTimer) {
			clearTimeout(this.forceKillTimer);
			this.forceKillTimer = undefined;
		}

		process.exit(code);
	}

	handleIpcMessage(message) {
		switch (message) {
			case 'reset':
				log.loading('Restart requested. Reloading...');
				this.restart();
				break;
			case 'uptime':
				if (this.child?.connected) {
					this.child.send(process.uptime());
				}
				break;
			case 'exit':
				this.exit(0);
				break;
		}
	}

	async gracefulShutdown(signal) {
		if (this.isShutdown) return;
		this.isShutdown = true;

		log.warning(`${signal} triggered. Shutting down gracefully...`);
		this.stopGc();

		if (!this.child) {
			this.exit(0);
		}

		this.child.kill(signal);

		this.forceKillTimer = setTimeout(() => {
			log.error('Child process did not exit in time. Forcing shutdown...');
			this.child?.kill('SIGKILL');
			this.exit(1);
		}, 8000);
	}

	bindChildEvents() {
		if (!this.child) return;
		this.child.on('message', data => this.handleIpcMessage(data));

		this.child.on('exit', (code, signal) => {
			this.child = null;

			if (this.isShutdown) {
				log.success(
					'Process stopped manually. Thanks for using miko! See you again soon! ^^'
				);
				this.exit(0);
			}

			if (this.isRestart) {
				log.loading('Previous process stopped. Starting a fresh instance...');
				this.start();
				return;
			}

			if (code !== 0) {
				this.handleCrash(code, signal);
			} else {
				log.success(
					'Process exited cleanly. Thanks for using miko! See you again soon! ^^'
				);
				this.exit(0);
			}
		});
	}

	handleCrash(code, signal) {
		log.error(`Crashed with exit code ${code ?? signal}.`);
		const now = Date.now();

		if (now - this.lastCrash > this.crashWindowMs) {
			this.crashCount = 0;
		}

		this.crashCount++;
		this.lastCrash = now;

		if (this.crashCount >= this.maxCrashes) {
			log.error(`Crashed ${this.crashCount} times within 1 minute. Stopping auto-restart`);
			log.info('Please report this issue at: https://github.com/vlxyzo/miko/issues');
			this.exit(1);
			return;
		}

		log.loading('Restarting in 3s...');
		setTimeout(() => this.start(), 3000);
	}

	startGc() {
		this.stopGc();

		this.gcTimer = setInterval(() => {
			if (this.child?.connected) {
				this.child.send('gc');
			}
		}, this.gcIntervalMs);
	}

	stopGc() {
		if (this.gcTimer) {
			clearInterval(this.gcTimer);
			this.gcTimer = undefined;
		}
	}

	bindSystemSignals() {
		const onSignal = signal => {
			this.gracefulShutdown(signal).catch(err => {
				log.error(`Shutdown error: ${String(err)}`);
				process.exit(1);
			});
		};

		process.once('SIGINT', () => onSignal('SIGINT'));
		process.once('SIGTERM', () => onSignal('SIGTERM'));
	}
}

const manager = new ProcessManager(engine);
manager.start();
// => ./script/main.js
