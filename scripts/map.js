// Ждём, пока загрузится API Яндекс.Карт
ymaps.ready(init);

let map;

function init() {
    // Центр карты — Санкт-Петербург
    const centerSpb = [59.939095, 30.315868];

    map = new ymaps.Map('map', {
        center: centerSpb,
        zoom: 10,
        controls: ['zoomControl', 'typeSelector', 'fullscreenControl']
    });

    // Здесь позже: загрузка районов, метро, гостиниц
    // loadDistrictsLayer();
}