import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const WHATSAPP_NUMBER = '5491155622736';
const MODEL_URL = 'Sin_nombre.glb';
const PRICE_LABEL = '$25.000 ARS';
const DECAL_DEPTH = 0.12;
const TEXT_CANVAS = { w: 1024, h: 384 };

const $ = (id) => document.getElementById(id);
const canvas = $('customizer-canvas');
const stage = $('preview-stage');
if (!canvas || !stage) throw new Error('Customizer: falta el canvas');

const loaderEl = $('stage-loader');
const loaderText = $('stage-loader-text');
const hintTarget = $('hint-target');
const toastEl = $('toast');

const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
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

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.ShadowMaterial({ opacity: 0.16 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

let sandal = null;
let baseMat = null;
let originalMap = null;
let modelBox = null;
let toe = new THREE.Vector3(1, 0, 0);
let homeView = null;
let activeTarget = 'shield';

const state = {
    quantity: 'minorista',
    quantityNum: 1,
    baseColor: '#181818',
    baseName: 'Negro',
    text: '',
    textColor: '#111111',
    textColorName: 'Negro',
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
        roughness: 0.5,
        metalness: 0,
    });
}

const textCanvas = document.createElement('canvas');
textCanvas.width = TEXT_CANVAS.w;
textCanvas.height = TEXT_CANVAS.h;
const textTexture = new THREE.CanvasTexture(textCanvas);
textTexture.colorSpace = THREE.SRGBColorSpace;

const shieldCanvas = document.createElement('canvas');
shieldCanvas.width = shieldCanvas.height = 1024;
const shieldTexture = new THREE.CanvasTexture(shieldCanvas);
shieldTexture.colorSpace = THREE.SRGBColorSpace;

const decals = {
    shield: {
        mesh: null, point: null, normal: null,
        baseSize: 0.32, scale: 1.2, rot: 0, aspect: 1,
        enabled: false, material: makeDecalMaterial(shieldTexture),
    },
    text: {
        mesh: null, point: null, normal: null,
        baseSize: 0.36, scale: 1, rot: 0, aspect: TEXT_CANVAS.h / TEXT_CANVAS.w,
        enabled: false, material: makeDecalMaterial(textTexture),
    },
};

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

    toe = new THREE.Vector3(Math.sign(center) || 1, 0, 0);
    return { center, length: Math.max(maxX - minX, 0.2), cz };
}

function surfaceAt(x, z) {
    const h = castDown(x, z);
    if (!h) return null;
    const n = smoothNormal(h.point, worldFaceNormal(h, V_Y));
    return { point: h.point.clone(), normal: n };
}

function orientationFor(normal, rotDeg) {
    const z = normal.clone().normalize();

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
        if (tmp.normalize().dot(normal) < 0.02) continue;
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
    const depth = Math.max(DECAL_DEPTH, w * 0.45);
    const size = new THREE.Vector3(w, w * d.aspect, depth);
    const raw = new DecalGeometry(sandal, d.point, orientationFor(d.normal, d.rot), size);
    const geo = keepFacing(raw, d.normal);
    raw.dispose();

    d.mesh = new THREE.Mesh(geo, d.material);
    d.mesh.renderOrder = key === 'text' ? 3 : 2;
    scene.add(d.mesh);
}

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

        ctx.lineWidth = fs * 0.07;
        if (state.quantity === 'minorista') {
            ctx.fillStyle = '#111111';
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
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

function drawShield() {
    const img = state.shieldImage;
    const S = shieldCanvas.width;
    const ctx = shieldCanvas.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, S, S);

    if (!img) {
        decals.shield.enabled = false;
        shieldTexture.needsUpdate = true;
        return;
    }

    const pad = S * 0.04;
    const scale = Math.min((S - 2 * pad) / img.width, (S - 2 * pad) / img.height);
    const w = img.width * scale, h = img.height * scale;
    decals.shield.aspect = 1;
    ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);

    if (state.removeWhite) {
        removeWhiteBackground(ctx, S, S);
    }

    if (state.quantity === 'minorista') {
        const data2 = ctx.getImageData(0, 0, S, S);
        const p2 = data2.data;

        let opaqueCount = 0;
        let totalLum = 0;
        let hasAlpha = false;
        for (let i = 0; i < p2.length; i += 16) {
            const a = p2[i + 3];
            if (a < 20) {
                hasAlpha = true;
            } else {
                opaqueCount++;
                totalLum += 0.299 * p2[i] + 0.587 * p2[i + 1] + 0.114 * p2[i + 2];
            }
        }
        const avgOpaqueLum = opaqueCount > 0 ? (totalLum / opaqueCount) : 128;

        const invertLum = !hasAlpha || avgOpaqueLum < 160;

        for (let i = 0; i < p2.length; i += 4) {
            const a = p2[i + 3];
            if (a > 0) {
                const lum = 0.299 * p2[i] + 0.587 * p2[i + 1] + 0.114 * p2[i + 2];
                const intensity = invertLum ? Math.max(0, 1 - (lum / 255)) : Math.min(1, Math.max(0.25, lum / 255));
                p2[i + 3] = a * Math.pow(intensity, 1.2);

                p2[i] = 194;
                p2[i + 1] = 194;
                p2[i + 2] = 194;
            }
        }
        ctx.putImageData(data2, 0, 0);
    }

    shieldTexture.needsUpdate = true;
}

function applyBaseColor() {
    if (!baseMat) return;
    const isMayorista = state.quantity === 'mayorista';

    let actualHex = state.baseColor;
    if (!isMayorista) {

        actualHex = '#181818';
        state.baseColor = '#181818';
        state.baseName = 'Negro';
        baseMat.color.set(0x181818);
    } else if (state.baseColor === 'original' || state.baseColor === '#181818' || state.baseColor === '#141414') {
        actualHex = '#181818';
        state.baseColor = '#181818';
        state.baseName = 'Negro';
        baseMat.color.set(0x181818);
    } else if (state.baseColor === '#F5F5F5' || state.baseColor === 'white' || state.baseColor === '#ffffff') {
        actualHex = '#F5F5F5';
        state.baseColor = '#F5F5F5';
        state.baseName = 'Blanca';
        baseMat.color.set(0xF5F5F5);
    } else if (state.baseColor === '#D4AF37') {
        actualHex = '#D4AF37';
        state.baseColor = '#D4AF37';
        state.baseName = 'Dorado Metálico';
        baseMat.color.set(0xD4AF37);
    } else {
        baseMat.color.set(state.baseColor);
    }
    baseMat.needsUpdate = true;

    const statusDot = $('wheel-status-dot');
    const statusName = $('wheel-status-name');
    const previewSwatch = $('wheel-preview-swatch');
    const previewHex = $('wheel-preview-hex');
    if (statusDot) statusDot.style.backgroundColor = actualHex;
    if (statusName) statusName.textContent = state.baseName || actualHex;
    if (previewSwatch) previewSwatch.style.backgroundColor = actualHex;
    if (previewHex) previewHex.textContent = (actualHex.startsWith('#') ? actualHex : '#181818').toUpperCase();
}

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

const handleStudioOpen = () => {
    controls.autoRotate = false;
    setTimeout(() => {
        resize();
        goHome();
    }, 60);
};
window.addEventListener('fintta:studio-open', handleStudioOpen);
window.addEventListener('finnta:studio-open', handleStudioOpen);

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

        sandal = strapMesh;

        scene.add(gltf.scene);
        gltf.scene.updateMatrixWorld(true);

        soleMesh.material = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9,
            metalness: 0.0
        });

        baseMat = new THREE.MeshStandardMaterial({
            color: 0x181818,
            roughness: 0.7,
            metalness: 0.0
        });
        strapMesh.material = baseMat;
        originalMap = null;

        addSoleHeelLogos(gltf.scene);

        modelBox = new THREE.Box3().setFromObject(gltf.scene);
        floor.position.y = modelBox.min.y - 0.002;

        loaderText.textContent = 'Preparando la tira para estampar…';
        await new Promise((r) => requestAnimationFrame(r));

        const strap = analyzeStrap();
        updateDecalPositions(strap);

        decals.shield.baseSize = THREE.MathUtils.clamp(strap.length * 0.60, 0.25, 0.45);
        if ($('shield-size')) {
            decals.shield.scale = parseFloat($('shield-size').value) || 1.2;
        }
        const width = modelBox.max.z - modelBox.min.z;
        decals.text.baseSize = THREE.MathUtils.clamp(width * 0.55, 0.22, 0.42);

        homeView = computeHomeView();
        goHome();

        try { await document.fonts.load('900 100px Outfit'); } catch (e) {  }
        drawShield();
        drawText();
        buildDecal('shield');
        buildDecal('text');
        applyBaseColor();

        loaderEl.classList.add('hidden');
        const realLoader = window.FinttaRealLoader || window.FinntaRealLoader;
        if (realLoader) {
            realLoader.onModelReady();
        }
    },
    (xhr) => {
        if (xhr.total) {
            const ratio = xhr.loaded / xhr.total;
            loaderText.textContent = `Cargando tu sandalia 3D… ${Math.round(ratio * 100)}%`;
            const realLoader = window.FinttaRealLoader || window.FinntaRealLoader;
            if (realLoader) {
                realLoader.onModelProgress(ratio);
            }
        }
    },
    (err) => {
        console.error(err);
        showLoaderError('No se pudo cargar el modelo 3D. Abrí la página con un servidor local (ej: Live Server).');
        const realLoader = window.FinttaRealLoader || window.FinntaRealLoader;
        if (realLoader) {
            realLoader.onModelReady();
        }
    }
);

function showLoaderError(msg) {
    loaderEl.classList.add('error');
    loaderText.textContent = msg;
}

let onScreen = true;
new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }).observe(stage);
renderer.setAnimationLoop(() => {
    if (!onScreen) return;
    controls.update();
    renderer.render(scene, camera);
});

let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
    if (!downAt || !sandal) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return;

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
    if (state.quantity !== 'mayorista' && color !== '#181818' && color !== 'original' && color !== '#141414') {
        toast('Con menos de 100 unidades la tira es en Negro oficial. Para otros colores elegí 100 pares o más.');
        return;
    }
    state.baseColor = color;
    state.baseName = name;
    const baseNameEl = $('base-name');
    if (baseNameEl) baseNameEl.textContent = name;
    applyBaseColor();
    drawShield();
    drawText();
    
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

                    const f = (n, k = (n + hue / 60) % 6) => 1 - sat * Math.max(Math.min(k, 4 - k, 1), 0);
                    data[idx] = Math.round(f(5) * 255);
                    data[idx + 1] = Math.round(f(3) * 255);
                    data[idx + 2] = Math.round(f(1) * 255);

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

        const angle = curHue * Math.PI / 180;
        const dist = curSat * RADIUS;
        const kx = RADIUS + Math.cos(angle) * dist;
        const ky = RADIUS + Math.sin(angle) * dist;
        knob.style.left = `${kx}px`;
        knob.style.top = `${ky}px`;
        knob.style.backgroundColor = hex;

        if (previewSwatch) previewSwatch.style.backgroundColor = hex;
        if (previewHex) previewHex.textContent = hex.toUpperCase();

        const statusDot = $('wheel-status-dot');
        const statusName = $('wheel-status-name');
        if (statusDot) statusDot.style.backgroundColor = hex;
        if (statusName) statusName.textContent = customName || state.baseName || hex.toUpperCase();

        if (brightnessSlider) {
            brightnessSlider.style.background = `linear-gradient(to right, #000000, ${pureHueSat})`;
            brightnessSlider.value = Math.round(curVal * 100);
        }
        if (brightnessVal) {
            brightnessVal.textContent = `${Math.round(curVal * 100)}%`;
        }

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
        if (heading) {
            heading.classList.remove('disabled-text');
            heading.textContent = 'Color de tira';
        }
        if (shieldHeading) shieldHeading.textContent = 'Escudo de tu club';

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

        if (mobileBtn) {
            mobileBtn.classList.remove('locked');
            if (badgeText) badgeText.textContent = 'Personalizar';
            if (badgeIcon) badgeIcon.style.display = 'inline-block';
        }
    } else {

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
        if (heading) {
            heading.classList.remove('disabled-text');
            heading.textContent = 'Color de tira';
        }
        if (shieldHeading) shieldHeading.textContent = 'Escudo de tu club';

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

        state.baseColor = '#181818';
        state.baseName = 'Negro';
        if (swatches) {
            const activeSwatch = swatches.querySelector('[data-color="#181818"]') || swatches.querySelector('.color-swatch');
            if (activeSwatch) {
                swatches.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                activeSwatch.classList.add('active');
            }
        }

        state.textColor = '#111111';
        state.textColorName = 'Negro';
        if (textSwatches) {
            const blackSwatch = textSwatches.querySelector('[data-color="#111111"]') || textSwatches.querySelector('.color-swatch');
            if (blackSwatch) {
                textSwatches.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                blackSwatch.classList.add('active');
            }
            const wrapper = textSwatches.querySelector('.color-picker-wrapper');
            if (wrapper) wrapper.classList.remove('active');
        }
    }

    applyBaseColor();
    drawShield();
    drawText();
}

function initQuantityController() {
    const qtyInput = $('qty-input');
    const qtySlider = $('qty-slider');
    const qtyMinus = $('qty-minus');
    const qtyPlus = $('qty-plus');
    const qtyChips = document.querySelectorAll('.qty-chip');
    const scalePoints = document.querySelectorAll('.qty-slider-scale .scale-point');
    const tierStatus = $('qty-tier-status');
    const tierBadge = $('tier-pill-badge');
    const tierRule = $('tier-color-rule');
    const tierDesc = $('tier-status-desc');
    const orderQtySelect = $('order-qty');

    function setQuantity(val) {
        val = parseInt(val, 10);
        if (isNaN(val) || val < 1) val = 1;
        if (val > 3000) val = 3000;

        state.quantityNum = val;
        const isMayorista = val >= 100;
        state.quantity = isMayorista ? 'mayorista' : 'minorista';

        if (qtyInput && parseInt(qtyInput.value, 10) !== val) {
            qtyInput.value = val;
        }
        if (qtySlider && parseInt(qtySlider.value, 10) !== val) {
            qtySlider.value = val;
        }

        if (qtySlider) {
            const pct = ((val - 1) / (3000 - 1)) * 100;
            qtySlider.style.setProperty('--slider-pct', `${pct}%`);
        }

        const unitTag = $('qty-unit-tag');
        if (unitTag) {
            unitTag.textContent = val === 1 ? 'par' : 'pares';
        }

        if (tierBadge) {
            tierBadge.className = `qty-clean-badge ${isMayorista ? 'mayorista' : 'minorista'}`;
            tierBadge.innerHTML = isMayorista ? '✦ Mayorista (+100)' : 'Minorista (&lt; 100)';
        }

        if (orderQtySelect) {
            orderQtySelect.value = state.quantity;
        }

        updateQuantityMode(isMayorista);
    }

    if (qtySlider) {
        qtySlider.addEventListener('input', (e) => setQuantity(e.target.value));
    }

    if (qtyInput) {
        qtyInput.addEventListener('input', (e) => {
            if (e.target.value === '') return;
            setQuantity(e.target.value);
        });
        qtyInput.addEventListener('blur', (e) => {
            setQuantity(e.target.value || 1);
        });
    }

    if (qtyMinus) {
        qtyMinus.addEventListener('click', () => {
            const current = state.quantityNum || 1;
            setQuantity(current - (current > 100 && current % 50 === 0 ? 50 : 1));
        });
    }

    if (qtyPlus) {
        qtyPlus.addEventListener('click', () => {
            const current = state.quantityNum || 1;
            setQuantity(current + (current >= 100 && current % 50 === 0 ? 50 : 1));
        });
    }

    qtyChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const val = parseInt(chip.dataset.qty, 10);
            if (!isNaN(val)) setQuantity(val);
        });
    });

    scalePoints.forEach(sp => {
        sp.addEventListener('click', () => {
            const val = parseInt(sp.dataset.val, 10);
            if (!isNaN(val)) setQuantity(val);
        });
    });

    window.setCustomizerQuantity = setQuantity;

    setQuantity(state.quantityNum || 1);
}

initQuantityController();

bindSwatches('text-swatches', (color, name) => {
    if (state.quantity === 'minorista' && color !== '#111111') {
        toast('El dorsal en otros colores está disponible a partir de 100 pares (Mayorista).');
        return;
    }
    state.textColor = color;
    state.textColorName = name;
    
    const wrapper = $('text-swatches').querySelector('.color-picker-wrapper');
    if (wrapper) wrapper.classList.remove('active');
    
    drawText();
});

$('text-color-picker').addEventListener('input', (e) => {
    if (state.quantity === 'minorista') {
        toast('El dorsal en color libre está disponible a partir de 100 pares (Mayorista).');
        return;
    }
    const wrap = $('text-swatches');
    wrap.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
    e.target.parentElement.classList.add('active');
    
    state.textColor = e.target.value;
    state.textColorName = "Personalizado";
    drawText();
});

function addSoleHeelLogos(rootScene) {
    const greyMat = new THREE.MeshStandardMaterial({
        color: 0xBFBFBF,
        roughness: 0.45,
        metalness: 0.08
    });

    function createMonogram() {
        const group = new THREE.Group();

        const p0 = new THREE.Vector3(-0.038, 0.025, 0);
        const p1 = new THREE.Vector3(0.015, 0.025, 0);
        const p2 = new THREE.Vector3(0.025, -0.025, 0);

        const curve = new THREE.CatmullRomCurve3([p0, p1, p2]);
        const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.0055, 12, false);
        const tubeMesh = new THREE.Mesh(tubeGeo, greyMat);
        tubeMesh.castShadow = true;
        group.add(tubeMesh);

        const ballGeo = new THREE.SphereGeometry(0.0065, 16, 16);
        const ballMesh = new THREE.Mesh(ballGeo, greyMat);
        ballMesh.position.set(-0.008, -0.002, 0);
        ballMesh.scale.set(1, 1, 0.5);
        ballMesh.castShadow = true;
        group.add(ballMesh);

        return group;
    }

    const outerLogo = createMonogram();
    outerLogo.position.set(0.67, -0.172, 0.222);
    outerLogo.rotation.set(0, 0.16, 0);
    rootScene.add(outerLogo);
}

function updateDecalPositions(strapInfo) {
    if (!sandal || !modelBox) return;
    const strap = strapInfo || analyzeStrap();
    const hasText = Boolean(state.text && state.text.trim());
    const shieldX = hasText ? (strap.center + toe.x * strap.length * 0.12) : strap.center;
    const textX = strap.center - toe.x * strap.length * 0.3;

    const s = surfaceAt(shieldX, strap.cz);
    if (s) Object.assign(decals.shield, s);
    const t = surfaceAt(textX, strap.cz);
    if (t) Object.assign(decals.text, t);
}

$('custom-text-input').addEventListener('input', (e) => {
    const wasEnabled = decals.text.enabled;
    const hadText = Boolean(state.text && state.text.trim());
    state.text = e.target.value;
    const nowHasText = Boolean(state.text && state.text.trim());

    if (hadText !== nowHasText) {
        updateDecalPositions();
        buildDecal('shield');
    }
    drawText();
    if (wasEnabled !== decals.text.enabled || hadText !== nowHasText) {
        buildDecal('text');
    }
    setActiveTarget(nowHasText ? 'text' : 'shield');
});

$('text-size').addEventListener('input', (e) => {
    decals.text.scale = parseFloat(e.target.value);
    buildDecal('text');
});

$('text-rot').addEventListener('input', (e) => {
    decals.text.rot = parseFloat(e.target.value);
    buildDecal('text');
});

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
                    const pngFileName = `${rawName}-fintta.png`;
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
        if ($('shield-size')) {
            decals.shield.scale = parseFloat($('shield-size').value) || 1.2;
        }
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
        downloadBlob(state.shieldFile, state.shieldFile.name || 'escudo-fintta.png');
        toast('Descargando el escudo oficial de tu club ⚽');
    });
}

$('shield-remove').addEventListener('click', () => {
    state.shieldFile = null;
    state.originalShieldFile = null;
    state.shieldImage = null;
    drawShield();
    buildDecal('shield');
    $('shield-upload').value = '';
    $('shield-thumb').hidden = true;
    if ($('upload-icon')) $('upload-icon').style.display = '';
    $('upload-text').textContent = 'Subir imagen o escudo';
    if ($('upload-subtext')) $('upload-subtext').textContent = 'JPG, PNG, WebP · Auto-conversión a PNG';
    if ($('png-badge')) $('png-badge').hidden = true;
    $('shield-tools').hidden = true;
    $('shield-remove').hidden = true;
    toast('Escudo eliminado. Tira limpia.');
});

function snapshotBlob() {

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
    const name = nameEl ? nameEl.value.trim() : '';

    const text = state.text.trim().toUpperCase();
    const lines = [
        '⚽ ¡Hola Fintta! Quiero encargar el pedido para mi equipo:',
        '',
        name ? `⚽ Solicitado por: ${name}` : null,
        `📋 Plantel / Cantidad: ${state.quantityNum || 1} ${state.quantityNum === 1 ? 'par' : 'pares'} (${state.quantity === 'mayorista' ? 'Mayorista / Club' : 'Minorista - Tira Negra'})`,
        `👟 Curva de talles: A coordinar por WhatsApp`,
        `🎽 Color de tira: ${state.baseName || 'Negro (Oficial)'}`,
        `⚽ Escudo del Club: ${state.shieldFile ? (state.quantity === 'minorista' ? 'Sí (Grabado en Gris oficial)' : 'Sí (A todo color)') : 'Logo oficial FINTTA (Grabado en Gris)'}`,
        `🔟 Dorsal: ${text ? `${text} (${state.quantity === 'minorista' ? 'Negro oficial' : (state.textColorName || 'Negro')})` : 'Sin dorsal'}`,
        `💵 Presupuesto unitario: ${PRICE_LABEL}`,
        '',
        'Te adjunto la vista previa 3D de mi diseño.',
    ].filter((l) => l !== null);
    const message = lines.join('\n');

    const orderBtn = $('order-btn');
    if (orderBtn) {
        orderBtn.style.pointerEvents = 'none';
        orderBtn.style.opacity = '0.7';
    }

    try {
        const blob = await snapshotBlob();

        downloadBlob(blob, 'fintta-mi-diseno.png');
        if (state.shieldFile) {
            setTimeout(() => downloadBlob(state.shieldFile, state.shieldFile.name || 'escudo-fintta.png'), 350);
        }

        if (navigator.clipboard && window.ClipboardItem) {
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
            } catch (_) {

            }
        }

        const waText = `${message}\n\n(📎 Te adjunto la foto de mi diseño "fintta-mi-diseno.png" que se guardó en mi galería${state.shieldFile ? ' y mi escudo' : ''})`;
        const waUrl = `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(waText)}`;

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                         (window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 1024);

        if (isMobile) {
            toast('¡Abriendo WhatsApp! Te guardamos la foto en la galería para adjuntarla 📸⚽');

            setTimeout(() => {
                window.location.href = waUrl;
            }, 400);
        } else {
            toast('Se descargó la ficha técnica de tu diseño: adjuntala en WhatsApp ⚽');
            const newWin = window.open(waUrl, '_blank', 'noopener');
            if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
                window.location.href = waUrl;
            }
        }
    } catch (err) {
        console.error('Error al procesar pedido para WhatsApp:', err);
        const fallbackUrl = `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
        window.location.href = fallbackUrl;
    } finally {
        setTimeout(() => {
            if (orderBtn) {
                orderBtn.style.pointerEvents = '';
                orderBtn.style.opacity = '';
            }
        }, 2500);
    }
});

let toastTimer = null;
function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}
