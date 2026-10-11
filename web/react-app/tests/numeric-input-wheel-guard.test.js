import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const inputSource = await readFile(new URL('../src/components/ui/Input.jsx', import.meta.url), 'utf8');

test('shared numeric inputs ignore accidental mouse-wheel and touchpad value changes', () => {
  assert.match(inputSource, /allowWheelChange\s*=\s*false/);
  assert.match(inputSource, /type\s*===\s*'number'/);
  assert.match(inputSource, /event\.currentTarget\.blur\(\)/);
  assert.match(inputSource, /onWheel=\{handleWheel\}/);
});

test('wheel-change protection can be explicitly overridden without swallowing custom handlers', () => {
  assert.match(inputSource, /onWheel\?\.\(event\)/);
  assert.match(inputSource, /!allowWheelChange/);
  assert.match(inputSource, /!event\.defaultPrevented/);
});
