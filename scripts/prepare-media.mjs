import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const root = path.resolve(process.cwd());
const seedPath = path.resolve(root, '../plans/sonic-collective/inputs/catalog.seed.json');
const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'));
const mediaRoot = process.env.SONIC_MEDIA_ROOT || seed.mediaRoot;
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
const pub = path.join(root, 'public/media');
const dataDir = path.join(root, 'src/data');
const rel = (p) => p.replaceAll('\\', '/');
const source = (p) => path.resolve(mediaRoot, p);
const run = (bin, args) => { const r=spawnSync(bin,args,{encoding:'utf8',windowsHide:true}); if(r.status!==0) throw new Error(`${bin} failed (${r.status}): ${r.stderr}`); return r.stdout; };
await fs.mkdir(path.join(pub,'performances'),{recursive:true}); await fs.mkdir(path.join(pub,'artists'),{recursive:true}); await fs.mkdir(path.join(pub,'clips'),{recursive:true}); await fs.mkdir(path.join(pub,'hero'),{recursive:true}); await fs.mkdir(path.join(pub,'brand'),{recursive:true}); await fs.mkdir(dataDir,{recursive:true}); await fs.mkdir(path.join(root,'.local'),{recursive:true});
const manifest={}; const report={createdAt:new Date().toISOString(),sources:[],outputs:[],clips:[]};
const fmt = async (input, output, width, kind='webp') => { try { await fs.access(output); const existing=await sharp(output).metadata(); return {src:'/'+rel(path.relative(path.join(root,'public'),output)),width:existing.width,height:existing.height,format:kind}; } catch {} let p=sharp(input).rotate().resize({width,withoutEnlargement:true,fit:'inside'}); if(kind==='jpg') p=p.jpeg({quality:84}); else p=p.webp({quality:80}); await p.toFile(output); const m=await sharp(output).metadata(); return {src:'/'+rel(path.relative(path.join(root,'public'),output)),width:m.width,height:m.height,format:kind}; };
const perfRecords=seed.performances.map((p)=>({id:p.id,title:p.title,aliases:p.aliases??[],artistIds:p.artistIds,seriesId:p.seriesId,youtubeId:p.youtubeId,thumbnail:`/media/performances/${p.id}`,thumbnailAlt:`${p.title} performance artwork`,featuredOrder:p.featuredOrder,approvedForSite:true}));
for(const p of seed.performances){const input=source(p.thumbnailSource); await fs.access(input); const base=`/media/performances/${p.id}`; const variants=[]; for(const w of [640,960,1440]) variants.push(await fmt(input,path.join(pub,'performances',`${p.id}-${w}.webp`),w)); variants.push(await fmt(input,path.join(pub,'performances',`${p.id}-960.jpg`),960,'jpg')); manifest[base]={fit:'contain',aspectRatio:variants[0].width/variants[0].height,variants}; report.sources.push({id:p.id,source:p.thumbnailSource});}
const artists=seed.artists.map(a=>{return {id:a.id,name:a.name,aliases:a.aliases??[],kind:a.kind,portrait:`/media/artists/${a.id}`,portraitAlt:`${a.name} performance artwork`,focalPoint:a.focalPoint,portraitLayout:'landscape',links:a.links??[]};});
for(const a of seed.artists){const p=seed.performances.find(x=>x.id===a.portraitPerformanceId);const input=source(p.thumbnailSource);const variants=[]; for(const w of [480,800])variants.push(await fmt(input,path.join(pub,'artists',`${a.id}-${w}.webp`),w));variants.push(await fmt(input,path.join(pub,'artists',`${a.id}-800.jpg`),800,'jpg'));manifest[`/media/artists/${a.id}`]={fit:'contain',aspectRatio:variants[0].width/variants[0].height,variants};}
const clips=[];
for(const c of seed.clips){
  const input=source(c.source); await fs.access(input);
  const out=path.join(pub,'clips',`${c.id}.mp4`), poster=path.join(pub,'clips',`${c.id}-poster.webp`);
  try { await fs.access(out); } catch { run(ffmpeg,['-y','-i',input,'-vf','scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:black','-c:v','libx264','-preset','medium','-crf','24','-c:a','aac','-b:a','128k','-pix_fmt','yuv420p','-movflags','+faststart',out]); }
  try { await fs.access(poster); } catch { run(ffmpeg,['-y','-ss','2','-i',input,'-frames:v','1',poster]); }
  const pr=JSON.parse(run(ffprobe,['-v','error','-show_entries','format=duration:stream=width,height,codec_type','-of','json',out]));
  const v=pr.streams.find(x=>x.codec_type==='video');
  const rec={id:c.id,performanceId:c.performanceId,poster:`/media/clips/${c.id}-poster.webp`,src:`/media/clips/${c.id}.mp4`,width:v.width,height:v.height,durationSeconds:Number(pr.format.duration),approvedForSite:true};
  clips.push(rec); manifest[rec.poster]={fit:'contain',aspectRatio:v.width/v.height,variants:[{src:rec.poster,width:v.width,height:v.height,format:'webp'}]};
  report.clips.push({id:c.id,source:c.source,sourceWidth:c.width,sourceHeight:c.height,width:v.width,height:v.height,durationSeconds:rec.durationSeconds});
}
const heroClip=seed.clips.find(c=>c.id==='rena-inochi-no-namae-short'); const heroSource=source(heroClip.source); const heroOut=path.join(pub,'hero/rena-inochi-loop.mp4');const heroPoster=path.join(pub,'hero/rena-inochi-poster.webp');try{await fs.access(heroOut)}catch{run(ffmpeg,['-y','-ss','8','-i',heroSource,'-t','8','-an','-vf','scale=540:960:force_original_aspect_ratio=decrease,pad=540:960:(ow-iw)/2:(oh-ih)/2:black','-c:v','libx264','-preset','medium','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',heroOut]);run(ffmpeg,['-y','-ss','8','-i',heroSource,'-frames:v','1',heroPoster]);}const hm=await sharp(heroPoster).metadata();manifest['/media/hero/rena-inochi-poster']={fit:'contain',aspectRatio:hm.width/hm.height,variants:[{src:'/media/hero/rena-inochi-poster.webp',width:hm.width,height:hm.height,format:'webp'}]};
await fs.copyFile(source(seed.logoSource),path.join(pub,'brand/logo.jpg'));
const series=seed.series.map(s=>({id:s.id,title:s.title,description:s.description}));
const site={name:seed.site.name,channelUrl:seed.channelUrl,hero:{performanceId:seed.site.hero.performanceId,poster:`/media/performances/${seed.site.hero.performanceId}`,portraitClipId:seed.site.hero.portraitClipId,portraitPerformanceId:seed.site.hero.portraitPerformanceId,portraitPoster:'/media/hero/rena-inochi-poster.webp',portraitLoopSrc:'/media/hero/rena-inochi-loop.mp4'},featuredPerformanceIds:seed.site.featuredPerformanceIds,featuredCoverIds:seed.site.featuredCoverIds,featuredArtistIds:seed.site.featuredArtistIds};
for(const [file,data] of Object.entries({artists,performances:perfRecords,clips,series,site,'media-manifest':manifest}))await fs.writeFile(path.join(dataDir,`${file}.json`),JSON.stringify(data,null,2)+'\n');
await fs.writeFile(path.join(root,'media-sources.json'),JSON.stringify({mediaRoot,logoSource:seed.logoSource,artists:seed.artists.map(({id,portraitPerformanceId})=>({id,portraitPerformanceId})),performances:seed.performances.map(({id,thumbnailSource})=>({id,thumbnailSource})),clips:seed.clips.map(({id,source})=>({id,source}))},null,2)+'\n');
await fs.writeFile(path.join(root,'.local/media-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({performances:perfRecords.length,artists:artists.length,clips:clips.length,images:Object.keys(manifest).length,mediaRoot,videoBytes:(await fs.stat(heroOut)).size}));


