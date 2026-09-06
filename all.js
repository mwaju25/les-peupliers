
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
            const [mask] = await Promise.all([chargerImage('assets/sky-mask-v38-alpha.png')]);
            skyMaskImage=mask; skyCanvasReady=true; resizeSkyCanvases();
            for(const k of ['night','crepuscule','aube','lever','day','coucher']){try{skyFrameCache[k]=await chargerImage(`assets/sky-phases/${k}.png`);}catch(e){}}
            window.weatherCloudSprites=[];
            const cloudFiles=Array.from({length:41},(_,i)=>`assets/clouds/photo41/cloud-${String(i+1).padStart(2,'0')}.png`);
            for(const f of cloudFiles){try{window.weatherCloudSprites.push(await chargerImage(f));}catch(e){console.warn('Nuage indisponible',f);}}
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
          if(!skyCanvasReady)return;
          const c=$('sky-canvas'),ctx=setupCanvas(c); if(!ctx)return;
          const w=innerWidth,h=innerHeight,now=new Date(),phase=getDayPhase(now);
          ctx.clearRect(0,0,w,h);
          const cc=Math.max(0,Math.min(100,Number(currentCloudCover)||0));
          const code=Number(currentWeatherCode)||0;
          const storm=code>=95, rainy=code>=51&&code<=82;
          // Ciel continu et atmosphérique : les arrêts sont largement espacés et complétés
          // par une brume d'horizon + un halo solaire diffus pour éviter tout effet de bandes.
          let stops;
          if(phase==='night') stops=storm
            ? [['#02040a',0],['#07101c',.52],['#01030a',1]]
            : [['#020711',0],['#09182b',.50],['#02050c',1]];
          else if(phase==='aube') stops=cc>=70
            ? [['#172535',0],['#33485c',.38],['#6d6670',.67],['#bd7e69',1]]
            : [['#102238',0],['#3d5874',.38],['#9b7280',.67],['#e59a6f',1]];
          else if(phase==='lever') stops=cc>=70
            ? [['#31475b',0],['#718596',.42],['#ae928d',.68],['#d5a36f',1]]
            : [['#2e6597',0],['#6f9fc5',.43],['#d1ab8a',.70],['#f0bc70',1]];
          else if(phase==='coucher') stops=cc>=70
            ? [['#3f5367',0],['#74727c',.40],['#ad6c63',.69],['#5e465d',1]]
            : [['#446c96',0],['#a3747f',.42],['#e99a5b',.69],['#59465f',1]];
          else if(phase==='crepuscule') stops=cc>=70
            ? [['#17263a',0],['#34475b',.42],['#55465b',.68],['#101827',1]]
            : [['#0b1d35',0],['#2c4568',.42],['#674d68',.68],['#0a1324',1]];
          else stops=storm
            ? [['#172432',0],['#33475a',.50],['#58656e',1]]
            : rainy||cc>=75
              ? [['#344b61',0],['#718594',.50],['#a8b5bd',1]]
              : cc>=45
                ? [['#28608d',0],['#67a0c5',.50],['#b9d2e2',1]]
                : [['#1e75b4',0],['#57a4d4',.50],['#bfe0f2',1]];
          const g=ctx.createLinearGradient(0,0,0,h*.72);
          for(const [col,pos] of stops)g.addColorStop(pos,col);
          ctx.fillStyle=g;ctx.fillRect(0,0,w,h);

          // Brume d'horizon très diffuse : elle donne de la profondeur sans créer de bande.
          const horizon=ctx.createRadialGradient(w*.52,h*.57,0,w*.52,h*.57,h*.58);
          const horizonAlpha=phase==='night'?0.035:(phase==='aube'||phase==='lever'||phase==='coucher'||phase==='crepuscule'?0.11:0.055);
          horizon.addColorStop(0,`rgba(255,245,230,${horizonAlpha})`);
          horizon.addColorStop(.35,`rgba(210,220,230,${horizonAlpha*.55})`);
          horizon.addColorStop(1,'rgba(0,0,0,0)');
          ctx.fillStyle=horizon;ctx.fillRect(0,0,w,h);

          // Halo solaire doux, uniquement lorsque le soleil est proche de l'horizon ou visible.
          if(phase==='aube'||phase==='lever'||phase==='coucher'){
            const sunX=w*.76, sunY=phase==='aube'?h*.62:phase==='lever'?h*.48:h*.55;
            const warm=(phase==='coucher'||phase==='aube');
            const halo=ctx.createRadialGradient(sunX,sunY,0,sunX,sunY,w*.15);
            halo.addColorStop(0,warm?'rgba(255,194,112,.25)':'rgba(255,222,150,.20)');
            halo.addColorStop(.22,warm?'rgba(255,158,91,.12)':'rgba(255,225,164,.09)');
            halo.addColorStop(1,'rgba(255,180,90,0)');
            ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);
          }
          // Couverture nuageuse : légère baisse de luminosité du ciel, jamais du paysage.
          const haze=Math.min(.20,cc/100*.20 + (rainy?.04:0) + (storm?.08:0));
          if(haze>0){ctx.fillStyle=`rgba(10,18,28,${haze})`;ctx.fillRect(0,0,w,h);}
          ctx.globalCompositeOperation='destination-in';ctx.globalAlpha=1;ctx.drawImage(skyMaskImage,0,0,w,h);
          ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;c.style.opacity='1';
        }
        function initStars(){starDots=[];for(let i=0;i<170;i++)starDots.push({x:Math.random(),y:Math.random()*.43,r:.35+Math.random()*1.05,a:.35+Math.random()*.65});renderStars();}
        function renderStars(){
          if(!skyCanvasReady)return; const c=$('stars-canvas'),ctx=setupCanvas(c);if(!ctx)return;ctx.clearRect(0,0,innerWidth,innerHeight);ctx.fillStyle='#fff';
          const night=(getDayPhase(new Date())==='night'||getDayPhase(new Date())==='crepuscule'); const clear=(Number(currentCloudCover||0)<35&&currentWeatherCode<51); if(!night||!clear){c.style.opacity='0';return;}
          const w=innerWidth,h=innerHeight; for(const s of starDots){ctx.globalAlpha=s.a;ctx.beginPath();ctx.arc(s.x*w,s.y*h,s.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;c.style.opacity='.62';
          // Appliquer le masque par destination-in pour supprimer les étoiles des arbres/bâtiments.
          ctx.globalCompositeOperation='destination-in';ctx.drawImage(skyMaskImage,0,0,w,h);ctx.globalCompositeOperation='source-over';
        }
        function cloudAtmosphere(){
          const phase=getDayPhase(new Date());
          const code=Number(currentWeatherCode)||0;
          if(code>=95) return {filter:'brightness(.56) contrast(1.18) saturate(.72)', top:'rgba(48,54,66,.16)', bottom:'rgba(5,9,14,.22)'};
          if(code>=51&&code<=82) return {filter:'brightness(.78) contrast(1.08) saturate(.68)', top:'rgba(126,145,160,.10)', bottom:'rgba(34,43,52,.18)'};
          if(phase==='aube') return {filter:'brightness(.96) contrast(1.02) saturate(.90)', top:'rgba(255,154,126,.14)', bottom:'rgba(105,72,84,.06)'};
          if(phase==='lever') return {filter:'brightness(1.02) contrast(1.02) saturate(.96)', top:'rgba(255,205,135,.13)', bottom:'rgba(120,101,95,.035)'};
          if(phase==='coucher') return {filter:'brightness(.98) contrast(1.05) saturate(.96)', top:'rgba(255,157,88,.18)', bottom:'rgba(91,61,71,.08)'};
          if(phase==='crepuscule') return {filter:'brightness(.80) contrast(1.05) saturate(.78)', top:'rgba(125,107,154,.10)', bottom:'rgba(24,28,48,.14)'};
          if(phase==='night') return {filter:'brightness(.48) contrast(1.06) saturate(.62)', top:'rgba(65,88,118,.10)', bottom:'rgba(7,13,23,.16)'};
          return {filter:'brightness(1) contrast(1.04) saturate(.94)', top:'rgba(255,255,255,.035)', bottom:'rgba(55,65,75,.045)'};
        }
        function seededRandom(seed){
          let t=(Math.floor(seed)*374761393+668265263)>>>0;
          return function(){t=(t+0x6D2B79F5)>>>0;let r=Math.imul(t^(t>>>15),1|t);r^=r+Math.imul(r^(r>>>7),61|r);return ((r^(r>>>14))>>>0)/4294967296;};
        }
        function drawRealisticCloud(ctx,x,y,sx,sy,dark,light,seed,opacity=1){
          const rnd=seededRandom(seed+97.13), puffs=[];
          const archetype=Math.floor(rnd()*4);
          const count=archetype===0?24:archetype===1?34:archetype===2?18:29;
          // Nuage organique : une masse principale irrégulière, avec des volumes de tailles très variées.
          for(let i=0;i<count;i++){
            const t=i/(count-1||1);
            let px,py,rx,ry;
            if(archetype===2){
              px=(rnd()-.5)*1.85; py=(rnd()-.5)*.42-.02; rx=.11+rnd()*.24; ry=.055+rnd()*.12;
            }else{
              const centerBias=Math.pow(rnd(),.72);
              px=(rnd()-.5)*1.55*(.62+.38*centerBias);
              const mound=Math.max(0,1-Math.abs(px)/.92);
              py=.02-mound*(.12+rnd()*.34)+(rnd()-.5)*.18;
              rx=.09+rnd()*.20*(.75+mound); ry=.07+rnd()*.20*(.75+mound);
              if(archetype===3 && rnd()<.28){rx*=1.45; ry*=1.35;}
            }
            puffs.push([px,py,rx,ry]);
          }
          // Quelques petites masses hautes donnent une silhouette de cumulus moins régulière.
          if(archetype!==2){
            for(let i=0;i<7;i++){
              const side=rnd()>.5?1:-1;
              puffs.push([side*(.10+rnd()*.65),-.22-rnd()*.28,.06+rnd()*.14,.07+rnd()*.15]);
            }
          }
          ctx.save();
          ctx.translate(x,y);
          ctx.rotate((rnd()-.5)*.045);
          ctx.scale(sx,sy);
          ctx.globalAlpha=opacity;

          // Large base ombrée, diffuse et irrégulière.
          const base=ctx.createRadialGradient(0,.18,.04,0,.18,1.05);
          base.addColorStop(0,'rgba(20,27,36,.46)');
          base.addColorStop(.42,'rgba(32,39,48,.34)');
          base.addColorStop(.78,'rgba(50,58,67,.18)');
          base.addColorStop(1,'rgba(0,0,0,0)');
          ctx.fillStyle=base;
          ctx.beginPath();ctx.ellipse(0,.18,1.02,.38,0,0,Math.PI*2);ctx.fill();

          // Volumes principaux : lumière au-dessus, gris bleuté dessous.
          for(const [px,py,rx,ry] of puffs){
            const g=ctx.createRadialGradient(px-rx*.30,py-ry*.38,Math.max(.005,Math.min(rx,ry)*.04),px,py,Math.max(rx,ry)*1.16);
            g.addColorStop(0,light);
            g.addColorStop(.30,light);
            g.addColorStop(.56,dark);
            g.addColorStop(.80,'rgba(24,31,40,.30)');
            g.addColorStop(1,'rgba(0,0,0,0)');
            ctx.fillStyle=g;
            ctx.beginPath();ctx.ellipse(px,py,rx,ry,0,0,Math.PI*2);ctx.fill();
          }

          // Larges zones de lumière sur les sommets, non uniformes.
          ctx.globalAlpha=opacity*.34;
          const highlights=Math.min(12,Math.floor(count*.34));
          for(let i=0;i<highlights;i++){
            const q=puffs[(i*7+Math.floor(rnd()*puffs.length))%puffs.length];
            const [px,py,rx,ry]=q;
            const hi=ctx.createRadialGradient(px-rx*.28,py-ry*.48,0,px,py,Math.max(rx,ry)*.95);
            hi.addColorStop(0,'rgba(255,255,255,.88)');
            hi.addColorStop(.38,'rgba(255,255,255,.34)');
            hi.addColorStop(1,'rgba(255,255,255,0)');
            ctx.fillStyle=hi;ctx.beginPath();ctx.ellipse(px,py,rx*.78,ry*.72,0,0,Math.PI*2);ctx.fill();
          }

          // Petits voiles latéraux pour éviter une silhouette trop « boule ».
          ctx.globalAlpha=opacity*.12;
          for(let i=0;i<5;i++){
            const px=-.95+rnd()*1.9, py=.12+rnd()*.24;
            const w=.20+rnd()*.34, h=.035+rnd()*.07;
            const wi=ctx.createRadialGradient(px,py,0,px,py,w);
            wi.addColorStop(0,'rgba(215,223,231,.55)');wi.addColorStop(1,'rgba(215,223,231,0)');
            ctx.fillStyle=wi;ctx.beginPath();ctx.ellipse(px,py,w,h,0,0,Math.PI*2);ctx.fill();
          }
          ctx.restore();
        }
        function renderCloudCanvas(){
          if(!skyCanvasReady)return;
          const c=$('cloud-canvas'),ctx=setupCanvas(c);if(!ctx)return;
          const w=innerWidth,h=innerHeight;ctx.clearRect(0,0,w,h);
          const sprites=window.weatherCloudSprites||[];
          const cc=Math.max(0,Math.min(100,Number(currentCloudCover)||0));
          const code=Number(currentWeatherCode)||0;
          if(!sprites.length || (cc<12 && code<2)){c.style.opacity=cc<12&&code<2?'.02':'.08';return;}
          const wind=Math.max(0,Number(vitesseVentActuelle)||0);
          const gust=Math.max(wind,Number(weatherData?.current?.wind_gusts_10m)||wind);
          const dir=Number(windDirectionActuelle)||0;
          const dirSign=Math.cos((dir-90)*Math.PI/180)>=0?1:-1;
          const speedPxPerSec=0.9 + wind*0.72 + Math.max(0,gust-wind)*0.32;
          const elapsed=performance.now()/1000;
          const density=cc<25?2:cc<45?4:cc<65?6:cc<82?8:11;
          const layers=cc>58?2:1;
          const cycle=w*1.75;
          const atm=cloudAtmosphere();
          for(let layer=0;layer<layers;layer++){
            for(let i=0;i<density;i++){
              const seed=20260907+layer*1009+i*7919+Math.round(cc*13);
              const rnd=seededRandom(seed);
              const sprite=sprites[Math.floor(rnd()*sprites.length)];
              if(!sprite)continue;
              let x=(rnd()*cycle + dirSign*speedPxPerSec*elapsed)%(cycle);if(x<0)x+=cycle;x-=cycle*.25;
              const y=h*(.055+rnd()*.30)+(layer?h*.075:0);
              // Taille normalisée : les 41 photos ont des dimensions différentes.
              // On conserve leurs proportions et on évite les nuages gigantesques.
              const targetW=(w*(.13+rnd()*.17))*(cc>70?(1.08+rnd()*.20):(.88+rnd()*.18))*(layer?.78:1);
              const scale=targetW/sprite.width;
              const dw=sprite.width*scale, dh=sprite.height*scale;
              let op=(.26+rnd()*.34)*(0.40+cc/100*.82)*(layer?.44:1);
              if(code>=95)op*=1.12;
              if(code>=51&&code<=82)op*=1.04;
              ctx.save();
              ctx.globalAlpha=Math.min(.80,op);
              ctx.filter=atm.filter;
              ctx.drawImage(sprite,x,y-dh*.28,dw,dh);
              // Lumière atmosphérique verticale : elle colore surtout le sommet du nuage,
              // sans remplacer les couleurs photographiques de la texture.
              ctx.globalCompositeOperation='source-atop';
              const light=ctx.createLinearGradient(0,y-dh*.28,0,y+dh*.72);
              light.addColorStop(0,atm.top);light.addColorStop(.30,'rgba(255,255,255,0)');light.addColorStop(.72,atm.bottom);light.addColorStop(1,'rgba(0,0,0,0)');
              ctx.filter='none';ctx.fillStyle=light;ctx.fillRect(x,y-dh*.28,dw,dh);
              ctx.restore();
            }
          }
          ctx.globalCompositeOperation='destination-in';ctx.drawImage(skyMaskImage,0,0,w,h);ctx.globalCompositeOperation='source-over';
          let op=cc<=25?.16:cc<45?.22:cc<65?.32:cc<82?.43:.56;
          if(code>=51&&code<=82)op=Math.max(op,.42);if(code>=95)op=.62;
          const phase=getDayPhase(new Date());
          if(phase==='night')op*=.82;
          if(phase==='crepuscule')op*=.90;
          c.style.opacity=String(op);
        }
        function renderCloudLoop(ts){cloudOffset=ts||0;renderCloudCanvas();requestAnimationFrame(renderCloudLoop);}
        function applySkyMask(){
          const mask=$('sky-gradient'),cloud=$('cloud-layer');
          const src='assets/sky-mask-v38-alpha.png';
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
            cloud:'assets/reference/clean-weather-overcast.png',
            fog:'assets/reference/clean-weather-overcast.png',
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
          const u='https://api.open-meteo.com/v1/forecast?latitude=50.2024&longitude=5.3135&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,precipitation,rain,showers,snowfall,cloud_cover,is_day&hourly=weather_code,precipitation_probability,precipitation,rain,showers,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_direction_10m_dominant&forecast_days=7&timezone=Europe%2FBrussels';
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
        function indexHorairePourJour(data,index,targetHour=null){
          const h=data?.hourly||{}, times=h.time||[];
          const day=String(data?.daily?.time?.[index]||'').slice(0,10);
          if(!day)return -1;
          let best=-1,bestDiff=Infinity;
          for(let i=0;i<times.length;i++){
            if(String(times[i]).slice(0,10)!==day)continue;
            const hour=Number(String(times[i]).slice(11,13));
            const wanted=targetHour==null?12:targetHour;
            const diff=Math.abs(hour-wanted);
            if(diff<bestDiff){best=i;bestDiff=diff;}
          }
          return best;
        }
        function choisirCodeHoraire(data,index,targetHour=null){
          const h=data?.hourly||{},i=indexHorairePourJour(data,index,targetHour);
          if(i<0)return Number(data?.daily?.weather_code?.[index]||0);
          const code=Number(h.weather_code?.[i] ?? data?.daily?.weather_code?.[index] ?? 0);
          const prob=Number(h.precipitation_probability?.[i]||0);
          const rain=Number(h.precipitation?.[i]||0);
          const showers=Number(h.showers?.[i]||0);
          const snow=Number(h.snowfall?.[i]||0);
          // L'icône suit la prévision horaire réelle. Les précipitations probables
          // renforcent le choix pluie/averses lorsqu'elles sont annoncées à cette heure.
          if(code>=95)return code;
          if(code>=71&&code<=77 || code>=85&&code<=86)return code;
          if(code>=51&&code<=67 || code>=80&&code<=82)return code;
          if((rain+showers)>=0.15 || prob>=70){
            if(code===0||code===1||code===2||code===3)return 80;
          }
          return code;
        }
        function choisirConditionJour(data,index){
          // Pour les jours futurs, on conserve une tendance diurne (autour de midi).
          // Pour aujourd'hui, l'icône est recalculée sur l'heure météo la plus proche
          // de l'heure réelle : elle peut donc changer au fil de la journée.
          const now=new Date();
          const target=index===0?now.getHours():12;
          return choisirCodeHoraire(data,index,target);
        }
        function injecterPrevisions(d){
          const bas=$('zone-7-jours');bas.innerHTML='';
          for(let i=0;i<7;i++){
            const date=new Date(d.time[i]+'T12:00:00'),code=choisirConditionJour(weatherData,i),info=weatherInfo(code),box=document.createElement('div');
            box.className='carte-prev-unique';
            box.innerHTML=`<div class="prev-jour">${i===0?'AUJ.':dayNames[date.getDay()]}</div><div class="prev-date">${date.getDate()} ${monthNames[date.getMonth()]}</div><div class="prev-icon forecast-icon-dynamic">${iconSvg(info[1])}</div><div class="prev-max">${Math.round(d.temperature_2m_max[i])}°</div><div class="prev-min">${Math.round(d.temperature_2m_min[i])}°</div><div class="prev-wind">↗ ${Math.round(d.wind_speed_10m_max?.[i]||0)} km/h</div>`;
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
            const s=document.createElement('div'); s.className='stars'; s.style.cssText='position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(circle,rgba(255,255,255,.82) 0 1px,transparent 1.5px);background-size:57px 53px;opacity:.48;-webkit-mask-image:url(\"assets/sky-mask-true.png\");mask-image:url(\"assets/sky-mask-true.png\");-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;'; layer.appendChild(s);
          } else if(old) old.remove();
        }
        function gererCycleJourNuit(h,m){
          const decor=$('school-view-bg'),moon=$('lune-vrai-ciel'),nightGrade=$('night-atmosphere'),nightLights=$('night-lights');
          setSeason(new Date()); const now=new Date(), phase=getDayPhase(now), code=currentWeatherCode;
          if(skyCanvasReady){renderSkyCanvas();renderStars();renderCloudCanvas();}
          if(decor)decor.style.filter='none';
          /* Le paysage entier reste visible. Il est assombri progressivement, jamais au-delà de 16 %. */
          if(nightGrade){
            let dim=0;
            if(currentSunrise&&currentSunset){
              const n=minutesOf(now), sr=minutesOf(currentSunrise), ss=minutesOf(currentSunset);
              const smooth=t=>t*t*(3-2*t);
              if(n>=ss-25 && n<ss+70){
                dim=0.16*smooth((n-(ss-25))/95);
              }else if(n>=ss+70 || n<sr-70){
                dim=0.16;
              }else if(n>=sr-70 && n<sr+20){
                dim=0.16*(1-smooth((n-(sr-70))/90));
              }else dim=0;
            }else if(phase==='night') dim=.16;
            nightGrade.style.setProperty('background',`rgba(0,0,0,${dim})`,'important');
            nightGrade.style.setProperty('opacity','1','important');
          }
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
          /* Dernier croissant : visuel clair et lisible validé, inspiré de la maquette approuvée. */
          const file=(phase==='waning-crescent' && illum>0) ? 'assets/lune/phases/waning-crescent-ui.png' : `assets/lune/phases/p${String(idx).padStart(2,'0')}.png`;
          [$('lune-panel-img'),$('lune-ciel-img')].forEach(img=>{if(img){img.src=file;img.onerror=()=>img.removeAttribute('src');}});
        }
        function obtenirOffsetBruxelles(date){
          try{
            const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Brussels',timeZoneName:'longOffset',hour:'2-digit'}).formatToParts(date);
            const v=parts.find(p=>p.type==='timeZoneName')?.value||'GMT+2';
            const m=v.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
            if(!m)return 2;
            return (m[1]==='-'?-1:1)*(Number(m[2])+(Number(m[3]||0)/60));
          }catch(e){return 2;}
        }
        function formatHeureAstronomique(v){
          if(!v || v==='null')return '—';
          const m=String(v).match(/(\d{1,2}):(\d{2})/);
          return m?`${String(Number(m[1])).padStart(2,'0')}:${m[2]}`:'—';
        }
        function mettreAJourLeversCouchersLune(date=new Date()){
          const dateBrux=(()=>{
            const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
            const y=p.find(x=>x.type==='year')?.value, mo=p.find(x=>x.type==='month')?.value, d=p.find(x=>x.type==='day')?.value;
            return `${y}-${mo}-${d}`;
          })();
          const tz=obtenirOffsetBruxelles(date);
          const url=`https://aa.usno.navy.mil/api/rstt/oneday?date=${dateBrux}&coords=50.2024,5.3135&tz=${encodeURIComponent(tz)}`;
          fetch(url,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('USNO rise/set '+r.status);return r.json()}).then(resp=>{
            const d=resp?.properties?.data||resp?.data||{};
            const moon=Array.isArray(d.moondata)?d.moondata:[];
            const rise=moon.find(x=>String(x.phen||'').toLowerCase().includes('rise'))?.time;
            const set=moon.find(x=>String(x.phen||'').toLowerCase().includes('set'))?.time;
            const lr=$('lune-lever'), lc=$('lune-coucher');
            if(lr)lr.textContent=formatHeureAstronomique(rise);
            if(lc)lc.textContent=formatHeureAstronomique(set);
          }).catch(e=>console.warn('Levers/couchers Lune indisponibles',e));
        }
        function gererAstronomieReelle(){
          const now=new Date(), parts=isoUtcParts(now), base=`https://randomapi.dev/api/moon`;
          mettreAJourLeversCouchersLune(now);
          const moonEl=$('lune-vrai-ciel'), sunEl=$('soleil-vrai-ciel');
          /* Position graphique volontairement fixe : seule la visibilité est astronomique. */
          const ASTRE_LEFT='61vw', ASTRE_TOP='22vh';
          Promise.all([
            fetch(`${base}/phase?at=${encodeURIComponent(now.toISOString())}&tz=Europe%2FBrussels`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Lune phase '+r.status);return r.json()}),
            fetch(`${base}/position?lat=50.20&lng=5.31&at=${encodeURIComponent(now.toISOString())}&tz=Europe%2FBrussels`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Position lune '+r.status);return r.json()}),
            fetch(`https://aa.usno.navy.mil/api/celnav?date=${parts.date}&time=${parts.time}&coords=50.20,5.31`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('USNO '+r.status);return r.json()})
          ]).then(([phaseResp,posResp,usnoResp])=>{
            moonAstronomy=phaseResp.data||phaseResp; appliquerLuneReelle(moonAstronomy); astronomyLastFetch=Date.now();
            const pos=posResp.data||posResp;
            const rows=usnoResp?.data||[];
            const sun=rows.find(x=>String(x.object||'').toLowerCase()==='sun')||null;
            const moon=rows.find(x=>String(x.object||'').toLowerCase()==='moon')||null;
            sunAstronomy=sun;
            const sunAlt=safeNum(sun?.almanac_data?.hc);
            const moonAlt=safeNum(moon?.almanac_data?.hc);
            /* La visibilité réelle est décidée par l'altitude astronomique USNO. */
            const sunAbove=sunAlt!==null && sunAlt>0;
            const moonAbove=moonAlt!==null && moonAlt>0 && !!(pos?.aboveHorizon ?? true);
            moonAboveHorizon=moonAbove;
            if(moonAstronomy && moon?.almanac_data){
              moonAstronomy.usnoAltitude=moonAlt;
              moonAstronomy.usnoAzimuth=safeNum(moon.almanac_data.zn);
            }
            /* Soleil prioritaire : si le Soleil est réellement visible, la Lune est masquée. */
            if(sunEl){
              if(sunAbove){
                sunEl.style.left=ASTRE_LEFT; sunEl.style.top=ASTRE_TOP; sunEl.style.display='block';
                sunEl.style.opacity=currentCloudCover<60 ? '.95' : '.55';
                sunEl.style.zIndex='12';
              }else{
                sunEl.style.display='none';
              }
            }
            if(moonEl){
              if(!sunAbove && moonAbove){
                moonEl.style.left=ASTRE_LEFT; moonEl.style.top=ASTRE_TOP; moonEl.style.display='block';
                moonEl.style.opacity=isDay ? '.42' : '.92';
                moonEl.style.zIndex='11';
              }else{
                moonEl.style.display='none';
              }
            }
          }).catch(e=>console.warn('Données astronomiques indisponibles',e));
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

        setInterval(()=>{ if(weatherData?.daily) injecterPrevisions(weatherData.daily); },600000);
        initSkyCanvas(); applySkyMask(); setInterval(actualiserHorloge,1000); actualiserHorloge(); gererAstronomieReelle(); executerMeteo(); setInterval(executerMeteo,300000); setInterval(gererAstronomieReelle,300000); setInterval(()=>{const n=new Date();gererCycleJourNuit(n.getHours(),n.getMinutes());},1000);
    