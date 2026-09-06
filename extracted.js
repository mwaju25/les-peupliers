
        let vitesseVentActuelle=11, windDirectionActuelle=0, currentSaison="ÉTÉ", weatherDescriptionGlobal="Ciel dégagé", currentWeatherCode=0, isDay=true, weatherData=null;
        const $=id=>document.getElementById(id);
        const WMO={
          0:['Ciel dégagé','clear'],1:['Plutôt dégagé','partly'],2:['Partiellement nuageux','partly'],3:['Couvert','cloud'],45:['Brouillard','fog'],48:['Brouillard givrant','fog'],
          51:['Bruine faible','drizzle'],53:['Bruine modérée','drizzle'],55:['Bruine forte','drizzle'],56:['Bruine verglaçante','freezing-drizzle'],57:['Bruine verglaçante forte','freezing-drizzle'],
          61:['Pluie faible','rain'],63:['Pluie modérée','rain'],65:['Forte pluie','heavy-rain'],66:['Pluie verglaçante','freezing-rain'],67:['Forte pluie verglaçante','freezing-rain'],
          71:['Neige faible','snow'],73:['Neige modérée','snow'],75:['Forte neige','snow'],77:['Grains de neige','snow-grains'],85:['Averses de neige','snow-showers'],86:['Fortes averses de neige','snow-showers'],
          80:['Averses faibles','showers'],81:['Averses modérées','showers'],82:['Fortes averses','showers'],95:['Orage','storm'],96:['Orage avec grêle','storm-hail'],99:['Orage avec forte grêle','storm-hail']
        };
        const dayNames=['DIM.','LUN.','MAR.','MER.','JEU.','VEN.','SAM.'];
        const monthNames=['JANV.','FÉVR.','MARS','AVRIL','MAI','JUIN','JUIL.','AOÛT','SEPT.','OCT.','NOV.','DÉC.'];
        function actualiserHorloge(){
          const d=new Date(),h=d.getHours(),m=d.getMinutes(),s=d.getSeconds();
          const t=$('horloge-texte'); if(t)t.textContent=`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
          const nh=$('needle-hour'), nm=$('needle-minute'), ns=$('needle-second');
          if(nh)nh.style.transform=`translateX(-50%) rotate(${((h%12)*30+m*.5)}deg)`;
          if(nm)nm.style.transform=`translateX(-50%) rotate(${m*6}deg)`;
          if(ns)ns.style.transform=`translateX(-50%) rotate(${s*6}deg)`;
          const jours=['DIMANCHE','LUNDI','MARDI','MERCREDI','JEUDI','VENDREDI','SAMEDI'];
          const mois=['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
          if($('date-jour'))$('date-jour').textContent=jours[d.getDay()];
          if($('date-num'))$('date-num').textContent=String(d.getDate()).padStart(2,'0');
          if($('date-mois'))$('date-mois').textContent=mois[d.getMonth()];
          if($('date-annee'))$('date-annee').textContent=d.getFullYear();
          gererCycleJourNuit(h,m);
        }
        let lastRenderedSeason='';
        function firstWorkingAsset(primary,fallback,onReady){
          const test=new Image();
          test.onload=()=>onReady(primary);
          test.onerror=()=>onReady(fallback);
          test.src=primary;
        }
        // V3.30 : rendu des couches atmosphériques par Canvas + masque alpha.
        // Le masque blanc = ciel, noir = paysage. Les effets ne peuvent donc jamais recouvrir les arbres.
        let skyMaskImage=null, skyFrameCache={}, skyCanvasReady=false, cloudRAF=0, cloudOffset=0, starDots=[];
        function chargerImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src;});}
        async function initSkyCanvas(){
          try{
            const [mask] = await Promise.all([chargerImage('mask-alpha-v21.png')]);
            skyMaskImage=mask; skyCanvasReady=true; resizeSkyCanvases();
            for(const k of ['night','crepuscule','aube','lever','day','coucher']){try{skyFrameCache[k]=await chargerImage(`assets/sky-phases/${k}.png`);}catch(e){}}
            initStars(); renderSkyCanvas(); renderCloudCanvas();
            window.addEventListener('resize',resizeSkyCanvases,{passive:true});
            requestAnimationFrame(renderCloudLoop);
          }catch(e){console.warn('Sky canvas indisponible',e);}
        }
        function setupCanvas(c){if(!c)return null; const dpr=Math.min(window.devicePixelRatio||1,2), w=Math.max(1,Math.round(innerWidth*dpr)), h=Math.max(1,Math.round(innerHeight*dpr)); if(c.width!==w||c.height!==h){c.width=w;c.height=h;} const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);return ctx;}
        function resizeSkyCanvases(){if(!skyCanvasReady)return; setupCanvas($('sky-canvas'));setupCanvas($('cloud-canvas'));setupCanvas($('stars-canvas'));renderSkyCanvas();renderCloudCanvas();renderStars();}
        function drawSkyMasked(ctx, source, opacity=1){
          if(!ctx||!skyMaskImage)return;
          const w=innerWidth,h=innerHeight; ctx.save();ctx.clearRect(0,0,w,h);ctx.globalAlpha=opacity;ctx.drawImage(source,0,0,w,h);ctx.globalCompositeOperation='destination-in';ctx.globalAlpha=1;ctx.drawImage(skyMaskImage,0,0,w,h);ctx.restore();
        }
        function renderSkyCanvas(){
          if(!skyCanvasReady)return; const c=$('sky-canvas'),ctx=setupCanvas(c); if(!ctx)return;
          const phase=getDayPhase(new Date()), im=skyFrameCache[phase]||skyFrameCache.day; if(!im)return;
          drawSkyMasked(ctx,im,1);
          // Ajustement d'intensité selon la météo, sans jamais toucher au paysage.
          const cc=Math.max(0,Math.min(100,Number(currentCloudCover)||0)), code=currentWeatherCode;
          let a=cc<20?.18:cc<45?.28:cc<75?.46:.62; if(code>=51&&code<=82)a=.68;if(code>=95)a=.78;if(phase==='night')a=1;if(phase==='crepuscule')a=.92;
          c.style.opacity=String(a);
        }
        function initStars(){starDots=[];for(let i=0;i<170;i++)starDots.push({x:Math.random(),y:Math.random()*.43,r:.35+Math.random()*1.05,a:.35+Math.random()*.65});renderStars();}
        function renderStars(){
          if(!skyCanvasReady)return; const c=$('stars-canvas'),ctx=setupCanvas(c);if(!ctx)return;ctx.clearRect(0,0,innerWidth,innerHeight);ctx.fillStyle='#fff';
          const night=(getDayPhase(new Date())==='night'||getDayPhase(new Date())==='crepuscule'); const clear=(Number(currentCloudCover||0)<35&&currentWeatherCode<51); if(!night||!clear){c.style.opacity='0';return;}
          const w=innerWidth,h=innerHeight; for(const s of starDots){ctx.globalAlpha=s.a;ctx.beginPath();ctx.arc(s.x*w,s.y*h,s.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;c.style.opacity='.62';
          // Appliquer le masque par destination-in pour supprimer les étoiles des arbres/bâtiments.
          ctx.globalCompositeOperation='destination-in';ctx.drawImage(skyMaskImage,0,0,w,h);ctx.globalCompositeOperation='source-over';
        }
        function cloudColor(){const cc=Math.max(0,Math.min(100,Number(currentCloudCover)||0)),code=currentWeatherCode; if(code>=95)return ['rgba(22,28,38,.92)','rgba(55,65,78,.84)']; if(code>=51||cc>=80)return ['rgba(72,80,90,.86)','rgba(145,150,155,.68)'];if(cc>=45)return ['rgba(145,153,160,.70)','rgba(220,225,228,.48)'];return ['rgba(245,247,250,.56)','rgba(255,255,255,.35)'];}
        function renderCloudCanvas(){
          if(!skyCanvasReady)return; const c=$('cloud-canvas'),ctx=setupCanvas(c);if(!ctx)return; const w=innerWidth,h=innerHeight;ctx.clearRect(0,0,w,h);const [dark,light]=cloudColor();const cc=Math.max(0,Math.min(100,Number(currentCloudCover)||0)); if(cc<12&&currentWeatherCode<2){c.style.opacity='.04';return;}
          ctx.save(); const rows=cc>75?3:2; for(let row=0;row<rows;row++){const y=h*(.08+row*.12), speed=(vitesseVentActuelle||8)*(.45+row*.18), offset=((cloudOffset*speed/1000)%w); for(let i=-2;i<7;i++){const x=i*w/5-offset; const grad=ctx.createRadialGradient(x+w*.09,y+h*.025,2,x+w*.09,y+h*.025,w*.18);grad.addColorStop(0,light);grad.addColorStop(.38,dark);grad.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=grad;ctx.beginPath();ctx.ellipse(x+w*.09,y,w*.19,h*.055,0,0,Math.PI*2);ctx.fill();}}
          ctx.restore();ctx.globalCompositeOperation='destination-in';ctx.drawImage(skyMaskImage,0,0,w,h);ctx.globalCompositeOperation='source-over';
          let op=cc<=30?.10:cc<50?.20:cc<70?.36:cc<85?.54:.76;if(currentWeatherCode>=51&&currentWeatherCode<=82)op=Math.max(op,.65);if(currentWeatherCode>=95)op=.88;if(getDayPhase(new Date())==='night')op*=.78;c.style.opacity=String(op);
        }
        function renderCloudLoop(ts){cloudOffset=ts||0;renderCloudCanvas();requestAnimationFrame(renderCloudLoop);}
        function applySkyMask(){
          const mask=$('sky-gradient'),cloud=$('cloud-layer');
          const src='assets/sky-alpha-correct.png';
          if(mask){mask.style.webkitMaskImage=`url("${src}")`;mask.style.maskImage=`url("${src}")`;}
          if(cloud){cloud.style.webkitMaskImage=`url("${src}")`;cloud.style.maskImage=`url("${src}")`;}
        }
        function setTreeAsset(seasonKey){
          const host=$('season-tree-img'); if(!host)return;
          const files={PRINTEMPS:'assets/saisons/arbre-printemps-clean.png',ÉTÉ:'assets/saisons/arbre-ete-realiste.png',AUTOMNE:'assets/saisons/arbre-automne-clean.png',HIVER:'assets/saisons/arbre-hiver-clean.png'};
          const file=files[seasonKey]||files.ÉTÉ;
          host.src=file;
          host.onerror=()=>{host.removeAttribute('src'); host.alt='Illustration saison indisponible';};
        }
        function setSeason(d){
          const mo=d.getMonth()+1,day=d.getDate();
          if((mo===3&&day>=20)||(mo>3&&mo<6))currentSaison='PRINTEMPS';
          else if((mo>=6&&mo<9)||(mo===9&&day<22))currentSaison='ÉTÉ';
          else if((mo===9&&day>=22)||mo===10||mo===11)currentSaison='AUTOMNE';
          else currentSaison='HIVER';
          if($('sat-saison'))$('sat-saison').textContent=currentSaison;
          setTreeAsset(currentSaison);
          if(lastRenderedSeason===currentSaison)return;
          lastRenderedSeason=currentSaison;
          const overlay=$('season-weather-overlay');
          const files={PRINTEMPS:'assets/saisons/printemps-overlay.png',AUTOMNE:'assets/saisons/automne-overlay.png',HIVER:'assets/saisons/hiver-overlay.png'};
          if(overlay){
            if(files[currentSaison]){overlay.src=files[currentSaison];overlay.style.opacity='0.34';}
            else{overlay.removeAttribute('src');overlay.style.opacity='0';}
          }
          const ground=$('season-ground');
          if(ground){ground.innerHTML='';ground.style.opacity='0';}
          if(currentSaison==='AUTOMNE'&&ground){
            ground.style.opacity='.78';
            const cols=['#d97706','#f59e0b','#b45309','#dc2626','#92400e'];
            for(let i=0;i<140;i++){const e=document.createElement('i');e.className='autumn-leaf-ground';e.style.left=Math.random()*100+'vw';e.style.bottom=(Math.random()*10+1)+'vh';e.style.setProperty('--c',cols[Math.floor(Math.random()*cols.length)]);e.style.setProperty('--r',(Math.random()*180-90)+'deg');ground.appendChild(e);}
          }
          const snow=$('winter-snow'); if(snow)snow.style.opacity=currentSaison==='HIVER'?'1':'0';
        }
        function weatherInfo(code){return WMO[code]||['Conditions variables','cloud'];}
        function iconSvg(type,large=false,night=false){
          const map={
            clear:'assets/reference/clean-weather-clear.png',
            partly:large?'assets/reference/clean-weather-current.png':'assets/reference/clean-weather-partly.png',
            cloud:'assets/reference/clean-weather-cloud.png',
            fog:'assets/reference/clean-weather-cloud.png',
            drizzle:'assets/reference/clean-weather-rain.png',
            'freezing-drizzle':'assets/reference/clean-weather-rain.png',
            rain:'assets/reference/clean-weather-rain.png',
            'heavy-rain':'assets/reference/clean-weather-rain.png',
            'freezing-rain':'assets/reference/clean-weather-rain.png',
            snow:'assets/reference/clean-weather-cloud.png',
            'snow-grains':'assets/reference/clean-weather-cloud.png',
            showers:'assets/reference/clean-weather-partly-rain.png',
            'snow-showers':'assets/reference/clean-weather-partly-rain.png',
            storm:'assets/reference/clean-weather-rain.png',
            'storm-hail':'assets/reference/clean-weather-rain.png'
          };
          const file=map[type]||map.cloud;
          const cls=large?'weather-art-large':'weather-art';
          return `<img class="${cls}" src="${file}" alt="" aria-hidden="true" loading="eager" decoding="async" onerror="this.style.display='none'">`;
        }
        function dirText(deg){const dirs=['N','NE','E','SE','S','SO','O','NO'];return dirs[Math.round(deg/45)%8]}
        function executerMeteo(){
          const u='https://api.open-meteo.com/v1/forecast?latitude=50.20&longitude=5.31&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,precipitation,rain,showers,snowfall,cloud_cover,is_day&hourly=weather_code,precipitation_probability,precipitation,rain,showers,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_direction_10m_dominant&forecast_days=7&timezone=Europe%2FBrussels';
          fetch(u,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('API météo '+r.status);return r.json()}).then(data=>{
            weatherData=data; localStorage.setItem('lesPeupliersWeather',JSON.stringify({savedAt:Date.now(),data:data})); appliquerDonneesMeteo(data,false);
          }).catch(err=>{
            console.warn(err);
            try{const saved=JSON.parse(localStorage.getItem('lesPeupliersWeather')||'null'); if(saved&&saved.data&&saved.data.current){appliquerDonneesMeteo(saved.data,true); return;}}catch(e){}
            $('courant-desc').textContent='Données météo indisponibles'; $('weather-updated').textContent='Connexion météo indisponible — nouvelle tentative automatique'; $('current-weather-icon').innerHTML='';
          });
        }
        function appliquerDonneesMeteo(data,ancienne){
          weatherData=data; const c=data.current,info=weatherInfo(c.weather_code); currentWeatherCode=c.weather_code; isDay=!!c.is_day; currentCloudCover=Number(c.cloud_cover||0); weatherDescriptionGlobal=info[0]; vitesseVentActuelle=Math.round(c.wind_speed_10m||0); windDirectionActuelle=c.wind_direction_10m||0; currentSunrise=parseLocalWeatherTime(data.daily.sunrise[0]); currentSunset=parseLocalWeatherTime(data.daily.sunset[0]);
          $('courant-temp').textContent=Number(c.temperature_2m).toFixed(1)+'°C'; $('courant-ressenti').textContent='Ressentie '+Math.round(c.apparent_temperature)+'°C'; $('courant-humidite').textContent=Math.round(c.relative_humidity_2m)+'%'; $('courant-vent').textContent=`${vitesseVentActuelle} km/h ${dirText(windDirectionActuelle)}`; const uv=Math.round(c.uv_index??0); $('courant-uv').textContent=`${uv} / ${uv<3?'Bas':uv<6?'Modéré':uv<8?'Élevé':'Très élevé'}`; $('courant-desc').textContent=info[0]; $('courant-precip').textContent=`${Number(c.precipitation||0).toFixed(1)} mm`; $('weather-updated').textContent=(ancienne?'Dernières données valides — ':'')+`Actualisé à ${new Date().toLocaleTimeString('fr-BE',{hour:'2-digit',minute:'2-digit'})}`; $('current-weather-icon').innerHTML=iconSvg(info[1],true,!isDay);
          $('sat-lever').textContent=data.daily.sunrise[0].substring(11,16); $('sat-coucher').textContent=data.daily.sunset[0].substring(11,16);
          injecterPrevisions(data.daily); gererEffetsMeteoEtParticules(info[1], data); calculPhaseLune(); gererAstronomieReelle(); gererCycleJourNuit(new Date().getHours(),new Date().getMinutes());
        }
        function injecterPrevisions(d){
          const bas=$('zone-7-jours');bas.innerHTML='';
          for(let i=0;i<7;i++){
            const date=new Date(d.time[i]+'T12:00:00'),code=d.weather_code[i],info=weatherInfo(code),box=document.createElement('div');
            box.className='carte-prev-unique';
            box.innerHTML=`<div class="prev-jour">${i===0?'AUJ.':dayNames[date.getDay()]}</div><div class="prev-date">${date.getDate()} ${monthNames[date.getMonth()]}</div><div class="prev-icon">${iconSvg(info[1])}</div><div class="prev-max">${Math.round(d.temperature_2m_max[i])}°</div><div class="prev-min">${Math.round(d.temperature_2m_min[i])}°</div><div class="prev-wind">↗ ${Math.round(d.wind_speed_10m_max?.[i]||0)} km/h</div>`;
            bas.appendChild(box);
          }
        }
        let lightningTimer=null;
        let hourlyWeatherIndex=-1;
        function trouverHeureMeteo(data){
          if(!data?.hourly?.time?.length)return -1;
          const now=Date.now(); let best=0,bestDiff=Infinity;
          data.hourly.time.forEach((t,i)=>{const d=Math.abs(new Date(t).getTime()-now);if(d<bestDiff){best=i;bestDiff=d;}});
          return best;
        }
        function gererEffetsMeteoEtParticules(type,data){
          const p=$('front-particles');p.innerHTML=''; const cloud=$('cloud-layer');
          cloud.style.opacity=(type==='cloud'||type==='partly'||type==='rain'||type==='drizzle'||type==='storm'||type==='snow'||type==='fog')?'.58':'.08';
          hourlyWeatherIndex=trouverHeureMeteo(data);
          const h=data?.hourly||{}; const i=hourlyWeatherIndex;
          const rainMm=i>=0?Number(h.rain?.[i]||0):Number(data?.current?.rain||0);
          const showersMm=i>=0?Number(h.showers?.[i]||0):Number(data?.current?.showers||0);
          const totalRain=Math.max(0,rainMm+showersMm);
          const snowCm=i>=0?Number(h.snowfall?.[i]||0):Number(data?.current?.snowfall||0);
          const prob=i>=0?Number(h.precipitation_probability?.[i]||0):0;
          const wind=i>=0?Number(h.wind_speed_10m?.[i]||vitesseVentActuelle):vitesseVentActuelle;
          const gust=i>=0?Number(h.wind_gusts_10m?.[i]||wind):wind;
          const windDir=i>=0?Number(h.wind_direction_10m?.[i]||windDirectionActuelle):windDirectionActuelle;
          const intensityRain=Math.max(totalRain, type==='drizzle'?0.15:0);
          const intensitySnow=Math.max(snowCm, type==='snow'?0.05:0);
          let nRain=0,nSnow=0;
          if(type==='rain'||type==='heavy-rain'||type==='showers'||type==='drizzle'||type==='freezing-rain'||type==='freezing-drizzle'||type==='storm'||type==='storm-hail'){
            nRain=Math.round(Math.min(280,25 + intensityRain*42 + prob*.35 + gust*1.2));
            if(totalRain<=0.03) nRain=Math.round(Math.min(70,10+prob*.35));
          }
          if(type==='snow'||type==='snow-showers'||type==='snow-grains'){
            nSnow=Math.round(Math.min(220,25 + intensitySnow*45 + prob*.45 + gust*.8));
          }
          const dirRad=(windDir-90)*Math.PI/180;
          const driftBase=Math.min(38,Math.max(2,gust*0.55));
          for(let i=0;i<nRain;i++){
            const e=document.createElement('div');e.className='goutte-particule';
            e.style.left=Math.random()*100+'vw';e.style.top=(-Math.random()*25)+'vh';
            const drift=(Math.sin(dirRad)*driftBase*(.65+Math.random()*.7));
            e.style.setProperty('--wind-x',drift.toFixed(2)+'vw');
            e.style.animationDuration=(Math.max(.32,1.45-totalRain*.11-gust*.012+Math.random()*.35))+'s';
            e.style.animationDelay=(Math.random()*1.8)+'s';p.appendChild(e);
          }
          for(let i=0;i<nSnow;i++){
            const e=document.createElement('div');e.className='flocon-particule';e.textContent=i%3===0?'✦':'•';
            e.style.left=Math.random()*100+'vw';e.style.top=(-Math.random()*25)+'vh';
            const drift=(Math.sin(dirRad)*driftBase*(.9+Math.random()*1.1));
            e.style.setProperty('--wind-x',drift.toFixed(2)+'vw');
            e.style.animationDuration=(Math.max(2.8,7.5-intensitySnow*.7-gust*.035+Math.random()*2.5))+'s';
            e.style.animationDelay=(Math.random()*5)+'s';p.appendChild(e);
          }
          if(currentSaison==='AUTOMNE' && (wind>=8 || type==='rain'||type==='storm')){
            const cols=['#d97706','#f59e0b','#b45309','#dc2626','#92400e'];
            const count=Math.round(Math.min(90,12+wind*2.2+gust*.8));
            for(let i=0;i<count;i++){let e=document.createElement('div');e.className='feuille-peuplier-svg';e.style.setProperty('--leaf-color',cols[Math.floor(Math.random()*cols.length)]);e.style.setProperty('--start-y',Math.random()*100+'vh');e.style.setProperty('--end-y',(Math.random()*100-50)+'vh');e.style.animationDuration=(Math.max(4,18-gust*.32)+Math.random()*7)+'s';e.style.animationDelay=(Math.random()*8)+'s';p.appendChild(e)}
          }
          if(currentSaison==='PRINTEMPS' && wind>=6){
            const count=Math.round(Math.min(55,8+wind*1.5));
            for(let i=0;i<count;i++){let e=document.createElement('div');e.className='feuille-peuplier-svg';e.style.setProperty('--leaf-color',i%2?'#f7a8c4':'#9bd66f');e.style.setProperty('--start-y',Math.random()*100+'vh');e.style.setProperty('--end-y',(Math.random()*100-50)+'vh');e.style.animationDuration=(7+Math.random()*7)+'s';e.style.animationDelay=(Math.random()*7)+'s';p.appendChild(e)}
          }
          if(currentSaison==='ÉTÉ' && wind>=18){
            const count=Math.round(Math.min(30,4+wind*.8));
            for(let i=0;i<count;i++){let e=document.createElement('div');e.className='feuille-peuplier-svg';e.style.setProperty('--leaf-color','#69b34c');e.style.setProperty('--start-y',Math.random()*100+'vh');e.style.setProperty('--end-y',(Math.random()*100-50)+'vh');e.style.animationDuration=(9+Math.random()*7)+'s';e.style.animationDelay=(Math.random()*7)+'s';p.appendChild(e)}
          }
          if(lightningTimer){clearTimeout(lightningTimer);lightningTimer=null;}
          if(type==='storm') lightningTimer=setTimeout(()=>{lancerEclair();},2200+Math.random()*5000);
        }
        let currentSunrise=null, currentSunset=null, currentCloudCover=0;
        function parseLocalWeatherTime(value){
          if(!value)return null;
          const d=new Date(value.includes('T')?value:value.replace(' ','T'));
          return isNaN(d.getTime())?null:d;
        }
        function minutesOf(d){return d.getHours()*60+d.getMinutes()+d.getSeconds()/60;}
        function lerp(a,b,t){return a+(b-a)*Math.max(0,Math.min(1,t));}
        function getDayPhase(now){
          if(!currentSunrise||!currentSunset)return isDay?'day':'night';
          const n=minutesOf(now), sr=minutesOf(currentSunrise), ss=minutesOf(currentSunset);
          if(n < sr-70 || n >= ss+70) return 'night';
          if(n < sr-25) return 'aube';
          if(n < sr+20) return 'lever';
          if(n < ss-25) return 'day';
          if(n < ss+20) return 'coucher';
          if(n < ss+70) return 'crepuscule';
          return 'night';
        }
        function skyForPhase(phase,code,cover=0){
          const cc=Math.max(0,Math.min(100,Number(cover)||0));
          const rainy=(code>=51&&code<=82), storm=code>=95;
          const cloudy=cc>=45 || code===3 || code===45 || code===48 || code>=51;
          const veryCloudy=cc>=75 || code===3 || rainy || storm;
          if(phase==='aube') return veryCloudy
            ? 'linear-gradient(to bottom,#18273b 0%,#43556b 42%,#8b6b70 72%,#c88968 100%)'
            : 'linear-gradient(to bottom,#10213a 0%,#3d5575 40%,#a27482 70%,#f0a36e 100%)';
          if(phase==='lever') return veryCloudy
            ? 'linear-gradient(to bottom,#33495f 0%,#74879a 45%,#b59a93 75%,#d7a36f 100%)'
            : 'linear-gradient(to bottom,#3970a5 0%,#79a8cf 48%,#d9b28b 76%,#f6c875 100%)';
          if(phase==='coucher') return veryCloudy
            ? 'linear-gradient(to bottom,#44576d 0%,#7b7780 45%,#b26d63 70%,#6e4d62 100%)'
            : 'linear-gradient(to bottom,#4c739d 0%,#b27b83 48%,#f0a05f 72%,#5d4d67 100%)';
          if(phase==='crepuscule') return veryCloudy
            ? 'linear-gradient(to bottom,#17263b 0%,#33445b 45%,#4e435a 72%,#121a2b 100%)'
            : 'linear-gradient(to bottom,#0b1d35 0%,#273b61 45%,#614b67 72%,#0c1424 100%)';
          if(phase==='night') return storm
            ? 'linear-gradient(to bottom,#02050d 0%,#070d1c 55%,#02050d 100%)'
            : 'linear-gradient(to bottom,#020611 0%,#071326 55%,#02050c 100%)';
          if(storm) return 'linear-gradient(to bottom,rgba(20,28,42,.92),rgba(69,82,99,.52) 58%,rgba(20,28,42,.18) 100%)';
          if(rainy) return 'linear-gradient(to bottom,rgba(70,86,103,.82),rgba(145,157,168,.40) 58%,rgba(110,122,132,.12) 100%)';
          if(cc>=75 || code===3) return 'linear-gradient(to bottom,rgba(72,86,101,.74),rgba(157,168,178,.34) 58%,rgba(170,180,188,.10) 100%)';
          if(cc>=45 || code===2) return 'linear-gradient(to bottom,rgba(82,111,139,.48),rgba(190,204,216,.18) 60%,rgba(220,228,234,.05) 100%)';
          if(cc>=20 || code===1) return 'linear-gradient(to bottom,rgba(63,112,158,.28),rgba(194,215,230,.10) 60%,transparent 100%)';
          return 'linear-gradient(to bottom,rgba(45,122,190,.10),rgba(146,204,245,.03) 62%,transparent 100%)';
        }
        function setStars(show){
          const layer=$('season-layer'); let old=layer.querySelector('.stars');
          if(show){
            if(old)return;
            const s=document.createElement('div'); s.className='stars'; s.style.cssText='position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.82) 0 1px,transparent 1.5px);background-size:57px 53px;opacity:.48;-webkit-mask-image:url(\"assets/sky-alpha-correct.png\");mask-image:url(\"assets/sky-alpha-correct.png\");-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;'; layer.appendChild(s);
          } else if(old) old.remove();
        }
        function gererCycleJourNuit(h,m){
          const decor=$('school-view-bg'),moon=$('lune-vrai-ciel'),nightGrade=$('night-atmosphere'),nightLights=$('night-lights');
          setSeason(new Date()); const now=new Date(), phase=getDayPhase(now), code=currentWeatherCode;
          if(skyCanvasReady){renderSkyCanvas();renderStars();renderCloudCanvas();}
          if(decor)decor.style.filter='none';
          if(nightGrade)nightGrade.style.opacity = phase==='night' ? '.06' : (phase==='crepuscule' ? '.03' : (phase==='aube' ? '.01' : '0'));
          if(nightLights)nightLights.style.opacity = phase==='night' ? '.75' : (phase==='crepuscule' ? '.30' : '0');
          const starsAllowed=(phase==='night'||phase==='crepuscule')&&Number(currentCloudCover||0)<35&&code<51;
          const stars=$('stars-canvas');if(stars)stars.style.opacity=starsAllowed?'0.62':'0';
          if(moon)moon.style.display=moonAboveHorizon?'block':'none';
          const nl=$('night-lights'),lg=$('lamp-glow'); if(nl)nl.style.opacity=phase==='night'?'0.90':(phase==='crepuscule'?'0.45':'0'); if(lg)lg.style.opacity=phase==='night'?'0.95':(phase==='crepuscule'?'0.38':'0');
        }
        let moonAstronomy=null, sunAstronomy=null, astronomyLastFetch=0, moonAboveHorizon=false;
        const moonPhaseFr={new:'Nouvelle lune','waxing-crescent':'Premier croissant','first-quarter':'Premier quartier','waxing-gibbous':'Gibbeuse croissante',full:'Pleine lune','waning-gibbous':'Gibbeuse décroissante','last-quarter':'Dernier quartier','waning-crescent':'Dernier croissant'};
        function isoUtcParts(d){return {date:`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`,time:`${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}:${String(d.getUTCSeconds()).padStart(2,'0')}`};}
        function safeNum(v){const n=Number(v);return Number.isFinite(n)?n:null;}
        function positionObjetCiel(el,alt,az,type){
          if(!el || !Number.isFinite(alt) || !Number.isFinite(az)) return;
          const x=50 + 42*Math.sin(az*Math.PI/180);
          const y=43 - Math.max(-5,Math.min(72,alt))*0.56;
          let px=Math.max(7,Math.min(76,x)), py=Math.max(6,Math.min(46,y));
          /* Évite le cadran analogique, les cadres de date et l'heure digitale. */
          if(px>58 && px<77 && py<14) py=18;
          if(px>77 && py<14) px=75;
          if(px>12 && px<60 && py<14) py=16;
          if(type==='moon' && alt<0){el.style.display='none';return;}
          el.style.left=px+'vw'; el.style.top=py+'vh'; el.style.display='block';
        }
        function appliquerLuneReelle(data){
          if(!data)return;
          const phase=data.phaseName, illum=Math.round(Number(data.illuminatedFraction||0)*100), age=Number(data.ageDays);
          $('lune-age').textContent=Number.isFinite(age)?age.toFixed(1):'--';
          $('lune-ecl').textContent=Number.isFinite(illum)?illum:'--';
          $('lune-phase-nom').textContent=moonPhaseFr[phase]||'Phase lunaire';
          const idx=Math.max(0,Math.min(31,Math.round((Number(data.elongationDegrees||0)%360)/360*32)%32));
          const file=`assets/lune/phases/p${String(idx).padStart(2,'0')}.png`;
          [$('lune-panel-img'),$('lune-ciel-img')].forEach(img=>{if(img){img.src=file;img.onerror=()=>img.removeAttribute('src');}});
        }
        function gererAstronomieReelle(){
          const now=new Date(), parts=isoUtcParts(now), base=`https://randomapi.dev/api/moon`;
          fetch(`${base}/phase?at=${encodeURIComponent(now.toISOString())}&tz=Europe%2FBrussels`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Lune phase '+r.status);return r.json()}).then(j=>{
            moonAstronomy=j.data||j; appliquerLuneReelle(moonAstronomy); astronomyLastFetch=Date.now();
          }).catch(e=>console.warn('Données lunaires indisponibles',e));
          fetch(`${base}/position?lat=50.20&lng=5.31&at=${encodeURIComponent(now.toISOString())}&tz=Europe%2FBrussels`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Position lune '+r.status);return r.json()}).then(j=>{
            const d=j.data||j; const moon=$('lune-vrai-ciel');
            moonAboveHorizon=!!(d.aboveHorizon && safeNum(d.altitudeDegrees)!==null && safeNum(d.altitudeDegrees)>0);
            if(moon && moonAboveHorizon){moon.style.left='61vw'; moon.style.top='22vh'; moon.style.display='block'; const dayFactor=isDay ? .42 : .92; moon.style.opacity=dayFactor;}
            else if(moon) moon.style.display='none';
          }).catch(e=>console.warn('Position lunaire indisponible',e));
          fetch(`https://aa.usno.navy.mil/api/celnav?date=${parts.date}&time=${parts.time}&coords=50.20,5.31`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('USNO '+r.status);return r.json()}).then(j=>{
            const rows=j?.data||[]; const sun=rows.find(x=>String(x.object||'').toLowerCase()==='sun'); const moon=rows.find(x=>String(x.object||'').toLowerCase()==='moon');
            sunAstronomy=sun||null;
            const sunEl=$('soleil-vrai-ciel');
            if(sunEl && sun?.almanac_data){const alt=safeNum(sun.almanac_data.hc); if(alt!==null&&alt>-1){sunEl.style.left='61vw'; sunEl.style.top='22vh'; sunEl.style.display='block'; sunEl.style.opacity=alt>0?(currentCloudCover<60?.95:.55):'.25';}else sunEl.style.display='none';}
            /* USNO sert de contrôle indépendant de visibilité lunaire. */
            if(moonAstronomy && moon?.almanac_data){moonAstronomy.usnoAltitude=safeNum(moon.almanac_data.hc);moonAstronomy.usnoAzimuth=safeNum(moon.almanac_data.zn);}
          }).catch(e=>console.warn('Astronomie USNO indisponible',e));
        }
        function calculPhaseLune(){ gererAstronomieReelle(); }
        function lancerEclair(){
          const host=$('lightning-flash'); if(!host)return; host.innerHTML='';
          const x=18+Math.random()*64, y=2+Math.random()*20;
          const w=12+Math.random()*10, h=42+Math.random()*28;
          const wrap=document.createElement('div'); wrap.className='lightning-bolt strike'; wrap.style.setProperty('--lx',x+'vw'); wrap.style.setProperty('--lw',w+'vw'); wrap.style.setProperty('--lh',h+'vh');
          const pts=[[50,0]]; let px=50,py=0; for(let i=0;i<7;i++){px+=Math.random()*24-12;py+=12+Math.random()*10;pts.push([Math.max(10,Math.min(90,px)),py]);}
          let path='M '+pts.map(p=>p.join(' ')).join(' L ');
          let branches=''; for(let i=2;i<pts.length-1;i++){const [bx,by]=pts[i]; const ex=bx+(Math.random()>.5?1:-1)*(10+Math.random()*16); const ey=by+10+Math.random()*13; branches+=`<path class="branch" d="M ${bx} ${by} L ${ex} ${ey}"/>`; }
          wrap.innerHTML=`<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${path}"/>${branches}</svg>`; host.appendChild(wrap);
          const halo=document.createElement('div'); halo.className='lightning-halo strike'; halo.style.setProperty('--strike-x',x+'vw'); halo.style.setProperty('--strike-y',y+'vh'); host.appendChild(halo);
          setTimeout(()=>{host.innerHTML=''; if(currentWeatherCode>=95) lightningTimer=setTimeout(lancerEclair,5000+Math.random()*9000)},650);
        }
        // Horloge analogique
        const mC=$('cadran-montre'); for(let i=1;i<=12;i++){let box=document.createElement('div');box.className='chiffre-container-js';box.style.transform=`rotate(${i*30}deg)`;let n=document.createElement('div');n.className='chiffre-cadran-fixe';n.textContent=i;n.style.transform=`rotate(${-i*30}deg)`;box.appendChild(n);mC.appendChild(box)} for(let j=0;j<60;j++){let g=document.createElement('div');g.className=j%5===0?'graduation principale':'graduation';g.style.transform=`rotate(${j*6}deg)`;mC.appendChild(g)}
        const bg=$('school-view-bg'); if(bg){bg.onerror=()=>{document.body.style.backgroundImage='url("fond-final.png")';document.body.style.backgroundSize='100% 100%';};}
        initSkyCanvas(); applySkyMask(); setInterval(actualiserHorloge,1000); actualiserHorloge(); gererAstronomieReelle(); executerMeteo(); setInterval(executerMeteo,300000); setInterval(gererAstronomieReelle,300000); setInterval(()=>{const n=new Date();gererCycleJourNuit(n.getHours(),n.getMinutes());},1000);
    