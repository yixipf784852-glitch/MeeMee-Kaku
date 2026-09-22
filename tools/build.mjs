// 把 src/ 拼回单文件 HTML。桌面端、安卓端、网页版用的都是这一份。
// 用法：
//   node tools/build.mjs                 → dist/web/咩咩制卡台.html
//   node tools/build.mjs --check <文件>  → 只比对，不写盘：重拼结果和给定文件（换行统一成 LF 后）是否逐字节一致
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const read = rel => fs.readFileSync(path.join(SRC, rel), 'utf8');
const json = rel => JSON.parse(read(rel));

export function buildHtml() {
  const templates = json('templates/order.json')
    .map(id => `<script type="text/plain" data-tpl="${id}">${read(`templates/${id}.txt`)}</script>`)
    .join('\n\n');
  const js = json('js/order.json')
    .map(f => read('js/' + f))
    .join('');
  // 用函数做替换：代码里到处是 $，字符串替换会把 $& 之类当成特殊记号
  return read('shell.html')
    .replace('/*@@CSS@@*/', () => read('styles/app.css'))
    .replace('<!--@@TEMPLATES@@-->', () => templates)
    .replace('/*@@JS@@*/', () => js);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const out = buildHtml();
  const i = process.argv.indexOf('--check');
  if (i > 0) {
    const want = fs.readFileSync(process.argv[i + 1], 'utf8').replace(/\r\n/g, '\n');
    if (want === out) console.log(`一致：${out.length.toLocaleString()} 字符`);
    else {
      let k = 0;
      while (k < out.length && out[k] === want[k]) k++;
      console.log(`不一致：第 ${k} 个字符开始不同`);
      console.log('原件：', JSON.stringify(want.slice(Math.max(0, k - 60), k + 60)));
      console.log('重拼：', JSON.stringify(out.slice(Math.max(0, k - 60), k + 60)));
      process.exitCode = 1;
    }
  } else {
    // 网页版和桌面端用 dist/web；安卓壳（Capacitor）要求入口叫 index.html，另放一份到 dist/app
    for (const dest of [
      path.join(ROOT, 'dist', 'web', '咩咩制卡台.html'),
      path.join(ROOT, 'dist', 'app', 'index.html'),
    ]) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, out);
    }
    console.log(
      `写好了：dist/web/咩咩制卡台.html、dist/app/index.html（各 ${Buffer.byteLength(out).toLocaleString()} 字节）`,
    );
  }
}
