ymaps.ready(init);

let map;
const districtPolygons = {}; // id района -> полигон района
let hotels = [];             // все гостиницы
let hotelPlacemarks = [];    // текущие метки на карте

// границы всех районов (для "Все районы")
let allDistrictsBounds = null;

// --- МЕТРО ---
let subwayFeatures = [];     // все станции метро из GeoJSON
let subwayPlacemarks = [];   // текущие метки станций метро на карте

// Размер иконки метро (SVG) и смещение, чтобы центр совпадал с точкой
const subwayIconSize = [24, 24];     // можно поменять, если иконка слишком большая/маленькая
const subwayIconOffset = [-12, -12]; // половина размера со знаком "-"

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
        loadSubwayLayer(); // загружаем станции метро (но НЕ показываем их сразу)
    });
}

/**
 * Конвертация координат из GeoJSON ([lon, lat]) в формат Яндекс.Карт ([lat, lon])
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

                const polygon = new ymaps.Polygon(
                    coords,
                    { id, name },
                    {
                        strokeColor: '#000000',
                        strokeOpacity: 0,
                        strokeWidth: 0,
                        fillColor: '#000000',
                        fillOpacity: 0
                    }
                );

                districtPolygons[id] = polygon;

                polygon.events.add('click', () => {
                    focusOnDistrict(id);
                    showHotelsForDistrict(id);
                });

                collection.add(polygon);

                if (districtSelect) {
                    const opt = document.createElement('option');
                    opt.value = String(id);
                    opt.textContent = name;
                    districtSelect.appendChild(opt);
                }
            });

            map.geoObjects.add(collection);

            const bounds = collection.getBounds();
            if (bounds) {
                allDistrictsBounds = bounds;
                map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
            }

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
    if (bounds) {
        const centerLat = (bounds[0][0] + bounds[1][0]) / 2;
        const centerLon = (bounds[0][1] + bounds[1][1]) / 2;
        map.setCenter([centerLat, centerLon], 12, {
            checkZoomRange: true
        });
    }
}

// --- МЕТРО ---

/**
 * Загрузка GeoJSON со станциями метро.
 * Станции только загружаем и заполняем селект, но не рисуем на карте.
 */
function loadSubwayLayer() {
    return fetch('data/subway_spb.geojson')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(geojson => {
            subwayFeatures = geojson.features || [];
            console.log('Загружено станций метро:', subwayFeatures.length);

            fillSubwaySelectFromData();

            // НЕ вызываем showSubwayStations() здесь, чтобы не показывать все станции сразу
        })
        .catch(err => {
            console.error('Ошибка загрузки subway_spb.geojson:', err);
        });
}

/**
 * Заполнить селект #subwayStation на основе subwayFeatures
 */
function fillSubwaySelectFromData() {
    const select = document.getElementById('subwayStation');
    if (!select) {
        console.warn('Селект #subwayStation не найден в DOM');
        return;
    }

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

    console.log('Селект станций метро заполнен');
}

/**
 * Удаляем уже нарисованные метки станций метро
 */
function clearSubwayPlacemarks() {
    if (!map) return;
    subwayPlacemarks.forEach(pm => map.geoObjects.remove(pm));
    subwayPlacemarks = [];
}

/**
 * Показать станции метро.
 * stationId = null или '' -> ничего не показываем (все метки метро убираем).
 * stationId = число/строка -> показываем только одну станцию с таким id.
 */
function showSubwayStations(stationId) {
    console.log('showSubwayStations вызван с stationId =', stationId);

    if (!map || !subwayFeatures) {
        console.warn('Нет карты или данных метро', map, subwayFeatures);
        return;
    }

    clearSubwayPlacemarks();

    if (!stationId) {
        console.log('stationId пустой — метки метро не отображаем');
        return;
    }

    const idNum = Number(stationId);
    const filtered = subwayFeatures.filter(f => Number(f.properties.id) === idNum);

    console.log('Найдено станций с id', idNum, ':', filtered.length);

    filtered.forEach(f => {
        const props = f.properties || {};
        const geom = f.geometry || {};
        if (geom.type !== 'Point' || !Array.isArray(geom.coordinates)) {
            console.warn('Неверная геометрия у станции', props);
            return;
        }

        const lon = geom.coordinates[0]; // GeoJSON: [lon, lat]
        const lat = geom.coordinates[1];

        console.log('Рисуем станцию', props.name, 'coords=', [lat, lon]);

        const placemark = new ymaps.Placemark(
            [lat, lon], // Яндекс: [lat, lon]
            {
                balloonContentHeader: props.name,
                balloonContentBody: props.line || '',
                hintContent: props.name
            },
            {
                iconLayout: 'default#image',
                iconImageHref: 'images/Spb_metro_logo.svg', // путь к SVG
                iconImageSize: subwayIconSize,
                iconImageOffset: subwayIconOffset
            }
        );

        map.geoObjects.add(placemark);
        subwayPlacemarks.push(placemark);
    });

    console.log('Показано меток метро:', subwayPlacemarks.length);
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
        map.geoObjects.add(placemark);
        hotelPlacemarks.push(placemark);
    });

    console.log('Показано гостиниц:', filtered.length);
}

// Экспортируем функции в глобальную область
window.focusOnDistrict = focusOnDistrict;
window.showHotelsForDistrict = showHotelsForDistrict;
window.allDistrictsBounds = allDistrictsBounds;
window.showSubwayStations = showSubwayStations;