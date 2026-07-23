import { useEffect, useMemo, useRef, useState } from "react";
import { FiChevronLeft, FiChevronRight, FiImage, FiX } from "react-icons/fi";
import "./PortfolioLightbox.css";

function normalizeItem(item, index) {
  if (typeof item === "string") {
    return {
      src: item,
      alt: `Portfolio image ${index + 1}`,
      title: `Portfolio image ${index + 1}`,
    };
  }
  return {
    src: item?.src || item?.url || item?.image || "",
    alt: item?.alt || item?.altText || item?.title || `Portfolio image ${index + 1}`,
    title: item?.title || `Portfolio image ${index + 1}`,
  };
}

export default function PortfolioLightbox({
  items = [],
  activeIndex = -1,
  onIndexChange,
  onClose,
  returnFocusRef,
  label = "Portfolio image viewer",
}) {
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const touchStartRef = useRef(null);
  const scrollPositionRef = useRef({ x: 0, y: 0 });
  const [imageState, setImageState] = useState({ src: "", status: "loading" });

  const galleryItems = useMemo(
    () => items.map(normalizeItem).filter((item) => item.src),
    [items]
  );
  const isOpen = activeIndex >= 0 && activeIndex < galleryItems.length;
  const activeItem = isOpen ? galleryItems[activeIndex] : null;
  const canGoPrevious = activeIndex > 0;
  const canGoNext = activeIndex >= 0 && activeIndex < galleryItems.length - 1;
  const imageStatus = imageState.src === activeItem?.src ? imageState.status : "loading";

  useEffect(() => {
    if (!isOpen) return undefined;
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
    document.body.dataset.quelessPortfolioLightboxOpen = "true";

    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const closeViewer = () => {
      onClose?.();
    };
    const goPrevious = () => {
      if (canGoPrevious) onIndexChange?.(activeIndex - 1);
    };
    const goNext = () => {
      if (canGoNext) onIndexChange?.(activeIndex + 1);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "Tab") {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll("button:not(:disabled)") || []
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
    window.addEventListener("queless:native-back", closeViewer);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      if (document.body?.dataset?.quelessPortfolioLightboxOpen === "true") {
        delete document.body.dataset.quelessPortfolioLightboxOpen;
      }
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("queless:native-back", closeViewer);
      window.scrollTo(scrollPositionRef.current.x, scrollPositionRef.current.y);
      const target = returnFocusTarget || previousFocusRef.current;
      window.setTimeout(() => target?.focus?.(), 0);
    };
  }, [activeIndex, canGoNext, canGoPrevious, isOpen, onClose, onIndexChange, returnFocusRef]);

  if (!isOpen || !activeItem) return null;

  const handleTouchStart = (event) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches?.[0];
    touchStartRef.current = null;
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
    if (deltaX > 0 && canGoPrevious) onIndexChange?.(activeIndex - 1);
    if (deltaX < 0 && canGoNext) onIndexChange?.(activeIndex + 1);
  };

  const handleBackdropPointerDown = (event) => {
    if (event.target === event.currentTarget) onClose?.();
  };

  return (
    <div
      ref={dialogRef}
      className="ql-portfolio-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      data-testid="portfolio-lightbox"
      onMouseDown={handleBackdropPointerDown}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <button
        ref={closeButtonRef}
        type="button"
        className="ql-portfolio-lightbox__close ql-portfolio-lightbox__control"
        onClick={onClose}
        aria-label="Close image viewer"
        data-testid="portfolio-lightbox-close"
      >
        <FiX />
      </button>

      <button
        type="button"
        className="ql-portfolio-lightbox__nav ql-portfolio-lightbox__nav--previous ql-portfolio-lightbox__control"
        onClick={() => onIndexChange?.(activeIndex - 1)}
        aria-label="Previous portfolio image"
        disabled={!canGoPrevious}
        data-testid="portfolio-lightbox-previous"
      >
        <FiChevronLeft />
      </button>

      <figure className="ql-portfolio-lightbox__figure" onMouseDown={(event) => event.stopPropagation()}>
        {imageStatus === "loading" ? (
          <div className="ql-portfolio-lightbox__loading">Loading image</div>
        ) : null}
        {imageStatus === "error" ? (
          <div className="ql-portfolio-lightbox__fallback" role="status">
            <FiImage />
            <span>Image unavailable</span>
          </div>
        ) : (
          <img
            src={activeItem.src}
            alt={activeItem.alt}
            className="ql-portfolio-lightbox__image"
            decoding="async"
            onLoad={() => setImageState({ src: activeItem.src, status: "loaded" })}
            onError={() => setImageState({ src: activeItem.src, status: "error" })}
          />
        )}
        {activeItem.title ? (
          <figcaption className="ql-portfolio-lightbox__caption">{activeItem.title}</figcaption>
        ) : null}
      </figure>

      <button
        type="button"
        className="ql-portfolio-lightbox__nav ql-portfolio-lightbox__nav--next ql-portfolio-lightbox__control"
        onClick={() => onIndexChange?.(activeIndex + 1)}
        aria-label="Next portfolio image"
        disabled={!canGoNext}
        data-testid="portfolio-lightbox-next"
      >
        <FiChevronRight />
      </button>

      <div className="ql-portfolio-lightbox__count" data-testid="portfolio-lightbox-count">
        {activeIndex + 1} of {galleryItems.length}
      </div>
    </div>
  );
}
