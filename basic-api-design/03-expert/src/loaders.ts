import DataLoader from 'dataloader';
import { findAuthorsByIds, Author } from './data';

/** Create loaders per HTTP/GraphQL request — never share across users */
export function createLoaders() {
  const authorLoader = new DataLoader<string, Author | null>(async (ids) => {
    const rows = await findAuthorsByIds(ids);
    const map = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => map.get(id) ?? null);
  });

  return { authorLoader };
}

export type Loaders = ReturnType<typeof createLoaders>;
