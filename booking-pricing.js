(function (root) {
  const MAX_SEASONAL_RATES = 20;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function isValidDateKey(value) {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1
      && date.getUTCDate() === day;
  }

  function toDateKey(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, '0'),
        String(value.getDate()).padStart(2, '0')
      ].join('-');
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const datePart = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
      if (datePart && isValidDateKey(datePart[1])) return datePart[1];
    }
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return [
      parsed.getFullYear(),
      String(parsed.getMonth() + 1).padStart(2, '0'),
      String(parsed.getDate()).padStart(2, '0')
    ].join('-');
  }

  function dateKeyToUtc(value) {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  }

  function addDays(value, days) {
    const date = new Date(dateKeyToUtc(value) + days * DAY_MS);
    return [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
  }

  function normalizeSeasonalRates(rates) {
    if (!Array.isArray(rates)) return [];
    return rates.map(rate => ({
      name: String(rate?.name || '').trim(),
      startDate: String(rate?.startDate || ''),
      endDate: String(rate?.endDate || ''),
      price: Number(rate?.price)
    })).filter(rate =>
      isValidDateKey(rate.startDate)
      && isValidDateKey(rate.endDate)
      && rate.startDate <= rate.endDate
      && Number.isFinite(rate.price)
      && rate.price >= 0
    ).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  function validateSeasonalRates(rows) {
    const errors = [];
    const rates = [];
    const source = Array.isArray(rows) ? rows : [];

    source.forEach((row, index) => {
      const name = String(row?.name || '').trim();
      const startDate = String(row?.startDate || '').trim();
      const endDate = String(row?.endDate || '').trim();
      const priceText = String(row?.price ?? '').trim();
      const rowNumber = index + 1;
      const blank = !name && !startDate && !endDate && !priceText;
      if (blank) return;

      if (name.length > 60) errors.push(`Rate ${rowNumber}: season name must be 60 characters or fewer.`);
      if (!isValidDateKey(startDate)) errors.push(`Rate ${rowNumber}: enter a valid start date.`);
      if (!isValidDateKey(endDate)) errors.push(`Rate ${rowNumber}: enter a valid end date.`);
      if (isValidDateKey(startDate) && isValidDateKey(endDate) && startDate > endDate) {
        errors.push(`Rate ${rowNumber}: end date must be on or after the start date.`);
      }
      const price = priceText === '' ? Number.NaN : Number(priceText);
      if (!Number.isFinite(price) || price < 0) {
        errors.push(`Rate ${rowNumber}: enter a nightly rate of zero or more.`);
      }

      if (
        name.length <= 60
        && isValidDateKey(startDate)
        && isValidDateKey(endDate)
        && startDate <= endDate
        && Number.isFinite(price)
        && price >= 0
      ) {
        rates.push({ name, startDate, endDate, price, rowNumber });
      }
    });

    if (rates.length > MAX_SEASONAL_RATES) {
      errors.push(`A property can have at most ${MAX_SEASONAL_RATES} seasonal date ranges.`);
    }

    const sorted = rates.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].startDate <= sorted[index - 1].endDate) {
        errors.push(`Rates ${sorted[index - 1].rowNumber} and ${sorted[index].rowNumber} overlap.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      rates: sorted.map(({ rowNumber, ...rate }) => rate)
    };
  }

  function calculateStay(property, checkin, checkout) {
    const startDate = toDateKey(checkin);
    const checkoutDate = toDateKey(checkout);
    const basePrice = Number(property?.price);
    if (!startDate || !checkoutDate || startDate >= checkoutDate) {
      return { valid: false, error: 'Choose a valid check-in and check-out date.' };
    }
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      return { valid: false, error: 'This property does not have a valid nightly rate.' };
    }

    const seasonalRates = normalizeSeasonalRates(property.seasonalRates);
    const currency = String(property.currency || 'KSh');
    const nights = (dateKeyToUtc(checkoutDate) - dateKeyToUtc(startDate)) / DAY_MS;
    const breakdown = [];
    let total = 0;
    let nightDate = startDate;

    while (nightDate < checkoutDate) {
      const season = seasonalRates.find(rate => nightDate >= rate.startDate && nightDate <= rate.endDate);
      const pricePerNight = season ? season.price : basePrice;
      const label = season ? (season.name || 'Seasonal rate') : 'Standard rate';
      const ruleKey = season ? `${season.startDate}:${season.endDate}:${season.price}` : 'standard';
      const lastLine = breakdown[breakdown.length - 1];

      if (lastLine && lastLine.ruleKey === ruleKey) {
        lastLine.nights += 1;
        lastLine.endDate = nightDate;
        lastLine.total += pricePerNight;
      } else {
        breakdown.push({
          label,
          startDate: nightDate,
          endDate: nightDate,
          nights: 1,
          pricePerNight,
          total: pricePerNight,
          currency,
          ruleKey
        });
      }

      total += pricePerNight;
      nightDate = addDays(nightDate, 1);
    }

    return {
      valid: true,
      nights,
      total,
      currency,
      basePrice,
      checkin: startDate,
      checkout: checkoutDate,
      breakdown: breakdown.map(({ ruleKey, ...line }) => line)
    };
  }

  function todayDateKey() {
    return toDateKey(new Date());
  }

  function lowestNightlyRate(property, asOfDate = todayDateKey()) {
    const basePrice = Number(property?.price);
    if (!Number.isFinite(basePrice) || basePrice < 0) return 0;
    const effectiveDate = toDateKey(asOfDate) || todayDateKey();
    const futureRates = normalizeSeasonalRates(property?.seasonalRates)
      .filter(rate => rate.endDate >= effectiveDate)
      .map(rate => rate.price);
    return Math.min(basePrice, ...futureRates);
  }

  function formatDate(value, locale = 'en-KE') {
    const dateKey = toDateKey(value);
    if (!dateKey) return String(value || '');
    const date = new Date(dateKeyToUtc(dateKey));
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(date);
  }

  root.GonahPricing = Object.freeze({
    MAX_SEASONAL_RATES,
    calculateStay,
    formatDate,
    isValidDateKey,
    lowestNightlyRate,
    normalizeSeasonalRates,
    todayDateKey,
    toDateKey,
    validateSeasonalRates
  });
})(window);
