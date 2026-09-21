/* eslint-disable @typescript-eslint/no-explicit-any */
/** Demo data loaded once into the browser on first launch. */
type Row = Record<string, any>;

const id = (prefix: string, n: number) => {
  const hex = (prefix + n).split('').map((c) => c.charCodeAt(0).toString(16)).join('').padEnd(32, '0').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const DAY = 86400000;
const at = (days: number, hour = 10, min = 0) => {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return new Date(d.getTime() + days * DAY).toISOString();
};

export function buildSeed(): Record<string, Row[]> {
  const now = new Date().toISOString();
  const base = (r: Row): Row => ({ created_at: at(-60), updated_at: now, ...r });

  const customers: Row[] = [
    ['Алексей Смирнов', '+7 916 100-20-30', 'a.smirnov@example.com', 'vip', 385000, 7],
    ['Мария Волкова', '+7 903 555-11-22', 'maria.v@example.com', 'active', 124000, 3],
    ['Дмитрий Орлов', '+7 925 777-88-99', 'd.orlov@example.com', 'active', 96000, 2],
    ['Елена Кузнецова', '+7 985 321-45-67', 'e.kuz@example.com', 'vip', 512000, 9],
    ['Иван Петров', '+7 910 222-33-44', 'ivan.p@example.com', 'active', 58000, 1],
    ['Ольга Соколова', '+7 977 654-32-10', 'o.sokolova@example.com', 'sleeping', 42000, 1],
    ['Сергей Морозов', '+7 999 888-77-66', 's.morozov@example.com', 'active', 210000, 4],
    ['Анна Лебедева', '+7 903 111-00-99', 'anna.l@example.com', 'active', 73000, 2],
  ].map(([full_name, phone, email, status, lifetime_value, visit_count], i) =>
    base({ id: id('cus', i), profile_id: null, full_name, phone, email, address: 'Москва', notes: null, status, lifetime_value, visit_count, last_visit_at: at(-(i * 6 + 2)) }),
  );

  const vehiclesRaw = [
    ['Porsche', '911 Carrera', 2022, 'Чёрный', 'А001АА77', 0, 'in_progress'],
    ['BMW', 'M5 Competition', 2021, 'Серый', 'В777ВВ77', 1, 'inspection'],
    ['Mercedes-Benz', 'G63 AMG', 2023, 'Белый', 'Е123КХ99', 2, 'quality_check'],
    ['Audi', 'RS6 Avant', 2022, 'Синий', 'К555КК77', 3, 'vehicle_received'],
    ['Tesla', 'Model S Plaid', 2023, 'Красный', 'М321МР97', 4, 'new'],
    ['Range Rover', 'Sport', 2021, 'Зелёный', 'Н900НН77', 5, 'completed'],
    ['Lexus', 'LX 600', 2023, 'Чёрный', 'О111ОО99', 6, 'in_progress'],
    ['Bentley', 'Continental GT', 2020, 'Бежевый', 'Р222РР77', 7, 'delivered'],
    ['Toyota', 'Land Cruiser 300', 2022, 'Белый', 'С333СС77', 0, 'scheduled'],
    ['Porsche', 'Cayenne Coupe', 2021, 'Серебристый', 'Т444ТТ99', 3, 'in_progress'],
  ];
  const vehicles: Row[] = vehiclesRaw.map(([brand, model, year, color, reg, ci, stage], i) =>
    base({
      id: id('veh', i), customer_id: customers[ci as number].id, brand, model, year, color,
      registration_number: reg, vin: null, maintenance_notes: null, pipeline_stage: stage,
      intake_at: at(-(i % 4)), eta_at: at((i % 5) + 1, 17),
    }),
  );

  const servicesRaw = [
    ['PPF — полная оклейка кузова', 'ppf', 480, 320000],
    ['PPF — передняя часть', 'ppf', 240, 95000],
    ['Керамическое покрытие Gyeon', 'coating', 360, 78000],
    ['Полировка кузова (3 этапа)', 'polishing', 420, 55000],
    ['Химчистка салона', 'interior', 240, 32000],
    ['Тонировка стёкол', 'protection', 180, 24000],
    ['Антидождь и защита стёкол', 'protection', 60, 8000],
    ['Детейлинг-мойка премиум', 'wash', 120, 12000],
  ];
  const services: Row[] = servicesRaw.map(([name, category, duration_minutes, price], i) =>
    base({
      id: id('srv', i), name, description: null, category, subcategory: null, difficulty_level: null,
      duration_minutes, price, base_price: price, min_price: null, max_price: null, labour_hours: (duration_minutes as number) / 60,
      vehicle_types: [], vehicle_pricing: {}, customer_instructions: null, equipment_required: [], is_package: false,
      required_technician_role: null, required_equipment: null, materials: [], required_skills: [], is_active: true,
    }),
  );

  const staff: Row[] = [
    ['Артём Воронов', 'Мастер PPF', 8, 85],
    ['Никита Белов', 'Полировщик', 5, 70],
    ['Игорь Захаров', 'Мастер керамики', 6, 60],
    ['Павел Егоров', 'Химчистка / интерьер', 3, 45],
    ['Светлана Ермакова', 'Администратор', 4, 30],
  ].map(([full_name, role, experience_years, workload_pct], i) =>
    base({
      id: id('stf', i), profile_id: null, full_name, role, skills: [], workload_pct, experience_years, is_active: true,
      employee_id: `EMP-${100 + i}`, phone: `+7 900 000-00-0${i}`, email: `staff${i}@uniquedetailing.local`,
      employment_status: 'active', department: 'Студия', availability_status: 'available',
    }),
  );

  const statuses = ['in_progress', 'confirmed', 'quality_check', 'vehicle_received', 'new_enquiry', 'completed', 'in_progress', 'delivered', 'confirmed', 'in_progress', 'completed', 'confirmed'];
  const payments = ['unpaid', 'partial', 'unpaid', 'partial', 'unpaid', 'paid', 'partial', 'paid', 'unpaid', 'partial', 'paid', 'unpaid'];
  const bookings: Row[] = statuses.map((status, i) => {
    const veh = vehicles[i % vehicles.length];
    const srv = services[i % services.length];
    const done = status === 'completed' || status === 'delivered';
    return base({
      id: id('bok', i), customer_id: veh.customer_id, vehicle_id: veh.id, service_id: srv.id,
      scheduled_at: at(done ? -(i + 1) : (i % 6) - 1, 9 + (i % 6)), bay: `Пост ${(i % 3) + 1}`,
      assigned_technician_id: staff[i % 4].id, status, payment_status: payments[i], priority: i % 5 === 0 ? 'high' : 'normal',
      estimated_value: srv.price, internal_notes: null, eta_at: at((i % 5) + 1, 17), completed_at: done ? at(-i) : null,
      before_photos: [], after_photos: [], notes: null,
    });
  });

  const invoices: Row[] = [
    ['paid', 95000, -20], ['paid', 320000, -14], ['pending', 78000, 5], ['overdue', 55000, -6],
    ['pending', 32000, 9], ['paid', 24000, -3], ['overdue', 12000, -10], ['pending', 240000, 14],
  ].map(([status, amount, due], i) =>
    base({
      id: id('inv', i), invoice_number: `INV-${String(i + 1).padStart(4, '0')}`, order_id: null,
      customer_id: customers[i % customers.length].id, description: services[i % services.length].name,
      amount, status, due_date: at(due as number).slice(0, 10), pdf_url: null, sent_at: null, last_sent_to: null,
      payment_url: null, yookassa_payment_id: null, paid_at: status === 'paid' ? at(-2) : null,
      created_at: at((due as number) - 7),
    }),
  );

  const suppliers: Row[] = [
    ['Gyeon Russia', 'orders@gyeon.example', '+7 495 000-11-22'],
    ['XPEL Distribution', 'sales@xpel.example', '+7 495 000-33-44'],
    ['Detail Supply', 'info@detailsupply.example', '+7 495 000-55-66'],
  ].map(([name, contact_email, contact_phone], i) => base({ id: id('sup', i), name, contact_email, contact_phone, notes: null }));

  const inventory: Row[] = [
    ['Плёнка PPF XPEL Ultimate', 'material', 'ppf', 'рулон', 12, 4, 46000, 62000, 0],
    ['Керамика Gyeon Q² Mohs+', 'product', 'ceramic', 'шт', 6, 8, 9800, 14500, 0],
    ['Полировальная паста Menzerna', 'product', 'polish', 'шт', 18, 6, 2400, 3900, 2],
    ['Микрофибра премиум', 'material', 'consumable', 'шт', 60, 40, 180, 350, 2],
    ['Очиститель салона Koch Chemie', 'product', 'interior', 'л', 9, 10, 1700, 2600, 2],
    ['Тонировочная плёнка LLumar', 'material', 'tint', 'рулон', 5, 2, 12000, 18000, 1],
    ['Шампунь pH-нейтральный', 'product', 'wash', 'л', 22, 8, 900, 1500, 2],
    ['Абразивные диски 150 мм', 'material', 'polish', 'шт', 35, 20, 320, 600, 2],
  ].map(([name, type, category, unit, stock_level, min_stock_level, unit_cost, selling_price, sup], i) =>
    base({
      id: id('inv_item', i), name, type, supplier: suppliers[sup as number].name, description: null, stock_level, min_stock_level, unit,
      image_r2_key: null, catalog_r2_key: null, safety_r2_key: null, category, subcategory: null, brand: null, sku: `SKU-${1000 + i}`,
      barcode: null, unit_cost, selling_price, storage_location: 'Склад A', is_active: true, compatible_services: null,
    }),
  );

  // owner_id, next_action_at (relative days, null = none) and tags vary so the
  // follow-up / attention views and filters have something real to show.
  const leadsRaw: [string, string, string, string, string, string, number | null, string[], number | null, string | null][] = [
    ['Виктор', 'Ильин', 'website', 'new', 'Audi', 'Q8', 4, ['vip-interest'], -3, null],
    ['Полина', 'Громова', 'instagram', 'contacted', 'BMW', 'X6', 4, ['instagram-ads'], 0, null],
    ['Кирилл', 'Фёдоров', 'whatsapp', 'qualified', 'Porsche', 'Macan', 0, ['ppf', 'hot'], 1, null],
    ['Юлия', 'Никитина', 'phone', 'new', 'Tesla', 'Model Y', 3, ['coating'], -1, null],
    ['Роман', 'Тихонов', 'referral', 'lost', 'Mercedes-Benz', 'S-Class', 1, [], null, 'Выбрали другую студию (дешевле)'],
    ['Алексей', 'Смирнов', 'phone', 'junk', 'Kia', 'Rio', null, [], null, null],
    ['Наталья', 'Букина', 'website', 'new', 'Range Rover', 'Velar', null, ['vip-interest'], -5, null],
    ['Максим', 'Соснин', 'instagram', 'contacted', 'Lexus', 'LX 600', 4, ['ppf'], 2, null],
    ['Дарья', 'Гринёва', 'whatsapp', 'new', 'BMW', 'X7', 0, [], null, null],
    ['Егор', 'Кабанов', 'referral', 'qualified', 'Porsche', '911 Turbo', 1, ['hot', 'ppf'], 0, null],
    ['Вероника', 'Ильюшина', 'phone', 'contacted', 'Mercedes-Benz', 'GLE', 3, [], 5, null],
    ['Тимур', 'Асланов', 'website', 'new', 'Audi', 'RS7', null, ['coating'], -2, null],
    ['Оксана', 'Реброва', 'instagram', 'qualified', 'Tesla', 'Model X', 4, ['hot'], 1, null],
    ['Глеб', 'Панфилов', 'whatsapp', 'lost', 'Kia', 'Sportage', 1, [], null, 'Не отвечает на звонки — 3 попытки'],
    ['Ирина', 'Ковтун', 'referral', 'new', 'Range Rover', 'Autobiography', 0, ['vip-interest'], -1, null],
    ['Артур', 'Мхитарян', 'phone', 'contacted', 'Lexus', 'RX 500h', 3, [], 3, null],
    ['Софья', 'Ларькина', 'website', 'converted', 'BMW', 'M3', null, [], null, null],
    ['Данила', 'Востриков', 'instagram', 'junk', 'Bentley', 'Bentayga', null, [], null, null],
  ];
  const LEAD_SEED_SERVICE = ['ppf', 'coating', 'polish', 'detailing', 'interior', 'ppf', 'coating', 'noise'];
  const LEAD_SEED_VALUE = [180000, 65000, 35000, 250000, 18000, 120000, 70000, 45000];
  const leads: Row[] = leadsRaw.map(([full_name, last_name, source, status, car_brand, car_model, ownerIdx, tags, nextActionDays, lost_reason], i) => {
    const isOpen = !['converted', 'lost', 'junk'].includes(status);
    // Roughly a third of open leads haven't been touched in 3+ days, so the
    // "stale" filter actually has something to demo on a fresh install.
    const staleDemo = isOpen && i % 3 === 0;
    return base({
      id: id('led', i), full_name, last_name, phone: `+7 900 100-10-${String(10 + i).slice(-2)}`, email: i % 3 === 0 ? `${full_name.toLowerCase()}@example.com` : null,
      car_brand, car_model, source, status,
      converted_customer_id: status === 'converted' ? customers[0].id : null,
      notes: null,
      owner_id: ownerIdx === null ? null : staff[ownerIdx as number].id,
      tags,
      next_action_at: nextActionDays === null ? null : at(nextActionDays, 9 + (i % 6)),
      next_action_note: nextActionDays === null ? null : ['Перезвонить', 'Отправить КП', 'Уточнить бюджет', 'Согласовать дату визита'][i % 4],
      lost_reason,
      service_interest: LEAD_SEED_SERVICE[i % LEAD_SEED_SERVICE.length],
      est_value: ['lost', 'junk'].includes(status) ? null : LEAD_SEED_VALUE[i % LEAD_SEED_VALUE.length],
      created_at: at(-(i % 12) - 1),
      updated_at: staleDemo ? at(-(4 + (i % 5))) : now,
    });
  });

  const activityTemplates: Record<string, string> = {
    new: 'Лид создан',
    contacted: 'Связались с клиентом, обсудили запрос',
    qualified: 'Лид квалифицирован — есть бюджет и сроки',
    converted: 'Лид конвертирован в клиента',
    lost: 'Лид отмечен как потерянный',
    junk: 'Лид отмечен как спам',
  };
  const lead_activities: Row[] = [];
  leads.forEach((lead, i) => {
    lead_activities.push(base({
      id: id('lac', i * 3), lead_id: lead.id, type: 'status_change', body: activityTemplates.new,
      author_id: lead.owner_id, created_at: lead.created_at,
    }));
    if (lead.status !== 'new') {
      lead_activities.push(base({
        id: id('lac', i * 3 + 1), lead_id: lead.id,
        type: lead.status === 'converted' ? 'converted' : 'status_change',
        body: activityTemplates[lead.status] ?? 'Статус обновлён',
        author_id: lead.owner_id, created_at: at(-(i % 12)),
      }));
    }
    if (i % 4 === 0) {
      lead_activities.push(base({
        id: id('lac', i * 3 + 2), lead_id: lead.id, type: 'note',
        body: 'Клиент интересовался сроками выполнения работ.',
        author_id: lead.owner_id, created_at: at(-(i % 12) + 0.3),
      }));
    }
  });

  const communications: Row[] = [
    ['inbound', 'Запись на PPF', 'Здравствуйте! Хочу записаться на оклейку передней части Audi RS6. Какие даты свободны?', 'enquiry', 3],
    ['outbound', 'Ваш автомобиль готов', 'Добрый день! Ваш автомобиль готов к выдаче. Ждём вас в студии.', 'notification', 5],
    ['inbound', 'Вопрос по керамике', 'Подскажите, сколько держится покрытие и как за ним ухаживать?', 'enquiry', 1],
  ].map(([direction, subject, content, message_type, ci], i) =>
    base({
      id: id('com', i), customer_id: customers[ci as number].id, channel: 'email', direction, content, sent_at: at(-i),
      created_by: null, subject, recipient_email: customers[ci as number].email, sender_email: 'info@uniquedetailing.local',
      body_text: content, body_html: null, email_status: 'sent', message_type,
      read_at: direction === 'outbound' ? at(-i) : null, is_important: false, is_draft: false, is_archived: false, is_deleted: false, is_spam: false, attachment_keys: [],
    }),
  );

  const profiles: Row[] = [
    base({
      id: id('prf', 0), email: 'info@uniquedetailing.ru', full_name: 'Unique Detailing Admin', role: 'super_admin',
      phone: null, avatar_url: null, is_active: true, invited_at: null, verified_at: now, must_change_password: false,
    }),
  ];

  const internal_alerts: Row[] = [
    base({ id: id('alr', 0), type: 'inventory', title: 'Низкий остаток', body: 'Керамика Gyeon Q² Mohs+ — ниже минимального остатка.', is_read: false, target_role: null, created_at: at(-0.2) }),
    base({ id: id('alr', 1), type: 'payment', title: 'Просроченный счёт', body: 'INV-0004 просрочен на 6 дней.', is_read: false, target_role: null, created_at: at(-0.5) }),
  ];

  const staff_tasks: Row[] = staff.slice(0, 3).map((s, i) =>
    base({ id: id('tsk', i), staff_id: s.id, title: ['Подготовить пост к PPF', 'Инвентаризация склада', 'Проверка качества RS6'][i], description: null, status: 'pending', deadline: at(i + 1), assigned_by: null, completed_at: null }),
  );

  const studio_settings: Row[] = [
    base({ id: id('set', 0), key: 'studio_profile', value: { name: 'Unique Detailing', city: 'Москва' } }),
  ];

  return {
    profiles, customers, vehicles, services, staff, bookings, invoices, suppliers,
    inventory_items: inventory, leads, lead_activities, communications, internal_alerts, staff_tasks, studio_settings,
  };
}
