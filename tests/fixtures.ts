import type { Artist, Clip, Performance, Series, SiteConfig } from '../src/lib/schemas';
export const artists: Artist[]=[{id:'a',name:'Rená',aliases:['レナ'],kind:'solo',portrait:'/media/a',portraitAlt:'Artwork',focalPoint:'50% 40%',portraitLayout:'landscape',links:[]},{id:'b',name:'Kai',aliases:[],kind:'solo',portrait:'/media/a',portraitAlt:'Artwork',focalPoint:'50% 40%',portraitLayout:'landscape',links:[]}];
export const performances: Performance[]=[{id:'p1',title:'Étoile',aliases:['Hoshi'],artistIds:['a'],seriesId:'sessions',youtubeId:'abcdefghijk',thumbnail:'/media/p1',thumbnailAlt:'Cover',featuredOrder:1,approvedForSite:true},{id:'p2',title:'Duet',aliases:[],artistIds:['a','b'],seriesId:'covers',youtubeId:'abcdefghijl',thumbnail:'/media/p2',thumbnailAlt:'Cover',featuredOrder:2,approvedForSite:true}];
export const clips: Clip[]=[{id:'c1',performanceId:'p1',poster:'/media/c1.webp',src:'/media/c1.mp4',width:540,height:960,durationSeconds:12,approvedForSite:true}];
export const series: Series[]=[{id:'sessions',title:'Sonic Sessions',description:'Live sessions.'},{id:'covers',title:'Sonic Covers',description:'Cover performances.'}];
export const site: SiteConfig={name:'Sonic Collective',channelUrl:'https://youtube.com/@Sonic_Collective-PH',hero:{performanceId:'p1',poster:'/media/p1',portraitClipId:'c1',portraitPerformanceId:'p1',portraitPoster:'/media/c1.webp',portraitLoopSrc:'/media/loop.mp4'},featuredPerformanceIds:['p1'],featuredCoverIds:['p2'],featuredArtistIds:['a']};
export const catalog=()=>structuredClone({artists,performances,clips,series,site});
export const manifest=()=>Object.fromEntries(['/media/a','/media/p1','/media/p2'].map((p)=>[p,{fit:'contain',aspectRatio:1,variants:[{src:p+'.webp',width:320,height:320,format:'webp'}]}]));
export const exists=(p:string)=>p.startsWith('/media/');

