// =====================================================================
//  FINNTA · Personalizador 3D
//  El escudo y el texto se PROYECTAN sobre la malla real de la sandalia
//  (DecalGeometry de Three.js). No son capas HTML: son geometría 3D que
//  copia la curvatura de la tira, recibe la luz y gira con el modelo.
//  Funciona aunque el UV del .glb (generado por IA) esté desordenado.
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------------
//  CONFIGURACIÓN
// ---------------------------------------------------------------------
// TODO: reemplazar por el número real del proveedor (formato internacional, sin + ni espacios)
const WHATSAPP_NUMBER = '5491100000000';
const MODEL_URL = 'Sin_nombre.glb';
const PRICE_LABEL = '$25.000 ARS';
const DECAL_DEPTH = 0.12;            // profundidad de proyección (unidades del modelo)
const TEXT_CANVAS = { w: 1024, h: 384 };

// ---------------------------------------------------------------------
//  DOM
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const canvas = $('customizer-canvas');
const stage = $('preview-stage');
if (!canvas || !stage) throw new Error('Customizer: falta el canvas');

const loaderEl = $('stage-loader');
const loaderText = $('stage-loader-text');
const hintTarget = $('hint-target');
const toastEl = $('toast');

// ---------------------------------------------------------------------
//  ESCENA
// ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true, // para poder sacar la captura del diseño
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 1.3;
controls.maxDistance = 4.5;
controls.maxPolarAngle = Math.PI * 0.49;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.9;
controls.addEventListener('start', () => { controls.autoRotate = false; });

// Luces
const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
keyLight.position.set(2, 4, 2.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -1.6;
keyLight.shadow.camera.right = 1.6;
keyLight.shadow.camera.top = 1.6;
keyLight.shadow.camera.bottom = -1.6;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 10;
keyLight.shadow.bias = -0.0005;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xdfffe4, 0.6);
rimLight.position.set(-3, 2, -2);
scene.add(rimLight);
scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe6df, 0.45));

// Piso que solo recibe sombra
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.ShadowMaterial({ opacity: 0.16 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ---------------------------------------------------------------------
//  ESTADO
// ---------------------------------------------------------------------
let sandal = null;          // THREE.Mesh de la sandalia
let baseMat = null;         // material original
let originalMap = null;     // textura negra original
let modelBox = null;
let toe = new THREE.Vector3(1, 0, 0); // dirección hacia la punta
let homeView = null;
let activeTarget = 'shield';

const state = {
    quantity: 'minorista',
    baseColor: 'original',
    baseName: 'Gris Oscuro',
    text: '10',
    textColor: '#ffffff',
    textColorName: 'Blanco',
    shieldFile: null,
    shieldImage: null,
    removeWhite: true,
};

function makeDecalMaterial(texture) {
    return new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        roughness: 0.5,   // un poco más brillante que la goma: parece estampa/vinilo
        metalness: 0,
    });
}

// Canvas de texto (se actualiza en vivo sin regenerar geometría)
const textCanvas = document.createElement('canvas');
textCanvas.width = TEXT_CANVAS.w;
textCanvas.height = TEXT_CANVAS.h;
const textTexture = new THREE.CanvasTexture(textCanvas);
textTexture.colorSpace = THREE.SRGBColorSpace;

// Canvas del escudo
const shieldCanvas = document.createElement('canvas');
shieldCanvas.width = shieldCanvas.height = 1024;
const shieldTexture = new THREE.CanvasTexture(shieldCanvas);
shieldTexture.colorSpace = THREE.SRGBColorSpace;

const decals = {
    shield: {
        mesh: null, point: null, normal: null,
        baseSize: 0.24, scale: 1, rot: 0, aspect: 1,
        enabled: false, material: makeDecalMaterial(shieldTexture),
    },
    text: {
        mesh: null, point: null, normal: null,
        baseSize: 0.36, scale: 1, rot: 0, aspect: TEXT_CANVAS.h / TEXT_CANVAS.w,
        enabled: true, material: makeDecalMaterial(textTexture),
    },
};

// ---------------------------------------------------------------------
//  RAYCAST HELPERS
// ---------------------------------------------------------------------
const pickRay = new THREE.Raycaster();
const helperRay = new THREE.Raycaster();
const V_DOWN = new THREE.Vector3(0, -1, 0);
const V_Y = new THREE.Vector3(0, 1, 0);
const V_X = new THREE.Vector3(1, 0, 0);

function worldFaceNormal(hit, towards) {
    const n = hit.face.normal.clone().transformDirection(sandal.matrixWorld);
    if (towards && n.dot(towards) < 0) n.negate();
    return n;
}

function castDown(x, z) {
    helperRay.set(new THREE.Vector3(x, modelBox.max.y + 1, z), V_DOWN);
    helperRay.far = Infinity;
    return helperRay.intersectObject(sandal, false)[0] || null;
}

// Normal promediada en un pequeño radio: evita que la calcomanía se tuerza
// por el "ruido" de triángulos típico de las mallas generadas por IA.
function smoothNormal(point, approx) {
    const n = approx.clone().normalize();
    const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) < 0.9 ? V_Y : V_X).normalize();
    const t2 = new THREE.Vector3().crossVectors(n, t1);
    const acc = new THREE.Vector3();
    const r = 0.035;
    const offs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
    const dir = n.clone().negate();
    for (const [a, b] of offs) {
        const origin = point.clone()
            .addScaledVector(t1, a * r)
            .addScaledVector(t2, b * r)
            .addScaledVector(n, 0.15);
        helperRay.set(origin, dir);
        helperRay.far = 0.3;
        const h = helperRay.intersectObject(sandal, false)[0];
        if (h) acc.add(worldFaceNormal(h, n));
    }
    helperRay.far = Infinity;
    return acc.lengthSq() > 0 ? acc.normalize() : n;
}

// Encuentra la tira superior (la parte más alta de la sandalia a lo largo del largo)
function analyzeStrap() {
    const cz = (modelBox.min.z + modelBox.max.z) / 2;
    const samples = [];
    for (let x = modelBox.min.x + 0.04; x <= modelBox.max.x - 0.04; x += 0.02) {
        const h = castDown(x, cz);
        if (h) samples.push({ x, y: h.point.y });
    }
    const maxY = Math.max(...samples.map((s) => s.y));
    const strap = samples.filter((s) => s.y > maxY - 0.05);
    const xs = strap.map((s) => s.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const center = (minX + maxX) / 2;
    // En una ojota, la tira está más cerca de la punta que del talón
    toe = new THREE.Vector3(Math.sign(center) || 1, 0, 0);
    return { center, length: Math.max(maxX - minX, 0.2), cz };
}

function surfaceAt(x, z) {
    const h = castDown(x, z);
    if (!h) return null;
    const n = smoothNormal(h.point, worldFaceNormal(h, V_Y));
    return { point: h.point.clone(), normal: n };
}

// ---------------------------------------------------------------------
//  DECALS (proyección sobre la malla)
// ---------------------------------------------------------------------
function orientationFor(normal, rotDeg) {
    const z = normal.clone().normalize();
    // "arriba" de la imagen = hacia la punta, proyectado sobre la superficie
    let up = toe.clone().addScaledVector(z, -toe.dot(z));
    if (up.lengthSq() < 1e-4) up = new THREE.Vector3(0, 0, 1).addScaledVector(z, -z.z);
    up.normalize();
    const x = new THREE.Vector3().crossVectors(up, z).normalize();
    const a = THREE.MathUtils.degToRad(rotDeg);
    const xr = x.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    const yr = new THREE.Vector3().crossVectors(z, xr);
    const m = new THREE.Matrix4().makeBasis(xr, yr, z);
    return new THREE.Euler().setFromRotationMatrix(m);
}

// Descarta triángulos que miran hacia otro lado (parte de abajo de la tira, costados)
function keepFacing(geo, normal) {
    const pos = geo.attributes.position.array;
    const nor = geo.attributes.normal.array;
    const uv = geo.attributes.uv.array;
    const P = [], N = [], U = [];
    const tmp = new THREE.Vector3();
    for (let v = 0; v < pos.length / 3; v += 3) {
        tmp.set(0, 0, 0);
        for (let k = 0; k < 3; k++) {
            const i = (v + k) * 3;
            tmp.x += nor[i]; tmp.y += nor[i + 1]; tmp.z += nor[i + 2];
        }
        if (tmp.normalize().dot(normal) < 0.2) continue;
        for (let k = 0; k < 3; k++) {
            const i = (v + k) * 3, j = (v + k) * 2;
            P.push(pos[i], pos[i + 1], pos[i + 2]);
            N.push(nor[i], nor[i + 1], nor[i + 2]);
            U.push(uv[j], uv[j + 1]);
        }
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    return out;
}

function buildDecal(key) {
    const d = decals[key];
    if (d.mesh) {
        scene.remove(d.mesh);
        d.mesh.geometry.dispose();
        d.mesh = null;
    }
    if (!sandal || !d.enabled || !d.point) return;

    const w = d.baseSize * d.scale;
    const size = new THREE.Vector3(w, w * d.aspect, DECAL_DEPTH);
    const raw = new DecalGeometry(sandal, d.point, orientationFor(d.normal, d.rot), size);
    const geo = keepFacing(raw, d.normal);
    raw.dispose();

    d.mesh = new THREE.Mesh(geo, d.material);
    d.mesh.renderOrder = key === 'text' ? 3 : 2;
    scene.add(d.mesh);
}

// ---------------------------------------------------------------------
//  TEXTURAS DINÁMICAS
// ---------------------------------------------------------------------
function drawText() {
    const ctx = textCanvas.getContext('2d');
    const { w: W, h: H } = TEXT_CANVAS;
    ctx.clearRect(0, 0, W, H);
    const str = state.text.trim().toUpperCase();
    decals.text.enabled = str.length > 0;
    if (str) {
        let fs = 300;
        ctx.font = `900 ${fs}px Outfit, sans-serif`;
        const m = ctx.measureText(str).width;
        if (m > W * 0.92) fs *= (W * 0.92) / m;
        ctx.font = `900 ${fs}px Outfit, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        // borde sutil para que se lea sobre cualquier color de base
        ctx.lineWidth = fs * 0.07;
        if (state.quantity === 'minorista') {
            ctx.fillStyle = '#181818';
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        } else {
            ctx.fillStyle = state.textColor;
            ctx.strokeStyle = isLight(state.textColor) ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
        }
        ctx.strokeText(str, W / 2, H / 2 + fs * 0.04);
        ctx.fillText(str, W / 2, H / 2 + fs * 0.04);
    }
    textTexture.needsUpdate = true;
}

function isLight(hex) {
    const c = new THREE.Color(hex);
    return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) > 0.6;
}

// Algoritmo de flood-fill para borrar fondo blanco conectado al borde
function removeWhiteBackground(ctx, w, h) {
    const data = ctx.getImageData(0, 0, w, h);
    const p = data.data;
    const isBg = (i) => {
        const a = p[i + 3];
        if (a < 20) return true;
        const r = p[i], g = p[i + 1], b = p[i + 2];
        const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
        return mn > 215 && mx - mn < 32;
    };
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0, tail = 0;
    const push = (idx) => {
        if (visited[idx]) return;
        visited[idx] = 1;
        if (isBg(idx * 4)) queue[tail++] = idx;
    };
    for (let i = 0; i < w; i++) {
        push(i);
        push((h - 1) * w + i);
    }
    for (let j = 0; j < h; j++) {
        push(j * w);
        push(j * w + w - 1);
    }
    while (head < tail) {
        const idx = queue[head++];
        p[idx * 4 + 3] = 0;
        const x = idx % w, y = (idx / w) | 0;
        if (x > 0) push(idx - 1);
        if (x < w - 1) push(idx + 1);
        if (y > 0) push(idx - w);
        if (y < h - 1) push(idx + w);
    }
    ctx.putImageData(data, 0, 0);
}

// Dibuja el escudo centrado y, si se pide, borra el fondo blanco conectado al borde
function drawShield() {
    const img = state.shieldImage;
    const S = shieldCanvas.width;
    const ctx = shieldCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, S, S);
    if (!img) return;

    const pad = S * 0.04;
    const scale = Math.min((S - 2 * pad) / img.width, (S - 2 * pad) / img.height);
    const w = img.width * scale, h = img.height * scale;
    decals.shield.aspect = 1;
    ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);

    if (state.removeWhite) {
        removeWhiteBackground(ctx, S, S);
    }

    // Efecto "grabado" realista (solo para minoristas)
    // Convierte lo claro en transparente y lo oscuro en un tono negro/gris
    if (state.quantity === 'minorista') {
        const data2 = ctx.getImageData(0, 0, S, S);
        const p2 = data2.data;
        for (let i = 0; i < p2.length; i += 4) {
            const a = p2[i + 3];
            if (a > 0) {
                const lum = 0.299 * p2[i] + 0.587 * p2[i + 1] + 0.114 * p2[i + 2];
                const darkness = Math.max(0, 1 - (lum / 255));
                // Alpha ajustado por la oscuridad del pixel
                p2[i + 3] = a * Math.pow(darkness, 1.2);
                // Aplicar el color oscuro base (casi negro)
                p2[i] = 24;
                p2[i + 1] = 24;
                p2[i + 2] = 24;
            }
        }
        ctx.putImageData(data2, 0, 0);
    }

    shieldTexture.needsUpdate = true;
}

// ---------------------------------------------------------------------
//  COLOR DE BASE (material real del modelo)
// ---------------------------------------------------------------------
function applyBaseColor() {
    if (!baseMat) return;
    const isMayorista = state.quantity === 'mayorista';
    if (!isMayorista) {
        state.baseColor = 'original';
        state.baseName = 'Gris Oscuro';
        baseMat.color.set(0x444444);
    } else if (state.baseColor === 'original') {
        baseMat.color.set(0x444444);
    } else {
        baseMat.color.set(state.baseColor);
    }
    baseMat.needsUpdate = true;

    // Sincronizar estado visual del botón móvil y rueda
    const statusDot = $('wheel-status-dot');
    const statusName = $('wheel-status-name');
    const previewSwatch = $('wheel-preview-swatch');
    const previewHex = $('wheel-preview-hex');
    const actualHex = (!isMayorista || state.baseColor === 'original') ? '#444444' : state.baseColor;
    if (statusDot) statusDot.style.backgroundColor = actualHex;
    if (statusName) statusName.textContent = !isMayorista ? 'Gris Oscuro (Estándar)' : (state.baseName || actualHex);
    if (previewSwatch) previewSwatch.style.backgroundColor = actualHex;
    if (previewHex) previewHex.textContent = actualHex.toUpperCase();
}

// ---------------------------------------------------------------------
//  CÁMARA
// ---------------------------------------------------------------------
function fitDistance() {
    if (!modelBox) return 2.6;
    const r = modelBox.getBoundingSphere(new THREE.Sphere()).radius;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const minFov = Math.min(vfov, hfov);
    const factor = window.innerWidth <= 768 ? 0.96 : 0.86;
    return (r / Math.sin(minFov / 2)) * factor;
}

function computeHomeView() {
    const target = modelBox.getCenter(new THREE.Vector3());
    target.y = (modelBox.min.y + modelBox.max.y) * 0.5 + 0.02;
    // Perspectiva 3/4 hero: muestra la tira frontal con el escudo y el dorsal de frente
    const dir = new THREE.Vector3(-0.65, 0.95, 1.25).normalize();
    return { target, dir };
}

function goHome() {
    if (!homeView) return;
    controls.target.copy(homeView.target);
    camera.position.copy(homeView.target).addScaledVector(homeView.dir, fitDistance());
    camera.lookAt(homeView.target);
    controls.update();
}

let prevW = 0, prevH = 0;
function resize() {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    const wasHidden = (prevW === 0 || prevH === 0);
    prevW = w;
    prevH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (wasHidden && homeView) {
        goHome();
    }
}
new ResizeObserver(resize).observe(stage);
resize();

// Centrar inmediatamente al abrir el modal en móvil y frenar rotación automática
window.addEventListener('finnta:studio-open', () => {
    controls.autoRotate = false;
    setTimeout(() => {
        resize();
        goHome();
    }, 60);
});

// ---------------------------------------------------------------------
//  CARGA DEL MODELO
// ---------------------------------------------------------------------
const loader = new GLTFLoader();
loader.load(
    MODEL_URL,
    async (gltf) => {
        let strapMesh = null, soleMesh = null;
        gltf.scene.traverse((o) => {
            if (o.isMesh) {
                o.castShadow = true;
                o.geometry.computeBoundingBox();
                if (o.geometry.boundingBox.max.y > 0.0) {
                    strapMesh = o;
                } else {
                    soleMesh = o;
                }
            }
        });

        if (!strapMesh || !soleMesh) return showLoaderError('El modelo no está dividido en dos partes.');

        // Usamos la tira como "sandal" para que los estampados se proyecten solo ahí
        sandal = strapMesh;

        scene.add(gltf.scene);
        gltf.scene.updateMatrixWorld(true);

        soleMesh.material = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9,
            metalness: 0.0
        });

        baseMat = new THREE.MeshStandardMaterial({
            color: 0xdddddd,
            roughness: 0.7,
            metalness: 0.0
        });
        strapMesh.material = baseMat;
        originalMap = null;

        modelBox = new THREE.Box3().setFromObject(gltf.scene);
        floor.position.y = modelBox.min.y - 0.002;

        loaderText.textContent = 'Preparando la tira para estampar…';
        await new Promise((r) => requestAnimationFrame(r));

        const strap = analyzeStrap();
        
        const shieldX = strap.center + toe.x * strap.length * 0.12;
        const textX = strap.center - toe.x * strap.length * 0.3;

        const s = surfaceAt(shieldX, strap.cz);
        if (s) Object.assign(decals.shield, s);
        const t = surfaceAt(textX, strap.cz);
        if (t) Object.assign(decals.text, t);

        decals.shield.baseSize = THREE.MathUtils.clamp(strap.length * 0.45, 0.16, 0.3);
        const width = modelBox.max.z - modelBox.min.z;
        decals.text.baseSize = THREE.MathUtils.clamp(width * 0.55, 0.22, 0.42);

        homeView = computeHomeView();
        goHome();

        try { await document.fonts.load('900 100px Outfit'); } catch (e) { /* usa fallback */ }
        drawText();
        buildDecal('text');
        buildDecal('shield');
        applyBaseColor();

        loaderEl.classList.add('hidden');
    },
    (xhr) => {
        if (xhr.total) loaderText.textContent = `Cargando tu sandalia 3D… ${Math.round((xhr.loaded / xhr.total) * 100)}%`;
    },
    (err) => {
        console.error(err);
        showLoaderError('No se pudo cargar el modelo 3D. Abrí la página con un servidor local (ej: Live Server).');
    }
);

function showLoaderError(msg) {
    loaderEl.classList.add('error');
    loaderText.textContent = msg;
}

// ---------------------------------------------------------------------
//  RENDER LOOP (se pausa cuando la sección no está en pantalla)
// ---------------------------------------------------------------------
let onScreen = true;
new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(stage);
renderer.setAnimationLoop(() => {
    if (!onScreen) return;
    controls.update();
    renderer.render(scene, camera);
});

// ---------------------------------------------------------------------
//  INTERACCIÓN: tocar la sandalia para ubicar el escudo / texto
// ---------------------------------------------------------------------
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
    if (!downAt || !sandal) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return; // fue un arrastre para girar

    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    pickRay.setFromCamera(ndc, camera);
    const hit = pickRay.intersectObject(sandal, false)[0];
    if (!hit) return;

    const towardsCam = pickRay.ray.direction.clone().negate();
    const n = smoothNormal(hit.point, worldFaceNormal(hit, towardsCam));
    const d = decals[activeTarget];
    d.point = hit.point.clone();
    d.normal = n;

    if (activeTarget === 'shield' && !state.shieldImage) {
        toast('Primero subí el escudo oficial de tu club ⚽');
    }
    buildDecal(activeTarget);
});

document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTarget(btn.dataset.target));
});

function setActiveTarget(t) {
    activeTarget = t;
    document.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.target === t));
    hintTarget.textContent = t === 'shield' ? 'escudo' : 'texto';
}

$('btn-reset-view').addEventListener('click', goHome);

// ---------------------------------------------------------------------
//  CONTROLES
// ---------------------------------------------------------------------
function bindSwatches(containerId, onPick) {
    const wrap = $(containerId);
    wrap.querySelectorAll('.color-swatch').forEach((sw) => {
        sw.addEventListener('click', () => {
            wrap.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
            sw.classList.add('active');
            onPick(sw.dataset.color, sw.dataset.name);
        });
    });
}

bindSwatches('base-swatches', (color, name) => {
    if (state.quantity !== 'mayorista') {
        toast('El color de tira personalizado está disponible a partir de 100 pares (Mayorista).');
        return;
    }
    state.baseColor = color;
    state.baseName = name;
    $('base-name').textContent = name;
    applyBaseColor();
    
    // Deselect color picker wrapper if a standard swatch is clicked
    const wrapper = $('base-swatches').querySelector('.color-picker-wrapper');
    if (wrapper) wrapper.classList.remove('active');
});

$('base-color-picker').addEventListener('input', (e) => {
    if (state.quantity !== 'mayorista') {
        toast('El color de tira personalizado está disponible a partir de 100 pares (Mayorista).');
        return;
    }
    const wrap = $('base-swatches');
    wrap.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
    e.target.parentElement.classList.add('active');
    
    const color = e.target.value;
    state.baseColor = color;
    state.baseName = "Personalizado";
    $('base-name').textContent = "Personalizado";
    applyBaseColor();
});

// =====================================================================
//  RUEDA CROMÁTICA INTERACTIVA (Color Wheel Modal)
// =====================================================================
(function initColorWheel() {
    const modal = document.getElementById('color-wheel-modal');
    const backdrop = document.getElementById('color-wheel-backdrop');
    const closeBtn = document.getElementById('color-wheel-close-btn');
    const confirmBtn = document.getElementById('wheel-confirm-btn');
    const canvasContainer = document.getElementById('color-wheel-canvas-container');
    const canvas = document.getElementById('color-wheel-canvas');
    const knob = document.getElementById('color-wheel-knob');
    const brightnessSlider = document.getElementById('wheel-brightness-slider');
    const brightnessVal = document.getElementById('wheel-val-percent');
    const previewSwatch = document.getElementById('wheel-preview-swatch');
    const previewHex = document.getElementById('wheel-preview-hex');
    const mobileTrigger = document.getElementById('mobile-wheel-trigger-btn');
    const quickDots = document.querySelectorAll('.wheel-quick-dot');

    if (!modal || !canvas || !canvasContainer) return;

    const ctx = canvas.getContext('2d');
    const SIZE = 250;
    const RADIUS = SIZE / 2;
    const DPR = Math.min(window.devicePixelRatio || 2, 2);

    canvas.width = SIZE * DPR;
    canvas.height = SIZE * DPR;
    ctx.scale(DPR, DPR);

    // Canvas fuera de pantalla para rendimiento 60 FPS
    const offCanvas = document.createElement('canvas');
    offCanvas.width = SIZE * DPR;
    offCanvas.height = SIZE * DPR;
    const offCtx = offCanvas.getContext('2d');
    offCtx.scale(DPR, DPR);

    function renderBaseWheel() {
        const totalW = SIZE * DPR;
        const imgData = offCtx.createImageData(totalW, totalW);
        const data = imgData.data;
        const rActual = RADIUS * DPR;

        for (let y = 0; y < totalW; y++) {
            for (let x = 0; x < totalW; x++) {
                const dx = x - rActual;
                const dy = y - rActual;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const idx = (y * totalW + x) * 4;

                if (dist <= rActual) {
                    const sat = dist / rActual;
                    const angle = Math.atan2(dy, dx);
                    const hue = ((angle * 180 / Math.PI) + 360) % 360;

                    // HSV con V = 1.0
                    const f = (n, k = (n + hue / 60) % 6) => 1 - sat * Math.max(Math.min(k, 4 - k, 1), 0);
                    data[idx] = Math.round(f(5) * 255);
                    data[idx + 1] = Math.round(f(3) * 255);
                    data[idx + 2] = Math.round(f(1) * 255);

                    // Borde exterior suavizado (antialiasing)
                    if (dist > rActual - 1.5) {
                        data[idx + 3] = Math.round(Math.max(0, Math.min(1, rActual - dist)) * 255);
                    } else {
                        data[idx + 3] = 255;
                    }
                } else {
                    data[idx + 3] = 0;
                }
            }
        }
        offCtx.putImageData(imgData, 0, 0);
    }
    renderBaseWheel();

    let curHue = 0;
    let curSat = 0;
    let curVal = 1;
    let isDragging = false;

    function drawWheel() {
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(offCanvas, 0, 0, SIZE, SIZE);

        // Capa de atenuación según el brillo (V)
        if (curVal < 1) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(RADIUS, RADIUS, RADIUS - 0.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 0, 0, ${1 - curVal})`;
            ctx.fill();
            ctx.restore();
        }
    }

    function hsvToRgb(h, s, v) {
        const f = (n, k = (n + h / 60) % 6) => v - v * s * Math.max(Math.min(k, 4 - k, 1), 0);
        const r = Math.round(f(5) * 255);
        const g = Math.round(f(3) * 255);
        const b = Math.round(f(1) * 255);
        const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
        return { r, g, b, hex };
    }

    function hexToRgb(hex) {
        if (!hex || hex === 'original') return { r: 68, g: 68, b: 68 };
        let clean = hex.replace('#', '');
        if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
        const num = parseInt(clean, 16);
        return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
    }

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        const s = max === 0 ? 0 : d / max;
        const v = max;
        if (d !== 0) {
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
        }
        return { h, s, v };
    }

    function updateColorFromState(triggerModelUpdate = true, customName = null) {
        const { hex } = hsvToRgb(curHue, curSat, curVal);
        const pureHueSat = hsvToRgb(curHue, curSat, 1).hex;

        // Posición del selector (knob)
        const angle = curHue * Math.PI / 180;
        const dist = curSat * RADIUS;
        const kx = RADIUS + Math.cos(angle) * dist;
        const ky = RADIUS + Math.sin(angle) * dist;
        knob.style.left = `${kx}px`;
        knob.style.top = `${ky}px`;
        knob.style.backgroundColor = hex;

        // Previsualizaciones
        if (previewSwatch) previewSwatch.style.backgroundColor = hex;
        if (previewHex) previewHex.textContent = hex.toUpperCase();

        const statusDot = $('wheel-status-dot');
        const statusName = $('wheel-status-name');
        if (statusDot) statusDot.style.backgroundColor = hex;
        if (statusName) statusName.textContent = customName || state.baseName || hex.toUpperCase();

        // Barra de brillo
        if (brightnessSlider) {
            brightnessSlider.style.background = `linear-gradient(to right, #000000, ${pureHueSat})`;
            brightnessSlider.value = Math.round(curVal * 100);
        }
        if (brightnessVal) {
            brightnessVal.textContent = `${Math.round(curVal * 100)}%`;
        }

        // Actualizar sandalia 3D en tiempo real
        if (triggerModelUpdate) {
            state.baseColor = hex;
            state.baseName = customName || "Personalizado";
            const baseNameEl = $('base-name');
            if (baseNameEl) baseNameEl.textContent = state.baseName;
            applyBaseColor();
        }
    }

    function handlePointer(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        let dx = clientX - (rect.left + RADIUS);
        let dy = clientY - (rect.top + RADIUS);
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > RADIUS) {
            dx = (dx / dist) * RADIUS;
            dy = (dy / dist) * RADIUS;
            dist = RADIUS;
        }

        curSat = Math.min(1, dist / RADIUS);
        curHue = ((Math.atan2(dy, dx) * 180 / Math.PI) + 360) % 360;

        updateColorFromState(true);
    }

    canvasContainer.addEventListener('pointerdown', (e) => {
        isDragging = true;
        canvasContainer.setPointerCapture(e.pointerId);
        handlePointer(e);
    });

    canvasContainer.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        handlePointer(e);
    });

    canvasContainer.addEventListener('pointerup', (e) => {
        isDragging = false;
        try { canvasContainer.releasePointerCapture(e.pointerId); } catch(err) {}
    });

    canvasContainer.addEventListener('pointercancel', () => {
        isDragging = false;
    });

    if (brightnessSlider) {
        brightnessSlider.addEventListener('input', (e) => {
            curVal = parseFloat(e.target.value) / 100;
            drawWheel();
            updateColorFromState(true);
        });
    }

    quickDots.forEach(btn => {
        btn.addEventListener('click', () => {
            setColorByHex(btn.dataset.hex, true, btn.dataset.name || btn.getAttribute('title'));
        });
    });

    function setColorByHex(hex, triggerModelUpdate = true, customName = null) {
        const rgb = hexToRgb(hex);
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        curHue = hsv.h;
        curSat = hsv.s;
        curVal = Math.max(0.1, hsv.v);

        drawWheel();
        updateColorFromState(triggerModelUpdate, customName);
    }

    function openModal() {
        if (state.quantity !== 'mayorista') {
            toast('El color de tira personalizado está disponible a partir de 100 pares (Mayorista).');
            return;
        }
        setColorByHex(state.baseColor, false);
        modal.removeAttribute('hidden');
        requestAnimationFrame(() => {
            modal.classList.add('active');
            drawWheel();
            updateColorFromState(false);
        });
    }

    function closeModal() {
        modal.classList.remove('active');
        setTimeout(() => {
            modal.setAttribute('hidden', '');
        }, 280);
    }

    if (mobileTrigger) {
        mobileTrigger.addEventListener('click', (e) => {
            e.preventDefault();
            if (state.quantity !== 'mayorista') {
                toast('El color de tira personalizado está disponible a partir de 100 pares (Mayorista).');
                return;
            }
            openModal();
        });
    }

    // En escritorio, al hacer clic sobre el wrapper de la rueda multicolor también abre la rueda interactiva
    const desktopColorWrap = document.querySelector('#base-swatches .color-picker-wrapper');
    if (desktopColorWrap) {
        desktopColorWrap.addEventListener('click', (e) => {
            if (state.quantity !== 'mayorista') {
                e.preventDefault();
                e.stopPropagation();
                toast('El color de tira personalizado está disponible a partir de 100 pares (Mayorista).');
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            openModal();
        });
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);
    if (confirmBtn) confirmBtn.addEventListener('click', closeModal);

    // Sincronización inicial
    applyBaseColor();
})();

function updateQuantityMode(isMayorista) {
    const controls = document.querySelector('.customizer-controls');
    if (controls) {
        controls.classList.toggle('minorista-mode', !isMayorista);
    }

    const swatches = $('base-swatches');
    const heading = $('color-heading');
    const mobileBtn = $('mobile-wheel-trigger-btn');
    const badgeText = $('wheel-badge-text');
    const badgeIcon = $('wheel-badge-icon');
    const modal = $('color-wheel-modal');
    const shieldHeading = $('shield-heading');
    const textSwatches = $('text-swatches');

    const shieldStepNum = $('shield-step-num');
    const textStepNum = $('text-step-num');
    const orderStepNum = $('order-step-num');
    const pillShield = $('pill-num-shield');
    const pillText = $('pill-num-text');
    const pillOrder = $('pill-num-order');
    const qtyNextBtn = $('qty-next-btn');
    const qtyNextText = $('qty-next-text');
    const shieldPrevBtn = $('shield-prev-btn');

    if (isMayorista) {
        if (swatches) {
            swatches.classList.remove('disabled');
            swatches.style.opacity = '1';
            swatches.style.pointerEvents = 'auto';
        }
        if (textSwatches) {
            textSwatches.classList.remove('disabled');
            textSwatches.style.opacity = '1';
            textSwatches.style.pointerEvents = 'auto';
        }
        if (heading) heading.classList.remove('disabled-text');
        if (shieldHeading) shieldHeading.textContent = 'Escudo de tu club (A todo color)';

        // Numeración mayorista (+100 pares): 5 pasos
        if (shieldStepNum) shieldStepNum.textContent = 'Paso 3';
        if (textStepNum) textStepNum.textContent = 'Paso 4';
        if (orderStepNum) orderStepNum.textContent = 'Paso 5';

        if (pillShield) pillShield.textContent = '3';
        if (pillText) pillText.textContent = '4';
        if (pillOrder) pillOrder.textContent = '5';

        if (qtyNextBtn) qtyNextBtn.setAttribute('data-next', 'color');
        if (qtyNextText) qtyNextText.textContent = 'Siguiente: Color de tira';

        if (shieldPrevBtn) {
            shieldPrevBtn.setAttribute('data-prev', 'color');
            shieldPrevBtn.textContent = '← Color';
        }

        // Mobile wheel trigger button habilitado
        if (mobileBtn) {
            mobileBtn.classList.remove('locked');
            if (badgeText) badgeText.textContent = 'Personalizar';
            if (badgeIcon) badgeIcon.style.display = 'inline-block';
        }
    } else {
        if (swatches) {
            swatches.classList.add('disabled');
            swatches.style.opacity = '0.4';
            swatches.style.pointerEvents = 'none';
        }
        if (textSwatches) {
            textSwatches.classList.add('disabled');
            textSwatches.style.opacity = '0.4';
            textSwatches.style.pointerEvents = 'none';
        }
        if (shieldHeading) shieldHeading.textContent = 'Escudo de tu club (Grabado)';

        // Numeración minorista (<100 pares): 4 pasos directos
        if (shieldStepNum) shieldStepNum.textContent = 'Paso 2';
        if (textStepNum) textStepNum.textContent = 'Paso 3';
        if (orderStepNum) orderStepNum.textContent = 'Paso 4';

        if (pillShield) pillShield.textContent = '2';
        if (pillText) pillText.textContent = '3';
        if (pillOrder) pillOrder.textContent = '4';

        if (qtyNextBtn) qtyNextBtn.setAttribute('data-next', 'shield');
        if (qtyNextText) qtyNextText.textContent = 'Siguiente: Escudo';

        if (shieldPrevBtn) {
            shieldPrevBtn.setAttribute('data-prev', 'qty');
            shieldPrevBtn.textContent = '← Cantidad';
        }

        // Cerrar modal de rueda si estuviera abierto
        if (modal && modal.classList.contains('active')) {
            modal.classList.remove('active');
            setTimeout(() => modal.setAttribute('hidden', ''), 280);
        }

        // Si estaba en el paso de color y pasó a minorista, redirigir a escudo
        const activeColorStep = document.querySelector('#color-group.mobile-active-step');
        if (activeColorStep && window.switchCustomizerStep) {
            window.switchCustomizerStep('shield');
        }

        // Restablecer color de tira al original estándar (Gris Oscuro)
        state.baseColor = 'original';
        state.baseName = 'Gris Oscuro';
        if (swatches) {
            const origSwatch = swatches.querySelector('[data-color="original"]');
            if (origSwatch) {
                swatches.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                origSwatch.classList.add('active');
            }
        }
    }

    applyBaseColor();
    drawShield();
    drawText();
}

$('order-qty').addEventListener('change', (e) => {
    state.quantity = e.target.value;
    updateQuantityMode(state.quantity === 'mayorista');
});

// Sincronización inicial de cantidad
updateQuantityMode(state.quantity === 'mayorista');

bindSwatches('text-swatches', (color, name) => {
    state.textColor = color;
    state.textColorName = name;
    
    const wrapper = $('text-swatches').querySelector('.color-picker-wrapper');
    if (wrapper) wrapper.classList.remove('active');
    
    drawText();
});

$('text-color-picker').addEventListener('input', (e) => {
    const wrap = $('text-swatches');
    wrap.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
    e.target.parentElement.classList.add('active');
    
    state.textColor = e.target.value;
    state.textColorName = "Personalizado";
    drawText();
});

$('custom-text-input').addEventListener('input', (e) => {
    const wasEnabled = decals.text.enabled;
    state.text = e.target.value;
    drawText();
    if (wasEnabled !== decals.text.enabled) buildDecal('text');
    setActiveTarget('text');
});

$('text-size').addEventListener('input', (e) => {
    decals.text.scale = parseFloat(e.target.value);
    buildDecal('text');
});

$('text-rot').addEventListener('input', (e) => {
    decals.text.rot = parseFloat(e.target.value);
    buildDecal('text');
});

// Conversión automática de cualquier formato de imagen a PNG transparente
function convertFileToPng(file, applyRemoveWhite = true) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const maxDim = 2048;
                let w = img.naturalWidth || img.width || 512;
                let h = img.naturalHeight || img.height || 512;
                if (w > maxDim || h > maxDim) {
                    if (w > h) {
                        h = Math.round((h * maxDim) / w);
                        w = maxDim;
                    } else {
                        w = Math.round((w * maxDim) / h);
                        h = maxDim;
                    }
                }

                const offCanvas = document.createElement('canvas');
                offCanvas.width = w;
                offCanvas.height = h;
                const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, w, h);

                if (applyRemoveWhite) {
                    removeWhiteBackground(ctx, w, h);
                }

                offCanvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('No se pudo generar PNG'));
                        return;
                    }
                    const rawName = (file.name || 'escudo').replace(/\.[^/.]+$/, '');
                    const pngFileName = `${rawName}-finnta.png`;
                    const pngFile = new File([blob], pngFileName, { type: 'image/png' });
                    const pngBlobUrl = URL.createObjectURL(blob);

                    const convImg = new Image();
                    convImg.onload = () => {
                        resolve({
                            pngFile,
                            pngBlob: blob,
                            img: convImg,
                            url: pngBlobUrl,
                            isConverted: file.type !== 'image/png'
                        });
                    };
                    convImg.src = pngBlobUrl;
                }, 'image/png');
            };
            img.onerror = () => reject(new Error('No se pudo decodificar la imagen'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(file);
    });
}

// Escudo: acepta cualquier imagen y la transforma a PNG
async function handleShieldFile(file) {
    if (!file) return;
    const isImage = (file.type && file.type.startsWith('image/')) || 
                    /\.(png|jpe?g|webp|svg|bmp|avif|gif)$/i.test(file.name || '');
    if (!isImage) {
        toast('Por favor, seleccioná un archivo de imagen (JPG, PNG, WebP, etc.).');
        return;
    }

    toast('Procesando imagen y convirtiendo a PNG...');

    try {
        const res = await convertFileToPng(file, state.removeWhite);
        state.originalShieldFile = file;
        state.shieldFile = res.pngFile;
        state.shieldImage = res.img;
        decals.shield.enabled = true;
        drawShield();
        buildDecal('shield');
        setActiveTarget('shield');

        $('shield-thumb').src = res.url;
        $('shield-thumb').hidden = false;
        if ($('upload-icon')) $('upload-icon').style.display = 'none';
        $('upload-text').textContent = 'Cambiar imagen';
        if ($('upload-subtext')) {
            $('upload-subtext').textContent = res.isConverted ? 'Convertida a PNG · Lista para producción' : 'PNG listo para estampar';
        }
        if ($('png-badge')) {
            $('png-badge').hidden = false;
            $('png-badge').textContent = res.isConverted ? '⚽ Escudo Oficial PNG' : '⚽ Escudo Oficial';
        }
        $('shield-tools').hidden = false;
        $('shield-remove').hidden = false;

        if (res.isConverted) {
            toast('¡Tu imagen fue transformada a PNG automáticamente!');
        } else {
            toast('¡Escudo estampado! Tocá la sandalia para moverlo.');
        }
    } catch (err) {
        console.error('Error al procesar imagen:', err);
        toast('No pudimos leer esa imagen. Probá con otra foto o formato.');
    }
}

$('shield-upload').addEventListener('change', (e) => {
    handleShieldFile(e.target.files[0]);
});

// Drag and drop del escudo
const uploadLabel = $('upload-label');
uploadLabel.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadLabel.classList.add('dragover');
});
uploadLabel.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadLabel.classList.remove('dragover');
});
uploadLabel.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadLabel.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleShieldFile(e.dataTransfer.files[0]);
    }
});

$('remove-white').addEventListener('change', async (e) => {
    state.removeWhite = e.target.checked;
    if (state.originalShieldFile) {
        try {
            const res = await convertFileToPng(state.originalShieldFile, state.removeWhite);
            state.shieldFile = res.pngFile;
            state.shieldImage = res.img;
            $('shield-thumb').src = res.url;
        } catch (err) {
            console.warn(err);
        }
    }
    drawShield();
});

$('shield-size').addEventListener('input', (e) => {
    decals.shield.scale = parseFloat(e.target.value);
    buildDecal('shield');
});

$('shield-rot').addEventListener('input', (e) => {
    decals.shield.rot = parseFloat(e.target.value);
    buildDecal('shield');
});

const shieldDownloadBtn = $('shield-download');
if (shieldDownloadBtn) {
    shieldDownloadBtn.addEventListener('click', () => {
        if (!state.shieldFile) return;
        downloadBlob(state.shieldFile, state.shieldFile.name || 'escudo-finnta.png');
        toast('Descargando el escudo oficial de tu club ⚽');
    });
}

$('shield-remove').addEventListener('click', () => {
    state.shieldFile = null;
    state.originalShieldFile = null;
    state.shieldImage = null;
    decals.shield.enabled = false;
    buildDecal('shield');
    $('shield-upload').value = '';
    $('shield-thumb').hidden = true;
    if ($('upload-icon')) $('upload-icon').style.display = '';
    $('upload-text').textContent = 'Subir imagen o escudo';
    if ($('upload-subtext')) $('upload-subtext').textContent = 'JPG, PNG, WebP · Auto-conversión a PNG';
    if ($('png-badge')) $('png-badge').hidden = true;
    $('shield-tools').hidden = true;
    $('shield-remove').hidden = true;
});

// ---------------------------------------------------------------------
//  PEDIDO → WHATSAPP
// ---------------------------------------------------------------------
function snapshotBlob() {
    // Fondo blanco para la captura (WhatsApp vuelve negro lo transparente)
    const prevBg = scene.background;
    scene.background = new THREE.Color(0xffffff);
    renderer.render(scene, camera);
    return new Promise((resolve) => {
        canvas.toBlob((b) => {
            scene.background = prevBg;
            resolve(b);
        }, 'image/png');
    });
}

function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

$('order-btn').addEventListener('click', async () => {
    const nameEl = $('order-name');
    const sizeEl = $('order-size');
    const name = nameEl.value.trim();
    const size = sizeEl.value;

    if (!size) {
        sizeEl.classList.add('invalid');
        sizeEl.focus();
        toast('Elegí tu talle para continuar');
        setTimeout(() => sizeEl.classList.remove('invalid'), 1500);
        return;
    }

    const text = state.text.trim().toUpperCase();
    const lines = [
        '⚽ ¡Hola Finnta! Quiero encargar el pedido para mi equipo:',
        '',
        name ? `⚽ Capitán / Pedido a nombre de: ${name}` : null,
        `👟 Talle de calzado: ${size}`,
        `📋 Plantel / Cantidad: ${state.quantity === 'mayorista' ? '100 pares o más (Mayorista)' : 'Menos de 100 pares (Minorista)'}`,
        `🎽 Color de tira: ${state.quantity === 'mayorista' ? state.baseName : 'Gris Oscuro (Estándar)'}`,
        `⚽ Escudo del Club: ${state.shieldFile ? 'Sí (grabado en relieve)' : 'Sin escudo'}`,
        `🔟 Dorsal / Grabado: ${text ? `${text} (color ${state.textColorName})` : 'Sin dorsal'}`,
        `💵 Presupuesto estimado: ${PRICE_LABEL}`,
        '',
        'Te adjunto la vista previa 3D de mi diseño.',
    ].filter((l) => l !== null);
    const message = lines.join('\n');

    const blob = await snapshotBlob();
    const preview = new File([blob], 'finnta-mi-diseno.png', { type: 'image/png' });
    const files = state.shieldFile ? [preview, state.shieldFile] : [preview];

    // Celular: hoja de compartir nativa → WhatsApp con las imágenes adjuntas
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (isTouch && navigator.canShare && navigator.canShare({ files })) {
        try {
            await navigator.share({ files, text: message, title: 'Mi Finnta' });
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }

    // Escritorio: descarga la vista previa y abre el chat del proveedor
    downloadBlob(blob, 'finnta-mi-diseno.png');
    if (state.shieldFile) {
        setTimeout(() => downloadBlob(state.shieldFile, state.shieldFile.name || 'escudo-finnta.png'), 400);
    }
    const waText = `${message}\n\n(📎 Se descargó "finnta-mi-diseno.png", adjuntala en este chat${state.shieldFile ? ' junto con tu escudo' : ''})`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`, '_blank', 'noopener');
    toast('Se descargó la ficha técnica de tu diseño: adjuntala en WhatsApp ⚽');
});

// ---------------------------------------------------------------------
//  TOAST
// ---------------------------------------------------------------------
let toastTimer = null;
function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}
