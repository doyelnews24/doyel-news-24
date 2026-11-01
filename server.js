require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads');
const DB_FILE = path.join(DATA_DIR, 'articles.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'doel.sid',
  secret: process.env.SESSION_SECRET || 'development-only-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000*60*60*4 }
}));
app.use(express.static(path.join(ROOT, 'public')));

const categories = ['জাতীয়','রাজনীতি','আন্তর্জাতিক','খেলাধুলা','অর্থনীতি','স্থানীয়','প্রযুক্তি','বিনোদন','অন্যান্য'];
const readArticles = () => {
  try { const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); return Array.isArray(data) ? data : []; }
  catch { return []; }
};
const writeArticles = (items) => fs.writeFileSync(DB_FILE, JSON.stringify(items, null, 2), 'utf8');
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateBn = (v) => new Intl.DateTimeFormat('bn-BD', {day:'numeric',month:'long',year:'numeric'}).format(new Date(v));
const layout = (title, body, admin=false) => `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Doel News 24 — দোয়েল নিউজ ২৪"><title>${esc(title)} | Doel News 24</title><link rel="stylesheet" href="/style.css"></head><body>
<div class="topbar"><div class="container topinner"><span id="today">দোয়েল নিউজ ২৪</span><span>সত্যের পথে, সবসময়</span></div></div>
<header class="container masthead"><a class="brand" href="/"><span class="bird">দ</span><span><b>Doel News <i>24</i></b><strong>দোয়েল নিউজ ২৪</strong></span></a>${admin?'<a class="button light" href="/">ওয়েবসাইট দেখুন</a>':'<form class="search" action="/" method="get"><input name="q" placeholder="খবর খুঁজুন..." value="'+esc(new URLSearchParams(''+(globalThis.__query||'')).get('q')||'')+'"><button>খুঁজুন</button></form>'}</header>
<nav><div class="container navinner"><a href="/">হোম</a>${categories.slice(0,8).map(c=>`<a href="/?category=${encodeURIComponent(c)}">${c}</a>`).join('')}<a href="/admin">অ্যাডমিন</a></div></nav>
<main class="container">${body}</main><footer><div class="container foot"><div><b class="footbrand">Doel News <i>24</i> — দোয়েল নিউজ ২৪</b><p>সত্যের পথে, সবসময়।</p></div><div>© ${new Date().getFullYear()} Doel News 24. সর্বস্বত্ব সংরক্ষিত।</div></div></footer>
<script>document.getElementById('today').textContent=new Intl.DateTimeFormat('bn-BD',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());</script></body></html>`;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, UPLOAD_DIR),
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, Date.now() + '-' + crypto.randomBytes(5).toString('hex') + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))
});
const isAdmin = (req,res,next) => req.session && req.session.admin ? next() : res.redirect('/admin/login');
const adminShell = (title, content) => layout(title, `<section class="adminhead"><div><span class="eyebrow">DOEL NEWS 24</span><h1>${title}</h1></div><div class="adminlinks"><a class="button" href="/admin">ড্যাশবোর্ড</a><form method="post" action="/admin/logout"><button class="button dark" type="submit">লগআউট</button></form></div></section>${content}`, true);

function articleCard(a) {
  return `<article class="article-card">${a.image?`<a href="/article/${encodeURIComponent(a.id)}"><img src="${esc(a.image)}" alt=""></a>`:`<a class="placeholder" href="/article/${encodeURIComponent(a.id)}">দোয়েল নিউজ ২৪</a>`}<div class="article-content"><span class="category">${esc(a.category)}</span><h2><a href="/article/${encodeURIComponent(a.id)}">${esc(a.title)}</a></h2><p>${esc((a.summary||a.body||'').slice(0,155))}${(a.summary||a.body||'').length>155?'…':''}</p><small>${dateBn(a.createdAt)}</small></div></article>`;
}
app.get('/', (req,res) => {
  globalThis.__query = req.query.q || '';
  let articles = readArticles().filter(a=>a.status==='published');
  if(req.query.category) articles=articles.filter(a=>a.category===req.query.category);
  if(req.query.q) { const q=String(req.query.q).toLowerCase(); articles=articles.filter(a=>(a.title+' '+a.summary+' '+a.body+' '+a.category).toLowerCase().includes(q)); }
  articles.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const featured = articles[0];
  const body = `${featured?`<section class="hero"><div class="heroimage">${featured.image?`<img src="${esc(featured.image)}" alt="">`:'<span>DOEL NEWS 24</span>'}</div><div class="herotext"><span class="category">${esc(featured.category)}</span><h1><a href="/article/${encodeURIComponent(featured.id)}">${esc(featured.title)}</a></h1><p>${esc(featured.summary||'সর্বশেষ সংবাদ পড়ুন Doel News 24-এ।')}</p><small>${dateBn(featured.createdAt)}</small></div></section>`:`<section class="welcome"><span class="bird large">দ</span><h1>Doel News 24 — দোয়েল নিউজ ২৪</h1><p>সত্যের পথে, সবসময়</p><p>আপনার প্রথম সংবাদ প্রকাশ করতে অ্যাডমিন প্যানেলে লগইন করুন।</p><a class="button" href="/admin">অ্যাডমিন প্যানেল</a></section>`}
  <div class="section-heading"><h2>${req.query.q?'অনুসন্ধানের ফলাফল':req.query.category?esc(req.query.category):'সর্বশেষ সংবাদ'}</h2><span>${articles.length}টি সংবাদ</span></div>
  <section class="article-grid">${articles.length?articles.map(articleCard).join(''):'<div class="empty">এখানে এখনো কোনো প্রকাশিত সংবাদ নেই। অ্যাডমিন প্যানেল থেকে সংবাদ প্রকাশ করুন।</div>'}</section>`;
  res.send(layout('হোম',body));
});
app.get('/article/:id',(req,res)=>{
  const a=readArticles().find(x=>x.id===req.params.id && x.status==='published');
  if(!a) return res.status(404).send(layout('সংবাদ পাওয়া যায়নি','<div class="empty"><h1>সংবাদ পাওয়া যায়নি</h1><a href="/">হোমে ফিরুন</a></div>'));
  const body=`<article class="story"><div class="breadcrumbs"><a href="/">হোম</a> / ${esc(a.category)}</div><span class="category">${esc(a.category)}</span><h1>${esc(a.title)}</h1><div class="storymeta">প্রকাশ: ${dateBn(a.createdAt)} · Doel News 24</div>${a.image?`<img class="storyimage" src="${esc(a.image)}" alt="">`:''}${a.summary?`<p class="summary">${esc(a.summary)}</p>`:''}<div class="storybody">${esc(a.body).replace(/\n/g,'<br>')}</div><a class="button" href="/">আরও সংবাদ</a></article>`;
  res.send(layout(a.title,body));
});
app.get('/admin',(req,res)=>{ if(!req.session.admin)return res.redirect('/admin/login'); const all=readArticles().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)); const rows=all.map(a=>`<tr><td>${esc(a.title)}</td><td>${esc(a.category)}</td><td><span class="status ${a.status}">${a.status==='published'?'প্রকাশিত':'খসড়া'}</span></td><td>${dateBn(a.createdAt)}</td><td class="actions"><a class="button small" href="/admin/edit/${a.id}">সম্পাদনা</a><form method="post" action="/admin/delete/${a.id}" onsubmit="return confirm('এই সংবাদ মুছে ফেলবেন?')"><button class="button small danger">মুছুন</button></form></td></tr>`).join('');
 const body=`<div class="dashboardstats"><div><b>${all.length}</b><span>মোট সংবাদ</span></div><div><b>${all.filter(a=>a.status==='published').length}</b><span>প্রকাশিত</span></div><div><b>${all.filter(a=>a.status!=='published').length}</b><span>খসড়া</span></div></div><div class="panel"><div class="paneltop"><h2>সংবাদ ব্যবস্থাপনা</h2><a class="button" href="/admin/new">+ নতুন সংবাদ</a></div>${all.length?`<div class="tablewrap"><table><thead><tr><th>শিরোনাম</th><th>বিভাগ</th><th>অবস্থা</th><th>তারিখ</th><th>কাজ</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty">এখনো কোনো সংবাদ নেই। “নতুন সংবাদ” বাটনে চাপ দিয়ে শুরু করুন।</div>'}</div>`;
 res.send(adminShell('অ্যাডমিন ড্যাশবোর্ড',body)); });
app.get('/admin/login',(req,res)=>{ if(req.session.admin)return res.redirect('/admin'); const body=`<section class="loginbox"><h1>অ্যাডমিন লগইন</h1><p>Doel News 24-এর সংবাদ ব্যবস্থাপনায় প্রবেশ করুন।</p>${req.query.error?'<div class="error">ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।</div>':''}<form method="post" action="/admin/login"><label>ইউজারনেম<input name="username" required autocomplete="username"></label><label>পাসওয়ার্ড<input name="password" type="password" required autocomplete="current-password"></label><button class="button full">লগইন করুন</button></form><small>প্রথমবার চালুর আগে .env ফাইলে নিজের ইউজারনেম ও শক্তিশালী পাসওয়ার্ড সেট করুন।</small></section>`;res.send(layout('অ্যাডমিন লগইন',body,true)); });
app.post('/admin/login', (req, res) => {
  const u = process.env.ADMIN_USERNAME;
  const p = process.env.ADMIN_PASSWORD;

  if (!u || !p) {
    return res.status(500).send('Admin username or password is not configured.');
  }

  if (req.body.username !== u || req.body.password !== p) {
    return res.redirect('/admin/login?error=1');
  }

  req.session.regenerate((err) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Session error');
    }

    req.session.admin = true;

    req.session.save((saveErr) => {
      if (saveErr) {
        console.error(saveErr);
        return res.status(500).send('Session save error');
      }

      return res.redirect('/admin');
    });
  });
});
app.post('/admin/logout',isAdmin,(req,res)=>req.session.destroy(()=>res.redirect('/admin/login')));
function formPage(a={}) { return `<div class="panel formpanel"><form method="post" enctype="multipart/form-data" action="${a.id?'/admin/edit/'+a.id:'/admin/new'}"><label>সংবাদের শিরোনাম *<input name="title" required maxlength="180" value="${esc(a.title||'')}"></label><label>বিভাগ<select name="category">${categories.map(c=>`<option ${a.category===c?'selected':''}>${c}</option>`).join('')}</select></label><label>সংক্ষিপ্ত বিবরণ<textarea name="summary" rows="3" maxlength="500">${esc(a.summary||'')}</textarea></label><label>বিস্তারিত সংবাদ *<textarea name="body" rows="10" required>${esc(a.body||'')}</textarea></label><label>সংবাদের ছবি (JPG/PNG/WEBP/GIF, সর্বোচ্চ ৫ MB)<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif"></label>${a.image?`<div class="currentimage">বর্তমান ছবি<br><img src="${esc(a.image)}" alt=""></div>`:''}<label>প্রকাশের অবস্থা<select name="status"><option value="published" ${a.status==='published'?'selected':''}>এখনই প্রকাশ করুন</option><option value="draft" ${a.status==='draft'?'selected':''}>খসড়া হিসেবে রাখুন</option></select></label><div class="formactions"><button class="button">সংরক্ষণ করুন</button><a class="button light" href="/admin">বাতিল</a></div></form></div>`; }
app.get('/admin/new',isAdmin,(req,res)=>res.send(adminShell('নতুন সংবাদ',formPage({status:'published'}))));
app.post('/admin/new',isAdmin,upload.single('image'),(req,res)=>{const {title,category,summary,body,status}=req.body;if(!title||!body)return res.status(400).send('শিরোনাম ও বিস্তারিত সংবাদ আবশ্যক।');const articles=readArticles();articles.push({id:crypto.randomUUID(),title:title.trim(),category:categories.includes(category)?category:'অন্যান্য',summary:(summary||'').trim(),body:body.trim(),status:status==='draft'?'draft':'published',image:req.file?'/uploads/'+req.file.filename:'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});writeArticles(articles);res.redirect('/admin');});
app.get('/admin/edit/:id',isAdmin,(req,res)=>{const a=readArticles().find(x=>x.id===req.params.id);if(!a)return res.redirect('/admin');res.send(adminShell('সংবাদ সম্পাদনা',formPage(a)));});
app.post('/admin/edit/:id',isAdmin,upload.single('image'),(req,res)=>{const articles=readArticles(),i=articles.findIndex(x=>x.id===req.params.id);if(i<0)return res.redirect('/admin');const a=articles[i];a.title=(req.body.title||'').trim();a.category=categories.includes(req.body.category)?req.body.category:'অন্যান্য';a.summary=(req.body.summary||'').trim();a.body=(req.body.body||'').trim();a.status=req.body.status==='draft'?'draft':'published';a.updatedAt=new Date().toISOString();if(req.file)a.image='/uploads/'+req.file.filename;writeArticles(articles);res.redirect('/admin');});
app.post('/admin/delete/:id',isAdmin,(req,res)=>{const articles=readArticles();const a=articles.find(x=>x.id===req.params.id);if(a&&a.image){const f=path.join(ROOT,'public',a.image.replace(/^\//,''));if(f.startsWith(UPLOAD_DIR)&&fs.existsSync(f))try{fs.unlinkSync(f)}catch{}}writeArticles(articles.filter(x=>x.id!==req.params.id));res.redirect('/admin');});
app.use((err,req,res,next)=>{console.error(err);if(err instanceof multer.MulterError)return res.status(400).send(layout('আপলোড সমস্যা',`<div class="empty">ছবি ৫ MB-এর মধ্যে হতে হবে। <a href="/admin">ফিরে যান</a></div>`));res.status(500).send(layout('সমস্যা হয়েছে','<div class="empty">সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।</div>'));});
app.listen(PORT,()=>console.log(`Doel News 24 running at http://localhost:${PORT}`));
