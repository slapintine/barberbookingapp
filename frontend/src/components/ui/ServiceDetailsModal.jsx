import { useEffect, useMemo, useRef, useState } from "react";
import { FiCalendar, FiClock, FiEdit2, FiImage, FiMapPin, FiTag, FiX } from "react-icons/fi";
import { buildAssetUrl } from "../../config/api.js";
import { formatServicePrice } from "../../utils/serviceCatalog.js";
import "./ServiceDetailsModal.css";

function serviceTitle(service = {}) {
  return service.service_name || service.name || service.title || "Service";
}

function serviceCategory(service = {}) {
  return service.category || service.service_category || service.category_name || "";
}

function serviceImage(service = {}) {
  return buildAssetUrl(
    service.image ||
      service.image_url ||
      service.service_image ||
      service.serviceImage ||
      service.photo ||
      service.photo_url ||
      ""
  );
}

function isQuoteService(service = {}) {
  return (
    String(service.pricing_type || service.pricingType || "").toLowerCase() === "quote" ||
    formatServicePrice(service) === "Request quote"
  );
}

function isUnavailable(service = {}) {
  const status = String(service.status || service.availability_status || "").toLowerCase();
  return (
    service.is_available === false ||
    service.isAvailable === false ||
    Number(service.is_available) === 0 ||
    Number(service.isAvailable) === 0 ||
    ["unavailable", "paused", "inactive", "disabled"].includes(status)
  );
}

function formatServiceDuration(minutes) {
  const total = Number(minutes || 0);
  if (!Number.isFinite(total) || total <= 0) return "";
  if (total < 60) return `${total} ${total === 1 ? "minute" : "minutes"}`;
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  if (!remainder) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours} ${hours === 1 ? "hr" : "hrs"} ${remainder} min`;
}

function detailRows(service = {}, provider = {}) {
  return [
    { label: "Price", value: formatServicePrice(service) },
    { label: "Duration", value: formatServiceDuration(service.duration_minutes ?? service.durationMinutes) },
    { label: "Category", value: serviceCategory(service) },
    { label: "Provider", value: provider.business_name || provider.name || provider.displayName || "" },
    { label: "Location", value: provider.location || provider.address || "" },
    {
      label: "Booking mode",
      value: isQuoteService(service) ? "Quote request" : "Direct booking",
    },
    {
      label: "Availability",
      value: isUnavailable(service) ? "Currently unavailable" : service.availability_label || service.availabilityLabel || "",
    },
    {
      label: "Deposit",
      value:
        service.deposit_required || service.depositRequired
          ? service.deposit_label || service.depositLabel || "Deposit required"
          : "",
    },
  ].filter((row) => row.value);
}

export default function ServiceDetailsModal({
  open,
  service,
  provider,
  isOwner = false,
  currentUserIsBarber = false,
  onClose,
  onBook,
  onRequestQuote,
  onManageStand,
  returnFocusRef,
}) {
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const scrollPositionRef = useRef({ x: 0, y: 0 });
  const [imageState, setImageState] = useState({ src: "", status: "loading" });
  const imageSrc = useMemo(() => (service ? serviceImage(service) : ""), [service]);
  const rows = useMemo(() => detailRows(service || {}, provider || {}), [provider, service]);
  const imageStatus = imageState.src === imageSrc ? imageState.status : imageSrc ? "loading" : "empty";

  const active = Boolean(open && service);
  const quoteOnly = active ? isQuoteService(service) : false;
  const unavailable = active ? isUnavailable(service) : false;
  const title = active ? serviceTitle(service) : "Service";
  const description = service?.description || service?.details || "";
  const notes = service?.notes || service?.preparation_notes || service?.preparationNotes || "";

  useEffect(() => {
    if (!active) return undefined;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const returnFocusTarget = returnFocusRef?.current || null;
    scrollPositionRef.current = {
      x: window.scrollX || window.pageXOffset || 0,
      y: window.scrollY || window.pageYOffset || 0,
    };

    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "contain";
    document.body.dataset.quelessServiceDetailsOpen = "true";
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const closeModal = () => onClose?.();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
      } else if (event.key === "Tab") {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll(
            'button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          ) || []
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("queless:native-back", closeModal);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      if (document.body?.dataset?.quelessServiceDetailsOpen === "true") {
        delete document.body.dataset.quelessServiceDetailsOpen;
      }
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("queless:native-back", closeModal);
      window.scrollTo(scrollPositionRef.current.x, scrollPositionRef.current.y);
      const target = returnFocusTarget || previousFocusRef.current;
      window.setTimeout(() => target?.focus?.(), 0);
    };
  }, [active, onClose, returnFocusRef]);

  if (!active) return null;

  const handleBackdropPointerDown = (event) => {
    if (event.target === event.currentTarget) onClose?.();
  };

  const handlePrimaryAction = () => {
    if (unavailable || currentUserIsBarber) return;
    onClose?.();
    if (quoteOnly) onRequestQuote?.(service);
    else onBook?.(service);
  };

  return (
    <div
      ref={dialogRef}
      className="ql-service-details"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ql-service-details-title"
      data-testid="service-details-modal"
      onMouseDown={handleBackdropPointerDown}
    >
      <section className="ql-service-details__panel" onMouseDown={(event) => event.stopPropagation()}>
        <button
          ref={closeButtonRef}
          type="button"
          className="ql-service-details__close"
          onClick={onClose}
          aria-label="Close service details"
          data-testid="service-details-close"
        >
          <FiX />
        </button>

        <div className="ql-service-details__media" data-status={imageStatus}>
          {imageSrc && imageStatus !== "error" ? (
            <img
              src={imageSrc}
              alt={`${title} service image`}
              className="ql-service-details__image"
              decoding="async"
              onLoad={() => setImageState({ src: imageSrc, status: "loaded" })}
              onError={() => setImageState({ src: imageSrc, status: "error" })}
              data-testid="service-details-image"
            />
          ) : (
            <div className="ql-service-details__fallback" role="status" data-testid="service-details-image-fallback">
              <FiImage />
              <span>Service image unavailable</span>
            </div>
          )}
        </div>

        <div className="ql-service-details__body">
          <div className="ql-service-details__eyebrow">
            <FiTag />
            <span>{serviceCategory(service) || "Service"}</span>
          </div>
          <h2 id="ql-service-details-title">{title}</h2>
          {provider?.business_name || provider?.name ? (
            <p className="ql-service-details__provider">
              <FiMapPin />
              <span>{provider.business_name || provider.name}{provider.location ? `, ${provider.location}` : ""}</span>
            </p>
          ) : null}

          <div className="ql-service-details__facts">
            {rows.map((row) => (
              <div key={row.label} className="ql-service-details__fact">
                <small>{row.label}</small>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>

          {description ? (
            <div className="ql-service-details__section">
              <h3>Description</h3>
              <p>{description}</p>
            </div>
          ) : null}

          {notes ? (
            <div className="ql-service-details__section">
              <h3>Service notes</h3>
              <p>{notes}</p>
            </div>
          ) : null}

          {unavailable ? (
            <div className="ql-service-details__unavailable" role="status">
              Currently unavailable. Check with the provider for when this service returns.
            </div>
          ) : null}
        </div>

        <div className="ql-service-details__actions">
          {isOwner ? (
            <button type="button" className="ql-service-details__secondary" onClick={onManageStand}>
              <FiEdit2 /> Manage stand
            </button>
          ) : currentUserIsBarber ? (
            <div className="ql-service-details__owner-note" role="status">
              Provider accounts cannot book customer services.
            </div>
          ) : unavailable ? (
            <button type="button" className="ql-service-details__primary" disabled>
              Currently unavailable
            </button>
          ) : (
            <button
              type="button"
              className="ql-service-details__primary"
              onClick={handlePrimaryAction}
              data-testid={quoteOnly ? "service-details-request-quote" : "service-details-book"}
            >
              {quoteOnly ? (
                <>
                  <FiTag /> Request Quote
                </>
              ) : (
                <>
                  <FiCalendar /> Book this service
                </>
              )}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
