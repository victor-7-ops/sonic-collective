import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

const root=process.cwd(),dist=resolve(root,'dist'),args=process.argv.slice(2),publication=args.includes('--publication');
const reasonAt=args.indexOf('--allow-reset'),resetReason=reasonAt>=0?args[reasonAt+1]:'';
const readJson=async(path)=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const files=[],fileSizes=new Map();async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else{files.push(path);fileSizes.set(path,(await stat(path)).size);}}}
function hashVideos(videos){const canonical=[...videos].sort((a,b)=>a.youtubeId.localeCompare(b.youtubeId)).map(({youtubeId,channelId,title,thumbnailUrl,publishedAt,durationSeconds,seriesId,embeddable})=>({youtubeId,channelId,title,thumbnailUrl,publishedAt,durationSeconds,seriesId,embeddable}));return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');}
const errors=[];const fail=(message)=>errors.push(message);
await walk(dist);
const fileSet=new Set(files),directorySet=new Set(files.map((path)=>dirname(path)));
if(files.some((path)=>relative(dist,path).split(sep).some((part)=>['.local','node_modules'].includes(part))))fail('Build output contains a private runtime directory');
const authored=await readJson('src/data/performances.json'),artists=await readJson('src/data/artists.json'),overrides=await readJson('src/data/youtube-overrides.json'),legacy=await readJson('src/data/legacy-watch-routes.json');
let snapshot;try{snapshot=await readJson('.local/youtube-snapshot.json');}catch(error){if(error.code==='ENOENT')snapshot={initialized:false,channelId:'UCCxO94rfXnMpYf7DH_sd6Bw',contentHash:hashVideos([]),videos:[],expiresAt:null};else throw error;}
if(snapshot.channelId!=='UCCxO94rfXnMpYf7DH_sd6Bw'||!Array.isArray(snapshot.videos)||hashVideos(snapshot.videos)!==snapshot.contentHash)fail('Build input snapshot is malformed or has a mismatched content hash');
if(new Set((snapshot.videos??[]).map((video)=>video.youtubeId)).size!==(snapshot.videos??[]).length)fail('Build snapshot contains duplicate YouTube IDs');
for(const video of snapshot.videos??[]){try{const url=new URL(video.thumbnailUrl);if(url.protocol!=='https:'||url.hostname!=='i.ytimg.com')fail(`Unapproved remote thumbnail host for ${video.youtubeId}`);}catch{fail(`Invalid remote thumbnail URL for ${video.youtubeId}`);}}
const now=Date.now(),active=snapshot.initialized&&!snapshot.purged&&snapshot.expiresAt&&Date.parse(snapshot.expiresAt)>now;
const approved=authored.filter((record)=>record.approvedForSite),authoredIds=new Set(authored.map((record)=>record.youtubeId));
if(authoredIds.size!==authored.length)fail('Authored source contains duplicate YouTube IDs');
const imported=active?(snapshot.videos??[]).filter((video)=>!authoredIds.has(video.youtubeId)&&!overrides.some((item)=>item.youtubeId===video.youtubeId&&item.excluded)):[];
const availableIds=active?new Set((snapshot.videos??[]).map((video)=>video.youtubeId)):new Set();
const visibleArtistIds=new Set(approved.filter((record)=>!overrides.some((item)=>item.youtubeId===record.youtubeId&&item.excluded)&&(!active||availableIds.has(record.youtubeId))).flatMap((record)=>record.artistIds));
const routes=['404.html','index.html','about/index.html','privacy/index.html','sessions/index.html','artists/index.html',...approved.map((record)=>`sessions/${record.id}/index.html`),...artists.filter((artist)=>visibleArtistIds.has(artist.id)).map((artist)=>`artists/${artist.id}/index.html`),...imported.map((video)=>`watch/${video.youtubeId}/index.html`),...legacy.map((route)=>`watch/${route.youtubeId}/index.html`)];
if(new Set(routes).size!==routes.length)fail('Expected output routes are not unique');
for(const route of routes)if(!files.includes(resolve(dist,route)))fail(`Missing output page: /${route}`);
const html=files.filter((path)=>extname(path)==='.html');const titles=new Map(),canonicals=new Set();
for(const path of html){const text=await readFile(path,'utf8'),name=relative(dist,path);
  if(/(?:[A-Za-z]:\\Users\\|Downloads\\|node_modules|\.local\/|\.local\\|AIza[\w-]{30,}|YOUTUBE_API_KEY\s*=\s*[^\s<]+)/i.test(text))fail(`Private path or credential-like value in ${name}`);
  const title=text.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim(),description=text.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1];
  if(!title||!description)fail(`Missing title or description in ${name}`);else {if(titles.has(title))fail(`Duplicate page title: ${title}`);titles.set(title,name);}
  if(!/name="robots"\s+content="noindex,nofollow"/.test(text))fail(`Private noindex policy missing in ${name}`);
  const canonical=text.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  if(canonical){const url=new URL(canonical);if(url.protocol!=='https:'||['localhost','127.0.0.1'].includes(url.hostname))fail(`Non-public canonical origin in ${name}`);if(canonicals.has(canonical))fail(`Duplicate canonical URL: ${canonical}`);canonicals.add(canonical);if(!text.includes('property="og:url"'))fail(`Canonical lacks og:url in ${name}`);if(!text.includes('property="og:image"'))fail(`Canonical page lacks OG artwork in ${name}`);}
  if(/<a\s+[^>]*href="(?:#|javascript:|https?:\/\/(?:example\.com|localhost)[^"]*)"/i.test(text))fail(`Placeholder link in ${name}`);
  const origin=process.env.SITE_URL?new URL(process.env.SITE_URL).origin:'https://local.invalid';
  const attrs=[...text.matchAll(/\b(?:href|src|data-src)="([^"]+)"/g)].map((match)=>match[1]);
  for(const match of text.matchAll(/\bsrcset="([^"]+)"/g))attrs.push(...match[1].split(',').map((entry)=>entry.trim().split(/\s+/)[0]));
  for(const attr of attrs){if(attr.startsWith('data:')||attr.startsWith('blob:'))continue;let url;try{url=new URL(attr,'https://local.invalid');}catch{continue;}
    if(url.hostname==='i.ytimg.com'&&url.protocol==='https:')continue;
    if(url.origin!==origin&&url.origin!=='https://local.invalid'){if(url.hostname==='localhost'||url.hostname==='127.0.0.1')fail(`Development URL in ${name}`);continue;}
    const pathname=decodeURIComponent(url.pathname),target=pathname==='/'?resolve(dist,'index.html'):resolve(dist,`.${pathname}`);
    if(!target.startsWith(dist+sep)&&target!==resolve(dist,'index.html'))fail(`Unsafe local path in ${name}: ${pathname}`);else if(!fileSet.has(target)&&!fileSet.has(join(target,'index.html'))&&!directorySet.has(target)&&!pathname.startsWith('/#'))fail(`Broken local asset/link in ${name}: ${pathname}`);
  }
}
const feedPath=resolve(dist,'youtube-feed.json');let feed;try{feed=JSON.parse(await readFile(feedPath,'utf8'));}catch{fail('Missing or invalid /youtube-feed.json');}
if(feed&&feed.contentHash!==hashVideos(feed.videos??[]))fail('Built feed content hash does not match records');
const expectedFeedHash=snapshot.initialized&&snapshot.expiresAt&&Date.parse(snapshot.expiresAt)<=now&&!snapshot.purged?hashVideos([]):snapshot.contentHash;
if(feed&&feed.contentHash!==expectedFeedHash)fail('Built feed differs from the validated local snapshot input');
try{const robots=await readFile(resolve(dist,'robots.txt'),'utf8');if(!robots.includes('Disallow: /'))fail('Private robots.txt does not disallow crawling');}catch{fail('Missing robots.txt');}
if(process.env.SITE_URL){try{const sitemap=await readFile(resolve(dist,'sitemap.xml'),'utf8');if(!sitemap.includes('<urlset'))fail('Configured SITE_URL did not produce a sitemap');}catch{fail('Configured SITE_URL but no sitemap was generated');}}
else {try{const sitemap=await readFile(resolve(dist,'sitemap.xml'),'utf8');if(!sitemap.includes('Sitemap deferred'))fail('Without SITE_URL, sitemap must be explicitly deferred');}catch{fail('Without SITE_URL, sitemap deferral marker is missing');}}
for(const path of files){const bytes=fileSizes.get(path)??0;if(extname(path).toLowerCase()==='.mp4'&&bytes>20*1024*1024)fail(`Large source video leaked into build output: ${relative(dist,path)}`);}
const measured=[...fileSizes.values()].reduce((sum,size)=>sum+size,0);
if(publication){
  let proof;try{proof=await readJson('.local/publication-context.json');}catch{fail('Publication validation requires .local/publication-context.json hydration proof');}
  if(proof){if(proof.mode!=='publication')fail('Publication proof is not from authenticated publication hydration');if(proof.contentHash!==feed?.contentHash||proof.candidateContentHash!==feed?.contentHash||proof.initialized!==feed?.initialized)fail('Built feed does not match the hydrated publication candidate');
    const origin=process.env.SITE_URL;if(!origin||new URL(origin).origin!==proof.origin)fail('Publication SITE_URL does not match hydrated Site origin');
    if(proof.baselineInitialized&&feed?.initialized===false&&!(resetReason&&resetReason.length>=12))fail('Refusing to publish initialized live data as uninitialized without an explicit reasoned reset');}
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Output valid: ${html.length} HTML pages, ${files.length} files, ${Math.round(measured/1024)} KiB; ${routes.length} required routes. ${publication?'Publication proof verified.':'Local/private preview mode.'}`);
