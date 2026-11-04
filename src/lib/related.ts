import type { Performance } from './schemas';
export function getRelated(current: Performance, all: Performance[], limit = 3): Performance[] {
  const artists = new Set(current.artistIds);
  return all.filter((item) => item.id !== current.id).map((item) => ({ item, shared: item.artistIds.some((id) => artists.has(id)) ? 0 : 1, series: item.seriesId === current.seriesId ? 0 : 1 }))
    .sort((a,b) => a.shared-b.shared || a.series-b.series || a.item.featuredOrder-b.item.featuredOrder || a.item.id.localeCompare(b.item.id))
    .filter((entry,index,arr) => arr.findIndex((other) => other.item.id === entry.item.id) === index)
    .slice(0, Math.max(0, limit)).map((entry) => entry.item);
}
