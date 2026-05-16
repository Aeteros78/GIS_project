// scripts/map.js

ymaps.ready(init);

// Глобальные переменные:
let map;

// Список полигонов районов: ключ = имя района, значение = Polygon
const districtPolygons = {};
let highlightedDistrict = null;

// Общие границы всех районов
let allDistrictsBounds = null;

// Данные метро
let subwayFeatures = [];
let subwayPlacemarks = [];
const subwayIconSize = [24, 24];
const subwayIconOffset = [-12, -12];

// Данные гостиниц
let hotels = [];
let hotelPlacemarks = [];

// Текущий маршрут от отеля до метро
let currentRoute = null;

// Экспорт в window
window.districtPolygons = districtPolygons;
window.showSubwayStations = showSubwayStations;
window.focusOnDistrict = focusOnDistrict;
window.showHotelsForDistrict = showHotelsForDistrict;
window.clearSubwayPlacemarks = clearSubwayPlacemarks;
window.findSubwayById = findSubwayById;
window.clearHotelPlacemarks = clearHotelPlacemarks;
window.hotels = hotels;
window.hotelPlacemarks = hotelPlacemarks;
window.highlightDistrict = highlightDistrict;
window.resetDistrictHighlight = resetDistrictHighlight;
window.findNearestSubway = findNearestSubway;
window.clearRoute = clearRoute;
window.showRouteFromHotelToSubway = showRouteFromHotelToSubway;

// ------------------------------------------------------
// ИНИЦИАЛИЗАЦИЯ КАРТЫ
// ------------------------------------------------------
function init() {
    const centerSpb = [59.939095, 30.315868];

    map = new ymaps.Map('map', {
        center: centerSpb,
        zoom: 10,
        controls: ['zoomControl', 'typeSelector', 'fullscreenControl']
    });
    window.map = map;

    loadDistrictsLayer().then(() => {
        loadHotels();
        loadSubwayLayer();
    });

    window.showHotelsWithComplexFilters = function (filters) {
        if (!map || !Array.isArray(hotels)) return;
        clearHotelPlacemarks();

        let result = hotels.slice();

        if (filters.district) {
            result = result.filter(
                h => String(h.districtName) === String(filters.district)
            );
        }

        if (filters.metro) {
            const station = findSubwayById(filters.metro);
            if (station) {
                if (!filters.district && station.districtName) {
                    result = result.filter(
                        h => String(h.districtName) === String(station.districtName)
                    );
                }
                if (station.coords && map) {
                    map.setCenter(station.coords, 14, { checkZoomRange: true });
                }
                showSubwayStations(filters.metro);
            }
        } else {
            clearSubwayPlacemarks();
        }

        if (filters.stars && filters.stars.length) {
            result = result.filter(h => filters.stars.includes(Number(h.stars)));
        }
        if (filters.breakfast && filters.breakfast.length) {
            result = result.filter(h => filters.breakfast.includes(String(h.breakfast)));
        }
        if (filters.parking && filters.parking.length) {
            result = result.filter(h => filters.parking.includes(String(h.parking)));
        }
        if (filters.price_range && filters.price_range.length) {
            result = result.filter(h => filters.price_range.includes(String(h.price_range)));
        }

        const petsFilter = (filters.pets_allowed || '').trim().toLowerCase();
        const gymFilter  = (filters.gym || '').trim().toLowerCase();
        const spaFilter  = (filters.spa || '').trim().toLowerCase();

        if (petsFilter === 'да') {
            result = result.filter(
                h => String(h.pets_allowed || '').trim().toLowerCase() === 'да'
            );
        } else if (petsFilter === 'нет') {
            result = result.filter(
                h => String(h.pets_allowed || '').trim().toLowerCase() === 'нет'
            );
        }

        if (gymFilter === 'да') {
            result = result.filter(
                h => String(h.gym || '').trim().toLowerCase() === 'да'
            );
        } else if (gymFilter === 'нет') {
            result = result.filter(
                h => String(h.gym || '').trim().toLowerCase() === 'нет'
            );
        }

        if (spaFilter === 'да') {
            result = result.filter(
                h => String(h.spa || '').trim().toLowerCase() === 'да'
            );
        } else if (spaFilter === 'нет') {
            result = result.filter(
                h => String(h.spa || '').trim().toLowerCase() === 'нет'
            );
        }

        if (!filters.district && !filters.metro && allDistrictsBounds && map) {
            map.setBounds(allDistrictsBounds, { checkZoomRange: true, zoomMargin: 40 });
        }

        redrawHotels(result);
        console.log('Показано гостиниц после всех фильтров:', result.length);
    };

    // Закрытие модального окна по крестику и фону
    const modal = document.getElementById('booking-modal');
    const closeBtn = document.getElementById('booking-modal-close');
    if (modal && closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        const backdrop = modal.querySelector('.modal__backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }
    }

    // Переключение фильтров на мобильных
    const sidebar = document.getElementById('sidebar');
    const mobileFiltersBtn = document.getElementById('mobile-filters-toggle');
    if (sidebar && mobileFiltersBtn) {
        mobileFiltersBtn.addEventListener('click', () => {
            sidebar.classList.toggle('sidebar--open');
        });
    }
}

// ------------------------------------------------------
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ПОЛИГОНОВ
// ------------------------------------------------------
function convertCoords(geometryType, coords) {
    if (geometryType === 'Polygon') {
        return coords.map(ring =>
            ring.map(point => [point[1], point[0]])
        );
    } else if (geometryType === 'MultiPolygon') {
        const mainPolygon = coords[1] && coords[1][0] ? coords[1][0] : coords[0][0];
        return [
            mainPolygon.map(point => [point[1], point[0]])
        ];
    }
    return coords;
}

// ------------------------------------------------------
// ПОДСВЕТКА РАЙОНА
// ------------------------------------------------------
function resetDistrictHighlight() {
    Object.values(districtPolygons).forEach(poly => {
        poly.options.set('fillOpacity', 0);
    });
    highlightedDistrict = null;
}
function highlightDistrict(districtName) {
    if (!districtName) {
        resetDistrictHighlight();
        return;
    }
    const poly = districtPolygons[districtName];
    if (!poly) return;
    resetDistrictHighlight();
    poly.options.set('fillOpacity', 0.5);
    highlightedDistrict = poly;
}

// ------------------------------------------------------
// РАЙОНЫ
// ------------------------------------------------------
function loadDistrictsLayer() {
    return fetch('data/districts_spb.geojson')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(geojson => {
            const collection = new ymaps.GeoObjectCollection();
            const districtSelect = document.getElementById('district');

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
                        fillColor: '#0000FF',
                        fillOpacity: 0
                    }
                );

                districtPolygons[name] = polygon;

                polygon.events.add('click', () => {
                    focusOnDistrict(name);
                    showHotelsForDistrict(name);
                });

                collection.add(polygon);

                if (districtSelect) {
                    const opt = document.createElement('option');
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

// ------------------------------------------------------
// МЕТРО
// ------------------------------------------------------
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
        opt.value = String(props.id);
        opt.textContent = props.name;
        select.appendChild(opt);
    });
    console.log('Селект станций метро заполнен');
}

function clearSubwayPlacemarks() {
    if (!map) return;
    subwayPlacemarks.forEach(pm => map.geoObjects.remove(pm));
    subwayPlacemarks = [];
}

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
        map.setCenter(coords, 14, { checkZoomRange: true });
    });
    console.log('Показано меток метро:', subwayPlacemarks.length);
}

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

// Поиск ближайшей станции метро к заданным координатам [lat, lon]
function findNearestSubway(coords) {
    if (!Array.isArray(subwayFeatures) || !subwayFeatures.length) return null;
    if (!Array.isArray(coords) || coords.length !== 2) return null;
    const [lat, lon] = coords;
    let nearest = null;
    let minDist = Infinity;
    subwayFeatures.forEach(f => {
        const geom = f.geometry || {};
        if (geom.type !== 'Point' || !Array.isArray(geom.coordinates)) return;
        const slon = geom.coordinates[0];
        const slat = geom.coordinates[1];
        const dLat = lat - slat;
        const dLon = lon - slon;
        const dist = dLat * dLat + dLon * dLon;
        if (dist < minDist) {
            minDist = dist;
            nearest = {
                feature: f,
                coords: [slat, slon]
            };
        }
    });
    return nearest;
}

// Очистка текущего маршрута
function clearRoute() {
    if (currentRoute && map) {
        map.geoObjects.remove(currentRoute);
        currentRoute = null;
    }
}

// Построение маршрута от отеля до ближайшей станции метро
function showRouteFromHotelToSubway(hotelCoords) {
    if (!map || !Array.isArray(hotelCoords)) return;
    if (!subwayFeatures || !subwayFeatures.length) {
        console.warn('Нет данных метро для построения маршрута');
        return;
    }
    const nearest = findNearestSubway(hotelCoords);
    if (!nearest) {
        console.warn('Ближайшая станция метро не найдена');
        return;
    }
    const subwayCoords = nearest.coords;
    clearRoute();
    const multiRoute = new ymaps.multiRouter.MultiRoute(
        {
            referencePoints: [
                hotelCoords,
                subwayCoords
            ],
            params: {
                routingMode: 'pedestrian'
            }
        },
        {}
    );
    map.geoObjects.add(multiRoute);
    currentRoute = multiRoute;
    multiRoute.model.events.add('requestsuccess', () => {
        const bounds = multiRoute.getBounds();
        if (bounds) {
            map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
        }
    });
}

// ------------------------------------------------------
// ГОСТИНИЦЫ (звёзды, баллон, попап)
// ------------------------------------------------------

// SVG-иконка: жёлтая звезда с цифрой (1–5) + внутренняя пульсация
function makeStarSvg(stars) {
    const n = Math.max(1, Math.min(5, Number(stars) || 0));
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="-20 -20 40 40">
  <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
    <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000000" flood-opacity="0.4"/>
  </filter>

  <polygon
    filter="url(#shadow)"
    fill="#FFD700"
    stroke="#CC9A00"
    stroke-width="2"
    points="
      0,-16
      4.7,-5.1
      15.2,-4.7
      7.6,2.3
      9.4,12.7
      0,7.5
      -9.4,12.7
      -7.6,2.3
      -15.2,-4.7
      -4.7,-5.1
    "
  >
    <animateTransform
      attributeName="transform"
      type="scale"
      values="1;1.06;1"
      dur="1.8s"
      repeatCount="indefinite"
      additive="sum"
    />
  </polygon>

  <text
    x="0"
    y="4"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="14"
    font-weight="bold"
    fill="#000000"
  >${n}</text>
</svg>
`.trim();
}

function makeStarDataUrl(stars) {
    const svg = makeStarSvg(stars);
    const encoded = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${encoded}`;
}

function getHotelIconOptions(stars) {
    const href = makeStarDataUrl(stars);
    return {
        iconLayout: 'default#image',
        iconImageHref: href,
        iconImageSize: [64, 64],
        iconImageOffset: [-32, -32]
    };
}

function loadHotels() {
    fetch('data/hotels.geojson')
        .then(r => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(geojson => {
            if (!geojson || !Array.isArray(geojson.features)) {
                console.error('Ожидался FeatureCollection с features[], а пришло:', geojson);
                hotels = [];
                return;
            }

            hotels = geojson.features.map((feature, index) => {
                const props = feature.properties || {};
                const geom = feature.geometry || {};

                if (geom.type !== 'Point' || !Array.isArray(geom.coordinates)) {
                    return null;
                }

                const lon = geom.coordinates[0];
                const lat = geom.coordinates[1];

                if (typeof lat !== 'number' || typeof lon !== 'number') {
                    return null;
                }

                return {
                    id: props.id ?? index + 1,
                    name: props.name,
                    address: props.address,
                    stars: props.stars,
                    districtName: props.district_id,
                    website: props.website,
                    tel: props.tel,
                    coords: [lat, lon],
                    breakfast: props.breakfast,
                    parking: props.parking,
                    price_range: props.price_range,
                    pets_allowed: props.pets_allowed,
                    gym: props.gym,
                    spa: props.spa
                };
            }).filter(h => h !== null);

            console.log('Загружено гостиниц:', hotels.length);
            window.hotels = hotels;
            showHotelsForDistrict(null);
        })
        .catch(err => {
            console.error('Ошибка загрузки hotels.geojson:', err);
        });
}

function clearHotelPlacemarks() {
    if (!map) return;
    hotelPlacemarks.forEach(pm => map.geoObjects.remove(pm));
    hotelPlacemarks = [];
    window.hotelPlacemarks = hotelPlacemarks;
}

function showHotelsForDistrict(districtName) {
    if (!map || !hotels) {
        console.log('Нет карты или списка гостиниц', map, hotels);
        return;
    }
    let filtered;
    if (!districtName) {
        filtered = hotels;
    } else {
        filtered = hotels.filter(
            h => String(h.districtName) === String(districtName)
        );
    }
    redrawHotels(filtered);
}

function redrawHotels(hotelsArray) {
    clearHotelPlacemarks();

    hotelsArray.forEach(hotel => {
        if (!hotel.coords) return;

        const balloonHtml = `
            <div class="hotel-balloon">
                <div><strong>Адрес:</strong> ${hotel.address || ''}</div>
                <div><strong>Звёзд:</strong> ${hotel.stars || '—'}</div>
                <div><strong>Завтрак:</strong> ${hotel.breakfast || '—'}</div>
                <div><strong>Парковка:</strong> ${hotel.parking || '—'}</div>
                <div><strong>Цена:</strong> ${hotel.price_range || '—'}</div>
                <div><strong>Питомцы:</strong> ${hotel.pets_allowed || '—'}</div>
                <div><strong>Зал:</strong> ${hotel.gym || '—'}</div>
                <div><strong>SPA:</strong> ${hotel.spa || '—'}</div>
                <button 
                    type="button" 
                    class="hotel-book-btn"
                    data-hotel-id="${hotel.id}"
                >
                    Забронировать
                </button>
            </div>
        `;

        const iconOptions = getHotelIconOptions(hotel.stars);

        const placemark = new ymaps.Placemark(
            hotel.coords,
            {
                balloonContentHeader: hotel.name,
                balloonContentBody: balloonHtml,
                hintContent: hotel.name
            },
            iconOptions
        );

        placemark.events.add('click', () => {
            if (map && hotel.coords) {
                map.setCenter(hotel.coords, 15, { checkZoomRange: true });
            }
            showRouteFromHotelToSubway(hotel.coords);
        });

        placemark.events.add('balloonopen', () => {
            const btns = document.querySelectorAll(
                `.hotel-book-btn[data-hotel-id="${hotel.id}"]`
            );
            btns.forEach(btn => {
                btn.onclick = () => {
                    openBookingModal(hotel);
                };
            });
        });

        map.geoObjects.add(placemark);
        hotelPlacemarks.push(placemark);
    });

    window.hotelPlacemarks = hotelPlacemarks;
    console.log('Показано гостиниц:', hotelsArray.length);
}

// Модальное окно бронирования: ставим название, телефон и сайт
function openBookingModal(hotel) {
    const modal = document.getElementById('booking-modal');
    if (!modal) {
        const lines = [];
        lines.push(`Гостиница: ${hotel.name || ''}`);
        if (hotel.tel) {
            lines.push(`Телефон: ${hotel.tel}`);
        }
        if (hotel.website) {
            lines.push(`Сайт: ${hotel.website}`);
        }
        alert(lines.join('\n'));
        return;
    }

    const nameEl = document.getElementById('booking-hotel-name');
    const phoneEl = document.getElementById('booking-hotel-phone');
    const siteEl = document.getElementById('booking-hotel-website');

    if (nameEl) {
        nameEl.textContent = hotel.name || '';
    }

    if (phoneEl) {
        const rawPhone = (hotel.tel || '').toString().trim();
        const displayPhone = rawPhone || 'не указан';

        phoneEl.textContent = displayPhone;
        if (rawPhone) {
            const telHref = 'tel:' + rawPhone.replace(/[^\d+]/g, '');
            phoneEl.href = telHref;
            phoneEl.target = '_self';
        } else {
            phoneEl.href = '#';
            phoneEl.target = '_self';
        }
    }

    if (siteEl) {
        const site = (hotel.website || '').toString().trim();
        if (site) {
            siteEl.textContent = 'Перейти на сайт';
            siteEl.href = site;
            siteEl.target = '_blank';
        } else {
            siteEl.textContent = 'не указан';
            siteEl.href = '#';
            siteEl.target = '_self';
        }
    }

    modal.classList.remove('hidden');
}