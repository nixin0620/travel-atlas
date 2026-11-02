# 创建目的地旅行：内容进入原生组件

适用于“用旅迹规划贵州七日游”等请求。不要重写应用或生成一个文本专题页。这里的 JSON 是给 agent 和脚本的协议，用户不需要填写。

## 工作流

1. 保留用户已给出的目的地、日期、预算、节奏与资料。资料不足只问影响路线的关键问题。日期未知时全部 date 留空；不填虚构酒店、车票或历史到访。
2. 先整理城市停留与跨城交通，再筛选地点。调研真实名称/分店、所在城市、具体地址和一句话介绍。价格、营业时间、交通耗时等变化信息需查证，无法确认则写明。菜名不能作为可导航地点；可用日程 note 记录用餐建议。
3. 下载合法使用的照片到内容包 media/，检查真实像素、主题是否相符和横竖构图。至少准备目的地封面、每个停留城市的图以及主要安排地点的图；可复用同一真实图，但不能把图 A 标成景点 B。地图切片/图标不是旅行配图。保留许可，不能未经确认从私人目录或任意搜索结果复制图片。
4. 生成下面格式的 trip.json，运行编译器。修正缺城市、地址、来源和日期关系等错误；逐项核对 report.warnings，不能忽略全体图片缺失后宣布成功。
5. 在当前个人工作目录写入内容 seed，再在原生「交通 & 住宿」点击「载入旅行规划」。这一步按现有备份应用事务合并数据、生成恢复快照；保留已有交通住宿、其他攻略、足迹和个人照片。
6. 浏览器检查用户实际目的地，不只看截图：日期切换、跨城日游、返回同城、原生地点图卡、My Pick、安排编辑、地图位置和刷新。确认已去过数量未因规划增加。

```sh
python3 scripts/start.py --workspace /absolute/path/my-travel --prepare-only
node scripts/build-trip.cjs /absolute/path/content/trip.json /absolute/path/my-travel
python3 scripts/start.py --workspace /absolute/path/my-travel --port 8790
```

脚本只生成 travel-plan-seed.js，不修改 HTML。第一次点击载入后数据进入浏览器保存，后续刷新不会覆盖用户修改或重复添加地点。已有 plan 时默认不载入第二份；继续旅行用原生编辑，另一趟独立旅行使用独立工作目录和端口，不强行替换旧数据。

## 内容格式

下面为结构示例，文字/链接是占位，不能直接当实用攻略交付。

```json
{
  "version": 1,
  "title": "用户的目的地旅行标题",
  "cover": {
    "file": "media/city.jpg",
    "sourceURL": "https://example.com/photo-source",
    "credit": "作者名称",
    "license": "CC BY-SA 4.0",
    "licenseURL": "https://creativecommons.org/licenses/by-sa/4.0/",
    "alt": "照片实际拍摄内容",
    "width": 1200,
    "height": 800
  },
  "cities": [{"name": "贵阳", "countryCode": "CN", "photo": null}],
  "days": [{
    "date": "",
    "city": "贵阳",
    "alsoCities": [],
    "title": "抵达后慢慢走",
    "summary": "简短安排说明",
    "stops": [
      {"placeId": "verified-place", "slot": "afternoon", "time": "15:00", "endTime": "16:00"},
      {"note": "晚餐尝试当地口味，店铺待选择。", "slot": "evening"}
    ]
  }],
  "places": [{
    "id": "verified-place",
    "name": "已查证的具体地点名称",
    "city": "贵阳",
    "kind": "sight",
    "address": "已查证的具体地址",
    "description": "一句话介绍及实用提醒",
    "sources": [{"title": "来源标题", "url": "https://example.com/place", "checkedAt": "2026-11-02"}],
    "photo": null,
    "wanted": true
  }]
}
```

- cities[].photo、places[].photo 与 cover 格式相同。正式图文交付应填实际照片；null 用于确实无图的条目并报告缺口。
- JPEG/PNG/WebP，每张不超过 2.2 MB，width≥480、height≥240；记录真实尺寸，目视确认文件可解码。图片打包进记录，备份能携带这些图片，不依赖朋友电脑上的绝对路径。照片来源入口保留署名、授权和缩放裁切说明。
- days 为连续 1–366 天。date 全部为真实规划日期 YYYY-MM-DD，或全部留空；不能一部分猜测。city 为当天住宿/主活动城市，alsoCities 用于当日跨城市地点。重复回到同一城市保留为不同天。
- stops[].slot 为 morning / afternoon / evening；具体时间不确定时 time/endTime 一起留空。中转、休息、菜名和预算说明用 note，不创建假 POI；不塞整篇文章。
- kind 为 sight / food / experience / shopping。id 在内容包中唯一，脚本生成稳定 sourceId 贯穿指南和日程。已排入日程的地点加入 My Pick，不自动点亮足迹。
- 可选 location：`{"lat":26.574907,"lng":106.716004,"coordinateSystem":"WGS84","sourceURL":"https://zh.wikipedia.org/wiki/甲秀楼"}`。必须逐个核对同一具体地点，标明坐标系；脚本记录 researched-reference 证据，不冒充用户手动确认。不能把城市中心当景点入口。无可靠坐标时省略，再用现有搜索/地图选点修正。
- 金额、交通班次和酒店订单只能依据用户已有的真实资料录入对应模块；计划日期与住宿晚数是规划，不等于已预订。

## 验收门槛

- 封面和侧栏显示这次旅行；没有“目的地待添加”和云南残留的路线。
- 城市/日期是原生控件；My Pick 和每日安排引用相同地点；能编辑，不是只读文本。
- 每个主要城市有可见实景图，主要地点卡片和日程缩略图实际加载。图片不足应继续补齐或明确列出限制。
- 地图底图真实加载；确认过的位置有图钉，未确认的不伪造。
- 修改一个日程、刷新、再导出备份，验证日期、图片、地点关联仍在；重复刷新不重复导入。
- 桌面/窄屏导航和弹窗没有遮挡。没有实际验证的系统、网络、状态不写“全部通过”。
