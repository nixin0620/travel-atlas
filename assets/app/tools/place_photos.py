"""Find photo blocks inside a known place's share-image section, never across places.

Pillow is optional. If unavailable or no convincing photo block exists, the
importer keeps the original image and its existing conservative card crop.
"""
import math
try:
    from PIL import Image
except ImportError:
    Image = None


def spans(flags, bridge=2):
    result=[];start=None;last=None
    for i,on in enumerate(flags):
        if on:
            if start is None:start=i
            elif last is not None and i-last>bridge+1:result.append((start,last+1));start=i
            last=i
    if start is not None:result.append((start,last+1))
    return result


def section_photos(path, places, width, height):
    if Image is None or not places or path is None:return {}
    if not 0 < width <= 12000 or not 0 < height <= 50000 or width*height>60000000:return {}
    with Image.open(path) as original:
        if original.size!=(width,height):return {}
        scale=min(1,264/width)
        sample=original.convert('RGB').resize((round(width*scale),round(height*scale)))
    w,h=sample.size;px=sample.load()
    # Photos have broad, sustained colour areas; text, icons and thin dividers do not.
    colour=[[max(px[x,y])-min(px[x,y])>32 and max(px[x,y])<253 for x in range(w)] for y in range(h)]
    ordered=sorted((p for p in places if p.get('evidence',{}).get('heading_bbox')),key=lambda p:p['evidence']['heading_bbox'][1])
    found={}
    for i,p in enumerate(ordered):
        box=p['evidence']['heading_bbox']
        top=max(0,math.ceil((box[1]+box[3])*scale));bottom=min(h,math.floor((ordered[i+1]['evidence']['heading_bbox'][1] if i+1<len(ordered) else height)*scale))
        left,right=round(w*.05),round(w*.94)
        bands=spans([sum(colour[y][left:right])>w*.14 for y in range(top,bottom)],bridge=3)
        candidates=[]
        for a,b in bands:
            y0,y1=top+a,top+b
            if y1-y0<w*.13:continue
            columns=spans([sum(colour[y][x] for y in range(y0,y1))>(y1-y0)*.18 for x in range(left,right)],bridge=2)
            for c,d in columns:
                x0,x1=left+c,left+d
                bw,bh=x1-x0,y1-y0
                if bw<w*.14 or not .5<bw/bh<1.8:continue
                tones={tuple(v//24 for v in px[x,y]) for y in range(y0,y1,2) for x in range(x0,x1,2)}
                if len(tones)<16:continue
                # Small padding recovers the rounded edge without swallowing captions.
                x0=max(left,x0-1);x1=min(right,x1+1);y0p=max(top,y0-1);y1p=min(bottom,y1+1)
                rect=[round(x0/scale),round(y0p/scale),round((x1-x0)/scale),round((y1p-y0p)/scale)]
                candidates.append((bw*bh,rect))
        if candidates:
            # Prefer the largest actual photograph, not the tiny POI-card thumbnail.
            found[p['rank']]=max(candidates,key=lambda row:row[0])[1]
    return found
