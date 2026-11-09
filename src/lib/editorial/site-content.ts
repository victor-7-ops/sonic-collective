import rawArtists from '../../data/artists.json';
import rawClips from '../../data/clips.json';
import rawPerformances from '../../data/performances.json';
import {artistSchema,clipSchema,performanceSchema,type SiteAbout,type SiteConfig,type SiteFooter,type SiteHeader} from '../schemas';

const artists=artistSchema.array().parse(rawArtists);
const performances=performanceSchema.array().parse(rawPerformances);
const clips=clipSchema.array().parse(rawClips);

export const defaultSiteAbout:SiteAbout={
  eyebrow:'Independent voices. Shared frequencies.',heading:'About Sonic Collective',
  intro:'Sonic Collective is a place to discover independent voices through live performances and covers.',
  sessionsHeading:'Sonic Sessions',sessionsDescription:'Original songs and live performances from the collective.',
  coversHeading:'Sonic Covers',coversDescription:'Familiar songs, shared in each performer’s own voice.',
  youtubeLinkText:'Visit Sonic Collective on YouTube ↗',
};

export const defaultSiteFooter:SiteFooter={
  tagline:'Independent voices. Shared frequencies.',
  navigation:{performances:'Performances',artists:'Artists',about:'About',privacy:'Privacy'},
  socialUrls:{
    youtube:'https://www.youtube.com/@Sonic_Collective-PH',
    facebook:'https://www.facebook.com/profile.php?id=61577313503520',
    instagram:'https://www.instagram.com/sonic_collective/',
    tiktok:'https://www.tiktok.com/@sonic_collective',x:'https://x.com/CollectiveSonic',
  },
  contactLabel:'Email for collaborations',contactEmail:'soniccollective.contact@gmail.com',
  wordmark:'SONIC COLLECTIVE',copyrightYear:2026,
};

export const defaultSiteHeader:SiteHeader={
  exploreLabel:'Explore',performancesLabel:'Performances',artistsLabel:'Artists',aboutLabel:'About',youtubeLabel:'YouTube',
};

export const homepagePerformanceOptions=performances.filter(performance=>performance.approvedForSite).map(performance=>({id:performance.id,label:performance.title}));
const performanceById=new Map(performances.map(performance=>[performance.id,performance]));
const artistById=new Map(artists.map(artist=>[artist.id,artist]));
export const homepageTeaserOptions=clips.flatMap(clip=>{
  const performance=performanceById.get(clip.performanceId);
  if(!clip.approvedForSite||clip.height<=clip.width||!performance?.approvedForSite) return [];
  const names=performance.artistIds.map(id=>artistById.get(id)?.name).filter((name):name is string=>!!name).join(' & ');
  return [{id:clip.id,label:`${names} — ${performance.title}`}];
});

export function homepagePerformance(id:string) { return performances.find(performance=>performance.id===id&&performance.approvedForSite); }
export function homepageTeaser(id:string) { return homepageTeaserOptions.some(option=>option.id===id)?clips.find(clip=>clip.id===id):undefined; }

export function resolveSiteContent(site:SiteConfig) {
  return {
    about:{...defaultSiteAbout,...site.about},
    footer:{...defaultSiteFooter,...site.footer,
      navigation:{...defaultSiteFooter.navigation,...site.footer?.navigation},
      socialUrls:{...defaultSiteFooter.socialUrls,...site.footer?.socialUrls},
    },
    header:{...defaultSiteHeader,...site.header},
  };
}
