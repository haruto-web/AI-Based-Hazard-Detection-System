import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import '../styles/AndroidAppPage.css';

const downloadUrl = import.meta.env.VITE_ANDROID_APP_DOWNLOAD_URL?.trim() || '';
const cameraAppDownloadUrl = 'https://github.com/haruto-web/Hazora-Mobile-Camera/releases';

function getValidDownloadUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
}

function AppDownloadCard({
  downloadUrl: url,
  title,
  qrAlt,
  caption,
  description,
  linkLabel,
  unavailableMessage,
}) {
  const [qrImage, setQrImage] = useState('');
  const [qrError, setQrError] = useState(false);
  const validDownloadUrl = getValidDownloadUrl(url);

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
    <div className="android-app-content">
      <div className="android-qr-section">
        <div className={`android-qr-frame ${qrImage ? 'has-qr' : ''}`}>
          {qrImage ? (
            <img src={qrImage} alt={qrAlt} />
          ) : (
            <div className="android-qr-placeholder" role="status">
              <span className="android-qr-symbol" aria-hidden="true">QR</span>
              <strong>
                {qrError
                  ? 'QR code unavailable'
                  : validDownloadUrl
                    ? 'Preparing QR code...'
                    : 'Download link not configured'}
              </strong>
              <span>
                {qrError
                  ? 'Please try again later.'
                  : validDownloadUrl
                    ? 'Please wait while the download QR code loads.'
                    : unavailableMessage}
              </span>
            </div>
          )}
        </div>
        <p className="android-qr-caption">
          {qrImage
            ? caption
            : validDownloadUrl
              ? 'Preparing the app download QR code.'
              : 'The app download link has not been configured for this website.'}
        </p>
      </div>

      <div className="android-download-panel">
        <h3>{title}</h3>
        {description.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {validDownloadUrl ? (
          <a className="android-download-button" href={validDownloadUrl} target="_blank" rel="noreferrer">
            {linkLabel}
          </a>
        ) : (
          <button className="android-download-button" type="button" disabled>
            Download unavailable
          </button>
        )}
      </div>
    </div>
  );
}


export default function AndroidAppPage() {
  return (
    <section className="android-app-page" aria-labelledby="android-app-title">
      <div className="android-app-heading">
        <p className="android-app-eyebrow">HAZORA MOBILE</p>
        <h2 id="android-app-title">HAZORA App</h2>
        <p>Install the Android application on your phone.</p>
      </div>

      <AppDownloadCard
        downloadUrl={downloadUrl}
        title="Android application"
        qrAlt="QR code linking to the HAZORA Android app download"
        caption="Scan with your phone camera to open the app download."
        description={[
          'First create and verify your website account, then wait for an administrator to approve it and enable mobile access. The mobile app uses the same account; separate app registration is not available.',
          'Once access is enabled, use the QR code or open the download directly on your Android device.',
        ]}
        linkLabel="Download HAZORA"
        unavailableMessage="Ask your administrator for the app download link."
      />

      <div className="android-app-heading android-camera-app-heading">
        <p className="android-app-eyebrow">HAZORA CAMERA</p>
        <h2 id="android-camera-app-title">HAZORA Camera App</h2>
        <p>Turn an Android phone into a Wi-Fi camera for the Hazora website.</p>
      </div>

      <AppDownloadCard
        downloadUrl={cameraAppDownloadUrl}
        title="Android camera application"
        qrAlt="QR code linking to Hazora Camera app releases"
        caption="Scan with your phone camera to open the camera app releases."
        description={[
          'Scan the QR code or open the releases page on your Android device, then download the camera app APK from the latest pre-release.',
          'Install the app, connect your phone and the website to the same Wi-Fi network, then start the camera and enter its displayed IP address on the website.',
        ]}
        linkLabel="View camera app releases"
        unavailableMessage="The camera app releases page is not available."
      />
    </section>
  );
}