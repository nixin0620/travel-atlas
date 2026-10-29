# 旅迹 · Travel Atlas

一套可在本机运行的旅行应用，也可以作为 Codex skill 安装。把交通住宿、每日行程、攻略与 My Pick 放在一起，再用中国/世界足迹地图记录照片和回忆。

这份体验版来自正在使用的最新应用，包含简化后的设置入口、六种配色及整份备份功能。无需付费 AI API 即可启动。

## 最快体验

安装 Python 3.10 或更新版本，下载仓库 ZIP 并解压，在仓库目录运行：

```sh
python3 scripts/start.py --workspace ./my-travel --port 8790 --open
```

Windows 可用 `py -3` 代替 `python3`。保持终端运行，浏览器打开 **http://127.0.0.1:8790/#route**。再次运行同一命令会复用工作目录，不覆盖已有文件。

首次个人数据为空。建议从「交通 & 住宿」录入一项安排，然后到每日行程查看联动；也可以直接点亮城市、添加回忆，或粘贴攻略正文整理 My Pick。

## 作为 skill 安装

把仓库链接 https://github.com/nixin0620/travel-atlas 发给 Codex，并说：

> 请从这个 GitHub 仓库安装根目录中的 travel-atlas skill，然后启动旅迹并打开预览。

也可以将整个仓库文件夹命名为 `travel-atlas`，放入 `~/.agents/skills/`，再说：

> 使用 $travel-atlas 启动我的旅行应用。

请复制整个文件夹，不要只复制 `SKILL.md`。安装位置参见 [Codex 官方 skills 文档](https://developers.openai.com/codex/skills/)。

## 当前包含

- 交通住宿记录、每日日期切换、顺序与安排联动。
- 公开攻略链接/正文导入，地点比较、My Pick、地图添加和修改位置。
- 中国与世界足迹总览、心愿城市、照片回忆和足迹回放。
- 六种主题；统一的「设置 → 外观与配色 / 数据与备份」。
- 浏览器本地保存、完整导出、恢复前快照，最近五份快照保留。

## 使用边界

这是应用体验版，内置云南编辑示例，不是全目的地自动生成器。公开版没有作者的订单、旅行照片、已去过记录或 API 密钥。照片示例换成标注清楚的插画；上传自己的照片后仍使用原有相册界面。

地图默认使用现有 OpenStreetMap 路径；高德可选，需配置自己的 Key。地图、POI 和公开攻略读取需要联网，平台限制访问时可改为粘贴正文。长图 OCR 目前需要 macOS 和 Swift 工具；其他系统可使用基础功能。详细说明见 [运行与地图](references/runtime.md)。

数据保存在当前浏览器，清理浏览器前请通过设置备份。GitHub 仅承载代码；完整体验需要启动本地服务，并非打开仓库网页就能在线使用。

## 首版验证

已在 macOS 浏览器检查空数据启动、新增住宿、每日行程联动、刷新保存和备份下载。复用的地图与备份逻辑共有 51 项回归测试通过；安装 Node.js 后可运行 `node --test tests/*.test.cjs`。Node.js 仅用于测试，应用启动不需要它。

本次网络环境中地点搜索能够返回候选结果，OpenStreetMap 底图出现部分加载失败；尚未验证所有网络环境、Windows 和 Linux。地图候选需要自行核对，亦可配置自己的高德服务。

## 目录

```text
SKILL.md             Agent 使用入口
scripts/start.py     一条命令复制并启动应用
assets/app/          最新界面与本地服务
references/          环境、地图、保存说明
```

自有代码使用 [MIT License](LICENSE)。第三方组件、地图数据和联网服务保留各自条款，见 [第三方说明](THIRD_PARTY_NOTICES.md)。
