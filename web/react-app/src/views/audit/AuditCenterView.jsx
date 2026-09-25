import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  certifyAuditReport,
  submitAuditReport,
  returnAuditReport,
  fetchAuditPage
} from '../../services/auditService';
import { subscribeToOperationsData } from '../../services/operationsService';
import { subscribeToFieldsData } from '../../services/fieldsService';

export default function AuditCenterView() {
  const { user, roleKey } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [reportsError, setReportsError] = useState(null);

  const [operations, setOperations] = useState([]);
  const [fields, setFields] = useState([]);
  const [blockFarms, setBlockFarms] = useState([]);

  const [isCertifying, setIsCertifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [showCompileModal, setShowCompileModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [printReport, setPrintReport] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [historyReports, setHistoryReports] = useState([]);
  const [historyCursor, setHistoryCursor] = useState(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const isFarmManager = roleKey === ROLE_KEYS.FARM_MANAGER;
  const isSraAdmin = roleKey === ROLE_KEYS.SRA_ADMIN;

  useEffect(() => {
    if (isFarmManager && searchParams.get('compile') === '1') {
      setShowCompileModal(true);
    }
  }, [isFarmManager, searchParams]);

  const closeCompileModal = useCallback(() => {
    setShowCompileModal(false);
    if (searchParams.has('compile')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('compile');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
      blockFarmId: isFarmManager ? user?.blockFarmId : null,
      view: isSraAdmin ? 'inbox' : 'manager',
      limit: isSraAdmin ? 20 : 50,
      onUpdate: ({ reports: updatedReports, isLoading, error }) => {
        setReports(updatedReports);
        setIsLoadingReports(isLoading);
        setReportsError(error);

        // Maintain selection or select first report
        setSelectedReport(current => {
          if (!current && updatedReports.length > 0) {
            // Prefer pending report first
            return updatedReports.find(r => ['PENDING_REVIEW', 'PENDING'].includes(r.status)) || updatedReports[0];
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
  }, [isFarmManager, isSraAdmin, user?.blockFarmId]);

  const loadHistory = useCallback(async ({ append = false } = {}) => {
    if (!isSraAdmin || isLoadingHistory) return;
    setIsLoadingHistory(true);
    try {
      const response = await fetchAuditPage({ view: 'history', limit: 20, cursor: append ? historyCursor : null });
      setHistoryReports(current => append ? [...current, ...(response.data || [])] : (response.data || []));
      setHistoryCursor(response.nextCursor || null);
      setHistoryHasMore(Boolean(response.hasMore));
    } catch (error) {
      showToast(error.message || 'Unable to load Audit History.', 'error');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [isSraAdmin, isLoadingHistory, historyCursor]);

  // Subscribe to operations for compilation pre-flight
  useEffect(() => {
    const unsub = subscribeToOperationsData({
      user,
      onUpdate: ({ operations: ops }) => {
        setOperations(ops);
      }
    });
    return () => unsub();
  }, [user]);

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

  const handleSubmitReport = async reportId => {
    setIsSubmitting(true);
    try {
      const response = await submitAuditReport(reportId);
      setSelectedReport(response.data);
      showToast('Submitted to SRA. The audit is awaiting review.', 'success');
    } catch (error) {
      showToast(error.message || 'Submission failed. The compiled audit remains saved.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturnReport = async (reportId, reason, baseVersion) => {
    setIsReturning(true);
    try {
      const response = await returnAuditReport(reportId, reason, baseVersion);
      setSelectedReport(response.data);
      showToast('Audit returned to the Farm Manager with the correction reason.', 'success');
    } catch (error) {
      showToast(error.message || 'Unable to return this audit.', 'error');
    } finally {
      setIsReturning(false);
    }
  };

  return (
    <div className="w-full">
      {/* Toast Notification (Hidden when printing) */}
      {toastMessage && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2.5 transition-all animate-in fade-in slide-in-from-bottom-3 print:hidden no-print ${
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

      {/* Interactive Website Dashboard UI — STRICTLY HIDDEN DURING PRINT */}
      <div className="space-y-6 max-w-7xl mx-auto pb-12 print:hidden no-print">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary dark:text-primary-light uppercase tracking-wider">
                Regulatory Compliance
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-bg dark:bg-primary/20 text-primary dark:text-primary-light">
                {isSraAdmin ? 'SRA Audits' : 'Monthly Regulatory Audit'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-hug-text tracking-tight mt-1">
              {isSraAdmin ? 'Audit Inbox & Certification' : 'Block Farm Monthly Audit'}
            </h1>
            <p className="text-xs sm:text-sm text-hug-muted mt-1 max-w-2xl">
              {isSraAdmin ? 'Review submitted audits, import offline QR packages, and certify completed reports.' : 'Compile the assigned Block Farm, review the snapshot, then submit it to SRA.'}
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
              onClick={() => { setShowHistoryModal(true); if (isSraAdmin) loadHistory(); }}
              icon={History}
            >
              Audit History
            </Button>
          </div>
        </div>

        {/* Main Content: 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6 items-start">
          {/* Left Column: QR Verifier & Cloud Audit Queue */}
          <div className="flex flex-col gap-6 w-full">
            {isSraAdmin && <QRVerifierPanel
              reports={reports}
              onSelectReport={(report) => setSelectedReport(report)}
            />}

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
              title={isSraAdmin ? 'Audit Inbox' : 'My Monthly Audits'}
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
              isSubmitting={isSubmitting}
              isReturning={isReturning}
              onSubmit={handleSubmitReport}
              onReturn={handleReturnReport}
            />
          </div>
        </div>
      </div>

      {/* Farm Manager Compilation Modal (Hidden during print) */}
      {isFarmManager && (
        <div className="print:hidden no-print">
          <AuditCompilationModal
            isOpen={showCompileModal}
            onClose={closeCompileModal}
            blockFarm={assignedBlockFarm}
            fields={fields}
            operations={operations}
            existingReports={reports}
            onSuccess={handleCompileSuccess}
          />
        </div>
      )}

      {/* Audit History Modal (Hidden during print) */}
      <div className="print:hidden no-print">
        <AuditHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          reports={isSraAdmin ? historyReports : reports.filter(report => report.status === 'CERTIFIED')}
          blockFarms={blockFarms}
          onSelectReport={(report) => setSelectedReport(report)}
          onLoadMore={() => loadHistory({ append: true })}
          hasMore={isSraAdmin && historyHasMore}
          isLoading={isLoadingHistory}
        />
      </div>

      {/* Official SRA A4 Printable Document View */}
      {printReport ? (
        <PrintableAuditReport
          report={printReport}
          blockFarms={blockFarms}
          currentUser={user}
          isOpenModal={true}
          onClose={() => setPrintReport(null)}
        />
      ) : selectedReport ? (
        <div className="hidden print:block">
          <PrintableAuditReport
            report={selectedReport}
            blockFarms={blockFarms}
            currentUser={user}
            isOpenModal={false}
          />
        </div>
      ) : null}
    </div>
  );
}
