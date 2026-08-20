# dsh-screenwriter — 短剧编剧技能 + 分镜插件

> DeepSeek Harness（DSH）短剧/影视编剧技能与配套分镜工具插件。
> 面向"先图后视频"（图生视频）生产流水线：剧情 → 分段 → 逐段出图 → 视觉检查 → 以图为底生成视频 → 拼接。

## 内容

| 目录 | 说明 |
|---|---|
| [`skill/dsh-screenwriter/`](skill/dsh-screenwriter/SKILL.md) | 编剧技能（SKILL.md）：画面四要素（时间/主体/场景/风格）与场景四要素（主体/动作/效果/节奏）提示词规范、图生图一致性策略、衔接设计、分段工作流 |
| [`plugins/tool-screenwriter/`](plugins/tool-screenwriter/) | 分镜 I/O 插件：`storyboard_export`（校验四要素并落盘 JSON + 分镜表 Markdown）、`storyboard_status`（逐段标记 待出图/图已确认/视频已生成/修改中，同步刷新分镜表） |

## 工作流

```
剧情梗概
  → 分段（每段一个镜头语义，3–5 秒）
  → 风格锚点图 S（定调）
  → 逐段生成图片 A/B/C/D/E/F（画面四要素 + 图生图来源）
  → 用户逐张检查（可配合视觉模型自动核对四要素）
  → 逐段生成视频 1/2/3…（场景四要素，以该段图片为底图）
  → 拼接
```

图生图一致性：`S → A → B,C → D,E,F` 辐射式派生，每张图标注「保持/变更」，避免外观漂移。

## 安装

### 技能

把 `skill/dsh-screenwriter/` 复制到 DSH 用户技能目录（文件系统 provider 热监听，新会话即可用）：

```bash
mkdir -p ~/.dsh/skills
cp -R skill/dsh-screenwriter ~/.dsh/skills/
```

### 插件

该插件为 deepseek-harness monorepo 包（依赖 `workspace:^`）。安装方式：

1. 将 `plugins/tool-screenwriter/` 放入检出仓库的 `packages/creative/tool-screenwriter/`
2. 在 `packages/bundle/base/package.json` 的 dependencies 加入
   `"@deepseek-ai/dsh-tool-screenwriter": "workspace:^"`
3. 在 agent presets（`apps/cli/config/agent-presets/{standard,code,cordis}/agent.cordis.yml`）加入：

```yaml
- id: tool-screenwriter
  name: '@deepseek-ai/dsh-tool-screenwriter'
```

4. `pnpm install && pnpm run build:lib:host`

### 工具

- `storyboard_export`：校验分段（`image_prompt` 必含 时间/主体/场景/风格；`video_prompt` 必含 主体/动作/效果/节奏），写入工作区 `storyboard-<标题>.json` 与 `storyboard-<标题>.md`
- `storyboard_status`：标记某段状态 `image_pending / image_confirmed / video_generated / revising`，可附说明与已确认图片路径

## License

MIT — 插件源码在 DeepSeek Harness（[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)）MIT 仓库内开发。
