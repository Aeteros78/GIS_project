document.addEventListener('DOMContentLoaded', () => {
    initDistrictFilter();
    initFiltersForm();
});

// Обработка выбора района в селекте
function initDistrictFilter() {
    const districtSelect = document.getElementById('district');
    if (!districtSelect) {
        console.warn('Селект #district не найден');
        return;
    }

    districtSelect.addEventListener('change', () => {
        const value = districtSelect.value;
        console.log('Селект district changed, value =', value);

        if (!value) {
            // Выбран пункт "Все районы" — сейчас ничего не делаем
            return;
        }

        const id = Number(value);
        const polygons = window.districtPolygons;
        const map = window.map;

        if (!polygons || !map) {
            console.warn('Нет карты или полигонов районов');
            return;
        }

        const poly = polygons[id];
        if (!poly) {
            console.warn('Район с id', id, 'не найден в districtPolygons');
            return;
        }

        const bounds = poly.geometry.getBounds();
        console.log('Выбор района из селекта id=', id, 'bounds=', bounds);

        if (bounds && map) {
            // Тоже используем центр вместо setBounds
            const centerLat = (bounds[0][0] + bounds[1][0]) / 2;
            const centerLon = (bounds[0][1] + bounds[1][1]) / 2;
            map.setCenter([centerLat, centerLon], 12, {
                checkZoomRange: true
            });
        }
    });
}

// ОТКЛЮЧАЕМ перезагрузку страницы при отправке формы фильтров
function initFiltersForm() {
    const filtersForm = document.querySelector('#filters-form');
    if (!filtersForm) return;

    filtersForm.addEventListener('submit', (e) => {
        e.preventDefault();
        console.log('Форма фильтров отправлена без перезагрузки');
        // Здесь позже можно добавить логику фильтрации отелей/объектов
    });
}