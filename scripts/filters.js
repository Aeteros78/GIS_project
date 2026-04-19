document.addEventListener('DOMContentLoaded', () => {
    initDistrictFilter();
    initFiltersForm();
});

function initDistrictFilter() {
    const districtSelect = document.getElementById('district');
    if (!districtSelect) {
        console.warn('Селект #district не найден');
        return;
    }

    districtSelect.addEventListener('change', () => {
        const value = districtSelect.value;
        console.log('Селект district changed, value =', value);

        if (!value) return;

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
        if (bounds) {
            map.setBounds(bounds, {
                checkZoomRange: true,
                zoomMargin: 20
            });
        }
    });
}

function initFiltersForm() {
    const filtersForm = document.querySelector('#filters-form');
    if (!filtersForm) return;

    filtersForm.addEventListener('submit', (e) => {
        e.preventDefault();
        console.log('Форма фильтров отправлена без перезагрузки');
    });
}