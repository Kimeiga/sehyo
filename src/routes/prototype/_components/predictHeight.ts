import { prepare, layout } from '@chenglou/pretext';
import type { PostData } from './Post.svelte';

// Constants below MUST stay in sync with Post.svelte CSS, otherwise the
// prediction will diverge from the rendered height.
//
// The font string is canvas syntax (matches `canvas.font`). Use a concrete
// loaded font, not `ui-sans-serif` / `system-ui`: pretext warns those resolve
// inconsistently between canvas and CSS on macOS, off-by-one-line errors will
// result. Callers must await `document.fonts.ready` before measuring.
const TEXT_FONT = '400 14px Geist';
const TEXT_LINE_HEIGHT = 21;
const BODY_PADDING_X = 14;
const BODY_PADDING_TOP = 12;
const BODY_PADDING_BOTTOM = 14;
const TEXT_MARGIN_BOTTOM = 12;
const META_BOX_HEIGHT = 36;
const BORDER_TOTAL = 2;
const DEFAULT_IMAGE_HEIGHT = 160;

export type Prediction = {
	imageHeight: number;
	textHeight: number;
	textLineCount: number;
	metaHeight: number;
	bodyPadding: number;
	textMarginBottom: number;
	border: number;
	total: number;
};

export function predictPostHeight(post: PostData, tileWidth: number): Prediction {
	// tileWidth is the outer width of the tile. To get the text-wrap width we
	// subtract the tile's left/right border (1px × 2) and the body's left/right
	// padding (BODY_PADDING_X × 2). The default box-sizing is content-box and
	// the body lives directly inside the tile (no extra wrappers with padding).
	const contentWidth = tileWidth - BORDER_TOTAL - BODY_PADDING_X * 2;
	const prepared = prepare(post.text, TEXT_FONT);
	const { height: textHeight, lineCount } = layout(prepared, contentWidth, TEXT_LINE_HEIGHT);
	const imageHeight = post.gradient ? (post.imageHeight ?? DEFAULT_IMAGE_HEIGHT) : 0;

	return {
		imageHeight,
		textHeight,
		textLineCount: lineCount,
		metaHeight: META_BOX_HEIGHT,
		bodyPadding: BODY_PADDING_TOP + BODY_PADDING_BOTTOM,
		textMarginBottom: TEXT_MARGIN_BOTTOM,
		border: BORDER_TOTAL,
		total:
			imageHeight +
			BODY_PADDING_TOP +
			textHeight +
			TEXT_MARGIN_BOTTOM +
			META_BOX_HEIGHT +
			BODY_PADDING_BOTTOM +
			BORDER_TOTAL
	};
}
