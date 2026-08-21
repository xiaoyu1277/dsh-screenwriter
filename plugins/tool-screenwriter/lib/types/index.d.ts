/**
 * @deepseek-ai/dsh-tool-screenwriter
 *
 * Screenwriter storyboard I/O for the `dsh-screenwriter` skill: turns the
 * segmented "先图后视频" storyboard (four-element image prompts and four-element
 * video prompts per segment) into durable files in the session workspace, and
 * tracks per-segment production status across the image→video pipeline.
 *
 * Companion to the `dsh-screenwriter` skill (the creative brain): this plugin
 * is the structured hand — validate, persist, and update storyboards so the
 * user can work segment by segment (image → confirm → video → assemble)
 * against files instead of chat scrollback.
 *
 *   - `storyboard_export`  — validate segments, write `storyboard-<title>.json`
 *     (canonical data) and `storyboard-<title>.md` (human-readable 分镜表) into
 *     the session workspace.
 *   - `storyboard_status`  — mark one segment's production stage
 *     (image_pending / image_confirmed / video_generated / revising) in the
 *     JSON, optionally recording the confirmed image path.
 *
 * @module @deepseek-ai/dsh-tool-screenwriter
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Stable Cordis plugin name used by loader diagnostics. */
export declare const name = "tool-screenwriter";
/** Services required before the tools can mount. */
export declare const inject: string[];
/** Plugin config — all optional. */
export interface Config {
    /** Maximum segments one export accepts (sanity bound). */
    maxSegments?: number;
}
export declare const Config: z<Config>;
/** Four-element image prompt (图片提示词). */
export interface ImagePrompt {
    time: string;
    subject: string;
    scene: string;
    style: string;
    keep?: string;
    change?: string;
    negative?: string;
}
/** Four-element video prompt (场景/视频提示词). */
export interface VideoPrompt {
    subject: string;
    action: string;
    effect: string;
    rhythm: string;
    negative?: string;
}
/** One storyboard segment. */
export interface StoryboardSegment {
    segment: string;
    beat: string;
    duration_sec?: number;
    img2img_from?: string;
    image_prompt: ImagePrompt;
    video_prompt: VideoPrompt;
    transition?: string;
}
/** The canonical storyboard document written to disk. */
export interface StoryboardDoc {
    schema: string;
    title: string;
    style_anchor?: string;
    total_duration_sec?: number;
    created_at: string;
    segments: StoryboardSegment[];
    progress: Record<string, {
        status: string;
        note?: string;
        image_path?: string;
    }>;
}
/** Sanitize a title into a safe filename fragment (keeps CJK, drops path metacharacters). */
export declare function slugify(title: string): string;
/** Validate the segments array against the skill's four-element contract; throws with details. */
export declare function validateSegments(segments: readonly StoryboardSegment[], maxSegments: number): void;
/** Render the human-readable 分镜表 Markdown. */
export declare function renderStoryboardMarkdown(doc: StoryboardDoc): string;
/**
 * Register the storyboard tools into the given context.
 * @param ctx - the registration scope; execution uses its `fs` service.
 * @param config - validated plugin config.
 */
export declare function apply(ctx: Context, config: Config | undefined): void;
//# sourceMappingURL=index.d.ts.map