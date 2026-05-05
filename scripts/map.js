// Ждём готовности API Яндекс.Карт
ymaps.ready(init);

// Глобальные переменные
let map;

// Районы
const districtPolygons = {};   // name района -> полигон района
let allDistrictsBounds = null; // общие границы всех районов

// Метро
let subwayFeatures = [];       // все станции метро из GeoJSON
let subwayPlacemarks = [];     // текущие метки метро на карте
const subwayIconSize = [24, 24];
const subwayIconOffset = [-12, -12];

// Гостиницы
let hotels = [];               // массив объектов { id, name, address, stars, districtName, website, coords }
let hotelPlacemarks = [];      // текущие метки гостиниц на карте

// Экспорт в глобальную область (если нужно из других файлов)
window.districtPolygons = districtPolygons;
window.showSubwayStations = showSubwayStations;
window.focusOnDistrict = focusOnDistrict;
window.showHotelsForDistrict = showHotelsForDistrict;

// ---------------------------------------------------------------------------
// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ---------------------------------------------------------------------------

function init() {
    const centerSpb = [59.939095, 30.315868];

    map = new ymaps.Map('map', {
        center: centerSpb,
        zoom: 10,
        controls: ['zoomControl', 'typeSelector', 'fullscreenControl']
    });

    window.map = map;

    // Сначала загружаем районы, затем — гостиницы и метро
    loadDistrictsLayer().then(() => {
        loadHotels();      // загрузит и сразу покажет все
        loadSubwayLayer(); // метро грузим и заполняем селект
    });
}

// ---------------------------------------------------------------------------
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ПОЛИГОНОВ (GeoJSON -> Яндекс.Карты)
// ---------------------------------------------------------------------------

/**
 * Конвертация координат из GeoJSON ([lon, lat]) в формат Яндекс.Карт ([lat, lon]).
 * Для Polygon и MultiPolygon.
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

// ---------------------------------------------------------------------------
// ЗАГРУЗКА РАЙОНОВ
// ---------------------------------------------------------------------------

/**
 * Загружаем районы, рисуем их и заполняем селект #district.
 * ВАЖНО: value в селекте = name района (строка), чтобы совпадать с hotels.district_id.
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
                const id = feature.properties.id;      // числовой id
                const name = feature.properties.name;  // строка, напр. "Адмиралтейский"
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

                // КЛЮЧ: индексируем по ИМЕНИ района
                districtPolygons[name] = polygon;

                // Клик по району — фокус и показ гостиниц по имени района
                polygon.events.add('click', () => {
                    focusOnDistrict(name);
                    showHotelsForDistrict(name);
                });

                collection.add(polygon);

                // Добавляем район в селект
                if (districtSelect) {
                    const opt = document.createElement('option');
                    // ВАЖНО: value = name, а не id
                    opt.value = String(name);
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
 * Приближаем карту к району по его имени (name).
 */
function focusOnDistrict(districtName) {
    const poly = districtPolygons[districtName];
    if (!poly || !map) return;

    const bounds = poly.geometry.getBounds();
    if (bounds) {
        map.setBounds(bounds, {
            checkZoomRange: true,
            zoomMargin: 40
        });
    }
}

// ---------------------------------------------------------------------------
// ЗАГРУЗКА СТАНЦИЙ МЕТРО
// ---------------------------------------------------------------------------

/**
 * Загрузка GeoJSON со станциями метро.
 * Станции только загружаем и заполняем селект, но не рисуем на карте сразу.
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
        })
        .catch(err => {
            console.error('Ошибка загрузки subway_spb.geojson:', err);
        });
}

/**
 * Заполнить селект #subwayStation на основе subwayFeatures.
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
        firstOption.selected = true;
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
 * Удаляем уже нарисованные метки станций метро.
 */
function clearSubwayPlacemarks() {
    if (!map) return;
    subwayPlacemarks.forEach(pm => map.geoObjects.remove(pm));
    subwayPlacemarks = [];
}

/**
 * Показать станции метро.
 * stationId = null или '' -> ничего не показываем (все метки метро убираем).
 * stationId = число/строка -> показываем только одну станцию с таким id и приближаем к ней.
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
        const coords = [lat, lon];       // Яндекс: [lat, lon]

        const placemark = new ymaps.Placemark(
            coords,
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

        // Приближаем к выбранной станции
        map.setCenter(coords, 14, {
            checkZoomRange: true
        });
    });

    console.log('Показано меток метро:', subwayPlacemarks.length);
}

// ---------------------------------------------------------------------------
// ГОСТИНИЦЫ
// ---------------------------------------------------------------------------

/**
 * Загружаем hotels.geojson и приводим к удобному массиву объектов.
 * district_id в hotels.geojson = строка имени района (напр. "Адмиралтейский").
 */
function loadHotels() {
    fetch('data/hotels.geojson')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(geojson => {
            hotels = (geojson.features || []).map(f => {
                const props = f.properties || {};
                const geom = f.geometry || {};
                let coords = null;

                if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
                    const lon = geom.coordinates[0]; // GeoJSON: [lon, lat]
                    const lat = geom.coordinates[1];
                    coords = [lat, lon];             // Яндекс: [lat, lon]
                }

                return {
                    id: props.id,
                    name: props.name,
                    address: props.address,
                    stars: props.stars,
                    // districtName: строка, напр. "Адмиралтейский"
                    districtName: props.district_id,
                    website: props.website,
                    coords: coords
                };
            }).filter(h => h.coords !== null);

            console.log('Загружено гостиниц:', hotels.length);

            // Показать все гостиницы сразу
            showHotelsForDistrict(null);
        })
        .catch(err => {
            console.error('Ошибка загрузки hotels.geojson:', err);
        });
}

/**
 * Удаляем все текущие метки гостиниц.
 */
function clearHotelPlacemarks() {
    if (!map) return;
    hotelPlacemarks.forEach(pm => map.geoObjects.remove(pm));
    hotelPlacemarks = [];
}

/**
 * Показать метки гостиниц по району.
 * districtName:
 *   - null или '' -> показать все гостиницы;
 *   - иначе фильтруем по districtName (строке с названием района).
 */
function showHotelsForDistrict(districtName) {
    if (!map || !hotels) {
        console.log('Нет карты или списка гостиниц', map, hotels);
        return;
    }

    clearHotelPlacemarks();

    let filtered;
    if (!districtName) {
        // Показать все гостиницы
        filtered = hotels;
    } else {
        filtered = hotels.filter(
            h => String(h.districtName) === String(districtName)
        );
    }

    filtered.forEach(hotel => {
        if (!hotel.coords) return;

        const placemark = new ymaps.Placemark(
            hotel.coords, // [lat, lon]
            {
                balloonContentHeader: hotel.name,
                balloonContentBody: `
                    <div>
                        <div>${hotel.address || ''}</div>
                        <div>${hotel.stars ? hotel.stars + '★' : ''}</div>
                        ${hotel.website ? `<div><a href="${hotel.website}" target="_blank">Сайт</a></div>` : ''}
                    </div>
                `,
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