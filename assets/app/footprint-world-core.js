/* Shared, read-only atlas projections. Wishes never mutate visited records. */
(function(root){'use strict';
 const country=c=>c.country||'CHN';
 function project([lng,lat]){return [500+lng/180*480*(.87-.13*(Math.abs(lat)/90)**2),230-lat/90*235];}
 function inView(c,view){return view==='world'||!c.world;}
 function summary(cities,visited,wishes,trip,view){const ids=new Set(cities.filter(c=>inView(c,view)).map(c=>c.id)),marked=cities.filter(c=>ids.has(c.id)&&Object.hasOwn(visited,c.id));return {visited:marked.length,wishes:[...new Set(wishes)].filter(id=>ids.has(id)).length,trip:[...new Set(trip)].filter(id=>ids.has(id)).length,regions:new Set(marked.map(c=>view==='world'?country(c):c.province)).size};}
 function search(cities,regions,q){q=q.trim().normalize('NFKC').toLocaleLowerCase();if(!q)return [];return cities.filter(c=>[c.name,c.full,...(c.aliases||[]),regions.get(c.province)?.name].join(' ').normalize('NFKC').toLocaleLowerCase().includes(q)).sort((a,b)=>Number(b.name===q)-Number(a.name===q)||(a.rank??1)-(b.rank??1)||a.name.localeCompare(b.name,'zh'));}
 function wishPage(wishes,cities){const byId=new Map(cities.map(c=>[c.id,c]));const all=[...new Set(wishes)].filter(id=>byId.has(id));return {all,visible:all.slice(0,4),overflow:Math.max(0,all.length-4)};}
 function countries(cities,visited,wishes=[],trip=[]){
  const groups=new Map(),wanted=new Set(wishes),planned=new Set(trip),seen=new Set();
  for(const c of cities){if(seen.has(c.id))continue;seen.add(c.id);const on=Object.hasOwn(visited,c.id),wish=wanted.has(c.id),route=planned.has(c.id);if(!on&&!wish&&!route)continue;
   const id=country(c);if(!groups.has(id))groups.set(id,{id,visited:[],wishes:[],trip:[]});const g=groups.get(id);if(on)g.visited.push(c.id);if(wish)g.wishes.push(c.id);if(route)g.trip.push(c.id);
  }return [...groups.values()].sort((a,b)=>b.visited.length-a.visited.length||a.id.localeCompare(b.id));
 }
 // One scoped dataset drives the map, totals and inspector in every browsing mode.
 function browse(cities,visited,wishes,browsing,scope){
  const byId=new Map(cities.map(c=>[c.id,c])),mode=browsing.mode||'all',within=id=>byId.has(id)&&inView(byId.get(id),scope);
  const stops=(browsing.stops||[]).filter(s=>within(s.cityId));
  const ids=[...new Set(mode==='trip'?stops.map(s=>s.cityId):mode==='replay'?browsing.lit||[]:Object.keys(visited))].filter(within);
  const marked=Object.fromEntries(ids.filter(id=>Object.hasOwn(visited,id)).map(id=>[id,visited[id]]));
  const wanted=mode==='all'?[...new Set(wishes)].filter(within):[],route=mode==='trip'?stops.map(s=>s.cityId):[];
  return {mode,ids,marked,wishes:wanted,route,stops,groups:countries(cities,marked,wanted,route),summary:{cities:ids.length,regions:new Set(ids.map(id=>scope==='world'?country(byId.get(id)):byId.get(id).province)).size}};
 }
 // Fit the main land mass and adjacent islands, not distant overseas polygons.
 function landExtent(path){const parts=String(path||'').split('M').slice(1).map(part=>{const n=part.match(/-?\d+(?:\.\d+)?/g)?.map(Number)||[],xs=n.filter((_,i)=>i%2===0),ys=n.filter((_,i)=>i%2===1);return xs.length?[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]:null;}).filter(Boolean);if(!parts.length)return null;
  parts.sort((a,b)=>(b[2]-b[0])*(b[3]-b[1])-(a[2]-a[0])*(a[3]-a[1]));const main=parts[0],margin=Math.max(main[2]-main[0],main[3]-main[1])*.4;
  const near=parts.filter(b=>b[2]>=main[0]-margin&&b[0]<=main[2]+margin&&b[3]>=main[1]-margin&&b[1]<=main[3]+margin);
  return [Math.min(...near.map(b=>b[0])),Math.min(...near.map(b=>b[1])),Math.max(...near.map(b=>b[2])),Math.max(...near.map(b=>b[3]))];
 }
 const api={country,project,inView,summary,search,wishPage,countries,browse,landExtent};root.FootprintWorldCore=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
