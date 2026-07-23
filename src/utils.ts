import dotenv from 'dotenv';
import DB_PROPERTIES from '../cols.json';
import {
  ItemCategory,
  NotionPropTypesEnum,
  type NotionRichTextPropType,
  type NotionTitlePropType,
  type NotionFilesPropType,
  type NotionDatePropType,
  type NotionMultiSelectPropType,
  type NotionNumberPropType,
  type NotionUrlPropType,
  type NotionColPropTypes,
} from './types';

dotenv.config();

type NotionDataSourceResolverClient = {
  databases: {
    retrieve: (args: { database_id: string }) => Promise<any>;
  };
  dataSources: {
    retrieve: (args: { data_source_id: string }) => Promise<any>;
  };
};

const resolvedDataSourceIds = new Map<string, string>();

/**
 * Accept a bare Notion ID or a copied Notion database URL.
 */
export function normalizeNotionId(value?: string): string {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  const compactMatch = trimmed.match(/[0-9a-f]{32}/i);
  const uuidMatch = trimmed.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  const compact = (compactMatch?.[0] || uuidMatch?.[0] || '')
    .replace(/-/g, '');

  if (compact.length !== 32) {
    return trimmed;
  }

  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ].join('-');
}

/**
 * Retrieves the data source ID for the given category.
 *
 * @param {ItemCategory} category - The category of the item.
 * @returns {string} The corresponding database ID.
 */
export function getDataSourceId(category: ItemCategory): string {
  const databasesMap = {
    [ItemCategory.Movie]: process.env.NOTION_MOVIE_DATABASE_ID,
    [ItemCategory.Music]: process.env.NOTION_MUSIC_DATABASE_ID,
    [ItemCategory.Book]: process.env.NOTION_BOOK_DATABASE_ID,
    [ItemCategory.Game]: process.env.NOTION_GAME_DATABASE_ID,
    [ItemCategory.Drama]: process.env.NOTION_DRAMA_DATABASE_ID,
  };
  return normalizeNotionId(databasesMap[category]);
}

/**
 * Resolve legacy Notion database IDs to the data source IDs required by the
 * 2025-09-03 API. Already-configured data source IDs continue to work.
 */
export async function resolveDataSourceId(
  client: NotionDataSourceResolverClient,
  category: ItemCategory,
): Promise<string> {
  const configuredId = getDataSourceId(category);
  if (!configuredId) {
    return '';
  }

  const cached = resolvedDataSourceIds.get(configuredId);
  if (cached) {
    return cached;
  }

  try {
    const database = await client.databases.retrieve({
      database_id: configuredId,
    });
    const resolved = database.data_sources?.[0]?.id;
    if (!resolved) {
      throw new Error(
        `Notion database ${configuredId} does not contain a data source.`,
      );
    }
    resolvedDataSourceIds.set(configuredId, resolved);
    return resolved;
  } catch (databaseError) {
    try {
      const dataSource = await client.dataSources.retrieve({
        data_source_id: configuredId,
      });
      const resolved = dataSource.id || configuredId;
      resolvedDataSourceIds.set(configuredId, resolved);
      return resolved;
    } catch {
      throw databaseError;
    }
  }
}

/**
 * Delays the execution of a function by a specified number of milliseconds.
 *
 * @param {number} ms - The number of milliseconds to sleep
 * @return {Promise<void>} A Promise that resolves after the specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Generates the value for a property based on the given parameters, ready to insert
 * into notion database.
 *
 * @param {any} value - the value to be processed
 * @param {NotionPropTypesEnum} type - the type of the Notion database property
 * @param {string} key - the key associated with the property
 * @return {any} the generated value for the property later will be sent to notion to create an item
 */
export function buildPropertyValue(value: any, type: NotionPropTypesEnum, key: string): NotionColPropTypes | undefined {
  switch (type) {
    case NotionPropTypesEnum.TITLE:
      return {
        type: NotionPropTypesEnum.TITLE,
        title: [
          {
            text: {
              content: value,
            },
          },
        ],
      } as NotionTitlePropType;
    case NotionPropTypesEnum.FILES:
      return {
        type: NotionPropTypesEnum.FILES,
        files: [
          {
            name: value,
            type: 'external',
            external: {
              url: value
            },
          },
        ],
      } as NotionFilesPropType;
    case NotionPropTypesEnum.DATE:
      return {
        type: NotionPropTypesEnum.DATE,
        date: {
          start: value,
        },
      } as NotionDatePropType;
    case NotionPropTypesEnum.MULTI_SELECT:
      return key === DB_PROPERTIES.RATING
        ? {
          type: NotionPropTypesEnum.MULTI_SELECT,
          multi_select: value
            ? [{ name: value.toString() }]
            : [],
        } as NotionMultiSelectPropType
        : {
          type: NotionPropTypesEnum.MULTI_SELECT,
          multi_select: (value || []).map((g: string) => ({ name: g })),
        } as NotionMultiSelectPropType;
    case NotionPropTypesEnum.RICH_TEXT:
      return {
        type: NotionPropTypesEnum.RICH_TEXT,
        rich_text: [
          {
            type: 'text',
            text: {
              content: value || '',
            },
          },
        ],
      } as NotionRichTextPropType;
    case NotionPropTypesEnum.NUMBER:
      return {
        type: NotionPropTypesEnum.NUMBER,
        number: value ? Number(value) : null,
      } as NotionNumberPropType;
    case NotionPropTypesEnum.URL:
      return {
        type: NotionPropTypesEnum.URL,
        url: value,
      } as NotionUrlPropType;
    default:
      break;
  }
}
