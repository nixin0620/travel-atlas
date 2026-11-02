/* Match POI identities, not approximate coordinates. Ambiguity stays reviewable. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TravelMapMatch=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const cities={
 banna:{adcode:'532800',bbox:[99.8,21,101.9,22.8]},
 puer:{adcode:'530800',bbox:[99,22,102.4,24.9]},
 yuxi:{adcode:'530400',bbox:[101.2,23.3,103.1,24.95]},
 kunming:{adcode:'530100',bbox:[102,24.2,103.8,26.6]}
};
const aliases={banna:[
 ['曼听御花园','曼听公园','西双版纳曼听御花园','西双版纳曼听公园'],
 ['西双版纳总佛寺','总佛寺'],
 ['中国科学院西双版纳热带植物园','西双版纳热带植物园','西双版纳中国科学院热带植物园'],
 // Same village identity used by tools/place_facts.py; verified against Amap
 // B0FFJ2ZH2Y (2026-10-26). Nearby food courts, hotels and "景区" are not aliases.
 ['曼贺纳古寨','曼贺纳自然村寨','曼贺纳村']
]};
const generic=/^(?:景区|景点|公园|植物园|热带植物园|动物园|佛寺|寺庙|古寨|村寨|古镇|老街|夜市|酒店|旅馆|客栈|民宿|机场|火车站|高铁站|车站|码头|停车场|售票处|游客中心|入口|出口|东门|西门|南门|北门|正门|park|hotel|restaurant|airport|station)$/;
function normalizeName(value){
 return typeof value==='string'?value.normalize('NFKC').trim().toLowerCase().replace(/中科院/g,'中国科学院').replace(/[\s·•・，,。()（）\[\]【】\-—_]/g,''):'';
}
function usableName(name,curated=false){return Boolean(name&&!generic.test(name)&&(name.length>=3||curated));}
function acceptedNames(place){
 const name=normalizeName(place.name),kind=String(place.kind||place._place?.kind||'');
 const group=(aliases[place.cityId]||[]).find(values=>values.some(value=>normalizeName(value)===name));
 if(!usableName(name,Boolean(group)))return new Set();
 const names=new Set([name]);
 // Orders/manual text can refer to a branch: only their full name is authoritative.
 if(/hotel|lodging|stay|manual|酒店|住宿/i.test(kind))return names;
 if(group)for(const value of group)names.add(normalizeName(value));
 for(const value of [...(Array.isArray(place.aliases)?place.aliases:[]),...(Array.isArray(place._place?.aliases)?place._place.aliases:[])]){
  const alias=normalizeName(value);if(usableName(alias))names.add(alias);
 }
 return names;
}
function qualified(place,candidate){
 const city=cities[place.cityId];
 if(!city||!candidate||candidate.provider!=='amap'||candidate.coordinateSystem!=='GCJ02'||typeof candidate.id!=='string'||!candidate.id.trim()||typeof candidate.source!=='string'||!candidate.source.trim())return false;
 if(candidate.cityId&&candidate.cityId!==place.cityId)return false;
 const code=String(candidate.adcode||'');
 if(!/^\d{6}$/.test(code)||code.slice(0,4)!==city.adcode.slice(0,4))return false;
 return Number.isFinite(candidate.lng)&&Number.isFinite(candidate.lat)&&candidate.lng>=city.bbox[0]&&candidate.lng<=city.bbox[2]&&candidate.lat>=city.bbox[1]&&candidate.lat<=city.bbox[3];
}
function evaluate(place,candidates){
 if(!place||!Array.isArray(candidates))return null;
 const names=acceptedNames(place);if(!names.size)return null;
 const matches=candidates.filter(candidate=>qualified(place,candidate)&&names.has(normalizeName(candidate.name)));
 const ids=new Set(matches.map(candidate=>candidate.id));
 if(ids.size!==1)return null;
 const match=matches[0];
 // Duplicate responses are harmless only if their identity and position agree.
 if(candidates.some(candidate=>candidate?.id===match.id&&(normalizeName(candidate.name)!==normalizeName(match.name)||candidate.lat!==match.lat||candidate.lng!==match.lng||!qualified(place,candidate))))return null;
 return match;
}
return {match:evaluate,evaluate,normalizeName};
});
