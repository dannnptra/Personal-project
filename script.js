// --- KONFIGURASI GLOBAL ---
const KONFIGURASI = { jumlah: 80000, gesekan: 0.98 }; 

// --- VARIABEL UTAMA ---
let adegan, kamera, penyaji, partikel, material, geometri;
let bolaTengah; 
let komposer, efekBloom;
let konteksAudio, penganalisa, dataArrayAudio; 
let audioAktif = false;

// --- STATUS APLIKASI ---
let status = {
    gestur: 0, targetGestur: 0,
    rotasiX: 0, rotasiY: 0, 
    momentumY: 0, 
    posisiTanganTerakhirX: 0, 
    targetRotasiX: 0,
    zum: 1.0, basisZum: 1.0,
    denyut: 0,
    bentukSaatIni: 'bola',
    morfosis: 1.0
};

const jam = new THREE.Clock();

// --- FUNGSI UTAMA ---
function inisialisasi() {
    adegan = new THREE.Scene();
    adegan.fog = new THREE.FogExp2(0x000000, 0.001); 

    kamera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
    kamera.position.z = 40;

    penyaji = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    penyaji.setSize(window.innerWidth, window.innerHeight);
    penyaji.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

// --- SISTEM DETEKSI TANGAN ---
async function mulaiSistemInput() {
    const elemenVideo = document.getElementById('video_input');
    const elemenKanvas = document.getElementById('kanvas_output');
    const konteksKanvas = elemenKanvas.getContext('2d');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (err) {
        console.error("Kesalahan Kamera:", err);
        tampilkanError("Camera Access Denied.");
        return;
    }

    const hands = new Hands({ locateFile: (file) => `https://unpkg.com/@mediapipe/hands/${file}` });
    
    hands.setOptions({ 
        maxNumHands: 2, 
        modelComplexity: 1, 
        minDetectionConfidence: 0.7, 
        minTrackingConfidence: 0.7,
        selfieMode: true 
    });

    hands.onResults(hasil => {
        konteksKanvas.fillStyle = 'black'; konteksKanvas.fillRect(0,0,elemenKanvas.width, elemenKanvas.height);
        const landmark = hasil.multiHandLandmarks;

        if (landmark && landmark.length > 0) {
            for (let i = 0; i < landmark.length; i++) {
                const lm = landmark[i];
                const label = hasil.multiHandedness[i].label;
                
                drawConnectors(konteksKanvas, lm, HAND_CONNECTIONS, {color: '#00FFFF', lineWidth: 2});
                drawLandmarks(konteksKanvas, lm, {color: '#FFFFFF', lineWidth: 1, radius: 2});
                
                konteksKanvas.fillStyle = "white"; konteksKanvas.font = "16px Arial";
                let labelTeks = label === "Left" ? "LEFT" : "RIGHT";
                konteksKanvas.fillText(labelTeks, lm[0].x * elemenKanvas.width, lm[0].y * elemenKanvas.height);

                // --- TANGAN KIRI (Bentuk) ---
                if(label === 'Left') {
                    const jumlahJari = hitungJari(lm);
                    konteksKanvas.fillStyle = "#ff00ff"; konteksKanvas.font = "bold 24px Arial";
                    konteksKanvas.fillText(jumlahJari, lm[0].x * elemenKanvas.width + 20, lm[0].y * elemenKanvas.height);
                    
                    if(jumlahJari === 1) aturBentuk('bola');
                    if(jumlahJari === 2) aturBentuk('hati');
                    if(jumlahJari === 3) aturBentuk('galaksi');
                    if(jumlahJari === 4) aturBentuk('lubanghitam');
                    if(jumlahJari === 5) aturBentuk('nebula');
                }

                // --- TANGAN KANAN (Kontrol Utama) ---
                if(label === 'Right') {
                        const pusat = lm[9]; 
                        const jariKanan = hitungJari(lm);
                        const jarakCubit = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
                        
                        // Hitung posisi X untuk rotasi (dibalik karena mirror)
                        const posisiXSaatIni = (pusat.x - 0.5) * -20.0;
                        
                        // === MODE 1: PINCH (2 Jari atau Kurang) ===
                        // Fokus: Gather & Scatter
                        if (jariKanan >= 1 && jariKanan <= 3) { // Toleransi 1-3 jari untuk pinch
                            const BATAS_PINCH = 0.05;
                            
                            if (jarakCubit < BATAS_PINCH) {
                                status.targetGestur = 1; // GATHER (Kumpul)
                            } else {
                                status.targetGestur = 0; // SCATTER (Sebar)
                            }

                            // Visual Text
                            konteksKanvas.fillStyle = "cyan";
                            konteksKanvas.fillText("PINCH MODE", lm[0].x * elemenKanvas.width, lm[0].y * elemenKanvas.height + 25);
                        }

                        // === MODE 2: ROTASI (5 Jari atau Kepal/0 Jari) ===
                        // Fokus: Rotate & Tilt
                        else if (jariKanan >= 4 || jariKanan === 0) {
                            
                            // Hitung Delta X (Kecepatan Gerak Tangan)
                            const deltaX = posisiXSaatIni - status.posisiTanganTerakhirX;
                            
                            // Terapkan Rotasi (Spin)
                            status.momentumY += deltaX * 0.05; 
                            
                            // Terapkan Kemiringan (Tilt)
                            status.targetRotasiX = (pusat.y - 0.5) * 4.0; 

                            // Visual Text
                            konteksKanvas.fillStyle = "yellow";
                            konteksKanvas.fillText("ROTATE MODE", lm[0].x * elemenKanvas.width, lm[0].y * elemenKanvas.height + 25);
                        }

                        // Update posisi terakhir setiap frame agar transisi mulus
                        status.posisiTanganTerakhirX = posisiXSaatIni;
                }
            }
            document.getElementById('teks-status').innerText = "Hands Detected - System Active";
        } else {
            document.getElementById('teks-status').innerText = "Camera Active - Waiting for Hands...";
        }
    });

    const kameraMP = new Camera(elemenVideo, { onFrame: async () => { await hands.send({image: elemenVideo}); }, width: 320, height: 240 });
    kameraMP.start().then(() => {
        document.getElementById('teks-status').innerText = "Camera Started";
    }).catch(err => {
        tampilkanError("Mediapipe Camera Error: " + err);
    });
}

// --- UTILITAS & LOGIKA PARTIKEL ---
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

function acakGaussian() { let u=0,v=0; while(u===0)u=Math.random(); while(v===0)v=Math.random(); return Math.sqrt(-2.0*Math.log(u))*Math.cos(2.0*Math.PI*v); }

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
            y=acakGaussian()*0.1*(1.0-(r/maxR)); 
            if(z<-1.0){const warp=1.0/Math.pow(r*0.18,2.0); y+=Math.sign(y)*warp*12.0*(Math.abs(z)/maxR);} 
        }
        else if(tipe==='galaksi') { 
            const lengan=5; const putaran=4.5; const skala=35.0; 
            const rad=Math.random()*Math.random(); const dist=rad*skala; 
            const sudut=(i%lengan)*(Math.PI*2/lengan); 
            const spiral=sudut+Math.log(rad+0.1)*putaran; 
            const sebar=acakGaussian()*(0.2+rad*6.0); 
            x=Math.cos(spiral)*dist+sebar; z=Math.sin(spiral)*dist+sebar; 
            const tonjolan=acakGaussian()*Math.exp(-rad*5.0)*5.0; 
            y=tonjolan+(Math.random()-0.5)*rad*1.5; 
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
    document.getElementById('warna1').value = c1Hex; 
    document.getElementById('warna2').value = c2Hex; 
    if(material) {
        material.uniforms.uWarna1.value.set(c1Hex); 
        material.uniforms.uWarna2.value.set(c2Hex); 
    }
}

// Fungsi Text-to-Particle
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
        rnd.push((Math.random()-0.5)*2,(Math.random()-0.5)*2,(Math.random()-0.5)*2);
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
            uWaktu:{value:0}, uGestur:{value:0}, uDenyut:{value:0}, uMorfosis:{value:1.0},
            uWarna1:{value:new THREE.Color('#ff8800')}, uWarna2:{value:new THREE.Color('#000000')}, uUkuran:{value:2.0}
        },
        transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
    }); 
    partikel=new THREE.Points(geometri,material); 
    adegan.add(partikel); 
    aturBentuk(tipe); 
}

function siapkanUI() { 
    document.getElementById('warna1').addEventListener('input',(e)=>material.uniforms.uWarna1.value.set(e.target.value)); 
    document.getElementById('warna2').addEventListener('input',(e)=>material.uniforms.uWarna2.value.set(e.target.value)); 
    document.getElementById('sliderGesekan').addEventListener('input',(e)=>KONFIGURASI.gesekan=parseFloat(e.target.value)); 
    document.getElementById('sliderCahaya').addEventListener('input',(e)=>efekBloom.strength=parseFloat(e.target.value)); 
    document.getElementById('sliderZum').addEventListener('input',(e)=>status.basisZum=parseFloat(e.target.value)); 
}

async function aktifkanAudio() { 
    if(!audioAktif){
        try{
            const stream=await navigator.mediaDevices.getUserMedia({audio:true});
            konteksAudio=new(window.AudioContext||window.webkitAudioContext)();
            const source=konteksAudio.createMediaStreamSource(stream);
            penganalisa=konteksAudio.createAnalyser();
            penganalisa.fftSize=256;
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
    
    // Audio
    if(audioAktif && penganalisa) { 
        penganalisa.getByteFrequencyData(dataArrayAudio); 
        let total=0; for(let i=0; i<30; i++) total+=dataArrayAudio[i]; 
        status.denyut = total/30/255; 
    } else { status.denyut=0; }
    
    // Gestur Cubit/Buka
    status.gestur += (status.targetGestur - status.gestur) * 8.0 * dt;
    
    // Animasi Morfosis
    if(status.morfosis < 1.0) { 
        status.morfosis += dt * 1.5; 
        if(status.morfosis > 1.0) status.morfosis = 1.0; 
    }
    
    // Fisika Rotasi
    status.rotasiY += status.momentumY; 
    status.momentumY *= KONFIGURASI.gesekan; 
    status.rotasiX += (status.targetRotasiX - status.rotasiX) * 0.1;
    
    // Zum Manual
    status.zum += ( status.basisZum - status.zum ) * 5.0 * dt;

    // Update Shader
    if(material) { 
        material.uniforms.uWaktu.value += dt; 
        material.uniforms.uGestur.value = status.gestur; 
        material.uniforms.uDenyut.value = status.denyut; 
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