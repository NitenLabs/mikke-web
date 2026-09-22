from PIL import Image, ImageDraw
RD="refs/studio-Q65qmmvqVR"; CD="refs/compare"
# section: (label, ref_img, build_src, y0, y1)
PC=[("FV / これが新定番","sec-pc-01.jpg","build-home-pc.jpg",0,720),
    ("ABOUT / 私たちについて","sec-pc-02.jpg","build-home-pc.jpg",758,1815),
    ("FEATURE / 商品の特徴","sec-pc-03.jpg","build-home-pc.jpg",1816,3219),
    ("ITEMS / 商品価格","sec-pc-04.jpg","build-home-pc.jpg",3218,4735),
    ("FAQ / よくある質問","sec-pc-05.jpg","build-home-pc.jpg",4735,5362),
    ("CONTACT / お問い合わせ","sec-pc-06.jpg","build-home-pc.jpg",6893,7483)]
SP=[("FV","sec-sp-01.jpg","build-home-sp.jpg",0,600),
    ("ABOUT","sec-sp-02.jpg","build-home-sp.jpg",633,1414),
    ("FEATURE","sec-sp-03.jpg","build-home-sp.jpg",1414,2572),
    ("ITEMS","sec-sp-04.jpg","build-home-sp.jpg",2572,4791),
    ("FAQ","sec-sp-05.jpg","build-home-sp.jpg",4791,5280),
    ("CONTACT","sec-sp-06.jpg","build-home-sp.jpg",7382,7861)]
def build(rows, out, colw):
    gap=8; hdr=20
    pairs=[]
    for label,refimg,bsrc,y0,y1 in rows:
        r=Image.open(f"{RD}/{refimg}").convert("RGB")
        b=Image.open(f"{CD}/{bsrc}").convert("RGB").crop((0,y0,Image.open(f"{CD}/{bsrc}").width,y1))
        sr=colw/r.width; rr=r.resize((colw,round(r.height*sr)))
        sb=colw/b.width; bb=b.resize((colw,round(b.height*sb)))
        h=max(rr.height,bb.height)
        pairs.append((label,rr,bb,h))
    total=sum(hdr+h for _,_,_,h in pairs)+gap*len(pairs)
    W=colw*2+gap*3
    canv=Image.new("RGB",(W,total),(40,40,40)); d=ImageDraw.Draw(canv)
    y=0
    for label,rr,bb,h in pairs:
        d.text((gap,y+4),f"{label}   [ 参照元(左)  |  芦屋堂(右) ]",fill=(255,215,106))
        y+=hdr
        canv.paste(rr,(gap,y)); canv.paste(bb,(gap*2+colw,y))
        y+=h+gap
    canv.save(out,"JPEG",quality=82)
    print("wrote",out,canv.size)
build(PC,f"{CD}/compare-sections-pc.jpg",580)
build(SP,f"{CD}/compare-sections-sp.jpg",580)
