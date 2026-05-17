import { useEffect, useRef, useState } from "react";
import { FiArrowLeft, FiCamera, FiImage, FiNavigation, FiUsers, FiX } from "react-icons/fi";

const DEFAULT_CENTER = [0.3136, 32.5811];
const DEFAULT_FORM = {
  businessName: "",
  location: "",
  services: "Classic Cut, Fade / Blend",
  pricing: "20000",
  scheduleStart: "08:00",
  scheduleEnd: "20:00",
  latitude: "0.3136",
  longitude: "32.5811",
  image: "",
  acceptsWallet: false,
  acceptsCash: true,
  standType: "individual",
  teamMembers: "",
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StandImageInput({ image, onChange }) {
  const imageInputRef = useRef(null);

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = await fileToDataUrl(file);
      onChange(result);
    } catch {}
    finally {
      event.target.value = "";
    }
  };

  return (
    <div className="label-v4">
      <span>Stand image</span>
      <div
        className="avatar-v4"
        style={{ width: "100%", height: 160, borderRadius: 20, cursor: "pointer" }}
        onClick={() => imageInputRef.current?.click()}
      >
        {image ? <img src={image} alt="stand" /> : <FiCamera />}
      </div>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImageChange}
      />
      <button type="button" className="secondary-btn-v4" onClick={() => imageInputRef.current?.click()}>
        <FiImage /> {image ? "Change stand image" : "Upload stand image"}
      </button>
    </div>
  );
}

function BarberStandFormModal({ show, title, submitLabel, form, setForm, onClose, onSubmit }) {
  const canSubmit = Boolean(form.acceptsWallet || form.acceptsCash);

  const fillCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setForm((prev) => ({
          ...prev,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
          location: prev.location || "Current location",
        }));
      },
      () => {}
    );
  };

  if (!show) return null;

  return (
    <>
      <div className="booking-overlay-v4 open" onClick={onClose} />
      <div className="booking-modal-v4 open">
        <div className="booking-modal-card-v4">
          <div className="barber-profile-topbar-v4">
            <button type="button" className="profile-back-btn-v4" onClick={onClose}>
              <FiArrowLeft />
            </button>
            <div className="profile-top-title-v4">{title}</div>
            <button type="button" className="profile-back-btn-v4" onClick={onClose}>
              <FiX />
            </button>
          </div>

          <StandImageInput image={form.image} onChange={(image) => setForm((prev) => ({ ...prev, image }))} />

          <div className="two-col-v4">
            <label className="label-v4">
              Business name
              <input className="field-input-v4 profile-input-v4" value={form.businessName} onChange={(e) => setForm((prev) => ({ ...prev, businessName: e.target.value }))} />
            </label>
            <label className="label-v4">
              Price from
              <input className="field-input-v4 profile-input-v4" value={form.pricing} onChange={(e) => setForm((prev) => ({ ...prev, pricing: e.target.value }))} />
            </label>
          </div>

          <div className="payment-config-v5">
            <div className="payment-config-title-v5"><FiUsers /> Stand type</div>
            <label className="payment-config-option-v5">
              <input
                type="radio"
                name="standType"
                checked={form.standType !== "shop"}
                onChange={() => setForm((prev) => ({ ...prev, standType: "individual", teamMembers: "" }))}
              />
              <span>
                <strong>Individual firm</strong>
                <small>This stand is operated by one barber.</small>
              </span>
            </label>
            <label className="payment-config-option-v5">
              <input
                type="radio"
                name="standType"
                checked={form.standType === "shop"}
                onChange={() => setForm((prev) => ({ ...prev, standType: "shop" }))}
              />
              <span>
                <strong>Barber shop</strong>
                <small>Add multiple barbers customers can choose from.</small>
              </span>
            </label>
          </div>

          {form.standType === "shop" ? (
            <label className="label-v4">
              Barbers under this stand
              <textarea
                className="textarea-v4"
                placeholder="Timothy, Alex, Brian"
                value={form.teamMembers}
                onChange={(e) => setForm((prev) => ({ ...prev, teamMembers: e.target.value }))}
              />
              <small className="profile-sub-v4">Separate names with commas. You can edit this list later.</small>
            </label>
          ) : null}

          <label className="label-v4">
            Location
            <input className="field-input-v4 profile-input-v4" value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} />
          </label>
          <button type="button" className="secondary-btn-v4" onClick={fillCurrentLocation}>
            <FiNavigation /> Use my current location
          </button>

          <label className="label-v4">
            Services
            <input className="field-input-v4 profile-input-v4" value={form.services} onChange={(e) => setForm((prev) => ({ ...prev, services: e.target.value }))} />
          </label>

          <div className="two-col-v4">
            <label className="label-v4">
              Start
              <input className="field-input-v4 profile-input-v4" value={form.scheduleStart} onChange={(e) => setForm((prev) => ({ ...prev, scheduleStart: e.target.value }))} />
            </label>
            <label className="label-v4">
              End
              <input className="field-input-v4 profile-input-v4" value={form.scheduleEnd} onChange={(e) => setForm((prev) => ({ ...prev, scheduleEnd: e.target.value }))} />
            </label>
          </div>

          <div className="two-col-v4">
            <label className="label-v4">
              Latitude
              <input className="field-input-v4 profile-input-v4" value={form.latitude} onChange={(e) => setForm((prev) => ({ ...prev, latitude: e.target.value }))} />
            </label>
            <label className="label-v4">
              Longitude
              <input className="field-input-v4 profile-input-v4" value={form.longitude} onChange={(e) => setForm((prev) => ({ ...prev, longitude: e.target.value }))} />
            </label>
          </div>

          <div className="payment-config-v5">
            <div className="payment-config-title-v5">Payment options</div>
            <label className="payment-config-option-v5">
              <input
                type="checkbox"
                checked={Boolean(form.acceptsWallet)}
                onChange={(e) => setForm((prev) => ({ ...prev, acceptsWallet: e.target.checked }))}
              />
              <span>
                <strong>Online Wallet Payments</strong>
                <small>Customers can pay from their in-app balance.</small>
              </span>
            </label>
            <label className="payment-config-option-v5">
              <input
                type="checkbox"
                checked={Boolean(form.acceptsCash)}
                onChange={(e) => setForm((prev) => ({ ...prev, acceptsCash: e.target.checked }))}
              />
              <span>
                <strong>Cash on Appointment</strong>
                <small>Customers book in-app and pay you physically.</small>
              </span>
            </label>
            {!canSubmit ? <div className="auth-error">Choose at least one payment option.</div> : null}
          </div>

          <button className="primary-btn-v4" onClick={() => canSubmit && onSubmit(form)} disabled={!canSubmit}>
            {submitLabel}
          </button>
        </div>
      </div>
    </>
  );
}

export function EditBarberModal({ show, barber, onClose, onSubmit }) {
  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    if (!show || !barber) return;
    setForm({
      businessName: barber.business_name || "",
      location: barber.location || "",
      services: Array.isArray(barber.services)
        ? barber.services.map((service) => (typeof service === "string" ? service : service.service_name)).join(", ")
        : "",
      pricing: String(barber.price_from || ""),
      scheduleStart: barber.availability?.start || "08:00",
      scheduleEnd: barber.availability?.end || "20:00",
      latitude: String(barber.latitude || DEFAULT_CENTER[0]),
      longitude: String(barber.longitude || DEFAULT_CENTER[1]),
      image: barber.image || "",
      acceptsWallet: Number(barber.accepts_wallet ?? barber.acceptsWallet ?? 0) === 1,
      acceptsCash: Number(barber.accepts_cash ?? barber.acceptsCash ?? 1) === 1,
      standType: barber.stand_type || barber.standType || "individual",
      teamMembers: Array.isArray(barber.team_members || barber.teamMembers)
        ? (barber.team_members || barber.teamMembers)
            .map((member) => (typeof member === "string" ? member : member.name))
            .filter(Boolean)
            .join(", ")
        : "",
    });
  }, [show, barber]);

  return (
    <BarberStandFormModal
      show={show && !!barber}
      title="Edit Barber Stand"
      submitLabel="Save stand changes"
      form={form}
      setForm={setForm}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

export function RegisterBarberModal({ show, profile, onClose, onSubmit }) {
  const [form, setForm] = useState(DEFAULT_FORM);

  useEffect(() => {
    if (!show) return;
    setForm((prev) => ({
      ...prev,
      location: prev.location || profile.address || "",
      image: prev.image || profile.profilePhoto || "",
    }));
  }, [show, profile.address, profile.profilePhoto]);

  return (
    <BarberStandFormModal
      show={show}
      title="Register as Barber"
      submitLabel="Activate barber account"
      form={form}
      setForm={setForm}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
