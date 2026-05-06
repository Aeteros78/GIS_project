// scripts/filters.js

// Ждём полной загрузки DOM, чтобы элементы формы уже существовали
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('filters-form');
    const districtSelect = document.getElementById('district');
    const subwaySelect = document.getElementById('subwayStation');
    const starsSelect = document.getElementById('stars');
    const resetButton = document.getElementById('reset-filters');

    if (!form) {
        console.warn('Форма #filters-form не найдена');
        return;
    }

    // При выборе района/станции метро/звёздности мы только логируем изменение.
    // Никаких изменений на карте сразу не делаем — всё по кнопке "Применить".
    if (districtSelect) {
        districtSelect.addEventListener('change', (e) => {
            console.log('Селект district changed, value =', e.target.value);
        });
    }

    if (subwaySelect) {
        subwaySelect.addEventListener('change', (e) => {
            console.log('Селект subwayStation changed, value =', e.target.value);
        });
    }

    if (starsSelect) {
        starsSelect.addEventListener('change', (e) => {
            console.log('Селект stars changed, value =', e.target.value);
        });
    }

    // Обработка нажатия кнопки "Применить фильтры"
    form.addEventListener('submit', (e) => {
        e.preventDefault(); // не даём браузеру перезагружать страницу
        console.log('Форма фильтров отправлена без перезагрузки');

        const districtName = districtSelect ? districtSelect.value : '';
        const stationId = subwaySelect ? subwaySelect.value : '';
        const starsValue = starsSelect ? starsSelect.value : '';

        console.log('Применяем фильтры: district =', districtName,
                    ', stationId =', stationId,
                    ', stars =', starsValue);

        // Перед любыми действиями с метро очищаем метки метро
        if (typeof clearSubwayPlacemarks === 'function') {
            clearSubwayPlacemarks();
        }

        /**
         * Вспомогательная функция:
         * показать отели по району dName (или все, если dName=null),
         * затем дополнительно отфильтровать по звёздам (если выбраны).
         */
        function showHotelsWithStarsFilter(dName) {
            if (typeof showHotelsForDistrict !== 'function') {
                console.error('showHotelsForDistrict не определена');
                return;
            }

            // Базовый фильтр по району (или все)
            showHotelsForDistrict(dName);

            // Если звёздность не выбрана (пункт "Любая"), дополнительных фильтров нет
            if (!starsValue) return;

            // Проверяем, что глобальный массив hotels доступен
            if (!window.hotels || !Array.isArray(window.hotels)) return;

            // Удаляем все нарисованные метки отелей, чтобы нарисовать только подходящие
            if (typeof clearHotelPlacemarks === 'function') {
                clearHotelPlacemarks();
            }

            const targetStars = Number(starsValue);

            // Сужаем список отелей: сначала по району, потом по звёздам
            const filteredByDistrict = !dName
                ? window.hotels
                : window.hotels.filter(h => String(h.districtName) === String(dName));

            const finalHotels = filteredByDistrict.filter(h => Number(h.stars) === targetStars);

            // Рисуем на карте отфильтрованные отели
            finalHotels.forEach(hotel => {
                if (!window.map || !hotel.coords) return;

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

                window.map.geoObjects.add(placemark);
                if (window.hotelPlacemarks) {
                    window.hotelPlacemarks.push(placemark);
                }
            });

            console.log('Показано гостиниц после фильтра по звёздам:', finalHotels.length);
        }

        // ------------------ ЛОГИКА КОМБИНАЦИЙ ФИЛЬТРОВ ----------------------

        // 1) Выбран ТОЛЬКО район
        if (districtName && !stationId) {
            console.log('Фильтр: ТОЛЬКО район');

            // Приближаем карту к району
            if (typeof focusOnDistrict === 'function') {
                focusOnDistrict(districtName);
            }

            // Отображаем гостиницы района (и, при необходимости, по звёздам)
            showHotelsWithStarsFilter(districtName);
            return;
        }

        // 2) Выбрана ТОЛЬКО станция метро
        if (!districtName && stationId) {
            console.log('Фильтр: ТОЛЬКО станция метро');

            if (typeof findSubwayById !== 'function') {
                console.error('findSubwayById не определена');
                return;
            }

            // Находим станцию в массиве subwayFeatures
            const station = findSubwayById(stationId);
            if (!station) {
                console.warn('Станция метро не найдена для id =', stationId);
                return;
            }

            const stDistrict = station.districtName;
            console.log('Станция метро в районе:', stDistrict);

            // Зум на станцию метро
            if (window.map && station.coords) {
                map.setCenter(station.coords, 14, { checkZoomRange: true });
            }

            // Показать отели района станции (с учётом звёзд, если выбраны)
            if (stDistrict) {
                showHotelsWithStarsFilter(stDistrict);
            } else {
                // если у станции нет указанного района – показываем все отели
                showHotelsWithStarsFilter(null);
            }

            // Отрисовать иконку самой станции метро
            if (typeof showSubwayStations === 'function') {
                showSubwayStations(stationId);
            }

            return;
        }

        // 3) Выбраны И район, И станция метро
        if (districtName && stationId) {
            console.log('Фильтр: район И станция метро');

            // Приближаем карту к району
            if (typeof focusOnDistrict === 'function') {
                focusOnDistrict(districtName);
            }

            // Показываем отели выбранного района (с учётом звёзд)
            showHotelsWithStarsFilter(districtName);

            // Показать/выделить конкретную станцию метро (иконка)
            if (typeof showSubwayStations === 'function') {
                showSubwayStations(stationId);
            }

            return;
        }

        // 4) НИЧЕГО не выбрано (нет района, станции и/или звёздности)
        console.log('Фильтр: ничего не выбрано — показываем все отели (с учётом звёзд, если заданы)');

        // Показать все отели (или по звёздам, если выбраны)
        showHotelsWithStarsFilter(null);

        // Метро при этом не показываем
        if (typeof clearSubwayPlacemarks === 'function') {
            clearSubwayPlacemarks();
        }
    });

    // Обработка нажатия кнопки "Сбросить"
    // Возвращаем состояние карты и фильтров к исходному (как при открытии сайта).
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            console.log('Нажата кнопка "Сбросить"');

            // Сбрасываем значения всех селектов в исходное состояние
            if (districtSelect) districtSelect.value = '';
            if (subwaySelect) subwaySelect.value = '';
            if (starsSelect) starsSelect.value = '';

            // Убираем метки метро
            if (typeof clearSubwayPlacemarks === 'function') {
                clearSubwayPlacemarks();
            }

            // Показываем все отели (без фильтров)
            if (typeof showHotelsForDistrict === 'function') {
                showHotelsForDistrict(null);
            }

            // Возвращаем карту к границам всех районов (весь город)
            if (window.allDistrictsBounds && window.map) {
                window.map.setBounds(window.allDistrictsBounds, {
                    checkZoomRange: true,
                    zoomMargin: 40
                });
            }
        });
    }
});