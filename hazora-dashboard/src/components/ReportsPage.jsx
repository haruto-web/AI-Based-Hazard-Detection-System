import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  buildIncidentCsv,
  buildIncidentPdf,
  filterIncidentsByPeriod,
  filterIncidentsByMonthYear,
  getIncidents,
  INCIDENTS_UPDATED_EVENT,
  subscribeToIncidents,
} from '../utils/incidents';
import { computeReportSummary } from '../utils/analytics';
import '../styles/ReportsPage.css';

const PAGE_SIZE = 20;

const TIME_PERIODS = ['Last 24 Hours', 'Last 7 Days', 'Last 30 Days'];
const RANGE_OPTIONS = ['Last 24 Hours', 'Last 7 Days', 'Last 30 Days', 'Last 90 Days'];

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

export default function ReportsPage({ readOnly = false }) {
  const { user } = useAuth();
  const [incidents, setIncidents] = useState(() => getIncidents());
  const [currentPage, setCurrentPage] = useState(1);
  const [timePeriod, setTimePeriod] = useState('Last 24 Hours');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [filterCalendarMonth, setFilterCalendarMonth] = useState(() => new Date());
  const monthPickerRef = useRef(null);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generateRange, setGenerateRange] = useState('Last 7 Days');
  const [generateFormat, setGenerateFormat] = useState('pdf');
  const [generateDate, setGenerateDate] = useState(() => toDateInputValue(new Date()));
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

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

  const [previewReport, setPreviewReport] = useState(null);

  const filteredIncidents = useMemo(() => (
    selectedMonth
      ? filterIncidentsByMonthYear(incidents, selectedMonth)
      : filterIncidentsByPeriod(incidents, timePeriod)
  ), [incidents, selectedMonth, timePeriod]);

  const summary = useMemo(() => computeReportSummary(filteredIncidents), [filteredIncidents]);

  const reports = useMemo(() => {
    const grouped = filteredIncidents.reduce((groups, incident) => {
      const key = incident.date;
      if (!groups[key]) groups[key] = [];
      groups[key].push(incident);
      return groups;
    }, {});

    return Object.entries(grouped)
      .map(([date, group]) => ({
        date,
        timePeriod: 'Daily Incident Report',
        totalIncidents: group.length,
        incidents: group,
        summary: computeReportSummary(group),
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [filteredIncidents]);

  function downloadReportCsv(group, date) {
    const blob = new Blob([buildIncidentCsv(group)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hazora-${String(date).replace(/\//g, '-')}-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadReportPdf(group, date) {
    try {
      const doc = buildIncidentPdf(group, `Hazora Safety Report — ${date}`);
      doc.save(`hazora-${String(date).replace(/\//g, '-')}-report.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      window.alert('PDF export is unavailable. Use CSV export instead.');
    }
  }

  const totalPages = Math.ceil(reports.length / PAGE_SIZE) || 1;
  const paginatedReports = reports.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function handleGenerate() {
    const generatedIncidents = filterIncidentsByPeriod(incidents, generateRange, generateDate);
    const baseName = `hazora-${generateRange.toLowerCase().replace(/\s+/g, '-')}-report`;

    if (generateFormat === 'pdf') {
      try {
        const doc = buildIncidentPdf(generatedIncidents, `Hazora Safety Report — ${generateRange}`);
        doc.save(`${baseName}.pdf`);
      } catch (error) {
        console.error('Failed to generate PDF:', error);
        window.alert('PDF export is unavailable. Use CSV export instead.');
      }
    } else {
      const blob = new Blob([buildIncidentCsv(generatedIncidents)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${baseName}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
    setShowGenerateDialog(false);
  }

  function handleCalendarDateSelect(date) {
    setGenerateDate(toDateInputValue(date));
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }

  function moveCalendarMonth(offset) {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
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
        <div className="reports-time-period-selector" aria-label="Report date filter">
          {TIME_PERIODS.map((period) => (
            <button
              type="button"
              key={period}
              className={`reports-time-period-btn ${timePeriod === period && !selectedMonth ? 'active' : ''}`}
              onClick={() => {
                setTimePeriod(period);
                setSelectedMonth('');
                setCurrentPage(1);
              }}
            >
              {period}
            </button>
          ))}
          <label className="reports-month-filter-label" htmlFor="reports-month">Or select month</label>
          <div className="reports-month-picker" ref={monthPickerRef}>
            <button
              id="reports-month"
              type="button"
              className={`reports-month-picker-trigger ${selectedMonth ? 'has-value' : ''}`}
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
              <div className="reports-month-picker-popover" role="dialog" aria-label="Choose report month">
                <div className="reports-month-picker-header">
                  <strong>{formatMonth(filterCalendarMonth)}</strong>
                  <div className="reports-month-picker-actions">
                    <button type="button" onClick={() => setFilterCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
                    <button type="button" onClick={() => setFilterCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button>
                  </div>
                </div>
                <div className="reports-month-picker-weekdays" aria-hidden="true">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className="reports-month-picker-grid">
                  {getCalendarDays(filterCalendarMonth).map((date) => {
                    const monthValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    const isCurrentMonth = date.getMonth() === filterCalendarMonth.getMonth();
                    const isSelected = monthValue === selectedMonth;
                    return (
                      <button
                        type="button"
                        key={date.toISOString()}
                        className={`reports-month-picker-day ${isCurrentMonth ? '' : 'outside-month'} ${isSelected ? 'selected' : ''}`}
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
                <div className="reports-month-picker-footer">
                  <button type="button" onClick={() => { setSelectedMonth(''); setShowMonthPicker(false); }}>Clear</button>
                  <button type="button" onClick={() => { const today = new Date(); setFilterCalendarMonth(today); setSelectedMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`); setCurrentPage(1); setShowMonthPicker(false); }}>This month</button>
                </div>
              </div>
            )}
          </div>
          {selectedMonth && (
            <button
              type="button"
              className="reports-clear-month-btn"
              onClick={() => {
                setSelectedMonth('');
                setCurrentPage(1);
              }}
            >
              Clear month
            </button>
          )}
        </div>
      </div>

      {/* Summary bar for the selected period */}
      <div className="reports-summary">
        <div className="reports-summary-card">
          <span className="reports-summary-label">Total incidents</span>
          <span className="reports-summary-value">{summary.totalIncidents}</span>
        </div>
        <div className="reports-summary-card">
          <span className="reports-summary-label">PPE compliance</span>
          <span className="reports-summary-value">{summary.overallCompliance.toFixed(0)}%</span>
        </div>
        <div className="reports-summary-card">
          <span className="reports-summary-label">Workers observed</span>
          <span className="reports-summary-value">{summary.totalWorkers}</span>
        </div>
        <div className="reports-summary-card">
          <span className="reports-summary-label">High-risk</span>
          <span className="reports-summary-value">{summary.highRisk}</span>
        </div>
        <div className="reports-summary-card">
          <span className="reports-summary-label">Most missed PPE</span>
          <span className="reports-summary-value small">
            {summary.worstItem && summary.worstItem.total > 0
              ? `${summary.worstItem.item} (${summary.worstItem.complianceRate.toFixed(0)}%)`
              : 'N/A'}
          </span>
        </div>
        <div className="reports-summary-card">
          <span className="reports-summary-label">Resolved</span>
          <span className="reports-summary-value">{summary.resolved}</span>
        </div>
      </div>

      {/* Reports Table */}
      <div className="reports-table-wrapper">
        <table className="reports-table">
          <thead>
            <tr>
              <th>Report Date</th>
              <th>Type</th>
              <th>Incidents</th>
              <th>Compliance</th>
              <th>Workers</th>
              <th>Actions</th>
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
                  <td>{report.summary.overallCompliance.toFixed(0)}%</td>
                  <td>{report.summary.totalWorkers}</td>
                  <td>
                    <div className="report-actions">
                      <button className="report-action-btn preview" onClick={() => setPreviewReport(report)}>
                        Preview
                      </button>
                      <button className="report-action-btn pdf" onClick={() => downloadReportPdf(report.incidents, report.date)}>
                        PDF
                      </button>
                      <button className="report-action-btn csv" onClick={() => downloadReportCsv(report.incidents, report.date)}>
                        CSV
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Report preview modal */}
      {previewReport && (
        <div className="dialog-overlay" onClick={() => setPreviewReport(null)}>
          <div className="dialog report-preview" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="report-preview-header">
              <h3 className="dialog-title">Report — {previewReport.date}</h3>
              <button className="report-preview-close" onClick={() => setPreviewReport(null)} aria-label="Close">✕</button>
            </div>

            <div className="report-preview-summary">
              <div><span>Incidents</span><strong>{previewReport.summary.totalIncidents}</strong></div>
              <div><span>Compliance</span><strong>{previewReport.summary.overallCompliance.toFixed(0)}%</strong></div>
              <div><span>Workers</span><strong>{previewReport.summary.totalWorkers}</strong></div>
              <div><span>High-risk</span><strong>{previewReport.summary.highRisk}</strong></div>
            </div>

            <div className="report-preview-breakdown">
              <h4>PPE compliance by item</h4>
              {previewReport.summary.breakdown.map((item) => (
                <div className="report-preview-bar-row" key={item.item}>
                  <span className="report-preview-bar-label">{item.item}</span>
                  <div className="report-preview-bar-track">
                    <span className="report-preview-bar-fill" style={{ width: `${item.complianceRate}%` }} />
                  </div>
                  <span className="report-preview-bar-value">{item.complianceRate.toFixed(0)}%</span>
                </div>
              ))}
            </div>

            <div className="report-preview-incidents">
              <h4>Incidents ({previewReport.incidents.length})</h4>
              <div className="report-preview-list">
                {previewReport.incidents.map((incident, i) => (
                  <div className="report-preview-item" key={i}>
                    <div className="report-preview-item-head">
                      <span className={`severity-badge ${incident.severity}`}>{incident.severity}</span>
                      <strong>{incident.hazardType}</strong>
                      <span className="report-preview-item-time">{incident.time}</span>
                    </div>
                    <p className="report-preview-item-desc">{incident.description}</p>
                    {incident.precautions && (
                      <p className="report-preview-item-action">Action: {incident.precautions}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="dialog-actions">
              <button className="dialog-cancel-btn" onClick={() => setPreviewReport(null)}>Close</button>
              <button className="dialog-generate-btn" onClick={() => downloadReportPdf(previewReport.incidents, previewReport.date)}>
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}

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
        Reports are grouped by day. Use Preview to review before exporting as PDF or CSV.
      </p>

      {/* Generate Report Dialog */}
      {showGenerateDialog && (
        <div className="dialog-overlay" onClick={() => setShowGenerateDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="dialog-title">Generate New Report</h3>


            <div className="dialog-field">
              <label htmlFor="gen-date">End Date</label>
              <input
                id="gen-date"
                className="selected-date-input"
                type="date"
                value={generateDate}
                onChange={(e) => {
                  setGenerateDate(e.target.value);
                  if (e.target.value) {
                    setCalendarMonth(new Date(`${e.target.value}T00:00:00`));
                  }
                }}
              />
              <div className="calendar-picker" aria-label="Choose report end date">
                <div className="calendar-picker-header">
                  <strong>{formatMonth(calendarMonth)}</strong>
                  <div className="calendar-month-actions">
                    <button type="button" onClick={() => moveCalendarMonth(-1)} aria-label="Previous month">‹</button>
                    <button type="button" onClick={() => moveCalendarMonth(1)} aria-label="Next month">›</button>
                  </div>
                </div>
                <div className="calendar-weekdays" aria-hidden="true">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day}>{day}</span>)}
                </div>
                <div className="calendar-grid">
                  {getCalendarDays(calendarMonth).map((date) => {
                    const dateValue = toDateInputValue(date);
                    const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                    const isSelected = dateValue === generateDate;
                    return (
                      <button
                        type="button"
                        key={dateValue}
                        className={`calendar-day ${isCurrentMonth ? '' : 'outside-month'} ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleCalendarDateSelect(date)}
                        aria-label={date.toLocaleDateString()}
                        aria-pressed={isSelected}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="dialog-field">
              <label htmlFor="gen-range">Time Range</label>
              <div className="range-options" role="radiogroup" aria-label="Time range">
                {RANGE_OPTIONS.map((range) => (
                  <button
                    type="button"
                    key={range}
                    className={`range-option ${generateRange === range ? 'selected' : ''}`}
                    onClick={() => setGenerateRange(range)}
                    role="radio"
                    aria-checked={generateRange === range}
                  >
                    {range.replace('Last ', '')}
                  </button>
                ))}
              </div>
            </div>

            <div className="dialog-field">
              <label>Format</label>
              <div className="range-options" role="radiogroup" aria-label="Report format">
                {['pdf', 'csv'].map((format) => (
                  <button
                    type="button"
                    key={format}
                    className={`range-option ${generateFormat === format ? 'selected' : ''}`}
                    onClick={() => setGenerateFormat(format)}
                    role="radio"
                    aria-checked={generateFormat === format}
                  >
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

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
