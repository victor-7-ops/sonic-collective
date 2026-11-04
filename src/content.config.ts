import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { artistSchema, clipSchema, performanceSchema, seriesSchema } from './lib/schemas';

export const collections = {
  artists: defineCollection({ loader: file('src/data/artists.json'), schema: artistSchema.omit({ id: true }) }),
  performances: defineCollection({ loader: file('src/data/performances.json'), schema: performanceSchema.omit({ id: true }) }),
  clips: defineCollection({ loader: file('src/data/clips.json'), schema: clipSchema.omit({ id: true }) }),
  series: defineCollection({ loader: file('src/data/series.json'), schema: seriesSchema.omit({ id: true }) }),
};
