# @deepseek-ai/dsh-tool-screenwriter

English | [中文](README.zh.md)

Storyboard I/O tools for the `dsh-screenwriter` skill: turn the segmented
"先图后视频" storyboard into durable files and track production progress.

Companion to the `dsh-screenwriter` skill (the creative brain): this plugin is
the structured hand — validate, persist, and update storyboards so you can work
segment by segment (image → confirm → video → assemble) against files instead of
chat scrollback.

## Tools

### `storyboard_export`

Validate the segments (every `image_prompt` must carry the four image elements
`time/subject/scene/style`; every `video_prompt` the four video elements
`subject/action/effect/rhythm`), then write into the session workspace:

- `storyboard-<title>.json` — canonical structured data (schema
  `dsh-screenwriter/storyboard@1`), including `img2img_from`, `keep`/`change`,
  `transition`, and a `progress` map.
- `storyboard-<title>.md` — human-readable 分镜表 (分镜表) with per-segment
  status checkboxes, four-element prompts, img2img sources, and transitions.

### `storyboard_status`

Mark one segment's production stage — `image_pending` (待出图) /
`image_confirmed` (图已确认) / `video_generated` (视频已生成) / `revising`
(修改中) — optionally recording a note and the confirmed image path. Rewrites
the JSON and refreshes the `.md` checkboxes so the readable storyboard stays in
sync.

## Usage flow

```
剧情 → (模型按 dsh-screenwriter 技能分段) → storyboard_export
  → 逐段生成图片 → 检查 → storyboard_status (image_confirmed)
  → 以图为底生成视频 → storyboard_status (video_generated)
  → 拼接
```

## Mounting

Agent presets mount it (`standard`, `code`, `cordis`):

```yaml
- id: tool-screenwriter
  name: '@deepseek-ai/dsh-tool-screenwriter'
```

## Model Experience

Direct: pure file I/O over `ctx.fs`; no model request. Validation enforces the
four-element contract so malformed segments never reach disk.

#### KV Cache effect

None.
