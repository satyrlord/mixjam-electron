import type { TagItem } from '../../../shared/backend-api'

/** Case-insensitive substring filter over a tag list. Returns the original
 *  list (identity preserved) when the search text is blank. */
export function filterTagsBySearch(tags: TagItem[], search: string): TagItem[] {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return tags
  return tags.filter((tag) => tag.name.toLocaleLowerCase().includes(query))
}
