'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('Windows 图标包含 256/128/64/32/16 五个 PNG 图层', async () => {
    const icon = await fs.readFile(path.join(ROOT, 'assets', 'icon.ico'));
    assert.equal(icon.readUInt16LE(0), 0);
    assert.equal(icon.readUInt16LE(2), 1);
    const count = icon.readUInt16LE(4);
    assert.equal(count, 5);
    const sizes = [];
    for (let index = 0; index < count; index += 1) {
        const entry = 6 + index * 16;
        const width = icon[entry] || 256;
        const height = icon[entry + 1] || 256;
        const length = icon.readUInt32LE(entry + 8);
        const offset = icon.readUInt32LE(entry + 12);
        assert.equal(width, height);
        assert.equal(icon.subarray(offset, offset + 8).toString('hex'), '89504e470d0a1a0a');
        assert.ok(length > 8);
        sizes.push(width);
    }
    assert.deepEqual(sizes, [256, 128, 64, 32, 16]);
});
