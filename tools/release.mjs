// 把构建好的东西拷进 ../发布/，并打源码包：
//   发布/咩咩制卡台/咩咩制卡台.html              网页版
//   发布/MeeMee-Kaku/desktop/…-setup.exe、…-portable.exe   桌面端
//   发布/MeeMee-Kaku/android/MeeMee-Kaku-版本.apk      安卓正式包（调试包不外发）
//   发布/MeeMee-Kaku-source-版本.zip                  源码包：和 git 提交内容一致，不含钥匙、工具链、构建产物、测试
// 先跑 npm run build、npm run desktop:dist、npm run android:apk，再跑这个。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const REPO = path.resolve(ROOT, '..');
const OUT = path.join(REPO, '发布');
const NAME = path.basename(ROOT); // MeeMee-Kaku
const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const report = to => console.log(`${path.relative(OUT, to)}  ${(fs.statSync(to).size / 1048576).toFixed(1)} MB`);
const copy = (from, to) => {
  if (!fs.existsSync(from)) return console.log('跳过（还没构建）：' + path.relative(ROOT, from));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  report(to);
};

copy(path.join(ROOT, 'dist', 'web', '咩咩制卡台.html'), path.join(OUT, '咩咩制卡台', '咩咩制卡台.html'));
for (const kind of ['setup', 'portable'])
  copy(
    path.join(ROOT, 'dist', 'desktop', `${NAME}-${version}-${kind}.exe`),
    path.join(OUT, NAME, 'desktop', `${NAME}-${version}-${kind}.exe`),
  );
copy(
  path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
  path.join(OUT, NAME, 'android', `${NAME}-${version}.apk`),
);

// 源码包：用临时暂存区挑文件（照 .gitignore，另外不带 test/），不动真正的暂存区
const index = path.join(os.tmpdir(), `miemie-release-index-${process.pid}`);
const git = (...args) =>
  execFileSync('git', args, { cwd: REPO, env: { ...process.env, GIT_INDEX_FILE: index }, encoding: 'utf8' }).trim();
try {
  git('add', '--', NAME, `:(exclude)${NAME}/test`);
  const files = git('ls-files', '--', NAME).split('\n').filter(Boolean);
  if (files.some(f => /keystore\/|\.jks$|local\.properties|\.toolchain\//.test(f)))
    throw new Error('源码包里混进了钥匙或本机文件，没打包');
  const tree = git('write-tree');
  const zip = path.join(OUT, `${NAME}-source-${version}.zip`);
  git('archive', '--format=zip', `--prefix=${NAME}/`, '-o', zip, `${tree}:${NAME}`);
  report(zip);
  console.log(`  （${files.length} 个文件）`);
} finally {
  fs.rmSync(index, { force: true });
}
