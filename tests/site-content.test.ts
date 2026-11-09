import {test} from 'node:test';
import assert from 'node:assert/strict';
import {siteConfigSchema} from '../src/lib/schemas';
import {parseEditorialPayload} from '../src/lib/editorial/content';
import {applyEditorialForm} from '../src/lib/editorial/forms';
import {defaultSiteAbout,defaultSiteFooter,defaultSiteHeader,homepagePerformance,homepagePerformanceOptions,homepageTeaserOptions,resolveSiteContent} from '../src/lib/editorial/site-content';
import rawSite from '../src/data/site.json';
import {catalog} from './fixtures';

test('legacy version-one site payload remains valid and resolves to the current public copy',()=>{
  const legacy=siteConfigSchema.parse(catalog().site);
  assert.deepEqual(applyEditorialForm('site',legacy,new URLSearchParams()),legacy);
  assert.equal('about' in legacy,false);assert.equal('footer' in legacy,false);
  assert.deepEqual(resolveSiteContent(legacy),{about:defaultSiteAbout,footer:defaultSiteFooter,header:defaultSiteHeader});
  assert.equal(defaultSiteAbout.heading,'About Sonic Collective');
  assert.equal(defaultSiteFooter.contactEmail,'soniccollective.contact@gmail.com');
});

test('submitted empty picker clears its list while omitted lists stay unchanged',()=>{
  const current=siteConfigSchema.parse(rawSite);
  const updated=applyEditorialForm('site',current,new URLSearchParams({featuredArtistIds:''}));
  assert.deepEqual(updated.featuredArtistIds,[]);
  assert.deepEqual(updated.featuredPerformanceIds,current.featuredPerformanceIds);
});

test('homepage selections derive only known artwork and teaser paths and preserve legacy media until changed',()=>{
  const current=siteConfigSchema.parse(rawSite);
  const copy=resolveSiteContent(current);
  const form=new URLSearchParams({
    'about.eyebrow':copy.about.eyebrow,'about.heading':copy.about.heading,'about.intro':copy.about.intro,
    'about.sessionsHeading':copy.about.sessionsHeading,'about.sessionsDescription':copy.about.sessionsDescription,'about.coversHeading':copy.about.coversHeading,'about.coversDescription':copy.about.coversDescription,'about.youtubeLinkText':copy.about.youtubeLinkText,
    'footer.tagline':copy.footer.tagline,'footer.navigation.performances':copy.footer.navigation.performances,'footer.navigation.artists':copy.footer.navigation.artists,'footer.navigation.about':copy.footer.navigation.about,'footer.navigation.privacy':copy.footer.navigation.privacy,
    'footer.socialUrls.youtube':copy.footer.socialUrls.youtube,'footer.socialUrls.facebook':copy.footer.socialUrls.facebook,'footer.socialUrls.instagram':copy.footer.socialUrls.instagram,'footer.socialUrls.tiktok':copy.footer.socialUrls.tiktok,'footer.socialUrls.x':copy.footer.socialUrls.x,
    'footer.contactLabel':copy.footer.contactLabel,'footer.contactEmail':copy.footer.contactEmail,'footer.wordmark':copy.footer.wordmark,'footer.copyrightYear':String(copy.footer.copyrightYear),
    'header.exploreLabel':copy.header.exploreLabel,'header.performancesLabel':copy.header.performancesLabel,'header.artistsLabel':copy.header.artistsLabel,'header.aboutLabel':copy.header.aboutLabel,'header.youtubeLabel':copy.header.youtubeLabel,
    'hero.performanceId':current.hero.performanceId,'hero.portraitClipId':current.hero.portraitClipId??'',
  });
  for(const key of ['spotlightPerformanceIds','featuredPerformanceIds','featuredCoverIds','featuredArtistIds'] as const) for(const id of current[key]??[]) form.append(key,id);
  const extended={...current,about:copy.about,footer:copy.footer,header:copy.header};
  assert.deepEqual(applyEditorialForm('site',extended,form),extended);
  const unchanged=siteConfigSchema.parse(applyEditorialForm('site',current,form));
  assert.equal(unchanged.hero.poster,current.hero.poster);
  assert.equal(unchanged.hero.portraitPoster,current.hero.portraitPoster);
  assert.equal(unchanged.hero.portraitLoopSrc,current.hero.portraitLoopSrc);

  const replacement=homepagePerformanceOptions.find(option=>option.id!==current.hero.performanceId)!;
  const teaser=homepageTeaserOptions.find(option=>option.id!==current.hero.portraitClipId)!;
  assert.ok(replacement&&teaser);
  form.set('hero.performanceId',replacement.id);
  form.set('hero.portraitClipId',teaser.id);
  form.set('hero.poster','/media/arbitrary.webp');
  const updated=siteConfigSchema.parse(applyEditorialForm('site',current,form));
  assert.equal(updated.hero.performanceId,replacement.id);
  assert.equal(updated.hero.poster,homepagePerformance(replacement.id)?.thumbnail);
  assert.deepEqual(updated.spotlightPerformanceIds,current.spotlightPerformanceIds);
  assert.equal(updated.hero.portraitClipId,teaser.id);
  assert.ok(updated.hero.portraitPoster?.startsWith('/media/clips/'));
  assert.ok(updated.hero.portraitLoopSrc?.startsWith('/media/clips/'));
  assert.throws(()=>applyEditorialForm('site',current,new URLSearchParams({'hero.performanceId':'unknown','hero.portraitClipId':current.hero.portraitClipId??''})));
  assert.throws(()=>applyEditorialForm('site',current,new URLSearchParams({'hero.performanceId':current.hero.performanceId,'hero.portraitClipId':'unknown'})));
});

test('About and footer form values validate and round-trip through the shared site contract',()=>{
  const current=siteConfigSchema.parse(catalog().site);
  const copy=resolveSiteContent(current);
  const form=new URLSearchParams({
    'about.eyebrow':'Voices together','about.heading':'Our collective','about.intro':'A new introduction.',
    'about.sessionsHeading':'Sessions','about.sessionsDescription':'Live songs.','about.coversHeading':'Covers','about.coversDescription':'Shared songs.','about.youtubeLinkText':'Watch the channel',
    'footer.tagline':'Music brings us together','footer.navigation.performances':'Performances','footer.navigation.artists':'Artists','footer.navigation.about':'Our story','footer.navigation.privacy':'Privacy',
    'footer.socialUrls.youtube':'https://youtube.com/@Sonic_Collective-PH','footer.socialUrls.facebook':copy.footer.socialUrls.facebook,'footer.socialUrls.instagram':copy.footer.socialUrls.instagram,'footer.socialUrls.tiktok':copy.footer.socialUrls.tiktok,'footer.socialUrls.x':copy.footer.socialUrls.x,
    'footer.contactLabel':'Work with us','footer.contactEmail':'hello@example.com','footer.wordmark':'SONIC','footer.copyrightYear':'2027',
    spotlightPerformanceIds:homepagePerformanceOptions[0]!.id,featuredPerformanceIds:'performance-a',featuredCoverIds:'performance-b',featuredArtistIds:'artist-a',
  });
  const updated=siteConfigSchema.parse(parseEditorialPayload('site','site',applyEditorialForm('site',current,form)));
  assert.equal(updated.about?.heading,'Our collective');
  assert.equal(updated.footer?.navigation.about,'Our story');
  assert.equal(updated.footer?.contactEmail,'hello@example.com');
  assert.equal(updated.footer?.copyrightYear,2027);
  assert.deepEqual(updated.featuredCoverIds,['performance-b']);
  assert.deepEqual(resolveSiteContent(updated).about,updated.about);
});

test('site copy rejects insecure social links and malformed contact email',()=>{
  const current=siteConfigSchema.parse(catalog().site);
  assert.throws(()=>siteConfigSchema.parse({...current,footer:{...defaultSiteFooter,socialUrls:{...defaultSiteFooter.socialUrls,instagram:'http://example.com'}}}));
  assert.throws(()=>siteConfigSchema.parse({...current,footer:{...defaultSiteFooter,contactEmail:'not-an-email'}}));
});


test('community picks preserve legacy omission, edit in order, clear explicitly and reject unsafe or partial rows',()=>{
  const current=siteConfigSchema.parse(rawSite);
  assert.equal(applyEditorialForm('site',current,new URLSearchParams()).communityPicks,undefined);
  const form=new URLSearchParams({'communityPicks.present':'1','communityPicks.0.id':'outside-video','communityPicks.0.title':'External performance','communityPicks.0.channel':'Other channel','communityPicks.0.channelUrl':'https://www.youtube.com/@other','communityPicks.0.youtubeId':'abcdefghijk'});
  const edited=siteConfigSchema.parse(applyEditorialForm('site',current,form));
  assert.equal(edited.communityPicks?.[0]?.title,'External performance');
  assert.deepEqual(applyEditorialForm('site',edited,new URLSearchParams({'communityPicks.present':'1'})).communityPicks,[]);
  assert.deepEqual(applyEditorialForm('site',edited,new URLSearchParams()).communityPicks,edited.communityPicks);
  form.set('communityPicks.0.channelUrl','javascript:alert(1)');
  assert.throws(()=>applyEditorialForm('site',current,form));
  form.set('communityPicks.0.channelUrl','https://example.com');form.delete('communityPicks.0.title');
  assert.throws(()=>applyEditorialForm('site',current,form));
  assert.throws(()=>siteConfigSchema.parse({...current,communityPicks:[edited.communityPicks![0],edited.communityPicks![0]]}));
});
