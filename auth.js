/* =========================================================
   MEDLAB AUTH — نظام المصادقة الآمن
   - يستخدم SHA-256 للتشفير
   - يخزّن بيانات الدخول مشفّرة في localStorage
   - يوفّر جلسة موحّدة عبر sessionStorage
   ========================================================= */
(function(global){
'use strict';

const CONFIG={
  STORAGE_KEY:'medlab_secure_credentials_v1',
  SESSION_KEY:'medlab_session_token_v1',
  SESSION_TIMEOUT:0, // 0 = لا ينتهي حتى الخروج اليدوي
  REDIRECT_KEY:'medlab_redirect_target',
  // كلمة سر افتراضية (تُشفَّر تلقائياً عند أول استخدام)
  DEFAULT_USERNAME:'admin',
  DEFAULT_PASSWORD:'123'
};

/* =========================================================
   SHA-256 — تشفير قوي
========================================================= */
async function sha256(text){
  // UTF-8 encode
  const data=new TextEncoder().encode(text);
  const hashBuffer=await crypto.subtle.digest('SHA-256',data);
  const hashArray=Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* =========================================================
   IN-MEMORY SALT (مولّد عشوائي لكل جهاز)
========================================================= */
function getDeviceSalt(){
  let salt=localStorage.getItem('medlab_device_salt');
  if(!salt){
    salt=crypto.getRandomValues(new Uint8Array(16))
      .reduce((s,b)=>s+b.toString(16).padStart(2,'0'),'');
    localStorage.setItem('medlab_device_salt',salt);
  }
  return salt;
}

/* =========================================================
   CREDENTIAL STORAGE
========================================================= */
function getStoredCredentials(){
  try{
    const raw=localStorage.getItem(CONFIG.STORAGE_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed||!parsed.userHash||!parsed.passHash)return null;
    return parsed;
  }catch(e){
    return null;
  }
}

async function ensureDefaultCredentials(){
  const existing=getStoredCredentials();
  if(existing)return existing;

  const salt=getDeviceSalt();
  const userHash=await sha256(salt+'::'+CONFIG.DEFAULT_USERNAME);
  const passHash=await sha256(salt+'::'+CONFIG.DEFAULT_PASSWORD);

  const data={
    userHash,
    passHash,
    version:1,
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
  localStorage.setItem(CONFIG.STORAGE_KEY,JSON.stringify(data));
  return data;
}

/* =========================================================
   SESSION TOKEN — جلسة عشوائية
========================================================= */
function generateSessionToken(){
  return crypto.getRandomValues(new Uint8Array(32))
    .reduce((s,b)=>s+b.toString(16).padStart(2,'0'),'');
}

function getSession(){
  try{
    const raw=sessionStorage.getItem(CONFIG.SESSION_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed||!parsed.token||!parsed.expiresAt)return null;
    if(Date.now()>parsed.expiresAt){
      sessionStorage.removeItem(CONFIG.SESSION_KEY);
      return null;
    }
    return parsed;
  }catch(e){
    return null;
  }
}

function startSession(){
  const token=generateSessionToken();
  const now=Date.now();
  const session={
    token,
    createdAt:now,
    expiresAt:CONFIG.SESSION_TIMEOUT>0?now+CONFIG.SESSION_TIMEOUT:now+(1000*60*60*24*365*10), // 10 سنوات افتراضياً
    userAgent:navigator.userAgent
  };
  sessionStorage.setItem(CONFIG.SESSION_KEY,JSON.stringify(session));
  return session;
}

function endSession(){
  sessionStorage.removeItem(CONFIG.SESSION_KEY);
  sessionStorage.removeItem('medlab_admin_logged_in');
  sessionStorage.removeItem('medlab_admin_username');
}

/* =========================================================
   REDIRECT TARGET — يتذكر الصفحة التي طلبها المستخدم
========================================================= */
function setRedirectTarget(url){
  try{
    sessionStorage.setItem(CONFIG.REDIRECT_KEY,url);
  }catch(e){}
}

function getRedirectTarget(){
  try{
    const target=sessionStorage.getItem(CONFIG.REDIRECT_KEY);
    sessionStorage.removeItem(CONFIG.REDIRECT_KEY);
    return target||null;
  }catch(e){
    return null;
  }
}

/* =========================================================
   LOGIN / LOGOUT
========================================================= */
async function login(username,password){
  await ensureDefaultCredentials();

  const creds=getStoredCredentials();
  if(!creds)return false;

  const salt=getDeviceSalt();
  const userHash=await sha256(salt+'::'+username);
  const passHash=await sha256(salt+'::'+password);

  // مقارنة ثابتة الزمن (تقريبية)
  const userOk=timingSafeEqual(userHash,creds.userHash);
  const passOk=timingSafeEqual(passHash,creds.passHash);

  if(userOk&&passOk){
    startSession();
    // احتفظ باسم المستخدم الحالي للعرض فقط (بدون كلمة السر)
    try{
      sessionStorage.setItem('medlab_admin_username',username);
      sessionStorage.setItem('medlab_admin_logged_in','1');
    }catch(e){}
    return true;
  }
  return false;
}

async function logout(){
  endSession();
  // العودة لصفحة الدخول
  window.location.replace('login.html');
}

/* =========================================================
   CHANGE CREDENTIALS
========================================================= */
async function changeCredentials(currentPassword,newUsername,newPassword){
  await ensureDefaultCredentials();

  const creds=getStoredCredentials();
  if(!creds)return {ok:false,error:'لا توجد بيانات محفوظة'};

  const salt=getDeviceSalt();
  const currentHash=await sha256(salt+'::'+currentPassword);

  if(!timingSafeEqual(currentHash,creds.passHash)){
    return {ok:false,error:'كلمة المرور الحالية غير صحيحة'};
  }

  if(!newUsername||newUsername.length<3){
    return {ok:false,error:'اسم المستخدم قصير جداً (3 أحرف على الأقل)'};
  }
  if(!newPassword||newPassword.length<4){
    return {ok:false,error:'كلمة المرور قصيرة جداً (4 أحرف على الأقل)'};
  }

  const userHash=await sha256(salt+'::'+newUsername);
  const passHash=await sha256(salt+'::'+newPassword);

  const updated={
    userHash,
    passHash,
    version:1,
    createdAt:creds.createdAt,
    updatedAt:new Date().toISOString()
  };
  localStorage.setItem(CONFIG.STORAGE_KEY,JSON.stringify(updated));

  // جدّد الجلسة
  endSession();
  startSession();
  try{
    sessionStorage.setItem('medlab_admin_username',newUsername);
    sessionStorage.setItem('medlab_admin_logged_in','1');
  }catch(e){}

  return {ok:true};
}

/* =========================================================
   HELPERS
========================================================= */
function timingSafeEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string')return false;
  if(a.length!==b.length)return false;
  let result=0;
  for(let i=0;i<a.length;i++){
    result|=a.charCodeAt(i)^b.charCodeAt(i);
  }
  return result===0;
}

/* =========================================================
   PUBLIC API
========================================================= */
const MedlabAuth={
  isLoggedIn:function(){return !!getSession();},
  login,
  logout,
  changeCredentials,
  setRedirectTarget,
  getRedirectTarget,
  getCurrentUsername:function(){
    try{return sessionStorage.getItem('medlab_admin_username')||'admin';}catch(e){return 'admin';}
  },
  resetToDefaults:async function(){
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    localStorage.removeItem('medlab_device_salt');
    await ensureDefaultCredentials();
    endSession();
    return {ok:true,message:'تم إعادة التعيين إلى admin / 123'};
  },
  // للتشخيص فقط
  _config:CONFIG
};

global.MedlabAuth=MedlabAuth;

// جهّز البيانات الافتراضية عند أول تحميل
ensureDefaultCredentials();

})(window);
