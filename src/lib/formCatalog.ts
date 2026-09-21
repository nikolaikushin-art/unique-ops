/**
 * Suggestion lists for fields that are still free text (so old data and
 * anything unusual can still be typed/edited normally) but are almost
 * always one of a small set of repeated values in practice. Wiring these
 * into a field's `list`/`listOptions` gives a click-to-pick dropdown
 * without changing how the value is stored.
 */

export const VEHICLE_COLORS = [
  'Белый', 'Чёрный', 'Серый', 'Серебристый', 'Синий', 'Тёмно-синий',
  'Красный', 'Бордовый', 'Зелёный', 'Жёлтый', 'Коричневый', 'Бежевый',
  'Оранжевый', 'Фиолетовый', 'Голубой', 'Матовый чёрный', 'Матовый серый',
  'Матовый белый', 'Хамелеон',
];

export const INVENTORY_UNITS = [
  'шт', 'л', 'мл', 'кг', 'г', 'рулон', 'м', 'м²', 'уп', 'компл.', 'банка', 'бутылка',
];

export const EQUIPMENT_CONDITIONS = [
  'Отличное', 'Хорошее', 'Удовлетворительное', 'Требует ремонта', 'Списано',
];

export const HAZARD_CLASSES = [
  'Класс 3 — Легковоспламеняющиеся жидкости',
  'Класс 8 — Едкие вещества',
  'Класс 9 — Прочие опасные вещества',
  'Не классифицировано',
];

export const EMPLOYMENT_TYPES = [
  'Штат', 'Подряд', 'Совместитель', 'Стажёр',
];

export const STAFF_SPECIALIZATIONS = [
  'Технический специалист', 'Мастер детейлинга', 'Специалист по оклейке PPF',
  'Специалист по тонировке', 'Полировщик', 'Мойщик', 'Мастер-приёмщик',
  'Администратор цеха', 'Менеджер по работе с клиентами',
];
