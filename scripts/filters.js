// Ждём полной загрузки DOM, чтобы элементы формы уже существовали
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('filters-form');
    const districtSelect = document.getElementById('district');
    const subwaySelect = document.getElementById('subwayStation');
    const starsCheckboxes = document.querySelectorAll('input[name="stars"]');
    const resetButton = document.getElementById('reset-filters');

    if (!form) {
        console.warn('Форма #filters-form не найдена');
        return;
    }

    // При выборе района/станции метро/чекбоксов мы только логируем изменение.
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

    if (starsCheckboxes && starsCheckboxes.length) {
        starsCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const selected = Array.from(starsCheckboxes)
                    .filter(c => c.checked)
                    .map(c => c.value);
                console.log('Чекбоксы звёзд изменены, выбрано:', selected);
            });
        });
    }

    // Обработка нажатия кнопки "Применить фильтры"
    form.addEventListener('submit', (e) => {
        e.preventDefault(); // не даём браузеру перезагружать страницу
        console.log('Форма фильтров отправлена без перезагрузки');

        const districtName = districtSelect ? districtSelect.value : '';
        const stationId = subwaySelect ? subwaySelect.value : '';

        // Собираем выбранные звёзды в массив чисел: [5,4,...]
        const selectedStars = starsCheckboxes && starsCheckboxes.length
            ? Array.from(starsCheckboxes)
                .filter(cb => cb.checked)
                .map(cb => Number(cb.value))
            : [];

        console.log('Применяем фильтры: district =', districtName,
                    ', stationId =', stationId,
                    ', stars =', selectedStars);

        // Перед любыми действиями с метро очищаем метки метро
        if (typeof clearSubwayPlacemarks === 'function') {
            clearSubwayPlacemarks();
        }

        /**
         * Вспомогательная функция:
         * показать отели по району dName (или все, если dName=null),
         * затем дополнительно отфильтровать по звёздам (если чекбоксы выбраны).
         */
        function showHotelsWithStarsFilter(dName) {
            if (typeof showHotelsForDistrict !== 'function') {
                console.error('showHotelsForDistrict не определена');
                return;
            }

            // Базовый фильтр по району (или все)
            showHotelsForDistrict(dName);

            // Если ни одна звёздность не выбрана — дополнительных фильтров нет
            if (!selectedStars.length) return;

            // Проверяем, что глобальный массив hotels доступен
            if (!window.hotels || !Array.isArray(window.hotels)) return;

            // Удаляем все нарисованные метки отелей, чтобы нарисовать только подходящие
            if (typeof clearHotelPlacemarks === 'function') {
                clearHotelPlacemarks();
            }

            // Сужаем список отелей: сначала по району, потом по звёздам
            const filteredByDistrict = !dName
                ? window.hotels
                : window.hotels.filter(h => String(h.districtName) === String(dName));

            const finalHotels = filteredByDistrict.filter(h =>
                selectedStars.includes(Number(h.stars))
            );

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

        // 4) НИЧЕГО не выбрано (нет района и станции)
        console.log('Фильтр: нет района и станции — показываем все отели (с учётом звёзд, если выбраны)');

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

            // Сбрасываем значения селектов в исходное состояние
            if (districtSelect) districtSelect.value = '';
            if (subwaySelect) subwaySelect.value = '';

            // Снимаем все чекбоксы звёздности
            if (starsCheckboxes && starsCheckboxes.length) {
                starsCheckboxes.forEach(cb => { cb.checked = false; });
            }

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