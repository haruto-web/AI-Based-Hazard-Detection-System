import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  buildIncidentCsv,
  buildIncidentPdf,
  filterIncidentsByMonthYear,
  filterIncidentsByPeriod,
  getIncidents,
  INCIDENTS_UPDATED_EVENT,
  subscribeToIncidents,
} from '../utils/incidents';
import '../styles/AnalyticsDashboard.css';

const TIME_PERIODS = ['Last 24 Hours', 'Last 7 Days', 'Last 30 Days'];

function getCalendarDays(month) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(firstDay);
  start.setDate(1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function formatMonth(month) {
  return month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function StatIcon({ type }) {
  switch (type) {
    case 'workers':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'compliance':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      );
    case 'violations':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case 'gas':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
      );
    case 'common':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    default:
      return null;
  }
}

const INCIDENT_COLUMNS = ['Date', 'Time', 'Hazard Type', 'Description', 'Camera Source', 'Severity', 'Status', 'Confidence'];

const PAGE_SIZE = 20;

export default function AnalyticsDashboard({ readOnly = false }) {
  const { user } = useAuth();
  const [timePeriod, setTimePeriod] = useState('Last 24 Hours');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const monthPickerRef = useRef(null);
  const [incidents, setIncidents] = useState(() => getIncidents());
  const [currentPage, setCurrentPage] = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);

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

  useEffect(() => {
    function handleClickOutside(event) {
      if (monthPickerRef.current && !monthPickerRef.current.contains(event.target)) {
        setShowMonthPicker(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredIncidents = useMemo(() => {
    return selectedMonth
      ? filterIncidentsByMonthYear(incidents, selectedMonth)
      : filterIncidentsByPeriod(incidents, timePeriod);
  }, [incidents, selectedMonth, timePeriod]);

  const statsCards = useMemo(() => {
    const totalDetectedWorkers = filteredIncidents.reduce(
      (sum, incident) => sum + (incident.detectedWorkers || 0),
      0
    );
    const helmetCount = filteredIncidents.reduce(
      (sum, incident) => sum + (incident.helmets || 0),
      0
    );
    const noHelmetCount = filteredIncidents.reduce(
      (sum, incident) => sum + (incident.noHelmets || 0),
      0
    );
    const complianceBase = helmetCount + noHelmetCount;
    const complianceRate = complianceBase > 0 ? (helmetCount / complianceBase) * 100 : 0;

    const hazardCounts = filteredIncidents.reduce((counts, incident) => {
      counts[incident.hazardType] = (counts[incident.hazardType] || 0) + 1;
      return counts;
    }, {});
    const mostCommonHazard = Object.entries(hazardCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    const openIncidents = filteredIncidents.filter((incident) => incident.status === 'open').length;
    const criticalIncidents = filteredIncidents.filter((incident) => ['high', 'critical'].includes(incident.severity)).length;

    return [
      { id: 'workers', label: 'Workers Observed', value: totalDetectedWorkers, format: 'number' },
      { id: 'compliance', label: 'Hard Hat Compliance Rate', value: complianceRate, format: 'percent' },
      { id: 'violations', label: 'Open Incidents', value: openIncidents, format: 'number' },
      { id: 'gas', label: 'High Risk Incidents', value: criticalIncidents, format: 'number' },
      { id: 'common', label: 'Most Common Hazard', value: mostCommonHazard, format: 'text' },
    ];
  }, [filteredIncidents]);

  const insightData = useMemo(() => {
    const severityCounts = filteredIncidents.reduce((counts, incident) => {
      counts[incident.severity] = (counts[incident.severity] || 0) + 1;
      return counts;
    }, {});
    const hazardCounts = filteredIncidents.reduce((counts, incident) => {
      counts[incident.hazardType] = (counts[incident.hazardType] || 0) + 1;
      return counts;
    }, {});
    const dailyCounts = filteredIncidents.reduce((counts, incident) => {
      counts[incident.date] = (counts[incident.date] || 0) + 1;
      return counts;
    }, {});

    return {
      severityCounts,
      hazardCounts: Object.entries(hazardCounts).sort((a, b) => b[1] - a[1]).slice(0, 5),
      dailyCounts: Object.entries(dailyCounts).slice(-7),
    };
  }, [filteredIncidents]);

  const totalPages = Math.ceil(filteredIncidents.length / PAGE_SIZE) || 1;
  const paginatedIncidents = filteredIncidents.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function formatValue(value, format) {
    if (format === 'percent') return `${value.toFixed(1)}%`;
    if (format === 'number') return value.toLocaleString();
    return value;
  }

  function downloadReport(filename, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPdfReport() {
    try {
      const doc = buildIncidentPdf(filteredIncidents, 'Hazora Safety Report');
      doc.save(`hazora-incident-report${selectedMonth ? `-${selectedMonth}` : ''}.pdf`);
      setShowExportMenu(false);
    } catch (error) {
      console.error('Failed to generate PDF report:', error);
      window.alert('PDF export is unavailable. Please install the required PDF library or use CSV export instead.');
    }
  }

  return (
    <div className="analytics-dashboard">
      {/* Header with Export */}
      <div className="analytics-header">
        <h2 className="analytics-title">Analytics Overview</h2>
        {!readOnly && (
          <div className="export-wrapper">
          <button
            className="export-btn"
            onClick={() => setShowExportMenu(!showExportMenu)}
            disabled={filteredIncidents.length === 0}
            aria-label="Export Report"
          >
            Export Report
          </button>
          {showExportMenu && (
            <div className="export-menu">
              <button className="export-menu-item" onClick={exportPdfReport}>
                Export as PDF
              </button>
              <button className="export-menu-item" onClick={() => {
                downloadReport(`hazora-incident-report${selectedMonth ? `-${selectedMonth}` : ''}.csv`, buildIncidentCsv(filteredIncidents));
                setShowExportMenu(false);
              }}>
                Export as CSV
              </button>
            </div>
          )}
        </div>
        )}
      </div>

      {/* Time Period Selector */}
      <div className="time-period-selector">
        {TIME_PERIODS.map((period) => (
          <button
            key={period}
            className={`time-period-btn ${timePeriod === period ? 'active' : ''}`}
            onClick={() => {
              setTimePeriod(period);
              setCurrentPage(1);
            }}
          >
            {period}
          </button>
        ))}
        <label className="month-filter-label" htmlFor="analytics-month">Or select month</label>
        <div className="month-picker" ref={monthPickerRef}>
          <button
            id="analytics-month"
            type="button"
            className={`month-picker-trigger ${selectedMonth ? 'has-value' : ''}`}
            onClick={() => setShowMonthPicker((visible) => !visible)}
            aria-haspopup="dialog"
            aria-expanded={showMonthPicker}
          >
            {selectedMonth
              ? new Date(`${selectedMonth}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
              : 'Select month'}
            <span aria-hidden="true">▣</span>
          </button>
          {showMonthPicker && (
            <div className="month-picker-popover" role="dialog" aria-label="Choose month">
              <div className="month-picker-header">
                <strong>{formatMonth(calendarMonth)}</strong>
                <div className="month-picker-actions">
                  <button type="button" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
                  <button type="button" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button>
                </div>
              </div>
              <div className="month-picker-weekdays" aria-hidden="true">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="month-picker-grid">
                {getCalendarDays(calendarMonth).map((date) => {
                  const monthValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                  const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                  const isSelected = monthValue === selectedMonth;
                  return (
                    <button
                      type="button"
                      key={date.toISOString()}
                      className={`month-picker-day ${isCurrentMonth ? '' : 'outside-month'} ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedMonth(monthValue);
                        setCurrentPage(1);
                        setShowMonthPicker(false);
                      }}
                      aria-label={date.toLocaleDateString()}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="month-picker-footer">
                <button type="button" onClick={() => { setSelectedMonth(''); setShowMonthPicker(false); }}>Clear</button>
                <button type="button" onClick={() => { setCalendarMonth(new Date()); setSelectedMonth(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`); setCurrentPage(1); setShowMonthPicker(false); }}>This month</button>
              </div>
            </div>
          )}
        </div>
        {selectedMonth && (
          <button className="clear-month-btn" onClick={() => setSelectedMonth('')}>
            Clear month
          </button>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="stats-grid">
        {statsCards.map((card) => (
          <div key={card.id} className="stat-card">
            <span className="stat-icon" aria-hidden="true">
              <StatIcon type={card.id} />
            </span>
            <div className="stat-info">
              <span className="stat-label">{card.label}</span>
              <span className="stat-value">{formatValue(card.value, card.format)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="insight-grid">
        <section className="chart-section">
          <h3 className="section-title">Incident trend</h3>
          {insightData.dailyCounts.length === 0 ? <p className="chart-empty-message">No incidents in this period</p> : (
            <div className="trend-chart" aria-label="Incident trend by day">
              {insightData.dailyCounts.map(([date, count]) => (
                <div className="trend-column" key={date}>
                  <span className="trend-value">{count}</span>
                  <div className="trend-bar" style={{ height: `${Math.max(12, count * 22)}px` }} />
                  <span className="trend-label">{date}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="chart-section">
          <h3 className="section-title">Risk distribution</h3>
          <div className="distribution-list">
            {['critical', 'high', 'medium', 'low'].map((severity) => (
              <div className="distribution-row" key={severity}>
                <span className={`severity-badge ${severity}`}>{severity}</span>
                <div className="distribution-track"><span style={{ width: `${filteredIncidents.length ? ((insightData.severityCounts[severity] || 0) / filteredIncidents.length) * 100 : 0}%` }} /></div>
                <strong>{insightData.severityCounts[severity] || 0}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="chart-section">
        <h3 className="section-title">Top hazards</h3>
        <div className="hazard-list">
          {insightData.hazardCounts.length === 0 ? <p className="chart-empty-message">No hazards recorded for this period</p> : insightData.hazardCounts.map(([hazard, count]) => (
            <div className="hazard-row" key={hazard}><span>{hazard}</span><strong>{count}</strong></div>
          ))}
        </div>
      </section>

      {/* Incident Log */}
      <section className="incident-section">
        <h3 className="section-title">Incident Log</h3>
        <div className="incident-table-wrapper">
          <table className="incident-table">
            <thead>
              <tr>
                {INCIDENT_COLUMNS.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedIncidents.length === 0 ? (
                <tr>
                  <td colSpan={INCIDENT_COLUMNS.length} className="incident-empty">
                    No incidents recorded for this period
                  </td>
                </tr>
              ) : (
                paginatedIncidents.map((incident, idx) => (
                  <tr key={idx}>
                    <td>{incident.date}</td>
                    <td>{incident.time}</td>
                    <td>{incident.hazardType}</td>
                    <td className="incident-description">{incident.description}</td>
                    <td>{incident.cameraSource}</td>
                    <td>
                      <span className={`severity-badge ${incident.severity}`}>
                        {incident.severity}
                      </span>
                    </td>
                    <td>{incident.status}</td>
                    <td>{incident.detectionConfidence ? `${Math.round(incident.detectionConfidence * 100)}%` : 'N/A'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
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
      </section>
    </div>
  );
}
