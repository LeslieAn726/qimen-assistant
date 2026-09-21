'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

async function read(relativePath) {
    return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

test('开源协作和模块说明文档齐全', async () => {
    const required = [
        'README.md',
        'CONTRIBUTING.md',
        'SECURITY.md',
        'PRIVACY.md',
        'CHANGELOG.md',
        'THIRD_PARTY_NOTICES.md',
        'docs/ARCHITECTURE.md',
        'docs/QIMEN_METHOD.md',
        'docs/ALMANAC.md',
        'docs/AI.md',
        'docs/RELEASE_CHECKLIST.md',
        'assets/ICON_PROVENANCE.md',
        '.github/workflows/test.yml'
    ];
    for (const filename of required) {
        const stat = await fs.stat(path.join(ROOT, filename));
        assert.ok(stat.isFile(), filename);
    }
});

test('package 许可证与现有根 LICENSE 对齐并声明支持的 Node 版本', async () => {
    const packageJson = JSON.parse(await read('package.json'));
    const packageLock = JSON.parse(await read('package-lock.json'));
    const license = await read('LICENSE');
    assert.equal(packageJson.license, 'MIT');
    assert.equal(packageLock.packages[''].license, 'MIT');
    assert.equal(packageJson.engines.node, '>=22.12.0');
    assert.match(license, /MIT License/);
});

test('Git 忽略运行数据、密钥和构建产物但保留 lockfile', async () => {
    const ignore = await read('.gitignore');
    for (const pattern of [
        'node_modules/',
        'dist/',
        'debug/',
        '*.zip',
        '.env.*',
        '/data/ai-settings.json',
        '/data/pet-settings.json',
        '/data/reminder-settings.json',
        '/data/daily-records.json',
        '/data/backups/',
        '/archive/desktop-pet/'
    ]) {
        assert.ok(ignore.includes(pattern), pattern);
    }
    assert.doesNotMatch(ignore, /package-lock\.json/);
});

test('Docker 构建上下文排除归档、构建产物、用户数据和本地工作文件', async () => {
    const ignore = await read('.dockerignore');
    for (const pattern of [
        'dist',
        'debug',
        'archive',
        '*.zip',
        '*.pptx',
        '.env.*',
        'data/daily-records.json',
        'data/ai-settings.json',
        'data/backups'
    ]) {
        assert.ok(ignore.includes(pattern), pattern);
    }
});

test('安装包保留第三方声明、启用正式图标并排除归档与开发数据', async () => {
    const builder = await read('electron-builder.yml');
    assert.match(builder, /THIRD_PARTY_NOTICES\.md/);
    assert.match(builder, /icon: assets\/icon\.ico/);
    assert.match(builder, /!assets\/icon-source\.png/);
    assert.match(builder, /!archive\/\*\*\/\*/);
    assert.doesNotMatch(builder, /(?:assets\/pets|public\/pet|pet\/\*\*|pet-dialogues)/);
});

test('V2.6 beta 版本在 package 与 lockfile 中保持一致', async () => {
    const packageJson = JSON.parse(await read('package.json'));
    const packageLock = JSON.parse(await read('package-lock.json'));
    assert.equal(packageJson.version, '2.6.0-beta');
    assert.equal(packageLock.version, packageJson.version);
    assert.equal(packageLock.packages[''].version, packageJson.version);
});

test('README 不包含开发者本机绝对路径或真实密钥形态', async () => {
    const source = await read('README.md');
    assert.doesNotMatch(source, /[A-Z]:\\(?:Users|[^\\]+课程设计)\\/i);
    assert.doesNotMatch(source, /sk-[a-z0-9_-]{16,}/i);
    assert.match(source, /ChatGPT Plus\/Pro 订阅不等于 OpenAI API 额度/);
    assert.match(source, /本地优先的奇门遁甲 \+ 黄历 \+ AI 可选桌面助手/);
    assert.doesNotMatch(source, /桌宠|小狐仙|Pet Engine/i);
});

test('核心发行树不再包含桌宠运行目录或桌宠 npm script', async () => {
    const packageJson = JSON.parse(await read('package.json'));
    for (const relativePath of ['assets/pets', 'public/pet', 'pet', 'electron/pet-window.js', 'electron/pet-preload.js']) {
        await assert.rejects(fs.access(path.join(ROOT, relativePath)));
    }
    assert.equal(Object.keys(packageJson.scripts).some((name) => name.startsWith('pet:')), false);
});

test('Electron 只启动主窗口并继续在退出时释放自建 Express 服务', async () => {
    const main = await read('electron/main.js');
    const expressEntry = await read('app.js');
    assert.match(main, /await createMainWindow\(startupPage\)/);
    assert.match(main, /await closeOwnedExpressServer\(\)/);
    assert.doesNotMatch(main, /createPetController|petWindow|petController|show-pet-message|ipcMain/);
    assert.doesNotMatch(expressEntry, /pet-settings-storage|\/api\/pet\/settings|getPetSettingsStorage/);
});

test('今日页与全局主题包含视觉精修结构', async () => {
    const today = await read('views/today.html');
    const theme = await read('public/css/theme-dark-star.css');
    assert.match(today, /class="today-hero"/);
    assert.match(today, /almanac-yi-ji/);
    assert.match(today, /trend-status-card/);
    assert.match(today, /best-gong/);
    assert.match(theme, /@keyframes star-page-enter/);
    assert.match(theme, /prefers-reduced-motion: reduce/);
    assert.match(theme, /\.gong\.best-gong/);
    assert.match(theme, /@media \(max-width: 768px\)/);
});
