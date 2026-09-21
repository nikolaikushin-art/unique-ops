/**
 * Car make/model catalog powering the autocomplete dropdown on the vehicle
 * form (Марка / Модель) and the Leads car fields. Picking a suggestion is
 * faster than typing, but the fields stay plain text inputs underneath — any
 * make/model not in this list can still be typed in by hand and is saved as
 * entered.
 */
export const CAR_MAKES = [
  // German
  'BMW', 'Mercedes-Benz', 'Audi', 'Porsche', 'Volkswagen', 'Mini', 'Smart', 'Opel', 'Maybach',
  // British
  'Bentley', 'Rolls-Royce', 'Aston Martin', 'McLaren', 'Jaguar', 'Land Rover', 'Range Rover', 'Lotus', 'Vauxhall',
  // Italian
  'Ferrari', 'Lamborghini', 'Maserati', 'Alfa Romeo', 'Fiat', 'Lancia',
  // French
  'Peugeot', 'Renault', 'Citroen', 'DS',
  // Swedish
  'Volvo', 'Polestar',
  // American
  'Cadillac', 'Chevrolet', 'Ford', 'Lincoln', 'GMC', 'Jeep', 'Dodge', 'Chrysler', 'RAM', 'Tesla', 'Buick',
  // Japanese
  'Toyota', 'Lexus', 'Honda', 'Acura', 'Nissan', 'Infiniti', 'Mazda', 'Mitsubishi', 'Subaru', 'Suzuki', 'Isuzu', 'Datsun',
  // Korean
  'Hyundai', 'Kia', 'Genesis', 'SsangYong',
  // Chinese
  'Geely', 'Chery', 'Exeed', 'Haval', 'Great Wall', 'GAC', 'Changan', 'Omoda', 'BYD', 'Zeekr', 'Li Auto',
  'Xpeng', 'NIO', 'Tank', 'JAC', 'FAW', 'Dongfeng', 'MG', 'Voyah', 'Jetour', 'Jaecoo',
  // Russian / CIS
  'Lada', 'UAZ', 'GAZ', 'Moskvich',
];

export const CAR_MODELS_BY_MAKE: Record<string, string[]> = {
  'BMW': ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', '8 Series', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'Z4', 'M2', 'M3', 'M4', 'M5', 'M8', 'i3', 'i4', 'i5', 'i7', 'iX', 'iX1', 'iX3'],
  'Mercedes-Benz': ['A-Class', 'B-Class', 'C-Class', 'E-Class', 'S-Class', 'CLA', 'CLE', 'CLS', 'G-Class', 'GLA', 'GLB', 'GLC', 'GLE', 'GLS', 'SL', 'AMG GT', 'EQA', 'EQB', 'EQC', 'EQE', 'EQS', 'Sprinter', 'V-Class'],
  'Audi': ['A1', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q2', 'Q3', 'Q4 e-tron', 'Q5', 'Q7', 'Q8', 'RS3', 'RS5', 'RS6', 'RS7', 'RS Q8', 'TT', 'R8', 'e-tron', 'e-tron GT'],
  'Porsche': ['911', '718 Cayman', '718 Boxster', 'Cayenne', 'Macan', 'Panamera', 'Taycan'],
  'Volkswagen': ['Polo', 'Golf', 'Jetta', 'Passat', 'Arteon', 'Tiguan', 'Touareg', 'Teramont', 'Taos', 'ID.3', 'ID.4', 'ID.5', 'ID.6', 'Multivan', 'Transporter'],
  'Mini': ['Cooper', 'Cooper S', 'Countryman', 'Clubman', 'Paceman'],
  'Opel': ['Astra', 'Corsa', 'Insignia', 'Mokka', 'Grandland'],
  'Bentley': ['Continental GT', 'Continental GTC', 'Bentayga', 'Flying Spur', 'Mulsanne'],
  'Rolls-Royce': ['Phantom', 'Ghost', 'Cullinan', 'Wraith', 'Dawn', 'Spectre'],
  'Aston Martin': ['DB11', 'DB12', 'Vantage', 'DBX', 'DBS'],
  'McLaren': ['GT', '540C', '570S', '720S', '750S', 'Artura'],
  'Jaguar': ['XE', 'XF', 'XJ', 'F-Pace', 'E-Pace', 'I-Pace', 'F-Type'],
  'Land Rover': ['Defender', 'Discovery', 'Discovery Sport', 'Freelander'],
  'Range Rover': ['Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Evoque'],
  'Lotus': ['Emira', 'Evija', 'Eletre'],
  'Ferrari': ['Roma', 'Portofino', '296 GTB', '296 GTS', 'SF90', 'F8 Tributo', 'Purosangue', '812', '458', '488'],
  'Lamborghini': ['Huracan', 'Aventador', 'Urus', 'Revuelto'],
  'Maserati': ['Ghibli', 'Quattroporte', 'Levante', 'Grecale', 'MC20'],
  'Alfa Romeo': ['Giulia', 'Stelvio', 'Giulietta', 'Tonale'],
  'Fiat': ['500', '500X', 'Panda', 'Tipo', 'Ducato'],
  'Peugeot': ['208', '308', '408', '508', '2008', '3008', '5008', 'Partner'],
  'Renault': ['Logan', 'Sandero', 'Duster', 'Kaptur', 'Arkana', 'Megane', 'Talisman', 'Koleos'],
  'Citroen': ['C3', 'C4', 'C5 Aircross', 'Berlingo'],
  'Volvo': ['S60', 'S90', 'V60', 'V90', 'XC40', 'XC60', 'XC90', 'EX30', 'EX90'],
  'Cadillac': ['Escalade', 'CT4', 'CT5', 'CT6', 'XT4', 'XT5', 'XT6', 'Lyriq'],
  'Chevrolet': ['Tahoe', 'Suburban', 'Camaro', 'Corvette', 'Malibu', 'Equinox', 'Traverse', 'Silverado'],
  'Ford': ['Focus', 'Fusion', 'Mustang', 'Explorer', 'Expedition', 'F-150', 'Edge', 'Kuga', 'Ranger'],
  'Lincoln': ['Navigator', 'Aviator', 'Corsair', 'Continental'],
  'GMC': ['Yukon', 'Sierra', 'Acadia', 'Terrain'],
  'Jeep': ['Grand Cherokee', 'Wrangler', 'Compass', 'Cherokee', 'Renegade', 'Gladiator'],
  'Dodge': ['Charger', 'Challenger', 'Durango', 'Journey'],
  'Chrysler': ['300', 'Pacifica'],
  'RAM': ['1500', '2500', '3500'],
  'Tesla': ['Model S', 'Model 3', 'Model X', 'Model Y', 'Cybertruck'],
  'Buick': ['Enclave', 'Envision'],
  'Toyota': ['Camry', 'Corolla', 'Corolla Cross', 'RAV4', 'Land Cruiser', 'Land Cruiser Prado', 'Land Cruiser 300', 'Highlander', 'Hilux', 'Fortuner', 'Alphard', 'Vellfire', 'Crown', 'C-HR', 'Yaris', 'Avalon', 'Sequoia', 'Tundra'],
  'Lexus': ['ES', 'IS', 'LS', 'RC', 'RX', 'NX', 'GX', 'LX 600', 'LX 570', 'UX', 'LM', 'LC'],
  'Honda': ['Accord', 'Civic', 'CR-V', 'Pilot', 'HR-V', 'Odyssey', 'Jazz'],
  'Acura': ['MDX', 'RDX', 'TLX', 'ILX'],
  'Nissan': ['X-Trail', 'Qashqai', 'Murano', 'Patrol', 'Altima', 'Maxima', 'Juke', 'Terrano', 'Teana', 'Note', 'Almera'],
  'Infiniti': ['Q50', 'Q60', 'QX50', 'QX55', 'QX60', 'QX80'],
  'Mazda': ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-5', 'CX-9', 'CX-30', 'MX-5'],
  'Mitsubishi': ['Outlander', 'ASX', 'Pajero', 'Pajero Sport', 'Eclipse Cross', 'L200'],
  'Subaru': ['Forester', 'Outback', 'XV', 'Impreza', 'Legacy', 'WRX'],
  'Suzuki': ['Vitara', 'Swift', 'SX4', 'Jimny'],
  'Isuzu': ['D-Max', 'MU-X'],
  'Datsun': ['on-DO', 'mi-DO'],
  'Hyundai': ['Solaris', 'Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Palisade', 'Creta', 'Accent', 'Staria', 'Grandeur'],
  'Kia': ['Rio', 'K5', 'Optima', 'Cerato', 'Sportage', 'Sorento', 'Telluride', 'Carnival', 'Seltos', 'Soul'],
  'Genesis': ['G70', 'G80', 'G90', 'GV60', 'GV70', 'GV80'],
  'SsangYong': ['Rexton', 'Tivoli', 'Korando', 'Musso'],
  'Geely': ['Coolray', 'Atlas', 'Atlas Pro', 'Tugella', 'Monjaro', 'Emgrand'],
  'Chery': ['Tiggo 4', 'Tiggo 7', 'Tiggo 8', 'Tiggo 8 Pro', 'Arrizo'],
  'Exeed': ['TXL', 'LX', 'VX', 'RX'],
  'Haval': ['Jolion', 'F7', 'Dargo', 'H6', 'M6'],
  'Great Wall': ['Poer', 'Cannon'],
  'GAC': ['GS8', 'GS4', 'Empow'],
  'Changan': ['CS35', 'CS55', 'CS75', 'UNI-T', 'UNI-K'],
  'Omoda': ['C5', 'S5'],
  'BYD': ['Han', 'Tang', 'Song Plus', 'Seal', 'Dolphin', 'Atto 3'],
  'Zeekr': ['001', '007', '009'],
  'Li Auto': ['L7', 'L8', 'L9'],
  'Xpeng': ['P7', 'G9', 'G6'],
  'NIO': ['ES6', 'ES8', 'ET5', 'ET7'],
  'Tank': ['300', '500'],
  'JAC': ['JS4', 'JS8'],
  'FAW': ['Bestune T77'],
  'Dongfeng': ['AX7'],
  'MG': ['MG5', 'ZS', 'HS'],
  'Voyah': ['Free', 'Dream'],
  'Jetour': ['X70', 'Dashing'],
  'Jaecoo': ['J7'],
  'Lada': ['Granta', 'Vesta', 'Niva', 'Largus', 'XRAY'],
  'UAZ': ['Patriot', 'Hunter', 'Pickup'],
  'GAZ': ['Gazelle Next', 'Sobol'],
  'Moskvich': ['3', '6'],
};
