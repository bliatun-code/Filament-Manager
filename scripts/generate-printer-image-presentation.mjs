// Read-only PNG alpha inspection. Image pixels are never rewritten.
import {readFileSync,writeFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
function inspectPrinterPng(path) {
 const bytes=readFileSync(path);const w=bytes.readUInt32BE(16),h=bytes.readUInt32BE(20),depth=bytes[24],kind=bytes[25];const channels={2:3,6:4,0:1,4:2,3:1}[kind];
 if(depth!==8||!channels||bytes[28]!==0)throw Error('Unsupported PNG '+entry.file);
 let palette,transparency;const parts=[];
 for(let p=8;p<bytes.length;){const len=bytes.readUInt32BE(p),tag=bytes.toString('ascii',p+4,p+8),data=bytes.subarray(p+8,p+8+len);if(tag==='IDAT')parts.push(data);if(tag==='PLTE')palette=data;if(tag==='tRNS')transparency=data;p+=12+len;}
 const raw=inflateSync(Buffer.concat(parts)),pixels=new Uint8Array(w*h*channels);let pos=0;
 const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
 for(let y=0;y<h;y++){const filter=raw[pos++];for(let x=0;x<w*channels;x++){const idx=y*w*channels+x,left=x>=channels?pixels[idx-channels]:0,up=y?pixels[idx-w*channels]:0,diag=y&&x>=channels?pixels[idx-w*channels-channels]:0;pixels[idx]=(raw[pos++]+(filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):filter===4?paeth(left,up,diag):0))&255;}}
 const pixel=(i)=>{const p=i*channels;if(kind===6)return [...pixels.subarray(p,p+4)];if(kind===2)return [...pixels.subarray(p,p+3),255];if(kind===3){const k=pixels[p];return [...palette.subarray(k*3,k*3+3),transparency?.[k]??255];}if(kind===4)return [pixels[p],pixels[p],pixels[p],pixels[p+1]];return [pixels[p],pixels[p],pixels[p],255];};

 let x0=w,y0=h,x1=-1,y1=-1,transparent=0;
 for(let i=0;i<w*h;i++){const a=pixel(i)[3];if(a<250)transparent++;if(a>32){x0=Math.min(x0,i%w);x1=Math.max(x1,i%w);y0=Math.min(y0,Math.floor(i/w));y1=Math.max(y1,Math.floor(i/w));}}
 if(x1<0||y1<0)throw Error('Empty printer artwork: '+path);
 const bw=x1-x0+1,bh=y1-y0+1,pad=Math.max(bw,bh)*.035;
 const ix=Math.max(1,Math.floor(w*.05)),iy=Math.max(1,Math.floor(h*.05));
 const corners=[pixel(iy*w+ix),pixel(iy*w+w-ix-1),pixel((h-iy-1)*w+ix),pixel((h-iy-1)*w+w-ix-1)];
 const opaqueFrame=corners.every(([r,g,b,a])=>a>248&&Math.min(r,g,b)>180&&Math.max(r,g,b)-Math.min(r,g,b)<20);
 return {width:w,height:h,transparent,opaqueFrame,viewBox:[x0-pad,y0-pad,bw+2*pad,bh+2*pad].map(n=>Math.round(n*10)/10).join(' ')};
}
const base='ui/src/assets/printers/';
const sources=JSON.parse(readFileSync(base+'sources.json','utf8'));
const derivatives=JSON.parse(readFileSync(base+'companion-derivatives.json','utf8'));
const output={};
for(const source of sources){
 const file=derivatives.find(d=>d.derived_from===source.file)?.file??source.file;
 const {width,height,transparent,opaqueFrame,viewBox}=inspectPrinterPng(base+file);
 if(!transparent||opaqueFrame)throw Error('Printer artwork needs a transparent variant without a light frame: '+file);
 output[source.file]={file,width,height,viewBox};
}
const path='ui/src/lib/printer_image_presentation.json';const content=JSON.stringify(output,null,2)+'\n';
if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==content)throw Error('Regenerate printer image presentation');}
else writeFileSync(path,content);
console.log('Transparent printer artwork and shared content bounds: OK ('+sources.length+' source variants)');
