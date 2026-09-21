'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('四个产品页面统一接入本地深色星空主题', async () => {
    const pages = {
        'today.html': 'page-today',
        'history.html': 'page-history',
        'settings.html': 'page-settings',
        'about.html': 'page-about'
    };

    for (const [filename, pageClass] of Object.entries(pages)) {
        const source = await fs.readFile(path.join(ROOT, 'views', filename), 'utf8');
        assert.match(source, /href="css\/theme-dark-star\.css"/);
        assert.match(source, new RegExp(`<body class="theme-dark-star ${pageClass}">`));
    }
});

test('主题资源完全本地并包含核心视觉与响应式规则', async () => {
    const theme = await fs.readFile(path.join(ROOT, 'public', 'css', 'theme-dark-star.css'), 'utf8');
    assert.match(theme, /--star-bg-deep:/);
    assert.match(theme, /\.theme-dark-star \.panel/);
    assert.match(theme, /\.theme-dark-star \.form-control:focus/);
    assert.match(theme, /\.theme-dark-star \.pan-grid/);
    assert.match(theme, /@media \(max-width: 768px\)/);
    assert.doesNotMatch(theme, /url\s*\(\s*["']?https?:/i);
});
