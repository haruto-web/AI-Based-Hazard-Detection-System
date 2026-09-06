import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  buildIncidentCsv,
  filterIncidentsByMonthYear,
  filterIncidentsByPeriod,
  getIncidents,
  INCIDENTS_UPDATED_EVENT,
  subscribeToIncidents,
} from '../utils/incidents';
import '../styles/ReportsPage.css';

const PAGE_SIZE = 20;

export default function ReportsPage({ readOnly = false }) {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState(() => getIncidents());
  const [currentPage, setCurrentPage] = useState(1);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generateRange, setGenerateRange] = useState('Last 7 Days');
  const [selectedMonth, setSelectedMonth] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeToIncidents(user?.uid, setIncidents);

    function refreshIncidents() {
      setIncidents(getIncidents());
    }

    window.addEventListener(INCIDENTS_UPDATED_EVENT, refreshIncidents);
    window.addEventListener('storage', refreshIncidents);
    return () => {
      unsubscribe();
      window.removeEventListener(INCIDENTS_UPDATED_EVENT, refreshIncidents);
      window.removeEventListener('storage', refreshIncidents);
    };
  }, [user?.uid]);

  const filteredIncidents = useMemo(() => {
    return filterIncidentsByMonthYear(incidents, selectedMonth);
  }, [incidents, selectedMonth]);

  const reports = useMemo(() => {
    const grouped = filteredIncidents.reduce((groups, incident) => {
      const key = incident.date;
      if (!groups[key]) groups[key] = [];
      groups[key].push(incident);
      return groups;
    }, {});

    return Object.entries(grouped).map(([date, group]) => ({
      date,
      timePeriod: 'Daily Incident Report',
      totalIncidents: group.length,
      highRisk: group.filter((incident) => ['high', 'critical'].includes(incident.severity)).length,
      hazards: [...new Set(group.map((incident) => incident.hazardType))].join(', '),
      incidents: group,
      downloadUrl: URL.createObjectURL(new Blob([buildIncidentCsv(group)], { type: 'text/csv;charset=utf-8' })),
    }));
  }, [filteredIncidents]);

  const totalPages = Math.ceil(reports.length / PAGE_SIZE) || 1;
  const paginatedReports = reports.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function handleGenerate() {
    const generatedIncidents = selectedMonth
      ? filteredIncidents
      : filterIncidentsByPeriod(incidents, generateRange);
    const blob = new Blob([buildIncidentCsv(generatedIncidents)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hazora-${generateRange.toLowerCase().replace(/\s+/g, '-')}-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setShowGenerateDialog(false);
  }

  return (
    <div className="reports-page">
      {/* Header */}
      <div className="reports-page-header">
        <div className="reports-page-title-row">
          <h2 className="reports-page-title">Reports</h2>
          {!readOnly && (
            <button
              className="generate-report-btn"
              onClick={() => setShowGenerateDialog(true)}
            >
              Generate New Report
            </button>
          )}
        </div>
        <div className="report-date-filter">
          <label htmlFor="report-month">Report month</label>
          <input
            id="report-month"
            type="month"
            value={selectedMonth}
            onChange={(event) => {
              setSelectedMonth(event.target.value);
              setCurrentPage(1);
            }}
          />
          {selectedMonth && (
            <button className="clear-date-btn" onClick={() => setSelectedMonth('')}>
              Clear month
            </button>
          )}
        </div>
      </div>

      {/* Reports Table */}
      <div className="reports-table-wrapper">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Report Date</th>
              <th>Time Period</th>
              <th>Total Incidents</th>
              <th>High Risk</th>
              <th>Hazards Detected</th>
              <th>Download</th>
            </tr>
          </thead>
          <tbody>
            {paginatedReports.length === 0 ? (
              <tr>
                <td colSpan={6} className="reports-empty">
                  No reports available for this site
                </td>
              </tr>
            ) : (
              paginatedReports.map((report, idx) => (
                <tr key={idx}>
                  <td>{report.date}</td>
                  <td>{report.timePeriod}</td>
                  <td>{report.totalIncidents}</td>
                  <td><span className="report-risk-count">{report.highRisk}</span></td>
                  <td>{report.hazards}</td>
                  <td>
                    <a href={report.downloadUrl || '#'} className="download-link" download={`hazora-${report.date.replace(/\//g, '-')}-report.csv`}>
                      Download
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="reports-pagination">
          <button
            className="page-btn"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span className="page-info">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="page-btn"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}

      {/* Note */}
      <p className="reports-note">
        Reports include detection time, hazard description, severity, status, confidence, camera source, and model metadata.
      </p>

      {/* Generate Report Dialog */}
      {showGenerateDialog && (
        <div className="dialog-overlay" onClick={() => setShowGenerateDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="dialog-title">Generate New Report</h3>


            <div className="dialog-field">
              <label htmlFor="gen-range">Time Range</label>
              <select
                id="gen-range"
                value={generateRange}
                onChange={(e) => setGenerateRange(e.target.value)}
              >
                <option value="Last 24 Hours">Last 24 Hours</option>
                <option value="Last 7 Days">Last 7 Days</option>
                <option value="Last 30 Days">Last 30 Days</option>
                <option value="Last 90 Days">Last 90 Days</option>
              </select>
            </div>

            {selectedMonth && <p className="date-filter-note">The selected month overrides the relative time range.</p>}

            <div className="dialog-actions">
              <button className="dialog-cancel-btn" onClick={() => setShowGenerateDialog(false)}>
                Cancel
              </button>
              <button className="dialog-generate-btn" onClick={handleGenerate}>
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
