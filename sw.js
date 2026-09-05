/* Suchhilfe - hält die App im Gerät, damit sie ohne Empfang startet.
   Wird nur wirksam, wenn die Seite über eine https-Adresse geöffnet wird.
   Bei einer doppelt angeklickten Datei überspringt die App das hier.

   Vorgehen: zuerst das Netz fragen (damit eine neue Fassung auch ankommt),
   aber nur kurz warten. Kommt nichts, wird die gespeicherte Fassung
   genommen. So ist die App auf der Baustelle ohne Empfang sofort da und
   trotzdem aktuell, sobald wieder Netz da ist. */

var LAGER = 'suchhilfe-1';
var DATEIEN = ['./', './index.html'];
var WARTEN_MS = 2500;

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(LAGER)
      .then(function(c){ return c.addAll(DATEIEN); })
      .then(function(){ return self.skipWaiting(); })
      .catch(function(){})
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(namen){
      return Promise.all(namen.map(function(n){
        return n === LAGER ? null : caches.delete(n);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function ausDemNetz(anfrage){
  return new Promise(function(ok, fehler){
    var fertig = false;
    var uhr = setTimeout(function(){
      if(!fertig){ fertig = true; fehler(new Error('zu langsam')); }
    }, WARTEN_MS);
    fetch(anfrage).then(function(antwort){
      if(fertig) return;
      fertig = true; clearTimeout(uhr); ok(antwort);
    }, function(e){
      if(fertig) return;
      fertig = true; clearTimeout(uhr); fehler(e);
    });
  });
}

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  var ziel = new URL(e.request.url);
  if(ziel.origin !== location.origin) return;

  e.respondWith(
    ausDemNetz(e.request).then(function(antwort){
      if(antwort && antwort.ok){
        var kopie = antwort.clone();
        caches.open(LAGER).then(function(c){ c.put(e.request, kopie); }).catch(function(){});
      }
      return antwort;
    }).catch(function(){
      return caches.match(e.request).then(function(treffer){
        return treffer || caches.match('./index.html');
      });
    })
  );
});
