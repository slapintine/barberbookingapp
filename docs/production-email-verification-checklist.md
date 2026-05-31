# Production Email Verification Checklist

Use this checklist after deploying Queless with the verified Resend sender domain.

## Required live backend environment

Set these on the live backend process:

```env
RESEND_API_KEY=your_live_resend_api_key
EMAIL_FROM=Queless <info@queless.org>
FRONTEND_URL=https://queless.org
```

Also keep the existing production URL values aligned:

```env
APP_PUBLIC_URL=https://queless.org
CLIENT_URL=https://queless.org,https://www.queless.org
API_BASE_URL=https://queless.org/api
```

Restart the backend after changing environment variables.

## Test flow

1. Send code
   - Log in with an account that has a saved, unverified email.
   - Open Profile > Email verification.
   - Click `Send verification code`.
   - Confirm the app says the code was sent and shows the 60-second resend cooldown.

2. Receive email from official sender
   - Confirm the email arrives from `Queless <info@queless.org>`.
   - Check inbox and spam folder.
   - Confirm the API response and logs do not expose the code.

3. Wrong code
   - Enter an incorrect 6-digit code.
   - Confirm the app shows `Incorrect code. Please try again.`

4. Too many attempts
   - Enter the wrong code 5 times.
   - Confirm the app shows `Too many attempts. Try again later.`

5. Expired code
   - Send a fresh code and wait more than 10 minutes.
   - Enter the expired code.
   - Confirm the app shows `Code expired. Please request a new one.`

6. Resend code
   - Send a code.
   - Confirm the resend button is disabled for 60 seconds.
   - Resend after the cooldown.
   - Confirm the old code no longer works and the newest code works.

7. Correct verification
   - Enter the newest code.
   - Confirm the app shows `Email verified`.
   - Reload the app and confirm verification persists.

8. Login before verification
   - Log in as an unverified user.
   - Confirm the user is kept on Profile/email verification and cannot continue into the full app until verified.

9. Provider status safety
   - Verify an email for a provider account with an unpaid or pending business.
   - Confirm the business remains Draft/Pending Payment and does not become active.
   - Complete provider payment separately and confirm only payment/subscription success activates the business.
