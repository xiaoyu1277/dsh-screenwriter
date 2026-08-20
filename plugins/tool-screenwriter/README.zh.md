# @deepseek-ai/dsh-tool-screenwriter

English | [中文](README.zh.md)

`dsh-screenwriter` 技能的分镜 I/O 工具：把分段式"先图后视频"分镜表落盘成文件，并跟踪制作进度。

与 `dsh-screenwriter` 技能（创作脑）配套：本插件是结构化之手——校验、持久化、更新分镜表，让你可以按"图片 → 确认 → 视频 → 拼接"逐段对着文件推进，而不是翻聊天记录。

## 工具

### `storyboard_export`

校验分段（每个 `image_prompt` 必须含画面四要素 `time/subject/scene/style`；每个 `video_prompt` 必须含场景四要素 `subject/action/effect/rhythm`），然后写入会话工作区：

- `storyboard-<标题>.json` —— 结构化数据（schema `dsh-screenwriter/storyboard@1`），含 `img2img_from`、`keep`/`change`、`transition` 与 `progress` 状态表。
- `storyboard-<标题>.md` —— 可读分镜表：逐段状态勾选、四要素提示词、图生图来源、衔接设计。

### `storyboard_status`

标记某分段状态——`image_pending`（待出图）/ `image_confirmed`（图已确认）/ `video_generated`（视频已生成）/ `revising`（修改中），可附说明与已确认图片路径。重写 JSON 并同步刷新 `.md` 勾选。

## 使用流程

```
剧情 → (模型按 dsh-screenwriter 技能分段) → storyboard_export
  → 逐段生成图片 → 检查 → storyboard_status (image_confirmed)
  → 以图为底生成视频 → storyboard_status (video_generated)
  → 拼接
```

## 挂载

已加入 agent presets（`standard`、`code`、`cordis`）：

```yaml
- id: tool-screenwriter
  name: '@deepseek-ai/dsh-tool-screenwriter'
```

## 模型体验

直接：纯 `ctx.fs` 文件读写，不发起模型请求。校验强制四要素契约，格式错误的分段不会落盘。

#### KV Cache 影响

无。
