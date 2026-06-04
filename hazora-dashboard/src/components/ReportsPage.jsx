import { useState } from 'react';
import '../styles/ReportsPage.css';

const SITES = ['Main Site', 'Warehouse A', 'Warehouse B', 'Field Office'];
const PAGE_SIZE = 20;

export default function ReportsPage({ readOnly = false }) {
  const [selectedSite, setSelectedSite] = useState('Main Site');
  const [reports] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [generateSite, setGenerateSite] = useState('Main Site');
  const [generateRange, setGenerateRange] = useState('Last 7 Days');

  const totalPages = Math.ceil(reports.length / PAGE_SIZE) || 1;
  const paginatedReports = reports.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  function handleGenerate() {
    // Placeholder for future backend integration
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
        <div className="site-selector">
          <label htmlFor="site-select">Site Name:</label>
          <select
            id="site-select"
            value={selectedSite}
            onChange={(e) => {
              setSelectedSite(e.target.value);
              setCurrentPage(1);
            }}
          >
            {SITES.map((site) => (
              <option key={site} value={site}>{site}</option>
            ))}
          </select>
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
              <th>Download</th>
            </tr>
          </thead>
          <tbody>
            {paginatedReports.length === 0 ? (
              <tr>
                <td colSpan={4} className="reports-empty">
                  No reports available for this site
                </td>
              </tr>
            ) : (
              paginatedReports.map((report, idx) => (
                <tr key={idx}>
                  <td>{report.date}</td>
                  <td>{report.timePeriod}</td>
                  <td>{report.totalIncidents}</td>
                  <td>
                    <a href={report.downloadUrl || '#'} className="download-link">
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
        Full report generation coming soon. Backend integration is not yet connected.
      </p>

      {/* Generate Report Dialog */}
      {showGenerateDialog && (
        <div className="dialog-overlay" onClick={() => setShowGenerateDialog(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3 className="dialog-title">Generate New Report</h3>

            <div className="dialog-field">
              <label htmlFor="gen-site">Site</label>
              <select
                id="gen-site"
                value={generateSite}
                onChange={(e) => setGenerateSite(e.target.value)}
              >
                {SITES.map((site) => (
                  <option key={site} value={site}>{site}</option>
                ))}
              </select>
            </div>

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
