import assert from 'node:assert/strict';
import test from 'node:test';
import { extractRatingFromContent } from './handle-rss';

test('extracts a rating with an ASCII colon', () => {
  assert.equal(
    extractRatingFromContent('<table><tr><td><p>推荐: 力荐</p></td></tr></table>'),
    5,
  );
});

test('extracts a rating with a Chinese colon and alternate label', () => {
  assert.equal(
    extractRatingFromContent('<table><tr><td><p>评价：还行</p></td></tr></table>'),
    3,
  );
});

test('returns null for a genuinely unrated item', () => {
  assert.equal(
    extractRatingFromContent('<table><tr><td><p>备注: 没有打星</p></td></tr></table>'),
    null,
  );
});

test('returns null for an unknown rating value', () => {
  assert.equal(
    extractRatingFromContent('<table><tr><td><p>推荐: 超级喜欢</p></td></tr></table>'),
    null,
  );
});
