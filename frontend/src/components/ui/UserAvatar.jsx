import { useState } from "react";

/**
 * Returns a 1-2 letter initials string from the first non-empty value.
 * Priority: fullName → username → email → "U"
 */
export function getAvatarInitials(fullName, username, email) {
  const candidates = [fullName, username, email];
  for (const val of candidates) {
    const text = String(val || "").trim();
    if (!text) continue;
    if (text.includes("@")) return text[0].toUpperCase();
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
    return text.slice(0, 2).toUpperCase();
  }
  return "U";
}

/**
 * Shows the user's profile photo if available; otherwise shows a coloured
 * initials circle. Never shows the Queless logo or a stock photo.
 *
 * Props:
 *   profilePhoto  – URL/data-URI of the uploaded photo (optional)
 *   fullName      – e.g. "Duncan Hamra" → "DH"
 *   username      – e.g. "friend" → "FR"
 *   email         – e.g. "slumescape12@gmail.com" → "S"
 *   size          – pixel diameter (default 40)
 *   className     – extra CSS classes
 */
export default function UserAvatar({
  profilePhoto = "",
  fullName = "",
  username = "",
  email = "",
  size = 40,
  className = "",
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(profilePhoto) && !imgFailed;
  const initials = getAvatarInitials(fullName, username, email);
  const fontSize = Math.max(11, Math.round(size * 0.38));

  return (
    <span
      className={`user-avatar-v1${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, fontSize }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={profilePhoto}
          alt=""
          onError={() => setImgFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
