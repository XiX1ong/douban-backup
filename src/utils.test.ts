import assert from 'node:assert/strict';
import test from 'node:test';
import { ItemCategory } from './types';
import { normalizeNotionId, resolveDataSourceId } from './utils';

test('normalizes a Notion database URL to a UUID', () => {
  assert.equal(
    normalizeNotionId(
      'https://www.notion.so/Movies-c437a3a0de2d459cb07b1005cac9115f?v=abc',
    ),
    'c437a3a0-de2d-459c-b07b-1005cac9115f',
  );
});

test('resolves a legacy database ID to its data source ID', async () => {
  const previous = process.env.NOTION_MOVIE_DATABASE_ID;
  process.env.NOTION_MOVIE_DATABASE_ID = '11111111-1111-1111-1111-111111111111';

  const client = {
    databases: {
      retrieve: async () => ({
        data_sources: [{ id: '22222222-2222-2222-2222-222222222222' }],
      }),
    },
    dataSources: {
      retrieve: async () => {
        throw new Error('data source fallback should not run');
      },
    },
  };

  try {
    assert.equal(
      await resolveDataSourceId(client, ItemCategory.Movie),
      '22222222-2222-2222-2222-222222222222',
    );
  } finally {
    if (previous === undefined) {
      delete process.env.NOTION_MOVIE_DATABASE_ID;
    } else {
      process.env.NOTION_MOVIE_DATABASE_ID = previous;
    }
  }
});
