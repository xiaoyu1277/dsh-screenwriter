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
import { defineTool } from '@deepseek-ai/dsh-tools';
import z from '@deepseek-ai/schemastery';
/** Stable Cordis plugin name used by loader diagnostics. */
export const name = 'tool-screenwriter';
/** Services required before the tools can mount. */
export const inject = ['tools', 'fs'];
export const Config = z.object({
    maxSegments: z.natural().max(200),
});
const SCHEMA_TAG = 'dsh-screenwriter/storyboard@1';
/** The four required image-prompt keys per the skill's four-element rule. */
const IMAGE_KEYS = ['time', 'subject', 'scene', 'style'];
/** The four required video-prompt keys per the skill's four-element rule. */
const VIDEO_KEYS = ['subject', 'action', 'effect', 'rhythm'];
/** The session workspace cwd for this call, or undefined for a non-agent caller. */
function sessionCwd(exec) {
    return exec.agent?.session?.header?.cwd;
}
/** Sanitize a title into a safe filename fragment (keeps CJK, drops path metacharacters). */
export function slugify(title) {
    const cleaned = title.trim().replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_');
    return cleaned === '' ? 'untitled' : cleaned;
}
/** Validate the segments array against the skill's four-element contract; throws with details. */
export function validateSegments(segments, maxSegments) {
    if (segments.length === 0)
        throw new Error('storyboard_export: segments 不能为空');
    if (segments.length > maxSegments) {
        throw new Error(`storyboard_export: 分段数 ${String(segments.length)} 超过上限 ${String(maxSegments)}`);
    }
    const seen = new Set();
    for (const seg of segments) {
        if (typeof seg.segment !== 'string' || seg.segment.trim() === '') {
            throw new Error('storyboard_export: 存在缺少 segment 编号的分段（如 A、B、C）');
        }
        if (seen.has(seg.segment))
            throw new Error(`storyboard_export: 分段编号 "${seg.segment}" 重复`);
        seen.add(seg.segment);
        if (typeof seg.beat !== 'string' || seg.beat.trim() === '') {
            throw new Error(`storyboard_export: 段 ${seg.segment} 缺少 beat 剧情说明`);
        }
        const image = seg.image_prompt;
        if (typeof image !== 'object') {
            throw new Error(`storyboard_export: 段 ${seg.segment} 缺少 image_prompt（画面四要素）`);
        }
        for (const key of IMAGE_KEYS) {
            if (typeof image[key] !== 'string') {
                throw new Error(`storyboard_export: 段 ${seg.segment} 的 image_prompt 缺少 "${key}"（画面四要素：时间/主体/场景/风格）`);
            }
        }
        const video = seg.video_prompt;
        if (typeof video !== 'object') {
            throw new Error(`storyboard_export: 段 ${seg.segment} 缺少 video_prompt（场景四要素）`);
        }
        for (const key of VIDEO_KEYS) {
            if (typeof video[key] !== 'string') {
                throw new Error(`storyboard_export: 段 ${seg.segment} 的 video_prompt 缺少 "${key}"（场景四要素：主体/动作/效果/节奏）`);
            }
        }
    }
}
/** Render the human-readable 分镜表 Markdown. */
export function renderStoryboardMarkdown(doc) {
    const lines = [];
    lines.push(`# ${doc.title} · 分镜表`);
    lines.push('');
    if (doc.style_anchor !== undefined && doc.style_anchor !== '') {
        lines.push(`**风格锚点**：${doc.style_anchor}`);
    }
    if (doc.total_duration_sec !== undefined) {
        lines.push(`**预估总时长**：${String(doc.total_duration_sec)} 秒（${String(doc.segments.length)} 段）`);
    }
    lines.push('**生产顺序**：先逐段生成图片（检查后）→ 再以图为底生成视频 → 拼接');
    lines.push('');
    for (const seg of doc.segments) {
        const progress = doc.progress[seg.segment];
        const statusText = progress === undefined
            ? '☐ 待出图'
            : progress.status === 'image_pending' ? '☐ 待出图'
                : progress.status === 'image_confirmed' ? '☑ 图已确认'
                    : progress.status === 'video_generated' ? '☑ 视频已生成'
                        : '↻ 修改中';
        const duration = seg.duration_sec !== undefined ? `（约 ${String(seg.duration_sec)} 秒）` : '';
        lines.push(`### 段 ${seg.segment} · ${seg.beat}${duration}`);
        const note = progress?.note !== undefined ? `（${progress.note}）` : '';
        lines.push(`- 状态：${statusText}${note}`);
        if (seg.img2img_from !== undefined)
            lines.push(`- 图生图来源：${seg.img2img_from}`);
        lines.push('');
        lines.push('**图片提示词（四要素）**');
        lines.push(`- 时间：${seg.image_prompt.time}`);
        lines.push(`- 主体：${seg.image_prompt.subject}`);
        lines.push(`- 场景：${seg.image_prompt.scene}`);
        lines.push(`- 风格：${seg.image_prompt.style}`);
        if (seg.image_prompt.composition !== undefined)
            lines.push(`- 构图：${seg.image_prompt.composition}`);
        if (seg.image_prompt.lighting !== undefined)
            lines.push(`- 光线：${seg.image_prompt.lighting}`);
        if (seg.image_prompt.grading !== undefined)
            lines.push(`- 色调：${seg.image_prompt.grading}`);
        if (seg.image_prompt.keep !== undefined)
            lines.push(`- 保持：${seg.image_prompt.keep}`);
        if (seg.image_prompt.change !== undefined)
            lines.push(`- 变更：${seg.image_prompt.change}`);
        if (seg.image_prompt.negative !== undefined)
            lines.push(`- 负面提示词：${seg.image_prompt.negative}`);
        lines.push('');
        lines.push('**视频提示词（四要素）**');
        lines.push(`- 主体：${seg.video_prompt.subject}`);
        lines.push(`- 动作：${seg.video_prompt.action}`);
        lines.push(`- 效果：${seg.video_prompt.effect}`);
        lines.push(`- 节奏：${seg.video_prompt.rhythm}`);
        if (seg.video_prompt.camera !== undefined)
            lines.push(`- 运镜：${seg.video_prompt.camera}`);
        if (seg.video_prompt.expression !== undefined)
            lines.push(`- 表情：${seg.video_prompt.expression}`);
        if (seg.video_prompt.body !== undefined)
            lines.push(`- 肢体：${seg.video_prompt.body}`);
        if (seg.video_prompt.negative !== undefined)
            lines.push(`- 负面提示词：${seg.video_prompt.negative}`);
        if (seg.transition !== undefined)
            lines.push(`- 衔接：${seg.transition}`);
        lines.push('');
    }
    return lines.join('\n');
}
function formatExportSummary(value) {
    const lines = [
        `<title>${value.title}</title>`,
        `<segments>${String(value.segment_count)}</segments>`,
        `<json>${value.json_path}</json>`,
        `<markdown>${value.markdown_path}</markdown>`,
        '',
        ...value.segments.map(seg => `- ${seg.segment}: ${seg.beat}`),
    ];
    return lines.join('\n');
}
/**
 * Register the storyboard tools into the given context.
 * @param ctx - the registration scope; execution uses its `fs` service.
 * @param config - validated plugin config.
 */
export function apply(ctx, config) {
    const maxSegments = config?.maxSegments ?? 40;
    ctx.tools.register(defineTool({
        name: 'storyboard_export',
        description: '将 dsh-screenwriter 技能生成的分段分镜表（每段的画面四要素图片提示词 + 场景四要素视频提示词）校验后写入工作区：storyboard-<标题>.json（结构化数据）与 storyboard-<标题>.md（可读分镜表），供逐段图生视频使用。',
        parameters: {
            title: { type: 'string', required: true, description: '短剧标题（用于文件名与分镜表标题）。' },
            style_anchor: { type: 'string', description: '全片风格锚点一句话（色调/光线/美术基调）。' },
            total_duration_sec: { type: 'integer', description: '预估总时长（秒）。' },
            segments: {
                type: 'array',
                required: true,
                description: '分段数组：每段含 segment 编号、beat 剧情、image_prompt（时间/主体/场景/风格 + 可选 keep/change/negative）、video_prompt（主体/动作/效果/节奏 + 可选 negative）、可选 img2img_from（图生图来源段）、transition（衔接）。',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        segment: { type: 'string', required: true, description: '分段编号，如 A、B、C。' },
                        beat: { type: 'string', required: true, description: '本段剧情节拍。' },
                        duration_sec: { type: 'integer', description: '本段视频时长（秒）。' },
                        img2img_from: { type: 'string', description: '图生图来源（如 S 锚点图、A）。' },
                        image_prompt: {
                            type: 'object',
                            required: true,
                            additionalProperties: false,
                            properties: {
                                time: { type: 'string', required: true },
                                subject: { type: 'string', required: true },
                                scene: { type: 'string', required: true },
                                style: { type: 'string', required: true },
                                composition: { type: 'string', description: '构图与画幅（六维①）' },
                                lighting: { type: 'string', description: '光线布光（六维③）' },
                                grading: { type: 'string', description: '色彩色调调色（六维④）' },
                                keep: { type: 'string' },
                                change: { type: 'string' },
                                negative: { type: 'string' },
                            },
                        },
                        video_prompt: {
                            type: 'object',
                            required: true,
                            additionalProperties: false,
                            properties: {
                                subject: { type: 'string', required: true },
                                action: { type: 'string', required: true },
                                effect: { type: 'string', required: true },
                                rhythm: { type: 'string', required: true },
                                camera: { type: 'string', description: '运镜系统（六维②）' },
                                expression: { type: 'string', description: '面部微表情（六维⑤）' },
                                body: { type: 'string', description: '肢体表演（六维⑥）' },
                                negative: { type: 'string' },
                            },
                        },
                        transition: { type: 'string', description: '与下一段的衔接设计。' },
                    },
                },
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    title: { type: 'string', required: true },
                    json_path: { type: 'string', required: true },
                    markdown_path: { type: 'string', required: true },
                    segment_count: { type: 'integer', required: true },
                    segments: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                segment: { type: 'string', required: true },
                                beat: { type: 'string', required: true },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => [{ type: 'text', text: formatExportSummary(value) }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            validateSegments(args.segments, maxSegments);
            const doc = {
                schema: SCHEMA_TAG,
                title: args.title.trim(),
                ...args.style_anchor !== undefined && args.style_anchor !== '' ? { style_anchor: args.style_anchor } : {},
                ...args.total_duration_sec !== undefined ? { total_duration_sec: args.total_duration_sec } : {},
                created_at: new Date().toISOString(),
                segments: args.segments,
                progress: {},
            };
            const jsonText = `${JSON.stringify(doc, null, 2)}\n`;
            const mdText = renderStoryboardMarkdown(doc);
            const cwd = sessionCwd(exec);
            const resolveOpts = { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal };
            const jsonTarget = await ctx.fs.resolve(`storyboard-${slugify(doc.title)}.json`, resolveOpts);
            const mdTarget = await ctx.fs.resolve(`storyboard-${slugify(doc.title)}.md`, resolveOpts);
            const jsonOutcome = await ctx.fs.writeText(jsonTarget, jsonText, undefined, exec.signal);
            const mdOutcome = await ctx.fs.writeText(mdTarget, mdText, undefined, exec.signal);
            ctx.emit('fs/observed', jsonTarget, { kind: 'present', version: jsonOutcome.version }, exec);
            ctx.emit('fs/observed', mdTarget, { kind: 'present', version: mdOutcome.version }, exec);
            return {
                title: doc.title,
                json_path: jsonTarget.displayPath,
                markdown_path: mdTarget.displayPath,
                segment_count: doc.segments.length,
                segments: doc.segments.map(seg => ({ segment: seg.segment, beat: seg.beat })),
            };
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `导出分镜表 ${args.title}`,
                kind: 'edit',
                locations: [{ path: `storyboard-${slugify(args.title)}.md` }],
            };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'storyboard_status',
        description: '更新已导出分镜表中某个分段的制作状态（待出图/图已确认/视频已生成/修改中），可附带说明或已确认图片路径。用于"先图后视频"流水线的逐段推进。',
        parameters: {
            storyboard_path: { type: 'string', required: true, description: 'storyboard JSON 文件路径（storyboard_export 返回的 json_path）。' },
            segment: { type: 'string', required: true, description: '分段编号，如 A。' },
            status: {
                type: 'string',
                required: true,
                enum: ['image_pending', 'image_confirmed', 'video_generated', 'revising'],
                description: '该段状态：image_pending 待出图 / image_confirmed 图已确认 / video_generated 视频已生成 / revising 修改中。',
            },
            note: { type: 'string', description: '可选说明（如重做原因）。' },
            image_path: { type: 'string', description: '可选：已确认图片的文件路径。' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    storyboard_path: { type: 'string', required: true },
                    segment: { type: 'string', required: true },
                    status: { type: 'string', required: true },
                    progress: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                segment: { type: 'string', required: true },
                                status: { type: 'string', required: true },
                                note: { type: 'string' },
                                image_path: { type: 'string' },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => [{
                    type: 'text',
                    text: `段 ${value.segment} 状态已更新为 ${value.status}（${value.storyboard_path}）`,
                }],
        },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
            const cwd = sessionCwd(exec);
            const resolveOpts = { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal };
            const target = await ctx.fs.resolve(args.storyboard_path, resolveOpts);
            const info = await ctx.fs.stat(target, exec.signal);
            if (info === undefined) {
                throw new Error(`storyboard_status: 找不到分镜表文件 "${args.storyboard_path}"，请先运行 storyboard_export`);
            }
            if (info.type !== 'file')
                throw new Error(`storyboard_status: "${args.storyboard_path}" 不是文件`);
            const raw = await ctx.fs.readText(target, exec.signal);
            let doc;
            try {
                doc = JSON.parse(raw);
            }
            catch {
                throw new Error(`storyboard_status: "${args.storyboard_path}" 不是有效的 storyboard JSON`);
            }
            if (doc.schema !== SCHEMA_TAG) {
                throw new Error(`storyboard_status: "${args.storyboard_path}" 不是 dsh-screenwriter 分镜表（schema=${String(doc.schema)}）`);
            }
            const exists = doc.segments.some((seg) => seg.segment === args.segment);
            if (!exists) {
                throw new Error(`storyboard_status: 分镜表中不存在段 "${args.segment}"（现有：${doc.segments.map(seg => seg.segment).join(', ')}）`);
            }
            doc.progress[args.segment] = {
                status: args.status,
                ...args.note !== undefined ? { note: args.note } : {},
                ...args.image_path !== undefined ? { image_path: args.image_path } : {},
            };
            const outcome = await ctx.fs.writeText(target, `${JSON.stringify(doc, null, 2)}\n`, undefined, exec.signal);
            ctx.emit('fs/observed', target, { kind: 'present', version: outcome.version }, exec);
            // Keep the human-readable 分镜表 in sync with the progress.
            const mdTarget = await ctx.fs.resolve(`storyboard-${slugify(doc.title)}.md`, resolveOpts);
            const mdOutcome = await ctx.fs.writeText(mdTarget, renderStoryboardMarkdown(doc), undefined, exec.signal);
            ctx.emit('fs/observed', mdTarget, { kind: 'present', version: mdOutcome.version }, exec);
            const progress = doc.segments.map(seg => {
                const entry = doc.progress[seg.segment];
                return {
                    segment: seg.segment,
                    status: entry?.status ?? 'image_pending',
                    ...entry?.note !== undefined ? { note: entry.note } : {},
                    ...entry?.image_path !== undefined ? { image_path: entry.image_path } : {},
                };
            });
            return {
                storyboard_path: target.displayPath,
                segment: args.segment,
                status: args.status,
                progress,
            };
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `更新分段 ${args.segment} 状态：${args.status}`,
                kind: 'edit',
                locations: [{ path: args.storyboard_path }],
            };
        },
    }));
}
//# sourceMappingURL=index.js.map