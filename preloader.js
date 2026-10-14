// =========================================================================
// FINNTA: PANTALLA DE CARGA REAL DE PINTURA LÍQUIDA ULTRA FLUIDA (60/120 FPS)
// + APERTURA CINEMATOGRÁFICA DE VESTUARIO
// =========================================================================
(function () {
    const preloader = document.getElementById('finnta-preloader');
    if (!preloader) {
        window.FinntaRealLoader = { onModelProgress: () => {}, onModelReady: () => {} };
        return;
    }

    const canvas = document.getElementById('preloader-fluid-canvas');
    const pctEl = document.getElementById('real-preloader-pct');
    const statusEl = document.getElementById('real-preloader-status');

    if (!canvas) {
        window.FinntaRealLoader = { onModelProgress: () => {}, onModelReady: () => {} };
        return;
    }

    const ctx = canvas.getContext('2d');
    let width = window.innerWidth || 1200;
    let height = window.innerHeight || 800;
    let animId = null;

    function resizeCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = window.innerWidth || document.documentElement.clientWidth || 1200;
        height = window.innerHeight || document.documentElement.clientHeight || 800;
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });

    if (pctEl) pctEl.textContent = '2%';

    // Estado real de recursos
    let fontReady = false;
    let imagesTotal = 0;
    let imagesLoaded = 0;
    let model3DProgress = 0; // 0.0 a 1.0
    let model3DReady = false;
    let windowLoaded = false;
    let isOpening = false;

    // Progreso
    let currentPercent = 0;
    let targetPercent = 14; // Inicia inmediatamente para feedback visual instantáneo

    const startTime = performance.now();

    // 1. Fuentes tipográficas
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            fontReady = true;
            recalculateProgress();
        }).catch(() => {
            fontReady = true;
            recalculateProgress();
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
            recalculateProgress();
        };
        img.onload = img.onerror = markDone;
        img.src = src;
        if (img.complete) markDone();
    });

    // 3. Carga de la ventana
    if (document.readyState === 'complete') {
        windowLoaded = true;
    } else {
        window.addEventListener('load', () => {
            windowLoaded = true;
            recalculateProgress();
        }, { once: true });
    }

    function recalculateProgress() {
        if (isOpening) return;

        let realSum = 12; // Base inicial de inicio
        if (fontReady) realSum += 15;
        if (imagesTotal > 0) realSum += (imagesLoaded / imagesTotal) * 20;
        if (model3DReady) {
            realSum += 35;
        } else {
            realSum += (model3DProgress || 0) * 35;
        }
        if (windowLoaded) realSum += 18;

        // Curva temporal de progreso mínimo suave (para que NUNCA se congele en red lenta)
        const elapsed = (performance.now() - startTime) / 1000;
        let timeFloor = 14;
        if (elapsed > 0.05) timeFloor = Math.min(96, 14 + elapsed * 42);

        targetPercent = Math.min(100, Math.max(targetPercent, Math.round(realSum), Math.round(timeFloor)));

        const isEverythingReady = fontReady &&
            (imagesLoaded >= imagesTotal) &&
            model3DReady &&
            windowLoaded;

        if (isEverythingReady || targetPercent >= 99) {
            targetPercent = 100;
        }
    }

    // Actualizar progreso mínimo periódicamente
    const progressInterval = setInterval(() => {
        if (isOpening) {
            clearInterval(progressInterval);
            return;
        }
        recalculateProgress();
    }, 80);

    // Física de fluidos de pintura
    let time = 0;
    const drops = [];
    let lastDropTime = 0;
    const ripples = [];
    const bubbles = [];

    for (let i = 0; i < 24; i++) {
        bubbles.push({
            x: Math.random() * width,
            y: Math.random() * height,
            radius: 2 + Math.random() * 4.5,
            speed: 0.8 + Math.random() * 1.5,
            wobble: Math.random() * Math.PI * 2,
            opacity: 0.25 + Math.random() * 0.45
        });
    }

    function updatePhysics(dt) {
        time += dt * 0.0022;

        // Lerp ultra fluido hacia targetPercent
        const diff = targetPercent - currentPercent;
        if (Math.abs(diff) < 0.04) {
            currentPercent = targetPercent;
        } else {
            const speed = diff > 20 ? 0.095 : 0.075;
            currentPercent += diff * speed;
        }

        // Nivel de pintura en Y (de abajo hacia arriba)
        // 0% -> height + 20
        // 100% -> -40 (cubre totalmente la pantalla)
        const progressRatio = Math.max(0, Math.min(1, currentPercent / 100));
        const waterY = height - ((height + 60) * progressRatio) + 20;

        // Gotas de pintura líquida cayendo
        if (time - lastDropTime > 0.38 && currentPercent < 97) {
            lastDropTime = time;
            drops.push({
                x: width * 0.5 + (Math.random() - 0.5) * Math.min(width * 0.65, 420),
                y: -25,
                vy: 4.5 + Math.random() * 3.5,
                radius: 4 + Math.random() * 4,
                length: 15 + Math.random() * 10
            });
        }

        // Actualizar gotas
        for (let i = drops.length - 1; i >= 0; i--) {
            const d = drops[i];
            d.y += d.vy;
            d.vy += 0.42;

            if (d.y >= waterY) {
                ripples.push({
                    x: d.x,
                    radius: 0,
                    maxRadius: 180 + Math.random() * 80,
                    amp: 16 + Math.random() * 10,
                    speed: 5.2,
                    life: 1.0
                });
                drops.splice(i, 1);
            }
        }

        // Actualizar ondas
        for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i];
            r.radius += r.speed;
            r.life -= 0.024;
            if (r.life <= 0 || r.radius >= r.maxRadius) {
                ripples.splice(i, 1);
            }
        }

        // Actualizar burbujas
        for (let i = 0; i < bubbles.length; i++) {
            const b = bubbles[i];
            b.y -= b.speed;
            b.wobble += 0.045;
            b.x += Math.sin(b.wobble) * 0.65;
            if (b.y < waterY) {
                b.y = height + 10;
                b.x = Math.random() * width;
            }
        }

        // Actualizar métricas en pantalla
        const displayPct = Math.round(currentPercent);
        if (pctEl) pctEl.textContent = `${displayPct}%`;

        if (statusEl) {
            if (displayPct < 20) {
                statusEl.textContent = 'Iniciando vestuario…';
            } else if (displayPct < 45) {
                statusEl.textContent = 'Cargando tipografías y colores de club…';
            } else if (displayPct < 75) {
                statusEl.textContent = model3DReady
                    ? 'Texturas de césped y EVA listas…'
                    : 'Preparando sandalia 3D en la cancha…';
            } else if (displayPct < 99) {
                statusEl.textContent = 'Calibrando personalizador oficial…';
            } else {
                statusEl.textContent = '¡Cancha lista! Abriendo vestuario…';
            }
        }

        // Disparo de apertura cuando se llena 100%
        if (currentPercent >= 99.5 && targetPercent >= 100 && !isOpening) {
            triggerOpening();
        }

        return waterY;
    }

    function draw(waterY) {
        ctx.clearRect(0, 0, width, height);

        // Fondo oscuro de estadio
        ctx.fillStyle = '#050806';
        ctx.fillRect(0, 0, width, height);

        // Capa 1: Sombra esmeralda profunda (olas lentas)
        ctx.fillStyle = 'rgba(16, 62, 22, 0.72)';
        ctx.beginPath();
        ctx.moveTo(0, height);
        for (let x = 0; x <= width; x += 12) {
            const y = waterY +
                Math.sin(x * 0.0035 + time * 1.8) * 18 +
                Math.cos(x * 0.007 + time * 1.2) * 10;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();

        // Capa 2: Verde cancha intenso (olas intermedias)
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

        // Capa 3: Pintura verde neón vibrante con oleaje frontal + ripples
        const paintGrad = ctx.createLinearGradient(0, Math.max(0, waterY - 50), 0, height);
        paintGrad.addColorStop(0, '#4cf563');
        paintGrad.addColorStop(0.08, '#34B341');
        paintGrad.addColorStop(0.35, '#22842c');
        paintGrad.addColorStop(0.75, '#165e1f');
        paintGrad.addColorStop(1, '#0c3511');

        ctx.fillStyle = paintGrad;
        ctx.beginPath();
        ctx.moveTo(0, height);

        const crestPoints = [];

        for (let x = 0; x <= width; x += 8) {
            let y = waterY +
                Math.sin(x * 0.0042 + time * 2.6 + 2.8) * 20 +
                Math.sin(x * 0.008 + time * 3.4) * 8;

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

        // Capa 4: Cresta brillante de pintura líquida húmeda
        if (crestPoints.length > 1) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(crestPoints[0].x, crestPoints[0].y);
            for (let i = 1; i < crestPoints.length; i++) {
                ctx.lineTo(crestPoints[i].x, crestPoints[i].y);
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#4cf563';
            ctx.shadowBlur = 16;
            ctx.stroke();
            ctx.restore();
        }

        // Capa 5: Gotas de pintura cayendo
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

        // Capa 6: Burbujas dentro de la pintura
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

        clearInterval(progressInterval);
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
        }, 320);
    }

    // Timeout de seguridad máximo (3.5 segundos)
    setTimeout(() => {
        if (!isOpening) {
            targetPercent = 100;
            triggerOpening();
        }
    }, 3500);

    // API pública para customizer.js
    window.FinntaRealLoader = {
        onModelProgress(ratio) {
            if (typeof ratio === 'number' && !isNaN(ratio)) {
                model3DProgress = Math.min(1, Math.max(0, ratio));
                recalculateProgress();
            }
        },
        onModelReady() {
            model3DReady = true;
            model3DProgress = 1;
            recalculateProgress();
        }
    };
})();
