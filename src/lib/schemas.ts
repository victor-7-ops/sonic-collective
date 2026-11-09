import { z } from 'zod';

export const seriesIdSchema = z.enum(['sessions', 'covers']);
export const publicPathSchema = z.string().regex(/^\/(?!\/)[^?#]+$/).refine((p) => !p.split('/').includes('..'), 'must be a public-root path');
export const artistSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), aliases: z.array(z.string()),
  kind: z.enum(['solo', 'group']), portrait: publicPathSchema.optional(), portraitAlt: z.string().min(1).optional(),
  focalPoint: z.string().min(1), portraitLayout: z.enum(['portrait', 'landscape']),
  bio: z.string().optional(), links: z.array(z.object({ label: z.string().min(1), url: z.url().refine((u) => u.startsWith('https://')) })),
  featuredOrder: z.number().optional(),
});
export const performanceSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), originalTitle: z.string().optional(), aliases: z.array(z.string()),
  artistIds: z.array(z.string()).min(1), seriesId: seriesIdSchema, youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  thumbnail: publicPathSchema, thumbnailAlt: z.string().min(1), episode: z.number().int().positive().optional(),
  editorialNote: z.string().min(1).optional(),
  originalArtist: z.string().optional(), publishedAt: z.iso.datetime({ offset: true }).optional(), durationSeconds: z.number().positive().optional(),
  featuredOrder: z.number(), approvedForSite: z.boolean(),
});
export const clipSchema = z.object({
  id: z.string().min(1), performanceId: z.string().min(1), poster: publicPathSchema, src: publicPathSchema,
  width: z.number().int().positive(), height: z.number().int().positive(), durationSeconds: z.number().positive(), approvedForSite: z.boolean(),
});
export const seriesSchema = z.object({ id: seriesIdSchema, title: z.string().min(1), description: z.string().min(1) });
const httpsUrl = z.url().refine((url) => url.startsWith('https://'), 'must use HTTPS');
export const siteAboutSchema = z.object({
  eyebrow: z.string().min(1).max(120), heading: z.string().min(1).max(160), intro: z.string().min(1).max(2000),
  sessionsHeading: z.string().min(1).max(120), sessionsDescription: z.string().min(1).max(1000),
  coversHeading: z.string().min(1).max(120), coversDescription: z.string().min(1).max(1000), youtubeLinkText: z.string().min(1).max(160),
});
export const siteFooterSchema = z.object({
  tagline: z.string().min(1).max(160),
  navigation: z.object({ performances: z.string().min(1).max(80), artists: z.string().min(1).max(80), about: z.string().min(1).max(80), privacy: z.string().min(1).max(80) }),
  socialUrls: z.object({ youtube: httpsUrl, facebook: httpsUrl, instagram: httpsUrl, tiktok: httpsUrl, x: httpsUrl }),
  contactLabel: z.string().min(1).max(120), contactEmail: z.email(), wordmark: z.string().min(1).max(100), copyrightYear: z.number().int().min(2000).max(2100),
});
export const siteHeaderSchema = z.object({
  exploreLabel: z.string().min(1).max(80), performancesLabel: z.string().min(1).max(80),
  artistsLabel: z.string().min(1).max(80), aboutLabel: z.string().min(1).max(80), youtubeLabel: z.string().min(1).max(80),
});
export const communityPickSchema = z.object({
  id:z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), title:z.string().trim().min(1).max(240),
  channel:z.string().trim().min(1).max(160), channelUrl:httpsUrl,
  youtubeId:z.string().regex(/^[A-Za-z0-9_-]{11}$/),
});
export const communityPicksSchema=z.array(communityPickSchema).max(12).refine(picks=>new Set(picks.map(pick=>pick.id)).size===picks.length,'Community pick IDs must be unique');
export const siteConfigSchema = z.object({
  name: z.literal('Sonic Collective'), channelUrl: z.url().refine((u) => u.startsWith('https://')),
  hero: z.object({ performanceId: z.string(), poster: publicPathSchema, portraitClipId: z.string().optional(), portraitPerformanceId: z.string().optional(), portraitPoster: publicPathSchema.optional(), portraitLoopSrc: publicPathSchema.optional(), landscapeSrc: publicPathSchema.optional() }),
  spotlightPerformanceIds: z.array(z.string()).min(1).max(4).optional(),
  featuredPerformanceIds: z.array(z.string()), featuredCoverIds: z.array(z.string()), featuredArtistIds: z.array(z.string()),
  communityPicks:communityPicksSchema.optional(),
  about: siteAboutSchema.optional(), footer: siteFooterSchema.optional(), header: siteHeaderSchema.optional(),
});
export const mediaManifestEntrySchema = z.object({
  fit: z.enum(['contain', 'cover']), aspectRatio: z.number().positive(),
  variants: z.array(z.object({ src: publicPathSchema, width: z.number().int().positive(), height: z.number().int().positive(), format: z.enum(['webp', 'jpg']) })).min(1),
});
export const catalogSchema = z.object({
  artists: z.array(artistSchema), performances: z.array(performanceSchema), clips: z.array(clipSchema), series: z.array(seriesSchema), site: siteConfigSchema,
});
export type Artist = z.infer<typeof artistSchema>;
export type Performance = z.infer<typeof performanceSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Series = z.infer<typeof seriesSchema>;
export type SiteConfig = z.infer<typeof siteConfigSchema>;
export type SiteAbout = z.infer<typeof siteAboutSchema>;
export type SiteFooter = z.infer<typeof siteFooterSchema>;
export type SiteHeader = z.infer<typeof siteHeaderSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogQuery = { format?: 'all' | 'full' | 'short' | 'unreviewed'; q: string; series: 'all' | 'sessions' | 'covers'; sort: 'featured' | 'az' | 'newest' };

