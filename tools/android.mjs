// 打安卓包。JDK、SDK、Gradle 缓存、安卓用户目录全指到 .toolchain/，不碰系统和用户目录，删掉 .toolchain 就干净。
// 用法：node tools/android.mjs          → 正式包 android/app/build/outputs/apk/release/app-release.apk
//       node tools/android.mjs debug    → 调试包
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TC = path.join(ROOT, '.toolchain');
const SDK = path.join(TC, 'android-sdk');
if (!fs.existsSync(path.join(TC, 'jdk21')) || !fs.existsSync(SDK))
  throw new Error('.toolchain 里没有 JDK 或安卓 SDK。README 里有装法。');

// local.properties 按 ISO-8859-1 读：路径里的中文得写成 \uXXXX
const escaped = SDK.replace(/\\/g, '\\\\')
  .replace(':', '\\:')
  .replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
fs.writeFileSync(path.join(ROOT, 'android', 'local.properties'), `sdk.dir=${escaped}\n`);

const env = {
  ...process.env,
  JAVA_HOME: path.join(TC, 'jdk21'),
  ANDROID_HOME: SDK,
  GRADLE_USER_HOME: path.join(TC, 'gradle-home'),
  ANDROID_USER_HOME: path.join(TC, 'android-home'),
};
// 整条命令交给 shell（npx、.bat 都得靠它找）；参数都是写死的，不含外来输入
const run = (command, cwd = ROOT) => execSync(command, { cwd, env, stdio: 'inherit' });

const debug = process.argv.includes('debug');
run('node tools/build.mjs');
run('npx cap sync android');
// 用绝对路径：有的系统设了不在当前目录找可执行文件，光写 gradlew.bat 会找不到
run(
  `"${path.join(ROOT, 'android', 'gradlew.bat')}" ${debug ? 'assembleDebug' : 'assembleRelease'} --console=plain`,
  path.join(ROOT, 'android'),
);
const apk = path.join(
  ROOT,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  debug ? 'debug' : 'release',
  debug ? 'app-debug.apk' : 'app-release.apk',
);
console.log(`\n打好了：${path.relative(ROOT, apk)}（${(fs.statSync(apk).size / 1048576).toFixed(1)} MB）`);
