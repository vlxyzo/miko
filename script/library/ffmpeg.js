/**
 * @project   miko v0.0.1-alpha
 * @author    Velix <https://github.com/vlxyzo>
 * @license   GPL-3.0-or-later
 * @source    https://github.com/vlxyzo/miko
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CRF_MAP = Object.freeze({
	low: '35',
	medium: '28',
	high: '23',
	ultra: '18',
});

const AUDIO_CODECS = Object.freeze({
	mp3: 'libmp3lame',
	aac: 'aac',
	wav: 'pcm_s16le',
});

const MAX_STDERR_BYTES = 16_384;

export class FFmpegWrapper {
	#ffmpegPath;
	#defaultTimeout;

	constructor(options = {}) {
		this.#ffmpegPath = options.customFfmpegPath ?? 'ffmpeg';
		this.#defaultTimeout = options.timeoutMs ?? 60_000;
	}

	#execute(args, timeoutMs, captureStdout = false) {
		return new Promise((resolve, reject) => {
			const child = spawn(this.#ffmpegPath, args, {
				stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe'],
			});

			const stdoutChunks = [];
			const stderrChunks = [];
			const actualTimeout = timeoutMs ?? this.#defaultTimeout;

			let stderrBytes = 0;
			let isSettled = false;

			const timer = setTimeout(() => {
				if (isSettled) return;
				isSettled = true;
				child.kill('SIGKILL');
				reject(new Error(`FFmpeg process timed out after ${actualTimeout}ms`));
			}, actualTimeout);

			if (captureStdout && child.stdout) {
				child.stdout.on('data', chunk => stdoutChunks.push(chunk));
			}

			if (child.stderr) {
				child.stderr.on('data', chunk => {
					stderrChunks.push(chunk);
					stderrBytes += chunk.length;

					while (stderrBytes > MAX_STDERR_BYTES && stderrChunks.length > 1) {
						stderrBytes -= stderrChunks.shift().length;
					}
				});
			}

			child.on('error', err => {
				if (isSettled) return;
				isSettled = true;
				clearTimeout(timer);

				if (child.pid) child.kill('SIGKILL');
				reject(new Error(`Failed to start FFmpeg process: ${err.message}`));
			});

			child.on('close', (code, signal) => {
				if (isSettled) return;
				isSettled = true;
				clearTimeout(timer);

				if (code === 0) {
					resolve(captureStdout ? Buffer.concat(stdoutChunks) : Buffer.alloc(0));
				} else {
					const stderrMsg = Buffer.concat(stderrChunks).toString('utf8').trim();
					reject(
						new Error(
							`FFmpeg failed with code ${code ?? 'NULL'} (${signal ?? 'NO_SIGNAL'}): ${stderrMsg}`
						)
					);
				}
			});
		});
	}

	async #processBuffer(inputBuffer, inputExt, outputExt, buildArgs, timeoutMs) {
		const id = randomUUID();
		const tempInput = join(tmpdir(), `vlxyzo_in_${id}.${inputExt}`);
		const tempOutput = join(tmpdir(), `vlxyzo_out_${id}.${outputExt}`);

		try {
			await writeFile(tempInput, inputBuffer);
			await this.#execute(buildArgs(tempInput, tempOutput), timeoutMs, false);
			return await readFile(tempOutput);
		} finally {
			await Promise.allSettled([unlink(tempInput), unlink(tempOutput)]);
		}
	}

	// to voice note
	async toVoice(audioBuffer) {
		return this.#processBuffer(
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
			return this.#processBuffer(
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

		return this.#processBuffer(
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
		return this.#processBuffer(
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
		const crf = CRF_MAP[quality] ?? CRF_MAP.medium;

		return this.#processBuffer(
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
				crf,
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
		return this.#processBuffer(
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
		return this.#processBuffer(
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
		const ext = String(format).toLowerCase();
		const codec = AUDIO_CODECS[ext];

		if (!codec) {
			throw new Error(`Unsupported audio format: ${format}`);
		}

		return this.#processBuffer(
			videoBuffer,
			'mp4',
			ext,
			(inPath, outPath) => ['-y', '-i', inPath, '-vn', '-c:a', codec, outPath],
			120_000
		);
	}

	// get thumbnail
	async getThumbnail(videoBuffer, timestampSeconds = 1) {
		return this.#processBuffer(
			videoBuffer,
			'mp4',
			'jpg',
			(inPath, outPath) => [
				'-y',
				'-ss',
				String(timestampSeconds),
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
		return this.#execute(args, timeoutMs, captureStdout);
	}
}

export const ffmpeg = new FFmpegWrapper();
export default ffmpeg;
