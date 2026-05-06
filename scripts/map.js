// scripts/map.js

// Ждём, пока загрузится и инициализируется API Яндекс.Карт.
// После этого будет вызвана функция init().
ymaps.ready(init);

// Глобальные переменные, доступные в разных частях кода:

// Объект карты Яндекс.Карт
let map;

// Список полигонов районов: ключ = имя района, значение = Polygon
const districtPolygons = {};
// Общие границы всех районов, чтобы уметь "отзумить" карту на весь город
let allDistrictsBounds = null;

// Данные метро
let subwayFeatures = [];       // массив станций метро из subway_spb.geojson
let subwayPlacemarks = [];     // массив созданных меток метро на карте
const subwayIconSize = [24, 24];
const subwayIconOffset = [-12, -12];

// Данные гостиниц
let hotels = [];               // массив объектов { id, name, address, stars, districtName, website, coords }
let hotelPlacemarks = [];      // массив созданных меток гостиниц на карте

// Экспорт некоторых переменных и функций в глобальную область (window),
// чтобы к ним был доступ из других файлов (например, filters.js).
window.districtPolygons = districtPolygons;
window.showSubwayStations = showSubwayStations;
window.focusOnDistrict = focusOnDistrict;
window.showHotelsForDistrict = showHotelsForDistrict;
window.clearSubwayPlacemarks = clearSubwayPlacemarks;
window.findSubwayById = findSubwayById;
window.hotels = hotels;               // чтобы filters.js мог использовать массив отелей
window.hotelPlacemarks = hotelPlacemarks;

// ---------------------------------------------------------------------------
// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ---------------------------------------------------------------------------

function init() {
    // Центр Санкт-Петербурга
    const centerSpb = [59.939095, 30.315868];

    // Создаём экземпляр карты в контейнере <div id="map">
    map = new ymaps.Map('map', {
        center: centerSpb,
        zoom: 10,
        controls: ['zoomControl', 'typeSelector', 'fullscreenControl']
    });

    // Делаем карту доступной глобально
    window.map = map;

    // Загружаем районы, затем гостиницы и метро.
    // Используем промис, чтобы сначала отрисовать районы (нужны границы).
    loadDistrictsLayer().then(() => {
        loadHotels();      // загрузить и показать все гостиницы
        loadSubwayLayer(); // загрузить список станций метро и заполнить селект
    });
}

// ---------------------------------------------------------------------------
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ПОЛИГОНОВ (GeoJSON -> Яндекс.Карты)
// ---------------------------------------------------------------------------

/**
 * Конвертируем координаты из формата GeoJSON в формат Яндекс.Карт.
 *
 * В GeoJSON точки задаются как [lon, lat] (долгота, широта),
 * а в Яндекс.Картах как [lat, lon] (широта, долгота).
 *
 * Для Polygon и MultiPolygon нужно развернуть все точки в кольцах.
 */
function convertCoords(geometryType, coords) {
    if (geometryType === 'Polygon') {
        // Polygon: [ [ [lon, lat], ... ] ]
        return coords.map(ring =>
            ring.map(point => [point[1], point[0]]) // меняем местами
        );
    } else if (geometryType === 'MultiPolygon') {
        // У MultiPolygon более сложная структура, здесь берётся основной контур.
        const mainPolygon = coords[1] && coords[1][0] ? coords[1][0] : coords[0][0];
        return [
            mainPolygon.map(point => [point[1], point[0]])
        ];
    }
    return coords;
}

// ---------------------------------------------------------------------------
// ЗАГРУЗКА И ОТОБРАЖЕНИЕ РАЙОНОВ
// ---------------------------------------------------------------------------

/**
 * Загружаем районы из файла districts_spb.geojson,
 * создаём для каждого района полигон на карте
 * и заполняем выпадающий список #district.
 *
 * ВАЖНО: в селекте value = name района, чтобы совпадать с hotels.district_id.
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

            // Подготовка селекта районов
            if (districtSelect) {
                districtSelect.innerHTML = '';
                const allOpt = document.createElement('option');
                allOpt.value = '';                // пустое значение = "все районы"
                allOpt.textContent = 'Все районы';
                districtSelect.appendChild(allOpt);
            }

            // Обходим все районы в GeoJSON
            geojson.features.forEach(feature => {
                const id = feature.properties.id;      // числовой id (1..18)
                const name = feature.properties.name;  // строка "Адмиралтейский"
                const type = feature.geometry.type;
                const rawCoords = feature.geometry.coordinates;
                const coords = convertCoords(type, rawCoords);

                // Создаём полигон района
                const polygon = new ymaps.Polygon(
                    coords,
                    { id, name }, // данные, которые можно использовать в подсказках и т.п.
                    {
                        strokeColor: '#000000',
                        strokeOpacity: 0,
                        strokeWidth: 0,
                        fillColor: '#000000',
                        fillOpacity: 0
                    }
                );

                // Сохраняем полигон в словарь по имени района
                districtPolygons[name] = polygon;

                // При клике по району: фокусируем карту на этом районе и показываем его отели
                polygon.events.add('click', () => {
                    focusOnDistrict(name);
                    showHotelsForDistrict(name);
                });

                collection.add(polygon);

                // Добавляем вариант в селект районов (value = имя района)
                if (districtSelect) {
                    const opt = document.createElement('option');
                    opt.value = String(name);
                    opt.textContent = name;
                    districtSelect.appendChild(opt);
                }
            });

            // Добавляем все районы на карту
            map.geoObjects.add(collection);

            // Сохраняем общие границы города по полигонам районов
            const bounds = collection.getBounds();
            if (bounds) {
                allDistrictsBounds = bounds;
                map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
            }

            // Делаем границы доступными глобально
            window.allDistrictsBounds = allDistrictsBounds;
        })
        .catch(err => {
            console.error('Ошибка загрузки districts_spb.geojson:', err);
        });
}

/**
 * Приближаем карту к району по его имени.
 * Используется при клике по району и при применении фильтра по району.
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
// ЗАГРУЗКА И ОТОБРАЖЕНИЕ СТАНЦИЙ МЕТРО
// ---------------------------------------------------------------------------

/**
 * Загружаем GeoJSON со станциями метро (subway_spb.geojson).
 * Станции пока только читаются в массив subwayFeatures
 * и на их основе заполняется селект метро.
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
 * Заполняем выпадающий список #subwayStation названиями станций метро.
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
        // Если узел уже был в разметке – переиспользуем его
        select.appendChild(firstOption);
    } else {
        // Если по какой-то причине его не было – создаём заново
        firstOption = document.createElement('option');
        firstOption.value = '';
        firstOption.textContent = 'Все станции';
        firstOption.selected = true;
        select.appendChild(firstOption);
    }

    // Добавляем станции метро в селект
    subwayFeatures.forEach(f => {
        const props = f.properties || {};
        const opt = document.createElement('option');
        opt.value = String(props.id);   // value = id станции
        opt.textContent = props.name;   // видимое название станции
        select.appendChild(opt);
    });

    console.log('Селект станций метро заполнен');
}

/**
 * Удаляем с карты все нарисованные метки метро.
 */
function clearSubwayPlacemarks() {
    if (!map) return;
    subwayPlacemarks.forEach(pm => map.geoObjects.remove(pm));
    subwayPlacemarks = [];
}

/**
 * Показать станции метро.
 *
 * stationId:
 *   - null или '' → не отображать метро (очищаем метки),
 *   - иначе показываем только одну станцию по id и приближаем карту к ней.
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

        // Перестановка координат [lon, lat] -> [lat, lon]
        const lon = geom.coordinates[0];
        const lat = geom.coordinates[1];
        const coords = [lat, lon];

        const placemark = new ymaps.Placemark(
            coords,
            {
                balloonContentHeader: props.name,
                balloonContentBody: props.line || '',
                hintContent: props.name
            },
            {
                iconLayout: 'default#image',
                iconImageHref: 'images/Spb_metro_logo.svg',
                iconImageSize: subwayIconSize,
                iconImageOffset: subwayIconOffset
            }
        );

        map.geoObjects.add(placemark);
        subwayPlacemarks.push(placemark);

        // Приближаем карту к выбранной станции метро
        map.setCenter(coords, 14, {
            checkZoomRange: true
        });
    });

    console.log('Показано меток метро:', subwayPlacemarks.length);
}

/**
 * Найти станцию метро по её id.
 *
 * Возвращает объект:
 *  {
 *    id,          // id станции
 *    name,        // название
 *    line,        // линия метро (если есть)
 *    districtName,// название района (из properties.district)
 *    coords       // координаты [lat, lon] для Яндекс.Карт
 *  }
 * или null, если станция не найдена.
 *
 * ОЖИДАЕТ, что в subway_spb.geojson в properties.district
 * лежит строка вида "Адмиралтейский".
 */
function findSubwayById(stationId) {
    if (!subwayFeatures || !subwayFeatures.length) return null;
    const idNum = Number(stationId);
    const f = subwayFeatures.find(f => Number(f.properties.id) === idNum);
    if (!f) return null;

    const props = f.properties || {};
    const geom = f.geometry || {};
    if (geom.type !== 'Point' || !Array.isArray(geom.coordinates)) return null;

    const lon = geom.coordinates[0];
    const lat = geom.coordinates[1];

    return {
        id: props.id,
        name: props.name,
        line: props.line || '',
        districtName: props.district || null,
        coords: [lat, lon]
    };
}

// ---------------------------------------------------------------------------
// ЗАГРУЗКА И ОТОБРАЖЕНИЕ ГОСТИНИЦ
// ---------------------------------------------------------------------------

/**
 * Загружаем hotels.geojson (экспорт из PostGIS) и
 * преобразуем в удобный массив JS-объектов для работы в приложении.
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
                    districtName: props.district_id, // строка "Адмиралтейский"
                    website: props.website,
                    coords: coords
                };
            }).filter(h => h.coords !== null); // убираем записи без координат

            console.log('Загружено гостиниц:', hotels.length);

            // Делаем массив отелей глобальным, чтобы использовать в filters.js
            window.hotels = hotels;

            // Показываем все гостиницы (без фильтров) при загрузке сайта
            showHotelsForDistrict(null);
        })
        .catch(err => {
            console.error('Ошибка загрузки hotels.geojson:', err);
        });
}

/**
 * Удаляем все метки гостиниц с карты.
 */
function clearHotelPlacemarks() {
    if (!map) return;
    hotelPlacemarks.forEach(pm => map.geoObjects.remove(pm));
    hotelPlacemarks = [];
    window.hotelPlacemarks = hotelPlacemarks;
}

/**
 * Показать метки гостиниц по району.
 *
 * districtName:
 *   - null или '' → показать все гостиницы,
 *   - строка (например, "Адмиралтейский") → только гостиницы этого района.
 */
function showHotelsForDistrict(districtName) {
    if (!map || !hotels) {
        console.log('Нет карты или списка гостиниц', map, hotels);
        return;
    }

    clearHotelPlacemarks();

    let filtered;
    if (!districtName) {
        // Без фильтра по району – все гостиницы
        filtered = hotels;
    } else {
        // Фильтруем по названию района
        filtered = hotels.filter(
            h => String(h.districtName) === String(districtName)
        );
    }

    // Создаём метку для каждой гостиницы из отфильтрованного списка
    filtered.forEach(hotel => {
        if (!hotel.coords) return;

        const placemark = new ymaps.Placemark(
            hotel.coords,
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

    // Синхронизируем глобальную переменную
    window.hotelPlacemarks = hotelPlacemarks;

    console.log('Показано гостиниц:', filtered.length);
}