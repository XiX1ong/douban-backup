import assert from 'node:assert/strict';
import test from 'node:test';
import { getTitlePropertyName } from './handle-notion';

test('detects the title property in the original Notion template', () => {
  assert.equal(
    getTitlePropertyName({
      海报: { type: 'files' },
      标题: { type: 'title' },
      个人评分: { type: 'multi_select' },
    }),
    '标题',
  );
});

test('detects the title property in the category-specific template', () => {
  assert.equal(
    getTitlePropertyName({
      海报: { type: 'files' },
      '电影/电视剧/番组': { type: 'title' },
    }),
    '电影/电视剧/番组',
  );
});

test('returns undefined when a data source has no title property', () => {
  assert.equal(
    getTitlePropertyName({
      海报: { type: 'files' },
    }),
    undefined,
  );
});
