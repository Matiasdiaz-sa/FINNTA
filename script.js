// =========================================================================
// PANTALLA DE CARGA REAL FINNTA: PINTURA LÍQUIDA ULTRA FLUIDA (60/120 FPS)
// + APERTURA CINEMATOGRÁFICA DE VESTUARIO
// (Monitorea carga real de texturas, fuentes, ventana y modelo 3D)
// =========================================================================
window.FinntaRealLoader = (function () {
    const preloader = document.getElementById('finnta-preloader');
    if (!preloader) return { onModelProgress: () => {}, onModelReady: () => {} };

    const canvas = document.getElementById('preloader-fluid-canvas');
    const pctEl = document.getElementById('real-preloader-pct');
    const statusEl = document.getElementById('real-preloader-status');

    if (!canvas) return { onModelProgress: () => {}, onModelReady: () => {} };

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let animId = null;

    function resizeCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });

    // Estado real de recursos de fondo
    let fontReady = false;
    let imagesTotal = 0;
    let imagesLoaded = 0;
    let model3DProgress = 0; // 0.0 a 1.0
    let model3DReady = false;
    let windowLoaded = false;
    let isOpening = false;

    let targetPercent = 5;
    let currentPercent = 0;

    // 1. Fuentes tipográficas de Google Fonts
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            fontReady = true;
            recalculateRealProgress();
        }).catch(() => {
            fontReady = true;
            recalculateRealProgress();
        });
    } else {
        fontReady = true;
    }

    // 2. Texturas e imágenes críticas
    const criticalImages = [
        'sandalia_negra_perspectiva_1.png',
        'sandalia_color_perspectiva_1.png',
        'grass_texture.jpg',
        'imagenes/pelota_telstar_pro.png'
    ];
    imagesTotal = criticalImages.length;

    criticalImages.forEach((src) => {
        const img = new Image();
        let done = false;
        const markDone = () => {
            if (done) return;
            done = true;
            imagesLoaded++;
            recalculateRealProgress();
        };
        img.onload = img.onerror = markDone;
        img.src = src;
        if (img.complete) markDone();
    });

    // 3. Model-viewer del showcase
    const showcaseModel = document.getElementById('sandal-model');
    let showcaseReady = !showcaseModel;
    if (showcaseModel) {
        showcaseModel.addEventListener('load', () => {
            showcaseReady = true;
            recalculateRealProgress();
        }, { once: true });
        showcaseModel.addEventListener('error', () => {
            showcaseReady = true;
            recalculateRealProgress();
        }, { once: true });
    }

    // 4. Fin de carga del DOM y scripts
    if (document.readyState === 'complete') {
        windowLoaded = true;
    } else {
        window.addEventListener('load', () => {
            windowLoaded = true;
            recalculateRealProgress();
        }, { once: true });
    }

    function recalculateRealProgress() {
        if (isOpening) return;

        let realSum = 0;
        if (fontReady) realSum += 10;
        if (imagesTotal > 0) realSum += (imagesLoaded / imagesTotal) * 25;
        if (model3DReady) {
            realSum += 45;
        } else {
            realSum += model3DProgress * 45;
        }
        if (showcaseReady) realSum += 10;
        if (windowLoaded) realSum += 10;

        targetPercent = Math.min(100, Math.max(targetPercent, Math.round(realSum)));

        const isEverythingReady = fontReady &&
            (imagesLoaded >= imagesTotal) &&
            model3DReady &&
            showcaseReady &&
            windowLoaded;

        if (isEverythingReady) {
            targetPercent = 100;
        }
    }

    // --- Motor de Física de Fluidos (Pintura Líquida Ultra Fluida a 120 FPS) ---
    let time = 0;

    // Gotas de pintura que caen desde arriba
    const drops = [];
    let lastDropTime = 0;

    // Ondas y salpicaduras en la superficie
    const ripples = [];

    // Burbujas subiendo dentro de la pintura
    const bubbles = [];
    for (let i = 0; i < 24; i++) {
        bubbles.push({
            x: Math.random() * (window.innerWidth || 1200),
            y: Math.random() * (window.innerHeight || 800),
            radius: 2 + Math.random() * 4.5,
            speed: 0.6 + Math.random() * 1.4,
            wobble: Math.random() * Math.PI * 2,
            opacity: 0.25 + Math.random() * 0.45
        });
    }

    function updatePhysics(dt) {
        time += dt * 0.0022;

        // Suavizado ultra fluido del progreso real (Lerp orgánico)
        const diff = targetPercent - currentPercent;
        if (Math.abs(diff) < 0.05) {
            currentPercent = targetPercent;
        } else {
            currentPercent += diff * 0.075;
        }

        // Nivel de pintura en Y (de abajo hacia arriba)
        // 0% => height + 40 (abajo de la pantalla)
        // 100% => -30 (cubre totalmente la pantalla)
        const waterY = height - (height * (currentPercent / 100));

        // Spawneo de gotas de pintura líquida
        if (time - lastDropTime > 0.45 && currentPercent < 98) {
            lastDropTime = time;
            drops.push({
                x: width * 0.5 + (Math.random() - 0.5) * Math.min(width * 0.6, 360),
                y: -25,
                vy: 4 + Math.random() * 3,
                radius: 4 + Math.random() * 4,
                length: 14 + Math.random() * 10
            });
        }

        // Actualizar gotas de pintura
        for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            d.y += d.vy;
            d.vy += 0.38; // Gravedad

            // Si la gota choca con la superficie de la pintura
            if (d.y >= waterY) {
                // Dispara onda expansiva en la superficie
                ripples.push({
                    x: d.x,
                    radius: 0,
                    maxRadius: 180 + Math.random() * 80,
                    amp: 16 + Math.random() * 10,
                    speed: 4.8,
                    life: 1.0
                });
                drops.splice(i, 1);
            }
        }

        // Actualizar ondas expansivas (ripples)
        for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i];
            r.radius += r.speed;
            r.life -= 0.022;
            if (r.life <= 0 || r.radius >= r.maxRadius) {
                ripples.splice(i, 1);
            }
        }

        // Actualizar burbujas
        for (let i = 0; i < bubbles.length; i++) {
            const b = bubbles[i];
            b.y -= b.speed;
            b.wobble += 0.04;
            b.x += Math.sin(b.wobble) * 0.6;
            // Si supera la superficie de la pintura, reinicia abajo
            if (b.y < waterY) {
                b.y = height + 10;
                b.x = Math.random() * width;
            }
        }

        // Actualizar métricas en pantalla
        if (pctEl) pctEl.textContent = `${Math.round(currentPercent)}%`;

        if (statusEl) {
            if (currentPercent < 15) {
                statusEl.textContent = 'Armando el vestuario…';
            } else if (currentPercent < 35) {
                statusEl.textContent = 'Cargando tipografías de club…';
            } else if (currentPercent < 80) {
                if (!model3DReady && model3DProgress > 0) {
                    statusEl.textContent = `Descargando sandalia 3D (${Math.round(model3DProgress * 100)}%)…`;
                } else {
                    statusEl.textContent = 'Preparando texturas de césped y EVA…';
                }
            } else if (currentPercent < 99) {
                statusEl.textContent = 'Calibrando personalizador en la cancha…';
            } else {
                statusEl.textContent = '¡Cancha lista! Abriendo vestuario…';
            }
        }

        // Trigger de apertura cuando la pantalla se llenó de pintura 100%
        if (currentPercent >= 99.6 && targetPercent >= 100 && !isOpening) {
            triggerOpening();
        }

        return waterY;
    }

    function draw(waterY) {
        ctx.clearRect(0, 0, width, height);

        // Fondo oscuro de estadio
        ctx.fillStyle = '#050806';
        ctx.fillRect(0, 0, width, height);

        // Si la pintura aún no ha subido nada
        if (currentPercent <= 0) return;

        // 1. Capa de Olas Trasera (Profunda - Sombra esmeralda)
        ctx.fillStyle = 'rgba(16, 62, 22, 0.7)';
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += 10) {
            const y = waterY +
                Math.sin(x * 0.0035 + time * 1.8) * 18 +
                Math.cos(x * 0.007 + time * 1.2) * 10;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

        // 2. Capa de Olas Media (Verde cancha intenso)
        ctx.fillStyle = 'rgba(32, 126, 44, 0.88)';
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += 10) {
            const y = waterY +
                Math.sin(x * 0.0048 - time * 2.2 + 1.2) * 16 +
                Math.cos(x * 0.003 + time * 0.9) * 12;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

        // 3. Capa de Olas Frontal (Pintura verde neón con oleaje + ripples)
        const paintGrad = ctx.createLinearGradient(0, Math.max(0, waterY - 50), 0, height);
        paintGrad.addColorStop(0, '#4cf563');
        paintGrad.addColorStop(0.08, '#34B341');
        paintGrad.addColorStop(0.35, '#22842c');
        paintGrad.addColorStop(0.75, '#165e1f');
        paintGrad.addColorStop(1, '#0c3511');

        ctx.fillStyle = paintGrad;
        ctx.beginPath();
        ctx.moveTo(0, height);

        // Guardamos los puntos para la línea de brillo de la cresta
        const crestPoints = [];

        for (let x = 0; x <= width; x += 8) {
            let y = waterY +
                Math.sin(x * 0.0042 + time * 2.6 + 2.8) * 20 +
                Math.sin(x * 0.008 + time * 3.4) * 8;

            // Perturbaciones orgánicas de los ripples de gotas
            for (let j = 0; j < ripples.length; j++) {
                const r = ripples[j];
                const dist = Math.abs(x - r.x);
                if (dist < r.radius) {
                    const wavePhase = (dist - r.radius) * 0.08;
                    y += Math.sin(wavePhase) * r.amp * r.life;
                }
            }

            crestPoints.push({ x, y });
            ctx.lineTo(x, y);
        }

        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

        // 4. Cresta luminosa de pintura húmeda (Specular gloss highlight)
        if (crestPoints.length > 1) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(crestPoints[0].x, crestPoints[0].y);
            for (let i = 1; i < crestPoints.length; i++) {
                ctx.lineTo(crestPoints[i].x, crestPoints[i].y);
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.lineWidth = 2.8;
            ctx.shadowColor = '#4cf563';
            ctx.shadowBlur = 16;
            ctx.stroke();
            ctx.restore();
        }

        // 5. Gotas de pintura cayendo
        for (let i = 0; i < drops.length; i++) {
            const d = drops[i];
            ctx.save();
            ctx.fillStyle = '#4cf563';
            ctx.shadowColor = '#4cf563';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.ellipse(d.x, d.y, d.radius, d.length, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // 6. Burbujas subiendo en la pintura
        for (let i = 0; i < bubbles.length; i++) {
            const b = bubbles[i];
            if (b.y > waterY) {
                ctx.save();
                ctx.fillStyle = `rgba(164, 255, 177, ${b.opacity})`;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }

    let lastTime = performance.now();
    function loop(now) {
        const dt = Math.min(now - lastTime, 35);
        lastTime = now;

        const waterY = updatePhysics(dt);
        draw(waterY);

        if (!isOpening || currentPercent < 100) {
            animId = requestAnimationFrame(loop);
        }
    }
    animId = requestAnimationFrame(loop);

    function triggerOpening() {
        if (isOpening) return;
        isOpening = true;

        currentPercent = 100;
        preloader.classList.add('preloader-filled');

        // Pausa breve para apreciar la pantalla 100% llena de pintura
        setTimeout(() => {
            // Se abren las cortinas hacia los laterales como la salida a la cancha
            preloader.classList.add('preloader-opening');

            setTimeout(() => {
                preloader.style.display = 'none';
                if (animId) cancelAnimationFrame(animId);
            }, 840);
        }, 340);
    }

    // Timeout de seguridad de 8s (por si una red corta o bloqueador frena un CDN externo)
    setTimeout(() => {
        if (!isOpening) {
            fontReady = true;
            model3DReady = true;
            showcaseReady = true;
            windowLoaded = true;
            imagesLoaded = imagesTotal;
            targetPercent = 100;
            triggerOpening();
        }
    }, 8000);

    return {
        onModelProgress(ratio) {
            model3DProgress = Math.min(1, Math.max(0, ratio));
            recalculateRealProgress();
        },
        onModelReady() {
            model3DReady = true;
            model3DProgress = 1;
            recalculateRealProgress();
        }
    };
})();

// --- Efecto Fluido Submarino (Estela de Agua Hidrodinámica & Impulso Elástico de Click Suave) ---
(function initLiquidCursor() {
    const stage = document.getElementById('hero-liquid-stage');
    const blobPath = document.getElementById('liquid-cursor-blob');
    const splashesGroup = document.getElementById('liquid-paint-splashes');
    const canvas = document.getElementById('liquid-ripple-canvas');

    if (!stage || !blobPath || !canvas) return;
    if (splashesGroup) splashesGroup.innerHTML = '';

    const ctx = canvas.getContext('2d');

    let width = stage.clientWidth;
    let height = stage.clientHeight;

    function resizeCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = stage.clientWidth;
        height = stage.clientHeight;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });

    // Estado del cursor
    let isHovering = false;
    let targetX = width * 0.5;
    let targetY = height * 0.5;
    let smoothX = targetX;
    let smoothY = targetY;
    let velX = 0;
    let velY = 0;
    let currentAlpha = 0;

    // Tamaño controlado
    const MIN_RADIUS = 46;   // Radio en reposo
    const MAX_RADIUS = 105;  // Radio máximo de empuje frontal
    let currentRadius = MIN_RADIUS;

    // Impulso físico de click (resorte elástico suave, sin cortes abruptos ni expansiones descomunales)
    let clickBoost = 0;
    let clickBoostVel = 0;

    function triggerClickSplash() {
        // Impulso suave y controlado de splash al hacer click (máximo +24px)
        clickBoostVel = Math.min(clickBoostVel + 20, 28);
    }

    // Columna vertebral (Spine) para la estela de agua hidrodinámica (5 articulaciones)
    const spine = [
        { x: targetX, y: targetY },
        { x: targetX, y: targetY },
        { x: targetX, y: targetY },
        { x: targetX, y: targetY },
        { x: targetX, y: targetY }
    ];

    const followRates = [0, 0.42, 0.36, 0.30, 0.25];

    // Movimiento del cursor
    function onMove(clientX, clientY) {
        const rect = stage.getBoundingClientRect();
        targetX = clientX - rect.left;
        targetY = clientY - rect.top;
        isHovering = true;
    }

    stage.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    stage.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches[0]) {
            onMove(e.touches[0].clientX, e.touches[0].clientY);
        }
    }, { passive: true });

    // Clic o toque: Salpicadura líquida elástica que se expande con medida y regresa suavemente
    stage.addEventListener('pointerdown', (e) => {
        const rect = stage.getBoundingClientRect();
        targetX = e.clientX - rect.left;
        targetY = e.clientY - rect.top;
        isHovering = true;

        if (Math.hypot(targetX - smoothX, targetY - smoothY) > 60) {
            smoothX = targetX;
            smoothY = targetY;
            for (let i = 0; i < spine.length; i++) {
                spine[i].x = targetX;
                spine[i].y = targetY;
            }
        }
        triggerClickSplash();
    });

    stage.addEventListener('mouseenter', () => { isHovering = true; });
    stage.addEventListener('mouseleave', () => { isHovering = false; });
    stage.addEventListener('touchend', () => { isHovering = false; });

    // Generador geométrico de estela de agua (Empuje frontal y cola que converge)
    function buildWaterWakePath(points, radii, alpha, now) {
        if (alpha <= 0.01) return '';

        const p0 = points[0];
        const pEnd = points[points.length - 1];
        const wakeDist = Math.hypot(p0.x - pEnd.x, p0.y - pEnd.y);
        const wavePulse = Math.sin(now * 0.003) * 2;
        const r0 = (radii[0] + wavePulse) * alpha;

        if (r0 <= 1) return '';

        // Si está quieto o casi quieto: gota circular perfecta en reposo
        if (wakeDist < 2.5) {
            const rx = r0.toFixed(1);
            return `M ${(p0.x - r0).toFixed(1)} ${p0.y.toFixed(1)} a ${rx} ${rx} 0 1 0 ${(r0 * 2).toFixed(1)} 0 a ${rx} ${rx} 0 1 0 ${(-r0 * 2).toFixed(1)} 0 Z`;
        }

        const n = points.length;
        const leftPoints = [];
        const rightPoints = [];
        const tangents = [];

        for (let i = 0; i < n; i++) {
            let tx = 0, ty = 0;
            if (i === 0) {
                tx = points[0].x - points[1].x;
                ty = points[0].y - points[1].y;
            } else if (i === n - 1) {
                tx = points[i - 1].x - points[i].x;
                ty = points[i - 1].y - points[i].y;
            } else {
                tx = points[i - 1].x - points[i + 1].x;
                ty = points[i - 1].y - points[i + 1].y;
            }

            const len = Math.hypot(tx, ty) || 1;
            tx /= len;
            ty /= len;
            tangents.push({ tx, ty });

            // Normal perpendicular a la dirección del movimiento
            const nx = -ty;
            const ny = tx;
            const r = radii[i] * alpha;

            leftPoints.push({ x: points[i].x + nx * r, y: points[i].y + ny * r });
            rightPoints.push({ x: points[i].x - nx * r, y: points[i].y - ny * r });
        }

        const t0 = tangents[0];
        const tEnd = tangents[n - 1];

        // 1. Frente de la estela ("El Empuje"): proa hidrodinámica curvada hacia adelante
        const bowExtension = r0 * 0.85;
        const bowX = p0.x + t0.tx * bowExtension;
        const bowY = p0.y + t0.ty * bowExtension;

        const rR0 = rightPoints[0];
        const rL0 = leftPoints[0];

        let d = `M ${rR0.x.toFixed(1)} ${rR0.y.toFixed(1)}`;

        // Curva convexa de proa desde hombro derecho a punta del empuje
        const cp1x = rR0.x + t0.tx * (r0 * 0.65);
        const cp1y = rR0.y + t0.ty * (r0 * 0.65);
        const cp2x = bowX - t0.ty * (r0 * 0.4);
        const cp2y = bowY + t0.tx * (r0 * 0.4);
        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${bowX.toFixed(1)} ${bowY.toFixed(1)}`;

        // Curva desde punta del empuje a hombro izquierdo
        const cp3x = bowX + t0.ty * (r0 * 0.4);
        const cp3y = bowY - t0.tx * (r0 * 0.4);
        const cp4x = rL0.x + t0.tx * (r0 * 0.65);
        const cp4y = rL0.y + t0.ty * (r0 * 0.65);
        d += ` C ${cp3x.toFixed(1)} ${cp3y.toFixed(1)}, ${cp4x.toFixed(1)} ${cp4y.toFixed(1)}, ${rL0.x.toFixed(1)} ${rL0.y.toFixed(1)}`;

        // 2. Flanco izquierdo: estela que se va estrechando hacia atrás
        for (let i = 0; i < n - 1; i++) {
            const midX = (leftPoints[i].x + leftPoints[i + 1].x) * 0.5;
            const midY = (leftPoints[i].y + leftPoints[i + 1].y) * 0.5;
            d += ` Q ${leftPoints[i].x.toFixed(1)} ${leftPoints[i].y.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)}`;
        }

        // 3. Cola trasera de la estela ("Atrás se va uniendo"): punto donde converge el flujo de agua
        const rTail = radii[n - 1] * alpha;
        const tailTipX = pEnd.x - tEnd.tx * (rTail * 0.9);
        const tailTipY = pEnd.y - tEnd.ty * (rTail * 0.9);
        const lastL = leftPoints[n - 1];
        d += ` Q ${lastL.x.toFixed(1)} ${lastL.y.toFixed(1)}, ${tailTipX.toFixed(1)} ${tailTipY.toFixed(1)}`;

        // 4. Flanco derecho: retorno cerrando el flujo hacia el empuje frontal
        const lastR = rightPoints[n - 1];
        d += ` Q ${lastR.x.toFixed(1)} ${lastR.y.toFixed(1)}, ${((lastR.x + rightPoints[n - 2].x) * 0.5).toFixed(1)} ${((lastR.y + rightPoints[n - 2].y) * 0.5).toFixed(1)}`;

        for (let i = n - 2; i > 0; i--) {
            const midX = (rightPoints[i].x + rightPoints[i - 1].x) * 0.5;
            const midY = (rightPoints[i].y + rightPoints[i - 1].y) * 0.5;
            d += ` Q ${rightPoints[i].x.toFixed(1)} ${rightPoints[i].y.toFixed(1)}, ${midX.toFixed(1)} ${midY.toFixed(1)}`;
        }

        d += ` Q ${rR0.x.toFixed(1)} ${rR0.y.toFixed(1)}, ${rR0.x.toFixed(1)} ${rR0.y.toFixed(1)} Z`;

        return d;
    }

    let lastTime = performance.now();

    function render(now) {
        const dt = Math.min((now - lastTime) / 1000, 0.033);
        lastTime = now;

        // 1. Inercia y seguimiento de la cabeza (Bow / Empuje)
        const targetAlpha = isHovering ? 1.0 : 0.0;
        currentAlpha += (targetAlpha - currentAlpha) * 0.12;

        const dx = targetX - smoothX;
        const dy = targetY - smoothY;
        velX = dx * 0.28;
        velY = dy * 0.28;
        smoothX += velX;
        smoothY += velY;

        spine[0].x = smoothX;
        spine[0].y = smoothY;

        const currentSpeed = Math.hypot(velX, velY);

        // 2. Transmisión del movimiento a lo largo de la columna vertebral (Spine)
        for (let i = 1; i < spine.length; i++) {
            const prev = spine[i - 1];
            const curr = spine[i];
            const rate = currentSpeed < 1.2 ? 0.48 : followRates[i];
            curr.x += (prev.x - curr.x) * rate;
            curr.y += (prev.y - curr.y) * rate;
        }

        // 3. Físicas del impulso de click (Oscilador elástico amortiguado: retorno suave y continuo sin corte abrupto)
        const springK = 0.18;
        const damping = 0.80;
        clickBoostVel += -springK * clickBoost;
        clickBoostVel *= damping;
        clickBoost += clickBoostVel;
        if (Math.abs(clickBoost) < 0.08 && Math.abs(clickBoostVel) < 0.08) {
            clickBoost = 0;
            clickBoostVel = 0;
        }

        // 4. Tamaño y radios a lo largo de la estela
        const speedNorm = Math.min(currentSpeed * 0.038, 1.0);
        const dynamicTargetRadius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * Math.pow(speedNorm, 1.25);
        const radiusLerp = (dynamicTargetRadius < currentRadius) ? 0.28 : 0.12;
        currentRadius += (dynamicTargetRadius - currentRadius) * radiusLerp;

        const baseR = currentRadius + clickBoost;
        const radii = [
            baseR,                                                 // 0: Frente (Empuje)
            baseR * (0.86 - 0.06 * speedNorm),                     // 1: Hombro
            baseR * (0.64 - 0.10 * speedNorm),                     // 2: Cuerpo medio
            currentRadius * (0.42 - 0.12 * speedNorm),             // 3: Estela que se va uniendo
            currentRadius * Math.max(0.12, 0.24 - 0.12 * speedNorm)// 4: Punta de cierre
        ];

        // 5. Actualizar Path SVG de la estela hidrodinámica
        if (currentAlpha > 0.01) {
            const pathD = buildWaterWakePath(spine, radii, currentAlpha, now);
            blobPath.setAttribute('d', pathD);
        } else {
            blobPath.setAttribute('d', '');
        }

        // 6. Canvas limpio sin goteo
        ctx.clearRect(0, 0, width, height);

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
})();

// --- Manejo del Estudio de Personalización 3D (Desktop e Independiente en Móvil) ---
function openStudio() {
    const customizer = document.getElementById('personalizar');
    if (!customizer) return;

    if (window.innerWidth <= 768) {
        customizer.classList.add('studio-open');
        document.body.classList.add('studio-open');
        document.body.style.overflow = 'hidden';
        const divider = document.getElementById('edge-cutter-divider');
        if (divider) divider.classList.add('studio-hidden');
        // Forzar recalculo de dimensiones Three.js tras la animación de apertura
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
            window.dispatchEvent(new CustomEvent('finnta:studio-open'));
        }, 100);
    } else {
        customizer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function closeStudio() {
    const customizer = document.getElementById('personalizar');
    if (customizer) {
        customizer.classList.remove('studio-open');
    }
    document.body.classList.remove('studio-open');
    document.body.style.overflow = '';
    const divider = document.getElementById('edge-cutter-divider');
    if (divider) divider.classList.remove('studio-hidden');
}

// Escuchar todos los botones de acción para abrir el estudio
document.querySelectorAll('.cta-nav, .sequence-content .btn-primary, #btn-showcase-order, .btn-open-studio, #btn-open-studio-teaser').forEach((btn) => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        openStudio();
    });
});

// Botón de volver / cerrar estudio en móvil
const closeStudioBtn = document.getElementById('btn-close-studio');
if (closeStudioBtn) {
    closeStudioBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeStudio();
    });
}

// Abrir estudio automáticamente si la URL tiene #personalizar
if (window.location.hash === '#personalizar') {
    setTimeout(openStudio, 150);
}
window.addEventListener('hashchange', () => {
    if (window.location.hash === '#personalizar') {
        openStudio();
    }
});

// --- Lógica de Pasos Móvil (Estilo Nike By You) ---
function setupMobileCustomizerSteps() {
    const pillButtons = document.querySelectorAll('.mobile-steps-nav .step-pill-btn');
    const stepGroups = document.querySelectorAll('.customizer-controls .control-group');
    const nextButtons = document.querySelectorAll('.step-next-btn');
    const prevButtons = document.querySelectorAll('.step-prev-btn');

    function switchStep(targetStep) {
        if (!targetStep) return;

        const controls = document.querySelector('.customizer-controls');
        if (controls && controls.classList.contains('minorista-mode') && targetStep === 'color') {
            targetStep = 'shield';
        }

        // Actualizar píldoras
        pillButtons.forEach(btn => {
            const isMatch = btn.getAttribute('data-step') === targetStep;
            btn.classList.toggle('active', isMatch);
            if (isMatch) {
                btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        });

        // Actualizar grupos de controles
        stepGroups.forEach(grp => {
            const isMatch = grp.getAttribute('data-step') === targetStep;
            grp.classList.toggle('mobile-active-step', isMatch);
        });

        // Coordinar foco 3D en la sandalia según el paso
        if (targetStep === 'shield') {
            const shieldTargetBtn = document.getElementById('target-shield');
            if (shieldTargetBtn) shieldTargetBtn.click();
        } else if (targetStep === 'text') {
            const textTargetBtn = document.getElementById('target-text');
            if (textTargetBtn) textTargetBtn.click();
        }
    }

    window.switchCustomizerStep = switchStep;

    pillButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const step = btn.getAttribute('data-step');
            switchStep(step);
        });
    });

    nextButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const nextStep = btn.getAttribute('data-next');
            switchStep(nextStep);
        });
    });

    prevButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const prevStep = btn.getAttribute('data-prev');
            switchStep(prevStep);
        });
    });

    // Manejo interactivo de tarjetas de cantidad
    const qtyCards = document.querySelectorAll('.qty-card');
    const orderQtySelect = document.getElementById('order-qty');
    qtyCards.forEach(card => {
        card.addEventListener('click', () => {
            const val = card.getAttribute('data-qty');
            qtyCards.forEach(c => c.classList.toggle('active', c === card));
            if (orderQtySelect) {
                orderQtySelect.value = val;
                orderQtySelect.dispatchEvent(new Event('change'));
            }
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMobileCustomizerSteps);
} else {
    setupMobileCustomizerSteps();
}

// --- Showcase Interactivo 3D FINNTA ---
document.addEventListener("DOMContentLoaded", () => {
    const model = document.getElementById("sandal-model");
    if (!model) return;

    const featureTabs = document.querySelectorAll(".feature-tab-btn");
    const hotspots = document.querySelectorAll(".showcase-hotspot");
    const badgeEl = document.getElementById("feat-badge");
    const numberEl = document.getElementById("feat-number");
    const titleEl = document.getElementById("feat-title");
    const descEl = document.getElementById("feat-desc");
    const specsEl = document.getElementById("feat-specs");

    const featuresData = {
        sole: {
            number: "01 / 04",
            badge: "CONFORT POST-PARTIDO",
            title: "Plantilla Ergonómica con Memoria",
            desc: "Inyección de EVA ultra liviana con densidad calibrada para absorber el impacto en talón y metatarso. El arco anatómico acompaña la pisada y acelera la recuperación post-partido.",
            specs: [
                { k: "MATERIAL", v: "EVA Inyectada Pro" },
                { k: "BENEFICIO", v: "Descanso muscular inmediato" }
            ],
            orbit: "0deg 35deg 100%",
            target: "-0.22m 0.05m 0.0m"
        },
        strap: {
            number: "02 / 04",
            badge: "IDENTIDAD 100% OFICIAL",
            title: "Capellada Reforzada para Grabado",
            desc: "Banda anatómica de alta sujeción acolchada en el interior para cero rozaduras. Superficie frontal microtexturada para estampado térmico o grabado láser de alta definición con el escudo de tu club y tu número.",
            specs: [
                { k: "AJUSTE", v: "Banda anatómica acolchada" },
                { k: "PERSONALIZACIÓN", v: "Escudo + Nombre / Nº" }
            ],
            orbit: "45deg 65deg 100%",
            target: "0.12m 0.15m 0.0m"
        },
        grip: {
            number: "03 / 04",
            badge: "SEGURIDAD & AGARRE",
            title: "Suela Acanalada Antideslizante",
            desc: "Diseño de drenaje rápido pensado para vestuarios húmedos, duchas, natatorios y césped. Evita resbalones y garantiza tracción segura en cualquier superficie sin retener suciedad.",
            specs: [
                { k: "TRACCIÓN", v: "Grip multidireccional" },
                { k: "DURABILIDAD", v: "Goma resistente al desgaste" }
            ],
            orbit: "-135deg 120deg 110%",
            target: "0.0m -0.15m 0.0m"
        },
        all: {
            number: "04 / 04",
            badge: "VISTA COMPLETA 360°",
            title: "Explorá cada terminación",
            desc: "Arrastrá libremente con el dedo o el mouse para girar la sandalia en cualquier dirección. Acercate con el zoom y apreciá la calidad de fabricación nacional FINNTA.",
            specs: [
                { k: "CALIDAD", v: "Grado Deportivo A+" },
                { k: "TALLES", v: "Del 35/36 al 45/46" }
            ],
            orbit: "45deg 70deg 115%",
            target: "0m 0m 0m"
        }
    };

    function selectFeature(featureKey) {
        const data = featuresData[featureKey];
        if (!data) return;

        // 1. Actualizar Tabs
        featureTabs.forEach(tab => {
            const isActive = tab.getAttribute("data-feature") === featureKey;
            tab.classList.toggle("active", isActive);
            tab.setAttribute("aria-selected", isActive ? "true" : "false");
        });

        // 2. Actualizar Hotspots
        hotspots.forEach(hs => {
            const isActive = hs.getAttribute("data-feature") === featureKey;
            hs.classList.toggle("active", isActive);
        });

        // 3. Suave transición de textos
        if (titleEl && descEl) {
            titleEl.style.opacity = "0";
            descEl.style.opacity = "0";
            
            setTimeout(() => {
                if (numberEl) numberEl.textContent = data.number;
                if (badgeEl) badgeEl.textContent = data.badge;
                titleEl.textContent = data.title;
                descEl.textContent = data.desc;

                if (specsEl && data.specs) {
                    specsEl.innerHTML = data.specs.map(s => `
                        <div class="spec-box">
                            <span class="spec-k">${s.k}</span>
                            <span class="spec-v">${s.v}</span>
                        </div>
                    `).join("");
                }

                titleEl.style.opacity = "1";
                descEl.style.opacity = "1";
            }, 180);
        }

        // 4. Mover cámara del modelo 3D suavemente (con margen extra en mobile para no cortar la punta/tira)
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            let mobileOrbit = data.orbit;
            if (mobileOrbit.includes("100%")) {
                mobileOrbit = mobileOrbit.replace("100%", "125%");
            } else if (mobileOrbit.includes("110%")) {
                mobileOrbit = mobileOrbit.replace("110%", "130%");
            } else if (mobileOrbit.includes("115%")) {
                mobileOrbit = mobileOrbit.replace("115%", "132%");
            }
            model.cameraOrbit = mobileOrbit;
            model.cameraTarget = data.target;
        } else {
            model.cameraOrbit = data.orbit;
            model.cameraTarget = data.target;
        }
    }

    // Click en Tabs
    featureTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            const key = tab.getAttribute("data-feature");
            selectFeature(key);
        });
    });

    // Click en Hotspots 3D
    hotspots.forEach(hs => {
        hs.addEventListener("click", (e) => {
            e.stopPropagation();
            const key = hs.getAttribute("data-feature");
            selectFeature(key);
        });
    });
});

