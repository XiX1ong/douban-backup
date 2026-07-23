import { Client } from '@notionhq/client';
import { consola } from 'consola';
import dotenv from 'dotenv';
import DB_PROPERTIES from '../cols.json';
import scrapyDouban from '../src/handle-douban';
import { fetchRSSFeeds, handleRSSFeeds } from '../src/handle-rss';
import { PropertyTypeMap } from '../src/const';
import { ItemCategory, NotionPropTypesEnum, type NotionUrlPropType } from '../src/types';
import { buildPropertyValue, getDataSourceId, sleep } from '../src/utils';

dotenv.config();

const applyChanges = process.argv.includes('--apply');
const notion = new Client({
  auth: process.env.NOTION_TOKEN,
  notionVersion: '2025-09-03',
});

type BackfillCandidate = {
  category: ItemCategory;
  pageId: string;
  link: string;
  titlePropertyName: string;
  ratingPropertyName?: string;
};

async function getRecentRatings(): Promise<Map<string, number>> {
  if (!process.env.DOUBAN_USER_ID) {
    consola.warn('DOUBAN_USER_ID is not set; rating backfill will be skipped.');
    return new Map();
  }

  const feeds = handleRSSFeeds(await fetchRSSFeeds());
  return new Map(
    feeds
      .filter((item): item is typeof item & { rating: number } => item.rating !== null)
      .map((item) => [item.link, item.rating]),
  );
}

function getPageUrl(properties: Record<string, any>): string | undefined {
  const configured = properties[DB_PROPERTIES.ITEM_LINK] as NotionUrlPropType | undefined;
  if (configured?.type === 'url' && configured.url) {
    return configured.url;
  }

  for (const property of Object.values(properties)) {
    if (property?.type === 'url' && /douban\.com\//.test(property.url || '')) {
      return property.url;
    }
  }
}

async function findCandidates(category: ItemCategory): Promise<BackfillCandidate[]> {
  const dataSourceId = getDataSourceId(category);
  if (!dataSourceId) {
    consola.info(`Skipping ${category}: no Notion data source configured.`);
    return [];
  }

  const dataSource = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  const titlePropertyName = Object.entries(dataSource.properties)
    .find(([, property]) => property.type === 'title')?.[0];
  const ratingPropertyName = Object.entries(dataSource.properties)
    .find(([name]) => name === DB_PROPERTIES.RATING)?.[0];

  if (!titlePropertyName) {
    throw new Error(`No title property found in ${category} data source.`);
  }

  const candidates: BackfillCandidate[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      filter: {
        property: titlePropertyName,
        title: { is_empty: true },
      },
    } as any);

    for (const page of response.results) {
      if (!('properties' in page)) {
        continue;
      }
      const link = getPageUrl(page.properties);
      if (!link) {
        consola.warn(`Skipping ${page.id}: no Douban item link found.`);
        continue;
      }
      candidates.push({
        category,
        pageId: page.id,
        link,
        titlePropertyName,
        ratingPropertyName,
      });
    }

    cursor = response.has_more ? response.next_cursor || undefined : undefined;
  } while (cursor);

  return candidates;
}

async function main() {
  consola.info(
    applyChanges
      ? 'Apply mode: confirmed title/rating updates will be written to Notion.'
      : 'Dry-run mode: no Notion pages will be changed.',
  );

  const recentRatings = await getRecentRatings();
  const categories = Object.values(ItemCategory);
  const candidates = (
    await Promise.all(categories.map((category) => findCandidates(category)))
  ).flat();

  consola.info(`Found ${candidates.length} page(s) with an empty title.`);

  let ready = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      const item = await scrapyDouban(candidate.link, candidate.category);
      const title = item[DB_PROPERTIES.NAME];
      if (typeof title !== 'string' || !title.trim()) {
        throw new Error('Douban page did not contain a usable title.');
      }

      const rating = recentRatings.get(candidate.link);
      consola.info(
        `${applyChanges ? 'Updating' : 'Would update'} ${candidate.pageId}: ` +
        `${title}${rating ? `, rating ${rating}` : ', rating unchanged'}`,
      );

      if (applyChanges) {
        const properties: Record<string, any> = {
          [candidate.titlePropertyName]: buildPropertyValue(
            title,
            NotionPropTypesEnum.TITLE,
            candidate.titlePropertyName,
          ),
        };

        if (rating && candidate.ratingPropertyName) {
          properties[candidate.ratingPropertyName] = buildPropertyValue(
            rating,
            PropertyTypeMap.RATING,
            candidate.ratingPropertyName,
          );
        }

        await notion.pages.update({
          page_id: candidate.pageId,
          properties,
        } as any);
        await sleep(1000);
      }
      ready++;
    } catch (error) {
      failed++;
      consola.error(`Failed to inspect ${candidate.link}:`, error);
    }
  }

  consola.info(
    `${applyChanges ? 'Updated' : 'Ready to update'} ${ready} page(s); ` +
    `${failed} page(s) failed inspection.`,
  );

  if (!applyChanges && ready > 0) {
    consola.info('Run again with --apply only after reviewing this preview.');
  }
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();
