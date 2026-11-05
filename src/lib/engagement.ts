export function engagementFor(href: string | null, performanceId?: string) {
  if (performanceId) return {name:'Watch clicked',data:{performanceId}};
  if (href?.startsWith('mailto:')) return {name:'Collaboration clicked',data:{}};
  if (href && /^\/artists\/[^/?#]+\/$/.test(href)) return {name:'Artist opened',data:{artistId:href.split('/')[2]}};
  if (href?.startsWith('https://www.youtube.com/watch?v=')) return {name:'Watch on YouTube clicked',data:{}};
  return null;
}
