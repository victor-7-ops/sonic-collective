import { z } from 'zod';

export const seriesIdSchema = z.enum(['sessions', 'covers']);
export const publicPathSchema = z.string().regex(/^\/(?!\/)[^?#]+$/).refine((p) => !p.split('/').includes('..'), 'must be a public-root path');
export const artistSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), aliases: z.array(z.string()),
  kind: z.enum(['solo', 'group']), portrait: publicPathSchema, portraitAlt: z.string().min(1),
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
export const siteConfigSchema = z.object({
  name: z.literal('Sonic Collective'), channelUrl: z.url().refine((u) => u.startsWith('https://')),
  hero: z.object({ performanceId: z.string(), poster: publicPathSchema, portraitClipId: z.string().optional(), portraitPerformanceId: z.string().optional(), portraitPoster: publicPathSchema.optional(), portraitLoopSrc: publicPathSchema.optional(), landscapeSrc: publicPathSchema.optional() }),
  featuredPerformanceIds: z.array(z.string()), featuredCoverIds: z.array(z.string()), featuredArtistIds: z.array(z.string()),
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
export type Catalog = z.infer<typeof catalogSchema>;
export type CatalogQuery = { format?: 'all' | 'full' | 'short' | 'unreviewed'; q: string; series: 'all' | 'sessions' | 'covers'; sort: 'featured' | 'az' | 'newest' };

