import { useMemo, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { FiCheck, FiCopy, FiDownload, FiShare2 } from "react-icons/fi";
import { buildPublicUrl } from "../../config/api.js";
import "./ShareStandCard.css";

/**
 * "Share your stand" card for the provider dashboard.
 *
 * Builds the public stand URL the same way the marketing website routes it
 * (queless.org/providers/<slug-of-business-name>) so the link works for anyone,
 * no app install required. Frontend-only: copy link, WhatsApp, native share, and
 * a QR code the provider can print/share. No payment/SMS involvement.
 */
function slugifyBusinessName(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function ShareStandCard({ barber }) {
  const [copied, setCopied] = useState(false);
  const qrWrapRef = useRef(null);

  const businessName = barber?.business_name || "your stand";
  const standUrl = useMemo(() => {
    const slug = slugifyBusinessName(barber?.business_name || "");
    if (!slug) return "";
    return buildPublicUrl(`/providers/${slug}`);
  }, [barber?.business_name]);

  const shareText = `Book ${businessName} on Queless — skip the queue: ${standUrl}`;

  const handleCopy = async () => {
    if (!standUrl) return;
    try {
      await navigator.clipboard?.writeText(standUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  const handleWhatsApp = () => {
    if (!standUrl) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
  };

  const handleNativeShare = () => {
    if (!standUrl) return;
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: businessName, text: shareText, url: standUrl }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  const handleDownloadQr = () => {
    const canvas = qrWrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${slugifyBusinessName(businessName) || "queless-stand"}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const canNativeShare = typeof navigator !== "undefined" && Boolean(navigator.share);

  // Honest empty state: no shareable link until the stand has a business name.
  if (!standUrl) {
    return (
      <section className="share-stand-card-v1">
        <header className="share-stand-head-v1">
          <span className="share-stand-mark-v1"><FiShare2 /></span>
          <div>
            <strong>Share your stand</strong>
            <p>Add your business name and publish your stand to get a shareable link and QR code customers can book from.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="share-stand-card-v1">
      <header className="share-stand-head-v1">
        <span className="share-stand-mark-v1"><FiShare2 /></span>
        <div>
          <strong>Share your stand</strong>
          <p>Share your Queless stand with customers so they can book you directly.</p>
        </div>
      </header>

      <div className="share-stand-body-v1">
        <div className="share-stand-qr-v1" ref={qrWrapRef}>
          <QRCodeCanvas value={standUrl} size={128} bgColor="#ffffff" fgColor="#2b003d" level="M" marginSize={2} />
        </div>

        <div className="share-stand-main-v1">
          <label className="share-stand-link-v1">
            <span>Your stand link</span>
            <div className="share-stand-link-row-v1">
              <input type="text" value={standUrl} readOnly onFocus={(event) => event.target.select()} aria-label="Stand link" />
              <button type="button" className={copied ? "is-copied" : ""} onClick={handleCopy}>
                {copied ? <><FiCheck /> Copied</> : <><FiCopy /> Copy</>}
              </button>
            </div>
          </label>

          <div className="share-stand-actions-v1">
            <button type="button" className="share-stand-btn-v1" onClick={handleWhatsApp}>
              <FiShare2 /> WhatsApp
            </button>
            {canNativeShare ? (
              <button type="button" className="share-stand-btn-v1" onClick={handleNativeShare}>
                <FiShare2 /> Share
              </button>
            ) : null}
            <button type="button" className="share-stand-btn-v1" onClick={handleDownloadQr}>
              <FiDownload /> Save QR
            </button>
          </div>

          <p className="share-stand-hint-v1">
            Print the QR for your service business, add it to your WhatsApp status, or put it in your Instagram/TikTok bio.
          </p>
        </div>
      </div>
    </section>
  );
}
