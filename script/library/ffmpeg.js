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

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const MIB = 1024 * 1024;
const SAFE_EXTENSION = /^[a-z0-9]{1,10}$/i;
const SAFE_BITRATE = /^\d{1,6}k?$/i;

function resolveLimit(value, fallback, name) {
	if (value === undefined) return fallback;
	if (!Number.isInteger(value) || value <= 0) {
		throw new TypeError(`${name} must be a positive integer`);
	}
	return value;
}

function assertSafeExtension(ext, name) {
	if (typeof ext !== 'string' || !SAFE_EXTENSION.test(ext)) {
		throw new TypeError(`Invalid ${name}: ${String(ext)}`);
	}
}

export class FFmpegWrapper {
	ffmpegPath;
	defaultTimeout;
	maxInputBytes;
	maxOutputBytes;
	maxStdoutBytes;
	maxStderrBytes;
	allowCustomRun;

	constructor(options = {}) {
		this.ffmpegPath = options.customFfmpegPath ?? 'ffmpeg';
		this.defaultTimeout = options.timeoutMs ?? 60_000;
		this.maxInputBytes = resolveLimit(options.maxInputBytes, 100 * MIB, 'maxInputBytes');
		this.maxOutputBytes = resolveLimit(options.maxOutputBytes, 100 * MIB, 'maxOutputBytes');
		this.maxStdoutBytes = resolveLimit(options.maxStdoutBytes, 50 * MIB, 'maxStdoutBytes');
		this.maxStderrBytes = resolveLimit(options.maxStderrBytes, 64 * 1024, 'maxStderrBytes');
		this.allowCustomRun = options.allowCustomRun ?? true;
	}

	execute(args, timeoutMs, captureStdout = false) {
		return new Promise((resolve, reject) => {
			const child = spawn(this.ffmpegPath, args, {
				stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe'],
			});

			const stdoutChunks = [];
			const stderrChunks = [];
			const actualTimeout = timeoutMs ?? this.defaultTimeout;

			let stdoutBytes = 0;
			let stderrBytes = 0;
			let stderrDropped = false;
			let isSettled = false;

			const timer = setTimeout(() => {
				child.kill('SIGKILL');
				finish(reject, new Error(`FFmpeg process timed out after ${actualTimeout}ms`));
			}, actualTimeout);

			const finish = (settle, value) => {
				if (isSettled) return;
				isSettled = true;
				clearTimeout(timer);
				settle(value);
			};

			if (captureStdout && child.stdout) {
				child.stdout.on('data', chunk => {
					if (isSettled) return;
					stdoutBytes += chunk.length;
					if (stdoutBytes > this.maxStdoutBytes) {
						child.kill('SIGKILL');
						finish(
							reject,
							new RangeError(
								`FFmpeg stdout exceeded the limit of ${this.maxStdoutBytes} bytes`
							)
						);
						return;
					}
					stdoutChunks.push(chunk);
				});
			}

			if (child.stderr) {
				child.stderr.on('data', chunk => {
					if (isSettled) return;
					stderrChunks.push(chunk);
					stderrBytes += chunk.length;
					while (
						stderrChunks.length > 1 &&
						stderrBytes - stderrChunks[0].length >= this.maxStderrBytes
					) {
						stderrBytes -= stderrChunks.shift().length;
						stderrDropped = true;
					}
				});
			}

			child.on('error', err => {
				if (isSettled) return;
				child.kill('SIGKILL');
				finish(reject, new Error(`Failed to start FFmpeg process: ${err.message}`));
			});

			child.on('close', (code, signal) => {
				if (isSettled) return;

				if (code === 0) {
					finish(resolve, captureStdout ? Buffer.concat(stdoutChunks) : Buffer.alloc(0));
				} else {
					const stderrBuffer = Buffer.concat(stderrChunks);
					const truncated = stderrDropped || stderrBuffer.length > this.maxStderrBytes;
					const stderrMsg =
						(truncated ? '[...truncated] ' : '') +
						stderrBuffer.subarray(-this.maxStderrBytes).toString('utf8');
					finish(
						reject,
						new Error(
							`FFmpeg failed with code ${code ?? 'NULL'} (${signal ?? 'NO_SIGNAL'}): ${stderrMsg}`
						)
					);
				}
			});
		});
	}

	async processBuffer(inputBuffer, inputExt, outputExt, buildArgs, timeoutMs) {
		if (!(inputBuffer instanceof Uint8Array)) {
			throw new TypeError('inputBuffer must be a Buffer or Uint8Array');
		}
		if (inputBuffer.byteLength > this.maxInputBytes) {
			throw new RangeError(
				`Input is ${inputBuffer.byteLength} bytes, which exceeds the limit of ${this.maxInputBytes} bytes`
			);
		}
		assertSafeExtension(inputExt, 'input extension');
		assertSafeExtension(outputExt, 'output extension');

		const id = randomUUID();
		const tempInput = join(tmpdir(), `vlxyzo_in_${id}.${inputExt}`);
		const tempOutput = join(tmpdir(), `vlxyzo_out_${id}.${outputExt}`);
		try {
			await fs.writeFile(tempInput, inputBuffer);
			const args = buildArgs(tempInput, tempOutput);
			if (args[args.length - 1] === tempOutput) {
				args.splice(args.length - 1, 0, '-fs', String(this.maxOutputBytes + 1));
			}
			await this.execute(args, timeoutMs, false);

			const { size } = await fs.stat(tempOutput);
			if (size > this.maxOutputBytes) {
				throw new RangeError(
					`Output is ${size} bytes, which exceeds the limit of ${this.maxOutputBytes} bytes`
				);
			}
			return await fs.readFile(tempOutput);
		} finally {
			await Promise.allSettled([fs.unlink(tempInput), fs.unlink(tempOutput)]);
		}
	}

	// to voice note
	async toVoice(audioBuffer) {
		return this.processBuffer(
			audioBuffer,
			'tmp',
			'ogg',
			(inPath, outPath) => [
				'-y',
				'-i',
				inPath,
				'-vn',
				'-c:a',
				'libopus',
				'-b:a',
				'32k',
				'-vbr',
				'on',
				'-compression_level',
				'10',
				'-frame_duration',
				'60',
				outPath,
			],
			60_000
		);
	}

	// to sticker
	async toSticker(inputBuffer, isAnimated = false) {
		if (isAnimated) {
			return this.processBuffer(
				inputBuffer,
				'mp4',
				'webp',
				(inPath, outPath) => [
					'-y',
					'-i',
					inPath,
					'-vcodec',
					'libwebp',
					'-filter:v',
					'fps=fps=30,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
					'-lossless',
					'0',
					'-compression_level',
					'4',
					'-q:v',
					'60',
					'-loop',
					'0',
					'-an',
					outPath,
				],
				120_000
			);
		}

		return this.processBuffer(
			inputBuffer,
			'png',
			'webp',
			(inPath, outPath) => [
				'-y',
				'-i',
				inPath,
				'-vcodec',
				'libwebp',
				'-filter:v',
				'scale=512:512:force_original_aspect_ratio=decrease',
				outPath,
			],
			30_000
		);
	}

	// to telescope
	async toTelescope(videoBuffer) {
		return this.processBuffer(
			videoBuffer,
			'mp4',
			'mp4',
			(inPath, outPath) => [
				'-y',
				'-i',
				inPath,
				'-vf',
				"crop=w='min(iw,ih)':h='min(iw,ih)',scale=384:384",
				'-c:v',
				'libx264',
				'-preset',
				'ultrafast',
				'-crf',
				'28',
				'-c:a',
				'aac',
				'-b:a',
				'64k',
				'-movflags',
				'+faststart',
				outPath,
			],
			300_000
		);
	}

	// compress video
	async compressVideo(videoBuffer, quality = 'medium') {
		const crfMap = {
			low: '35',
			medium: '28',
			high: '23',
			ultra: '18',
		};

		if (!Object.hasOwn(crfMap, quality)) {
			throw new TypeError(`Unsupported video quality: ${quality}`);
		}

		return this.processBuffer(
			videoBuffer,
			'mp4',
			'mp4',
			(inPath, outPath) => [
				'-y',
				'-i',
				inPath,
				'-c:v',
				'libx264',
				'-preset',
				'veryfast',
				'-crf',
				crfMap[quality],
				'-c:a',
				'aac',
				'-b:a',
				'128k',
				'-movflags',
				'+faststart',
				outPath,
			],
			600_000
		);
	}

	// to audio
	async toMP3(audioBuffer, bitrate = '192k') {
		if (typeof bitrate !== 'string' || !SAFE_BITRATE.test(bitrate)) {
			throw new TypeError(`Invalid audio bitrate: ${String(bitrate)}`);
		}

		return this.processBuffer(
			audioBuffer,
			'tmp',
			'mp3',
			(inPath, outPath) => [
				'-y',
				'-i',
				inPath,
				'-vn',
				'-c:a',
				'libmp3lame',
				'-b:a',
				bitrate,
				outPath,
			],
			120_000
		);
	}

	// gif to mp4
	async gifToMp4(gifBuffer) {
		return this.processBuffer(
			gifBuffer,
			'gif',
			'mp4',
			(inPath, outPath) => [
				'-y',
				'-i',
				inPath,
				'-movflags',
				'faststart',
				'-pix_fmt',
				'yuv420p',
				'-vf',
				'scale=trunc(iw/2)*2:trunc(ih/2)*2',
				outPath,
			],
			120_000
		);
	}

	// get audio
	async extractAudio(videoBuffer, format = 'mp3') {
		const audioFormats = {
			mp3: 'libmp3lame',
			aac: 'aac',
			wav: 'pcm_s16le',
		};

		if (!Object.hasOwn(audioFormats, format)) {
			throw new TypeError(`Unsupported audio format: ${format}`);
		}

		return this.processBuffer(
			videoBuffer,
			'mp4',
			format,
			(inPath, outPath) => ['-y', '-i', inPath, '-vn', '-c:a', audioFormats[format], outPath],
			120_000
		);
	}

	// get thumbnail
	async getThumbnail(videoBuffer, timestampSeconds = 1) {
		if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
			throw new TypeError(`Invalid thumbnail timestamp: ${String(timestampSeconds)}`);
		}

		return this.processBuffer(
			videoBuffer,
			'mp4',
			'jpg',
			(inPath, outPath) => [
				'-y',
				'-ss',
				timestampSeconds.toString(),
				'-i',
				inPath,
				'-vframes',
				'1',
				'-q:v',
				'2',
				outPath,
			],
			30_000
		);
	}

	// custom runner
	async customRun(args, timeoutMs, captureStdout = true) {
		if (!this.allowCustomRun) {
			throw new Error('customRun() is disabled for this FFmpegWrapper instance');
		}
		if (
			!Array.isArray(args) ||
			args.length === 0 ||
			args.some(arg => typeof arg !== 'string' || arg.includes('\0'))
		) {
			throw new TypeError('customRun() expects a non-empty array of strings');
		}
		return this.execute(args, timeoutMs, captureStdout);
	}
}
