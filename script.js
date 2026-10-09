// --- Lando Norris Mask Effect ---

const maskContainer = document.querySelector('.mask-visual');

// Update the mask center coordinates based on mouse position
maskContainer.addEventListener('mousemove', (e) => {
    // Get mouse position relative to the container
    const rect = maskContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Update CSS variables for the radial-gradient mask
    maskContainer.style.setProperty('--mouse-x', `${x}px`);
    maskContainer.style.setProperty('--mouse-y', `${y}px`);
});

// For touch devices
maskContainer.addEventListener('touchmove', (e) => {
    const rect = maskContainer.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    const y = e.touches[0].clientY - rect.top;

    maskContainer.style.setProperty('--mouse-x', `${x}px`);
    maskContainer.style.setProperty('--mouse-y', `${y}px`);
}, { passive: true });

// Move mask off-screen when the mouse leaves the container
maskContainer.addEventListener('mouseleave', () => {
    maskContainer.style.setProperty('--mouse-x', `-999px`);
    maskContainer.style.setProperty('--mouse-y', `-999px`);
});

// --- Botones "Crear mi par" / "Empezar a personalizar" ---
document.querySelectorAll('.cta-nav, .sequence-content .btn-primary').forEach((btn) => {
    btn.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            const spa = document.getElementById('personalizar');
            spa.classList.add('active');
            document.body.style.overflow = 'hidden'; // Evita scrollear fondo
            setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
        } else {
            document.getElementById('personalizar').scrollIntoView({ behavior: 'smooth' });
        }
    });
});

document.getElementById('btn-close-customizer').addEventListener('click', () => {
    document.getElementById('personalizar').classList.remove('active');
    document.body.style.overflow = '';
});
