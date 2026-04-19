// Ждём, пока загрузится API Яндекс.Карт
ymaps.ready(init);

let map;
const districtPolygons = {}; // id района -> геообъект (полигон/мультиполигон)

function init() {
    // Центр карты — Санкт-Петербург
    const centerSpb = [59.939095, 30.315868];

    map = new ymaps.Map('map', {
        center: centerSpb,
        zoom: 10,
        controls: ['zoomControl', 'typeSelector', 'fullscreenControl']
    });

    // Отключаем scrollZoom (часто он связан с ошибкой Continuous: ticking while inactive)
    map.behaviors.disable('scrollZoom');

    // Делаем карту и коллекцию районов глобально доступными
    window.map = map;
    window.districtPolygons = districtPolygons;

    loadDistrictsLayer();
}

// Переводим координаты из GeoJSON ([lon, lat]) в формат Яндекс.Карт ([lat, lon])
function convertCoords(geometryType, coords) {
    if (geometryType === 'Polygon') {
        // Polygon: [ [ [lon, lat], ... ] ]
        return coords.map(ring =>
            ring.map(point => [point[1], point[0]]) // [lat, lon]
        );
    } else if (geometryType === 'MultiPolygon') {
        // MultiPolygon: [ [ [ [lon, lat], ... ] ] ]
        return coords.map(polygon =>
            polygon.map(ring =>
                ring.map(point => [point[1], point[0]]) // [lat, lon]
            )
        );
    }
    return coords;
}

// Загрузка и отображение районов из GeoJSON
function loadDistrictsLayer() {
    fetch('data/districts_spb.geojson')
        .then(response => {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }
            return response.json();
        })
        .then(geojson => {
            const collection = new ymaps.GeoObjectCollection();
            const districtSelect = document.getElementById('district');

            // Заполняем селект, если он есть
            if (districtSelect) {
                districtSelect.innerHTML = '';
                const allOpt = document.createElement('option');
                allOpt.value = '';
                allOpt.textContent = 'Все районы';
                districtSelect.appendChild(allOpt);
            }

            geojson.features.forEach(feature => {
                const id = feature.properties.id;       // 1..18
                const name = feature.properties.name;   // "Адмиралтейский", ...
                const type = feature.geometry.type;     // 'Polygon' или 'MultiPolygon'
                const rawCoords = feature.geometry.coordinates;

                const coords = convertCoords(type, rawCoords);

                let polygon;

                if (type === 'Polygon') {
                    polygon = new ymaps.Polygon(
                        coords,
                        { id, name },
                        {
                            fillColor: '#3366ff33',
                            strokeColor: '#0000ff',
                            strokeWidth: 2
                        }
                    );
                } else if (type === 'MultiPolygon') {
                    polygon = new ymaps.GeoObject(
                        {
                            geometry: {
                                type: 'MultiPolygon',
                                coordinates: coords
                            },
                            properties: { id, name }
                        },
                        {
                            fillColor: '#3366ff33',
                            strokeColor: '#0000ff',
                            strokeWidth: 2
                        }
                    );
                } else {
                    return;
                }

                // Сохраняем по id, чтобы потом использовать в фильтрах
                districtPolygons[id] = polygon;

                // Клик по району — приблизить к его центру
                polygon.events.add('click', () => {
                    const bounds = polygon.geometry.getBounds();
                    console.log('Клик по району', id, name, 'bounds=', bounds);

                    if (bounds && map) {
                        // Вычисляем центр из bounds
                        const centerLat = (bounds[0][0] + bounds[1][0]) / 2;
                        const centerLon = (bounds[0][1] + bounds[1][1]) / 2;
                        map.setCenter([centerLat, centerLon], 12, {
                            checkZoomRange: true
                        });
                    }
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
            if (bounds) {
                map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 40 });
            }
        })
        .catch(err => {
            console.error('Ошибка загрузки districts_spb.geojson:', err);
        });
}