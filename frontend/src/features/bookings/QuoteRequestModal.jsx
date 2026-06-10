import { useMemo, useState } from "react";
import { FiArrowLeft, FiCalendar, FiDollarSign, FiFileText, FiMapPin, FiSend, FiX } from "react-icons/fi";
import { getAvailableServices, normalizeServiceForBooking } from "../../utils/serviceCatalog.js";

function getProviderServices(provider) {
  const services = getAvailableServices(provider?.services || []);
  return services.length ? services : [normalizeServiceForBooking("General service")];
}

export default function QuoteRequestModal({ show, provider, onClose, onSubmit }) {
  const services = useMemo(() => getProviderServices(provider), [provider]);
  const [serviceId, setServiceId] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [preferredDate, setPreferredDate] = useState("");
  const [location, setLocation] = useState("");

  if (!show || !provider) return null;

  const selectedService = services.find((service) => String(service.id) === String(serviceId)) || services[0];
  const canSubmit = description.trim().length >= 8 && location.trim().length >= 2;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit?.({
      providerId: provider.id,
      serviceId: selectedService?.id,
      serviceName: selectedService?.service_name || selectedService?.title || "Service",
      description,
      budget,
      preferredDate,
      location,
    });
    setDescription("");
    setBudget("");
    setPreferredDate("");
    setLocation("");
    setServiceId("");
  };

  return (
    <>
      <button type="button" className="booking-overlay-v4 open" onClick={onClose} aria-label="Close quote request" />
      <div className="booking-modal-v4 open">
        <div className="booking-modal-card-v4 booking-modal-clean-v5">
          <div className="booking-sheet-handle-v5" />
          <div className="booking-modal-shell-v5">
            <div className="booking-modal-scroll-v5">
              <div className="booking-header-v5">
                <button type="button" className="profile-back-btn-v4" onClick={onClose}>
                  <FiArrowLeft />
                </button>
                <div className="booking-header-copy-v5">
                  <div className="booking-header-title-v5">Request quote</div>
                  <div className="booking-header-subtitle-v5">{provider.business_name}</div>
                </div>
                <button type="button" className="profile-back-btn-v4" onClick={onClose}>
                  <FiX />
                </button>
              </div>

              <div className="booking-section-v5">
                <div className="booking-section-title-v5"><FiFileText /> Service</div>
                <select
                  className="field-input-v4 profile-input-v4"
                  value={serviceId || selectedService?.id || ""}
                  onChange={(event) => setServiceId(event.target.value)}
                >
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.service_name || service.title}
                    </option>
                  ))}
                </select>
              </div>

              <label className="label-v4">
                Describe what you need
                <textarea
                  className="textarea-v4"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe scope, size, timing, preferences, and any important details."
                />
              </label>

              <div className="two-col-v4">
                <label className="label-v4">
                  Budget
                  <span className="input-icon-wrap-v10">
                    <FiDollarSign />
                    <input
                      className="field-input-v4 profile-input-v4"
                      value={budget}
                      onChange={(event) => setBudget(event.target.value)}
                      placeholder="Optional"
                    />
                  </span>
                </label>
                <label className="label-v4">
                  Preferred date
                  <span className="input-icon-wrap-v10">
                    <FiCalendar />
                    <input
                      className="field-input-v4 profile-input-v4"
                      type="date"
                      value={preferredDate}
                      onChange={(event) => setPreferredDate(event.target.value)}
                    />
                  </span>
                </label>
              </div>

              <label className="label-v4">
                Location
                <span className="input-icon-wrap-v10">
                  <FiMapPin />
                  <input
                    className="field-input-v4 profile-input-v4"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Where should the service happen?"
                  />
                </span>
              </label>
            </div>

            <div className="booking-footer-v5">
              <button className="primary-btn-v4 booking-cta-v5" type="button" disabled={!canSubmit} onClick={submit}>
                <FiSend /> Submit quote request
              </button>
              <div className="booking-note-v5">The provider can respond with price, availability, and next steps.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
