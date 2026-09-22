# 咩咩制卡台 · 开发者速查

## 快速参考

| 项 | 内容 |
|---|---|
| 是什么 | SillyTavern 角色卡制作与修复工具，一份源码出网页版单文件 HTML、Windows 桌面版、安卓 APK |
| 技术栈 | 原生 JS（经典脚本，不用框架和打包器）；桌面壳 Electron 44；安卓壳 Capacitor 8；构建与测试 Node 24；格式化 Prettier |
| 构建 | 有。`src/` 按 `js/order.json` 拼成一个脚本，连同样式、12 份模板塞进 `src/shell.html` → `dist/web/咩咩制卡台.html` 和 `dist/app/index.html` |
| 入口 | 页面 `src/shell.html` + `src/js/16-boot.js`；桌面壳 `desktop/main.cjs`；安卓工程 `android/` |
| 公开 API | 没有对外 API；是独立应用。脚本内部靠共享顶层作用域互相调用 |
| **尚未完成** | 真手机验收未做（只在模拟器上测过）；安卓端回复不流式显示；桌面端没有代码签名；没有 iOS 版；模拟器在中文路径下起不来，需英文名目录联接；缺件盘点还不检查「记忆相关」分区和备选开场的数量 |

## 仓库结构

```
src/            页面源码：骨架、样式、模板、按区块分的脚本
desktop/        桌面壳和图标
android/        安卓工程（Capacitor 生成，改过包名、图标、签名、版本号）
test/           回归测试与标准答案（不进 git）
tools/          构建、发布、图标、签名、安卓打包与自检
```

<details><summary>文件级明细</summary>

```
src/shell.html                页面骨架，留三个占位：/*@@CSS@@*/、<!--@@TEMPLATES@@-->、/*@@JS@@*/
src/styles/app.css            全部样式，亮暗两套变量
src/templates/*.txt           12 份生成模板（《咩咩制卡预设》原文，一字不改），order.json 定顺序
src/js/00-prelude.js          工具函数、全局状态 S / R / RC / RG、PLATFORM、下载
src/js/01-constants.js        分区表、字段模板、分类正则
src/js/02-png.js              PNG 读写（chara / ccv3 双块）
src/js/03-normalize.js        各种卡格式归一成 ccv3
src/js/04-classify.js         条目分区判定
src/js/05-diagnose.js         结构体检
src/js/06-parts.js            缺件盘点、条目模板识别
src/js/07-assemble.js         装配（repair + 保护层 assembleCard）
src/js/08-check.js            正文格式检查、报错分档
src/js/09-api.js              OpenAI 兼容接口：流式 / 整段 SSE / JSON
src/js/10-prompts.js          提示词拼装
src/js/11-queue.js            三波并发队列
src/js/12-storage.js          IndexedDB 存档与生成历史
src/js/13-ui-pipeline.js      出卡流水线界面、条目高级设置
src/js/14-ui-parts.js         零件台界面
src/js/15-ui-repair.js        修卡台界面
src/js/16-boot.js             启动、事件绑定
desktop/main.cjs              Electron 主进程；--selftest 自检
tools/build.mjs               拼单文件；--check 与给定文件逐字节比对
tools/release.mjs             拷发布物、打源码包
tools/android.mjs             打安卓包（工具链指向 .toolchain/）
tools/android-selftest.mjs    模拟器 / 真机上连 WebView 自检
tools/make_keystore.py        生成正式签名钥匙（只跑一次）
tools/make_icon.py、make_android_assets.py   图标与安卓素材
tools/split.mjs               当初把单文件拆成 src 的一次性脚本
```

</details>

## 加载与数据流

1. 构建：`tools/build.mjs` 按 `js/order.json` 顺序把脚本首尾相接，保持一个 `'use strict'` 脚本、共享顶层作用域。
2. 启动：`16-boot.js` 的 `init()` → 读 `localStorage` 配置 → 从 IndexedDB 恢复工程 → 渲染当前步骤。
3. 出卡：填资料 → `checkParts` 盘点 → `createJobs` 生成任务 → 三波并发调接口 → `checkText` 自检（不过则带缺项重试一次）→ `applyGen` 装进卡 → 导出前 `assembleCard` 整理结构。
4. 修卡：读卡 → `normalize` → `diagnose` 体检 → `assembleCard` 修结构 → 与原卡按条目 id 对照出改前改后 → 可重铸不合模板的正文，勾选后写回原卡再重跑。
5. 导出：`cleanForExport` 去掉内部字段 → PNG 写双块并回读核对；或 JSON；或原生世界书。

<details><summary>边界情况</summary>

| 情况 | 处理 |
|---|---|
| 卡里所有条目 order 相同 | 体检报「重」；装配按数组顺序稳定排序后从大到小重编号 |
| 作者自带的清空变量条目名字不标准 | 按内容识别，原样保留，不另补一条 |
| 作者设了 @深度 / 作者注释前后等特殊位置 | 装配保留原位置和深度，不改回人设后 |
| 用户在 ⚙ 里手动改了位置、深度、启用、常驻 | 记成手动设定，整理结构后再补回；关掉对应的装配开关时清除 |
| 正文里只是提到「状态栏」「话题池」 | 不算那一类，只认条目自己的结构和名字 |
| 接口整段返回 SSE（安卓原生网络层） | 看开头：`{` / `[` 按 JSON 解析，否则按 SSE 整段解析 |
| 时间线「一次性输出完」 | 专属资料整段发送，不截在 12000 字；按篇章时截断并在提示词里注明 |
| 删条目后 8 秒内撤销 | 插回原位置，分区覆盖按条目 id 重建；工程已切换则拒绝撤销 |
| 修卡台装配时正文被改 | 装配层抛错中止，不写出结果 |

</details>

## 设置与主题

| 键 | 位置 | 默认 / 含义 |
|---|---|---|
| `miemie.cfg` | localStorage | 接口：`base` 地址、`key` 密钥、`model`、`temp` 0.8、`maxTokens` 8192、`stream` true |
| `miemie.ui` | localStorage | `theme`（system / light / dark）、`concurrency` 3、`tplId` 零件台当前模板 |
| `miemie.repair.lore` | localStorage | 修卡台的原作资料与联网开关 |
| `miemie` | IndexedDB | `projects` 工程与存档点、`history` 生成历史、`lore` 资料 |

主题：`app.css` 在 `:root` 定义颜色变量，暗色写在 `:root[data-theme="dark"]` 和系统暗色媒体查询里；`setTheme()` 改 `documentElement.dataset.theme`。

## 公开 API

没有。开发中常用的命令：

```bash
npm test                        # 15 条回归测试
npm run build                   # 出 dist/web 和 dist/app
npm run desktop                 # 从源码开桌面端
npx electron . --selftest       # 桌面端自检，结果打到控制台
npm run desktop:dist            # 打安装版 + 免安装版
npm run android:apk             # 打安卓正式包（需 .toolchain）
node tools/release.mjs          # 拷发布物、打源码包
```

## 集成现状

| 项 | 状态 |
|---|---|
| OpenAI 兼容接口 | 已接：`/chat/completions`（流式与非流式）、`/models` |
| SillyTavern 1.18 | 导出的 PNG / JSON / 世界书可导入；内嵌世界书导入后可能不自动绑定，需手动「链接到世界书」 |
| 桌面端跨域 | 窗口关掉 webSecurity，直接请求；页面走 `app://miemie` 固定源，存档落在程序数据目录 |
| 安卓端跨域 | CapacitorHttp 走原生网络层；代价是回复整段返回，不流式 |
| 安卓下载 | Filesystem 写进缓存 + Share 弹系统分享；插件从 `Capacitor.Plugins` 取 |
| 安卓 http 接口 | 已放行明文流量（清单里 `usesCleartextTraffic`），局域网自架模型可用 |
| 签名 | 安卓正式签名钥匙在 `android/keystore/`，不进 git；桌面端未签名 |
| 真机 | 未验收 |

## 开发与验证

**改代码只改 `src/`**，改完：

1. `npm test`。标准答案来自 `../制卡输出/待修/` 的六张真卡，卡不在时对应测试跳过；有意改了行为时 `UPDATE_GOLDEN=1 npm test` 重录。
2. `npm run build`，浏览器打开 `dist/web/咩咩制卡台.html` 点一遍改到的界面。
3. 桌面端：`npm run desktop:dist` 后跑 `dist/desktop/win-unpacked/咩咩制卡台.exe --selftest`。它起一个不带跨域头的假接口，查流式、非流式、读模型、存档。
4. 安卓：`npm run android:debug` 打调试包，开模拟器后 `node tools/android-selftest.mjs`。它连进 App 里的 WebView，查接口、存档和下载。
5. `node tools/release.mjs` 发布。

<details><summary>安卓工具链与模拟器</summary>

工具链全在 `.toolchain/`（不进 git）：JDK 21、安卓 SDK（platform-tools、platforms/android-36、build-tools/36.0.0）、Gradle 缓存。`tools/android.mjs` 打包时临时把 `JAVA_HOME`、`ANDROID_HOME`、`GRADLE_USER_HOME`、`ANDROID_USER_HOME` 指过去，不改系统环境变量。

- sdkmanager 装包时包名用 `/`（如 `build-tools/36.0.0`）；用 `;` 会被 cmd 拆开。
- 工程上级路径有中文，`android/gradle.properties` 里开了 `android.overridePathCheck=true`。
- 模拟器不认中文路径：先 `mklink /J D:\ChatGPT\miemie-tc <本目录>\.toolchain`，把 `ANDROID_SDK_ROOT`、`ANDROID_USER_HOME` 指到联接路径再起，用完 `rmdir` 删掉联接。
- 版本号跟着 `package.json` 走：`x.y.z` → versionCode `x*10000+y*100+z`。

</details>
