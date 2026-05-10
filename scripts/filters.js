document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('filters-form');
    const districtSelect = document.getElementById('district');
    const subwaySelect = document.getElementById('subwayStation');

    const starsCheckboxes = document.querySelectorAll('input[name="stars"]');
    const breakfastCheckboxes = document.querySelectorAll('input[name="breakfast"]');
    const parkingCheckboxes = document.querySelectorAll('input[name="parking"]');
    const priceCheckboxes = document.querySelectorAll('input[name="price_range"]');

    const resetButton = document.getElementById('reset-filters');

    if (!form) {
        console.warn('Форма #filters-form не найдена');
        return;
    }

    // Обработка "Применить фильтры"
    form.addEventListener('submit', (e) => {
        e.preventDefault();

        const districtName = districtSelect ? districtSelect.value : '';
        const stationId = subwaySelect ? subwaySelect.value : '';

        const selectedStars = Array.from(starsCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => Number(cb.value));

        const selectedBreakfast = Array.from(breakfastCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);  // "Нет завтрака", "Континентальный завтрак", "Шведский стол"

        const selectedParking = Array.from(parkingCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);  // "Нет парковки", "Бесплатная парковка", "Платная парковка"

        const selectedPriceRange = Array.from(priceCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);  // "До 500", "с 501-1500", ...

        const getRadioValue = (name) => {
            const checked = document.querySelector(`input[name="${name}"]:checked`);
            return checked ? checked.value : '';
        };

        const petsValue = getRadioValue('pets_allowed'); // "", "да", "нет"
        const gymValue  = getRadioValue('gym');          // "", "да", "нет"
        const spaValue  = getRadioValue('spa');          // "", "да", "нет"

        const filters = {
            district: districtName || '',
            metro: stationId || '',
            stars: selectedStars,
            breakfast: selectedBreakfast,
            parking: selectedParking,
            price_range: selectedPriceRange,
            pets_allowed: petsValue,
            gym: gymValue,
            spa: spaValue
        };

        console.log('Применяем фильтры:', filters);

        if (typeof clearSubwayPlacemarks === 'function') {
            clearSubwayPlacemarks();
        }

        if (typeof showHotelsWithComplexFilters === 'function') {
            showHotelsWithComplexFilters(filters);
        } else {
            console.warn('showHotelsWithComplexFilters не определена в map.js');
        }
    });

    // Обработка "Сбросить"
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            console.log('Нажата кнопка "Сбросить"');
            form.reset();

            if (typeof clearSubwayPlacemarks === 'function') {
                clearSubwayPlacemarks();
            }

            if (typeof showHotelsForDistrict === 'function') {
                showHotelsForDistrict(null);
            }

            if (window.allDistrictsBounds && window.map) {
                window.map.setBounds(window.allDistrictsBounds, {
                    checkZoomRange: true,
                    zoomMargin: 40
                });
            }
        });
    }
});