# PRUDEV II — Portal Login & Access Resolution Email Template

**Usage**: Broadcast via the Admin / Programme Manager Dashboard Communication Center (or directly via email/SMS) to all Business Growth Experts (BGEs) and Reviewers.

---

### Email Subject
`Important Update: Resolution of Portal Login & Password Reset Issues — PRUDEV II Portfolio System`

---

### Email Body
Dear {{name}},

I hope this email finds you well.

We would like to address the recent difficulties several of you experienced when trying to log into the **PRUDEV II Portfolio Management Portal** ([https://bds.glowi.africa](https://bds.glowi.africa)) or when attempting to reset your passwords.

We sincerely apologize for any inconvenience this caused in submitting your visit reports and accessing programme materials.

---

### 1. WHAT WAS CAUSING THE ISSUE?

Our technical team investigated and identified the following factors that affected portal access:

1. **Strict Username & Case-Sensitivity Restrictions:**
   * Previously, the portal required an exact username match. If you attempted to sign in with your email address or your BGE code, or if your phone keyboard auto-capitalized the first letter (e.g., `John.doe` instead of `john.doe`), the system returned an *"Invalid username or password"* error.
   * Mobile copy-pasting of credentials also occasionally introduced hidden spaces that caused logins to fail.

2. **Network / DNS Resolution on Some Local Networks:**
   * Certain local telecom and Wi-Fi networks experienced difficulties resolving the portal's backend server address, causing requests to fail with the message *"Something went wrong. Please try again."* even when internet signal was strong.

3. **Password Reset Link Formatting:**
   * Some password reset email links experienced formatting issues on specific mobile browsers, preventing the reset page from loading properly.

---

### 2. WHAT HAS BEEN FIXED?

The following updates have been deployed to ensure smooth and reliable access:

* **Flexible Sign-In (Multi-Identifier Support):** You can now sign in using **any** of the following:
  * Your registered **Email address**
  * Your **Portal Username**
  * Your **BGE Code** (e.g., `PRUDEV II-BGE-010T-01` or `BGE-010T-01`)
* **Case-Insensitive & Whitespace Trimming:** The login system is now fully forgiving of mobile auto-capitalization and accidental spaces in usernames and passwords.
* **Streamlined Password Reset:** Password reset links and error messages have been updated to work reliably across all mobile and desktop browsers.

---

### 3. HOW TO ACCESS YOUR ACCOUNT NOW

1. **Visit the Portal:** Open **[https://bds.glowi.africa](https://bds.glowi.africa)** (if you have the page currently open, please refresh it).
2. **Sign In:**
   * **Username / Identifier:** Enter your **email address**, **portal username**, or **BGE code**.
   * **Password:** Enter your existing password. If your account was newly provisioned and you have not yet set a personal password, use the default temporary password: **`bds123`** *(you will be prompted to set your own password upon logging in)*.
3. **If You Need to Reset Your Password:**
   * Click **"Forgot password?"** on the login screen.
   * Enter your registered email address and click **"Send Reset Link"**.
   * Open the link received in your email inbox to set your new password.

---

### 4. NEED SUPPORT?
If you encounter any difficulty logging in, accessing your assigned work orders, or submitting visit reports, please reply directly to this email or contact the BDS technical support team so we can assist you promptly.

Thank you for your continued dedication to supporting MSMEs under the PRUDEV II Programme.

Best regards,  
**PRUDEV II BDS Team**  
GOPA Pro · GIZ Uganda  
[https://bds.glowi.africa](https://bds.glowi.africa)

---

### SMS Broadcast Version
> `Dear {{name}}, portal login issues have been resolved. You can now log in at https://bds.glowi.africa using your Email, Username, or BGE Code. If you forgot your password, use the "Forgot password?" link on the login page. Default temp password for new accounts is bds123. — PRUDEV II BDS Team`
