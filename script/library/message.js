const VALID_DICE_EMOJIS = new Set(['🎲', '🎯', '🏀', '⚽', '🎳', '🎰']);

function chunkArray(items, columns = 2) {
	const cols = Math.max(1, Math.floor(Number(columns) || 1));
	const rows = [];
	for (let i = 0; i < items.length; i += cols) {
		rows.push(items.slice(i, i + cols));
	}
	return rows;
}

function cleanObject(obj) {
	const out = {};
	for (const [key, value] of Object.entries(obj)) {
		if (value !== undefined && value !== null) {
			out[key] = value;
		}
	}
	return out;
}

function assertCallbackBytes(data) {
	const value = String(data ?? '');
	const bytes = Buffer.byteLength(value, 'utf8');
	if (bytes < 1 || bytes > 64) {
		throw new RangeError(`Telegram callback_data must be 1-64 bytes (received ${bytes} bytes)`);
	}
	return value;
}

function applyButtonStyle(base, opts = {}) {
	if (opts.style) base.style = opts.style; // 'danger' | 'success' | 'primary'
	if (opts.icon_custom_emoji_id) base.icon_custom_emoji_id = String(opts.icon_custom_emoji_id);
	return base;
}

// html & markdown v2 formatters
export function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function escapeMdV2(value) {
	return String(value ?? '').replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export function stripHtml(html) {
	return String(html ?? '')
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"');
}

export function formatTemplate(template, vars = {}, shouldEscape = true) {
	return String(template ?? '').replace(/\{(\w+)\}/g, (match, key) => {
		if (!Object.hasOwn(vars, key)) return match;
		const val = vars[key] ?? '';
		return shouldEscape ? escapeHtml(val) : String(val);
	});
}

export const Fmt = Object.freeze({
	escape: escapeHtml,
	escapeMdV2,
	stripHtml,
	bold: text => `<b>${escapeHtml(text)}</b>`,
	italic: text => `<i>${escapeHtml(text)}</i>`,
	underline: text => `<u>${escapeHtml(text)}</u>`,
	strike: text => `<s>${escapeHtml(text)}</s>`,
	spoiler: text => `<tg-spoiler>${escapeHtml(text)}</tg-spoiler>`,
	code: text => `<code>${escapeHtml(text)}</code>`,
	pre: (text, lang = '') =>
		lang
			? `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(text)}</code></pre>`
			: `<pre>${escapeHtml(text)}</pre>`,
	quote: text => `<blockquote>${escapeHtml(text)}</blockquote>`,
	expandableQuote: text => `<blockquote expandable>${escapeHtml(text)}</blockquote>`,
	link: (label, url) => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`,
	mention: (label, userId) => `<a href="tg://user?id=${Number(userId)}">${escapeHtml(label)}</a>`,
	customEmoji: (fallbackEmoji, emojiId) =>
		`<tg-emoji emoji-id="${escapeHtml(emojiId)}">${escapeHtml(fallbackEmoji)}</tg-emoji>`,
});

// link preview options (LinkPreviewOptions)
export const LinkPreview = Object.freeze({
	disable: () => ({ is_disabled: true }),

	enable: (options = {}) =>
		cleanObject({
			is_disabled: false,
			url: options.url,
			prefer_small_media: options.prefer_small_media,
			prefer_large_media: options.prefer_large_media,
			show_above_text: options.show_above_text,
		}),

	custom: (url, { small = false, large = false, aboveText = false } = {}) =>
		cleanObject({
			is_disabled: false,
			url: String(url),
			prefer_small_media: small || undefined,
			prefer_large_media: large || undefined,
			show_above_text: aboveText || undefined,
		}),

	aboveText: (url, { small = false, large = false } = {}) =>
		cleanObject({
			is_disabled: false,
			url: url ? String(url) : undefined,
			prefer_small_media: small || undefined,
			prefer_large_media: large || undefined,
			show_above_text: true,
		}),

	small: url =>
		cleanObject({
			is_disabled: false,
			url: url ? String(url) : undefined,
			prefer_small_media: true,
		}),

	large: url =>
		cleanObject({
			is_disabled: false,
			url: url ? String(url) : undefined,
			prefer_large_media: true,
		}),
});

// inline keyboard & buttons (InlineKeyboardMarkup)
export const InlineButton = Object.freeze({
	callback: (text, data, opts = {}) =>
		applyButtonStyle({ text: String(text), callback_data: assertCallbackBytes(data) }, opts),

	url: (text, url, opts = {}) => applyButtonStyle({ text: String(text), url: String(url) }, opts),

	webApp: (text, url, opts = {}) =>
		applyButtonStyle({ text: String(text), web_app: { url: String(url) } }, opts),

	loginUrl: (text, config, opts = {}) => {
		const login =
			typeof config === 'string'
				? { url: config }
				: cleanObject({
						url: String(config.url),
						forward_text: config.forward_text,
						bot_username: config.bot_username,
						request_write_access: config.request_write_access,
					});
		return applyButtonStyle({ text: String(text), login_url: login }, opts);
	},

	switchInline: (text, query = '', opts = {}) =>
		applyButtonStyle({ text: String(text), switch_inline_query: String(query) }, opts),

	switchInlineCurrent: (text, query = '', opts = {}) =>
		applyButtonStyle(
			{ text: String(text), switch_inline_query_current_chat: String(query) },
			opts
		),

	switchInlineChosen: (text, options = {}, opts = {}) =>
		applyButtonStyle(
			{
				text: String(text),
				switch_inline_query_chosen_chat: cleanObject({
					query: options.query ?? '',
					allow_user_chats: options.allow_user_chats,
					allow_bot_chats: options.allow_bot_chats,
					allow_group_chats: options.allow_group_chats,
					allow_channel_chats: options.allow_channel_chats,
				}),
			},
			opts
		),

	copyText: (text, copyText, opts = {}) =>
		applyButtonStyle(
			{
				text: String(text),
				copy_text: { text: String(copyText) },
			},
			opts
		),

	game: (text, opts = {}) => applyButtonStyle({ text: String(text), callback_game: {} }, opts),

	pay: (text, opts = {}) => applyButtonStyle({ text: String(text), pay: true }, opts),
});

export const InlineKeyboard = Object.freeze({
	rows: (...rows) => ({
		inline_keyboard: rows
			.map(row => (Array.isArray(row) ? row.filter(Boolean) : row ? [row] : []))
			.filter(row => row.length > 0),
	}),

	grid: (buttons, columns = 2) => ({
		inline_keyboard: chunkArray(buttons.filter(Boolean), columns),
	}),

	paginate: ({
		items = [],
		page = 1,
		pageSize = 6,
		columns = 2,
		renderItem,
		prefix = 'page',
		prevLabel = '◀️ Prev',
		nextLabel = 'Next ▶️',
		extraRows = [],
	}) => {
		const size = Math.max(1, Math.floor(Number(pageSize) || 6));
		const totalPages = Math.max(1, Math.ceil(items.length / size));
		const currentPage = Math.min(Math.max(1, Math.floor(Number(page) || 1)), totalPages);
		const start = (currentPage - 1) * size;
		const slice = items.slice(start, start + size);

		const itemButtons =
			typeof renderItem === 'function'
				? slice.map((item, idx) => renderItem(item, start + idx))
				: slice;

		const rows = chunkArray(itemButtons.filter(Boolean), columns);

		if (totalPages > 1) {
			const navRow = [];
			if (currentPage > 1) {
				navRow.push(InlineButton.callback(prevLabel, `${prefix}:${currentPage - 1}`));
			}
			navRow.push(InlineButton.callback(`${currentPage} / ${totalPages}`, `${prefix}:noop`));
			if (currentPage < totalPages) {
				navRow.push(InlineButton.callback(nextLabel, `${prefix}:${currentPage + 1}`));
			}
			rows.push(navRow);
		}

		for (const row of extraRows) {
			if (Array.isArray(row) && row.length > 0) rows.push(row.filter(Boolean));
		}

		return { inline_keyboard: rows };
	},
});

// reply keyboard & input controls (ReplyKeyboardMarkup)
export const ReplyButton = Object.freeze({
	text: (text, opts = {}) => applyButtonStyle({ text: String(text) }, opts),

	requestUsers: (text, requestId, criteria = {}, opts = {}) =>
		applyButtonStyle(
			{
				text: String(text),
				request_users: cleanObject({
					request_id: Number(requestId),
					user_is_bot: criteria.user_is_bot,
					user_is_premium: criteria.user_is_premium,
					max_quantity: criteria.max_quantity,
					request_name: criteria.request_name,
					request_username: criteria.request_username,
					request_photo: criteria.request_photo,
				}),
			},
			opts
		),

	requestChat: (text, requestId, criteria = {}, opts = {}) =>
		applyButtonStyle(
			{
				text: String(text),
				request_chat: cleanObject({
					request_id: Number(requestId),
					chat_is_channel: Boolean(criteria.chat_is_channel),
					chat_is_forum: criteria.chat_is_forum,
					chat_has_username: criteria.chat_has_username,
					chat_is_created: criteria.chat_is_created,
					user_administrator_rights: criteria.user_administrator_rights,
					bot_administrator_rights: criteria.bot_administrator_rights,
					bot_is_member: criteria.bot_is_member,
					request_title: criteria.request_title,
					request_username: criteria.request_username,
					request_photo: criteria.request_photo,
				}),
			},
			opts
		),

	requestContact: (text, opts = {}) =>
		applyButtonStyle({ text: String(text), request_contact: true }, opts),

	requestLocation: (text, opts = {}) =>
		applyButtonStyle({ text: String(text), request_location: true }, opts),

	requestPoll: (text, type, opts = {}) =>
		applyButtonStyle(
			{
				text: String(text),
				request_poll: type ? { type: String(type) } : {},
			},
			opts
		),

	webApp: (text, url, opts = {}) =>
		applyButtonStyle({ text: String(text), web_app: { url: String(url) } }, opts),
});

export const ReplyKeyboard = Object.freeze({
	markup: (rows, options = {}) =>
		cleanObject({
			keyboard: rows
				.map(row =>
					(Array.isArray(row) ? row : [row])
						.filter(Boolean)
						.map(btn => (typeof btn === 'string' ? { text: btn } : btn))
				)
				.filter(row => row.length > 0),
			is_persistent: options.is_persistent,
			resize_keyboard: options.resize_keyboard ?? true,
			one_time_keyboard: options.one_time_keyboard,
			input_field_placeholder: options.input_field_placeholder,
			selective: options.selective,
		}),

	grid: (buttons, columns = 2, options = {}) =>
		ReplyKeyboard.markup(chunkArray(buttons.filter(Boolean), columns), options),

	remove: (selective = false) =>
		cleanObject({
			remove_keyboard: true,
			selective: selective || undefined,
		}),

	forceReply: (options = {}) =>
		cleanObject({
			force_reply: true,
			input_field_placeholder: options.input_field_placeholder,
			selective: options.selective,
		}),
});

// media carousel / album & paid media (InputMedia)
export const Media = Object.freeze({
	photo: (media, options = {}) =>
		cleanObject({
			type: 'photo',
			media,
			caption: options.caption,
			parse_mode: options.caption ? (options.parse_mode ?? 'HTML') : options.parse_mode,
			caption_entities: options.caption_entities,
			show_caption_above_media: options.show_caption_above_media,
			has_spoiler: options.has_spoiler,
		}),

	video: (media, options = {}) =>
		cleanObject({
			type: 'video',
			media,
			thumbnail: options.thumbnail,
			cover: options.cover,
			start_timestamp: options.start_timestamp,
			caption: options.caption,
			parse_mode: options.caption ? (options.parse_mode ?? 'HTML') : options.parse_mode,
			caption_entities: options.caption_entities,
			show_caption_above_media: options.show_caption_above_media,
			width: options.width,
			height: options.height,
			duration: options.duration,
			supports_streaming: options.supports_streaming ?? true,
			has_spoiler: options.has_spoiler,
		}),

	audio: (media, options = {}) =>
		cleanObject({
			type: 'audio',
			media,
			thumbnail: options.thumbnail,
			caption: options.caption,
			parse_mode: options.caption ? (options.parse_mode ?? 'HTML') : options.parse_mode,
			caption_entities: options.caption_entities,
			duration: options.duration,
			performer: options.performer,
			title: options.title,
		}),

	document: (media, options = {}) =>
		cleanObject({
			type: 'document',
			media,
			thumbnail: options.thumbnail,
			caption: options.caption,
			parse_mode: options.caption ? (options.parse_mode ?? 'HTML') : options.parse_mode,
			caption_entities: options.caption_entities,
			disable_content_type_detection: options.disable_content_type_detection,
		}),

	animation: (media, options = {}) =>
		cleanObject({
			type: 'animation',
			media,
			thumbnail: options.thumbnail,
			caption: options.caption,
			parse_mode: options.caption ? (options.parse_mode ?? 'HTML') : options.parse_mode,
			caption_entities: options.caption_entities,
			show_caption_above_media: options.show_caption_above_media,
			width: options.width,
			height: options.height,
			duration: options.duration,
			has_spoiler: options.has_spoiler,
		}),

	carousel: (items = [], options = {}) => {
		const list = items.filter(Boolean);
		if (list.length < 2 || list.length > 10) {
			throw new RangeError(
				`Telegram media group (carousel) requires 2-10 items (received ${list.length})`
			);
		}

		return list.map((item, index) => {
			const normalized =
				typeof item === 'string' || Buffer.isBuffer(item) || item?.source
					? Media.photo(item)
					: { ...item };

			if (index === 0 && options.caption) {
				normalized.caption = options.caption;
				normalized.parse_mode = options.parse_mode ?? 'HTML';
				if (options.show_caption_above_media !== undefined) {
					normalized.show_caption_above_media = options.show_caption_above_media;
				}
			}

			return normalized;
		});
	},

	paidPhoto: media => ({ type: 'photo', media }),

	paidVideo: (media, options = {}) =>
		cleanObject({
			type: 'video',
			media,
			thumbnail: options.thumbnail,
			cover: options.cover,
			start_timestamp: options.start_timestamp,
			width: options.width,
			height: options.height,
			duration: options.duration,
			supports_streaming: options.supports_streaming ?? true,
		}),
});

// interactive polls, quotes, dice, geo & contact
export const Poll = Object.freeze({
	regular: (question, options = [], config = {}) =>
		cleanObject({
			question: String(question),
			options: options.map(opt => (typeof opt === 'string' ? { text: opt } : opt)),
			is_anonymous: config.is_anonymous ?? true,
			type: 'regular',
			allows_multiple_answers: Boolean(config.allows_multiple_answers),
			question_parse_mode: config.question_parse_mode,
			open_period: config.open_period,
			close_date: config.close_date,
			is_closed: config.is_closed,
		}),

	quiz: (question, options = [], correctOptionId = 0, config = {}) =>
		cleanObject({
			question: String(question),
			options: options.map(opt => (typeof opt === 'string' ? { text: opt } : opt)),
			is_anonymous: config.is_anonymous ?? true,
			type: 'quiz',
			correct_option_id: Number(correctOptionId),
			explanation: config.explanation,
			explanation_parse_mode: config.explanation
				? (config.explanation_parse_mode ?? 'HTML')
				: config.explanation_parse_mode,
			question_parse_mode: config.question_parse_mode,
			open_period: config.open_period,
			close_date: config.close_date,
			is_closed: config.is_closed,
		}),
});

export const ReplyParams = Object.freeze({
	to: (messageId, options = {}) =>
		cleanObject({
			message_id: Number(messageId),
			chat_id: options.chat_id,
			allow_sending_without_reply: options.allow_sending_without_reply ?? true,
			quote: options.quote,
			quote_parse_mode: options.quote ? (options.quote_parse_mode ?? 'HTML') : undefined,
			quote_entities: options.quote_entities,
			quote_position: options.quote_position,
		}),
});

export const Dice = Object.freeze({
	emojis: VALID_DICE_EMOJIS,
	build: (emoji = '🎲', extra = {}) => {
		const chosen = VALID_DICE_EMOJIS.has(emoji) ? emoji : '🎲';
		return cleanObject({ emoji: chosen, ...extra });
	},
});

export const Geo = Object.freeze({
	location: (latitude, longitude, options = {}) =>
		cleanObject({
			latitude: Number(latitude),
			longitude: Number(longitude),
			horizontal_accuracy: options.horizontal_accuracy,
			live_period: options.live_period,
			heading: options.heading,
			proximity_alert_radius: options.proximity_alert_radius,
		}),

	venue: (latitude, longitude, title, address, options = {}) =>
		cleanObject({
			latitude: Number(latitude),
			longitude: Number(longitude),
			title: String(title),
			address: String(address),
			foursquare_id: options.foursquare_id,
			foursquare_type: options.foursquare_type,
			google_place_id: options.google_place_id,
			google_place_type: options.google_place_type,
		}),
});

export const Contact = Object.freeze({
	card: (phoneNumber, firstName, options = {}) =>
		cleanObject({
			phone_number: String(phoneNumber),
			first_name: String(firstName),
			last_name: options.last_name,
			vcard: options.vcard,
		}),
});

// fluent message composer
export class MessageBuilder {
	#lines = [];
	#extra = {
		parse_mode: 'HTML',
		link_preview_options: LinkPreview.disable(),
	};

	text(content) {
		if (content !== undefined && content !== null) {
			this.#lines.push(String(content));
		}
		return this;
	}

	line(content = '') {
		this.#lines.push(String(content));
		return this;
	}

	blank() {
		this.#lines.push('');
		return this;
	}

	parseMode(mode) {
		this.#extra.parse_mode = mode;
		return this;
	}

	linkPreview(options) {
		this.#extra.link_preview_options = options;
		return this;
	}

	keyboard(markup) {
		this.#extra.reply_markup = markup;
		return this;
	}

	replyTo(messageId, quoteOptions = {}) {
		this.#extra.reply_parameters = ReplyParams.to(messageId, quoteOptions);
		return this;
	}

	protect(enabled = true) {
		this.#extra.protect_content = Boolean(enabled);
		return this;
	}

	silent(enabled = true) {
		this.#extra.disable_notification = Boolean(enabled);
		return this;
	}

	effect(messageEffectId) {
		this.#extra.message_effect_id = String(messageEffectId);
		return this;
	}

	build() {
		return {
			text: this.#lines.join('\n'),
			extra: cleanObject({ ...this.#extra }),
		};
	}
}

export function createMessage() {
	return new MessageBuilder();
}
