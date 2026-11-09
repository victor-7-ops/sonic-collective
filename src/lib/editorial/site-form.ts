import {communityPicksSchema} from '../schemas';
import type {SiteAbout,SiteFooter,SiteHeader} from '../schemas';

export type SiteSettingsCopy={about:SiteAbout;footer:SiteFooter;header:SiteHeader};
type SiteField={key:string;label:string;type:'text'|'textarea'|'email'|'url'|'number';maxLength?:number;min?:number;max?:number};
type SiteFieldGroup={path:'header'|'about'|'footer'|'footer.navigation'|'footer.socialUrls';legend:string;fields:SiteField[]};

export const siteSettingGroups:SiteFieldGroup[]=[
  {path:'header',legend:'Main navigation labels',fields:[
    {key:'exploreLabel',label:'Explore menu label',type:'text',maxLength:80},
    {key:'performancesLabel',label:'Performances link',type:'text',maxLength:80},
    {key:'artistsLabel',label:'Artists link',type:'text',maxLength:80},
    {key:'aboutLabel',label:'About link',type:'text',maxLength:80},
    {key:'youtubeLabel',label:'YouTube link',type:'text',maxLength:80},
  ]},
  {path:'about',legend:'About page',fields:[
    {key:'eyebrow',label:'Eyebrow',type:'text',maxLength:120},
    {key:'heading',label:'Heading',type:'text',maxLength:160},
    {key:'intro',label:'Introduction',type:'textarea',maxLength:2000},
    {key:'sessionsHeading',label:'Sonic Sessions heading',type:'text',maxLength:120},
    {key:'sessionsDescription',label:'Sonic Sessions description',type:'textarea',maxLength:1000},
    {key:'coversHeading',label:'Sonic Covers heading',type:'text',maxLength:120},
    {key:'coversDescription',label:'Sonic Covers description',type:'textarea',maxLength:1000},
    {key:'youtubeLinkText',label:'YouTube link text',type:'text',maxLength:160},
  ]},
  {path:'footer',legend:'Footer',fields:[
    {key:'tagline',label:'Tagline',type:'text',maxLength:160},
    {key:'contactLabel',label:'Contact link label',type:'text',maxLength:120},
    {key:'contactEmail',label:'Contact email',type:'email'},
    {key:'wordmark',label:'Wordmark',type:'text',maxLength:100},
    {key:'copyrightYear',label:'Copyright year',type:'number',min:2000,max:2100},
  ]},
  {path:'footer.navigation',legend:'Footer navigation labels',fields:[
    {key:'performances',label:'Performances link label',type:'text',maxLength:80},
    {key:'artists',label:'Artists link label',type:'text',maxLength:80},
    {key:'about',label:'About link label',type:'text',maxLength:80},
    {key:'privacy',label:'Privacy link label',type:'text',maxLength:80},
  ]},
  {path:'footer.socialUrls',legend:'Footer social links',fields:[
    {key:'youtube',label:'YouTube URL',type:'url'},
    {key:'facebook',label:'Facebook URL',type:'url'},
    {key:'instagram',label:'Instagram URL',type:'url'},
    {key:'tiktok',label:'TikTok URL',type:'url'},
    {key:'x',label:'X URL',type:'url'},
  ]},
];

export function siteSettingName(group:SiteFieldGroup,field:SiteField) { return `${group.path}.${field.key}`; }
export function siteSettingValue(copy:SiteSettingsCopy,group:SiteFieldGroup,field:SiteField) {
  let value:unknown=copy;
  for(const part of `${group.path}.${field.key}`.split('.')) value=value&&typeof value==='object'?(value as Record<string,unknown>)[part]:undefined;
  return value==null?'':String(value);
}

export function applySiteSettingsForm(current:Record<string,unknown>,form:URLSearchParams):Record<string,unknown> {
  const payload={...current};
  for(const group of siteSettingGroups) for(const field of group.fields) {
    const raw=form.get(siteSettingName(group,field));
    if(raw===null) continue;
    const parts=[...group.path.split('.'),field.key];
    let target=payload;
    for(const part of parts.slice(0,-1)) {
      const previous=target[part];
      target[part]={...(previous&&typeof previous==='object'?previous as Record<string,unknown>:{})};
      target=target[part] as Record<string,unknown>;
    }
    target[parts.at(-1)!]=field.type==='number'?(raw.trim()?Number(raw):NaN):raw.trim();
  }
  if(form.has('communityPicks.present')) {
    const keys=['id','title','channel','channelUrl','youtubeId'] as const;
    const picks=[];
    for(let index=0;index<12;index++) {
      const pick=Object.fromEntries(keys.map(key=>[key,form.get(`communityPicks.${index}.${key}`)?.trim()??'']));
      if(Object.values(pick).some(Boolean)) picks.push(pick);
    }
    payload.communityPicks=communityPicksSchema.parse(picks);
  }
  return payload;
}
