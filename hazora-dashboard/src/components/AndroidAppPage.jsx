import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import '../styles/AndroidAppPage.css';

const downloadUrl = import.meta.env.VITE_ANDROID_APP_DOWNLOAD_URL?.trim() || '';

function getValidDownloadUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

export default function AndroidAppPage() {
  const [qrImage, setQrImage] = useState('');
  const [qrError, setQrError] = useState(false);
  const validDownloadUrl = getValidDownloadUrl(downloadUrl);

  useEffect(() => {
    let active = true;

    if (validDownloadUrl) {
      QRCode.toDataURL(validDownloadUrl, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 256,
        color: { dark: '#111827', light: '#ffffff' },
      }).then((dataUrl) => {
        if (active) setQrImage(dataUrl);
      }).catch(() => {
        if (active) setQrError(true);
      });
    }

    return () => {
      active = false;
    };
  }, [validDownloadUrl]);

  return (
    <section className="android-app-page" aria-labelledby="android-app-title">
      <div className="android-app-heading">
        <p className="android-app-eyebrow">HAZORA MOBILE</p>
        <h2 id="android-app-title">HAZORA App</h2>
        <p>Install the Android application on your phone.</p>
      </div>

      <div className="android-app-content">
        <div className="android-qr-section">
          <div className={`android-qr-frame ${qrImage ? 'has-qr' : ''}`}>
            {qrImage ? (
              <img src={qrImage} alt="QR code linking to the HAZORA Android app download" />
            ) : (
              <div className="android-qr-placeholder" role="status">
                <span className="android-qr-symbol" aria-hidden="true">QR</span>
                <strong>{qrError ? 'QR code unavailable' : 'Download link not configured'}</strong>
                <span>{qrError ? 'Please try again later.' : 'Ask your administrator for the app download link.'}</span>
              </div>
            )}
          </div>
          <p className="android-qr-caption">
            {qrImage ? 'Scan with your phone camera to open the app download.' : 'The app download link has not been configured for this website.'}
          </p>
        </div>

        <div className="android-download-panel">
          <h3>Android application</h3>
          <p>Use the QR code or open the download directly on your Android device.</p>
          {validDownloadUrl ? (
            <a className="android-download-button" href={validDownloadUrl} target="_blank" rel="noreferrer">
              Download HAZORA
            </a>
          ) : (
            <button className="android-download-button" type="button" disabled>
              Download unavailable
            </button>
          )}
        </div>
      </div>
    </section>
  );
}