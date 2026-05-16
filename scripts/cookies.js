document.addEventListener('DOMContentLoaded', () => {
    const banner = document.getElementById('cookie-banner');
    const btn = document.getElementById('cookie-accept');
    if (!banner || !btn) return;

    // Уже принимали раньше? Тогда не показываем
    if (localStorage.getItem('cookieAccepted') === 'yes') {
        return;
    }

    banner.style.display = 'block';

    btn.addEventListener('click', () => {
        localStorage.setItem('cookieAccepted', 'yes');
        banner.style.display = 'none';
    });
});