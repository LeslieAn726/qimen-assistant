'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {app, nativeImage} = require('electron');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'assets', 'icon-source.png');
const ICON = path.join(ROOT, 'assets', 'icon.ico');
const ICON_SIZES = Object.freeze([256, 128, 64, 32, 16]);

function createIco(images) {
    const directorySize = 6 + images.length * 16;
    const header = Buffer.alloc(directorySize);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(images.length, 4);
    let offset = directorySize;
    images.forEach(({size, png}, index) => {
        const entry = 6 + index * 16;
        header[entry] = size === 256 ? 0 : size;
        header[entry + 1] = size === 256 ? 0 : size;
        header[entry + 2] = 0;
        header[entry + 3] = 0;
        header.writeUInt16LE(1, entry + 4);
        header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(png.length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += png.length;
    });
    return Buffer.concat([header, ...images.map(({png}) => png)]);
}

async function main() {
    const source = nativeImage.createFromPath(SOURCE);
    if (source.isEmpty()) throw new Error(`无法读取图标源图：${SOURCE}`);
    const images = ICON_SIZES.map((size) => ({
        size,
        png: source.resize({width: size, height: size, quality: 'best'}).toPNG()
    }));
    await fs.writeFile(ICON, createIco(images));
    console.log(`已生成 ${path.relative(ROOT, ICON)}：${ICON_SIZES.join(', ')} px`);
}

app.whenReady()
    .then(main)
    .then(() => app.quit())
    .catch((error) => {
        console.error('生成品牌图标失败:', error);
        app.exitCode = 1;
        app.quit();
    });
