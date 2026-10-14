/* Suchhilfe - hält die App im Gerät, damit sie ohne Empfang startet.
   Wird nur wirksam, wenn die Seite über eine https-Adresse geöffnet wird.
   Bei einer doppelt angeklickten Datei überspringt die App das hier.

   Grundsatz seit 14.10.2026:
   - Die App selbst (index.html) wird ZUERST aus dem Netz geholt, mit 2
     Sekunden Geduld. Nur wenn das scheitert, kommt die gespeicherte Fassung.
     Damit ist eine neu hochgeladene Fassung sofort da und nicht erst beim
     übernächsten Öffnen.
   - Der Plan (plan.pdf) kommt zuerst aus dem Speicher, weil er sich nicht
     ändert - das hält den Start schnell.
   - Die Lagernummer steckt im Namen. Wird sie erhöht, wirft der Browser
     beim nächsten Start alles Alte weg. */

var FASSUNG = '2026-10-14-3';
var LAGER   = 'suchhilfe-' + FASSUNG;
var DATEIEN = ['./', './index.html', './plan.pdf'];
var GEDULD  = 2000;

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(LAGER).then(function(c){
      /* Einzeln ablegen statt addAll: fehlt eine Datei (z. B. plan.pdf),
         soll trotzdem alles andere im Gerät landen. */
      return Promise.all(DATEIEN.map(function(d){
        return c.add(new Request(d, { cache: 'reload' })).catch(function(){});
      }));
    }).then(function(){ return self.skipWaiting(); }).catch(function(){})
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(namen){
      return Promise.all(namen.map(function(n){
        return n === LAGER ? null : caches.delete(n);
      }));
    }).then(function(){
      return self.clients.claim();
    }).then(function(){
      melden({ typ: 'neueFassung', fassung: FASSUNG });
    })
  );
});

function istSeite(anfrage){
  return anfrage.mode === 'navigate' ||
         /(\/|\.html)$/.test(new URL(anfrage.url).pathname);
}

function mitGeduld(anfrage, ms){
  return new Promise(function(ok, fehler){
    var fertig = false;
    var uhr = setTimeout(function(){
      if(!fertig){ fertig = true; fehler(new Error('zu langsam')); }
    }, ms);
    fetch(anfrage).then(function(a){
      if(fertig) return;
      fertig = true; clearTimeout(uhr); ok(a);
    }, function(f){
      if(fertig) return;
      fertig = true; clearTimeout(uhr); fehler(f);
    });
  });
}

function ablegen(anfrage, antwort){
  if(!antwort || !antwort.ok) return;
  var kopie = antwort.clone();
  caches.open(LAGER).then(function(c){ c.put(anfrage, kopie); }).catch(function(){});
}

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  var ziel = new URL(e.request.url);
  if(ziel.origin !== location.origin) return;

  /* Die App selbst: Netz zuerst, damit Neues wirklich ankommt. */
  if(istSeite(e.request)){
    e.respondWith(
      mitGeduld(e.request, GEDULD).then(function(antwort){
        ablegen(e.request, antwort);
        return antwort;
      }).catch(function(){
        return caches.match(e.request).then(function(t){
          return t || caches.match('./index.html') || caches.match('./');
        });
      })
    );
    return;
  }

  /* Alles andere - vor allem der Plan: Speicher zuerst, das ist schnell. */
  e.respondWith(
    caches.match(e.request).then(function(gespeichert){
      if(gespeichert){
        /* im Hintergrund auffrischen, stört den Start nicht */
        fetch(e.request).then(function(a){ ablegen(e.request, a); }).catch(function(){});
        return gespeichert;
      }
      return fetch(e.request).then(function(a){
        ablegen(e.request, a);
        return a;
      }).catch(function(){
        return new Response('', { status: 504, statusText: 'nicht erreichbar' });
      });
    })
  );
});

/* Der Seite Bescheid geben, welche Fassung jetzt gilt */
function melden(nachricht){
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then(function(fenster){
      fenster.forEach(function(f){ f.postMessage(nachricht); });
    }).catch(function(){});
}

self.addEventListener('message', function(e){
  if(e.data === 'fassung?') melden({ typ: 'fassung', fassung: FASSUNG });
});
