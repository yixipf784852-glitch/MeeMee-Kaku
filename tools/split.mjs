// 【已用过一次】2026-09-22 用它把单文件拆成了 src/；从此以 src/ 为准，改代码改 src/，别再拆。
// 一次性：把单文件 咩咩制卡台.html 拆进 src/。
// 拆完跑 `node tools/build.mjs --check <原文件>`，重拼结果必须和原件（换行统一成 LF 后）逐字节一致。
// 用法：node tools/split.mjs <咩咩制卡台.html>
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const input = process.argv[2];
if (!input) throw new Error('用法：node tools/split.mjs <咩咩制卡台.html>');
const html = fs.readFileSync(input, 'utf8').replace(/\r\n/g, '\n');

const write = (rel, text) => {
  const p = path.join(SRC, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
};
const take = (from, marker, after = true) => {
  const i = html.indexOf(marker, from);
  if (i < 0) throw new Error('找不到：' + marker);
  return after ? i + marker.length : i;
};

// 样式
const css0 = take(0, '<style>\n'), css1 = take(css0, '</style>', false);

// 模板：12 份 <script type="text/plain" data-tpl>，原文一字不改
const tpls = [...html.matchAll(/<script type="text\/plain" data-tpl="([^"]+)">([\s\S]*?)<\/script>/g)];
const gaps = tpls.slice(1).map((m, i) => html.slice(tpls[i].index + tpls[i][0].length, m.index));
if (gaps.some(g => g !== '\n\n')) throw new Error('模板之间的间隔不是统一的空行：' + JSON.stringify(gaps));
const tpl0 = tpls[0].index, tpl1 = tpls.at(-1).index + tpls.at(-1)[0].length;

// 主脚本
const js0 = take(tpl1, '<script>\n'), js1 = html.lastIndexOf('</script>');
const js = html.slice(js0, js1);

// 脚本按区块标记切开；文件名固定，顺序跟原文件走（修卡台在启动之前）
const FILES = {
  '一、常量与段位表': '01-constants.js',
  '二、PNG 读写': '02-png.js',
  '三、卡归一化': '03-normalize.js',
  '四、分区判定': '04-classify.js',
  '五、体检': '05-diagnose.js',
  '六、缺件盘点': '06-parts.js',
  '七、装配': '07-assemble.js',
  '八、格式自检 CHECK': '08-check.js',
  '九、接口层': '09-api.js',
  '十、生成件定义': '10-prompts.js',
  '十一、一键出卡队列': '11-queue.js',
  '十二、持久化': '12-storage.js',
  '十三、界面 · 流水线': '13-ui-pipeline.js',
  '十四、界面 · 零件台': '14-ui-parts.js',
  '十六、界面 · 修卡台': '15-ui-repair.js',
  '十五、启动': '16-boot.js',
};
const marks = [...js.matchAll(/^\/\* ═+ (.+?) ═+ \*\/$/gm)];
if (marks.length !== Object.keys(FILES).length) throw new Error('区块数不对：' + marks.map(m => m[1]).join('、'));
const order = ['00-prelude.js'];
write('js/00-prelude.js', js.slice(0, marks[0].index));
marks.forEach((m, i) => {
  const name = FILES[m[1]];
  if (!name) throw new Error('没见过的区块：' + m[1]);
  write('js/' + name, js.slice(m.index, i + 1 < marks.length ? marks[i + 1].index : js.length));
  order.push(name);
});

write('styles/app.css', html.slice(css0, css1));
for (const [, id, text] of tpls) write(`templates/${id}.txt`, text);
write('templates/order.json', JSON.stringify(tpls.map(m => m[1]), null, 2) + '\n');
write('js/order.json', JSON.stringify(order, null, 2) + '\n');
write('shell.html',
  html.slice(0, css0) + '/*@@CSS@@*/' + html.slice(css1, tpl0) +
  '<!--@@TEMPLATES@@-->' + html.slice(tpl1, js0) + '/*@@JS@@*/' + html.slice(js1));

console.log(`拆好了：${order.length} 个脚本文件，${tpls.length} 份模板，样式 ${(css1 - css0).toLocaleString()} 字符`);
