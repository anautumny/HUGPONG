import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Modal, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS, SHADOW, ANALYTICS_PALETTE } from '../theme';
import AppHeader from '../components/AppHeader';
import { getCurrentSession, fields, fieldsStore, blockFarms, draftLogs, DRAFT_LOGS, notifyDataUpdate, subscribe, getFieldCustomOperations, saveFieldFullPlan, saveDraftLogs } from '../data/dataStore';
import { SRA_OPERATIONS_CATALOGUE, getDefaultStageOperations } from '../domain/operationCatalogue';
import { generateDraftId, generateSubItemId, generateCustomOpId } from '../services/syncEngine';
import { getNetworkStatus } from '../services/networkService';
import { db } from '../firebase/config';
import { useTranslation } from '../services/i18n';

// ── 6 Official SRA Sugarcane Growth Stages Baseline Configuration ──
const DEFAULT_GROWTH_STAGES = [
  {
    key: 'stage1',
    stageNum: 1,
    id: 'S1',
    label: '1. Pre-Planting & Land Preparation',
    shortLabel: 'Pre-Planting & Land Prep',
    icon: 'construct',
    color: ANALYTICS_PALETTE.stage1,
    month: 'Month 0–1',
    benchmarkCost: 12100,
    description: 'Soil sampling, mechanical tractor disc plowing, harrowing, and seedbed furrowing (tudling).',
  },
  {
    key: 'stage2',
    stageNum: 2,
    id: 'S2',
    label: '2. Planting & Crop Establishment',
    shortLabel: 'Planting & Establishment',
    icon: 'leaf',
    color: ANALYTICS_PALETTE.stage2,
    month: 'Month 1–2',
    benchmarkCost: 20000,
    description: 'Cane points acquisition (patdan), hauling, selection, and furrow planting crew.',
  },
  {
    key: 'stage3',
    stageNum: 3,
    id: 'S3',
    label: '3. Early Vegetative & Cultivation',
    shortLabel: 'Early Vegetative',
    icon: 'flower',
    color: ANALYTICS_PALETTE.stage3,
    month: 'Month 2–4',
    benchmarkCost: 11000,
    description: 'First dose fertilizing (Urea+DAP), inter-row cultivating, off-barring & herbicide application.',
  },
  {
    key: 'stage4',
    stageNum: 4,
    id: 'S4',
    label: '4. Peak Tillering & Grand Growth',
    shortLabel: 'Tillering & Grand Growth',
    icon: 'water',
    color: ANALYTICS_PALETTE.stage4,
    month: 'Month 4–8',
    benchmarkCost: 14500,
    description: 'Final hilling-up (closing-in), full fertilizer side-dressing (MOP+Urea), and biological pest monitoring.',
  },
  {
    key: 'stage5',
    stageNum: 5,
    id: 'S5',
    label: '5. Maturation & Ripening',
    shortLabel: 'Maturation & Ripening',
    icon: 'sunny',
    color: ANALYTICS_PALETTE.stage5,
    month: 'Month 9–11',
    benchmarkCost: 3500,
    description: 'Withholding irrigation, field drainage, pre-harvest Brix hand-refractometer sugar content sampling.',
  },
  {
    key: 'stage6',
    stageNum: 6,
    id: 'S6',
    label: '6. Harvesting & Ratoon Management',
    shortLabel: 'Harvesting & Ratoon',
    icon: 'bag-check',
    color: ANALYTICS_PALETTE.stage6,
    month: 'Month 12',
    benchmarkCost: 34500,
    description: 'Cane cutting (tapas), field loading, HPCo hauling, trash blanketing or field stubble shaving.',
  },
];

const ITEM_TYPES = [
  { key: 'material', label: 'Material (Inputs)', icon: 'cube-outline', color: '#1A6B9A' },
  { key: 'labor', label: 'Labor (Crew)', icon: 'people-outline', color: '#4A7C2F' },
  { key: 'equipment', label: 'Equipment / Machine', icon: 'construct-outline', color: '#F5A623' },
];

const SRA_CHILD_PRESETS = [
  { name: '46-00-00 (Urea)', qty: '2', unit: 'bag', rate: '1600', category: 'material' },
  { name: '18-46-00 (DAP)', qty: '3', unit: 'bag', rate: '2500', category: 'material' },
  { name: '00-00-60 (MOP)', qty: '2', unit: 'bag', rate: '2200', category: 'material' },
  { name: 'Rock Phosphate', qty: '10', unit: 'bag', rate: '400', category: 'material' },
  { name: 'Application Labor', qty: '7', unit: 'bag', rate: '100', category: 'labor' },
  { name: 'Weeding Labor Crew', qty: '1', unit: 'ha', rate: '2500', category: 'labor' },
  { name: 'Disc Plowing (Tractor)', qty: '1', unit: 'ha', rate: '5000', category: 'equipment' },
  { name: 'Disc Harrowing', qty: '1', unit: 'ha', rate: '4000', category: 'equipment' },
  { name: 'Furrowing / Tudling', qty: '1', unit: 'ha', rate: '3000', category: 'equipment' },
  { name: 'Off-barring / On-barring', qty: '2', unit: 'pass', rate: '300', category: 'equipment' },
  { name: 'Cane Points (Patdan)', qty: '5', unit: 'lac', rate: '3000', category: 'material' },
  { name: 'Cutting & Loading (Tapas)', qty: '60', unit: 'ton', rate: '350', category: 'labor' },
  { name: 'Hauling to Mill', qty: '60', unit: 'ton', rate: '350', category: 'equipment' },
  { name: 'Bull Cart In-field Haul', qty: '60', unit: 'ton', rate: '150', category: 'equipment' },
];

const fmt = n => Number.isFinite(n) ? n.toLocaleString('en-PH') : '—';

export default function PlannerScreen({ navigation }) {
  const { t, formatOperationName, formatStageName, formatPhaseMonth } = useTranslation();
  const [session, setSession] = useState(getCurrentSession());
  const [allFields, setAllFields] = useState([...fieldsStore]);
  const isMember = session?.role === 'Member Farmer';

  useEffect(() => {
    const unsub = subscribe(() => {
      setSession(getCurrentSession());
      setAllFields([...fieldsStore]);
    });
    return unsub;
  }, []);

  const [fieldScope, setFieldScope] = useState(isMember ? 'my' : 'all');
  const [showFieldPickerModal, setShowFieldPickerModal] = useState(false);
  const [fieldSearchQuery, setFieldSearchQuery] = useState('');
  const [pickerPage, setPickerPage] = useState(1);

  const displayedFields = useMemo(() => {
    const userId = session?.employeeId || session?.id || '';
    if (isMember) {
      return allFields.filter(field => 
        field.memberUserId === userId ||
        field.memberId === userId ||
        field.member === session?.name ||
        field.memberName === session?.name ||
        (session?.fieldId && field.id === session?.fieldId)
      );
    }
    if (session?.role === 'Farm Manager') {
      if (!getNetworkStatus()) {
        return allFields.filter(field => 
          field.memberUserId === userId ||
          field.memberId === userId ||
          field.member === session?.name ||
          field.memberName === session?.name ||
          (session?.fieldId && field.id === session?.fieldId)
        );
      }
      const managedFarmIds = new Set(
        blockFarms
          .filter(farm => 
            farm.managerUserId === userId ||
            farm.managerName === session?.name ||
            farm.id === session?.blockFarmId ||
            farm.name === session?.blockFarm ||
            farm.name === session?.farm
          )
          .map(farm => farm.id)
      );
      if (session?.blockFarmId) managedFarmIds.add(session.blockFarmId);
      return allFields.filter(field => 
        managedFarmIds.has(field.blockFarmId) ||
        field.managerUserId === userId ||
        (session?.farm && (field.blockFarm === session.farm || field.blockFarmName === session.farm)) ||
        (session?.blockFarm && (field.blockFarm === session.blockFarm || field.blockFarmName === session.blockFarm))
      );
    }
    return allFields;
  }, [session, isMember, fieldScope, allFields]);

  const [selectedField, setSelectedField] = useState(() => {
    const cur = getCurrentSession() || {};
    const userId = cur.employeeId || cur.id || '';
    if (cur.role === 'Member Farmer' || !getNetworkStatus()) {
      return fieldsStore.find(field => 
        field.memberUserId === userId ||
        field.memberId === userId ||
        field.member === cur.name ||
        field.memberName === cur.name ||
        (cur.fieldId && field.id === cur.fieldId)
      ) || null;
    }
    if (cur.role === 'Farm Manager') {
      const managedFarmIds = new Set(
        blockFarms
          .filter(farm => 
            farm.managerUserId === userId ||
            farm.managerName === cur.name ||
            farm.id === cur.blockFarmId ||
            farm.name === cur.blockFarm ||
            farm.name === cur.farm
          )
          .map(farm => farm.id)
      );
      if (cur.blockFarmId) managedFarmIds.add(cur.blockFarmId);
      return fieldsStore.find(field => 
        managedFarmIds.has(field.blockFarmId) ||
        field.managerUserId === userId ||
        (cur.farm && (field.blockFarm === cur.farm || field.blockFarmName === cur.farm))
      ) || null;
    }
    return fieldsStore.length > 0 ? fieldsStore[0] : null;
  });

  useEffect(() => {
    if (!selectedField && displayedFields.length > 0) {
      setSelectedField(displayedFields[0]);
    }
  }, [displayedFields, selectedField]);

  const [landArea, setLandArea] = useState(() => selectedField?.ha ? String(selectedField?.ha) : '');
  
  // Clean Master-Detail UX State: null = Stages Hub, 1..6 = Stage Detail View
  const [activeStageNum, setActiveStageNum] = useState(null);

  // Sync landArea and stageOperationsMap when selectedField changes
  useEffect(() => {
    if (selectedField?.id) {
      setLandArea(String(selectedField?.ha || '1.50'));
      const map = {};
      for (let i = 1; i <= 6; i++) {
        map[i] = getFieldCustomOperations(selectedField?.id, i);
      }
      setStageOperationsMap(map);
    }
  }, [selectedField?.id]);

  // Custom Operations mapped by stage number (1 to 6)
  const [stageOperationsMap, setStageOperationsMap] = useState(() => {
    const map = {};
    for (let i = 1; i <= 6; i++) {
        map[i] = getFieldCustomOperations(selectedField?.id || '', i);
    }
    return map;
  });

  // Modal: Add Custom Operation
  const [showAddOpModal, setShowAddOpModal] = useState(false);
  const [newOpName, setNewOpName] = useState('');
  const [newOpType, setNewOpType] = useState('group'); // 'group' or 'direct'
  const [newOpPerHa, setNewOpPerHa] = useState('1');
  const [newOpUnit, setNewOpUnit] = useState('ha');
  const [newOpRate, setNewOpRate] = useState('1000');
  const [selectedCatalogOp, setSelectedCatalogOp] = useState(null);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isTransferringOps, setIsTransferringOps] = useState(false);
  const [isLoadingPlanner, setIsLoadingPlanner] = useState(false);
  const [plannerError, setPlannerError] = useState(null);
  const [expandedOpId, setExpandedOpId] = useState(null);
  const [areaUnit, setAreaUnit] = useState('ha'); // 'ha' | 'sqm'

  // Modal: Add Child Item to a specific operation
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [targetOpIdForChild, setTargetOpIdForChild] = useState(null);
  const [newChildName, setNewChildName] = useState('');
  const [newChildCategory, setNewChildCategory] = useState('material');
  const [newChildQty, setNewChildQty] = useState('2');
  const [newChildUnit, setNewChildUnit] = useState('bag');
  const [newChildRate, setNewChildRate] = useState('1600');

  useEffect(() => {
    const unsub = subscribe(() => {
      const cur = getCurrentSession();
      setSession({ ...cur });
      if (cur.role === 'Member Farmer') {
        const uId = cur.employeeId || cur.id || '';
        const defaultField = fields.find(field => 
          field.memberUserId === uId ||
          field.memberId === uId ||
          field.member === cur.name ||
          field.memberName === cur.name ||
          (cur.fieldId && field.id === cur.fieldId)
        ) || null;
        setSelectedField(defaultField);
        setLandArea(defaultField?.ha ? String(defaultField.ha) : '');
      }
    });
    return unsub;
  }, []);

  // When selected field changes, reload its operations map
  useEffect(() => {
    if (selectedField) {
      const map = {};
      for (let i = 1; i <= 6; i++) {
        map[i] = getFieldCustomOperations(selectedField?.id, i);
      }
      setStageOperationsMap(map);
      setLandArea(selectedField?.ha ? String(selectedField?.ha) : '');
    }
  }, [selectedField?.id]);

  const currentStage = useMemo(() => {
    if (!activeStageNum) return null;
    return DEFAULT_GROWTH_STAGES.find(s => s.stageNum === activeStageNum) || DEFAULT_GROWTH_STAGES[0];
  }, [activeStageNum]);

  const currentOperations = useMemo(() => {
    if (!activeStageNum) return [];
    return stageOperationsMap[activeStageNum] || [];
  }, [stageOperationsMap, activeStageNum]);

  // Scaled area in Hectares (1 Ha = 10,000 sqm)
  const area = useMemo(() => {
    const raw = parseFloat(landArea) || 0;
    if (areaUnit === 'sqm') return raw / 10000;
    return raw;
  }, [landArea, areaUnit]);

  // Active Stage Detection
  const isActiveFieldStage = useMemo(() => {
    if (!currentStage) return false;
    const fieldStageName = (selectedField?.stage || '').toLowerCase();
    return fieldStageName.includes(`stage ${currentStage.stageNum}`);
  }, [selectedField, currentStage]);

  // Stage Completion Detection (checks if field has progressed past this stage)
  const currentFieldStageInfo = useMemo(() => {
    const fieldStageName = (selectedField?.stage || '').toLowerCase();
    let num = selectedField?.stageNumber || 1;
    const stageMatch = fieldStageName.match(/stage\s*(\d+)/i);
    if (stageMatch) {
      num = parseInt(stageMatch[1], 10);
    } else if (fieldStageName.includes('prep') || fieldStageName.includes('tillage') || fieldStageName.includes('plow')) {
      num = 1;
    } else if (fieldStageName.includes('plant') || fieldStageName.includes('establishment') || fieldStageName.includes('patdan')) {
      num = 2;
    } else if (fieldStageName.includes('basal') || fieldStageName.includes('nutrition') || fieldStageName.includes('early care')) {
      num = 3;
    } else if (fieldStageName.includes('cultivation') || fieldStageName.includes('weed') || fieldStageName.includes('off-barring')) {
      num = 4;
    } else if (fieldStageName.includes('maintenance') || fieldStageName.includes('top-dress') || fieldStageName.includes('hilling')) {
      num = 5;
    } else if (fieldStageName.includes('harvest') || fieldStageName.includes('cutting') || fieldStageName.includes('hauling') || fieldStageName.includes('milling')) {
      num = 6;
    }
    const isCycleComplete = fieldStageName.includes('complete') || fieldStageName.includes('mill');
    return { currentStageNum: num, isCycleComplete };
  }, [selectedField]);

  const isStageCompletedInField = (stgNum) => {
    if (currentFieldStageInfo.isCycleComplete) return true;
    return stgNum < currentFieldStageInfo.currentStageNum;
  };

  // Compute Cost for any stage given its ops and area
  const computeStageCost = (stgNum) => {
    const ops = stageOperationsMap[stgNum] || [];
    return ops.reduce((sum, op) => {
      let opPerHa = 0;
      if (op.isGroup) {
        opPerHa = (op.subItems || []).reduce((s, si) => s + (si.qty * si.unitCost), 0) || op.costPerHa || 0;
      } else {
        opPerHa = (op.perHa || 0) * (op.rate || 0) || op.costPerHa || 0;
      }
      return sum + (opPerHa * area);
    }, 0);
  };

  // Total Full Season Budget across all 6 stages
  const fullSeasonTotal = useMemo(() => {
    let total = 0;
    for (let i = 1; i <= 6; i++) {
      total += computeStageCost(i);
    }
    return total;
  }, [stageOperationsMap, area]);

  // Update Direct Operation's own input fields
  const updateDirectOp = (opId, field, value) => {
    if (!activeStageNum) return;
    const valNum = parseFloat(value);
    setStageOperationsMap(prev => {
      const currentList = prev[activeStageNum] || [];
      const updated = currentList.map(op => {
        if (op.id !== opId) return op;
        const newOp = { ...op };
        if (field === 'perHa') newOp.perHa = isNaN(valNum) ? 0 : valNum;
        if (field === 'unit') newOp.unit = value;
        if (field === 'rate') newOp.rate = isNaN(valNum) ? 0 : valNum;
        newOp.costPerHa = Math.round((newOp.perHa || 0) * (newOp.rate || 0));
        return newOp;
      });
      return { ...prev, [activeStageNum]: updated };
    });
  };

  // Toggle between Direct input and Title-only group
  const toggleOpStructure = (opId) => {
    if (!activeStageNum) return;
    setStageOperationsMap(prev => {
      const currentList = prev[activeStageNum] || [];
      const updated = currentList.map(op => {
        if (op.id !== opId) return op;
        const willBeGroup = !op.isGroup;
        if (willBeGroup) {
          const defaultSub = (op.subItems && op.subItems.length > 0)
            ? op.subItems
            : [{ id: `SI-${Date.now()}`, description: `${op.name} Item 1`, qty: op.perHa || 1, unit: op.unit || 'ha', unitCost: op.rate || 1000, subTotal: Math.round((op.perHa || 1) * (op.rate || 1000)) }];
          const costPerHa = defaultSub.reduce((sum, si) => sum + (si.subTotal || 0), 0);
          return {
            ...op,
            isGroup: true,
            inputType: 'group',
            subItems: defaultSub,
            costPerHa
          };
        } else {
          const totalFromSub = (op.subItems || []).reduce((sum, si) => sum + (si.subTotal || 0), 0);
          const safePerHa = op.perHa || 1;
          const rateVal = op.rate || Math.round(totalFromSub / safePerHa) || op.costPerHa || 1000;
          return {
            ...op,
            isGroup: false,
            inputType: 'direct',
            perHa: safePerHa,
            unit: op.unit || 'ha',
            rate: rateVal,
            costPerHa: Math.round(safePerHa * rateVal)
          };
        }
      });
      return { ...prev, [activeStageNum]: updated };
    });
  };

  // Update a child item's quantity or rate in an operation
  const updateChildItem = (opId, childIndex, field, value) => {
    if (!activeStageNum) return;
    const valNum = parseFloat(value);
    setStageOperationsMap(prev => {
      const currentList = prev[activeStageNum] || [];
      const updated = currentList.map(op => {
        if (op.id !== opId) return op;
        const subItems = (op.subItems || []).map((si, idx) => {
          if (idx !== childIndex) return si;
          const newSi = { ...si };
          if (field === 'qty') newSi.qty = isNaN(valNum) ? 0 : valNum;
          if (field === 'unit') newSi.unit = value;
          if (field === 'unitCost') newSi.unitCost = isNaN(valNum) ? 0 : valNum;
          newSi.subTotal = Math.round((newSi.qty || 0) * (newSi.unitCost || 0));
          return newSi;
        });
        const costPerHa = subItems.reduce((sum, si) => sum + (si.subTotal || 0), 0);
        return { ...op, subItems, costPerHa };
      });
      return { ...prev, [activeStageNum]: updated };
    });
  };

  // Remove a child item from an operation
  const removeChildItem = (opId, childIndex) => {
    if (!activeStageNum) return;
    setStageOperationsMap(prev => {
      const currentList = prev[activeStageNum] || [];
      const updated = currentList.map(op => {
        if (op.id !== opId) return op;
        const subItems = (op.subItems || []).filter((_, idx) => idx !== childIndex);
        const costPerHa = subItems.reduce((sum, si) => sum + (si.subTotal || 0), 0);
        return { ...op, subItems, costPerHa };
      });
      return { ...prev, [activeStageNum]: updated };
    });
  };

  // Add child item to an operation
  const handleAddChildItem = () => {
    if (!newChildName.trim()) {
      Alert.alert('Required', 'Please enter a name or description for this item.');
      return;
    }
    const q = parseFloat(newChildQty) || 1;
    const r = parseFloat(newChildRate) || 0;
    const newItem = {
      id: generateSubItemId(targetOpIdForChild || 'COP', 0),
      category: newChildCategory,
      description: newChildName.trim(),
      name: newChildName.trim(),
      qty: q,
      unit: newChildUnit,
      unitCost: r,
      rate: r,
      subTotal: Math.round(q * r)
    };

    setStageOperationsMap(prev => {
      const currentList = prev[activeStageNum] || [];
      const updated = currentList.map(op => {
        if (op.id !== targetOpIdForChild) return op;
        const subItems = [...(op.subItems || []), newItem];
        const costPerHa = subItems.reduce((sum, si) => sum + (si.subTotal || 0), 0);
        return { ...op, isGroup: true, subItems, costPerHa };
      });
      return { ...prev, [activeStageNum]: updated };
    });

    setNewChildName('');
    setNewChildQty('2');
    setNewChildRate('1600');
    setShowAddChildModal(false);
  };

  // Remove operation from stage
  const removeOperation = (opId) => {
    if (!activeStageNum) return;
    setStageOperationsMap(prev => {
      const currentList = prev[activeStageNum] || [];
      const updated = currentList.filter(op => op.id !== opId);
      return { ...prev, [activeStageNum]: updated };
    });
  };

  // Add Operation to stage (from Catalogue or Custom)
  const handleAddOperation = () => {
    if (!activeStageNum) return;
    let opToAdd = null;
    if (selectedCatalogOp) {
      const customOpId = generateCustomOpId(activeStageNum);
      opToAdd = {
        ...selectedCatalogOp,
        id: customOpId,
        stageNum: activeStageNum,
        stageId: currentStage.id,
        isCustom: false,
        subItems: (selectedCatalogOp.subItems || []).map((si, i) => ({
          ...si,
          id: generateSubItemId(customOpId, i)
        }))
      };
    } else if (newOpName.trim()) {
      const perHaNum = parseFloat(newOpPerHa) || 1;
      const rateNum = parseFloat(newOpRate) || 0;
      const isGrp = newOpType === 'group';
      const customOpId = generateCustomOpId(activeStageNum);
      opToAdd = {
        id: customOpId,
        stageNum: activeStageNum,
        stageId: currentStage.id,
        name: newOpName.trim(),
        category: 'custom',
        isGroup: isGrp,
        inputType: newOpType,
        isCustom: true,
        perHa: isGrp ? 0 : perHaNum,
        unit: isGrp ? '' : newOpUnit,
        rate: rateNum,
        costPerHa: isGrp ? 0 : Math.round(perHaNum * rateNum),
        subItems: isGrp ? [{ id: generateSubItemId(customOpId, 0), description: `${newOpName.trim()} Item 1`, qty: 1, unit: 'ha', unitCost: 1000, subTotal: 1000 }] : []
      };
    } else {
      Alert.alert('Required', 'Please select an operation from the catalogue or type a custom operation name.');
      return;
    }

    setStageOperationsMap(prev => ({
      ...prev,
      [activeStageNum]: [...(prev[activeStageNum] || []), opToAdd]
    }));

    setNewOpName('');
    setSelectedCatalogOp(null);
    setShowAddOpModal(false);
  };

  // Reset current stage operations to SRA defaults
  const resetStageToDefault = () => {
    if (!activeStageNum) return;
    const defaults = getDefaultStageOperations(activeStageNum);
    setStageOperationsMap(prev => ({
      ...prev,
      [activeStageNum]: defaults
    }));
    Alert.alert('Reset', `Stage ${activeStageNum} operations restored to standard template.`);
  };

  // Reset ALL 6 stages to SRA defaults
  const resetAllStagesToDefault = () => {
    Alert.alert(
      'Reset All Stages',
      'Restore all 6 stages to standard templates?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset All',
          style: 'destructive',
          onPress: () => {
            const map = {};
            for (let i = 1; i <= 6; i++) {
              map[i] = getDefaultStageOperations(i);
            }
            setStageOperationsMap(map);
            if (selectedField?.id) saveFieldFullPlan(selectedField.id, map);
            Alert.alert('Restored', 'All 6 stages restored to standard templates.');
          }
        }
      ]
    );
  };

  // Save full custom plan for this field
  const handleSaveFieldPlan = async () => {
    const targetFieldId = selectedField?.id || '';
    if (!targetFieldId) {
      Alert.alert('No Field Selected', 'Please select a field plot before saving a customized plan.');
      return;
    }
    setIsSavingPlan(true);
    try {
      await saveFieldFullPlan(targetFieldId, stageOperationsMap);
      setIsSavingPlan(false);
      Alert.alert(
        'Farm Plan Saved',
        `Custom plan for ${targetFieldId} recorded to database! Field Operations will now use these customized operations.`
      );
    } catch (e) {
      setIsSavingPlan(false);
      Alert.alert('Error', 'Failed to save custom plan to database.');
    }
  };

  // Send single operation to Field Ops
  const sendSingleOperationToFieldOps = async (op) => {
    if (area <= 0) {
      Alert.alert('Required', 'Please enter a valid land area first.');
      return;
    }

    const isStageDone = isStageCompletedInField(currentStage.stageNum);

    const executeSend = async (isSupplemental) => {
      const draftLog = createDraftLogForOp(op, isSupplemental);
      await saveDraftLogs();

      const subtitle = isSupplemental
        ? `"${op.name}" (₱ ${fmt(draftLog.cost)}) created as a SUPPLEMENTAL Draft Log for ${draftLog.fieldId}. Submitting this in Field Ops will not overwrite or rewind the field's current stage.`
        : `"${op.name}" (₱ ${fmt(draftLog.cost)}) created as a Draft Log for ${draftLog.fieldId}.`;

      Alert.alert(
        isSupplemental ? 'Supplemental Draft Created' : 'Operation Saved to Drafts',
        subtitle,
        [
          { text: 'Keep Planning', style: 'cancel' },
          { 
            text: 'Go to Drafts', 
            onPress: () => navigation && navigation.navigate('Field Ops', { 
              screen: 'SchedMain', 
              params: { openDrafts: true, initialTab: 'drafts', highlightDraftIds: [draftLog.id], fieldId: draftLog.fieldId } 
            }) 
          }
        ]
      );
    };

    if (isStageDone) {
      Alert.alert(
        'Stage Already Completed in Field',
        `Field "${selectedField?.name || selectedField?.id || 'Selected Field'}" has already completed Stage ${currentStage.stageNum} (${currentStage.label}).\n\nWould you like to send this as a Supplemental Entry? (Field stage progress will be safely preserved).`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Log as Supplemental', 
            onPress: () => executeSend(true) 
          }
        ]
      );
    } else {
      await executeSend(false);
    }
  };

  // Helper to create and insert a draft log object
  const createDraftLogForOp = (op, isSupplemental = false) => {
    const fieldId = selectedField?.id || '';
    const draftId = generateDraftId(fieldId);
    let subItems = [];
    let totalOpCost = 0;

    if (op.isGroup) {
      subItems = (op.subItems || []).map((si, idx) => ({
        id: generateSubItemId(draftId, idx),
        description: si.description || si.name,
        qty: Number((si.qty * (si.unit === 'lac' || si.unit === 'pass' || si.unit === 'ha' || si.unit === 'ton' ? area : 1)).toFixed(1)),
        unit: si.unit,
        unitCost: si.unitCost || si.rate || 0,
        subTotal: Math.round((si.qty * (si.unit === 'lac' || si.unit === 'pass' || si.unit === 'ha' || si.unit === 'ton' ? area : 1)) * (si.unitCost || si.rate || 0))
      }));
      totalOpCost = subItems.reduce((sum, si) => sum + si.subTotal, 0) || Math.round((op.costPerHa || 0) * area);
    } else {
      const directQty = Number(((op.perHa || 1) * area).toFixed(1));
      const directCost = Math.round(directQty * (op.rate || 0));
      totalOpCost = directCost;
    }

    const draftLog = {
      id: draftId,
      fieldId: fieldId,
      taskId: currentStage.id,
      stageNumber: currentStage.stageNum,
      stageName: currentStage.label,
      sraOperationId: op.id,
      operationName: op.name,
      category: op.category || 'prep',
      activity: op.name,
      isGroup: op.isGroup ?? false,
      inputType: op.isGroup ? 'group' : 'direct',
      cost: totalOpCost,
      totalCost: totalOpCost,
      hectares: landArea,
      people: '2',
      subItems: op.isGroup ? subItems : [],
      inputQty: !op.isGroup ? String(Number(((op.perHa || 1) * area).toFixed(1))) : '',
      inputUnit: !op.isGroup ? (op.unit || 'ha') : '',
      inputName: !op.isGroup ? op.name : '',
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      createdAt: new Date().toISOString(),
      isNew: true,
      status: 'Draft',
      isSupplemental: Boolean(isSupplemental),
    };

    DRAFT_LOGS.unshift(draftLog);
    return draftLog;
  };

  // Send entire stage plan to Drafts
  const sendStagePlanToFieldOps = async () => {
    if (isTransferringOps) return;
    if (area <= 0 || currentOperations.length === 0) {
      Alert.alert('Required', 'Please ensure land area and at least one operation are configured.');
      return;
    }

    const isStageDone = isStageCompletedInField(currentStage.stageNum);

    const executeSendAll = async (isSupplemental) => {
      setIsTransferringOps(true);
      try {
        const targetFieldId = (selectedField?.id || '').trim().toUpperCase();
        const createdIds = [];
        currentOperations.forEach(op => {
          const d = createDraftLogForOp(op, isSupplemental);
          createdIds.push(d.id);
        });
        await saveDraftLogs();

        const subtitle = isSupplemental
          ? `All ${currentOperations.length} operations for Stage ${currentStage.stageNum} transferred as SUPPLEMENTAL Drafts. Field stage progression will be preserved.`
          : `All ${currentOperations.length} operations for Stage ${currentStage.stageNum} transferred as Draft Logs to Field Operations.`;

        Alert.alert(
          isSupplemental ? 'Supplemental Stage Plan Saved!' : 'Stage Plan Saved to Drafts!',
          subtitle,
          [
            { text: 'Keep Planning', style: 'cancel' },
            { 
              text: 'Go to Drafts', 
              onPress: () => navigation && navigation.navigate('Field Ops', { 
                screen: 'SchedMain', 
                params: { openDrafts: true, initialTab: 'drafts', highlightDraftIds: createdIds, fieldId: targetFieldId } 
              }) 
            }
          ]
        );
      } catch (err) {
        Alert.alert('Transfer Failed', err?.message || 'Failed to save stage operations to drafts.');
      } finally {
        setIsTransferringOps(false);
      }
    };

    if (isStageDone) {
      Alert.alert(
        'Stage Already Completed in Field',
        `Field "${selectedField?.name || selectedField?.id || 'Selected Field'}" has already progressed past Stage ${currentStage.stageNum} (${currentStage.label}).\n\nDo you want to send all ${currentOperations.length} operations as Supplemental Entries? (Current field stage will not regress).`,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Save as Supplemental', 
            onPress: () => executeSendAll(true) 
          }
        ]
      );
    } else {
      await executeSendAll(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        
        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* VIEW 1: GROWTH STAGES HUB (Clean Choices Grid)                */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {activeStageNum === null ? (
          <>
            {/* Title */}
            <View>
              <Text style={s.pageTitle}>{t('planner_page_title', 'Sugarcane Crop Year Cycle Planner')}</Text>
              <Text style={s.pageSub}>{t('planner_page_sub', 'Select a growth stage below to inspect, customize, or dispatch operations.')}</Text>
            </View>

            {/* Field Switcher & Toggle */}
            <View style={{ marginBottom: 4 }}>
              {!isMember && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase' }}>
                    Select Plot to Plan
                  </Text>
                  <View style={{ flexDirection: 'row', backgroundColor: '#EEF2E6', borderRadius: RADIUS.sm, padding: 2 }}>
                    <TouchableOpacity
                      style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.xs }, fieldScope === 'my' && { backgroundColor: '#fff', ...SHADOW.card }]}
                      onPress={() => {
                        setFieldScope('my');
                        const myF = fields.find(f => f.memberId === session.employeeId || f.member === session.name || f.memberName === session.name || (session.fieldId && f.id === session.fieldId));
                        setSelectedField(myF || null);
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: fieldScope === 'my' ? '800' : '600', color: fieldScope === 'my' ? COLORS.primary : COLORS.textMuted }}>
                        My Plot ({allFields.filter(f => f.memberId === session.employeeId || f.member === session.name || f.memberName === session.name || (session.fieldId && f.id === session.fieldId)).length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.xs }, fieldScope === 'all' && { backgroundColor: '#fff', ...SHADOW.card }]}
                      onPress={() => {
                        setFieldScope('all');
                        if (!selectedField && allFields.length > 0) {
                          setSelectedField(allFields[0]);
                        }
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: fieldScope === 'all' ? '800' : '600', color: fieldScope === 'all' ? COLORS.primary : COLORS.textMuted }}>
                        All Plots ({allFields.length})
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Field Chips with clean 3-item cut-off and +More modal button */}
              {displayedFields.length === 0 ? (
                <View style={{ padding: 12, backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.text }}>No Personal Plots Assigned</Text>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>You do not have a personal plot allocated. Switch to "All Plots" above to plan for block farm member plots.</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.lg, marginBottom: 2 }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 8 }}>
                  {displayedFields.slice(0, 3).map(f => (
                    <TouchableOpacity
                      key={f.id}
                      style={[
                        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff' },
                        selectedField?.id === f.id && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }
                      ]}
                      onPress={() => setSelectedField(f)}
                      activeOpacity={0.75}
                    >
                      <Ionicons name="leaf" size={13} color={selectedField?.id === f.id ? COLORS.primary : COLORS.textMuted} />
                      <Text style={{ fontSize: 12.5, fontWeight: selectedField?.id === f.id ? '900' : '600', color: selectedField?.id === f.id ? COLORS.primary : COLORS.textSecondary }}>
                        {f.id} ({f.ha} Ha)
                      </Text>
                    </TouchableOpacity>
                  ))}

                  {displayedFields.length > 3 && (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }}
                      onPress={() => setShowFieldPickerModal(true)}
                      activeOpacity={0.75}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: COLORS.primary }}>
                        + {displayedFields.length - 3} More
                      </Text>
                      <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
                    </TouchableOpacity>
                  )}
                </ScrollView>
              )}
            </View>

            {/* Selected Field & Land Area Card */}
            <View style={s.fieldCard}>
              <View style={s.fieldCardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.fieldIdText}>{selectedField?.id || 'No field selected'}</Text>
                    <Text style={s.fieldFarmText}>· {selectedField?.blockFarm || (session?.farm || session?.blockFarm || 'District Central')}</Text>
                  </View>
                  <Text style={s.fieldMemberText}>{t('assigned_lbl', 'Assigned')}: {selectedField?.member || session.name}</Text>
                </View>

                {/* Clean Land Area Editor Pill with Unit Choice */}
                <View style={s.areaPill}>
                  <Text style={s.areaPillLabel}>{t('lbl_area', 'Area')}</Text>
                  <View style={s.areaInputRow}>
                    <TextInput
                      style={s.areaInput}
                      value={String(landArea)}
                      onChangeText={setLandArea}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                    />
                    <TouchableOpacity
                      onPress={() => setAreaUnit(prev => prev === 'ha' ? 'sqm' : 'ha')}
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: COLORS.primary + '50',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: RADIUS.xs,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                        minHeight: 26
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={s.areaUnitText}>{areaUnit === 'sqm' ? 'sqm' : 'Ha'}</Text>
                      <Ionicons name="swap-vertical" size={12} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <View style={s.fieldCardFooter}>
                <View style={s.activePill}>
                  <Ionicons name="git-network-outline" size={13} color={COLORS.primary} />
                  <Text style={s.activePillText}>{t('ops_synced_badge', 'Field Ops Synced')}</Text>
                </View>
                <Text style={s.syncHintText} numberOfLines={2}>{t('adjust_area_hint', 'Adjust area anytime to scale costs')}</Text>
              </View>
            </View>

            {/* Full Season Budget Summary Banner */}
            <View style={s.hubSummaryBanner}>
              <View>
                <Text style={s.hubSummaryLabel}>{t('full_season_budget', 'FULL SEASON ESTIMATED BUDGET')}</Text>
                <Text style={s.hubSummaryValue}>Php {fmt(Math.round(fullSeasonTotal))}</Text>
                <Text style={s.hubSummarySub}>{t('whole_cycle_plan_for', 'Whole cycle customized plan for')} {landArea} Ha (6 {t('stages_word', 'Stages')})</Text>
              </View>
            </View>

            {/* Stage Choices Section Header */}
            <View style={s.hubSectionHeader}>
              <Text style={s.sectionLabel}>{t('select_stage_to_open', 'Select Growth Stage to Open (Stages 1–6)')}</Text>
            </View>

            {/* ── 6 STAGE COMPACT GROUPED LIST ── */}
            <View style={{ gap: 8 }}>
              {DEFAULT_GROWTH_STAGES.map(stg => {
                const stgOps = stageOperationsMap[stg.stageNum] || [];
                const stgCost = computeStageCost(stg.stageNum);
                const isFieldActive = (selectedField?.stage || '').toLowerCase().includes(`stage ${stg.stageNum}`);
                const isFieldCompleted = isStageCompletedInField(stg.stageNum);

                return (
                  <TouchableOpacity
                    key={stg.key}
                    style={{
                      backgroundColor: '#fff',
                      borderRadius: RADIUS.md,
                      borderWidth: 1,
                      borderColor: isFieldActive ? COLORS.primary : (isFieldCompleted ? '#C0D9A8' : COLORS.border),
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      ...SHADOW.card
                    }}
                    onPress={() => setActiveStageNum(stg.stageNum)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: stg.color, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{stg.stageNum}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 14.5, fontWeight: '600', color: COLORS.text }}>
                            {formatStageName ? formatStageName(stg.label, false) : (t(`stage_${stg.stageNum}_short`, stg.shortLabel))}
                          </Text>
                          {isFieldActive && (
                            <View style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.primaryBorder }}>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.primary }}>Current</Text>
                            </View>
                          )}
                          {isFieldCompleted && !isFieldActive && (
                            <View style={{ backgroundColor: '#E8F5E8', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#C0D9A8', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                              <Ionicons name="checkmark-circle" size={10} color="#16A34A" />
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#16A34A' }}>Done</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                          {formatPhaseMonth ? formatPhaseMonth(stg.month) : stg.month} · {stgOps.length} {stgOps.length === 1 ? 'Op' : 'Ops'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.text }}>₱ {fmt(Math.round(stgCost))}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.primary }}>Inspect</Text>
                        <Ionicons name="chevron-forward" size={13} color={COLORS.primary} />
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Hub Global Action Buttons */}
            <View style={{ gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                style={s.saveFullPlanBtn}
                onPress={handleSaveFieldPlan}
                activeOpacity={0.85}
              >
                <Ionicons name="save-outline" size={18} color={COLORS.primary} />
                <Text style={s.saveFullPlanBtnText} numberOfLines={1} adjustsFontSizeToFit>{t('btn_save_full_plan', 'Save Full Season Plan')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.resetAllBtn}
                onPress={resetAllStagesToDefault}
                activeOpacity={0.85}
              >
                <Ionicons name="refresh-outline" size={16} color={COLORS.textMuted} />
                <Text style={s.resetAllBtnText}>{t('btn_reset_all_stages', 'Reset All 6 Stages to Standard Template')}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          /* ═══════════════════════════════════════════════════════════════ */
          /* VIEW 2: STAGE CUSTOMIZATION DETAIL VIEW                      */
          /* ═══════════════════════════════════════════════════════════════ */
          <>
            {/* Navigation Back to Choices */}
            <TouchableOpacity
              style={s.backToStagesBtn}
              onPress={() => setActiveStageNum(null)}
              activeOpacity={0.75}
            >
              <Ionicons name="arrow-back" size={18} color={COLORS.primary} />
              <Text style={s.backToStagesText}>{t('btn_back_to_stages', 'Back to All Growth Stages')}</Text>
            </TouchableOpacity>

            {/* Stage Quick Switcher Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -SPACING.lg, marginBottom: 4 }} contentContainerStyle={{ paddingHorizontal: SPACING.lg, gap: 6 }}>
              {DEFAULT_GROWTH_STAGES.map(stg => {
                const isSelected = activeStageNum === stg.stageNum;
                const isDone = isStageCompletedInField(stg.stageNum);
                return (
                  <TouchableOpacity
                    key={stg.key}
                    style={[
                      s.quickStageChip,
                      isSelected && { backgroundColor: stg.color, borderColor: stg.color },
                      isDone && !isSelected && { borderColor: '#C0D9A8', backgroundColor: '#F0FDF4' }
                    ]}
                    onPress={() => setActiveStageNum(stg.stageNum)}
                    activeOpacity={0.75}
                  >
                    <Text style={[
                      s.quickStageChipText,
                      isSelected && { color: '#fff', fontWeight: '900' },
                      isDone && !isSelected && { color: '#16A34A', fontWeight: '700' }
                    ]}>
                      {isDone ? '✓ ' : ''}{t('stage_word', 'Stage')} {stg.stageNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Active Stage Banner Card */}
            <View style={[
              s.activeStageBanner,
              isStageCompletedInField(currentStage.stageNum) && { borderColor: '#C0D9A8', backgroundColor: '#F0FDF4' }
            ]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[s.stageNumBadge, { backgroundColor: currentStage.color, width: 28, height: 28, borderRadius: 14 }]}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>{currentStage.stageNum}</Text>
                  </View>
                  <Text style={s.activeStageTitle}>{t(`stage_${currentStage.stageNum}_short`, currentStage.shortLabel)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {isStageCompletedInField(currentStage.stageNum) && (
                    <View style={{ backgroundColor: '#E8F5E8', paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#C0D9A8', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#16A34A' }}>Completed in Field</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={resetStageToDefault}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>{t('btn_reset_defaults', 'Reset Defaults')}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={s.activeStageTimeline}>{formatPhaseMonth ? formatPhaseMonth(currentStage.month) : currentStage.month}</Text>
              <Text style={s.activeStageDesc}>{t(`stage_${currentStage.stageNum}_desc`, currentStage.description)}</Text>

              {isStageCompletedInField(currentStage.stageNum) && (
                <View style={{ marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#FEF3C7', borderRadius: RADIUS.xs, borderWidth: 1, borderColor: '#FEF0D0', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="information-circle" size={14} color="#92400E" />
                  <Text style={{ fontSize: 11, color: '#92400E', fontWeight: '700', flex: 1 }}>
                    Plot has progressed past this stage. Any operation sent to Field Ops will be recorded as a Supplemental Entry to protect active field progress.
                  </Text>
                </View>
              )}
            </View>

            {/* Operations in Stage Card */}
            <View style={s.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1, marginRight: 6 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{t('operations_in_stage', 'Operations in Stage')} {currentStage.stageNum}</Text>
                  <Text style={s.cardSub} numberOfLines={1}>{currentOperations.length} {currentOperations.length === 1 ? t('operations_count_singular', 'Operation') : t('operations_count_plural', 'Operations')} {t('planned_for_area', 'planned for')} {landArea} Ha</Text>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.md, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, minHeight: 44 }}
                  onPress={() => setShowAddOpModal(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 13.5, fontWeight: '900' }}>{t('btn_add_op', 'Add Op')}</Text>
                </TouchableOpacity>
              </View>

              {currentOperations.length === 0 && (
                <View style={{ paddingVertical: 24, alignItems: 'center', gap: 6 }}>
                  <Ionicons name="construct-outline" size={32} color={COLORS.border} />
                  <Text style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: '600' }}>{t('no_ops_in_stage', 'No operations planned for this stage yet.')}</Text>
                  <TouchableOpacity
                    style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.md, marginTop: 4, minHeight: 44, justifyContent: 'center' }}
                    onPress={() => setShowAddOpModal(true)}
                  >
                    <Text style={{ color: COLORS.primary, fontSize: 13.5, fontWeight: '800' }}>{t('choose_cat_or_custom', 'Choose from Catalogue or Add Custom')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Operations List */}
              {currentOperations.map((op, idx) => {
                const totalCostForArea = op.isGroup
                  ? ((op.subItems || []).reduce((s, si) => s + (si.qty * area * si.unitCost), 0) || Math.round((op.costPerHa || 0) * area))
                  : Math.round(((op.perHa || 1) * area) * (op.rate || 0));
                const isExpanded = expandedOpId === op.id;

                return (
                  <View key={op.id || idx} style={s.opCard}>
                    {/* Operation Summary Header (Tap to expand/collapse) */}
                    <TouchableOpacity
                      style={s.opHeader}
                      onPress={() => setExpandedOpId(prev => prev === op.id ? null : op.id)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <View style={s.opBadge}>
                            <Text style={s.opBadgeText}>{t('op_number_badge', 'Op #')}{idx + 1}</Text>
                          </View>
                          <Text style={s.opNameText}>{formatOperationName ? formatOperationName(op.name) : op.name}</Text>
                        </View>
                        <Text style={{ fontSize: 13.5, color: COLORS.textMuted, marginTop: 4 }}>
                          {op.isGroup 
                            ? `${(op.subItems || []).length} Line Items · Structured Bundle` 
                            : `Direct: ${op.perHa} ${op.unit}/ha @ ₱${fmt(op.rate)}`}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 17, fontWeight: '900', color: COLORS.primaryDark }}>
                          ₱{fmt(totalCostForArea)}
                        </Text>
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 6,
                          backgroundColor: isExpanded ? COLORS.primary : '#F0F8EC',
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                          borderRadius: RADIUS.md,
                          borderWidth: 1.5,
                          borderColor: COLORS.primary,
                          minHeight: 38,
                          ...SHADOW.sm
                        }}>
                          <Ionicons
                            name={isExpanded ? "checkmark-circle" : "create-outline"}
                            size={16}
                            color={isExpanded ? "#fff" : COLORS.primary}
                          />
                          <Text style={{ fontSize: 13, fontWeight: '900', color: isExpanded ? '#fff' : COLORS.primary }}>
                            {isExpanded ? t('btn_done', 'Done') : t('btn_edit', 'Edit')}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Operation Action Row */}
                    <View style={s.opActionBar}>
                      <TouchableOpacity
                        style={s.sendOpBtnClean}
                        onPress={() => sendSingleOperationToFieldOps(op)}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="paper-plane-outline" size={16} color={COLORS.primary} />
                        <Text style={s.sendOpBtnTextClean} numberOfLines={1} adjustsFontSizeToFit>
                          {t('send_to_drafts_btn', 'Save to Drafts')}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => removeOperation(op.id)}
                        style={s.trashBtnClean}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel="Delete operation"
                      >
                        <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>

                    {/* Expanded Configuration Panel */}
                    {isExpanded && (
                      <View style={s.opExpandedPanel}>
                        {/* Operation Mode Segmented Switcher */}
                        <View style={s.structureSegmentWrap}>
                          <TouchableOpacity
                            style={[
                              s.structureSegmentBtn,
                              op.isGroup && s.structureSegmentBtnActive
                            ]}
                            onPress={() => {
                              if (!op.isGroup) toggleOpStructure(op.id);
                            }}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="layers-outline" size={14} color={op.isGroup ? COLORS.primary : COLORS.textMuted} />
                            <Text style={[s.structureSegmentText, op.isGroup && s.structureSegmentTextActive]} numberOfLines={1} adjustsFontSizeToFit>{t('mode_title_child', 'Title with Child Items')}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              s.structureSegmentBtn,
                              !op.isGroup && s.structureSegmentBtnActive
                            ]}
                            onPress={() => {
                              if (op.isGroup) toggleOpStructure(op.id);
                            }}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="create-outline" size={14} color={!op.isGroup ? COLORS.primary : COLORS.textMuted} />
                            <Text style={[s.structureSegmentText, !op.isGroup && s.structureSegmentTextActive]} numberOfLines={1} adjustsFontSizeToFit>{t('mode_direct_input', 'Direct Input')}</Text>
                          </TouchableOpacity>
                        </View>

                        {/* CASE A: Group Operation -> Child Sub-Items */}
                        {op.isGroup ? (
                          <View style={s.childListWrap}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                {t('line_items_label', 'Line Items')}
                              </Text>
                              <TouchableOpacity
                                onPress={() => {
                                  setTargetOpIdForChild(op.id);
                                  setShowAddChildModal(true);
                                }}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primaryBg, borderWidth: 1.5, borderColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.md, minHeight: 44 }}
                                activeOpacity={0.75}
                              >
                                <Ionicons name="add-circle" size={18} color={COLORS.primary} />
                                <Text style={{ fontSize: 14, fontWeight: '900', color: COLORS.primary }}>
                                  {t('add_item_btn', 'Add Item')}
                                </Text>
                              </TouchableOpacity>
                            </View>

                            {(!op.subItems || op.subItems.length === 0) && (
                              <View style={{ paddingVertical: 18, alignItems: 'center', gap: 8, backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#E2EBDC' }}>
                                <Ionicons name="receipt-outline" size={26} color={COLORS.textMuted} />
                                <Text style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic' }}>
                                  {t('no_child_items_yet', 'No child line items added yet.')}
                                </Text>
                                <TouchableOpacity
                                  onPress={() => {
                                    setTargetOpIdForChild(op.id);
                                    setShowAddChildModal(true);
                                  }}
                                  style={{ paddingVertical: 8, paddingHorizontal: 16, backgroundColor: COLORS.primaryBg, borderWidth: 1, borderColor: COLORS.primary + '60', borderRadius: RADIUS.sm }}
                                >
                                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: COLORS.primary }}>
                                    {t('add_materials_sample', '+ Add Fertilizers, Materials, or Labor')}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            )}

                            {(op.subItems || []).map((child, cIdx) => {
                              const childTotalQty = Number(((child.qty || 1) * area).toFixed(1));
                              const childRate = child.unitCost || child.rate || 0;
                              const childLineTotal = Math.round(childTotalQty * childRate);

                              return (
                                <View key={child.id || cIdx} style={s.childItemRow}>
                                  {/* Child Header: Name & Delete */}
                                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.text }}>
                                        {child.description || child.name}
                                      </Text>
                                      <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 3 }}>
                                        Total: <Text style={{ fontWeight: '700', color: COLORS.text }}>{fmt(childTotalQty)} {child.unit}</Text> @ ₱{fmt(childRate)} = <Text style={{ fontWeight: '900', color: COLORS.primaryDark }}>₱{fmt(childLineTotal)}</Text>
                                      </Text>
                                    </View>

                                    <TouchableOpacity
                                      onPress={() => removeChildItem(op.id, cIdx)}
                                      style={s.removeChildBtn}
                                      activeOpacity={0.7}
                                      accessibilityLabel="Remove item"
                                    >
                                      <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                                    </TouchableOpacity>
                                  </View>

                                  {/* Child Inputs: Two distinct, clearly visible boxes */}
                                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                                    {/* Qty / Ha Input */}
                                    <View style={{ flex: 1 }}>
                                      <Text style={s.childInputLabel}>{t('dosage_per_ha_short', 'Qty / Ha')}</Text>
                                      <View style={s.childInputBox}>
                                        <TextInput
                                          style={s.childInputField}
                                          defaultValue={String(child.qty ?? 1)}
                                          onChangeText={v => updateChildItem(op.id, cIdx, 'qty', v)}
                                          keyboardType="decimal-pad"
                                          placeholder="1"
                                          placeholderTextColor={COLORS.textMuted}
                                        />
                                        <Text style={s.childInputUnit}>{child.unit || 'ha'}</Text>
                                      </View>
                                    </View>

                                    {/* Rate / Unit Input */}
                                    <View style={{ flex: 1 }}>
                                      <Text style={s.childInputLabel}>{t('unit_cost_short', 'Cost / Unit')}</Text>
                                      <View style={s.childInputBox}>
                                        <Text style={s.childInputCurrency}>₱</Text>
                                        <TextInput
                                          style={s.childInputField}
                                          defaultValue={String(child.unitCost ?? child.rate ?? 0)}
                                          onChangeText={v => updateChildItem(op.id, cIdx, 'unitCost', v)}
                                          keyboardType="decimal-pad"
                                          placeholder="0"
                                          placeholderTextColor={COLORS.textMuted}
                                        />
                                      </View>
                                    </View>
                                  </View>

                                  {/* Quick Unit Selector for Child Item */}
                                  <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F0F4EC' }}>
                                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 5 }}>
                                      {t('unit_choice_prompt', 'Unit')}: <Text style={{ fontWeight: '900', color: COLORS.primary }}>{child.unit || 'ha'}</Text>
                                    </Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                      {['ha', 'bag', 'ton', 'lacsa', 'day', 'kg', 'L', 'trip', 'sqm'].map(u => {
                                        const isSel = (child.unit || 'ha').toLowerCase() === u.toLowerCase();
                                        return (
                                          <TouchableOpacity
                                            key={u}
                                            onPress={() => updateChildItem(op.id, cIdx, 'unit', u)}
                                            style={{
                                              paddingHorizontal: 10,
                                              paddingVertical: 5,
                                              borderRadius: RADIUS.xs,
                                              borderWidth: 1.5,
                                              borderColor: isSel ? COLORS.primary : COLORS.border,
                                              backgroundColor: isSel ? COLORS.primaryBg : '#fff',
                                              minHeight: 32,
                                              justifyContent: 'center'
                                            }}
                                            activeOpacity={0.75}
                                          >
                                            <Text style={{ fontSize: 12, fontWeight: isSel ? '900' : '700', color: isSel ? COLORS.primary : COLORS.textSecondary }}>
                                              {u}
                                            </Text>
                                          </TouchableOpacity>
                                        );
                                      })}
                                    </ScrollView>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        ) : (
                          /* CASE B: Direct Single Operation -> Direct Inputs */
                          <View style={s.directInputWrap}>
                            <View style={{ gap: 10 }}>
                              {/* Dosage & Quantity */}
                              <View>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                  {t('dosage_per_ha_lbl', 'Dosage & Quantity')}
                                </Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FAFCF8', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, minHeight: 48 }}>
                                  <TextInput
                                    style={{ flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text, padding: 0 }}
                                    defaultValue={String(op.perHa || 1)}
                                    onChangeText={v => updateDirectOp(op.id, 'perHa', v)}
                                    keyboardType="decimal-pad"
                                    placeholder="e.g. 1"
                                    placeholderTextColor={COLORS.textMuted}
                                  />
                                  <View style={{ backgroundColor: COLORS.primaryBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.xs, borderWidth: 1, borderColor: COLORS.primary + '40' }}>
                                    <Text style={{ fontSize: 13.5, fontWeight: '900', color: COLORS.primary }}>{op.unit || 'ha'}</Text>
                                  </View>
                                </View>

                                {/* Quick Unit Choices */}
                                <View style={{ marginTop: 8 }}>
                                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.textSecondary, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                                    {t('choose_unit_lbl', 'Choose Unit:')}
                                  </Text>
                                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                                    {['ha', 'bag', 'ton', 'lacsa', 'day', 'kg', 'L', 'trip', 'sqm'].map(u => {
                                      const isSel = (op.unit || 'ha').toLowerCase() === u.toLowerCase();
                                      return (
                                        <TouchableOpacity
                                          key={u}
                                          onPress={() => updateDirectOp(op.id, 'unit', u)}
                                          style={{
                                            paddingHorizontal: 12,
                                            paddingVertical: 6,
                                            borderRadius: RADIUS.sm,
                                            borderWidth: 1.5,
                                            borderColor: isSel ? COLORS.primary : COLORS.border,
                                            backgroundColor: isSel ? COLORS.primaryBg : '#FAFCF8',
                                            minHeight: 36,
                                            justifyContent: 'center'
                                          }}
                                          activeOpacity={0.75}
                                        >
                                          <Text style={{ fontSize: 12.5, fontWeight: isSel ? '900' : '700', color: isSel ? COLORS.primary : COLORS.textSecondary }}>
                                            {u}
                                          </Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </ScrollView>
                                </View>
                              </View>

                              {/* Rate / Unit */}
                              <View>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t('rate_per_unit_lbl', 'Rate / Unit')}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FAFCF8', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, minHeight: 48 }}>
                                  <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textMuted }}>₱</Text>
                                  <TextInput
                                    style={{ flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text, padding: 0 }}
                                    defaultValue={String(op.rate || 0)}
                                    onChangeText={v => updateDirectOp(op.id, 'rate', v)}
                                    keyboardType="decimal-pad"
                                    placeholder="0"
                                    placeholderTextColor={COLORS.textMuted}
                                  />
                                </View>
                              </View>

                              {/* Total Needed (read-only computed) */}
                              <View style={{ backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.primary + '40' }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 }}>{t('total_needed_lbl', 'Total Needed')}</Text>
                                <Text style={{ fontSize: 18, fontWeight: '900', color: COLORS.text }}>
                                  {fmt(Number(((op.perHa || 1) * area).toFixed(1)))} {op.unit || 'ha'}
                                </Text>
                              </View>
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Stage Planned Budget Summary Card (Clean & Consistent Forest Green Theme) */}
            <View style={s.budgetCardClean}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={s.budgetLabelClean}>
                  {t('planned_budget_stage', 'PLANNED BUDGET · STAGE')} {currentStage.stageNum}
                </Text>
                <Text style={s.budgetSubClean}>
                  {t('for_area_label', 'For')} {landArea} Ha · {currentOperations.length} {currentOperations.length === 1 ? t('operations_count_singular', 'Operation') : t('operations_count_plural', 'Operations')}
                </Text>
              </View>
              <Text style={s.budgetValueClean}>
                ₱{fmt(Math.round(computeStageCost(currentStage.stageNum)))}
              </Text>
            </View>

            {/* Stage Action Buttons */}
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                style={[s.sendDraftBtn, isTransferringOps && { opacity: 0.7 }]}
                onPress={sendStagePlanToFieldOps}
                disabled={isTransferringOps}
                activeOpacity={0.85}
              >
                {isTransferringOps ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={s.sendDraftBtnText}>Transferring to Drafts...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={18} color="#fff" />
                    <Text style={s.sendDraftBtnText} numberOfLines={1} adjustsFontSizeToFit>{t('send_all_ops_btn', 'Transfer All Stage Operations to Drafts')}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[{ backgroundColor: '#F0F8EC', borderWidth: 1.5, borderColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }, isSavingPlan && { opacity: 0.65 }]}
                onPress={handleSaveFieldPlan}
                disabled={isSavingPlan}
                activeOpacity={0.85}
              >
                {isSavingPlan ? (
                  <>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary, textAlign: 'center', flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>RECORDING CUSTOM PLAN TO DATABASE...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="save-outline" size={18} color={COLORS.primary} />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary, textAlign: 'center', flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>{t('save_custom_plan_btn', 'SAVE CUSTOM PLAN FOR THIS FIELD')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={s.disclaimerWrap}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.textMuted} />
          <Text style={s.disclaimer}>
            {t('planner_custom_disclaimer', 'Custom plans are stored per field and automatically reflected in Field Operations.')}
          </Text>
        </View>
      </ScrollView>

      {/* ── Modal: Add Operation to Stage ── */}
      <Modal visible={showAddOpModal} animationType="slide" onRequestClose={() => setShowAddOpModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
              <Text style={s.modalTitle}>{t('add_op_modal_title', 'Add Operation to Stage')} {currentStage?.stageNum || ''}</Text>
              <TouchableOpacity onPress={() => setShowAddOpModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 14 }}>
              {/* Option A: Pick from SRA Catalogue */}
              <Text style={s.formLabel}>{t('option_a_cat_title', 'Option A: Choose from SRA Catalogue')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {SRA_OPERATIONS_CATALOGUE
                  .filter(catOp => catOp.stageNum === activeStageNum || !catOp.stageNum)
                  .map(catOp => (
                    <TouchableOpacity
                      key={catOp.id}
                      style={[
                        { backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, padding: 10, borderRadius: RADIUS.md, width: 170, gap: 4 },
                        selectedCatalogOp?.id === catOp.id && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }
                      ]}
                      onPress={() => {
                        setSelectedCatalogOp(catOp);
                        setNewOpName('');
                      }}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: '800', color: COLORS.text }}>{formatOperationName ? formatOperationName(catOp.name) : catOp.name}</Text>
                      <Text style={{ fontSize: 11, color: COLORS.textMuted }}>₱{fmt(catOp.costPerHa)} / ha</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>

              {/* Option B: Custom Operation */}
              <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10, gap: 8 }}>
                <Text style={s.formLabel}>{t('option_b_custom_title', 'Option B: Or Enter Custom Operation')}</Text>
                <TextInput
                  style={s.formInput}
                  placeholder={t('custom_op_placeholder', 'e.g., Foliar Spraying, Canal De-siltation')}
                  placeholderTextColor={COLORS.textMuted}
                  value={newOpName}
                  onChangeText={v => {
                    setNewOpName(v);
                    if (v.trim()) setSelectedCatalogOp(null);
                  }}
                />

                {/* Operation Structure Selector */}
                {newOpName.trim().length > 0 && (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.textMuted }}>{t('op_type_prompt', 'Operation Type:')}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity
                        style={[
                          { flex: 1, padding: 8, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
                          newOpType === 'group' && { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary }
                        ]}
                        onPress={() => setNewOpType('group')}
                      >
                        <Text style={{ fontSize: 11.5, fontWeight: '800', color: newOpType === 'group' ? COLORS.primary : COLORS.textSecondary }} numberOfLines={1} adjustsFontSizeToFit>{t('bundle_items_type', 'Bundle with Items')}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          { flex: 1, padding: 8, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
                          newOpType === 'direct' && { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary }
                        ]}
                        onPress={() => setNewOpType('direct')}
                      >
                        <Text style={{ fontSize: 11.5, fontWeight: '800', color: newOpType === 'direct' ? COLORS.primary : COLORS.textSecondary }} numberOfLines={1} adjustsFontSizeToFit>{t('simple_direct_type', 'Simple Direct Rate')}</Text>
                      </TouchableOpacity>
                    </View>

                    {newOpType === 'direct' && (
                      <View style={{ gap: 10, marginTop: 6 }}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={s.formLabel}>{t('qty_per_ha_lbl', 'Qty / Ha')}</Text>
                            <TextInput
                              style={s.formInput}
                              value={newOpPerHa}
                              onChangeText={setNewOpPerHa}
                              keyboardType="decimal-pad"
                            />
                          </View>
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={s.formLabel}>{t('unit_lbl', 'Unit')}</Text>
                            <TextInput
                              style={s.formInput}
                              value={newOpUnit}
                              onChangeText={setNewOpUnit}
                              placeholder="ha, bag, ton"
                            />
                          </View>
                          <View style={{ flex: 1.2, gap: 4 }}>
                            <Text style={s.formLabel}>{t('rate_peso_lbl', 'Rate (₱)')}</Text>
                            <TextInput
                              style={s.formInput}
                              value={newOpRate}
                              onChangeText={setNewOpRate}
                              keyboardType="decimal-pad"
                            />
                          </View>
                        </View>

                        {/* Quick Unit Choices for Direct Op Modal */}
                        <View style={{ gap: 4 }}>
                          <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                            {t('choose_unit_lbl', 'Choose Unit:')} <Text style={{ color: COLORS.primary, fontWeight: '900' }}>{newOpUnit || 'ha'}</Text>
                          </Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                            {['ha', 'bag', 'ton', 'lacsa', 'day', 'kg', 'L', 'trip', 'sqm'].map(u => {
                              const isSel = (newOpUnit || 'ha').toLowerCase() === u.toLowerCase();
                              return (
                                <TouchableOpacity
                                  key={u}
                                  onPress={() => setNewOpUnit(u)}
                                  style={{
                                    paddingHorizontal: 12,
                                    paddingVertical: 7,
                                    borderRadius: RADIUS.sm,
                                    borderWidth: 1.5,
                                    borderColor: isSel ? COLORS.primary : COLORS.border,
                                    backgroundColor: isSel ? COLORS.primaryBg : '#FAFCF8',
                                    minHeight: 38,
                                    justifyContent: 'center'
                                  }}
                                  activeOpacity={0.75}
                                >
                                  <Text style={{ fontSize: 13, fontWeight: isSel ? '900' : '700', color: isSel ? COLORS.primary : COLORS.textSecondary }}>
                                    {u}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>

              <TouchableOpacity style={s.submitBtn} onPress={handleAddOperation}>
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={s.submitBtnText}>{t('add_op_submit_btn', 'Add Operation to Stage')} {currentStage?.stageNum || ''}</Text>
              </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ── Modal: Add Child Item to Operation ── */}
      <Modal visible={showAddChildModal} animationType="slide" onRequestClose={() => setShowAddChildModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
              <Text style={s.modalTitle}>{t('add_child_modal_title', 'Add Material or Labor to Operation')}</Text>
              <TouchableOpacity onPress={() => setShowAddChildModal(false)}>
                <Ionicons name="close" size={22} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 12 }}>
              {/* Category Filter */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {ITEM_TYPES.map(it => (
                  <TouchableOpacity
                    key={it.key}
                    style={[
                      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, minHeight: 44 },
                      newChildCategory === it.key && { backgroundColor: it.color, borderColor: it.color }
                    ]}
                    onPress={() => setNewChildCategory(it.key)}
                  >
                    <Ionicons name={it.icon} size={16} color={newChildCategory === it.key ? '#fff' : it.color} />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: newChildCategory === it.key ? '#fff' : COLORS.textSecondary }}>
                      {it.label.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* SRA Recommended Presets */}
              <Text style={s.formLabel}>Quick SRA Standard Presets</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {SRA_CHILD_PRESETS
                  .filter(pr => pr.category === newChildCategory)
                  .map(preset => (
                    <TouchableOpacity
                      key={preset.name}
                      style={{ backgroundColor: '#F8FAF5', borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.md, minHeight: 48, justifyContent: 'center' }}
                      onPress={() => {
                        setNewChildName(preset.name);
                        setNewChildQty(preset.qty);
                        setNewChildUnit(preset.unit);
                        setNewChildRate(preset.rate);
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.text }}>{preset.name}</Text>
                      <Text style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>{preset.qty} {preset.unit}/ha @ ₱{fmt(Number(preset.rate))}</Text>
                    </TouchableOpacity>
                  ))}
              </ScrollView>

              {/* Item Name */}
              <View style={{ gap: 4 }}>
                <Text style={s.formLabel}>Item Description / Material Name</Text>
                <TextInput
                  style={s.formInput}
                  placeholder="e.g., 46-00-00 Urea, Tractor Driver, Weeding Crew"
                  placeholderTextColor={COLORS.textMuted}
                  value={newChildName}
                  onChangeText={setNewChildName}
                />
              </View>

              {/* Dosage, Unit & Rate Inputs */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.formLabel}>Dosage / Ha</Text>
                  <TextInput
                    style={s.formInput}
                    value={newChildQty}
                    onChangeText={setNewChildQty}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.formLabel}>Unit</Text>
                  <TextInput
                    style={s.formInput}
                    value={newChildUnit}
                    onChangeText={setNewChildUnit}
                    placeholder="bag, ha, day"
                  />
                </View>
                <View style={{ flex: 1.2, gap: 4 }}>
                  <Text style={s.formLabel}>Rate / Unit (₱)</Text>
                  <TextInput
                    style={s.formInput}
                    value={newChildRate}
                    onChangeText={setNewChildRate}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {/* Quick Unit Selector for Child Item Modal */}
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {t('unit_choice_prompt', 'Unit Choice')}: <Text style={{ color: COLORS.primary, fontWeight: '900' }}>{newChildUnit || 'bag'}</Text>
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {['bag', 'ha', 'ton', 'lacsa', 'day', 'kg', 'L', 'trip', 'sqm'].map(u => {
                    const isSel = (newChildUnit || 'bag').toLowerCase() === u.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={u}
                        onPress={() => setNewChildUnit(u)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: RADIUS.sm,
                          borderWidth: 1.5,
                          borderColor: isSel ? COLORS.primary : COLORS.border,
                          backgroundColor: isSel ? COLORS.primaryBg : '#FAFCF8',
                          minHeight: 38,
                          justifyContent: 'center'
                        }}
                        activeOpacity={0.75}
                      >
                        <Text style={{ fontSize: 13, fontWeight: isSel ? '900' : '700', color: isSel ? COLORS.primary : COLORS.textSecondary }}>
                          {u}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Computed Preview */}
              {(() => {
                const q = parseFloat(newChildQty) || 0;
                const r = parseFloat(newChildRate) || 0;
                const tot = Math.round((q * area) * r);
                return (
                  <View style={{ backgroundColor: '#F4F9F1', padding: 12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: '#D4E7CC', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.textSecondary }}>Computed Total for {landArea} Ha:</Text>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: COLORS.primaryDark }}>₱ {fmt(tot)}</Text>
                  </View>
                );
              })()}

              <TouchableOpacity style={s.submitBtn} onPress={handleAddChildItem} activeOpacity={0.85}>
                <Ionicons name="add-circle" size={18} color="#fff" />
                <Text style={s.submitBtnText}>Add to Operation</Text>
              </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Field Picker Modal with Search */}
      <Modal visible={showFieldPickerModal} animationType="slide" onRequestClose={() => setShowFieldPickerModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: '#fff' }}>
              <View>
                <Text style={s.modalTitle}>Select Farm Plot to Plan</Text>
                <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 2 }}>Choose any Block Farm field to customize its Crop Year Cycle</Text>
              </View>
              <TouchableOpacity onPress={() => setShowFieldPickerModal(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAF5', borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
                <Ionicons name="search-outline" size={16} color={COLORS.textMuted} />
                <TextInput
                  style={{ flex: 1, fontSize: 13, fontWeight: '600', color: COLORS.text, padding: 0 }}
                  placeholder="Search by Field ID, Member, or Stage..."
                  placeholderTextColor={COLORS.textMuted}
                  value={fieldSearchQuery}
                  onChangeText={t => {
                    setFieldSearchQuery(t);
                    setPickerPage(1);
                  }}
                />
                {fieldSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => { setFieldSearchQuery(''); setPickerPage(1); }}>
                    <Ionicons name="close-circle" size={16} color={COLORS.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Paginated Field List */}
            {(() => {
              const filteredFields = fields.filter(f => {
                if (!fieldSearchQuery.trim()) return true;
                const q = fieldSearchQuery.toLowerCase();
                return (
                  (f.id || '').toLowerCase().includes(q) ||
                  (f.member || '').toLowerCase().includes(q) ||
                  (f.stage || '').toLowerCase().includes(q)
                );
              });

              const FIELDS_PER_PAGE = 4;
              const totalPages = Math.max(1, Math.ceil(filteredFields.length / FIELDS_PER_PAGE));
              const currentPageClamped = Math.min(pickerPage, totalPages);
              const paginatedFields = filteredFields.slice((currentPageClamped - 1) * FIELDS_PER_PAGE, currentPageClamped * FIELDS_PER_PAGE);

              return (
                <>
                  <ScrollView contentContainerStyle={{ padding: SPACING.lg, gap: 8 }}>
                    {paginatedFields.length === 0 && (
                      <Text style={{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginVertical: 20 }}>
                        No fields match your search.
                      </Text>
                    )}
                    {paginatedFields.map(f => (
                      <TouchableOpacity
                        key={f.id}
                        style={[
                          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: SPACING.md, backgroundColor: '#fff', borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border },
                          selectedField?.id === f.id && { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg }
                        ]}
                        onPress={() => {
                          setSelectedField(f);
                          setShowFieldPickerModal(false);
                          setFieldSearchQuery('');
                          setPickerPage(1);
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.text }}>{f.id}</Text>
                            <Text style={{ fontSize: 12, color: COLORS.textMuted }}>· {f.member}</Text>
                          </View>
                          <Text style={{ fontSize: 11.5, color: COLORS.textSecondary, marginTop: 2 }}>{f.stage || 'Planting & Establishment'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: COLORS.primary }}>{f.ha} Ha</Text>
                          {selectedField?.id === f.id && (
                            <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.primary }}>SELECTED</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {/* Pagination Bar */}
                  {totalPages > 1 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: '#fff' }}>
                      <TouchableOpacity
                        disabled={currentPageClamped === 1}
                        onPress={() => setPickerPage(p => Math.max(1, p - 1))}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: currentPageClamped === 1 ? COLORS.border : COLORS.primary, backgroundColor: currentPageClamped === 1 ? '#F8F9FA' : COLORS.primaryBg, opacity: currentPageClamped === 1 ? 0.6 : 1 }}
                      >
                        <Ionicons name="chevron-back" size={14} color={currentPageClamped === 1 ? COLORS.textMuted : COLORS.primary} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: currentPageClamped === 1 ? COLORS.textMuted : COLORS.primary }}>Prev</Text>
                      </TouchableOpacity>

                      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.textSecondary }}>
                        Page {currentPageClamped} of {totalPages}
                      </Text>

                      <TouchableOpacity
                        disabled={currentPageClamped === totalPages}
                        onPress={() => setPickerPage(p => Math.min(totalPages, p + 1))}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: currentPageClamped === totalPages ? COLORS.border : COLORS.primary, backgroundColor: currentPageClamped === totalPages ? '#F8F9FA' : COLORS.primaryBg, opacity: currentPageClamped === totalPages ? 0.6 : 1 }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '700', color: currentPageClamped === totalPages ? COLORS.textMuted : COLORS.primary }}>Next</Text>
                        <Ionicons name="chevron-forward" size={14} color={currentPageClamped === totalPages ? COLORS.textMuted : COLORS.primary} />
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              );
            })()}
        </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: 28 },
  pageTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text },
  pageSub: { fontSize: 13, color: COLORS.textMuted, marginTop: -2, lineHeight: 18 },

  sectionLabel: { fontSize: 12, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Field Detail Card
  fieldCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOW.card,
    gap: 10
  },
  fieldCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  fieldIdText: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.text
  },
  fieldFarmText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted
  },
  fieldMemberText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2
  },

  // Clean Land Area Pill
  areaPill: {
    backgroundColor: COLORS.primaryBg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.primary + '35',
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: 'center'
  },
  areaPillLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: COLORS.primary,
    textTransform: 'uppercase'
  },
  areaInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3
  },
  areaInput: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.text,
    padding: 0,
    minWidth: 32,
    textAlign: 'center'
  },
  areaUnitText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary
  },

  fieldCardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 8,
    gap: 6
  },
  activePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0F8EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.xs
  },
  activePillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.primary
  },
  syncHintText: {
    fontSize: 11,
    color: COLORS.textMuted,
    lineHeight: 15
  },

  // Hub Summary Banner
  hubSummaryBanner: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOW.card,
    gap: 8
  },
  hubSummaryLabel: { fontSize: 10.5, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.5 },
  hubSummaryValue: { fontSize: 26, fontWeight: '900', color: COLORS.primary, marginTop: 2 },
  hubSummarySub: { fontSize: 11.5, color: COLORS.textSecondary, marginTop: 1 },
  hubSraBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.primaryBg, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.xs },
  hubSraBadgeText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },

  hubSectionHeader: { marginTop: 4 },

  // Stage Choice Card
  stageChoiceCard: {
    backgroundColor: '#FFF',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOW.card,
    gap: 8
  },
  stageChoiceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  stageNumBadge: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  stageNumText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  stageChoiceTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, flexShrink: 1 },
  stageChoiceTimeline: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  stageChoicePrice: { fontSize: 16.5, fontWeight: '900', color: COLORS.primary },
  stageChoiceHaRate: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  stageChoiceDesc: { fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 18 },
  stageChoiceFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10, marginTop: 4 },
  openStageText: { fontSize: 13.5, fontWeight: '800' },
  currentStagePill: { backgroundColor: '#E2EED9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.xs },
  currentStagePillText: { fontSize: 11, fontWeight: '800', color: COLORS.primary },

  // Global Hub Action Buttons
  saveFullPlanBtn: { backgroundColor: '#F0F8EC', borderWidth: 1.5, borderColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 16, borderRadius: RADIUS.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, minHeight: 48 },
  saveFullPlanBtnText: { fontSize: 14, fontWeight: '800', color: COLORS.primary, textAlign: 'center', flexShrink: 1 },
  resetAllBtn: { paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, minHeight: 44 },
  resetAllBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },

  // Back Navigation & Quick Chips
  backToStagesBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#F0F8EC', borderWidth: 1.5, borderColor: '#C8E6C9', borderRadius: RADIUS.md, alignSelf: 'flex-start', minHeight: 44, marginBottom: 8 },
  backToStagesText: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  quickStageChip: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff', minHeight: 38, justifyContent: 'center' },
  quickStageChipText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },

  // Active Stage Banner
  activeStageBanner: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    ...SHADOW.card,
    gap: 6
  },
  activeStageTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  activeStageTimeline: { fontSize: 13, fontWeight: '800', color: COLORS.textSecondary },
  activeStageDesc: { fontSize: 13, color: COLORS.textMuted, lineHeight: 19 },

  // Standard Card
  card: { backgroundColor: '#fff', borderRadius: RADIUS.lg, padding: 14, gap: 12, ...SHADOW.card, borderWidth: 1.5, borderColor: COLORS.border },
  cardTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  cardSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },

  // Operation Structure Segmented Control
  structureSegmentWrap: {
    flexDirection: 'row',
    backgroundColor: '#EEF2E6',
    borderRadius: RADIUS.md,
    padding: 4,
    marginVertical: 6
  },
  structureSegmentBtn: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    minHeight: 46
  },
  structureSegmentBtnActive: {
    backgroundColor: '#fff',
    ...SHADOW.card
  },
  structureSegmentText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.textMuted
  },
  structureSegmentTextActive: {
    color: COLORS.primary,
    fontWeight: '900'
  },

  // Operation Card
  opCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: '#E2EBDC',
    ...SHADOW.card,
    gap: 10,
    marginBottom: 10
  },
  opHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  opBadge: {
    backgroundColor: COLORS.primaryBg,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.xs
  },
  opBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.primary
  },
  opNameText: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text
  },
  opActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F0F4EC',
    paddingTop: 10,
    marginTop: 4
  },
  // "Save to Drafts" button — clearly looks tappable
  sendOpBtnClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F8EC',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: RADIUS.md,
    minHeight: 46,
    ...SHADOW.card
  },
  sendOpBtnTextClean: {
    fontSize: 14,
    fontWeight: '900',
    color: COLORS.primary
  },
  // Delete button — bigger tap target & soft red styling
  trashBtnClean: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: RADIUS.md,
    backgroundColor: '#FEF2F2'
  },
  opExpandedPanel: {
    borderTopWidth: 1,
    borderTopColor: '#EEF2E6',
    paddingTop: 10,
    gap: 10
  },

  // Child item cards inside group operations
  childListWrap: { gap: 10 },
  childItemRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.md,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#D8E5D2',
    gap: 8,
    ...SHADOW.sm
  },
  childInputLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 5
  },
  childInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFCF8',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    gap: 6
  },
  childInputField: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    padding: 0
  },
  childInputUnit: {
    fontSize: 13.5,
    fontWeight: '800',
    color: COLORS.primary
  },
  childInputCurrency: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textMuted
  },
  removeChildBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: RADIUS.md
  },

  // Direct input panel
  directInputWrap: { gap: 8 },
  directInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFCF8',
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    gap: 6
  },
  // Legacy fallbacks (kept for safety)
  inlineInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  inlineInput: { fontSize: 14, fontWeight: '700', color: COLORS.text, minWidth: 36, padding: 2 },
  inlineUnitText: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  budgetCardClean: {
    backgroundColor: '#F4F9F1',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1.5,
    borderColor: '#D4E7CC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOW.card
  },
  budgetLabelClean: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5
  },
  budgetSubClean: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 3
  },
  budgetValueClean: {
    fontSize: 26,
    fontWeight: '900',
    color: COLORS.primaryDark
  },

  // Send to Field Ops Button
  sendDraftBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary, paddingVertical: 18, paddingHorizontal: 16, borderRadius: RADIUS.md, ...SHADOW.card, minHeight: 56 },
  sendDraftBtnText: { fontSize: 15, fontWeight: '900', color: '#fff', letterSpacing: 0.5, textAlign: 'center' },

  disclaimerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    backgroundColor: '#F8FAF5',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 6
  },
  disclaimer: {
    fontSize: 11.5,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    flexShrink: 1
  },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACING.lg, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle: { fontSize: 17, fontWeight: '900', color: COLORS.text },
  formLabel: { fontSize: 13, fontWeight: '800', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: 4 },
  formInput: { backgroundColor: '#FAFCF8', borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontWeight: '700', color: COLORS.text, minHeight: 50 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.primary, paddingVertical: 16, paddingHorizontal: 16, borderRadius: RADIUS.md, marginTop: 6, minHeight: 52 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', textAlign: 'center', flexShrink: 1 },
});
