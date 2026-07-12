// Temporary database compatibility for columns created before Queless became a
// service-booking platform. Application behavior must not expose these concepts.
export const LEGACY_PROVIDER_SERVICE_MODE = "service";
export const LEGACY_PROVIDER_STAND_TYPE = "individual";

export function legacyProviderStorageFields() {
  return {
    serviceModeForLegacyColumn: LEGACY_PROVIDER_SERVICE_MODE,
    standType: LEGACY_PROVIDER_STAND_TYPE,
  };
}
