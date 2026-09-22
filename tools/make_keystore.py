# 生成安卓正式签名的钥匙（只跑一次）。钥匙和密码放 android/keystore/，不进 git。
# 用法：python tools/make_keystore.py   —— 已经有钥匙就直接退出，不会覆盖
import os, secrets, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KS_DIR = os.path.join(ROOT, 'android', 'keystore')
STORE = os.path.join(KS_DIR, 'miemie-release.jks')
KEYTOOL = os.path.join(ROOT, '.toolchain', 'jdk21', 'bin', 'keytool.exe')

if os.path.exists(STORE):
    sys.exit('已经有钥匙了：' + STORE + '（不覆盖。真要换钥匙，先把旧的挪走——换了钥匙，旧版用户就没法覆盖升级）')
os.makedirs(KS_DIR, exist_ok=True)
password = secrets.token_urlsafe(18)
subprocess.run([KEYTOOL, '-genkeypair', '-keystore', STORE, '-alias', 'miemie',
                '-keyalg', 'RSA', '-keysize', '4096', '-validity', '36500',
                '-storepass', password, '-keypass', password,
                '-dname', 'CN=咩咩, OU=咩咩制卡台, O=咩咩, C=CN'], check=True)
with open(os.path.join(KS_DIR, 'keystore.properties'), 'w', encoding='utf-8') as f:
    f.write(f'storeFile=miemie-release.jks\nstorePassword={password}\nkeyAlias=miemie\nkeyPassword={password}\n')
with open(os.path.join(KS_DIR, '先读我.txt'), 'w', encoding='utf-8') as f:
    f.write('这个文件夹是咩咩制卡台安卓版的正式签名钥匙。\n\n'
            '1. 备份：整个文件夹拷到网盘或 U 盘。钥匙丢了，以后打的新版就装不上去覆盖旧版，'
            '用户只能先卸载——卸载会把应用里的存档一起删掉。\n'
            '2. 别外传：谁拿到它，谁就能冒充咩咩制卡台发更新。\n'
            '3. 换电脑：把这个文件夹原样放回 MeeMee-Kaku/android/keystore/ 就能接着打包。\n')
out = subprocess.run([KEYTOOL, '-list', '-v', '-keystore', STORE, '-storepass', password],
                     capture_output=True, text=True, encoding='utf-8', errors='replace').stdout
for line in out.splitlines():
    if any(k in line for k in ('Alias', '别名', 'Owner', '所有者', 'Valid', '有效期', 'SHA256:', 'Signature algorithm', '签名算法')):
        print(line.strip())
print('钥匙在：' + KS_DIR)
