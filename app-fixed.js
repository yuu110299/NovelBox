
(function(){
 const key='novel-box-theme';
 const day=document.getElementById('theme-day'),night=document.getElementById('theme-night');
 function setTheme(mode){
  const selected=mode==='day'?'day':'night';
  document.documentElement.setAttribute('data-theme',selected);
  day.setAttribute('aria-pressed',String(selected==='day'));
  night.setAttribute('aria-pressed',String(selected==='night'));
  try{localStorage.setItem(key,selected)}catch(e){}
 }
 let saved='night';try{saved=localStorage.getItem(key)||'night'}catch(e){}
 setTheme(saved);
 day.addEventListener('click',()=>setTheme('day'));
 night.addEventListener('click',()=>setTheme('night'));
})();



const $=id=>document.getElementById(id);
const supportedHosts=['dualeotruyenfull.net','truyenfull.live','wattpad.com','wordpress.com','navyteams.com','giatocvuongtai.com','luotnovel1.site'];
function cleanText(node){return (node?.innerText||node?.textContent||'').replace(/\n{3,}/g,'\n\n').trim()}
function safeUrl(value){const u=new URL(value);if(!['https:','http:'].includes(u.protocol))throw Error('Chỉ hỗ trợ đường dẫn HTTP hoặc HTTPS.');return u}

const API='https://novelbox-reader-api.onrender.com';
let discovered=[];
let downloaded=[];
let storyMeta={};
$('url').addEventListener('input',()=>{try{const host=new URL($('url').value).hostname.replace(/^www\./,'').toLowerCase();const match=[...$('source').options].find(o=>o.value!=='auto'&&(host===o.value||host.endsWith('.'+o.value)));$('source').value=match?match.value:'auto'}catch{$('source').value='auto'}});
async function api(path,body){
 let r;
 try{
  r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
 }catch(e){
  if(e?.name==='TimeoutError'||e?.name==='AbortError')throw Error('Máy chủ xử lý truyện phản hồi quá lâu (quá 120 giây). Vui lòng thử lại sau.');
  throw Error('Không kết nối được máy chủ xử lý truyện (Render). Hãy kiểm tra máy chủ đang chạy và cấu hình CORS; đây chưa phải lỗi đọc chương của nguồn truyện.');
 }
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'HTTP '+r.status);
 return data;
}
const bridgePending=new Map();
window.addEventListener('message',event=>{
 if(event.source!==window||event.origin!==location.origin||event.data?.novelboxBridge!=='response')return;
 const pending=bridgePending.get(event.data.id);if(!pending)return;
 bridgePending.delete(event.data.id);clearTimeout(pending.timer);
 event.data.ok?pending.resolve(event.data.data):pending.reject(Error(event.data.error||'Tiện ích không đọc được trang.'));
});
function renderedPage(url){
 return new Promise((resolve,reject)=>{
  const id='novelbox-'+crypto.randomUUID();
  const timer=setTimeout(()=>{bridgePending.delete(id);reject(Error('Tiện ích không phản hồi. Hãy cài hoặc tải lại tiện ích Novel Box phiên bản 1.1.0.'));},45000);
  bridgePending.set(id,{resolve,reject,timer});
  window.postMessage({novelboxBridge:'request',id,url},location.origin);
 });
}
async function browserDiscover(url){
 const page=await renderedPage(url);
 const chapters=[],seen=new Set(),storyId=new URL(url).searchParams.get('storyId');
 for(const item of page.links||[]){
  const href=new URL(item.url,url);
  if(storyId&&href.searchParams.get('storyId')!==storyId)continue;
  if(seen.has(href.href))continue;
  seen.add(href.href);
  chapters.push({title:item.title||'Chương '+(chapters.length+1),url:href.href});
 }
 if(!chapters.length){
  const direct=new URL(url);
  if(direct.pathname.replace(/\/$/,'')==='/reader'&&direct.searchParams.has('chapter')){
   chapters.push({title:page.title||'Chương đã chọn',url:direct.href});
  }else throw Error('Đã mở trang nhưng không thấy liên kết chương. Hãy kiểm tra truyện có mục lục công khai hay không.');
 }
 return {title:page.title||'',chapters,count:chapters.length};
}
async function browserChapter(url){
 const page=await renderedPage(url);
 if(!page.content?.trim())throw Error('Trang đã mở nhưng không có nội dung chương công khai trong .reader-demo-body.');
 return page.content;
}
async function loadStory(){
 const status=$('urlstatus'),btn=$('check');
 let u;try{u=safeUrl($('url').value.trim());const src=$('source').value;const detected=[...$('source').options].map(x=>x.value).find(x=>x!=='auto'&&(u.hostname===x||u.hostname.endsWith('.'+x)));if(!detected)throw Error('Nguồn truyện chưa được hỗ trợ.');if(src!=='auto'&&src!==detected)$('source').value=detected}catch(e){status.textContent=e.message||'Nhập URL HTTPS hợp lệ.';return}
 btn.disabled=true;status.textContent='Đang rà mục lục và các trang danh sách chương...';
 try{
  let data;
  if(u.hostname==='giatocvuongtai.com'||u.hostname.endsWith('.giatocvuongtai.com')){
   status.textContent='Đang mở trang bằng Playwright trên Render...';
   try{data=await api('/render-discover',{url:u.href,source:'auto'})}
   catch(e){
    if(e instanceof TypeError||/Failed to fetch|NetworkError|Load failed/i.test(e.message||''))throw Error('Trình duyệt không được phép đọc trực tiếp nguồn này (có thể do CORS). Cần tiện ích trình duyệt có quyền truy cập trang nguồn. Không thể giải quyết bằng Render.');
    throw e;
   }
  }else data=await api('/discover',{url:u.href,source:'auto'});
  discovered=data.chapters||[];
  // Enforce reading order on the client too, including cached or older API results.
  if(u.hostname.endsWith('navyteams.com')){
   const chapterKey=(ch)=>{
    const title=ch.title||'',path=(()=>{try{return new URL(ch.url).pathname}catch{return ''}})();
    const extra=/ngoại\s*truyện|ngoai[-_\s]*truyen|extra|番外/i.test(title+' '+path);
    const match=title.match(/(?:chương|chuong|chapter|chap|ngoại\s*truyện|ngoai[-_\s]*truyen|extra)[^0-9]{0,20}(\d+)/i)||title.match(/^\s*(\d{1,4})\s*[.:-]/)||path.match(/(?:chuong|chapter|chap|ngoai-truyen|extra)[-_]?(\d+)/i);
    return [extra?1:0,match?Number(match[1]):Number.MAX_SAFE_INTEGER];
   };
   discovered=discovered.map((ch,i)=>({...ch,__order:i})).sort((a,b)=>{const x=chapterKey(a),y=chapterKey(b);return x[0]-y[0]||x[1]-y[1]||a.__order-b.__order}).map(({__order,...ch})=>ch);
  }
  storyMeta={title:data.title||"",author:data.author||"",description:data.description||"",categories:data.categories||[],cover:data.cover||"",story_url:data.story_url||""};
  // Exact cover URL supplied for Nhất phẩm phu nhân, not other WordPress books.
  try{const source=new URL(storyMeta.story_url||$('url').value.trim());if(source.hostname==='tichvulam.wordpress.com'&&/nhat-pham-phu-nhan/i.test(source.pathname))storyMeta.cover='https://tichvulam.wordpress.com/wp-content/uploads/2017/01/7_554763_655ee55ad21bd19.jpg'}catch{}
  const meta=$("storymeta");meta.replaceChildren();
  const layout=document.createElement("div");layout.className="story-meta-layout";
  const details=document.createElement("div");details.className="story-meta-details";
  displayedCoverBytes=null;
  coverDataUrl=null;
  if(storyMeta.cover){const img=document.createElement("img");const coverUrl=storyMeta.cover;img.alt="Ảnh bìa truyện";img.className="story-meta-cover";img.referrerPolicy="no-referrer";img.loading="lazy";
  // Truyenfull: try a CORS-enabled load so the already visible cover can be
  // copied into the exported file via canvas without a second network request.
  const truyenfullCover=(()=>{try{return new URL(storyMeta.story_url||$('url').value).hostname==='truyenfull.live'}catch{return false}})();
  if(truyenfullCover)img.crossOrigin="anonymous";
  img.onload=()=>{void rememberDisplayedCover(img,coverUrl)};
  img.onerror=async()=>{
   // If Google Photos does not send CORS headers, keep the cover visible
   // without CORS; the export can still use the backend proxy.
   if(truyenfullCover&&img.crossOrigin){
    img.onerror=null;img.removeAttribute("crossorigin");
    img.onload=()=>{void rememberDisplayedCover(img,coverUrl)};
    img.src=coverUrl;return;
   }
   img.onerror=null;try{const response=await fetch(API+"/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:coverUrl}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error("Ảnh nguồn không tải được");const blob=await response.blob();if(!blob.type.startsWith("image/"))throw Error("Phản hồi không phải ảnh");const bytes={bytes:new Uint8Array(await blob.arrayBuffer()),mime:blob.type,ext:blob.type==="image/png"?"png":blob.type==="image/webp"?"webp":"jpg"};if(storyMeta.cover===coverUrl){displayedCoverBytes=bytes;imageCache.set(coverUrl,bytes)}const local=URL.createObjectURL(blob);img.onload=()=>{URL.revokeObjectURL(local)};img.onerror=()=>{URL.revokeObjectURL(local);img.style.display="none";img.title="Máy chủ ảnh bìa từ chối tải"};img.removeAttribute("crossorigin");img.src=local}catch(e){img.style.display="none";img.title=e.message||"Không tải được ảnh bìa"}};img.src=coverUrl;layout.append(img)}
  for(const [name,val] of [["Tên truyện",storyMeta.title],["Tác giả",storyMeta.author],["Thể loại",storyMeta.categories.join(", ")],["Mô tả",storyMeta.description]]){if(val){const p=document.createElement("p");const b=document.createElement("strong");b.textContent=name+": ";p.append(b,document.createTextNode(val));if(name==="Mô tả"&&val.length>450){p.style.maxHeight="9em";p.style.overflow="hidden";const toggle=document.createElement("button");toggle.type="button";toggle.className="alt";toggle.textContent="Xem thêm";toggle.style.marginBottom="12px";toggle.onclick=()=>{const expanded=p.style.maxHeight==="none";p.style.maxHeight=expanded?"9em":"none";toggle.textContent=expanded?"Xem thêm":"Thu gọn";toggle.setAttribute("aria-expanded",String(!expanded))};toggle.setAttribute("aria-expanded","false");details.append(p,toggle)}else details.append(p)}}
  layout.append(details);meta.append(layout);
  downloaded=[];
  if(data.title)$('title').value=data.title;
  if(data.author)$('author').value=data.author;
  $('end').value=discovered.length||1;
  $('chapterinfo').textContent='Đã tìm thấy '+discovered.length+' chương. '+(data.truncated?'Danh sách có thể chưa đầy đủ. ':'')+'Chọn phạm vi rồi nhấn “Tải nội dung các chương đã chọn”.';
  status.textContent=discovered.length?'Đã tìm được '+discovered.length+' chương. Đang tự tải nội dung...':'Chưa tìm được link chương từ mục lục. Nguồn có thể chặn máy chủ hoặc sử dụng cấu trúc khác.';
  if(discovered.length){$('status').textContent='Đã tìm '+discovered.length+' chương. Chọn khoảng chương rồi bấm Tải nội dung để bắt đầu; không tự tải toàn bộ.';}
 }catch(e){status.textContent='Lỗi tìm danh sách chương: '+e.message}
 finally{btn.disabled=false}
}
let activeDownload=false;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function loadChapters(){
 if(activeDownload)return;
 const btn=$('fetchchapters'),status=$('status');
 const start=Number($('start').value),end=Number($('end').value);
 if(!discovered.length){status.textContent='Hãy tìm danh sách chương trước.';return}
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>discovered.length){status.textContent='Phạm vi chương không hợp lệ.';return}
 activeDownload=true;btn.disabled=true;
 status.textContent='Đang thu thập 0/'+(end-start+1)+' chương để tạo file...';
 await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
 const url=storyMeta.story_url||$('url').value.trim(),include_images=$('includeChapterImages').checked;
 const previous=new Map(downloaded.map(c=>[c.url,c]));
 downloaded=[];
 const total=end-start+1;
 let failures=0;
 try{
  const host=new URL(url).hostname;
  const fastSource=host.endsWith('truyenfull.live');
  const chunkSize=fastSource?12:5;
  const concurrency=host.endsWith('wattpad.com')?2:host.endsWith('giatocvuongtai.com')?1:fastSource?3:5;
  const ranges=[];
  for(let from=start;from<=end;from+=chunkSize)ranges.push({from,to:Math.min(from+chunkSize-1,end)});
  const results=new Array(ranges.length);
  let next=0,completed=0;
  async function worker(){
   while(next<ranges.length){
    const idx=next++,{from,to}=ranges[idx],items=discovered.slice(from-1,to);
    status.textContent='Đang thu thập '+completed+'/'+total+' chương để tạo file...';
    const cached=items.map(item=>{const old=previous.get(item.url);return old&&(old.content||old.images?.length)?old:null});
    let result=cached.every(x=>x&&(x.content||x.images?.length))?cached:null;
    if(!result){
     let lastError;
     const maxAttempts=host.endsWith('wattpad.com')?2:2;
     for(let attempt=1;attempt<=maxAttempts;attempt++){
      try{
       const pending=result?items.filter((item,i)=>!(result[i]?.content||result[i]?.images?.length)):items;
       if(!pending.length)break;
       const data=host.endsWith('giatocvuongtai.com')
        ?await api('/render-batch',{url,start:from,end:to,chapters:pending,include_images,source:'auto'})
        :await api('/batch',{url,start:from,end:to,chapters:pending,include_images,source:'auto'});
       if(!Array.isArray(data.chapters))throw Error('Phản hồi không hợp lệ');
       const byUrl=new Map(data.chapters.map(ch=>[ch.url,ch]));
       result=items.map((item,i)=>result?.[i]?.content||result?.[i]?.images?.length?result[i]:(byUrl.get(item.url)||{...item,content:'',images:[],error:'Chưa nhận được nội dung'}));
       if(result.every(ch=>ch.content||ch.images?.length))break;
      }catch(e){lastError=e;if(attempt<maxAttempts)await sleep(host.endsWith('wattpad.com')?1500*attempt:700*attempt)}
     }
     if(!result){failures+=items.length;result=items.map(item=>({title:item.title,url:item.url,content:'',images:[],error:lastError?.message||'Không tải được'}))}
    }
    results[idx]=result;
    completed+=result.length;
    status.textContent='Đang thu thập '+completed+'/'+total+' chương để tạo file...';
   }
  }
  await Promise.all(Array.from({length:Math.min(concurrency,ranges.length)},()=>worker()));
  downloaded=results.flat().map(ch=>{const old=previous.get(ch.url);return (!ch.content&&!ch.images?.length&&old&&(old.content||old.images?.length))?old:ch});
  $('content').value=downloaded.map(x=>cleanSourceMarks(wattpadChapterTitle(x.title))+'\n\n'+(x.content?cleanSourceMarks(wattpadChapterText(x)):(x.images?.length?'[Chương gồm '+x.images.length+' ảnh]':'[Chương tải lỗi — xem thông báo trạng thái]'))).join('\n\n\n');
  const failed=downloaded.filter(x=>!x.content&&!x.images?.length);
  if(failed.length&& !host.endsWith('giatocvuongtai.com')){
   status.textContent='Đang thử tải lại '+failed.length+' chương bị lỗi...';
   for(let i=0;i<failed.length;i+=3){
    try{
     const data=await api('/batch',{url,chapters:failed.slice(i,i+3),include_images});
     for(const chapter of data.chapters||[]){const idx=downloaded.findIndex(x=>x.url===chapter.url);if(idx>=0&&(chapter.content||chapter.images?.length))downloaded[idx]=chapter}
    }catch(e){}
   }
   $('content').value=downloaded.map(x=>cleanSourceMarks(x.title)+'\n\n'+(x.content?cleanSourceMarks(x.content):(x.images?.length?'[Chương gồm '+x.images.length+' ảnh]':'[Chương tải lỗi — xem thông báo trạng thái]'))).join('\n\n\n');
  }
  const missing=downloaded.filter(x=>!x.content&&!x.images?.length).length;
  const reasons=[...new Set(downloaded.filter(x=>!x.content&&!x.images?.length).map(x=>x.error||'Không rõ nguyên nhân'))].slice(0,3);status.textContent='Hoàn thành '+(total-missing)+'/'+total+' chương.'+(missing?' Lỗi: '+reasons.join(' · ')+'. Bấm Tải nội dung để thử lại.':' Sẵn sàng xuất file.');
 }finally{activeDownload=false;btn.disabled=false}
}
$('fetchchapters').onclick=loadChapters;
const escapeXml=s=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function normalizeEscapedNewlines(text){
 let value=String(text??'');
 // Some sources double-escape JSON newlines (\\n\\n), while others return \n.
 for(let pass=0;pass<3;pass++){
  const next=value.replace(/\\r\\n/g,'\n').replace(/\\n/g,'\n').replace(/\\r/g,'\n');
  if(next===value)break;
  value=next;
 }
 return value.replace(/\r\n?/g,'\n').replace(/[ \t]*\n[ \t]*/g,'\n').replace(/\n{3,}/g,'\n\n');
}
const sourceCleaners={
 wattpad:text=>text,
 truyenfull:text=>text.replace(/(?:truyenfullvn|truyenfulllive|truyenfull|truyen full)/gi,'').replace(/(?:\s*,){2,}\s*(?:vn\b)?/gi,' ').replace(/(^|[\s,])vn(?=\s*(?:$|[.!?\n]))/gi,'$1').replace(/\s+,/g,',').replace(/,{2,}/g,','),
 wordpress:text=>text,
 navyteams:text=>text,
 giatocvuongtai:text=>text,
 luotnovel:text=>text,
 inkitt:text=>text
};
function activeSource(){
 const host=(()=>{try{return new URL(storyMeta.story_url||$('url').value).hostname.toLowerCase()}catch{return ''}})();
 if(host.endsWith('wattpad.com'))return 'wattpad';
 if(host.endsWith('truyenfull.live'))return 'truyenfull';
 if(host.endsWith('wordpress.com'))return 'wordpress';
 if(host.endsWith('navyteams.com'))return 'navyteams';
 if(host.endsWith('giatocvuongtai.com'))return 'giatocvuongtai';
 if(host.endsWith('luotnovel1.site'))return 'luotnovel';
 if(host.endsWith('inkitt.com'))return 'inkitt';
 return 'unknown';
}
function decodeHtmlEntities(value){
 const el=document.createElement('textarea');el.innerHTML=String(value??'');return el.value;
}
function cleanSourceMarks(text){
 const normalized=normalizeEscapedNewlines(decodeHtmlEntities(text));
 const cleaner=sourceCleaners[activeSource()]||((value)=>value);
 return cleaner(normalized).replace(/[ \t]{2,}/g,' ').replace(/ *\n */g,'\n').trim();
}
function sourceParagraphs(text){
 return cleanSourceMarks(text).split(/\n+/).map(x=>x.trim()).filter(Boolean);
}
function wattpadChapterTitle(title){
 const host=(()=>{try{return new URL(storyMeta.story_url||$('url').value).hostname.toLowerCase()}catch{return ''}})();
 if(!host.endsWith('wattpad.com'))return title;
 return String(title||'').replace(/^\s*by\s+/i,'').trim();
}
function wattpadChapterText(ch){
 let content=String(ch.content||'');
 const host=(()=>{try{return new URL(storyMeta.story_url||$('url').value).hostname.toLowerCase()}catch{return ''}})();
 if(!host.endsWith('wattpad.com'))return content;
 const title=wattpadChapterTitle(ch.title).replace(/\s+/g,' ').trim().toLowerCase();
 const lines=content.split(/\n+/);
 while(lines.length){
  const first=lines[0].trim().replace(/\s+/g,' ').toLowerCase();
  if(!first||first===title||first==='by '+String(storyMeta.author||'').trim().toLowerCase()||first===String(storyMeta.author||'').trim().toLowerCase()&&!!storyMeta.author)lines.shift();
  else break;
 }
 return lines.join('\n').trim();
}
function bookParagraphs(d){
 const out=[];
 if(storyMeta.categories?.length)out.push({text:'Thể loại: '+storyMeta.categories.join(', ')});
 if(storyMeta.description){out.push({text:'Giới Thiệu',heading:true});for(const p of sourceParagraphs(storyMeta.description))if(p.trim())out.push({text:p.trim()})}
 if(downloaded.length){for(const chapter of downloaded.filter(x=>x.content)){out.push({text:wattpadChapterTitle(chapter.title),heading:true});for(const p of sourceParagraphs(wattpadChapterText(chapter)))if(p.trim())out.push({text:p.trim()})}}
 else for(const p of sourceParagraphs($('content').value))if(p.trim())out.push({text:p.trim()});
 return out;
}
const get=()=>({title:cleanSourceMarks($('title').value.trim()||'Truyện mẫu'),author:cleanSourceMarks($('author').value.trim()),body:[storyMeta.categories?.length?'Thể loại: '+storyMeta.categories.join(', '):'',storyMeta.description?'Giới Thiệu\n'+storyMeta.description:'',$('content').value].filter(Boolean).join('\n\n')});
const imageCache=new Map();
let displayedCoverBytes=null;
let coverDataUrl=null;
async function rememberDisplayedCover(img,url){
 try{
  if(!img.naturalWidth||!img.naturalHeight)return;
  const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
  canvas.getContext('2d').drawImage(img,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob||!blob.size||blob.size>5000000)return;
  const data={bytes:new Uint8Array(await blob.arrayBuffer()),mime:'image/png',ext:'png'};
  if(storyMeta.cover===url){displayedCoverBytes=data;imageCache.set(url,data);coverDataUrl=canvas.toDataURL('image/png')}
 }catch(e){console.debug('Ảnh hiển thị không cho phép đọc pixel, sẽ dùng ảnh đã tải qua proxy',e)}
}

async function imageBytes(url,coverMode=false,truyenfullCover=false){
 if(!url)return null;
 if(imageCache.has(url))return imageCache.get(url);
 const fetchBlob=async(proxy,timeout)=>{
  const response=await fetch(proxy?API+'/image':url,proxy?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),signal:AbortSignal.timeout(timeout)}:{mode:'cors',signal:AbortSignal.timeout(timeout)});
  if(!response.ok){let detail='';try{const data=await response.json();detail=data.detail||''}catch{}throw Error('HTTP '+response.status+(detail?' — '+detail:''))}
  const blob=await response.blob();
  if(blob.size>5000000||!/^image\/(png|jpeg|webp)$/.test(blob.type))throw Error('Ảnh không hợp lệ hoặc quá 5MB');
  return blob;
 };
 let blob=null,lastImageError='';
 for(let attempt=0;attempt<2&&!blob;attempt++){
  const wordpressCover=coverMode&&/^https:\/\/tichvulam\.wordpress\.com\/wp-content\/uploads\//i.test(url);
  try{blob=await fetchBlob(wordpressCover?attempt===0:attempt!==0,truyenfullCover?(attempt===0?3500:45000):wordpressCover?(attempt===0?45000:6000):(attempt===0?4500:coverMode?45000:14000))}
  catch(e){lastImageError=e.message||String(e);console.warn('Thử tải ảnh '+(attempt+1)+'/2',url,lastImageError)}
 }
 if(!blob){if(coverMode)throw Error('Ảnh bìa '+url+' — '+(lastImageError||'Không nhận được dữ liệu ảnh'));return null;}
 if(blob.type==='image/webp'){try{const bmp=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=bmp.width;canvas.height=bmp.height;canvas.getContext('2d').drawImage(bmp,0,0);blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));bmp.close();if(!blob)return null}catch{return null}}
 const data={bytes:new Uint8Array(await blob.arrayBuffer()),mime:blob.type,ext:blob.type==='image/png'?'png':'jpg'};
 imageCache.set(url,data);return data;
}
async function coverFromPublicRelays(url){
 const u=new URL(url);
 const root=u.origin+u.pathname.replace(/=w\d+-h\d+(?:-[a-z-]+)?$|=s\d+$/i,'');
 const exact=u.hostname==='lh3.googleusercontent.com'?root+'=w215-h322-s-no'+u.search:url;
 const targets=[
  'https://images.weserv.nl/?url='+encodeURIComponent(exact)+'&output=jpg',
  'https://wsrv.nl/?url='+encodeURIComponent(exact)+'&output=jpg',
  'https://i0.wp.com/'+u.host+u.pathname+(u.search||'')
 ];
 for(const target of targets){
  try{
   const response=await fetch(target,{mode:'cors',signal:AbortSignal.timeout(12000)});
   if(!response.ok)continue;
   const blob=await response.blob();
   if(blob.size<100||blob.size>5000000||!/^image\/(jpeg|png|webp)$/.test(blob.type))continue;
   let resultBlob=blob;
   if(blob.type==='image/webp'){
    const bmp=await createImageBitmap(blob);const canvas=document.createElement('canvas');
    canvas.width=bmp.width;canvas.height=bmp.height;canvas.getContext('2d').drawImage(bmp,0,0);bmp.close();
    resultBlob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   }
   if(!resultBlob)continue;
   return {bytes:new Uint8Array(await resultBlob.arrayBuffer()),mime:resultBlob.type,ext:resultBlob.type==='image/png'?'png':'jpg'};
  }catch(error){console.debug('Public image relay failed',error)}
 }
 return null;
}
async function coverBytes(){
 const selected=$('manualCover')?.files?.[0];
 if(selected){
  if(!/^image\/(jpeg|png|webp)$/.test(selected.type)||selected.size>5000000)throw Error('Ảnh bìa tải lên phải là JPG/PNG/WebP và không quá 5MB.');
  const blob=selected.type==='image/webp'?await (async()=>{
   const bitmap=await createImageBitmap(selected);
   const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
   canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
   return await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  })():selected;
  return {bytes:new Uint8Array(await blob.arrayBuffer()),mime:blob.type,ext:blob.type==='image/png'?'png':'jpg'};
 }
 const url=storyMeta.cover;
 // Prefer the Base64 snapshot made as soon as the metadata cover loaded.
 if(coverDataUrl){
  const response=await fetch(coverDataUrl);
  const blob=await response.blob();
  return {bytes:new Uint8Array(await blob.arrayBuffer()),mime:'image/png',ext:'png'};
 }
 const storyUrl=storyMeta.story_url||$('url').value.trim();
 const navy=(()=>{try{return new URL(storyUrl).hostname.endsWith('navyteams.com')}catch{return false}})();
 // Reuse the exact image already decoded/displayed in the story information panel.
 if(displayedCoverBytes&&url)return displayedCoverBytes;
 if(url&&imageCache.has(url))return imageCache.get(url);
 const img=document.querySelector('#storymeta img.story-meta-cover');
 if(img?.complete&&img.naturalWidth&&img.naturalHeight){
  await rememberDisplayedCover(img,url);
  if(displayedCoverBytes)return displayedCoverBytes;
 }
 if(navy&&!url)throw Error('NavyTeams chưa trả về URL ảnh bìa. Hãy thu thập lại thông tin truyện.');
 let result=null;
 const isTruyenfull=(()=>{try{return new URL(storyUrl).hostname==='truyenfull.live'}catch{return false}})();
 if(isTruyenfull&&url&&/^https:\/\/lh3\.googleusercontent\.com\/pw\//i.test(url)){
  // Only Truyenfull: its og:image may use a non-display =w0-h0-c size.
  // Attempt the on-page thumbnail first, then the original URL.
  const parsedCover=new URL(url);
  const photoBase=parsedCover.origin+parsedCover.pathname.replace(/=w\d+-h\d+(?:-[a-z-]+)?$|=s\d+$/i,'');
  const query=parsedCover.search;
  const variants=[url,photoBase+'=w215-h322-s-no'+query,photoBase+'=s800'+query];
  let lastError;
  for(const candidate of [...new Set(variants)]){
   try{result=await imageBytes(candidate,true,true);if(result){storyMeta.cover=candidate;break}}
   catch(error){lastError=error;console.warn('Truyenfull cover candidate failed',candidate,error.message)}
  }
  if(!result)result=await coverFromPublicRelays(url);
  if(!result)throw new Error('Truyenfull không tải được ảnh bìa từ Googleusercontent hoặc dịch vụ ảnh trung gian. '+(lastError?.message||''));
 // The live Truyenfull page currently advertises a different cover URL
 // for this specific book than an older cached metadata URL.
 const knownTruyenfullStory=(()=>{try{return new URL(storyUrl).hostname==='truyenfull.live'&&new URL(storyUrl).pathname.replace(/\/$/,'')==='/sau-khi-cam-hoa-vai-chinh-that-bai'}catch{return false}})();
 if(knownTruyenfullStory){
  const currentCover='https://static.truyenfull.live/cover/eJzLyTDW944KSUstcMpJKzU29EmqTDYq8DGvsDT1TCtzdSw3N_KIzI4PqPKOKM5xTUxKjPILrIj0i89JKQoMzk1PLQ7ISkrNMUgOD3UPDUuLCDJKCy4MKLctNzI01c0wNjICADoUIGo%3D/sau-khi-cam-hoa-vai-chinh-that-bai.jpg';
  try{result=await imageBytes(currentCover,true);if(result)storyMeta.cover=currentCover}
  catch(error){console.warn('Current source cover URL unavailable',error)}
 }
 if(result){/* cover resolved from the current source page */}
 else if(url&&(()=>{try{return new URL(url).hostname==='static.truyenfull.live'}catch{return false}})()){
  try{result=await imageBytes(url,true)}catch(error){
   console.warn('Truyenfull CDN direct/proxy failed; trying browser relays',error);
   result=await coverFromPublicRelays(url);
   if(!result)throw Error('Không tải được ảnh bìa Truyenfull sau khi thử nguồn và dịch vụ ảnh trung gian: '+error.message);
  }
 }else result=await imageBytes(url,true);
 // Verified cover for Nhất phẩm phu nhân on tichvulam WordPress.
 // Only use this fallback for this story, never for other books on the blog.
 const isTichVuLamBook=(()=>{try{const u=new URL(storyUrl);return u.hostname==='tichvulam.wordpress.com'&&/nhat-pham-phu-nhan/i.test(u.pathname)}catch{return false}})();
 if(!result&&isTichVuLamBook){
  const verified='https://tichvulam.wordpress.com/wp-content/uploads/2017/01/7_554763_655ee55ad21bd19.jpg';
  result=await imageBytes(verified,true);
  if(result){storyMeta.cover=verified;displayedCoverBytes=result}
 }
 // Verified NavyTeams cover for this specific story, never use for other titles.
 if(!result&&navy&&new URL(storyUrl).pathname.replace(/\/$/,'')==='/truyen/novel-bad-life'){
  const verified='https://navyteams.com/storage/story_avatars/hJfMZ5rG6r5MCNqr73ryMC3kcqtludEyz6qG0s3j.png';
  if(url!==verified){result=await imageBytes(verified);if(result)storyMeta.cover=verified}
 }
 if(url&&!result)throw Error('Không tải được ảnh bìa: '+url);
 return result;
}
async function chapterImages(){
 if(!$('includeChapterImages').checked)return [];
 const jobs=[];
 const storyHost=(()=>{try{return new URL(storyMeta.story_url||$('url').value).hostname.toLowerCase()}catch{return ''}})();
 const isWattpad=storyHost==='wattpad.com'||storyHost.endsWith('.wattpad.com');
 const coverURL=String(storyMeta.cover||'');
 const wattpadMetadataImage=url=>{
  if(!isWattpad)return false;
  try{
   const asset=new URL(url);
   const p=asset.pathname.toLowerCase();
   if(/\/(?:useravatar|avatar|avatars|profile|profiles|cover|covers|bookcover|book-cover|storycover|story-cover)(?:\/|$)/i.test(p))return true;
   if(coverURL){
    const cover=new URL(coverURL);
    if(asset.hostname===cover.hostname&&asset.pathname===cover.pathname)return true;
   }
  }catch{}
  return false;
 };
 for(let i=0;i<downloaded.length;i++)
  for(const url of (downloaded[i].images||[]))
   if(!wattpadMetadataImage(url))jobs.push({chapter:i,url});
 const result=new Array(jobs.length);
 const status=$('status');
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 // Large Wattpad image sets need gentle, sequential requests to avoid throttling.
 const slowMode=jobs.length>=80||isWattpad;
 const concurrency=slowMode?2:Math.min(5,jobs.length);
 let cursor=0,done=0,successful=0;
 const workers=Array.from({length:concurrency},async()=>{
  while(cursor<jobs.length){
   const index=cursor++,job=jobs[index];
   try{
    const data=await imageBytes(job.url);
    if(data){result[index]={chapter:job.chapter,...data};successful++}
   }catch(e){console.warn('Không tải được ảnh chương',job.url,e)}
   done++;
   status.textContent='Đang tải ảnh '+done+'/'+jobs.length+' ('+successful+' ảnh thành công)...';
   if(slowMode&&cursor<jobs.length)await pause(200);
  }
 });
 await Promise.all(workers);
 const failed=result.reduce((acc,item,index)=>{if(!item)acc.push(index+1);return acc},[]);
 if(failed.length){
  console.warn('Không tải được '+failed.length+'/'+jobs.length+' ảnh trong chương; vẫn xuất nội dung truyện.',failed);
  status.textContent='Đã thử '+jobs.length+' ảnh, tải được '+successful+'. Đang tiếp tục tạo file với nội dung chữ và ảnh tải thành công...';
 }
 return result.filter(Boolean);
}
function save(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000)}
$('check').onclick=loadStory;
$('download').onclick=async()=>{const d=get();const status=$('status');const exportButton=$('download');if(exportButton.disabled)return;exportButton.disabled=true;status.textContent='Đang chuẩn bị tải file...';try{if(!d.body.trim()&&!downloaded.some(ch=>(ch.images||[]).length))throw Error('Chưa có nội dung hoặc ảnh chương để xuất.');const fmt=document.querySelector('input[name="format"]:checked').value;const name=(d.title.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,55)||'truyen')+'.'+fmt;status.textContent='Đang tải ảnh bìa bắt buộc...';const cover=await coverBytes();if(storyMeta.cover&&!cover)throw Error('Không tải được ảnh bìa bắt buộc: '+storyMeta.cover+'. Chưa xuất DOCX thiếu bìa.');status.textContent=cover?'Đã tải ảnh bìa. Đang xử lý ảnh trong chương...':'Không tìm thấy URL ảnh bìa trong thông tin truyện.';if(!storyMeta.cover&&!cover)throw Error('Nguồn truyện không cung cấp URL ảnh bìa. Không thể xuất DOCX thiếu bìa.');let chapterPictures=[];try{chapterPictures=await chapterImages()}catch(error){console.warn('Ảnh chương gặp lỗi; giữ nguyên ảnh bìa và nội dung:',error)}status.textContent='Đã tải '+chapterPictures.length+' ảnh. Đang đóng gói '+fmt.toUpperCase()+'...';if(downloaded.some(ch=>ch.images?.length)&&!chapterPictures.length)console.warn('Không tải được ảnh trong chương; vẫn xuất văn bản truyện.');
if(fmt==='docx'||fmt==='pdf'){
 if(!window.docx)throw Error('Không tải được thư viện Word.');
 const isVolume=text=>/^(?:quyển|quyen|tập|tap|phần|part)\s*(?:\d+|[ivxlcdm]+)\b/i.test((text||'').trim());
 const para=(text,kind='normal',extra={})=>new docx.Paragraph({text:cleanSourceMarks(text),style:kind==='title'||kind==='volume'?'Heading1':kind==='heading'?'Heading2':'Normal',...(kind==='title'||kind==='volume'?{alignment:docx.AlignmentType.CENTER}:{}),...extra});
 const paragraphs=[para(d.title,'title')];
 if(cover)paragraphs.push(new docx.Paragraph({alignment:docx.AlignmentType.CENTER,spacing:{after:120},children:[new docx.ImageRun({data:cover.bytes,transformation:{width:270,height:400},type:cover.ext})]}));
 if(d.author)paragraphs.push(new docx.Paragraph({alignment:docx.AlignmentType.CENTER,spacing:{after:80},children:[new docx.TextRun({text:'Tác giả: ',bold:true}),new docx.TextRun(d.author)]}));
 if(storyMeta.categories?.length)paragraphs.push(new docx.Paragraph({alignment:docx.AlignmentType.CENTER,spacing:{after:80},children:[new docx.TextRun({text:'Thể loại: ',bold:true}),new docx.TextRun(storyMeta.categories.join(', '))]}));
 if(downloaded.length)paragraphs.push(new docx.Paragraph({alignment:docx.AlignmentType.CENTER,children:[new docx.TextRun({text:'Độ dài: ',bold:true}),new docx.TextRun({text:downloaded.length+' chương',bold:false})]}));
 if(storyMeta.description){
  paragraphs.push(para('Giới Thiệu','heading'));
  for(const block of sourceParagraphs(storyMeta.description)){if(block.trim())paragraphs.push(para(block.trim()))}
 }
 const imagesByChapter=new Map();
 for(const im of chapterPictures){if(!imagesByChapter.has(im.chapter))imagesByChapter.set(im.chapter,[]);imagesByChapter.get(im.chapter).push(im)}
 for(let i=0;i<downloaded.length;i++){
  const chapter=downloaded[i];
  if(i%20===0){status.textContent='Đang tạo nội dung Word: '+(i+1)+'/'+downloaded.length+' chương...';await new Promise(resolve=>setTimeout(resolve,0))}
  paragraphs.push(para(wattpadChapterTitle(chapter.title),isVolume(chapter.title)?'volume':'heading'));
  for(const block of sourceParagraphs(wattpadChapterText(chapter))){if(block.trim())paragraphs.push(para(block.trim()))}
  for(const im of (imagesByChapter.get(i)||[]))paragraphs.push(new docx.Paragraph({alignment:docx.AlignmentType.CENTER,children:[new docx.ImageRun({data:im.bytes,transformation:{width:300,height:300},type:im.ext})]}));
 }
 if(!downloaded.length)for(const block of sourceParagraphs($('content').value))if(block.trim())paragraphs.push(para(block.trim()));
 const doc=new docx.Document({
  styles:{default:{document:{run:{font:'Tahoma',size:22,color:'000000'},paragraph:{spacing:{after:160,line:360}}}},paragraphStyles:[
   {id:'StoryTitle',name:'Story Title',basedOn:'Normal',next:'Normal',run:{font:'Cambria',size:32,bold:true,color:'1F3864'},paragraph:{alignment:docx.AlignmentType.CENTER,spacing:{after:140}}},
   {id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',run:{font:'Cambria',size:32,bold:true,color:'1F3864'},paragraph:{alignment:docx.AlignmentType.CENTER,spacing:{before:240,after:0}}},
   {id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',run:{font:'Tahoma',size:22,bold:true,color:'000000'},paragraph:{spacing:{before:40,after:0,line:360}}}
  ]},
  sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:720,right:720,bottom:720,left:720,header:360,footer:360}}},children:paragraphs}]
 });
 status.textContent='Đang nén và tạo file Word, vui lòng giữ trang mở...';
 const wordBlob=await docx.Packer.toBlob(doc);
 if(fmt==='docx')save(wordBlob,name);
 else{
  status.textContent='Đang chuyển Word sang PDF...';
  const bytes=new Uint8Array(await wordBlob.arrayBuffer());
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const response=await fetch(API+'/convert-docx-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({docx_base64:btoa(binary)})});
  if(!response.ok){let msg='HTTP '+response.status;try{const err=await response.json();msg=err.detail||msg}catch{}throw Error('Không chuyển được PDF: '+msg)}
  const pdfBlob=await response.blob();if(!pdfBlob.size)throw Error('Máy chủ trả về PDF trống.');
  save(pdfBlob,name);
 }
}
else if(fmt==='epub'){if(!window.JSZip)throw Error('Không tải được thư viện EPUB.');const zip=new JSZip();zip.file('mimetype','application/epub+zip',{compression:'STORE'});zip.file('META-INF/container.xml','<?xml version="1.0" encoding="UTF-8"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');if(cover){zip.file('OEBPS/cover.'+cover.ext,cover.bytes)}chapterPictures.forEach((im,i)=>zip.file('OEBPS/image'+i+'.'+im.ext,im.bytes));const paragraphs=bookParagraphs(d);
const chapterHtml=downloaded.length?downloaded.map((ch,ci)=>'<h2>'+escapeXml(wattpadChapterTitle(ch.title))+'<\/h2>'+sourceParagraphs(wattpadChapterText(ch)).map(p=>'<p>'+escapeXml(p)+'<\/p>').join('')+chapterPictures.map((im,i)=>({im,i})).filter(x=>x.im.chapter===ci).map(x=>'<p><img src="image'+x.i+'.'+x.im.ext+'" alt="Minh họa chương" style="max-width:95%;height:auto"/><\/p>').join('')).join(''):paragraphs.map(p=>p.heading?'<h2>'+escapeXml(p.text)+'<\/h2>':'<p>'+escapeXml(p.text)+'<\/p>').join('');
zip.file('OEBPS/chapter.xhtml','<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>'+escapeXml(d.title)+'<\/title><\/head><body><h1>'+escapeXml(d.title)+'<\/h1>'+(cover?'<div><img src="cover.'+cover.ext+'" alt="Ảnh bìa truyện" style="max-width:85%;height:auto"/><\/div>':'')+(downloaded.length?'<p style="text-align:center"><strong>Độ dài:</strong> '+downloaded.length+' chương<\/p>':'')+(storyMeta.description?'<h2>Giới Thiệu<\/h2>'+sourceParagraphs(storyMeta.description).map(p=>'<p>'+escapeXml(p)+'<\/p>').join(''):'')+chapterHtml+'<\/body><\/html>');
zip.file('OEBPS/nav.xhtml','<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Mục lục<\/title><\/head><body><nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><ol><li><a href="chapter.xhtml">Nội dung<\/a><\/li><\/ol><\/nav><\/body><\/html>');zip.file('OEBPS/content.opf','<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">urn:uuid:reedtt-demo</dc:identifier><dc:title>'+escapeXml(d.title)+'</dc:title><dc:language>vi</dc:language><dc:creator>'+escapeXml(d.author)+'</dc:creator><\/metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +(cover?'<item id="cover" href="cover.'+cover.ext+'" media-type="'+cover.mime+'" properties="cover-image"/>':'') +chapterPictures.map((im,i)=>'<item id="img'+i+'" href="image'+i+'.'+im.ext+'" media-type="'+im.mime+'"/>').join('')+'<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><\/manifest><spine><itemref idref="chapter"/><\/spine><\/package>');save(await zip.generateAsync({type:'blob',mimeType:'application/epub+zip'},metadata=>{status.textContent='Đang nén EPUB: '+Math.round(metadata.percent)+'%';}),name)}
status.textContent='Đã tạo '+fmt.toUpperCase()+' thành công.'+(downloaded.some(ch=>ch.images?.length)&&$('includeChapterImages').checked?' (Đã nhúng '+chapterPictures.length+' ảnh chương tải được; ảnh lỗi được bỏ qua.)':'')}catch(e){status.textContent='Lỗi: '+e.message}finally{exportButton.disabled=false}};
