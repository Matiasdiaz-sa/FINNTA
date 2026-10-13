/**
 * FINNTA - Corte de Línea Interactivo (Page Cut Divider)
 * Física contextual personalizada:
 * 1. Toco desde ABAJO -> La pelota se levanta (pique / levantadita hacia arriba con rebote).
 * 2. Toco de ATRÁS (izquierda) -> Avanza más rápido (sprint acelerado hacia adelante).
 * 3. Toco de ADELANTE (derecha) -> Se frena o va para atrás (freno en seco y reversa).
 * 4. Toco de ARRIBA -> Nada (ignora el toque).
 */

(function () {
    const BALL_FILES = [
        "imagenes/pelota_01_telstar_clasica.png",
        "imagenes/pelota_02_negra_geometria.png",
        "imagenes/pelota_03_anillos_etrusco.png",
        "imagenes/pelota_04_questra_estrellas.png",
        "imagenes/pelota_05_tango_lineas.png",
        "imagenes/pelota_06_teamgeist_curvas.png",
        "imagenes/pelota_07_roteiro_paneles.png",
        "imagenes/pelota_08_jabulani_circulos.png",
        "imagenes/pelota_09_3d_telstar.png",
        "imagenes/pelota_10_3d_negra_anillos.png",
        "imagenes/pelota_11_3d_etrusco.png",
        "imagenes/pelota_12_3d_questra.png",
        "imagenes/pelota_13_3d_tango.png",
        "imagenes/pelota_14_3d_teamgeist.png",
        "imagenes/pelota_15_3d_roteiro.png",
        "imagenes/pelota_16_3d_jabulani.png",
        "imagenes/pelota_17_amarilla_invierno.png",
        "imagenes/pelota_18_azul_amarilla.png",
        "imagenes/pelota_19_verde_circulos.png",
        "imagenes/pelota_20_tricolore_francia98.png",
        "imagenes/pelota_21_tango_verde_azul.png",
        "imagenes/pelota_22_teamgeist_dorada.png",
        "imagenes/pelota_23_etrusco_azul.png",
        "imagenes/pelota_24_jabulani_sudafrica2010.png"
    ];

    // Precargar todas las imágenes para cambios de balón instantáneos
    const preloadedImages = [];
    BALL_FILES.forEach(src => {
        const img = new Image();
        img.src = src;
        preloadedImages.push(img);
    });

    let currentBallIdx = 0;
    let dist = 0;
    let ballRot = 0;
    let isVisible = true;
    let particles = [];

    // Variables de dinámica según dirección del toque
    let kickBoost = 0;      // Velocidad extra horizontal (positiva: sprint, negativa: reversa/freno)
    let hopY = 0;           // Altura del levantamiento vertical cuando se toca desde abajo
    let hopVy = 0;
    let isHopping = false;
    let bounceCount = 0;

    let currentScreenX = 0;
    let currentScreenY = 0;

    function init() {
        const container = document.getElementById('edge-cutter-divider');
        const path = document.getElementById('edge-wave-path');
        const ballActor = document.getElementById('ball-actor');
        const ballImg = document.getElementById('ball-img');
        const ballShadow = document.getElementById('ball-shadow');
        const canvas = document.getElementById('edge-particles-canvas');

        if (!container || !path || !ballActor || !ballImg) return;

        const ctx = canvas ? canvas.getContext('2d') : null;

        // Ajustar resolución del canvas de partículas
        function resizeCanvas() {
            if (!canvas) return;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = container.clientWidth;
            const h = container.clientHeight;
            canvas.width = w * dpr;
            canvas.height = h * dpr;
            if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas, { passive: true });

        // Precalcular tabla de búsqueda (LUT) para 0ms de costo SVG durante el frame loop
        const pathLen = path.getTotalLength();
        const SAMPLES = 1200;
        const lutX = new Float32Array(SAMPLES);
        const lutY = new Float32Array(SAMPLES);

        for (let i = 0; i < SAMPLES; i++) {
            const d = (i / (SAMPLES - 1)) * pathLen;
            const pt = path.getPointAtLength(d);
            lutX[i] = pt.x;
            lutY[i] = pt.y;
        }

        function setBallSkin(idx) {
            currentBallIdx = (idx + BALL_FILES.length) % BALL_FILES.length;
            ballImg.src = BALL_FILES[currentBallIdx];
        }

        // Skin inicial
        setBallSkin(0);

        // Sistema de partículas de césped adaptativo
        function spawnGrass(x, y, mode = 'forward') {
            if (!canvas) return;
            const count = mode === 'lift' ? 10 : 7;

            for (let i = 0; i < count; i++) {
                let angle, speed;

                if (mode === 'forward') {
                    // Aceleración hacia adelante: césped expulsado hacia ATRÁS
                    angle = Math.PI * 0.75 + (Math.random() - 0.5) * 0.6;
                    speed = 2.8 + Math.random() * 4.2;
                } else if (mode === 'reverse') {
                    // Freno / marcha atrás: césped expulsado hacia ADELANTE
                    angle = -Math.PI * 0.2 + (Math.random() - 0.5) * 0.6;
                    speed = 2.8 + Math.random() * 4.0;
                } else if (mode === 'lift') {
                    // Levantada desde abajo: césped impulsado hacia arriba
                    angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 0.9;
                    speed = 2.4 + Math.random() * 3.6;
                } else {
                    // Rebote suave en el suelo
                    angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.2;
                    speed = 1.6 + Math.random() * 2.5;
                }

                particles.push({
                    x: x,
                    y: y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    r: 1.6 + Math.random() * 2.2,
                    color: Math.random() > 0.4 ? '#32A83E' : '#22c55e',
                    alpha: 1,
                    decay: 0.035 + Math.random() * 0.025
                });
            }
        }

        // Reglas de interacción según el lugar del toque:
        // - Desde abajo: se levanta
        // - De atrás: avanza más rápido
        // - De adelante: se frena o va para atrás
        // - De arriba: nada
        function handleInteraction(e) {
            const rect = container.getBoundingClientRect();
            const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : rect.left + rect.width / 2);
            const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : rect.top + rect.height / 2);

            const clickX = clientX - rect.left;
            const clickY = clientY - rect.top;

            const dx = clickX - currentScreenX;
            const dy = clickY - currentScreenY;

            // 1. SI TOCO DE ARRIBA -> NADA
            if (dy < -18) {
                return;
            }

            // 2. SI TOCO DESDE ABAJO -> QUE SE LEVANTE
            if (dy > 16) {
                if (!isHopping) {
                    hopVy = -5.0; // Levantadita limpia y visible con arco suave
                    isHopping = true;
                    bounceCount = 0;
                    setBallSkin(currentBallIdx + 1);
                    spawnGrass(currentScreenX, currentScreenY, 'lift');
                }
                return;
            }

            // 3. SI TOCO DE ATRÁS (izquierda) -> QUE AVANCE MÁS RÁPIDO
            if (dx < -10) {
                kickBoost = 260; // Turbo sprint hacia adelante
                setBallSkin(currentBallIdx + 1);
                spawnGrass(currentScreenX, currentScreenY, 'forward');
                return;
            }

            // 4. SI TOCO DE ADELANTE (derecha) -> QUE SE FRENE O VAYA PARA ATRÁS
            if (dx >= -10) {
                kickBoost = -180; // Freno en seco y retroceso
                setBallSkin(currentBallIdx + 1);
                spawnGrass(currentScreenX, currentScreenY, 'reverse');
                return;
            }
        }

        // Soporte táctil inmediato sin latencia
        container.addEventListener('pointerdown', handleInteraction);

        // Loop de renderizado 60-120fps sincronizado
        let lastTime = 0;
        const BASE_SPEED = 145; // unidades por segundo

        function tick(now) {
            if (!lastTime) lastTime = now;
            const dt = Math.min((now - lastTime) / 1000, 0.033);
            lastTime = now;

            if (isVisible) {
                const rect = container.getBoundingClientRect();
                const containerW = rect.width || window.innerWidth;
                const containerH = rect.height || 80;
                const scaleX = containerW / 1440;
                const scaleY = containerH / 80;

                // Dinámica de aceleración / frenado hacia adelante o atrás
                if (kickBoost > 0) {
                    kickBoost = Math.max(0, kickBoost - 300 * dt);
                } else if (kickBoost < 0) {
                    kickBoost = Math.min(0, kickBoost + 240 * dt);
                }

                // Dinámica de la levantada (cuando se toca desde abajo)
                if (isHopping) {
                    hopY += hopVy;
                    hopVy += 0.40; // gravedad suave
                    if (hopY >= 0) {
                        hopY = 0;
                        if (bounceCount < 1) {
                            // Micro-rebote elástico al caer
                            hopVy = -2.2;
                            bounceCount++;
                            spawnGrass(currentScreenX, currentScreenY, 'bounce');
                        } else {
                            hopVy = 0;
                            isHopping = false;
                            bounceCount = 0;
                        }
                    }
                }

                const currentSpeed = BASE_SPEED + kickBoost;
                const step = currentSpeed * dt;
                dist += step;

                // Si dio la vuelta completa al corte o si retrocedió del origen
                if (dist >= pathLen) {
                    dist = dist % pathLen;
                    setBallSkin(currentBallIdx + 1);
                } else if (dist < 0) {
                    dist = dist + pathLen;
                }

                // Cálculo de interpolación subpixel
                const normDist = (dist / pathLen) * (SAMPLES - 1);
                const i0 = Math.floor(normDist);
                const i1 = Math.min(i0 + 1, SAMPLES - 1);
                const frac = normDist - i0;

                const rawX = lutX[i0] + (lutX[i1] - lutX[i0]) * frac;
                const rawY = lutY[i0] + (lutY[i1] - lutY[i0]) * frac;

                currentScreenX = rawX * scaleX;
                currentScreenY = rawY * scaleY;

                // Rotación física en base al avance real en pantalla
                const isMobile = containerW < 768;
                const ballRadiusPx = isMobile ? 14 : 17;
                const distScreenPx = step * scaleX;
                const physicalRot = (distScreenPx / (2 * Math.PI * ballRadiusPx)) * 360;
                ballRot += physicalRot;

                // Posicionamiento de la pelota acelerado por GPU
                const finalY = currentScreenY + hopY;
                ballActor.style.transform = `translate3d(${currentScreenX.toFixed(2)}px, ${finalY.toFixed(2)}px, 0)`;
                ballImg.style.transform = `rotate(${ballRot.toFixed(2)}deg)`;

                // Sombra en el suelo: se escala y difumina suavemente cuando se levanta
                if (ballShadow) {
                    const shadowScale = isHopping ? Math.max(0.45, 1 - Math.abs(hopY) / 45) : 1;
                    const shadowOpacity = isHopping ? Math.max(0.12, 0.28 * shadowScale) : 0.28;
                    ballShadow.style.transform = `translateX(-50%) scale(${shadowScale.toFixed(2)})`;
                    ballShadow.style.opacity = shadowOpacity.toFixed(2);
                }

                // Renderizado de partículas de césped en Canvas 2D
                if (ctx && canvas) {
                    if (particles.length > 0) {
                        ctx.clearRect(0, 0, containerW, containerH);
                        for (let i = particles.length - 1; i >= 0; i--) {
                            const p = particles[i];
                            p.x += p.vx;
                            p.y += p.vy;
                            p.vy += 0.22;
                            p.alpha -= p.decay;

                            if (p.alpha <= 0) {
                                particles.splice(i, 1);
                            } else {
                                ctx.fillStyle = p.color;
                                ctx.globalAlpha = p.alpha;
                                ctx.beginPath();
                                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                                ctx.fill();
                            }
                        }
                        ctx.globalAlpha = 1.0;
                    } else if (ctx.globalAlpha !== 1.0) {
                        ctx.clearRect(0, 0, containerW, containerH);
                        ctx.globalAlpha = 1.0;
                    }
                }
            }

            requestAnimationFrame(tick);
        }

        // Observer para optimizar batería si el corte está fuera del viewport
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                isVisible = entry.isIntersecting;
            });
        }, { threshold: 0.05 });

        observer.observe(container);

        requestAnimationFrame(tick);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
