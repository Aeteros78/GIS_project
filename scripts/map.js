ymaps.ready(init);

let map;
const districtPolygons = {}; // id района -> полигон района
let hotels = [];             // все гостиницы
let hotelPlacemarks = [];    // текущие метки на карте

// границы всех районов (для "Все районы")
let allDistrictsBounds = null;

// --- МЕТРО ---
// все станции метро из GeoJSON
let subwayFeatures = [];
// текущие метки станций метро на карте
let subwayPlacemarks = [];
// базовый пресет для всех станций метро
const subwayStationPreset = 'islands#metroCircleIcon'; // можно сменить, если нужно

function init() {
    const centerSpb = [59.939095, 30.315868];
    map = new ymaps.Map('map', {
        center: centerSpb,
        zoom: 10,
        controls: ['zoomControl', 'typeSelector', 'fullscreenControl']
    });
    map.behaviors.disable('scrollZoom');

    // Делаем объекты видимыми из других файлов
    window.map = map;
    window.districtPolygons = districtPolygons;

    // Сначала загружаем районы, потом отели и станции метро
    loadDistrictsLayer().then(() => {
        loadHotels();
        loadSubwayLayer(); // загружаем станции метро
    });
}

/**
 * Конвертация координат из GeoJSON ([lon, lat]) в формат Яндекс.Карт ([lat, lon])
 * с учётом того, что у вас один MultiPolygon (Красносельский) со стандартной структурой.
 */
function convertCoords(geometryType, coords) {
    if (geometryType === 'Polygon') {
        // Polygon: [ [ [lon, lat], ... ] ]
        return coords.map(ring =>
            ring.map(point => [point[1], point[0]])
        );
    } else if (geometryType === 'MultiPolygon') {
        // Берём основной контур и используем его как обычный Polygon.
        const mainPolygon = coords[1] && coords[1][0] ? coords[1][0] : coords[0][0];
        return [
            mainPolygon.map(point => [point[1], point[0]])
        ];
    }
    return coords;
}

/**
 * Загружаем районы, рисуем их и заполняем селект.
 * Возвращает Promise, чтобы потом вызвать loadHotels().
 */
function loadDistrictsLayer() {
    return fetch('data/districts_spb.geojson')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(geojson => {
            const collection = new ymaps.GeoObjectCollection();
            const districtSelect = document.getElementById('district');

            // Заполняем селект
            if (districtSelect) {
                districtSelect.innerHTML = '';
                const allOpt = document.createElement('option');
                allOpt.value = '';
                allOpt.textContent = 'Все районы';
                districtSelect.appendChild(allOpt);
            }

            geojson.features.forEach(feature => {
                const id = feature.properties.id;
                const name = feature.properties.name;
                const type = feature.geometry.type;
                const rawCoords = feature.geometry.coordinates;
                const coords = convertCoords(type, rawCoords);

                // Всегда создаём ymaps.Polygon
                const polygon = new ymaps.Polygon(
                    coords,
                    { id, name },
                    {
                        // Полностью прозрачный полигон
                        strokeColor: '#000000',
                        strokeOpacity: 0,
                        strokeWidth: 0,
                        fillColor: '#000000',
                        fillOpacity: 0
                    }
                );

                districtPolygons[id] = polygon;

                // Клик по району — приблизить и показать отели района
                polygon.events.add('click', () => {
                    focusOnDistrict(id);
                    showHotelsForDistrict(id);
                });

                collection.add(polygon);

                // Добавляем в селект
                if (districtSelect) {
                    const opt = document.createElement('option');
                    opt.value = String(id);
                    opt.textContent = name;
                    districtSelect.appendChild(opt);
                }
            });

            map.geoObjects.add(collection);

            const bounds = collection.getBounds();
            console.log('Общие bounds коллекции:', bounds);
            if (bounds) {
                allDistrictsBounds = bounds; // запоминаем "весь Петербург"
                map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
            }

            // Экспортируем bounds наружу (на всякий случай)
            window.allDistrictsBounds = allDistrictsBounds;
        })
        .catch(err => {
            console.error('Ошибка загрузки districts_spb.geojson:', err);
        });
}

/**
 * Приближаем карту к району по его id
 */
function focusOnDistrict(id) {
    const poly = districtPolygons[id];
    if (!poly || !map) return;
    const bounds = poly.geometry.getBounds();
    console.log('Фокус на район', id, 'bounds=', bounds);
    if (bounds) {
        const centerLat = (bounds[0][0] + bounds[1][0]) / 2;
        const centerLon = (bounds[0][1] + bounds[1][1]) / 2;
        map.setCenter([centerLat, centerLon], 12, {
            checkZoomRange: true
        });
    }
}

// --- МЕТРО ---

// Загрузка GeoJSON со станциями метро
function loadSubwayLayer() {
    return fetch('data/subway_spb.geojson')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(geojson => {
            subwayFeatures = geojson.features || [];
            console.log('Загружено станций метро:', subwayFeatures.length);

            // заполняем селект станций метро
            fillSubwaySelectFromData();

            // При первом запуске показываем все станции
            showSubwayStations();
        })
        .catch(err => {
            console.error('Ошибка загрузки subway_spb.geojson:', err);
        });
}

// Заполнить селект #subwayStation на основе subwayFeatures
function fillSubwaySelectFromData() {
    const select = document.getElementById('subwayStation');
    if (!select) return;

    // Сохраняем или создаём первую опцию "Все станции"
    let firstOption = select.querySelector('option[value=""]');
    select.innerHTML = '';
    if (firstOption) {
        select.appendChild(firstOption);
    } else {
        firstOption = document.createElement('option');
        firstOption.value = '';
        firstOption.textContent = 'Все станции';
        select.appendChild(firstOption);
    }

    subwayFeatures.forEach(f => {
        const props = f.properties || {};
        const opt = document.createElement('option');
        opt.value = String(props.id);   // id из properties.id
        opt.textContent = props.name;   // имя станции
        select.appendChild(opt);
    });
}

// Удаляем уже нарисованные метки станций метро
function clearSubwayPlacemarks() {
    if (!map) return;
    subwayPlacemarks.forEach(pm => map.geoObjects.remove(pm));
    subwayPlacemarks = [];
}

/**
 * Показать станции метро.
 * stationId = null или '' -> показывать все станции.
 * stationId = число/строка -> только конкретную станцию.
 */
function showSubwayStations(stationId) {
    if (!map || !subwayFeatures) {
        console.log('Нет карты или данных метро', map, subwayFeatures);
        return;
    }

    clearSubwayPlacemarks();

    let filtered;
    if (!stationId) {
        filtered = subwayFeatures;
    } else {
        const idNum = Number(stationId);
        filtered = subwayFeatures.filter(f => Number(f.properties.id) === idNum);
    }

    filtered.forEach(f => {
        const props = f.properties || {};
        const geom = f.geometry || {};
        if (geom.type !== 'Point' || !Array.isArray(geom.coordinates)) return;

        const lon = geom.coordinates[0]; // GeoJSON: [lon, lat]
        const lat = geom.coordinates[1];

        const placemark = new ymaps.Placemark(
            [lat, lon], // Яндекс: [lat, lon]
            {
                balloonContentHeader: props.name,
                balloonContentBody: props.line || '',
                hintContent: props.name
            },
            {
                preset: subwayStationPreset
            }
        );

        map.geoObjects.add(placemark);
        subwayPlacemarks.push(placemark);
    });

    console.log('Показано станций метро:', filtered.length);
}

// --- ГОСТИНИЦЫ ---

function loadHotels() {
    fetch('data/hotels.json')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(data => {
            hotels = data;
            console.log('Загружено гостиниц:', hotels.length);
        })
        .catch(err => {
            console.error('Ошибка загрузки hotels.json:', err);
        });
}

function clearHotelPlacemarks() {
    if (!map) return;
    hotelPlacemarks.forEach(pm => map.geoObjects.remove(pm));
    hotelPlacemarks = [];
}

/**
 * Показать метки гостиниц по району.
 * districtId = null или '' -> показать все гостиницы.
 */
function showHotelsForDistrict(districtId) {
    if (!map || !hotels) {
        console.log('Нет карты или списка гостиниц', map, hotels);
        return;
    }

    clearHotelPlacemarks();

    let filtered;
    if (!districtId) {
        filtered = hotels;
    } else {
        filtered = hotels.filter(h => h.districtId === Number(districtId));
    }

    console.log('Фильтруем гостиницы по districtId =', districtId, 'результат:', filtered);

    filtered.forEach(hotel => {
        const placemark = new ymaps.Placemark(
            hotel.coords, // [lat, lon]
            {
                balloonContentHeader: hotel.name,
                balloonContentBody: hotel.address || '',
                hintContent: hotel.name
            },
            {
                preset: 'islands#blueDotIcon'
            }
        );
        console.log('Добавляем метку на карту:', hotel.name, hotel.coords);
        map.geoObjects.add(placemark);
        hotelPlacemarks.push(placemark);
    });

    console.log('Показано гостиниц:', filtered.length);
}

// Делаем функции доступными из filters.js
window.focusOnDistrict = focusOnDistrict;
window.showHotelsForDistrict = showHotelsForDistrict;
window.allDistrictsBounds = allDistrictsBounds;
window.showSubwayStations = showSubwayStations;