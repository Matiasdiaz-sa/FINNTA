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
const PRICE_LABEL = '$45.000 ARS';
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

// Dibuja el escudo centrado y, si se pide, borra el fondo blanco conectado al borde
// (flood-fill: no borra los blancos que están DENTRO del escudo).
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
        const data = ctx.getImageData(0, 0, S, S);
        const p = data.data;
        const isBg = (i) => {
            const a = p[i + 3];
            if (a < 20) return true;
            const r = p[i], g = p[i + 1], b = p[i + 2];
            const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
            return mn > 220 && mx - mn < 28;
        };
        const visited = new Uint8Array(S * S);
        const queue = new Int32Array(S * S);
        let head = 0, tail = 0;
        const push = (idx) => {
            if (visited[idx]) return;
            visited[idx] = 1;
            if (isBg(idx * 4)) queue[tail++] = idx;
        };
        for (let i = 0; i < S; i++) {
            push(i); push((S - 1) * S + i); push(i * S); push(i * S + S - 1);
        }
        while (head < tail) {
            const idx = queue[head++];
            p[idx * 4 + 3] = 0;
            const x = idx % S, y = (idx / S) | 0;
            if (x > 0) push(idx - 1);
            if (x < S - 1) push(idx + 1);
            if (y > 0) push(idx - S);
            if (y < S - 1) push(idx + S);
        }
        ctx.putImageData(data, 0, 0);
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
    if (state.baseColor === 'original') {
        baseMat.color.set(0x444444);
    } else {
        baseMat.color.set(state.baseColor);
    }
    baseMat.needsUpdate = true;
}

// ---------------------------------------------------------------------
//  CÁMARA
// ---------------------------------------------------------------------
function fitDistance() {
    const r = modelBox.getBoundingSphere(new THREE.Sphere()).radius;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    return (r / Math.sin(Math.min(vfov, hfov) / 2)) * 0.82;
}

function computeHomeView() {
    const target = modelBox.getCenter(new THREE.Vector3());
    target.y = modelBox.min.y + (modelBox.max.y - modelBox.min.y) * 0.35;
    // Vista "del que la usa": desde el talón, arriba, levemente de costado
    const dir = toe.clone().multiplyScalar(-1.0).add(new THREE.Vector3(0, 1.25, 0.55)).normalize();
    return { target, dir };
}

function goHome() {
    if (!homeView) return;
    controls.target.copy(homeView.target);
    camera.position.copy(homeView.target).addScaledVector(homeView.dir, fitDistance());
    camera.lookAt(homeView.target);
    controls.update();
}

function resize() {
    const { clientWidth: w, clientHeight: h } = stage;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

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
        toast('Primero subí la imagen de tu escudo 👉');
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
    state.baseColor = color;
    state.baseName = name;
    $('base-name').textContent = name;
    applyBaseColor();
    
    // Deselect color picker wrapper if a standard swatch is clicked
    const wrapper = $('base-swatches').querySelector('.color-picker-wrapper');
    if (wrapper) wrapper.classList.remove('active');
});

$('base-color-picker').addEventListener('input', (e) => {
    const wrap = $('base-swatches');
    wrap.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
    e.target.parentElement.classList.add('active');
    
    const color = e.target.value;
    state.baseColor = color;
    state.baseName = "Personalizado";
    $('base-name').textContent = "Personalizado";
    applyBaseColor();
});

$('order-qty').addEventListener('change', (e) => {
    state.quantity = e.target.value;
    const isMayorista = state.quantity === 'mayorista';
    const swatches = $('base-swatches');
    const badge = $('color-badge');
    const heading = $('color-heading');
    const textBadge = $('text-badge');
    const textHeading = $('text-heading');
    
    if (isMayorista) {
        swatches.classList.remove('disabled');
        swatches.style.opacity = '1';
        swatches.style.pointerEvents = 'auto';
        $('text-swatches').style.opacity = '1';
        $('text-swatches').style.pointerEvents = 'auto';
        heading.classList.remove('disabled-text');
        if (textHeading) textHeading.classList.remove('disabled-text');
        badge.style.display = 'none';
        if (textBadge) textBadge.style.display = 'none';
        $('shield-heading').textContent = '3. Escudo del equipo (Impresión a todo color)';
    } else {
        swatches.classList.add('disabled');
        swatches.style.opacity = '0.4';
        swatches.style.pointerEvents = 'none';
        $('text-swatches').style.opacity = '0.4';
        $('text-swatches').style.pointerEvents = 'none';
        heading.classList.add('disabled-text');
        if (textHeading) textHeading.classList.add('disabled-text');
        badge.style.display = 'inline-block';
        if (textBadge) textBadge.style.display = 'inline-block';
        $('shield-heading').textContent = '3. Escudo del equipo (Grabado sin color)';
        if (state.baseColor !== 'original') {
            swatches.querySelector('[data-color="original"]').click();
        }
    }
    drawShield();
    drawText();
});

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

// Escudo
function handleShieldFile(file) {
    if (!file) return;
    if (file.type !== 'image/png') {
        toast('Solo se permiten imágenes en formato PNG.');
        return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
        state.shieldFile = file;
        state.shieldImage = img;
        decals.shield.enabled = true;
        drawShield();
        buildDecal('shield');
        setActiveTarget('shield');

        $('shield-thumb').src = url;
        $('shield-thumb').hidden = false;
        if ($('upload-icon')) $('upload-icon').style.display = 'none';
        $('upload-text').textContent = 'Cambiar imagen';
        $('shield-tools').hidden = false;
        $('shield-remove').hidden = false;
        toast('¡Escudo estampado! Tocá la sandalia para moverlo.');
    };
    img.onerror = () => toast('No pudimos leer esa imagen. Asegurate de que sea un PNG válido.');
    img.src = url;
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

$('remove-white').addEventListener('change', (e) => {
    state.removeWhite = e.target.checked;
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

$('shield-remove').addEventListener('click', () => {
    state.shieldFile = null;
    state.shieldImage = null;
    decals.shield.enabled = false;
    buildDecal('shield');
    $('shield-upload').value = '';
    $('shield-thumb').hidden = true;
    if ($('upload-icon')) $('upload-icon').style.display = '';
    $('upload-text').textContent = 'Subir PNG';
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
        '¡Hola Finnta! 👋 Quiero encargar mi par personalizado:',
        '',
        name ? `👤 Nombre: ${name}` : null,
        `👟 Talle: ${size}`,
        `📦 Cantidad: ${state.quantity === 'mayorista' ? '100 pares o más' : 'Menos de 100 pares'}`,
        `🎨 Color de la tira: ${state.baseName}`,
        `🛡️ Escudo: ${state.shieldFile ? `Sí (grabado)` : 'Sin escudo'}`,
        `🔤 Texto: ${text ? `${text} (color ${state.textColorName})` : 'Sin texto'}`,
        `💰 Precio estimado: ${PRICE_LABEL}`,
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
    const waText = `${message}\n\n(📎 Se descargó "finnta-mi-diseno.png", adjuntala en este chat${state.shieldFile ? ' junto con tu escudo' : ''})`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waText)}`, '_blank', 'noopener');
    toast('Se descargó tu diseño: adjuntalo en el chat de WhatsApp 📎');
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
