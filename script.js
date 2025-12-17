// --- DETEKSI MOBILE ---
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// --- KONFIGURASI GLOBAL (OPTIMIZED) ---
const KONFIGURASI = { 
    jumlah: isMobile ? 30000 : 80000, // Turunkan partikel di HP
    gesekan: 0.98 
}; 

// --- VARIABEL UTAMA ---
let adegan, kamera, penyaji, partikel, material, geometri;
let bolaTengah; 
let komposer, efekBloom;
let konteksAudio, penganalisa, dataArrayAudio; 
let audioAktif = false;

// --- STATUS APLIKASI ---
let status = {
    gestur: 0, targetGestur: 0,
    handGestur: 0, manualGestur: 0,
    rotasiX: 0, rotasiY: 0, 
    momentumY: 0, 
    posisiTanganTerakhirX: 0, 
    targetRotasiX: 0,
    zum: 1.0, basisZum: 1.0,
    isLocked: false, 
    bass: 0, mid: 0, high: 0,
    targetBass: 0, targetMid: 0, targetHigh: 0,
    baseColor1: new THREE.Color('#ff8800'), 
    targetColor1: new THREE.Color('#ff8800'),
    bentukSaatIni: 'bola',
    morfosis: 1.0
};

const jam = new THREE.Clock();

const HAND_CONNECTIONS_MAP = [
    [0,1], [1,2], [2,3], [3,4], [0,5], [5,6], [6,7], [7,8],
    [0,9], [9,10], [10,11], [11,12], [0,13], [13,14], [14,15], [15,16],
    [0,17], [17,18], [18,19], [19,20]
];

// --- FUNGSI UTAMA ---
function inisialisasi() {
    adegan = new THREE.Scene();
    adegan.fog = new THREE.FogExp2(0x000000, 0.001); 

    kamera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
    kamera.position.z = isMobile ? 55 : 40; // Mundurkan kamera di HP

    penyaji = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    penyaji.setSize(window.innerWidth, window.innerHeight);
    // Batasi Pixel Ratio di HP agar tidak panas
    penyaji.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    document.body.appendChild(penyaji.domElement);

    adegan.add(new THREE.AmbientLight(0x222222));

    const renderAdegan = new THREE.RenderPass(adegan, kamera);
    efekBloom = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    efekBloom.threshold = 0.05; efekBloom.strength = 1.3; efekBloom.radius = 0.4;

    komposer = new THREE.EffectComposer(penyaji);
    komposer.addPass(renderAdegan);
    komposer.addPass(efekBloom);

    buatLatarBintang();

    const geomBola = new THREE.SphereGeometry(5.0, 64, 64);
    const matBola = new THREE.MeshBasicMaterial({ color: 0x000000 });
    bolaTengah = new THREE.Mesh(geomBola, matBola);
    adegan.add(bolaTengah); 
    bolaTengah.visible = false; 

    buatPartikel('bola'); 
    mulaiSistemInput();
    siapkanUI();

    window.addEventListener('resize', () => {
        kamera.aspect = window.innerWidth / window.innerHeight;
        kamera.updateProjectionMatrix();
        penyaji.setSize(window.innerWidth, window.innerHeight);
        komposer.setSize(window.innerWidth, window.innerHeight);
    });
    animasi();
}

function tampilkanError(pesan) {
    document.getElementById('kotak-error').style.display = 'block';
    document.getElementById('pesan-error').innerText = pesan;
}

function imporObj(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const isiFile = e.target.result;
        const loader = new THREE.OBJLoader();
        try {
            const object = loader.parse(isiFile);
            let mesh = null;
            object.traverse(function (child) { if (child.isMesh && !mesh) mesh = child; });

            if (mesh) {
                if (bolaTengah) bolaTengah.visible = false;
                document.querySelectorAll('.tombol').forEach(b => b.classList.remove('aktif'));
                const atributAwal = geometri.attributes.aPosisiAwal;
                const atributTujuan = geometri.attributes.aPosisiTujuan;
                atributAwal.array.set(atributTujuan.array); 
                atributAwal.needsUpdate = true;
                
                mesh.geometry.center();
                mesh.geometry.computeBoundingSphere();
                const scaleFactor = 25.0 / mesh.geometry.boundingSphere.radius;
                const posisiObj = mesh.geometry.attributes.position;
                const jumlahTitikObj = posisiObj.count;

                for (let i = 0; i < KONFIGURASI.jumlah; i++) {
                    const indexAcak = Math.floor(Math.random() * jumlahTitikObj);
                    const x = posisiObj.getX(indexAcak) * scaleFactor;
                    const y = posisiObj.getY(indexAcak) * scaleFactor;
                    const z = posisiObj.getZ(indexAcak) * scaleFactor;
                    atributTujuan.setXYZ(i, x, y, z);
                }
                
                atributTujuan.needsUpdate = true;
                status.morfosis = 0.0;
                status.bentukSaatIni = 'custom';
                input.value = ''; 
            } else { alert("File OBJ tidak valid."); }
        } catch (err) { console.error(err); alert("Gagal memuat OBJ."); }
    };
    reader.readAsText(file);
}

// --- SISTEM DETEKSI TANGAN (OPTIMIZED) ---
async function mulaiSistemInput() {
    const elemenVideo = document.getElementById('video_input');
    const elemenKanvas = document.getElementById('kanvas_output');
    const konteksKanvas = elemenKanvas.getContext('2d');
    
    // Reduce canvas resolution slightly for mobile performance
    elemenKanvas.width = 320; 
    elemenKanvas.height = 240;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("WebCam tidak didukung.");
        return;
    }

    const hands = new Hands({ locateFile: (file) => `https://unpkg.com/@mediapipe/hands/${file}` });
    
    // CONFIG MOBILE vs PC
    hands.setOptions({ 
        maxNumHands: 2, 
        modelComplexity: isMobile ? 0 : 1, // 0 = Lite (Cepat), 1 = Full (Akurat)
        minDetectionConfidence: 0.6, // Sedikit lebih longgar agar cepat
        minTrackingConfidence: 0.6,
        selfieMode: true 
    });

    hands.onResults(hasil => {
        konteksKanvas.clearRect(0, 0, elemenKanvas.width, elemenKanvas.height);
        
        if (hasil.multiHandLandmarks) {
            for (const landmarks of hasil.multiHandLandmarks) {
                drawConnectors(konteksKanvas, landmarks, HAND_CONNECTIONS, {color: '#00FFFF', lineWidth: 2});
                drawLandmarks(konteksKanvas, landmarks, {color: '#FFFFFF', lineWidth: 1, radius: 2});
            }
        }

        const landmark = hasil.multiHandLandmarks;
        if (!landmark || landmark.length === 0) {
            document.getElementById('teks-status').innerText = "Ghost Mode";
            return;
        }

        if (landmark.length === 2) {
            const jariTangan1 = hitungJari(landmark[0]);
            const jariTangan2 = hitungJari(landmark[1]);
            
            if (jariTangan1 === 5 && jariTangan2 === 5) {
                const wrist1 = landmark[0][0];
                const wrist2 = landmark[1][0];
                const dist = Math.hypot(wrist1.x - wrist2.x, wrist1.y - wrist2.y);
                
                let targetZoom = (dist - 0.2) * 6.0;
                targetZoom = Math.max(0.5, Math.min(4.0, targetZoom));
                status.basisZum += (targetZoom - status.basisZum) * 0.1;
                
                konteksKanvas.fillStyle = "#ff00ff";
                konteksKanvas.font = "bold 16px Arial";
                konteksKanvas.textAlign = "center";
                konteksKanvas.fillText("ZOOM", 160, 120);
                return;
            }
        }

        document.getElementById('teks-status').innerText = "Active";
        konteksKanvas.textAlign = "left";

        for (let i = 0; i < landmark.length; i++) {
            const lm = landmark[i];
            const label = hasil.multiHandedness[i].label;
            
            // LEFT HAND
            if(label === 'Left') {
                const jariKiri = hitungJari(lm);
                if (jariKiri === 0) status.isLocked = true;
                else if (jariKiri === 5) {
                    status.isLocked = false;
                    status.handGestur = 0;
                }

                if (!status.isLocked) {
                    const jarakCubit = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
                    const MIN_JARAK = 0.02; const MAX_JARAK = 0.35; 
                    let rawPinch = (MAX_JARAK - jarakCubit) / (MAX_JARAK - MIN_JARAK);
                    rawPinch = Math.max(0.0, Math.min(1.0, rawPinch));
                    status.handGestur = Math.pow(rawPinch, 0.4);
                }

                if (status.isLocked) {
                    konteksKanvas.fillStyle = "#ff0055";
                    konteksKanvas.fillText("🔒", 10, 30);
                } else {
                    konteksKanvas.fillStyle = "cyan";
                    konteksKanvas.fillText(`G: ${Math.round(status.handGestur*100)}%`, 10, 30);
                }
            }

            // RIGHT HAND
            if(label === 'Right') {
                const pusat = lm[9];
                const posisiXSaatIni = (pusat.x - 0.5) * -20.0;
                const deltaX = posisiXSaatIni - status.posisiTanganTerakhirX;
                status.momentumY += deltaX * 0.05; 
                status.targetRotasiX = (pusat.y - 0.5) * 4.0;
                status.posisiTanganTerakhirX = posisiXSaatIni;
            }
        }
    });

    try {
        // Request Mobile Facing Camera
        const constraints = { 
            video: { 
                width: 640, height: 480,
                facingMode: "user" // Camera Depan
            } 
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        elemenVideo.srcObject = stream;
        elemenVideo.onloadedmetadata = () => { elemenVideo.play(); loopDeteksi(); };
    } catch (err) {
        tampilkanError("Cam Error: " + err);
    }

    async function loopDeteksi() {
        if (elemenVideo.readyState >= 2) await hands.send({image: elemenVideo});
        requestAnimationFrame(loopDeteksi);
    }
}

function hitungJari(lm) { 
    let jumlah=0; 
    if(lm[8].y < lm[6].y) jumlah++; 
    if(lm[12].y < lm[10].y) jumlah++; 
    if(lm[16].y < lm[14].y) jumlah++; 
    if(lm[20].y < lm[18].y) jumlah++; 
    if(Math.abs(lm[4].x - lm[0].x) > Math.abs(lm[3].x - lm[0].x)) jumlah++; 
    return jumlah; 
}

function buatLatarBintang() {
    const geoBintang = new THREE.BufferGeometry();
    const posBintang = [];
    for(let i=0; i<10000; i++) {
        const r = 400 + Math.random() * 400; const t = Math.random() * Math.PI * 2; const p = Math.acos(2 * Math.random() - 1);
        posBintang.push(r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p));
    }
    geoBintang.setAttribute('position', new THREE.Float32BufferAttribute(posBintang, 3));
    const matBintang = new THREE.PointsMaterial({ color: 0x888888, size: 0.8, sizeAttenuation: true, transparent: true, opacity: 0.6 });
    adegan.add(new THREE.Points(geoBintang, matBintang));
}

function aturBentuk(tipe) {
    if(status.bentukSaatIni === tipe) return; 
    status.bentukSaatIni = tipe;
    document.querySelectorAll('.tombol').forEach(b => b.classList.remove('aktif'));
    const btn = document.getElementById('tombol-'+tipe); if(btn) btn.classList.add('aktif');
    
    if(bolaTengah) bolaTengah.visible = (tipe === 'lubanghitam');
    
    const atributAwal = geometri.attributes.aPosisiAwal;
    const atributTujuan = geometri.attributes.aPosisiTujuan;
    atributAwal.array.set(atributTujuan.array); 
    atributAwal.needsUpdate = true;
    
    const titikBaru = buatTitik(tipe);
    for(let i=0; i<KONFIGURASI.jumlah; i++) { 
        const p = titikBaru[i % titikBaru.length]; 
        atributTujuan.setXYZ(i, p.x, p.y, p.z); 
    }
    atributTujuan.needsUpdate = true; 
    status.morfosis = 0.0; 
    
    // Warna Preset
    if(tipe==='lubanghitam') aturWarna("#ff5500", "#330000"); 
    else if(tipe==='galaksi') aturWarna("#ffddaa", "#4488ff");
    else if(tipe==='nebula') aturWarna("#00ffcc", "#ff00cc");
    else if(tipe==='hati') aturWarna("#ff0000", "#ffaaaa");
    else aturWarna("#ff8800", "#000000"); 
}

function buatTitik(tipe) {
    let titik = [];
    for(let i=0; i<KONFIGURASI.jumlah; i++) {
        let x,y,z;
        if(tipe==='bola') { 
            const r=12, t=Math.random()*6.28, p=Math.acos(2*Math.random()-1); 
            x=r*Math.sin(p)*Math.cos(t); y=r*Math.sin(p)*Math.sin(t); z=r*Math.cos(p); 
        }
        else if(tipe==='nebula') { 
            const t=Math.random()*Math.PI*2; const p=Math.acos(2*Math.random()-1); 
            const r=10+Math.random()*15; const noise=Math.sin(t*3)*Math.cos(p*4); 
            const dist=r+noise*5; 
            x=dist*Math.sin(p)*Math.cos(t)*1.5; y=dist*Math.sin(p)*Math.sin(t); z=dist*Math.cos(p); 
        }
        else if(tipe==='lubanghitam') { 
            const minR=5.2; const maxR=35.0; 
            const r=minR+(maxR-minR)*Math.pow(Math.random(),4.0); 
            const t=Math.random()*Math.PI*2; 
            x=r*Math.cos(t); z=r*Math.sin(t); 
            y=(Math.random()-0.5)*2.0*(1.0-(r/maxR)); 
            if(z<-1.0){const warp=1.0/Math.pow(r*0.18,2.0); y+=Math.sign(y)*warp*12.0*(Math.abs(z)/maxR);} 
        }
        else if(tipe==='galaksi') { 
            const lengan=5; const putaran=4.5; const skala=35.0; 
            const rad=Math.random()*Math.random(); const dist=rad*skala; 
            const sudut=(i%lengan)*(Math.PI*2/lengan); 
            const spiral=sudut+Math.log(rad+0.1)*putaran; 
            x=Math.cos(spiral)*dist+(Math.random()-0.5)*2; z=Math.sin(spiral)*dist+(Math.random()-0.5)*2; 
            y=(Math.random()-0.5)*rad*1.5; 
        }
        else { // Hati
            let t=Math.random()*6.28, r=Math.random(); 
            let xx=16*Math.pow(Math.sin(t),3); 
            let yy=13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t); 
            x=xx*r; y=yy*r; z=(Math.random()-.5)*5; 
        }
        titik.push({x,y,z});
    } return titik;
}

function aturWarna(c1Hex, c2Hex) { 
    status.baseColor1.set(c1Hex);
    status.targetColor1.set(c1Hex);
    document.getElementById('warna1').value = c1Hex; 
    document.getElementById('warna2').value = c2Hex; 
    if(material) {
        material.uniforms.uWarna1.value.set(c1Hex); 
        material.uniforms.uWarna2.value.set(c2Hex); 
    }
}

function teksKePartikel() { 
    if(bolaTengah) bolaTengah.visible = false; 
    const atributAwal=geometri.attributes.aPosisiAwal; 
    const atributTujuan=geometri.attributes.aPosisiTujuan; 
    atributAwal.array.set(atributTujuan.array); atributAwal.needsUpdate=true; 
    
    const teks=document.getElementById('inputTeks').value.toUpperCase()||"HALO"; 
    const kanvas=document.createElement('canvas'); const ctx=kanvas.getContext('2d'); 
    kanvas.width=200; kanvas.height=50; 
    ctx.fillStyle='black'; ctx.fillRect(0,0,200,50); 
    ctx.fillStyle='white'; ctx.font='bold 30px Arial'; 
    ctx.textAlign='center'; ctx.textBaseline='middle'; 
    ctx.fillText(teks,100,25); 
    
    const dataGambar=ctx.getImageData(0,0,200,50); 
    const titikValid=[]; 
    for(let y=0; y<50; y+=2){
        for(let x=0; x<200; x+=2){
            if(dataGambar.data[(y*200+x)*4]>128){
                titikValid.push({x:(x-100)*0.3, y:(25-y)*0.3, z:0});
            }
        }
    } 
    for(let i=0; i<KONFIGURASI.jumlah; i++){
        const p=titikValid[i%titikValid.length]; 
        atributTujuan.setXYZ(i,p.x,p.y,p.z);
    } 
    atributTujuan.needsUpdate=true; 
    status.morfosis=0.0; 
    status.bentukSaatIni='teks'; 
};

function buatPartikel(tipe) { 
    if(partikel){adegan.remove(partikel); geometri.dispose();} 
    geometri=new THREE.BufferGeometry(); 
    const pos=[],rnd=[],awal=[],tujuan=[]; 
    
    for(let i=0;i<KONFIGURASI.jumlah;i++){
        awal.push(0,0,0); tujuan.push(0,0,0);
        // Spherical Math
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.pow(Math.random(), 1/3); 
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        rnd.push(x, y, z);
        pos.push(0,0,0);
    } 
    geometri.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); 
    geometri.setAttribute('aPosisiAwal',new THREE.Float32BufferAttribute(awal,3)); 
    geometri.setAttribute('aPosisiTujuan',new THREE.Float32BufferAttribute(tujuan,3)); 
    geometri.setAttribute('aAcak',new THREE.Float32BufferAttribute(rnd,3)); 
    
    material=new THREE.ShaderMaterial({
        vertexShader:document.getElementById('vertexShader').textContent,
        fragmentShader:document.getElementById('fragmentShader').textContent,
        uniforms:{
            uWaktu:{value:0}, uGestur:{value:0}, 
            uBass:{value:0}, uMid:{value:0}, uHigh:{value:0},
            uMorfosis:{value:1.0},
            uWarna1:{value:new THREE.Color('#ff8800')}, uWarna2:{value:new THREE.Color('#000000')}, uUkuran:{value:2.0}
        },
        transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
    }); 
    partikel=new THREE.Points(geometri,material); 
    adegan.add(partikel); 
    aturBentuk(tipe); 
}

function siapkanUI() { 
    document.getElementById('warna1').addEventListener('input',(e)=>aturWarna(e.target.value, material.uniforms.uWarna2.value.getHexString())); 
    document.getElementById('warna2').addEventListener('input',(e)=>material.uniforms.uWarna2.value.set(e.target.value)); 
    document.getElementById('sliderGesekan').addEventListener('input',(e)=>KONFIGURASI.gesekan=parseFloat(e.target.value)); 
    document.getElementById('sliderCahaya').addEventListener('input',(e)=>efekBloom.strength=parseFloat(e.target.value)); 
    document.getElementById('sliderZum').addEventListener('input',(e)=>status.basisZum=parseFloat(e.target.value)); 
    document.getElementById('sliderGather').addEventListener('input', (e) => { status.manualGestur = parseFloat(e.target.value); });
}

async function aktifkanAudio() { 
    if(!audioAktif){
        try{
            const stream=await navigator.mediaDevices.getUserMedia({audio:true});
            konteksAudio=new(window.AudioContext||window.webkitAudioContext)();
            const source=konteksAudio.createMediaStreamSource(stream);
            penganalisa=konteksAudio.createAnalyser();
            penganalisa.fftSize=512;
            source.connect(penganalisa);
            dataArrayAudio=new Uint8Array(penganalisa.frequencyBinCount);
            audioAktif=true;
            document.getElementById('tombolMic').classList.add('mic-aktif');
        }catch(e){alert("Mic Access Denied");}
    }else{
        audioAktif=false;
        document.getElementById('tombolMic').classList.remove('mic-aktif');
    } 
}

function animasi() {
    requestAnimationFrame(animasi);
    const dt = jam.getDelta();
    
    if(audioAktif && penganalisa) { 
        penganalisa.getByteFrequencyData(dataArrayAudio); 
        let rawBass=0, rawMid=0, rawHigh=0;
        for(let i=0; i<10; i++) rawBass += dataArrayAudio[i];
        for(let i=10; i<100; i++) rawMid += dataArrayAudio[i];
        for(let i=100; i<256; i++) rawHigh += dataArrayAudio[i];
        
        status.targetBass = (rawBass/10)/255;
        status.targetMid = (rawMid/90)/255;
        status.targetHigh = (rawHigh/156)/255;

        status.bass += (status.targetBass - status.bass) * 0.15;
        status.mid += (status.targetMid - status.mid) * 0.1;
        status.high += (status.targetHigh - status.high) * 0.2;

        if (status.bass > 0.8) material.uniforms.uWarna1.value.lerp(new THREE.Color(1, 1, 1), 0.3);
        else material.uniforms.uWarna1.value.lerp(status.baseColor1, 0.1);

    } else { 
        status.bass += (0 - status.bass) * 0.1;
        status.mid += (0 - status.mid) * 0.1;
        status.high += (0 - status.high) * 0.1;
    }
    
    // Combine Manual & Hand Gesture
    status.targetGestur = Math.max(status.handGestur, status.manualGestur);
    status.gestur += (status.targetGestur - status.gestur) * 8.0 * dt;
    
    if(status.morfosis < 1.0) { 
        status.morfosis += dt * 1.5; 
        if(status.morfosis > 1.0) status.morfosis = 1.0; 
    }
    
    status.rotasiY += status.momentumY; 
    status.momentumY *= KONFIGURASI.gesekan; 
    status.rotasiX += (status.targetRotasiX - status.rotasiX) * 0.1;
    status.zum += ( status.basisZum - status.zum ) * 5.0 * dt;

    if(material) { 
        material.uniforms.uWaktu.value += dt; 
        material.uniforms.uGestur.value = status.gestur; 
        material.uniforms.uBass.value = status.bass;
        material.uniforms.uMid.value = status.mid;
        material.uniforms.uHigh.value = status.high;
        material.uniforms.uMorfosis.value = status.morfosis; 
    }
    if(partikel) { 
        partikel.rotation.x = status.rotasiX; 
        partikel.rotation.y = status.rotasiY; 
        partikel.scale.set(status.zum, status.zum, status.zum); 
        if(bolaTengah) bolaTengah.scale.set(status.zum, status.zum, status.zum); 
    }

    komposer.render();
}

// Mulai Aplikasi
inisialisasi();