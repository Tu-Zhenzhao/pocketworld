import {sub,add,scale,normalize} from './math.js';
// Direct cell coverage. No resampled source picture, antialiased paths or image filters.
export class PixelPen {
 constructor(ctx){this.ctx=ctx;this.n=ctx.canvas.width;this.image=ctx.getImageData(0,0,this.n,this.n);this.data=this.image.data}
 pixel(x,y,c){x=Math.floor(x);y=Math.floor(y);if(x<0||y<0||x>=this.n||y>=this.n)return;let i=(y*this.n+x)*4;this.data.set([...c,255],i)}
 polygon(p,c){const x0=Math.floor(Math.min(...p.map(v=>v[0]))),x1=Math.ceil(Math.max(...p.map(v=>v[0]))),y0=Math.floor(Math.min(...p.map(v=>v[1]))),y1=Math.ceil(Math.max(...p.map(v=>v[1])));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>y+.5)!=(p[j][1]>y+.5)&&x+.5<(p[j][0]-p[i][0])*(y+.5-p[i][1])/(p[j][1]-p[i][1])+p[i][0])inside=!inside}if(inside)this.pixel(x,y,c)}}
 ellipse(p,rx,ry,c){for(let y=Math.floor(p[1]-ry);y<=p[1]+ry;y++)for(let x=Math.floor(p[0]-rx);x<=p[0]+rx;x++)if(((x+.5-p[0])/rx)**2+((y+.5-p[1])/ry)**2<=1)this.pixel(x,y,c)}
 line(a,b,c,width=1){
  // Thin authored features occupy connected cells even between sample centers.
  if(width<=1){let x=Math.floor(a[0]),y=Math.floor(a[1]),tx=Math.floor(b[0]),ty=Math.floor(b[1]),dx=Math.abs(tx-x),dy=-Math.abs(ty-y),sx=x<tx?1:-1,sy=y<ty?1:-1,err=dx+dy;for(let i=0;i<2000;i++){this.pixel(x,y,c);if(x===tx&&y===ty)break;let e=err*2;if(e>=dy){err+=dy;x+=sx}if(e<=dx){err+=dx;y+=sy}}return;}
  const d=sub(b,a),l=Math.hypot(...d),normal=normalize([-d[1],d[0]]),half=width*.5;this.polygon([add(a,scale(normal,half)),add(b,scale(normal,half)),add(b,scale(normal,-half)),add(a,scale(normal,-half))],c);if(l<1)this.pixel(a[0],a[1],c)}
 polyline(p,c,width=1){for(let i=0;i<p.length-1;i++)this.line(p[i],p[i+1],c,width)}
 finish(){this.ctx.putImageData(this.image,0,0)}
}
