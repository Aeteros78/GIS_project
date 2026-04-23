document.addEventListener('DOMContentLoaded', () => {
    initDistrictFilter();
    initFiltersForm();
    initSubwayStationFilter();
});

// При смене селекта района — только логируем (зум по кнопке "Применить")
function initDistrictFilter() {
    const districtSelect = document.getElementById('district');
    if (!districtSelect) {
        console.warn('Селект #district не найден');
        return;
    }

    districtSelect.addEventListener('change', () => {
        const value = districtSelect.value;
        console.log('Селект district changed, value =', value);
    });
}

// При "Применить" — зум к району и метки отелей
function initFiltersForm() {
    const filtersForm = document.querySelector('#filters-form');
    if (!filtersForm) return;

    filtersForm.addEventListener('submit', (e) => {
        e.preventDefault();
        console.log('Форма фильтров отправлена без перезагрузки');

        const map = window.map;
        const polygons = window.districtPolygons;
        if (!map || !polygons) {
            console.warn('Карта или районы ещё не инициализированы');
            return;
        }

        const districtSelect = document.getElementById('district');
        const selectedValue = districtSelect ? districtSelect.value : '';

        // Выбран пункт "Все районы"
        if (!selectedValue) {
            if (typeof showHotelsForDistrict === 'function') {
                showHotelsForDistrict(null);
            }
            if (window.allDistrictsBounds && window.map) {
                window.map.setBounds(window.allDistrictsBounds, {
                    checkZoomRange: true,
                    zoomMargin: 40
                });
            }
            return;
        }

        const districtId = Number(selectedValue);

        if (typeof focusOnDistrict === 'function') {
            focusOnDistrict(districtId);
        }

        if (typeof showHotelsForDistrict === 'function') {
            showHotelsForDistrict(districtId);
        }
    });
}

// Фильтр по станции метро
function initSubwayStationFilter() {
    const subwayStationSelect = document.getElementById('subwayStation');
    if (!subwayStationSelect) {
        console.warn('Селект #subwayStation не найден');
        return;
    }

    subwayStationSelect.addEventListener('change', () => {
        const stationId = subwayStationSelect.value || null;
        console.log('Селект subwayStation changed, value =', stationId);

        if (typeof showSubwayStations === 'function') {
            showSubwayStations(stationId); // покажет только выбранную станцию
        }
    });
}