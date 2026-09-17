// Cane Varieties, Soil Types, and Growth Stages for Field Plot Registration (Web & Mobile Parity)
export const CANE_VARIETIES = ['VMC 84-524', 'Phil 99-1793', 'Phil 2006-2289', 'Phil 58-260', 'Phil 80-13'];
export const SOIL_TYPES = ['Clay Loam', 'Sandy Loam', 'Loam', 'Clay', 'Silt Loam'];
export const INITIAL_STAGES = [
  { number: 1, name: 'Pre-Planting & Land Preparation', label: 'Stage 1: Pre-Planting & Land Preparation' },
  { number: 2, name: 'Planting & Crop Establishment', label: 'Stage 2: Planting & Crop Establishment' },
  { number: 3, name: 'Basal Nutrition & Early Care', label: 'Stage 3: Basal Nutrition & Early Care' },
  { number: 4, name: 'Cultivation & Weed Management', label: 'Stage 4: Cultivation & Weed Management' },
  { number: 5, name: 'Crop Maintenance & Final Hilling-Up', label: 'Stage 5: Crop Maintenance & Final Hilling-Up' },
  { number: 6, name: 'Harvesting & Hauling', label: 'Stage 6: Harvesting & Hauling' }
];

// Official SRA Sugarcane 6 Growth Stages Templates
export const CROP_CYCLE_STAGES_BY_TYPE = {
  'Plant Cane (New Plant)': [
    {
      id: 'S1',
      stageNumber: 1,
      name: 'Pre-Planting & Land Preparation',
      monthRange: 'Month 0–1',
      description: 'Soil sampling, mechanical disc plowing, harrowing, and seedbed furrowing (tudling).',
      benchmarkCost: 12100,
      icon: 'construct',
      color: '#8F3A8F',
      done: false,
      active: true,
      operations: [
        { id: 'SRA-01', name: 'Soil Sampling', costPerHa: 100, unit: 'ha' },
        { id: 'SRA-02', name: 'Land Preparation', costPerHa: 12000, unit: 'ha' }
      ]
    },
    {
      id: 'S2',
      stageNumber: 2,
      name: 'Planting & Crop Establishment',
      monthRange: 'Month 1–2',
      description: 'Cane points acquisition (patdan), hauling, selection, and furrow planting crew.',
      benchmarkCost: 20000,
      icon: 'leaf',
      color: '#4A7C2F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-03', name: 'Cost of Planting Material (Seedcane acquisition)', costPerHa: 15000, unit: 'lac' },
        { id: 'SRA-04', name: 'Planting (including hauling and selection)', costPerHa: 5000, unit: 'lac' }
      ]
    },
    {
      id: 'S3',
      stageNumber: 3,
      name: 'Basal Nutrition & Early Care',
      monthRange: 'Month 2–3',
      description: 'Basal fertilizer application (Urea+DAP+MOP), rock phosphate, and initial off-barring.',
      benchmarkCost: 20800,
      icon: 'flask',
      color: '#1A6B9A',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-05', name: 'Basal Fertilization', costPerHa: 15100, unit: 'bag' },
        { id: 'SRA-06', name: 'Fertilizer Application & Soil Amending', costPerHa: 5700, unit: 'bag' }
      ]
    },
    {
      id: 'S4',
      stageNumber: 4,
      name: 'Cultivation & Weed Management',
      monthRange: 'Month 3–5',
      description: 'Ridge busting, off-barring & on-barring passes, 1st, 2nd, and 3rd round manual weeding.',
      benchmarkCost: 9000,
      icon: 'git-branch',
      color: '#F5A623',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-07', name: 'Cultivation (Off-barring & On-barring)', costPerHa: 3000, unit: 'pass' },
        { id: 'SRA-10', name: 'Weeding', costPerHa: 6000, unit: 'ha' }
      ]
    },
    {
      id: 'S5',
      stageNumber: 5,
      name: 'Crop Maintenance & Final Hilling-Up',
      monthRange: 'Month 5–8',
      description: '2nd dose top-dress fertilization, final hilling-up (pasandig), and canal drainage maintenance.',
      benchmarkCost: 5000,
      icon: 'water',
      color: '#0284C7',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-08', name: 'Fertilization (2nd Dose / Top-dress)', costPerHa: 3800, unit: 'bag' },
        { id: 'SRA-09', name: 'Fertilizer Application (2nd dose labor)', costPerHa: 200, unit: 'bag' },
        { id: 'SRA-11', name: 'Drainage / Irrigation', costPerHa: 1000, unit: 'ha' }
      ]
    },
    {
      id: 'S6',
      stageNumber: 6,
      name: 'Harvesting & Post-Harvest Transport',
      monthRange: 'Month 10–12',
      description: 'Cane cutting (tapas), truck loading (karga), carabao bull cart, and freight transport to sugar mill.',
      benchmarkCost: 51000,
      icon: 'bus',
      color: '#D9534F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-12', name: 'Cutting and Loading', costPerHa: 21000, unit: 'ton' },
        { id: 'SRA-13', name: 'Hauling (Trucking)', costPerHa: 21000, unit: 'ton' },
        { id: 'SRA-14', name: 'Bull Cart (In-field transport)', costPerHa: 9000, unit: 'ton' }
      ]
    }
  ],
  '1st Ratoon (Ratoon 1)': [
    {
      id: 'S1',
      stageNumber: 1,
      name: 'Pre-Planting & Land Preparation',
      monthRange: 'Month 0–1',
      description: 'Stubble shaving, trash blanketing/farming, and field clearing.',
      benchmarkCost: 4000,
      icon: 'construct',
      color: '#8F3A8F',
      done: false,
      active: true,
      operations: [
        { id: 'SRA-07', name: 'Stubble Shaving & Trash Blanketing', costPerHa: 4000, unit: 'ha' }
      ]
    },
    {
      id: 'S2',
      stageNumber: 2,
      name: 'Planting & Crop Establishment',
      monthRange: 'Month 1–2',
      description: 'Stool rehabilitation, replanting missing hills (gap filling), and seedbed loosening.',
      benchmarkCost: 6000,
      icon: 'leaf',
      color: '#4A7C2F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-04', name: 'Gap Filling & Stool Rehab', costPerHa: 6000, unit: 'ha' }
      ]
    },
    {
      id: 'S3',
      stageNumber: 3,
      name: 'Basal Nutrition & Early Care',
      monthRange: 'Month 2–3',
      description: 'Ratoon basal fertilization (Urea + DAP + MOP), off-barring & furrow cleaning.',
      benchmarkCost: 14000,
      icon: 'flask',
      color: '#1A6B9A',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-05', name: 'Basal Fertilization', costPerHa: 14000, unit: 'bag' }
      ]
    },
    {
      id: 'S4',
      stageNumber: 4,
      name: 'Cultivation & Weed Management',
      monthRange: 'Month 3–5',
      description: 'Off-barring & on-barring passes, inter-row cultivation, and weeding rounds.',
      benchmarkCost: 7000,
      icon: 'git-branch',
      color: '#F5A623',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-07', name: 'Cultivation (Off-barring & On-barring)', costPerHa: 3000, unit: 'pass' },
        { id: 'SRA-10', name: 'Weeding', costPerHa: 4000, unit: 'ha' }
      ]
    },
    {
      id: 'S5',
      stageNumber: 5,
      name: 'Crop Maintenance & Final Hilling-Up',
      monthRange: 'Month 5–8',
      description: '2nd dose top-dress fertilizer application, final hilling-up, and canal drainage maintenance.',
      benchmarkCost: 4500,
      icon: 'water',
      color: '#0284C7',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-08', name: 'Fertilization (2nd Dose / Top-dress)', costPerHa: 3800, unit: 'bag' },
        { id: 'SRA-11', name: 'Drainage / Irrigation', costPerHa: 700, unit: 'ha' }
      ]
    },
    {
      id: 'S6',
      stageNumber: 6,
      name: 'Harvesting & Post-Harvest Transport',
      monthRange: 'Month 10–12',
      description: 'Cane cutting (tapas), truck loading (karga), and freight transport to sugar mill.',
      benchmarkCost: 48000,
      icon: 'bus',
      color: '#D9534F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-12', name: 'Cutting and Loading', costPerHa: 20000, unit: 'ton' },
        { id: 'SRA-13', name: 'Hauling (Trucking)', costPerHa: 20000, unit: 'ton' },
        { id: 'SRA-14', name: 'Bull Cart (In-field transport)', costPerHa: 8000, unit: 'ton' }
      ]
    }
  ],
  '2nd Ratoon (Ratoon 2)': [
    {
      id: 'S1',
      stageNumber: 1,
      name: 'Pre-Planting & Land Preparation',
      monthRange: 'Month 0–1',
      description: 'Stubble shaving, trash blanketing, and field clearing.',
      benchmarkCost: 4500,
      icon: 'construct',
      color: '#8F3A8F',
      done: false,
      active: true,
      operations: [
        { id: 'SRA-07', name: 'Stubble Shaving & Prep', costPerHa: 4500, unit: 'ha' }
      ]
    },
    {
      id: 'S2',
      stageNumber: 2,
      name: 'Planting & Crop Establishment',
      monthRange: 'Month 1–2',
      description: 'Stool rehabilitation, gap filling, and soil aeration.',
      benchmarkCost: 6500,
      icon: 'leaf',
      color: '#4A7C2F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-04', name: '2nd Ratoon Gap Filling', costPerHa: 6500, unit: 'ha' }
      ]
    },
    {
      id: 'S3',
      stageNumber: 3,
      name: 'Basal Nutrition & Early Care',
      monthRange: 'Month 2–3',
      description: '2nd Ratoon basal fertilization, off-barring & furrow clearing.',
      benchmarkCost: 14000,
      icon: 'flask',
      color: '#1A6B9A',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-05', name: 'Basal Fertilization', costPerHa: 14000, unit: 'bag' }
      ]
    },
    {
      id: 'S4',
      stageNumber: 4,
      name: 'Cultivation & Weed Management',
      monthRange: 'Month 3–5',
      description: 'Off-barring & on-barring passes, inter-row cultivation, and weeding.',
      benchmarkCost: 7000,
      icon: 'git-branch',
      color: '#F5A623',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-07', name: 'Cultivation (Off-barring & On-barring)', costPerHa: 3000, unit: 'pass' },
        { id: 'SRA-10', name: 'Weeding', costPerHa: 4000, unit: 'ha' }
      ]
    },
    {
      id: 'S5',
      stageNumber: 5,
      name: 'Crop Maintenance & Final Hilling-Up',
      monthRange: 'Month 5–8',
      description: 'Top-dress fertilization, weed management, and drainage upkeep.',
      benchmarkCost: 4500,
      icon: 'water',
      color: '#0284C7',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-08', name: 'Fertilization (2nd Dose / Top-dress)', costPerHa: 3800, unit: 'bag' },
        { id: 'SRA-11', name: 'Drainage / Irrigation', costPerHa: 700, unit: 'ha' }
      ]
    },
    {
      id: 'S6',
      stageNumber: 6,
      name: 'Harvesting & Post-Harvest Transport',
      monthRange: 'Month 10–12',
      description: 'Cane cutting, hauling to mill, and cycle conclusion.',
      benchmarkCost: 48000,
      icon: 'bus',
      color: '#D9534F',
      done: false,
      active: false,
      operations: [
        { id: 'SRA-12', name: 'Cutting and Loading', costPerHa: 20000, unit: 'ton' },
        { id: 'SRA-13', name: 'Hauling (Trucking)', costPerHa: 20000, unit: 'ton' },
        { id: 'SRA-14', name: 'Bull Cart (In-field transport)', costPerHa: 8000, unit: 'ton' }
      ]
    }
  ]
};

// Preset colour palette for custom stages
export const STAGE_COLORS = [
  '#8F3A8F', '#4A7C2F', '#1A6B9A', '#F5A623', '#0284C7', '#D9534F',
  '#267326', '#C97A00', '#5B4DA7', '#8A9B7A',
];

// Returns the active stage list for a field based on its active crop cycle
export const getFieldStages = (fields, fieldId) => {
  const field = fields.find(f => f.id === fieldId);
  const cycleType = field?.cycleType || 'Plant Cane (New Plant)';
  const stages = (field?.customStages && field.customStages.length > 0)
    ? field.customStages.map(s => ({ ...s }))
    : (CROP_CYCLE_STAGES_BY_TYPE[cycleType] || CROP_CYCLE_STAGES_BY_TYPE['Plant Cane (New Plant)']).map(s => ({ ...s }));
  
  // stageNumber is the SINGLE authoritative source of cycle position.
  // Never trust s.done from customStages — those flags can be stale from a previous
  // crop cycle when customStages wasn't fully reset before a sync snapshot overwrote them.
  const currentStageNum = Number(field?.stageNumber) || 1;
  const fieldStageName = (field?.stage || '').toLowerCase();

  // Cycle is complete ONLY when on Stage 6 AND explicitly flagged
  const isCycleCompleted = currentStageNum >= 6 && (
    field?.isCompleted === true ||
    fieldStageName.includes('complete') ||
    fieldStageName.includes('milling')
  );

  return stages.map((s, idx) => {
    const sNum = s.stageNumber || s.stageNum || (idx + 1);
    if (isCycleCompleted) {
      return { ...s, stageNumber: sNum, done: true, active: false };
    }
    // Derive done/active purely from the field's stageNumber — ignore s.done
    if (sNum < currentStageNum) {
      return { ...s, stageNumber: sNum, done: true, active: false };
    } else if (sNum === currentStageNum) {
      return { ...s, stageNumber: sNum, done: false, active: true };
    } else {
      return { ...s, stageNumber: sNum, done: false, active: false };
    }
  });
};

export const getAccessibleFields = (allFields, allBlockFarms, session, activeRole) => {
  const userId = session?.employeeId || session?.id || '';
  const managedFarmIds = new Set(allBlockFarms.filter(farm => farm.managerUserId === userId).map(farm => farm.id));
  if (activeRole === 'Member Farmer') return allFields.filter(field => field.memberUserId === userId);
  if (activeRole === 'Farm Manager') return allFields.filter(field => managedFarmIds.has(field.blockFarmId));
  return [...allFields];
};

export const getAvailableAuditMonths = (logs, now = new Date()) => {
  const months = new Map();
  for (let offset = 0; offset < 6; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.set(date.toLocaleString('en-US', { month: 'long', year: 'numeric' }), date);
  }
  logs.forEach(log => {
    const rawDate = log.date || log.period;
    if (!rawDate) return;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return;
    const label = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    if (!months.has(label)) months.set(label, date);
  });
  return Array.from(months.entries()).sort((left, right) => right[1] - left[1]).map(([label]) => label);
};

export const isLogFromMonth = (log, targetMonth) => {
  if (!targetMonth) return true;
  const rawDate = String(log?.date || log?.createdAt || log?.recordedAt || log?.timestamp || log?.period || '').trim();
  if (!rawDate) return true;
  const cleanTarget = targetMonth.toLowerCase().replace(/\s*\([^)]*\)/, '').trim();
  const [targetMonthName, targetYearText] = cleanTarget.split(' ');
  const targetYear = targetYearText ? parseInt(targetYearText, 10) : null;
  if (rawDate.toLowerCase().includes(cleanTarget) || rawDate.toLowerCase().includes(targetMonthName || '')) return true;
  const date = new Date(rawDate);
  if (!Number.isNaN(date.getTime())) {
    const shortMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const fullMonths = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthIndex = date.getMonth();
    const monthMatches = shortMonths[monthIndex] === targetMonthName ||
      fullMonths[monthIndex] === targetMonthName ||
      targetMonthName.startsWith(shortMonths[monthIndex]) ||
      fullMonths[monthIndex].startsWith(targetMonthName);
    return monthMatches && (!targetYear || date.getFullYear() === targetYear);
  }
  return rawDate.toLowerCase().includes(targetMonthName);
};

export const SRA_OPERATIONS_CATALOGUE = [
  // ── Stage 1: Pre-Planting & Land Preparation ──
  {
    id: 'SRA-01',
    stageNumber: 1,
    stageName: 'Stage 1: Pre-Planting & Land Preparation',
    section: 'I. Direct Operations',
    name: 'Soil Sampling',
    category: 'prep',
    inputType: 'direct',
    isGroup: false,
    perHa: 1,
    unit: 'ha',
    rate: 100,
    costPerHa: 100,
    subItems: [
      { id: 'SI-01-1', description: 'Soil Laboratory Sampling & Analysis', qty: 1, unit: 'ha', unitCost: 100, subTotal: 100 }
    ]
  },
  {
    id: 'SRA-02',
    stageNumber: 1,
    stageName: 'Stage 1: Pre-Planting & Land Preparation',
    section: 'I. Direct Operations',
    name: 'Land Preparation',
    category: 'prep',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 12000,
    subItems: [
      { id: 'SI-02-1', description: '1st Pass Disc Plowing (Tractor)', qty: 1, unit: 'ha', unitCost: 5000, subTotal: 5000 },
      { id: 'SI-02-2', description: '2nd Pass Disc Harrowing', qty: 1, unit: 'ha', unitCost: 4000, subTotal: 4000 },
      { id: 'SI-02-3', description: 'Furrowing / Tudling', qty: 1, unit: 'ha', unitCost: 3000, subTotal: 3000 }
    ]
  },

  // ── Stage 2: Planting & Crop Establishment ──
  {
    id: 'SRA-03',
    stageNumber: 2,
    stageName: 'Stage 2: Planting & Crop Establishment',
    section: 'I. Direct Operations',
    name: 'Cost of Planting Material (Seedcane acquisition)',
    category: 'plant',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 15000,
    subItems: [
      { id: 'SI-03-1', description: 'Seedpieces (Patdan acquisition - 40,000 pts/ha)', qty: 5, unit: 'lac', unitCost: 3000, subTotal: 15000 }
    ]
  },
  {
    id: 'SRA-04',
    stageNumber: 2,
    stageName: 'Stage 2: Planting & Crop Establishment',
    section: 'I. Direct Operations',
    name: 'Planting Operations (Labor & Handling)',
    category: 'plant',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 5000,
    subItems: [
      { id: 'SI-04-1', description: 'Cutting, Bundling, Loading & Transport of Seedpieces', qty: 5, unit: 'lac', unitCost: 600, subTotal: 3000 },
      { id: 'SI-04-2', description: 'Distributing and Planting Seedpieces in Furrows', qty: 5, unit: 'lac', unitCost: 400, subTotal: 2000 }
    ]
  },

  // ── Stage 3: Basal Nutrition & Early Care ──
  {
    id: 'SRA-05',
    stageNumber: 3,
    stageName: 'Stage 3: Basal Nutrition & Early Care',
    section: 'I. Direct Operations',
    name: 'Basal Fertilizer Application (Labor & Materials)',
    category: 'fert',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 15800,
    subItems: [
      { id: 'SI-05-1', description: 'Application of 46-00-00 (Urea)', qty: 2, unit: 'bag', unitCost: 1600, subTotal: 3200 },
      { id: 'SI-05-2', description: 'Application of 18-46-00 (DAP / Complete)', qty: 3, unit: 'bag', unitCost: 2500, subTotal: 7500 },
      { id: 'SI-05-3', description: 'Application of 00-00-60 (MOP / Potash)', qty: 2, unit: 'bag', unitCost: 2200, subTotal: 4400 },
      { id: 'SI-05-4', description: 'Fertilizer Application Labor', qty: 7, unit: 'bag', unitCost: 100, subTotal: 700 }
    ]
  },
  {
    id: 'SRA-06',
    stageNumber: 3,
    stageName: 'Stage 3: Basal Nutrition & Early Care',
    section: 'I. Direct Operations',
    name: 'Lime Application (Soil Amending)',
    category: 'fert',
    inputType: 'direct',
    isGroup: false,
    perHa: 2,
    unit: 'ton',
    rate: 2500,
    costPerHa: 5000,
    subItems: [
      { id: 'SI-06-1', description: 'Agricultural Lime (Cal-Mag / Dolomite)', qty: 2, unit: 'ton', unitCost: 2500, subTotal: 5000 }
    ]
  },

  // ── Stage 4: Cultivation & Weed Management ──
  {
    id: 'SRA-07',
    stageNumber: 4,
    stageName: 'Stage 4: Cultivation & Weed Management',
    section: 'I. Direct Operations',
    name: 'Cultivation (Off-barring & On-barring)',
    category: 'weed',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 3000,
    subItems: [
      { id: 'SI-07-1', description: '1st Off-barring (Pahubas)', qty: 2, unit: 'pass', unitCost: 750, subTotal: 1500 },
      { id: 'SI-07-2', description: '2nd Off-barring (Pahubas)', qty: 2, unit: 'pass', unitCost: 750, subTotal: 1500 }
    ]
  },
  {
    id: 'SRA-08',
    stageNumber: 4,
    stageName: 'Stage 4: Cultivation & Weed Management',
    section: 'I. Direct Operations',
    name: 'Weeding Operations',
    category: 'weed',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 6000,
    subItems: [
      { id: 'SI-08-1', description: 'Manual Weeding (1st Round)', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 },
      { id: 'SI-08-2', description: 'Manual Weeding (2nd Round)', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 },
      { id: 'SI-08-3', description: 'Manual Weeding (3rd Round)', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 }
    ]
  },

  // ── Stage 5: Crop Maintenance & Final Hilling-Up ──
  {
    id: 'SRA-09',
    stageNumber: 5,
    stageName: 'Stage 5: Crop Maintenance & Final Hilling-Up',
    section: 'I. Direct Operations',
    name: 'Top-Dress / 2nd Dose Fertilization',
    category: 'maint',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 2500,
    subItems: [
      { id: 'SI-09-1', description: '2nd Dose Urea (Side-dressing)', qty: 1.5, unit: 'bag', unitCost: 1600, subTotal: 2400 },
      { id: 'SI-09-2', description: 'Side-dressing Application Labor', qty: 1.5, unit: 'bag', unitCost: 66.67, subTotal: 100 }
    ]
  },
  {
    id: 'SRA-10',
    stageNumber: 5,
    stageName: 'Stage 5: Crop Maintenance & Final Hilling-Up',
    section: 'I. Direct Operations',
    name: 'Final Hilling-up (Pasungkal)',
    category: 'maint',
    inputType: 'direct',
    isGroup: false,
    perHa: 1,
    unit: 'ha',
    rate: 2500,
    costPerHa: 2500,
    subItems: [
      { id: 'SI-10-1', description: 'Final Hilling-Up / Pasungkal Pass', qty: 1, unit: 'ha', unitCost: 2500, subTotal: 2500 }
    ]
  },

  // ── Stage 6: Harvesting & Transport ──
  {
    id: 'SRA-11',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Cutting and Loading Operations',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    perHa: 60,
    unit: 'ton',
    rate: 450,
    costPerHa: 27000,
    subItems: [
      { id: 'SI-11-1', description: 'Cutting, De-trashing, and Truck Loading', qty: 60, unit: 'ton', unitCost: 450, subTotal: 27000 }
    ]
  },
  {
    id: 'SRA-12',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Hauling (Trucking to Mill)',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    perHa: 60,
    unit: 'ton',
    rate: 250,
    costPerHa: 15000,
    subItems: [
      { id: 'SI-12-1', description: 'Flatbed Hauling to Haw-Phil Milling Terminal', qty: 60, unit: 'ton', unitCost: 250, subTotal: 15000 }
    ]
  },
  {
    id: 'SRA-13',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Bull Cart / In-field Transport',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    perHa: 60,
    unit: 'ton',
    rate: 120,
    costPerHa: 7200,
    subItems: [
      { id: 'SI-13-1', description: 'Carabao / Bull cart hauling to loading ramp', qty: 60, unit: 'ton', unitCost: 120, subTotal: 7200 }
    ]
  },
  {
    id: 'SRA-14',
    stageNumber: 6,
    stageName: 'Stage 6: Harvesting & Transport',
    section: 'I. Direct Operations',
    name: 'Drainage & Post-Harvest Field Clearing',
    category: 'prep',
    inputType: 'direct',
    isGroup: false,
    perHa: 1,
    unit: 'ha',
    rate: 2000,
    costPerHa: 2000,
    subItems: [
      { id: 'SI-14-1', description: 'Trash farming, field clearing & drainage', qty: 1, unit: 'ha', unitCost: 2000, subTotal: 2000 }
    ]
  }
];
