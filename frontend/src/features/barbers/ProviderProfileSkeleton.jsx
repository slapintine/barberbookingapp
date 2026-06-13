/**
 * Full-screen skeleton shown while the provider profile chunk/data loads.
 * Always renders on the normal cream/surface app background so the user never
 * sees a blank dark-purple void during navigation into a provider stand.
 */
export default function ProviderProfileSkeleton() {
  return (
    <div
      className="barber-profile-sheet-v4 pps-no-pad open pps-skeleton-sheet"
      data-testid="provider-profile-skeleton"
      role="status"
      aria-label="Loading provider"
    >
      <div className="barber-profile-card-v4 pps-full-page pps-skeleton-card">
        <div className="pps-skel-hero">
          <span className="pps-skel-shimmer" />
          <div className="pps-skel-avatar">
            <span className="pps-skel-shimmer" />
          </div>
        </div>

        <div className="pps-skel-body">
          <div className="pps-skel-line pps-skel-line--title">
            <span className="pps-skel-shimmer" />
          </div>
          <div className="pps-skel-line pps-skel-line--sub">
            <span className="pps-skel-shimmer" />
          </div>

          <div className="pps-skel-actions">
            <div className="pps-skel-btn"><span className="pps-skel-shimmer" /></div>
            <div className="pps-skel-btn"><span className="pps-skel-shimmer" /></div>
          </div>

          <div className="pps-skel-card">
            {[0, 1, 2].map((i) => (
              <div className="pps-skel-row" key={i}>
                <div className="pps-skel-icon"><span className="pps-skel-shimmer" /></div>
                <div className="pps-skel-row-text">
                  <div className="pps-skel-line pps-skel-line--row"><span className="pps-skel-shimmer" /></div>
                  <div className="pps-skel-line pps-skel-line--row-sub"><span className="pps-skel-shimmer" /></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
