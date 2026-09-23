/**
 * Mobile operation templates retain the existing planning and form field shape.
 * Storage, sync, and API orchestration remain outside this module.
 */
export const SRA_OPERATIONS_CATALOGUE = [
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

export const getDefaultStageOperations = stageNumber => (
  SRA_OPERATIONS_CATALOGUE
    .filter(operation => operation.stageNumber === Number(stageNumber))
    .map(operation => ({
      id: operation.id,
      name: operation.name,
      stageNumber: operation.stageNumber,
      stageName: operation.stageName,
      inputType: operation.inputType || (operation.isGroup ? 'group' : 'direct'),
      isGroup: operation.isGroup !== undefined ? operation.isGroup : false,
      perHa: operation.perHa !== undefined
        ? operation.perHa
        : (operation.subItems && operation.subItems[0] ? operation.subItems[0].qty : 1),
      rate: operation.rate !== undefined
        ? operation.rate
        : (operation.subItems && operation.subItems[0] ? operation.subItems[0].unitCost : operation.costPerHa || 0),
      category: operation.category || 'prep',
      unit: operation.unit || 'ha',
      costPerHa: operation.costPerHa || 0,
      subItems: (operation.subItems || []).map(subItem => ({ ...subItem }))
    }))
);
