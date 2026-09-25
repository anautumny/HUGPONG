/**
 * Immutable-by-convention operation templates used to populate web forms.
 * Persistence and API orchestration belong in operationsService.
 */
export const SRA_OPERATIONS_CATALOGUE = [
  {
    id: 'SRA-01',
    stageNumber: 1,
    name: 'Soil Sampling',
    category: 'prep',
    inputType: 'direct',
    isGroup: false,
    unit: 'ha',
    rate: 100,
    costPerHa: 100,
    subItems: [
      { lineItemId: 'SI-01-1', description: 'Soil Laboratory Sampling & Analysis', quantity: 1, unit: 'ha', unitCost: 100, subtotal: 100 }
    ]
  },
  {
    id: 'SRA-02',
    stageNumber: 1,
    name: 'Land Preparation',
    category: 'prep',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 12000,
    subItems: [
      { lineItemId: 'SI-02-1', description: '1st Pass Disc Plowing (Tractor)', quantity: 1, unit: 'ha', unitCost: 5000, subtotal: 5000 },
      { lineItemId: 'SI-02-2', description: '2nd Pass Disc Harrowing', quantity: 1, unit: 'ha', unitCost: 4000, subtotal: 4000 },
      { lineItemId: 'SI-02-3', description: 'Furrowing / Tudling', quantity: 1, unit: 'ha', unitCost: 3000, subtotal: 3000 }
    ]
  },
  {
    id: 'SRA-03',
    stageNumber: 2,
    name: 'Cost of Planting Material (Seedcane acquisition)',
    category: 'plant',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 15000,
    subItems: [
      { lineItemId: 'SI-03-1', description: 'Seedpieces (Patdan acquisition - 40,000 pts/ha)', quantity: 5, unit: 'lac', unitCost: 3000, subtotal: 15000 }
    ]
  },
  {
    id: 'SRA-04',
    stageNumber: 2,
    name: 'Planting Operations (Labor & Handling)',
    category: 'plant',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 5000,
    subItems: [
      { lineItemId: 'SI-04-1', description: 'Cutting, Bundling, Loading & Transport of Seedpieces', quantity: 5, unit: 'lac', unitCost: 600, subtotal: 3000 },
      { lineItemId: 'SI-04-2', description: 'Distributing and Planting Seedpieces in Furrows', quantity: 5, unit: 'lac', unitCost: 400, subtotal: 2000 }
    ]
  },
  {
    id: 'SRA-05',
    stageNumber: 3,
    name: 'Basal Fertilizer Application (Labor & Materials)',
    category: 'fert',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 15800,
    subItems: [
      { lineItemId: 'SI-05-1', description: 'Application of 46-00-00 (Urea)', quantity: 2, unit: 'bags', unitCost: 1600, subtotal: 3200 },
      { lineItemId: 'SI-05-2', description: 'Application of 18-46-00 (DAP / Complete)', quantity: 3, unit: 'bags', unitCost: 2500, subtotal: 7500 },
      { lineItemId: 'SI-05-3', description: 'Application of 00-00-60 (MOP / Potash)', quantity: 2, unit: 'bags', unitCost: 2200, subtotal: 4400 },
      { lineItemId: 'SI-05-4', description: 'Fertilizer Application Labor', quantity: 7, unit: 'bags', unitCost: 100, subtotal: 700 }
    ]
  },
  {
    id: 'SRA-06',
    stageNumber: 3,
    name: 'Lime Application (Soil Amending)',
    category: 'fert',
    inputType: 'direct',
    isGroup: false,
    unit: 'tons',
    rate: 2500,
    costPerHa: 5000,
    subItems: [
      { lineItemId: 'SI-06-1', description: 'Agricultural Lime (Materials & Distribution)', quantity: 2, unit: 'tons', unitCost: 2500, subtotal: 5000 }
    ]
  },
  {
    id: 'SRA-07',
    stageNumber: 4,
    name: 'Cultivation (Off-barring & On-barring)',
    category: 'weed',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 3000,
    subItems: [
      { lineItemId: 'SI-07-1', description: '1st Off-barring (Pahubas) - Tractor/Animal', quantity: 2, unit: 'pass', unitCost: 750, subtotal: 1500 },
      { lineItemId: 'SI-07-2', description: '2nd Off-barring (Pahubas)', quantity: 2, unit: 'pass', unitCost: 750, subtotal: 1500 }
    ]
  },
  {
    id: 'SRA-08',
    stageNumber: 4,
    name: 'Weeding Operations (Hilamon & Herbicides)',
    category: 'weed',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 6000,
    subItems: [
      { lineItemId: 'SI-08-1', description: 'Manual Weeding (1st Round)', quantity: 1, unit: 'ha', unitCost: 2000, subtotal: 2000 },
      { lineItemId: 'SI-08-2', description: 'Manual Weeding (2nd Round)', quantity: 1, unit: 'ha', unitCost: 2000, subtotal: 2000 },
      { lineItemId: 'SI-08-3', description: 'Manual Weeding (3rd Round)', quantity: 1, unit: 'ha', unitCost: 2000, subtotal: 2000 }
    ]
  },
  {
    id: 'SRA-09',
    stageNumber: 5,
    name: 'Top-Dress / 2nd Dose Fertilization',
    category: 'fert',
    inputType: 'group',
    isGroup: true,
    unit: 'ha',
    costPerHa: 2500,
    subItems: [
      { lineItemId: 'SI-09-1', description: '2nd Dose Urea (Side-dressing)', quantity: 1.5, unit: 'bags', unitCost: 1600, subtotal: 2400 },
      { lineItemId: 'SI-09-2', description: 'Side-dressing Application Labor', quantity: 1.5, unit: 'bags', unitCost: 66.67, subtotal: 100 }
    ]
  },
  {
    id: 'SRA-10',
    stageNumber: 5,
    name: 'Final Hilling-up (Pasungkal)',
    category: 'weed',
    inputType: 'direct',
    isGroup: false,
    unit: 'ha',
    rate: 2500,
    costPerHa: 2500,
    subItems: [
      { lineItemId: 'SI-10-1', description: 'Final Hilling-up / Pasungkal Pass', quantity: 1, unit: 'ha', unitCost: 2500, subtotal: 2500 }
    ]
  },
  {
    id: 'SRA-11',
    stageNumber: 6,
    name: 'Cutting and Loading Operations',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    unit: 'tons',
    rate: 450,
    costPerHa: 27000,
    subItems: [
      { lineItemId: 'SI-11-1', description: 'Cane Cutting & Truck Loading Labor', quantity: 60, unit: 'tons', unitCost: 450, subtotal: 27000 }
    ]
  },
  {
    id: 'SRA-12',
    stageNumber: 6,
    name: 'Hauling (Trucking to Mill)',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    unit: 'tons',
    rate: 250,
    costPerHa: 15000,
    subItems: [
      { lineItemId: 'SI-12-1', description: 'Trucking freight to sugar mill', quantity: 60, unit: 'tons', unitCost: 250, subtotal: 15000 }
    ]
  },
  {
    id: 'SRA-13',
    stageNumber: 6,
    name: 'Bull Cart / In-field Transport',
    category: 'harvest',
    inputType: 'direct',
    isGroup: false,
    unit: 'tons',
    rate: 120,
    costPerHa: 7200,
    subItems: [
      { lineItemId: 'SI-13-1', description: 'Carabao / Bull cart hauling to loading ramp', quantity: 60, unit: 'tons', unitCost: 120, subtotal: 7200 }
    ]
  },
  {
    id: 'SRA-14',
    stageNumber: 6,
    name: 'Drainage & Post-Harvest Field Clearing',
    category: 'prep',
    inputType: 'direct',
    isGroup: false,
    unit: 'ha',
    rate: 2000,
    costPerHa: 2000,
    subItems: [
      { lineItemId: 'SI-14-1', description: 'Trash farming, field clearing & drainage', quantity: 1, unit: 'ha', unitCost: 2000, subtotal: 2000 }
    ]
  }
];

export const getOperationsForStage = stageNumber => (
  SRA_OPERATIONS_CATALOGUE.filter(operation => operation.stageNumber === Number(stageNumber))
);

export const getOperationDefinition = operationDefinitionId => (
  SRA_OPERATIONS_CATALOGUE.find(operation => operation.id === String(operationDefinitionId || '').trim().toUpperCase()) || null
);
