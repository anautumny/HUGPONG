import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck,
  History,
  FileCheck2,
  AlertCircle,
  CheckCircle2,
  FileText
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_KEYS } from '../../utils/authRouting';
import Button from '../../components/ui/Button';
import QRVerifierPanel from '../../components/audit/QRVerifierPanel';
import AuditQueue from '../../components/audit/AuditQueue';
import AuditDossierCard from '../../components/audit/AuditDossierCard';
import AuditCompilationModal from '../../components/audit/AuditCompilationModal';
import AuditHistoryModal from '../../components/audit/AuditHistoryModal';
import PrintableAuditReport from '../../components/audit/PrintableAuditReport';
import {
  subscribeToAuditReports,
  certifyAuditReport
} from '../../services/auditService';
import { subscribeToOperationsData } from '../../services/operationsService';
import { subscribeToFieldsData } from '../../services/fieldsService';

export default function AuditCenterView() {
  const { user, roleKey } = useAuth();

  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [reportsError, setReportsError] = useState(null);

  const [operations, setOperations] = useState([]);
  const [fields, setFields] = useState([]);
  const [blockFarms, setBlockFarms] = useState([]);

  const [isCertifying, setIsCertifying] = useState(false);
  const [showCompileModal, setShowCompileModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [printReport, setPrintReport] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const isFarmManager = roleKey === ROLE_KEYS.FARM_MANAGER;
  const isSraAdmin = roleKey === ROLE_KEYS.SRA_ADMIN;

  const showToast = (msg, type = 'info') => {
    setToastMessage({ msg, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Find the assigned block farm for Farm Manager
  const assignedBlockFarm = useMemo(() => {
    if (!isFarmManager || !user) return null;
    const actorId = String(user.employeeId || user.userId || user.id || '').trim();
    return blockFarms.find(f => f.managerUserId === actorId) || blockFarms[0] || null;
  }, [isFarmManager, user, blockFarms]);

  // Subscribe to audit reports
  useEffect(() => {
    const unsub = subscribeToAuditReports({
      onUpdate: ({ reports: updatedReports, isLoading, error }) => {
        setReports(updatedReports);
        setIsLoadingReports(isLoading);
        setReportsError(error);

        // Maintain selection or select first report
        setSelectedReport(current => {
          if (!current && updatedReports.length > 0) {
            // Prefer pending report first
            return updatedReports.find(r => r.status === 'PENDING') || updatedReports[0];
          }
          if (current) {
            const updated = updatedReports.find(r => r.id === current.id || r.reportId === current.id);
            return updated || current;
          }
          return null;
        });
      },
      onError: (err) => {
        setReportsError(err.message || 'Failed to load audit reports.');
        setIsLoadingReports(false);
      }
    });

    return () => unsub();
  }, []);

  // Subscribe to operations for compilation pre-flight
  useEffect(() => {
    const unsub = subscribeToOperationsData({
      onUpdate: ({ operations: ops }) => {
        setOperations(ops);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to fields and block farms
  useEffect(() => {
    const unsub = subscribeToFieldsData({
      user,
      onUpdate: (state) => {
        setFields(state.fields || []);
        setBlockFarms(state.blockFarms || []);
      }
    });
    return () => unsub();
  }, [user]);

  // Handle certification action (SRA Admin only)
  const handleCertifyReport = async (reportId, notes = '') => {
    if (!isSraAdmin) {
      showToast('Certification denied: only an SRA Admin may certify audit reports.', 'error');
      return;
    }

    setIsCertifying(true);
    try {
      const response = await certifyAuditReport(reportId, { certificationNotes: notes });
      if (response.success && response.data) {
        showToast('SRA Digital Seal issued for the audit report.', 'success');
        // Update selected report in place
        setSelectedReport(prev => prev && (prev.id === reportId || prev.reportId === reportId) ? { ...prev, ...response.data } : prev);
      } else {
        throw new Error(response.error || 'Server rejected audit certification.');
      }
    } catch (err) {
      console.error('[AuditCenter] Certification error:', err);
      showToast(err.message || 'Certification failed.', 'error');
    } finally {
      setIsCertifying(false);
    }
  };

  // Handle compilation success (Farm Manager)
  const handleCompileSuccess = (compiledData) => {
    showToast(`Audit report ${compiledData.id || compiledData.period} compiled successfully!`, 'success');
    setSelectedReport(compiledData);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2.5 transition-all animate-in fade-in slide-in-from-bottom-3 ${
            toastMessage.type === 'success'
              ? 'bg-success text-white'
              : toastMessage.type === 'error'
              ? 'bg-danger text-white'
              : 'bg-hug-text text-white dark:bg-surface dark:text-hug-text border border-border'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{toastMessage.msg}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
              Regulatory Compliance
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
              QR Audit Verifier
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
            SRA QR Audit Verifier & Compliance Center
          </h1>
          <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
            Verify encrypted mobile field certificates and generate certified compliance audit reports.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Farm Manager Compilation Button */}
          {isFarmManager && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setShowCompileModal(true)}
              icon={FileCheck2}
            >
              Compile Monthly Audit
            </Button>
          )}

          {/* SRA Audit History Button */}
          <Button
            variant="primary"
            size="md"
            onClick={() => setShowHistoryModal(true)}
            icon={History}
          >
            SRA Audit History
          </Button>
        </div>
      </div>

      {/* Main Content: 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6 items-start">
        {/* Left Column: QR Verifier & Cloud Audit Queue */}
        <div className="flex flex-col gap-6 w-full">
          <QRVerifierPanel
            reports={reports}
            onSelectReport={(report) => setSelectedReport(report)}
          />

          <AuditQueue
            reports={reports}
            selectedReportId={selectedReport?.id || selectedReport?.reportId}
            onSelectReport={(report) => setSelectedReport(report)}
            isLoading={isLoadingReports}
            error={reportsError}
            onRetry={() => {
              setIsLoadingReports(true);
              setReportsError(null);
            }}
            blockFarms={blockFarms}
          />
        </div>

        {/* Right Column: Detailed Audit Dossier Card */}
        <div className="w-full">
          <AuditDossierCard
            report={selectedReport}
            blockFarms={blockFarms}
            currentUser={user}
            onCertify={handleCertifyReport}
            onPrint={(report) => setPrintReport(report)}
            isCertifying={isCertifying}
          />
        </div>
      </div>

      {/* Farm Manager Compilation Modal */}
      {isFarmManager && (
        <AuditCompilationModal
          isOpen={showCompileModal}
          onClose={() => setShowCompileModal(false)}
          blockFarm={assignedBlockFarm}
          fields={fields}
          operations={operations}
          existingReports={reports}
          onSuccess={handleCompileSuccess}
        />
      )}

      {/* Audit History Modal */}
      <AuditHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        reports={reports}
        blockFarms={blockFarms}
        onSelectReport={(report) => setSelectedReport(report)}
      />

      {/* A4 Printable Document View */}
      {printReport && (
        <PrintableAuditReport
          report={printReport}
          blockFarms={blockFarms}
          currentUser={user}
          onClose={() => setPrintReport(null)}
        />
      )}
    </div>
  );
}
