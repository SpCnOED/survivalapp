// Minimal, dependency-free JS with your dataset preloaded
let services = [];
let userLoc = null;
let maxKm = 50;

const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];

function toMinutes(hm){const [h,m]=hm.split(':').map(Number);return h*60+m;}
function isOpenNow(hours){
  if(!hours) return false;
  const now = new Date();
  const key = dayNames[now.getDay()];
  const spec = hours[key];
  if(!spec || spec.toLowerCase()==='closed') return false;
  const [start,end] = spec.split('-');
  const cur = now.getHours()*60+now.getMinutes();
  const s = toMinutes(start); const e = toMinutes(end);
  return (e>s) ? (cur>=s && cur<=e) : (cur>=s || cur<=e);
}
function km(a,b){
  if(!a||!b) return null;
  const R=6371;
  const dLat=(b.lat-a.lat)*Math.PI/180, dLon=(b.lng-a.lng)*Math.PI/180;
  const lat1=a.lat*Math.PI/180, lat2=b.lat*Math.PI/180;
  const c=2*Math.asin(Math.sqrt(Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2));
  return R*c;
}

async function loadData(){
  try{
    const cached = localStorage.getItem('services-cache-v1');
    if(cached){ services = JSON.parse(cached); }
    else{
      const res = await fetch('./data/services.json');
      services = await res.json();
      localStorage.setItem('services-cache-v1', JSON.stringify(services));
    }
    populateCategories();
    render();
  }catch(e){ console.error(e); }
}

function populateCategories(){
  const set = new Set();
  services.forEach(s => (s.categories||[]).forEach(c => set.add(c)));
  const sel = document.getElementById('cat');
  sel.innerHTML = '<option value="all">All</option>' + Array.from(set).sort().map(c=>`<option>${c}</option>`).join('');
}

function render(){
  const q = document.getElementById('q').value.toLowerCase().trim();
  const cat = document.getElementById('cat').value;
  const openNow = document.getElementById('openNow').checked;

  let arr = services.map(s => ({
    ...s,
    _open: isOpenNow(s.hours),
    _dist: userLoc && s.lat!=null && s.lng!=null ? km(userLoc,{lat:s.lat,lng:s.lng}) : null
  }));

  if(q){
    arr = arr.filter(s => `${s.name} ${s.description} ${(s.categories||[]).join(' ')} ${s.address} ${(s.eligibility||[]).join(' ')}`.toLowerCase().includes(q));
  }
  if(cat && cat!=='all'){
    arr = arr.filter(s => (s.categories||[]).includes(cat));
  }
  if(openNow) arr = arr.filter(s => s._open);
  if(userLoc) arr = arr.filter(s => s._dist==null || s._dist <= maxKm);

  arr.sort((a,b)=>{
    if(userLoc && a._dist!=null && b._dist!=null) return a._dist-b._dist;
    if(a._open!==b._open) return a._open? -1: 1;
    return a.name.localeCompare(b.name);
  });

  const list = document.getElementById('list');
  list.innerHTML = arr.map(cardHTML).join('') || `<div class="card">No services match your filters.</div>`;
}

function hoursToday(hours){
  if(!hours) return '—';
  const key = dayNames[new Date().getDay()];
  return hours[key] || '—';
}

function cardHTML(s){
  const openBadge = s._open ? '<span class="badge open">Open</span>' : '<span class="badge">Closed</span>';
  const distBadge = s._dist!=null ? `<span class="badge">${s._dist.toFixed(1)} km</span>` : '';
  return `<div class="card">
    <h3>${s.name}</h3>
    <div class="row" style="gap:6px;margin:6px 0">${openBadge}${distBadge}${(s.categories||[]).map(c=>`<span class="badge">${c}</span>`).join('')}</div>
    <div class="meta">${s.description||''}</div>
    <div class="meta"><strong>Eligibility:</strong> ${(s.eligibility||[]).join(', ') || '—'}</div>
    <div class="meta"><strong>Address:</strong> ${s.address||'—'}</div>
    <div class="meta"><strong>Hours today:</strong> ${hoursToday(s.hours)}</div>
    <div class="actions">
      ${s.website ? `<a href="${s.website}" target="_blank">Website</a>`: ''}
      ${s.phone ? `<a href="tel:${s.phone}">Call</a>`: ''}
      ${(s.lat!=null && s.lng!=null) || s.address ? `<a target="_blank" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address || (s.lat+','+s.lng))}">Directions</a>`:''}
    </div>
  </div>`;
}

document.getElementById('q').addEventListener('input', render);
document.getElementById('cat').addEventListener('change', render);
document.getElementById('openNow').addEventListener('change', render);
document.getElementById('nearMe').addEventListener('click', ()=>{
  if(!navigator.geolocation){ alert('Geolocation not supported'); return; }
  navigator.geolocation.getCurrentPosition(pos => {
    userLoc = {lat: pos.coords.latitude, lng: pos.coords.longitude};
    document.getElementById('distanceWrap').style.display = 'flex';
    render();
  }, ()=> alert('Could not get your location.'));
});
document.getElementById('maxKm').addEventListener('input', (e)=>{
  maxKm = +e.target.value;
  document.getElementById('maxKmLabel').textContent = maxKm;
  render();
});

// Import/Export
document.getElementById('btn-export').addEventListener('click', ()=>{
  const data = localStorage.getItem('services-cache-v1') || '[]';
  const blob = new Blob([data], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'services-export.json'; a.click();
  URL.revokeObjectURL(a.href);
});
document.getElementById('btn-import').addEventListener('click', ()=> document.getElementById('file-import').click());
document.getElementById('file-import').addEventListener('change', (evt)=>{
  const file = evt.target.files?.[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const arr = JSON.parse(reader.result);
      if(!Array.isArray(arr)) throw new Error('Expected an array');
      localStorage.setItem('services-cache-v1', JSON.stringify(arr));
      services = arr; populateCategories(); render();
    }catch(e){ alert('Invalid JSON file'); }
  };
  reader.readAsText(file);
});

loadData();
