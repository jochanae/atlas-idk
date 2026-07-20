import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import "../styles.css";
import NotFound from "@/pages/not-found";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Atlas — Decision Enforcement System" },
      {
        name: "description",
        content:
          "Atlas: a decision enforcement system. Permanent record of architectural decisions, costs, and bought lessons.",
      },
    ],
  }),
  shellComponent: RootShell,
  component: () => <Outlet />,
  notFoundComponent: NotFound,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ background: "#0D0B09" }}>
      <head>
        <HeadContent />
        <style>{`html,body{background:#0D0B09 !important;}`}</style>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  var KEY='__atlas_chunk_reload__';
  var RX=/Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload CSS|Loading chunk \\\\d+ failed|Loading CSS chunk/i;
  // Track the last time the page returned to foreground so we can suppress
  // spurious chunk-load reloads that happen right as the HMR WS reconnects.
  var lastVis=0;
  function _adbg(ev,data){try{var K='atlas_adbg',arr=[];try{arr=JSON.parse(localStorage.getItem(K)||'[]');}catch(x){}var ts=new Date().toISOString().replace('T',' ').slice(0,23),sc=0;try{sc=Number(sessionStorage.getItem('atlas_sc')||0);}catch(x){}arr.push(Object.assign({t:Date.now(),ts:ts,event:ev,stagedCount:sc},data||{}));if(arr.length>300)arr.splice(0,arr.length-300);localStorage.setItem(K,JSON.stringify(arr));console.log('[AttachDebug '+ts+'] '+ev,data||'');}catch(x){}}
  document.addEventListener('visibilitychange',function(){
    if(!document.hidden){lastVis=Date.now();_adbg('visibility_foreground');}
    else{_adbg('visibility_background');}
  });
  function clearRuntimeCaches(){
    try{
      if('caches' in window){
        caches.keys().then(function(keys){
          return Promise.all(keys.map(function(key){ return caches.delete(key); }));
        }).catch(function(){});
      }
      if('serviceWorker' in navigator){
        navigator.serviceWorker.getRegistrations().then(function(regs){
          return Promise.all(regs.map(function(reg){ return reg.unregister(); }));
        }).catch(function(){});
      }
    }catch(_){ }
  }
  function reload(msg){
    try{
      if(!msg||!RX.test(String(msg)))return false;
      // Suppress for 8 s after returning from a background tab — HMR WS needs
      // time to reconnect; the lazy retry in App.tsx will recover without a reload.
      if(Date.now()-lastVis<30000)return false;
      var last=Number(sessionStorage.getItem(KEY)||0);
      if(Date.now()-last<60000)return false;
      sessionStorage.setItem(KEY,String(Date.now()));
      clearRuntimeCaches();
      _adbg('chunk_error_reload',{msg:String(msg).slice(0,120)});
      location.reload();
      return true;
    }catch(_){return false;}
  }
  window.addEventListener('error',function(e){
    var m=e&&(e.message||(e.error&&e.error.message));
    if(reload(m)){e.preventDefault&&e.preventDefault();}
  },true);
  window.addEventListener('unhandledrejection',function(e){
    var r=e&&e.reason;
    var m=r&&(r.message||String(r));
    if(reload(m)){e.preventDefault&&e.preventDefault();}
  });
  // beforeunload fires for EVERY reload and navigation — even Vite HMR's own
  // location.reload().  Logged to localStorage so the NEXT page load can read it.
  window.addEventListener('beforeunload',function(){
    _adbg('page_beforeunload',{href:window.location.href,visAge:Date.now()-lastVis});
  });
  // Reset the visibility timestamp whenever the file picker returns.
  // On many mobile browsers the file picker does NOT fire visibilitychange,
  // so lastVis can be stale when onChange fires and the 8-second guard would
  // not protect against chunk-load errors that arrive right after the picker.
  window.addEventListener('atlas-picker-return',function(){
    lastVis=Date.now();
    _adbg('picker_return_lastVis_reset');
  });
})();`,
          }}
        />
      </head>
      <body style={{ background: "#0D0B09" }}>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
