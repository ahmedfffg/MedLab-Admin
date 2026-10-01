/* =========================================================
   MEDLAB GUARD — حماية الصفحات
   يُضمَّن في كل صفحة محمية (index, appointments, patients, ...)
   ========================================================= */
(function(){
'use strict';

// انتظر حتى يتم تحميل auth.js
if(!window.MedlabAuth){
  console.error('❌ auth.js يجب تحميله قبل guard.js');
  return;
}

const AUTH=window.MedlabAuth;
const PUBLIC_PAGES=['login.html','auth.js','guard.js','admin-settings.html'];
const currentPage=window.location.pathname.split('/').pop()||'index.html';

// إذا كانت الصفحة عامة، لا تفعل شيئاً
if(PUBLIC_PAGES.some(p=>currentPage===p))return;

// إذا لم يكن مسجل دخول → احفظ الهدف واذهب للدخول
if(!AUTH.isLoggedIn()){
  AUTH.setRedirectTarget(currentPage+window.location.search);
  window.location.replace('login.html');
  return;
}

/* =========================================================
   منع التنقل للخلف بعد الخروج
========================================================= */
window.addEventListener('pageshow',function(e){
  if(e.persisted){
    // الصفحة استُرجعت من bfcache
    if(!AUTH.isLoggedIn()){
      window.location.replace('login.html');
    }
  }
});

/* =========================================================
   حماية إضافية: منع عرض الصفحة أثناء التحقق
========================================================= */
document.documentElement.style.visibility='visible';

/* =========================================================
   زر الخروج الموحّد
   أي عنصر بـ data-medlab-logout سيؤدي للخروج
========================================================= */
document.addEventListener('DOMContentLoaded',function(){
  document.querySelectorAll('[data-medlab-logout]').forEach(btn=>{
    btn.addEventListener('click',function(e){
      e.preventDefault();
      if(confirm('هل تريد تسجيل الخروج؟')){
        AUTH.logout();
      }
    });
  });
});

console.log('🛡️ MEDLAB Guard active on',currentPage);
})();
